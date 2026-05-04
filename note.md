# note.md — Estado actual de la sesión

Fecha del corte: **4 de mayo de 2026** (tarde).
Rama: `main` (todo desplegado en producción en https://finanzas-jcrm.vercel.app).

---

## 0. PUNTO ACTUAL — donde quedó la conversación (4 may 2026)

### Lo que se acaba de hacer en esta sesión
1. **InformesUro salió de beta** — badge cambiado a "Disponible" en `portal/index.html` (commit `ea2bcf5`).
2. **UroAtlas — feedback loop + mejoras de retrieval** (commit `005dd3a`):
   - `TOP_K` 8 → 15 en `api/uroatlas/query.js`.
   - Traducción ES→EN automática del caso clínico antes del embedding (usa Claude Haiku 4.5; mejora retrieval contra guidelines en inglés).
   - Nuevo endpoint `api/uroatlas/feedback.js` — guarda 👍/👎 + corrección con embedding Voyage.
   - `query.js` inyecta correcciones previas similares (similarity > 0.75) como "CORRECCIONES DEL DOCTOR EN CASOS SIMILARES".
   - UI: sección de feedback aparece tras cada consulta (`uroatlas/index.html`).
3. **Nuevas carpetas de ingest** (commits `006ae46` + `a33e3d9`):
   - `eau-full` — guidelines EAU completas (no pocket).
   - `imagenologia` — radiología urológica.
   - `uro-general` — libros y guías generales nuevas.
   - Las viejas (`eau-pocket`, `aua-non-onc`, `aua-onc`, `libros`) siguen funcionando.

### Lo que el Dr. está haciendo AHORA MISMO
- Subió ~26 PDFs nuevos al bucket `uroatlas-sources` (en `eau-full`, `imagenologia`, `uro-general`).
- Clonó el repo en su iMac (`~/Desktop/FinanzasJCRM` o similar).
- Tiene Node v22 y `npm install` corrido.
- **Está por correr** el ingest con este comando (claves vienen de Supabase API Keys + Voyage dashboard):
  ```bash
  SUPABASE_URL='https://tjomuijpmujcstxcjmsz.supabase.co' \
  SUPABASE_SERVICE_ROLE_KEY='<service_role_key>' \
  VOYAGE_API_KEY='<voyage_api_key>' \
  node scripts/ingest-uroatlas.js
  ```
  Las claves que se usaron en esta sesión van a rotarse por seguridad (paso 1 de "lo que falta").
- Tarda 15-30 min. Es resumible (saltea PDFs ya indexados por `storage_path`).

### Lo que falta hacer apenas el ingest termine
1. **Rotar el service_role key** que el Dr. compartió por chat:
   - Supabase → API Keys → al lado de `service_role_new` → ⋮ → Revoke / Reset.
   - Crear nueva, actualizar `SUPABASE_SERVICE_ROLE_KEY` en Vercel → Environment Variables.
2. **Correr este SQL en Supabase** (SQL Editor) para activar el sistema de feedback:
   ```sql
   CREATE TABLE case_feedback (
       id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       case_id    UUID REFERENCES cases(id) ON DELETE CASCADE,
       user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
       rating     SMALLINT CHECK (rating IN (1, -1)),
       comment    TEXT,
       embedding  VECTOR(1024),
       created_at TIMESTAMPTZ DEFAULT NOW()
   );
   CREATE INDEX ON case_feedback
       USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
   ALTER TABLE case_feedback ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "users manage own feedback"
       ON case_feedback FOR ALL USING (auth.uid() = user_id);

   CREATE OR REPLACE FUNCTION match_corrections(
       query_embedding  VECTOR(1024),
       target_user_id   UUID,
       match_count      INT DEFAULT 3
   )
   RETURNS TABLE (case_id UUID, rating SMALLINT, comment TEXT, similarity FLOAT)
   LANGUAGE SQL STABLE AS $$
       SELECT case_id, rating, comment, 1 - (embedding <=> query_embedding) AS similarity
       FROM case_feedback
       WHERE user_id = target_user_id AND comment IS NOT NULL AND embedding IS NOT NULL
       ORDER BY embedding <=> query_embedding LIMIT match_count;
   $$;
   ```
3. **Verificar** que el bug "no aparece el feedback" está resuelto — fue por cache de browser; hard refresh.
4. **Probar** una consulta oncológica (cáncer de próstata, vejiga, riñón, testículo) para confirmar que el retrieval ya encuentra los chunks de AUA-Onc / EAU.

### Conversación filosófica que tuvimos
Dr. preguntó si el feedback "realmente entrena la IA". Respuesta honesta: **NO entrena Claude** (no hay fine-tuning), pero crea una **memoria personalizada con RAG**: las correcciones se inyectan en el prompt cuando un caso similar reaparece. Sirve para sesgos persistentes, preferencias de estilo y errores recurrentes de retrieval. Lo que más mejora UroAtlas a futuro es: (a) más corpus, (b) mejor retrieval, (c) revisar correcciones acumuladas y pasarlas al system prompt cada cierto tiempo.

---

## 1. ConsultaVoz — estado actual

### 1.1 Pipeline en producción
1. Frontend `/consulta` graba el audio en el navegador (Chrome desktop, iPhone Safari).
2. `POST /api/transcribe` → OpenAI **gpt-4o-transcribe** (cambiado desde `whisper-1` en esta sesión) con glosario urológico inyectado.
3. `POST /api/extract` → **gpt-4o** con temperature **0**, prompt clínico estricto + sanitizer en JS.
4. `POST /api/send-email` → Resend → jcrieram@gmail.com.
5. Audio NO se persiste en servidor.

### 1.2 Clasificación de la consulta — regla actual
El médico clasifica con su voz al inicio:

- Dice **"primera vez"** / "primera consulta" / "primera evaluación" / "paciente nuevo/a" → **FORMATO A**
- Dice **"control"** / "seguimiento" / "paciente conocido" / "antecedente de [estudio previo]" → **FORMATO B**
- No dice ninguna palabra clave → **FORMATO B por defecto**

El sanitizer determinístico verifica si la palabra "primera" aparece en la transcripción. Si no aparece, fuerza Formato B y elimina cualquier sección de antecedentes que el modelo haya generado.

### 1.3 FORMATO A — Primera consulta (estructura)
1. Descripción del caso y motivo: "Se trata de paciente de [edad] años, quien consulta por [motivo en términos técnicos]."
2. Enfermedad actual / interrogatorio (oraciones técnicas, cuantificadas).
3. Antecedentes (solo lo dictado): Antecedentes médicos, Alergias, Antecedentes quirúrgicos, Tabaquismo. Solo aparecen si fueron mencionados.
4. Examen físico (solo si dictado).
5. Exámenes (formato rígido — ver 1.5).
6. Conducta: "Se indica… Se solicita… Se cita a control en…"

### 1.4 FORMATO B — Control / seguimiento (estructura)
1. Apertura + evolución: "Paciente acude a consulta de control [del problema X]. Refiere [evolución técnica]."
2. Examen físico (solo si dictado).
3. Exámenes (formato rígido).
4. Conducta.
5. Anotaciones especiales (solo si dictadas).

**PROHIBIDO en Formato B**: secciones de antecedentes médicos, alergias, quirúrgicos, tabaquismo. El sanitizer en JS las elimina aunque el modelo las genere.

### 1.5 Formato obligatorio de exámenes (sin lenguaje narrativo)
- Laboratorios — una variable por línea: `- Creatinina: 0.9 mg/dL`
- Uroflujometría: `- Uroflujometría: Qmax 11 mL/s, vol. miccional 250 mL`
- Ecografía vesicoprostática: `- Eco: vol. premicc. 300 mL, residuo postmicc. 120 mL (40% del premicc.), próstata 60 gr`
- Resonancia / TAC: `- RM/TAC: [hallazgo dictado exacto]`
- Urocultivo / examen de orina: `- Urocultivo: normal`

**Verbos PROHIBIDOS en exámenes**: "mostró", "se encontró", "reveló", "evidenció", "reportó".
**Verbos permitidos para síntomas**: "Refiere", "Presenta", "Describe".

### 1.6 Sanitizer determinístico (`sanitizeNote` en `api/extract.js`)
Después que GPT responde, el código JS hace:
- Elimina cualquier línea con "no consigna" (en cualquier forma).
- Elimina aperturas tipo "Se trata de paciente de [edad no especificada]".
- En Formato B (cuando NO se dijo "primera"): bloquea apertura de A y elimina todas las secciones de antecedentes, aunque sean "niega".
- En Formato A: solo deja "Antecedentes médicos: niega" si la transcripción menciona alguna palabra de ese tema (regex con diabetes, hipertensión, asma, etc.).
- Limpia fragmentos sueltos tipo ", pero no consigna" en oraciones válidas.
- Reemplaza apertura faltante por "Paciente acude a consulta de control."

### 1.7 Glosario de Whisper (en `api/transcribe.js`)
Texto largo inyectado en cada request al transcriptor con:
- Siglas deletreadas: PSA (P-S-A), PI-RADS, HPB, RTU, ITU, BUN, LDL, HDL, TSH, AST, ALT, IPSS.
- Aviso explícito: "el estudio se llama uroflujometría, NO euroflujometría / euroflujo".
- Frases típicas: "PSA total de", "PSA libre de", "índice PSA libre/total", "Gleason 6", "PI-RADS 2", "volumen premiccional de", "residuo postmiccional de", "próstata de X gramos", "cistoscopía".
- Términos: laboratorios, imágenes, diagnósticos, síntomas, medicamentos urológicos comunes.

### 1.8 Recording fixes (frontend `consulta/app.js`)
- `mediaRecorder.start(1000)` — timeslice de 1s para producir contenedores estables en iOS Safari.
- `pickedMime` capturado al inicio (no se confía en `mediaRecorder.mimeType` después del stop).
- Fallback de extensión: `.m4a` por defecto (antes era `.audio` que Whisper rechazaba).
- Guardia para blob vacío.
- Mensaje de error muestra mime + ext + tamaño para debug.
- Service worker bumped: `consulta-v6`.

### 1.9 Lo que NO se logró del todo (pendientes)
- Calidad de transcripción depende del audio. Con micrófono interno de laptop + ruido ambiente, Whisper alucina (vimos casos: "PSA" → "vibratus", "uroflujometría" → "euroflujo", "PSA libre" → "ID", "porcentaje" → "apostate").
- Recomendación: headset con micrófono cerca de la boca, ambiente silencioso, decir siglas como palabras ("el psa" en vez de "P-S-A").
- Si después del headset siguen errores, la siguiente palanca es **fine-tuning de gpt-4o-mini** con 30-50 pares (transcripción real → nota corregida).

---

## 2. UroAtlas — estado actual

### 2.1 Documentos del repo
- `UROATLAS_DESIGN.md` — diseño técnico completo (stack, pipelines, UI, costos, roadmap de 5 fases).
- `UROATLAS_SETUP.md` — guía paso a paso para que el Dr. cree Supabase + bucket + suba PDFs.
- `NOTAS.md` — memoria viva del proyecto general (anterior a esta sesión).

### 2.2 Stack decidido
| Capa | Tecnología |
|---|---|
| Frontend | HTML/JS vanilla (consistente con `/consulta` y `/portal`) |
| Backend | Vercel serverless |
| Auth + DB + Storage | **Supabase** (con `pgvector`) |
| Modelo de razonamiento | **Claude Sonnet 4.6** |
| Embeddings | **Voyage AI `voyage-3`** (1024 dims) |
| Procesamiento PDFs | `pdf-parse` o `pdfjs-dist` |
| Login | Email + contraseña (Supabase Auth) |

Costo estimado mensual: **~$30-75/mes** (Supabase free al inicio, $25 cuando escale; Claude API ~$30/mes; Voyage ~$1/mes).

### 2.3 Inventario de PDFs — CERRADO (28 abr 2026)
| Carpeta | Cantidad final |
|---|---|
| EAU Pocket | 20 |
| AUA Non-Onc | 38 |
| AUA Onc | 17 |
| Libros uro | 7 |
| **Total** | **82** |

Estructura de carpetas locales:
```
~/UroAtlas-Sources/
├── eau-pocket/      (20)
├── aua-non-onc/     (38)
├── aua-onc/         (17)
└── libros/          (7)
```

### 2.4 Estado de Supabase (al corte de esta sesión)
- ✅ Cuenta creada en supabase.com
- ✅ Proyecto creado: **uroworknet**
- ✅ Project ID: `tjomuijpmujcstxcjmsz`
- ✅ Project URL: `https://tjomuijpmujcstxcjmsz.supabase.co`
- ✅ anon key + service_role key configuradas en Vercel como env vars
- ✅ Bucket `uroatlas-sources` creado (privado, 50 MB límite).
- ✅ Tablas `documents` y `cases` creadas con RLS y función `match_documents`.
- ✅ pgvector habilitado.
- ✅ Auth con email + password habilitado, usuario `jcrieram@gmail.com` creado (UID `afe5fdd5-09f4-4c37-8c5a-4826271760fb`).
- ⏳ **Pendiente**: subir los 82 PDFs en sus 4 carpetas (no bloqueante; se puede hacer en cualquier momento antes de Fase 2).

### 2.5 Roadmap de implementación
**Fase 1 — Auth y scaffold** (siguiente paso, una vez tenga las credenciales):
- Configurar Supabase Auth (email + password).
- Crear tablas `documents` y `cases`.
- Migrar ConsultaVoz del PIN a Supabase Auth.
- Shell de UroAtlas en `/uroatlas` con UI estilo médico profesional (sin frosted glass; estética tipo Epic/Cerner moderno; fondo claro, tipografía Inter, azul marino).

**Fase 2 — Ingesta de PDFs**:
- Script `scripts/ingest-uroatlas.js`.
- Lee bucket, clasifica por carpeta, extrae texto, chunking, embeddings con Voyage, inserta en `documents`.
- Verificación con queries de prueba.

**Fase 3 — Endpoint de consulta**:
- `/api/uroatlas/query`.
- Pipeline: caso clínico → embedding → top-k=8 chunks → Claude Sonnet con contexto + caso.
- Respuesta con citas: `[Source: AUA BPH Unabridged 2024, p.45]`.

**Fase 4 — Imágenes y persistencia**:
- Upload de uroTAC / RM a Supabase Storage.
- Claude Sonnet con visión.
- Tabla `cases` y vista de historial.

**Fase 5 — Refinamiento continuo**:
- Prompt engineering del sistema clínico.
- Evaluación con casos reales.
- Ajuste de top_k, tamaño de chunks.

---

## 3. Ecosistema UroWorkNet (visión general)

Tres apps que comparten login único:
1. **`/consulta` — ConsultaVoz** (✅ en producción, en iteración).
2. **`/portal` — landing** (✅ en producción, hero + widget de noticias urológicas).
3. **`/uroatlas` — segunda opinión basada en guidelines** (🚧 Fase 1 pendiente).

**Informes Urológicos** existe como app Streamlit externa (no se pudo clonar el repo). Pendiente decidir si se embebe, enlaza o migra al dominio.

---

## 4. Variables de entorno actuales en Vercel
- `OPENAI_API_KEY` — para transcripción y extracción.
- `RESEND_API_KEY` — para envío de correo.
- `CONSULTA_PIN` — PIN actual de ConsultaVoz (a reemplazar por Supabase Auth en Fase 1).

A agregar en Fase 1:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VOYAGE_API_KEY`
- `ANTHROPIC_API_KEY`

---

## 5. Comandos rápidos para retomar la sesión

```bash
# Ver el último commit
git log -1 --oneline

# Ver cambios recientes en extract.js
git log --oneline -10 api/extract.js

# Estado actual del repo
git status

# Probar localmente (no necesario, todo está en Vercel)
# Vercel auto-despliega cada push a main o a la rama de PR
```

---

## 6. Siguiente acción concreta cuando se retome

1. El Dr. sube los 82 PDFs al bucket `uroatlas-sources` (4 carpetas, según `UROATLAS_SETUP.md`).
2. El Dr. crea cuentas y me pasa **API key de Voyage AI** (embeddings) y **API key de Anthropic** (Claude Sonnet 4.6).
3. Las agrego como `VOYAGE_API_KEY` y `ANTHROPIC_API_KEY` en Vercel.
4. Arranco **Fase 2**: escribir `scripts/ingest-uroatlas.js` que lee el bucket, extrae texto de los PDFs, hace chunks, genera embeddings con Voyage, e inserta en la tabla `documents`. Una sola corrida.
5. Verifico con queries de prueba que el retrieval funciona.
6. Arranco **Fase 3**: implementar el endpoint real `/api/uroatlas/query` con el pipeline RAG (embedding del caso → top-k=8 chunks → Claude Sonnet con contexto + caso → respuesta con citas).
7. **Fase 4**: subida de imágenes (UroTAC/RM) + Claude con visión + persistencia de casos en la tabla `cases` + historial en sidebar.

---

> Mantener este archivo corto y vivo. Borrar o consolidar lo que ya no aplique.
> Si la sesión se rompe, leer este archivo + `NOTAS.md` + `UROATLAS_DESIGN.md` + `UROATLAS_SETUP.md` para retomar.
