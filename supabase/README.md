# Supabase — UroWorkNet

Schema, runbook de recuperación y herramientas de diagnóstico para el proyecto
**uroworknet** (`tjomuijpmujcstxcjmsz.supabase.co`).

---

## Estructura

```
supabase/
├── README.md                                  ← este archivo
└── migrations/
    ├── 0001_extensions_and_documents.sql      ← pgvector + tabla documents
    ├── 0002_cases.sql                          ← historial de consultas UroAtlas
    ├── 0003_case_feedback.sql                  ← loop de aprendizaje
    ├── 0004_generated_documents.sql            ← historial de InformesUro
    ├── 0005_match_documents.sql                ← RPC de retrieval RAG
    ├── 0006_match_corrections.sql              ← RPC de correcciones por usuario
    └── 0007_storage_bucket.sql                 ← bucket uroatlas-sources + policies
```

Todas las migraciones son **idempotentes** (usan `IF NOT EXISTS`, `CREATE OR REPLACE`,
`DROP POLICY IF EXISTS`). Se pueden correr en cualquier orden múltiples veces sobre
un proyecto vacío o ya provisionado.

---

## Diagnóstico rápido

```bash
SUPABASE_URL='https://tjomuijpmujcstxcjmsz.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY='<service_role_key>' \
  node scripts/supabase-health.js
```

Verifica conectividad, tablas, RPCs, bucket y cantidad de chunks indexados.

---

## Runbook: "Status Unhealthy" en el dashboard

### Causa más probable: proyecto pausado por inactividad

El **free tier de Supabase pausa los proyectos después de 7 días sin tráfico**.
La UI lo muestra como "Unhealthy" (no como "Paused").

**Fix (1 minuto):**

1. Entrar a https://supabase.com/dashboard/project/tjomuijpmujcstxcjmsz
2. Si dice **"Project paused"** o aparece un banner → click **"Restore project"**.
3. Esperar 1-2 minutos a que vuelva a estar activo.
4. Correr `node scripts/supabase-health.js` para confirmar.

Para evitar que vuelva a pasar: mantener tráfico mínimo (un cron job o un
`curl` semanal a cualquier endpoint del REST API), o upgradear a Pro
($25/mes — incluye backups, no pausa por inactividad).

### Si el proyecto NO se puede restaurar

Cuando el free tier excede el período de gracia, Supabase puede borrar el
proyecto. En ese caso hay que recrearlo desde cero — para eso están las
migraciones de este folder.

1. Crear nuevo proyecto en Supabase (anotar nuevo URL + keys).
2. Actualizar las env vars en Vercel:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. En el SQL Editor del nuevo proyecto, correr **en orden** los 7 archivos
   de `supabase/migrations/`. Cada uno termina rápido.
4. En Authentication → Providers, habilitar **Email + Password**.
5. Crear el usuario del doctor (Authentication → Users → Add user → email
   `jcrieram@gmail.com` + password).
6. Resubir los PDFs a `uroatlas-sources` (4-7 carpetas según
   `UROATLAS_SETUP.md`).
7. Correr la ingesta:
   ```bash
   SUPABASE_URL='<nuevo_url>' \
   SUPABASE_SERVICE_ROLE_KEY='<nueva_service_role>' \
   VOYAGE_API_KEY='<voyage>' \
     node scripts/ingest-uroatlas.js
   ```
8. Validar con `node scripts/supabase-health.js`.

---

## Conectar GitHub al proyecto (opcional, recomendado)

El dashboard muestra "No repository connected". Conectarlo permite ver
diffs de schema en el dashboard y trackear quién cambió qué.

1. Dashboard → **Settings → Integrations → GitHub**.
2. Authorize Supabase para el repo `jcrieram/finanzasjcrm`.
3. Production branch: `main`. Migrations directory: `supabase/migrations`.

A partir de ahí, cualquier nuevo archivo en `supabase/migrations/0008_*.sql`
se aplica automáticamente al hacer merge a `main`.

---

## Variables de entorno requeridas en Vercel

| Variable | Para qué |
|---|---|
| `SUPABASE_URL` | URL pública del proyecto |
| `SUPABASE_ANON_KEY` | Cliente del browser (auth + RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend (bypasses RLS, NO exponer) |
| `VOYAGE_API_KEY` | Embeddings para UroAtlas |
| `ANTHROPIC_API_KEY` | Claude Sonnet 4.6 para UroAtlas + InformesUro |
| `OPENAI_API_KEY` | Whisper + GPT-4o para ConsultaVoz |
| `RESEND_API_KEY` | Email de la nota clínica |
| `CONSULTA_PIN` | (legacy) PIN de ConsultaVoz; se reemplaza por JWT |
