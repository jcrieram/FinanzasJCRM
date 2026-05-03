// /api/uroatlas/cases — listar casos del usuario logueado o cargar uno por id.
// GET /api/uroatlas/cases       -> lista los últimos 50 casos del usuario
// GET /api/uroatlas/cases?id=X  -> devuelve el caso completo (incluye chunks)

import { authenticate, getServiceClient } from '../../lib/auth.js';

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const auth = await authenticate(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    if (!auth.user) return res.status(401).json({ error: 'Auth con JWT requerida (no PIN)' });

    const supa = getServiceClient();
    const userId = auth.user.id;
    const id = req.query?.id;

    try {
        if (id) {
            const { data, error } = await supa
                .from('cases')
                .select('*')
                .eq('id', id)
                .eq('user_id', userId)
                .single();
            if (error) {
                if (error.code === 'PGRST116') return res.status(404).json({ error: 'Caso no encontrado' });
                throw error;
            }
            return res.status(200).json({ case: data });
        }

        const { data, error } = await supa
            .from('cases')
            .select('id, clinical_text, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) throw error;
        return res.status(200).json({ cases: data || [] });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
