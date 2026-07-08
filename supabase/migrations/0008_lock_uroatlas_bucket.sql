-- ─────────────────────────────────────────────────────────────────────────────
-- 0008 — Cerrar el bucket uroatlas-sources (corrección de seguridad, jul 2026)
-- ─────────────────────────────────────────────────────────────────────────────
-- La migración 0007 dejó dos policies para el rol `authenticated` que permitían
-- a CUALQUIER usuario logueado de Supabase listar/descargar los 82 PDFs (libros
-- con copyright) y — peor — SUBIR archivos al bucket, que la siguiente ingesta
-- indexaría en el RAG (envenenamiento del corpus clínico).
--
-- El bucket debe ser accesible SOLO por el service_role:
--   · La ingesta (scripts/ingest-uroatlas.js) usa SUPABASE_SERVICE_ROLE_KEY.
--   · La subida de PDFs por el dueño se hace desde el dashboard de Supabase,
--     que opera con privilegios elevados y NO depende de estas policies.
--
-- Esta migración es idempotente: elimina las policies abiertas si existen.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "authenticated upload uroatlas-sources" ON storage.objects;
DROP POLICY IF EXISTS "authenticated list uroatlas-sources" ON storage.objects;

-- Reafirmar que el bucket es privado (por si 0007 se aplicó parcialmente).
UPDATE storage.buckets SET public = false WHERE id = 'uroatlas-sources';
