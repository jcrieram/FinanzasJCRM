-- ─────────────────────────────────────────────────────────────────────────────
-- UroAtlas: función para recuperar correcciones del doctor en casos similares
-- ─────────────────────────────────────────────────────────────────────────────
-- Cuando el doctor responde 👎 + comentario a una consulta, ese comentario se
-- guarda en `case_feedback` junto con un embedding de Voyage AI (voyage-3,
-- 1024 dimensiones). Esta función recibe el embedding del caso nuevo y devuelve
-- las correcciones más relevantes (similitud coseno) hechas por el mismo
-- usuario. Estas correcciones se inyectan al prompt de Claude para que tome
-- en cuenta las preferencias clínicas del doctor.
--
-- Cómo correr: copiar este archivo entero y pegarlo en Supabase SQL Editor.
-- Es idempotente: se puede correr múltiples veces sin romper nada.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION match_corrections (
    query_embedding vector(1024),
    target_user_id uuid,
    match_count int DEFAULT 3
)
RETURNS TABLE (
    id uuid,
    rating int,
    comment text,
    similarity float
)
LANGUAGE sql STABLE
AS $$
    SELECT
        cf.id,
        cf.rating,
        cf.comment,
        1 - (cf.embedding <=> query_embedding) AS similarity
    FROM case_feedback cf
    WHERE cf.user_id = target_user_id
      AND cf.embedding IS NOT NULL
      AND cf.rating = -1
    ORDER BY cf.embedding <=> query_embedding
    LIMIT match_count;
$$;

-- Índice ivfflat opcional para acelerar la búsqueda cuando haya muchos
-- comentarios. Útil a partir de ~100 correcciones; antes de eso, el scan
-- secuencial es más rápido. Se puede crear o saltar.
CREATE INDEX IF NOT EXISTS case_feedback_embedding_idx
    ON case_feedback
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- ─── Verificación ────────────────────────────────────────────────────────────
-- Después de correr, este SELECT debería listar la función:
--
--   SELECT proname FROM pg_proc WHERE proname = 'match_corrections';
--
-- Y este permiso es necesario para que el service_role la pueda invocar
-- (Supabase lo otorga automáticamente, pero por si acaso):

GRANT EXECUTE ON FUNCTION match_corrections(vector(1024), uuid, int) TO service_role;
