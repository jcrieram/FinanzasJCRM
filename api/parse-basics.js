// /api/parse-basics — extrae datos básicos del paciente (nombre, RUT, edad)
// del texto libre dictado. Reconoce el RUT por su formato numérico, no por la
// palabra hablada. Usado por informesuro y uroatlas.

import { authenticate } from '../lib/auth.js';
import { formatRut } from '../lib/rut.js';

export const config = { maxDuration: 30 };

const CLAUDE_MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `Eres un asistente que extrae los datos básicos del paciente del texto libre que dicta un médico urólogo en Chile.

Devuelve SOLO un JSON válido (sin markdown, sin comentarios, sin texto alrededor) con esta estructura exacta:

{
  "nombre": "string — nombre completo del paciente si se menciona; '' si no.",
  "rut": "string — el número de identificación del paciente (RUT/cédula) tal como aparezca; '' si no se menciona.",
  "edad": "string — edad en años como número (ej. '65'); '' si no se menciona."
}

REGLAS:
1. Devuelve EXCLUSIVAMENTE el JSON, parseable directamente con JSON.parse().
2. El RUT/cédula: reconócelo por su FORMATO (un número de 7 a 8 dígitos seguido de un dígito verificador que puede ser 0-9 o la letra K). El médico puede llamarlo "RUT", "run", "carnet", "cédula", "rol", "identificación", o incluso la transcripción puede escribir "Ruth" — todos significan lo mismo. Extrae el número aunque la palabra esté mal transcrita. Si no hay ningún número con forma de RUT, usa ''.
3. NO inventes datos. Si algo no se menciona, usa ''.
4. La edad es solo el número de años (sin la palabra "años").`;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const auth = await authenticate(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada' });

    let body;
    try { body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); }
    catch { return res.status(400).json({ error: 'JSON inválido' }); }

    const text = (body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Falta el texto' });
    if (text.length > 8000) return res.status(400).json({ error: 'Texto demasiado largo (máx 8000 chars)' });

    try {
        const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: CLAUDE_MODEL,
                max_tokens: 500,
                temperature: 0,
                system: SYSTEM_PROMPT,
                messages: [{ role: 'user', content: `Texto dictado:\n\n${text}\n\nDevuelve solo el JSON.` }]
            })
        });
        if (!apiRes.ok) {
            const err = await apiRes.text();
            return res.status(apiRes.status).json({ error: `Claude error ${apiRes.status}: ${err}` });
        }
        const payload = await apiRes.json();
        const raw = payload.content?.[0]?.text || '{}';
        let data;
        try { data = JSON.parse(raw); }
        catch { return res.status(200).json({ data: { nombre: '', rut: '', edad: '' } }); }
        // Red de seguridad: normaliza el RUT por formato aunque Claude lo devuelva sucio.
        const normalizedRut = formatRut(String(data.rut || ''));
        return res.status(200).json({
            data: {
                nombre: String(data.nombre || '').trim(),
                rut: normalizedRut,
                edad: String(data.edad || '').replace(/[^0-9]/g, '')
            }
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
