-- ─────────────────────────────────────────────────────────────────────────────
-- 0004 — Tabla generated_documents (historial de InformesUro)
-- ─────────────────────────────────────────────────────────────────────────────
-- Cada informe, receta, solicitud de cirugía/exámenes, alta médica o
-- indicaciones postoperatorias que se genera en /informesuro se persiste
-- aquí para poder consultarlo después por RUT, paciente o tipo.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS generated_documents (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    doc_type      TEXT NOT NULL,                  -- informe, cirugia, receta, examenes, estudios, alta, postvasectomia, postprostata, postholep
    patient_name  TEXT,
    patient_rut   TEXT,
    patient_age   TEXT,
    clinic        TEXT,
    payload       JSONB DEFAULT '{}'::jsonb,      -- snapshot del documento generado
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS generated_documents_user_created_idx
    ON generated_documents (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS generated_documents_rut_idx
    ON generated_documents (patient_rut);

CREATE INDEX IF NOT EXISTS generated_documents_type_idx
    ON generated_documents (doc_type);

ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own documents" ON generated_documents;
CREATE POLICY "users manage own documents"
    ON generated_documents FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "service manage documents" ON generated_documents;
CREATE POLICY "service manage documents"
    ON generated_documents FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
