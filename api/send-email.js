// Envía la nota clínica por email vía Resend.

import { authenticate } from '../lib/auth.js';

export const config = { maxDuration: 15 };

const TO_EMAIL = 'jcrieram@gmail.com';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'RESEND_API_KEY no configurada' });
    }

    const auth = await authenticate(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    const fromAddr = process.env.RESEND_FROM || 'Consulta <onboarding@resend.dev>';

    let body;
    try { body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); }
    catch { return res.status(400).json({ error: 'JSON inválido' }); }

    const note = (body.note || '').trim();
    if (!note) return res.status(400).json({ error: 'Falta note' });

    const now = new Date();
    const fecha = now.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
    const subject = `Nota de consulta - ${fecha}`;

    try {
        const upstream = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: fromAddr,
                to: [TO_EMAIL],
                subject,
                text: note,
                html: `<pre style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap;">${escapeHtml(note)}</pre>`
            })
        });
        const data = await upstream.json();
        if (!upstream.ok) {
            return res.status(upstream.status).json({ error: data.message || data.error?.message || 'Error de Resend' });
        }
        return res.status(200).json({ ok: true, id: data.id });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}

function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
