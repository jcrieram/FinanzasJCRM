-- ─────────────────────────────────────────────────────────────────────────────
-- 0006 — RPC match_corrections (memoria personalizada por usuario)
-- ─────────────────────────────────────────────────────────────────────────────
-- Devuelve los comentarios negativos (rating = -1) más similares al caso
-- nuevo, para el mismo usuario. Se inyectan al prompt como "CORRECCIONES DEL
-- DOCTOR EN CASOS SIMILARES". Filtro de similitud > 0.75 se aplica en el
-- backend (api/uroatlas/query.js).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION match_corrections (
    query_embedding  VECTOR(1024),
    target_user_id   UUID,
    match_count      INT DEFAULT 3
)
RETURNS TABLE (
    case_id     UUID,
    rating      SMALLINT,
    comment     TEXT,
    similarity  FLOAT
)
LANGUAGE SQL STABLE
AS $$
    SELECT
        cf.case_id,
        cf.rating,
        cf.comment,
        1 - (cf.embedding <=> query_embedding) AS similarity
    FROM case_feedback cf
    WHERE cf.user_id = target_user_id
      AND cf.embedding IS NOT NULL
      AND cf.comment IS NOT NULL
      AND cf.rating = -1
    ORDER BY cf.embedding <=> query_embedding
    LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION match_corrections(VECTOR(1024), UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION match_corrections(VECTOR(1024), UUID, INT) TO authenticated;
