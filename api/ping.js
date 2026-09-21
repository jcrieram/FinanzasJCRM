// /api/ping — mantiene despierto el proyecto de Supabase (evita la pausa por
// inactividad del plan gratuito, que tumba el login con "Failed to fetch").
//
// Lo invoca un cron de Vercel una vez al día (ver "crons" en vercel.json).
// Hace una consulta mínima con el service role para registrar actividad.
// No expone datos: solo responde { ok }.

import { getServiceClient } from '../lib/auth.js';

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
    try {
        const supa = getServiceClient();
        // Consulta mínima (1 fila, solo el id) para contar como actividad.
        const { error } = await supa
            .from('generated_documents')
            .select('id')
            .limit(1);
        if (error) {
            console.error('[ping] error:', error.message);
            return res.status(500).json({ ok: false });
        }
        return res.status(200).json({ ok: true, ts: new Date().toISOString() });
    } catch (e) {
        console.error('[ping] excepción:', e.message);
        return res.status(500).json({ ok: false });
    }
}
