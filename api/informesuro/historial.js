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
    const supa = getServiceClient();

    // Documento individual (con payload completo) para reabrirlo en la vista
    // previa. Siempre acotado al usuario autenticado.
    if (q.id) {
        const { data, error } = await supa
            .from('generated_documents')
            .select('id, doc_type, patient_name, patient_rut, patient_age, clinic, case_text, data, created_at')
            .eq('user_id', auth.user.id)
            .eq('id', q.id)
            .single();
        if (error || !data) return res.status(404).json({ error: 'Documento no encontrado' });
        return res.status(200).json({
            document: { ...data, doc_type_label: TYPE_LABELS[data.doc_type] || data.doc_type }
        });
    }

    const tipo = q.tipo || '';
    const rut = (q.rut || '').replace(/[^0-9kK]/g, '');
    const limit = Math.min(parseInt(q.limit, 10) || 100, 200);

    // Se incluye `data` para extraer el teléfono (guardado dentro del
    // documento, p.ej. en solicitudes de cirugía). No se devuelve el objeto
    // `data` completo en la lista: solo el teléfono derivado, para mantenerla
    // liviana. El contenido completo se obtiene con ?id= al reabrir.
    let query = supa
        .from('generated_documents')
        .select('id, doc_type, patient_name, patient_rut, patient_age, clinic, data, created_at')
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (tipo) query = query.eq('doc_type', tipo);
    if (rut) query = query.ilike('patient_rut', `%${rut}%`);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const documents = (data || []).map(d => {
        const dd = (d.data && typeof d.data === 'object') ? d.data : {};
        const phone = dd.telefono || dd.fono || dd.phone || '';
        const { data: _omit, ...rest } = d;
        return {
            ...rest,
            patient_phone: (phone || '').toString().trim(),
            doc_type_label: TYPE_LABELS[d.doc_type] || d.doc_type
        };
    });

    return res.status(200).json({ documents });
}
