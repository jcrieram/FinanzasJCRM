-- ─────────────────────────────────────────────────────────────────────────────
-- 0009 — Higiene de seguridad (advisors de Supabase, jul 2026)
-- ─────────────────────────────────────────────────────────────────────────────
-- Cierra tres advertencias del linter de seguridad. Ninguna era explotable,
-- pero dejan el escáner limpio y reducen superficie:
--
--   1. rls_auto_enable(): es un event trigger (se dispara al crear tablas para
--      activarles RLS). No es llamable de forma útil por la API REST — fuera de
--      un contexto de event trigger lanza error — pero el rol anon/authenticated
--      tenía EXECUTE. Lo revocamos por higiene.
--
--   2/3. match_documents() y match_corrections() tenían search_path mutable.
--      Lo fijamos a `public` (donde viven las tablas del RAG y el tipo/operadores
--      de pgvector), evitando el riesgo teórico de resolución de nombres.
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated, PUBLIC;

ALTER FUNCTION public.match_documents(vector, integer) SET search_path = public;
ALTER FUNCTION public.match_corrections(vector, uuid, integer) SET search_path = public;
