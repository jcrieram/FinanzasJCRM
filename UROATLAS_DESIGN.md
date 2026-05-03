# UroAtlas — Documento de diseño

App referencial / "second opinion" del ecosistema UroWorkNet. El médico
le pasa un caso clínico (texto + imágenes opcionales de uroTAC o RM) y
recibe una opinión basada en los guidelines y libros cargados, con citas
a la fuente.

> Estado: diseño aprobado, pendiente de implementación.
> Fuentes finales: 82 PDFs (20 EAU Pocket + 38 AUA Non-Onc + 17 AUA Onc + 7 libros).

---

## 1. Stack técnico recomendado

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend | HTML/JS vanilla | Consistencia con `/consulta` y `/portal`. Sin build step. |
| Backend | Vercel serverless functions | Igual que el resto del repo. |
| Base de datos + Auth + Storage | **Supabase** | Una sola plataforma resuelve auth, DB con `pgvector`, y storage de PDFs e imágenes. Free tier alcanza para arrancar. |
| Modelo de razonamiento | **Claude Sonnet 4.6** | Mejor que GPT-4 en tareas médicas largas con citas; soporta visión nativa para uroTAC/RM; un solo proveedor para texto + imagen. |
| Embeddings | **Voyage AI `voyage-3`** | Mejor calidad de retrieval que OpenAI, especialmente en español/inglés mezclados. Más barato. |
| Procesamiento de PDFs | `pdf-parse` (Node) o `pdfjs-dist` | Funciona en serverless de Vercel. |

### Por qué Claude Sonnet y no GPT-4
- Mejor adherencia a instrucciones largas y complejas (importante para el prompt clínico estricto).
- Menor tendencia a inventar datos cuando el contexto recuperado no
  contiene la respuesta — crítico en uso médico.
- Soporta visión nativa con la misma API; un solo proveedor para texto
  e imágenes.
- Costo similar en producción ligera (~$30/mes con 20 consultas/día).

### Por qué Supabase y no Pinecone + Auth0 + S3
- Una sola integración en lugar de tres.
- `pgvector` es suficiente para 82 PDFs (escala perfecto hasta cientos
  de miles de chunks).
- Auth de Supabase resuelve el "login único" del ecosistema completo
  (portal + ConsultaVoz + UroAtlas) sin trabajo extra.
- Free tier: 500 MB DB, 1 GB storage, 50K usuarios activos/mes.
  Cuando se quede corto: $25/mes.

---

## 2. Pipeline de ingesta de PDFs (una vez)

Script ejecutado localmente o como Vercel cron, no parte de la app:

1. **Descarga**: PDFs desde Google Drive a una carpeta local o
   directamente a Supabase Storage.
2. **Extracción de texto** por página con `pdf-parse`.
3. **Chunking inteligente** por sección (usando los headers del
   guideline) o, si no detecta estructura, por párrafos de ~500
   tokens con overlap de 50.
4. **Embeddings** por chunk vía Voyage AI (batch de 128 chunks por
   request).
5. **Inserción** en Supabase tabla `documents`:
   ```
   id (uuid)
   source (text)              -- "AUA-Onc", "EAU-Pocket", "Libros", "AUA-Non-Onc"
   guideline_name (text)      -- "BPH Unabridged 2024", etc.
   page (int)
   section (text)             -- "Diagnosis", "Treatment", etc.
   content (text)             -- el chunk en sí
   embedding (vector(1024))   -- voyage-3 produce 1024 dims
   language (text)            -- "es" | "en"
   metadata (jsonb)           -- año, especialidad, etc.
   ```
6. **Verificación**: query de prueba para confirmar que se recuperan
   chunks coherentes.

Costo único de ingesta: ~$1 en Voyage (los 82 PDFs son ~5M tokens).

---

