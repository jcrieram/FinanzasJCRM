# NOTAS — Estado del proyecto y pendientes

Resumen vivo de las decisiones, ideas y tareas pendientes conversadas
en sesiones anteriores. Sirve como memoria entre sesiones de Claude Code
(no hay memoria automática entre sesiones — sólo lo que quede escrito
aquí, en CLAUDE.md o en git).

---

## 1. Lo que YA está implementado y desplegado

### Apps en producción (Vercel)
- **`/consulta` — ConsultaVoz** (PWA)
  - Graba la entrevista médico-paciente en el navegador (iPhone Safari,
    Chrome desktop). Botones grabar / pausar / reanudar / finalizar con
    timer.
  - Flujo: audio → `/api/transcribe` (Whisper / `gpt-4o-mini-transcribe`)
    → `/api/extract` (GPT-4o-mini que filtra y estructura la nota
    clínica) → `/api/send-email` (Resend → jcrieram@gmail.com).
  - El audio NO se persiste en servidor.
  - Diseño: estilo iOS, fondo `consulta/bg.PNG`, nombre del Dr. Juan
    Carlos Riera M. arriba en azul navy.
  - Protegida por PIN (`CONSULTA_PIN` env var, verificado vía
    `/api/verify-pin`).

- **`/portal` — UroWorkNet** (landing del ecosistema)
  - Hero con wordmark "UroWorkNet" + ícono SVG de riñón (se descartó el
    `Logo.PNG` por decisión del usuario).
  - Widget "Aprende algo en un minuto" → `/api/news` que devuelve
    resumen de 2-3 líneas de noticia urológica reciente
    (`gpt-4o-mini-search-preview`, cache CDN 1h).

### API serverless (`/api/*.js`)
- `transcribe.js` — Whisper-style transcripción. PIN required.
- `extract.js` — Prompt clínico robusto. Detecta primera consulta vs
  control. Captura obligatoria de laboratorios e imágenes en sección
  "Exámenes:" (uno por línea con guion). Calcula automáticamente el %
  de residuo postmiccional cuando se dictan ambos volúmenes
  (premiccional y postmiccional). Traduce lenguaje coloquial a términos
  médicos (disuria, nicturia, etc.).
- `send-email.js` — Resend. Destinatario en minúsculas (bug fix:
  Resend compara case-sensitive contra el correo verificado).
- `verify-pin.js` — Valida PIN contra env `CONSULTA_PIN`.
- `news.js` — Noticia urológica con búsqueda web.

### Configuración relevante
- Rama de desarrollo: `claude/patient-interview-app-9xB9X`. Todos los
  PRs (1–14+) ya mergeados a `main`.
- Service worker `consulta/sw.js` en estrategia network-first para
  evitar que cache viejo bloquee actualizaciones (cache `consulta-v5`).
- Vars de entorno en Vercel: `OPENAI_API_KEY`, `RESEND_API_KEY`,
  `CONSULTA_PIN`.
- `vercel.json` configura `maxDuration` por endpoint.

---

## 2. Ideas y decisiones tomadas pero NO implementadas

### UroAtlas — la 3ª app del ecosistema (PENDIENTE)
Concepto: app referencial / "second opinion" cargada con guidelines y
libros de urología. El médico le pasa un caso (texto + imágenes
opcionales) y obtiene opinión basada en las fuentes.

Decisiones acordadas:
1. **Fuentes**: PDFs nativos del usuario (guidelines AUA y EAU + libros
   de urología "biblia" + imagenología). En Google Drive del usuario.
2. **Modelo**: a decidir — Claude Sonnet vs GPT-4. (Tarea de Claude
   recomendar.)
3. **UI deseada**: 1 caja para caso clínico + 1 área para adjuntar
   imágenes + ventana emergente con la opinión.
4. **Capacidad de análisis de imágenes**: uroTAC y resonancia magnética.
5. **Persistencia**: las consultas/casos previos se guardan y se pueden
   revisar luego.
6. **Idioma**: ambos (es/en).

#### Inventario de fuentes — CERRADO (28 abr 2026)
| Carpeta | Antes | Después | Eliminados |
|---|---|---|---|
| EAU Pocket | 40 | 20 | 20 (hechos en sesión previa) |
| AUA Non-Onc | 45 | 38 | 7 |
| AUA Onc | 22 | 17 | 5 |
| Libros uro | 8 | 7 | 1 (duplicado Ambulatory Urology) |
| **Total** | **115** | **82** | **33** |

