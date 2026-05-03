// /api/informesuro/historial — devuelve los documentos generados del usuario autenticado.

import { authenticate, getServiceClient } from '../../lib/auth.js';

export const config = { maxDuration: 15 };

const TYPE_LABELS = {
    informe: 'Informe Urológico',
    cirugia: 'Solicitud Cirugía',
    receta: 'Receta',
    examenes: 'Solicitud Exámenes',
    estudios: 'Solicitud Estudios',
    alta: 'Alta Médica',
    postvasectomia: 'Post Vasectomía',
    postprostata: 'Post Cirugía Próstata',
    postholep: 'Post HoLEP'
};

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const auth = await authenticate(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    if (!auth.user) return res.status(401).json({ error: 'Requiere autenticación Supabase' });

    const q = req.query || {};
    const tipo = q.tipo || '';
    const rut = (q.rut || '').replace(/[^0-9kK]/g, '');
    const limit = Math.min(parseInt(q.limit, 10) || 100, 200);

    const supa = getServiceClient();
    let query = supa
        .from('generated_documents')
        .select('id, doc_type, patient_name, patient_rut, patient_age, clinic, created_at')
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (tipo) query = query.eq('doc_type', tipo);
    if (rut) query = query.ilike('patient_rut', `%${rut}%`);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const documents = (data || []).map(d => ({
        ...d,
        doc_type_label: TYPE_LABELS[d.doc_type] || d.doc_type
    }));

    return res.status(200).json({ documents });
}