## 3. Pipeline de consulta (cada vez que el médico pregunta)

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. Médico envía: texto clínico + (opcional) imagen uroTAC/RM     │
└──────────────────────────────────────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ 2. /api/uroatlas/query                                           │
│    a. Si hay imagen: Claude Sonnet la describe (1 llamada corta) │
│    b. Texto + descripción de imagen → embedding                  │
│    c. Top-k=8 chunks recuperados de Supabase pgvector            │
└──────────────────────────────────────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ 3. Llamada principal a Claude Sonnet con:                        │
│    - System prompt clínico (rol urológico, no inventar, citar)   │
│    - 8 chunks como contexto                                      │
│    - Caso del médico                                             │
│    - Imagen original (si la hay)                                 │
└──────────────────────────────────────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ 4. Respuesta estructurada:                                       │
│    - Opinión clínica                                             │
│    - Citas: [Source: AUA BPH Unabridged 2024, p.45]              │
│    - Recomendaciones de estudios o tratamiento                   │
│    - Banderas rojas si las hay                                   │
└──────────────────────────────────────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ 5. Persistir en tabla `cases` + mostrar al médico                │
└──────────────────────────────────────────────────────────────────┘
```

Latencia esperada: 5-12 segundos por consulta (la mayoría en la
llamada a Claude).

---

## 4. UI propuesta

```
┌───────────────────────────────────────────────────────────┐
│  UroAtlas             Dr. Juan Carlos Riera M.   [Salir]  │
├──────────┬────────────────────────────────────────────────┤
│ HISTORIAL │  ┌──────────────────────────────────────────┐ │
│           │  │ Caso clínico                              │ │
│ Hoy       │  │ ┌────────────────────────────────────┐   │ │
│ • Caso 3  │  │ │ Paciente de 65 años con PSA 8.2…  │   │ │
│ • Caso 2  │  │ │                                    │   │ │
│ • Caso 1  │  │ └────────────────────────────────────┘   │ │
│           │  │                                           │ │
│ Ayer      │  │ Imágenes (opcional)                       │ │
│ • Caso A  │  │ [arrastra uroTAC o RM aquí]              │ │
│ • Caso B  │  │                                           │ │
│           │  │            [ Consultar ]                  │ │
│ + Nuevo   │  └──────────────────────────────────────────┘ │
│           │                                                │
│           │  ┌──────────────────────────────────────────┐ │
│           │  │ Opinión de UroAtlas                       │ │
│           │  │                                           │ │
│           │  │ Según AUA Localized Prostate Cancer       │ │
│           │  │ Guideline 2024 (p.12), un PSA de 8.2 con… │ │
│           │  │                                           │ │
│           │  │ Recomendaciones:                          │ │
│           │  │ - …                                       │ │
│           │  │                                           │ │
│           │  │ Fuentes citadas:                          │ │
│           │  │ [1] AUA LoPC Unabridged FINAL, p.12       │ │
│           │  │ [2] EAU Pocket Prostate, p.34             │ │
│           │  └──────────────────────────────────────────┘ │
└──────────┴────────────────────────────────────────────────┘
```

---

## 5. Login único del ecosistema

Reemplazar el PIN actual de ConsultaVoz por Supabase Auth. Una sola
sesión cubre los 3 productos:

- `/portal` — landing pública, "Iniciar sesión" arriba a la derecha.
- `/consulta` — requiere sesión; el endpoint `/api/extract` valida el
  JWT de Supabase en lugar del PIN.
- `/uroatlas` — requiere sesión; cada caso queda asociado al
  `user_id`.

Método de login propuesto: **magic link por email** (más simple que
password, sin que el usuario tenga que recordar nada).

Beneficio adicional: queda lista la base multi-tenant para cuando
quieras vender a un colega — solo creas otro usuario y la app ya
distingue casos por `user_id`.

---

## 6. Persistencia de casos

Tabla `cases` en Supabase:
```
id (uuid)
user_id (uuid, FK a auth.users)
clinical_text (text)
image_urls (text[])         -- URLs en Supabase Storage
response (text)
retrieved_chunks (jsonb)    -- los chunks que se usaron, para auditoría
created_at (timestamptz)
```

El médico puede:
- Ver el historial completo en el sidebar.
- Buscar por palabra clave en sus casos pasados.
- Reabrir un caso y agregar comentarios.

---

## 7. Costos estimados (operación normal)

| Item | Costo |
|---|---|
| Supabase | $0 (free tier) → $25/mes cuando escale |
| Claude Sonnet API (~20 consultas/día, ~10K in + 1K out) | ~$30/mes |
| Voyage embeddings (queries) | ~$1/mes |
| Vercel | $0 (hobby tier) → $20/mes (Pro) si necesitas más |
| Ingesta inicial de PDFs | ~$1 una sola vez |
| **Total mensual** | **~$30-75/mes** |

---

## 8. Roadmap de implementación

### Fase 1 — Auth y scaffold (1-2 sesiones)
- Crear proyecto Supabase, configurar Auth (magic link).
- Migrar ConsultaVoz del PIN a Supabase Auth.
- Crear `/uroatlas/index.html` con el shell de la UI (sin lógica).
- Botón de login en `/portal`.

### Fase 2 — Ingesta de PDFs (1 sesión)
- Script `scripts/ingest-uroatlas.js` que procesa los 82 PDFs.
- Subida a Supabase Storage + chunks en tabla `documents`.
- Verificar con queries de prueba.

### Fase 3 — Endpoint de consulta (1-2 sesiones)
- `/api/uroatlas/query` con el pipeline de retrieval + Claude.
- Conectar la UI al endpoint.
- Mostrar respuesta con citas formateadas.

### Fase 4 — Imágenes y persistencia (1 sesión)
- Upload de imágenes a Supabase Storage.
- Llamada a Claude Sonnet con visión.
- Tabla `cases` y vista de historial.

### Fase 5 — Refinamiento (continuo)
- Prompt engineering del sistema clínico (similar al trabajo que ya
  hicimos en `api/extract.js` para ConsultaVoz).
- Evaluación con casos reales del Dr.
- Ajustar `top_k`, tamaño de chunks, etc.

---

## 9. Decisiones tomadas (28 abr 2026)

1. **Plataforma base**: Supabase. Confirmado.
2. **Método de login**: email + contraseña tradicional (no magic link).
3. **Estilo de UI**: médico profesional serio. Sin frosted glass ni
   gradientes iOS. Pensar más en una consola clínica: fondo blanco
   o gris muy claro, tipografía legible (Inter o similar), color
   primario azul marino, densidad alta de información, tablas y
   tarjetas con bordes definidos. Estética tipo Epic/Cerner pero
   más moderna.
4. **Carga de PDFs**: el Dr. los sube manualmente a Supabase
   Storage. Ver instrucciones detalladas en `UROATLAS_SETUP.md`.

---

## 10. Resumen ejecutivo

UroAtlas será una app de "second opinion" en el ecosistema UroWorkNet,
construida sobre **Supabase** (auth + DB + storage), **Claude Sonnet
4.6** (razonamiento + visión) y **Voyage AI** (embeddings). Los 82
PDFs se ingieren una vez como vectores en `pgvector`. Cada consulta
del médico hace retrieval de los 8 chunks más relevantes y pasa todo
a Claude para que arme una opinión con citas. El mismo Supabase Auth
se usa para login único en las tres apps del ecosistema.

Esfuerzo total estimado: **5-7 sesiones de trabajo**.
Costo operativo: **~$30-75/mes**.
