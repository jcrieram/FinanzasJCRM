// Recibe { transcript } y devuelve { note } como párrafo listo para pegar.

export const config = { maxDuration: 30 };

const SYSTEM_PROMPT = `Eres asistente clínico. Recibes la transcripción de una entrevista entre un médico y su paciente, en español. Tu tarea es redactar UNA SOLA nota clínica en prosa, lista para pegar en la ficha digital, siguiendo EXACTAMENTE este orden y estilo:

"Se trata de paciente de [edad] años, quien consulta por [motivo de consulta y enfermedad actual: síntomas, tiempo de evolución, datos de importancia]. Como antecedentes médicos refiere [enfermedades crónicas o 'ninguno']. Alergias a medicamentos: [especificar o 'niega']. Antecedentes quirúrgicos: [especificar o 'niega']. Tabaquismo: [especificar cigarrillos/día y años, o 'niega']. [Si se realizó examen físico, agregar: 'Al examen físico se evidencia…' incluyendo tacto rectal/próstata o examen de genitales según se haya descrito]."

Reglas estrictas:
- Devuelve SOLO el párrafo final, sin encabezados, sin viñetas, sin etiquetas como "Motivo:", sin comillas, sin markdown.
- Usa español médico claro y conciso.
- NO inventes datos. Si un campo no se mencionó, escribe "no refiere" o "no consigna".
- Si no se realizó examen físico, omite por completo esa oración.
- Si se mencionó algo relevante adicional (medicamentos actuales, otros antecedentes, hallazgos), inclúyelo donde corresponda sin salirte del orden.
- Respeta los términos exactos que mencione el paciente o médico cuando sean relevantes (ej. nombres de medicamentos, dosis, marcas).`;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'OPENAI_API_KEY no configurada' });
    }

    let body;
    try { body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); }
    catch { return res.status(400).json({ error: 'JSON inválido' }); }

    const transcript = (body.transcript || '').trim();
    if (!transcript) return res.status(400).json({ error: 'Falta transcript' });

    try {
        const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                temperature: 0.2,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: `Transcripción de la entrevista:\n\n${transcript}` }
                ]
            })
        });
        const data = await upstream.json();
        if (!upstream.ok) {
            return res.status(upstream.status).json({ error: data.error?.message || 'Error de OpenAI' });
        }
        const note = data.choices?.[0]?.message?.content?.trim() || '';
        return res.status(200).json({ note });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
