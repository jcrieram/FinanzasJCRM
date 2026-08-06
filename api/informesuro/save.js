// /api/informesuro/save — persiste un documento generado en el historial.
// Requiere sesión de Supabase (no PIN): cada documento queda asociado al
// usuario. El RUT se guarda NORMALIZADO (solo dígitos + K) para que la
// búsqueda del historial funcione (historial.js normaliza el query igual).

import { authenticate, getServiceClient } from '../../lib/auth.js';

export const config = { maxDuration: 15 };

const VALID_TYPES = new Set([
    'informe', 'cirugia', 'receta', 'examenes', 'estudios',
    'alta', 'postvasectomia', 'postprostata', 'postholep'
]);

function normalizeRut(rut) {
    return (rut || '').toString().replace(/[^0-9kK]/g, '').toUpperCase();
}
function clip(v, n) {
    const s = (v == null ? '' : String(v)).trim();
    return s ? s.slice(0, n) : null;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const auth = await authenticate(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    if (!auth.user) return res.status(401).json({ error: 'Requiere autenticación Supabase' });

    let body;
    try { body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); }
    catch { return res.status(400).json({ error: 'JSON inválido' }); }

    const doc_type = String(body.doc_type || '').trim();
    if (!VALID_TYPES.has(doc_type)) return res.status(400).json({ error: 'Tipo de documento inválido' });

    const record = {
        user_id: auth.user.id,
        doc_type,
        patient_name: clip(body.patient_name, 200),
        patient_rut: normalizeRut(body.patient_rut) || null,
        patient_age: clip(body.patient_age, 20),
        clinic: clip(body.clinic, 200),
        payload: (body.payload && typeof body.payload === 'object') ? body.payload : {}
    };

    try {
        const supa = getServiceClient();
        const { data, error } = await supa
            .from('generated_documents')
            .insert(record)
            .select('id')
            .single();
        if (error) {
            console.error('[informesuro/save] insert error:', error.message);
            return res.status(500).json({ error: 'No se pudo guardar el documento' });
        }
        return res.status(200).json({ id: data.id });
    } catch (e) {
        console.error('[informesuro/save] excepción:', e.message);
        return res.status(500).json({ error: 'No se pudo guardar el documento' });
    }
}
