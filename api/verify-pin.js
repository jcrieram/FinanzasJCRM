// Endpoint barato sólo para validar el PIN sin gastar llamadas a OpenAI.
//
// Endurecido (jul 2026): rate limiting por IP, comparación en tiempo
// constante y fail-closed si el PIN no está configurado.

import { timingSafeEqual } from 'crypto';

export const config = { maxDuration: 5 };

// Limitador en memoria por IP. No es distribuido (se reinicia en cold start),
// pero Vercel reutiliza la instancia caliente durante las ráfagas — que es
// justo el patrón de un ataque de fuerza bruta — así que corta los bucles
// rápidos de miles de intentos. Ventana deslizante simple.
const WINDOW_MS = 60_000;      // 1 minuto
const MAX_ATTEMPTS = 8;        // intentos fallidos por ventana
const attempts = new Map();    // ip -> [timestamps]

function tooManyAttempts(ip, now) {
    const list = (attempts.get(ip) || []).filter(t => now - t < WINDOW_MS);
    attempts.set(ip, list);
    return list.length >= MAX_ATTEMPTS;
}
function recordFailure(ip, now) {
    const list = attempts.get(ip) || [];
    list.push(now);
    attempts.set(ip, list);
    // Poda defensiva para que el Map no crezca sin límite.
    if (attempts.size > 5000) {
        for (const [k, v] of attempts) {
            if (v.every(t => now - t >= WINDOW_MS)) attempts.delete(k);
        }
    }
}

function clientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
    return req.socket?.remoteAddress || 'unknown';
}

function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const requiredPin = process.env.CONSULTA_PIN;
    // Fail-closed: sin PIN configurado, no dejamos pasar (antes devolvía ok:true).
    if (!requiredPin) {
        return res.status(500).json({ error: 'Acceso no configurado' });
    }

    const now = Date.now();
    const ip = clientIp(req);
    if (tooManyAttempts(ip, now)) {
        return res.status(429).json({ error: 'Demasiados intentos. Espera un minuto.' });
    }

    const provided = req.headers['x-consulta-pin'];
    if (typeof provided !== 'string' || !safeEqual(provided, requiredPin)) {
        recordFailure(ip, now);
        // Pequeño retardo para encarecer la fuerza bruta.
        await new Promise(r => setTimeout(r, 300));
        return res.status(401).json({ error: 'PIN inválido' });
    }
    return res.status(200).json({ ok: true });
}
