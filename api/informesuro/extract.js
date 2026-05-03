// /api/informesuro/extract — usa Claude Sonnet 4.6 para extraer datos
// estructurados del texto libre del médico. Análogo a la llamada a Gemini
// de la app Streamlit, pero con Claude.

import { authenticate } from '../../lib/auth.js';

export const config = { maxDuration: 30 };

const CLAUDE_MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `Eres un asistente que extrae datos clínicos estructurados del texto libre que dicta el Dr. Juan Carlos Riera M. (urólogo) para generar un INFORME UROLÓGICO formal en formato chileno.

Recibes un texto libre con información clínica del caso y devuelves SOLO un JSON válido (sin markdown, sin comentarios, sin texto adicional alrededor) con esta estructura exacta:

{
  "paciente": {
    "antecedentes": "string — antecedentes médicos relevantes (HTA, DM2, etc.) separados por coma. '—' si no se mencionan.",
    "alergias": "string — alergias a medicamentos. '—' si no se mencionan o niega.",
    "quirurgicos": "string — antecedentes quirúrgicos. '—' si no se mencionan o niega.",
    "tabaquismo": "string — estado de tabaquismo (ej. '20 cig/día por 30 años', 'no fumador', 'ex tabaquista'). '—' si no se mencionan."
  },
  "motivo_resumen": "string — un párrafo único en prosa médica formal con el motivo de consulta y resumen clínico del caso. Conserva todos los detalles importantes (síntomas, tiempo de evolución, características). Estilo profesional, sin lenguaje narrativo.",
  "estudios": [
    { "examen": "string — nombre del examen", "resultado": "string — resultado o hallazgo, con valor y unidad cuando aplique" }
  ],
  "diagnosticos": [
    "string — diagnóstico en términos médicos formales"
  ],
  "procedimiento": "string — nombre del procedimiento o conducta propuesta. Si no aplica, string vacío.",
  "justificacion": "string — párrafo justificando la conducta. Si no se dictó, string vacío.",
  "consideraciones": "string — consideraciones adicionales (riesgos, alternativas, expectativas). Si no se dictan, string vacío.",
  "analisis": "string — análisis objetivo del caso si el médico lo dictó. Si no, string vacío."
}

REGLAS:
1. Devuelve EXCLUSIVAMENTE el JSON, sin envolverlo en triple-backtick ni otros marcadores. La respuesta debe poder pasarse directamente a JSON.parse().
2. NO inventes datos clínicos. Si el médico no mencionó algo, usa "—" o string vacío.
3. NO inventes valores numéricos en estudios. Solo incluye los que el médico dictó.
4. Si el texto del médico habla de un procedimiento sin justificación, deja "justificacion" en "". No fabriques justificaciones.
5. Conserva las cifras y unidades exactas (PSA 4.2 ng/mL, próstata 60 cc, Qmax 11 mL/s, etc.).
6. Términos en español médico chileno. Usa términos técnicos (nicturia, disuria, hematuria, calibre miccional disminuido, etc.) en vez de coloquiales.`;

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
    if (!text) return res.status(400).json({ error: 'Falta el texto clínico' });
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
                max_tokens: 2000,
                temperature: 0,
                system: SYSTEM_PROMPT,
                messages: [{ role: 'user', content: `Texto clínico del médico:\n\n${text}\n\nDevuelve solo el JSON.` }]
            })
        });
        if (!apiRes.ok) {
            const err = await apiRes.text();
            return res.status(apiRes.status).json({ error: `Claude error ${apiRes.status}: ${err}` });
        }
        const data = await apiRes.json();
        let raw = data.content?.[0]?.text || '';
        raw = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim();

        let parsed;
        try { parsed = JSON.parse(raw); }
        catch (e) {
            return res.status(500).json({ error: 'Claude devolvió JSON inválido', raw });
        }
        return res.status(200).json({ data: parsed });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
