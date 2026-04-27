// Endpoint barato sólo para validar el PIN sin gastar llamadas a OpenAI.

export const config = { maxDuration: 5 };

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const requiredPin = process.env.CONSULTA_PIN;
    if (!requiredPin) {
        return res.status(200).json({ ok: true, unprotected: true });
    }
    if (req.headers['x-consulta-pin'] !== requiredPin) {
        return res.status(401).json({ error: 'PIN inválido' });
    }
    return res.status(200).json({ ok: true });
}
