// Verifica el JWT de Supabase enviado en Authorization: Bearer <token>.
// Devuelve el usuario o null. Compatible con el flujo legacy de PIN, pero
// SOLO en los endpoints de ConsultaVoz que lo habilitan explícitamente.

import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';

let cached = null;
function client() {
    if (cached) return cached;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase env vars no configuradas');
    cached = createClient(url, key, { auth: { persistSession: false } });
    return cached;
}

// Lista blanca de correos autorizados (env ALLOWED_EMAILS, separados por
// coma). Si NO está configurada, se permite cualquier usuario válido de
// Supabase (comportamiento previo) pero se deja constancia en el log — se
// recomienda configurarla siempre.
function emailAllowed(email) {
    const raw = process.env.ALLOWED_EMAILS;
    if (!raw || !raw.trim()) {
        console.warn('[auth] ALLOWED_EMAILS no configurada — se acepta cualquier usuario de Supabase');
        return true;
    }
    if (!email) return false;
    const allow = raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    return allow.includes(email.toLowerCase());
}

// Comparación en tiempo constante para evitar timing attacks sobre el PIN.
function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
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

// Autentica una petición.
//   opciones.allowPin (default false): si true, acepta el PIN legacy de
//   ConsultaVoz como credencial. Solo los endpoints de ConsultaVoz deben
//   pasarlo; el resto (UroAtlas, InformesUro) exige JWT de Supabase.
// Devuelve { ok: true, user } o { ok: false, status, error }.
export async function authenticate(req, options = {}) {
    const { allowPin = false } = options;

    const user = await getUserFromRequest(req);
    if (user) {
        if (!emailAllowed(user.email)) {
            return { ok: false, status: 403, error: 'Usuario no autorizado' };
        }
        return { ok: true, user };
    }

    if (allowPin) {
        const requiredPin = process.env.CONSULTA_PIN;
        const provided = req.headers['x-consulta-pin'];
        if (requiredPin && typeof provided === 'string' && safeEqual(provided, requiredPin)) {
            return { ok: true, user: null };
        }
    }
    return { ok: false, status: 401, error: 'No autorizado' };
}

export function getServiceClient() {
    return client();
}

// Exportadas para tests unitarios.
export const _internal = { emailAllowed, safeEqual };
