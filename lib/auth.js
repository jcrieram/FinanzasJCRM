// Verifica el JWT de Supabase enviado en Authorization: Bearer <token>.
// Devuelve el usuario o null. Compatible con el flujo legacy de PIN para
// que ConsultaVoz siga funcionando durante la migración.

import { createClient } from '@supabase/supabase-js';

let cached = null;
function client() {
    if (cached) return cached;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase env vars no configuradas');
    cached = createClient(url, key, { auth: { persistSession: false } });
    return cached;
}

export async function getUserFromRequest(req) {
    const auth = req.headers['authorization'] || req.headers['Authorization'];
    if (!auth || !auth.startsWith('Bearer ')) return null;
    const token = auth.slice(7);
    if (!token) return null;
    try {
        const { data, error } = await client().auth.getUser(token);
        if (error || !data?.user) return null;
        return data.user;
    } catch {
        return null;
    }
}

// Acepta JWT de Supabase O el PIN legacy (durante la migración).
// Devuelve { user, ok: true } o { ok: false, status, error }.
export async function authenticate(req) {
    const user = await getUserFromRequest(req);
    if (user) return { ok: true, user };

    const requiredPin = process.env.CONSULTA_PIN;
    if (requiredPin && req.headers['x-consulta-pin'] === requiredPin) {
        return { ok: true, user: null };
    }
    return { ok: false, status: 401, error: 'No autorizado' };
}

export function getServiceClient() {
    return client();
}
