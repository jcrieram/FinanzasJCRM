-- ─────────────────────────────────────────────────────────────────────────────
-- 0007 — Bucket de storage uroatlas-sources (PDFs de guidelines y libros)
-- ─────────────────────────────────────────────────────────────────────────────
-- Bucket privado donde el doctor sube los PDFs organizados en carpetas:
--   eau-pocket/, eau-full/, aua-non-onc/, aua-onc/, libros/, imagenologia/, uro-general/
-- Solo el service_role puede leer/escribir; los usuarios autenticados no
-- bajan PDFs directamente (los chunks indexados ya contienen el contenido).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'uroatlas-sources',
    'uroatlas-sources',
    false,
    52428800,                              -- 50 MB
    ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE
SET file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types,
    public = false;

DROP POLICY IF EXISTS "service read uroatlas-sources" ON storage.objects;
CREATE POLICY "service read uroatlas-sources"
    ON storage.objects FOR SELECT
    TO service_role
    USING (bucket_id = 'uroatlas-sources');

DROP POLICY IF EXISTS "service write uroatlas-sources" ON storage.objects;
CREATE POLICY "service write uroatlas-sources"
    ON storage.objects FOR ALL
    TO service_role
    USING (bucket_id = 'uroatlas-sources')
    WITH CHECK (bucket_id = 'uroatlas-sources');

-- El owner del proyecto (dashboard) puede subir PDFs vía la UI de Storage
-- usando authenticated. Lo dejamos explícito.
DROP POLICY IF EXISTS "authenticated upload uroatlas-sources" ON storage.objects;
CREATE POLICY "authenticated upload uroatlas-sources"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'uroatlas-sources');

DROP POLICY IF EXISTS "authenticated list uroatlas-sources" ON storage.objects;
CREATE POLICY "authenticated list uroatlas-sources"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'uroatlas-sources');
