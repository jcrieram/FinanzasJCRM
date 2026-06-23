-- ─────────────────────────────────────────────────────────────────────────────
-- 0005 — RPC match_documents (retrieval RAG por similitud coseno)
-- ─────────────────────────────────────────────────────────────────────────────
-- Recibe el embedding de la query del médico y devuelve los top-k chunks más
-- relevantes del corpus completo. Lo usa /api/uroatlas/query.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION match_documents (
    query_embedding VECTOR(1024),
    match_count     INT DEFAULT 8
)
RETURNS TABLE (
    id              UUID,
    source          TEXT,
    guideline_name  TEXT,
    page            INT,
    section         TEXT,
    content         TEXT,
    language        TEXT,
    metadata        JSONB,
    similarity      FLOAT
)
LANGUAGE SQL STABLE
AS $$
    SELECT
        d.id,
        d.source,
        d.guideline_name,
        d.page,
        d.section,
        d.content,
        d.language,
        d.metadata,
        1 - (d.embedding <=> query_embedding) AS similarity
    FROM documents d
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION match_documents(VECTOR(1024), INT) TO service_role;
GRANT EXECUTE ON FUNCTION match_documents(VECTOR(1024), INT) TO authenticated;