Archivos borrados de AUA Non-Onc: Testosterone-Deficiency-JU,
URETHRAL STRICTURE Amendment Summary, GUI-23-8333 SUI Ammendment,
Microhematuria Amendment SUMMARY-Final, Kidney-Stones-Medica-
Management-Guideline, ICBPS Guideline, ED-JU.

Archivos borrados de AUA Onc: Renal-Mass-JU-Pt1, Renal-Mass-JU-Pt2,
GUI-24-0075 MIBC Algorithm, EDPC Guideline 2026 Amendment Summary,
APC Amendment Summary 041423.

Pendiente técnico (sin empezar):
- Estrategia de ingesta: probablemente RAG con vector store (chunking
  por páginas + embeddings) — falta decidir herramienta (Claude Files
  API, Pinecone, pgvector, etc.).
- Manejo de imágenes médicas (uroTAC/RM): pipeline distinto al texto.
- Persistencia de casos consultados (DB ligera, p.ej. SQLite/Postgres).

### Integración del ecosistema "UroWorkNet"
- Login **único** que cubra las 3 apps (ConsultaVoz, Informes
  Urológicos, UroAtlas).
- **Informes Urológicos** ya existe como app Streamlit en
  `https://jcrieram-informes---uro-app-ofmtfr.streamlit.app/` —
  funcionando bien. Repo no es público (no se pudo clonar). Hay que
  decidir si se embebe, se enlaza o se migra para que viva en el mismo
  dominio del portal.
- El portal actual ya tiene tarjetas, falta cablear los CTAs reales a
  las apps cuando UroAtlas exista y cuando se decida cómo enlazar
  Informes Urológicos.

### Multi-tenant / venta a colegas (futuro lejano)
- Si se vende a otro urólogo: cambiar email destinatario, dominio,
  billing por usuario, y aislar PIN por médico.
- Dominio propio: el usuario ya tiene Hostinger para su página de
  urólogo — habría que apuntarlo o usar subdominio para el ecosistema.

### Reglas de negocio del prompt de extracción (ya en código pero
para recordar al iterar)
- Primera consulta → Formato A (paciente de X años, antecedentes,
  alergias, quirúrgicos, tabaquismo, examen físico, exámenes, plan).
- Control/seguimiento → Formato B (resumen de evolución y adherencia
  + ajuste terapéutico).
- Saltos de línea entre secciones, exámenes uno por línea con guion.
- Cálculo automático: `(postmiccional / premiccional) × 100`.
- No inventar datos; si falta, "niega" / "no refiere" (en formato A).

---

## 3. Preguntas frecuentes del usuario (respondidas, vale la pena dejar
sentadas)

- **¿Memoria entre sesiones de Claude Code?** No automática. Sólo a
  través de: git (commits/branches), archivos en el repo, y
  `CLAUDE.md` / este `NOTAS.md`. Cada sesión arranca limpia salvo lo
  que esté en disco.
- **¿Conectarse al Claude Code de la Mac desde otro dispositivo?** No
  hay puente directo. Opciones: (a) Claude Code en la web
  `claude.ai/code` sobre el mismo repo de GitHub, (b) SSH a la Mac.
- **¿Usar ConsultaVoz desde Chrome de PC?** Sí, funciona igual (sólo
  hay que aceptar el permiso del micrófono cada vez en navegador no
  instalado como PWA).
- **¿Permiso de micrófono recurrente?** En iPhone se mitiga
  instalando la PWA en pantalla de inicio (queda persistente).

---

## 4. Próximas acciones propuestas (cuando se retome)

1. ~~Cerrar el filtrado de PDFs (Non-Onc, Onc, Libros).~~ **Hecho 28 abr.**
2. Decidir arquitectura de UroAtlas (RAG + modelo + storage).
3. Definir mecanismo de login único del portal.
4. Decidir si Informes Urológicos se migra a Vercel o se enlaza desde
   el portal.

---

> Mantener este archivo corto y vivo: agregar nuevas decisiones, marcar
> lo que se va implementando, borrar lo que ya no aplique.
