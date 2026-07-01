-- ─────────────────────────────────────────────────────────────────────────────
-- 0003 — Tabla case_feedback (loop de aprendizaje del doctor)
-- ─────────────────────────────────────────────────────────────────────────────
-- Cuando el doctor da 👎 + comentario a una respuesta de UroAtlas, el
-- comentario se persiste con un embedding voyage-3. En consultas futuras de
-- casos similares, el RPC match_corrections devuelve las correcciones que
-- aplican y se inyectan al prompt de Claude.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS case_feedback (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id     UUID REFERENCES cases(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rating      SMALLINT NOT NULL CHECK (rating IN (1, -1)),
    comment     TEXT,
    embedding   VECTOR(1024),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS case_feedback_user_idx
    ON case_feedback (user_id, created_at DESC);

-- Índice ivfflat para similitud coseno. 50 lists alcanza hasta ~10k feedbacks.
CREATE INDEX IF NOT EXISTS case_feedback_embedding_idx
    ON case_feedback
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);

ALTER TABLE case_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own feedback" ON case_feedback;
CREATE POLICY "users manage own feedback"
    ON case_feedback FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "service manage feedback" ON case_feedback;
CREATE POLICY "service manage feedback"
    ON case_feedback FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
