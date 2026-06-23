-- ─────────────────────────────────────────────────────────────────────────────
-- 0001 — Extensions + tabla documents (corpus RAG de UroAtlas)
-- ─────────────────────────────────────────────────────────────────────────────
-- Idempotente: se puede correr en un proyecto vacío o sobre el existente sin
-- romper nada. Reconstruye el schema base que necesita UroAtlas.
--
-- Tabla documents = chunks de los 82+ PDFs (AUA, EAU, libros, imagenología),
-- cada uno con su embedding voyage-3 (1024 dims) para retrieval con pgvector.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source          TEXT NOT NULL,                  -- AUA-Onc, EAU, Libros, etc.
    guideline_name  TEXT,                           -- nombre del PDF
    page            INT,
    section         TEXT,
    content         TEXT NOT NULL,
    embedding       VECTOR(1024) NOT NULL,
    language        TEXT DEFAULT 'en',
    metadata        JSONB DEFAULT '{}'::jsonb,      -- incluye storage_path, chunk_index
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para resumir ingesta y evitar reingestar el mismo PDF.
CREATE INDEX IF NOT EXISTS documents_storage_path_idx
    ON documents ((metadata->>'storage_path'));

-- Índice ivfflat para retrieval por similitud coseno.
-- 100 lists está bien para hasta ~100k chunks; subir a 500 si crece más.
CREATE INDEX IF NOT EXISTS documents_embedding_idx
    ON documents
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- RLS: documentos son lectura pública para usuarios autenticados.
-- (No los listamos públicamente, pero el RPC los devuelve.)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read documents" ON documents;
CREATE POLICY "authenticated read documents"
    ON documents FOR SELECT
    TO authenticated
    USING (true);

-- Solo el service_role puede escribir (lo hace el script de ingesta).
DROP POLICY IF EXISTS "service write documents" ON documents;
CREATE POLICY "service write documents"
    ON documents FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
