# note.md — Estado actual de la sesión

Fecha del corte: 2 de mayo de 2026.
Rama de desarrollo: `claude/patient-interview-app-9xB9X`.
Último commit relevante: `509ec1b` — fix(consulta): exam format, uroflujometria, allowed verbs.

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
- ⏳ **Pendiente**: que el Dr. me pase **anon public key** y **service_role key** (desde el botón "Connect" o sidebar API Keys).
- ⏳ **Pendiente**: crear bucket `uroatlas-sources` (privado, 50 MB límite).
- ⏳ **Pendiente**: subir los 82 PDFs en sus 4 carpetas.

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

1. El Dr. me pasa las dos claves de Supabase (anon + service_role).
2. Creo el bucket `uroatlas-sources` (o lo crea el Dr. siguiendo `UROATLAS_SETUP.md`).
3. Configuro las variables de entorno en Vercel.
4. Arranco con Fase 1: Supabase Auth + tablas `documents` y `cases` + shell UI de UroAtlas.

---

> Mantener este archivo corto y vivo. Borrar o consolidar lo que ya no aplique.
> Si la sesión se rompe, leer este archivo + `NOTAS.md` + `UROATLAS_DESIGN.md` + `UROATLAS_SETUP.md` para retomar.
