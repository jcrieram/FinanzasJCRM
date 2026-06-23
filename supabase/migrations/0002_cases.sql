-- ─────────────────────────────────────────────────────────────────────────────
-- 0002 — Tabla cases (historial de consultas del médico en UroAtlas)
-- ─────────────────────────────────────────────────────────────────────────────
-- Cada vez que el doctor consulta a UroAtlas, se persiste el caso completo:
-- texto clínico, respuesta de Claude, chunks usados (para auditoría) y URL de
-- las imágenes si las hubo. Usado por el sidebar de historial.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cases (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    clinical_text     TEXT,
    image_urls        TEXT[] DEFAULT ARRAY[]::TEXT[],
    response          TEXT,
    retrieved_chunks  JSONB DEFAULT '[]'::jsonb,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cases_user_created_idx
    ON cases (user_id, created_at DESC);

ALTER TABLE cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own cases" ON cases;
CREATE POLICY "users manage own cases"
    ON cases FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- El backend usa service_role para insertar (autenticando al usuario via JWT
-- en la capa API, no en RLS). Mantenemos la policy de service_role abierta.
DROP POLICY IF EXISTS "service manage cases" ON cases;
CREATE POLICY "service manage cases"
    ON cases FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
