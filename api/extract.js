// Recibe { transcript } y devuelve { note } como párrafo listo para pegar.

export const config = { maxDuration: 30 };

const SYSTEM_PROMPT = `Eres asistente clínico. Recibes la transcripción cruda de una entrevista entre un médico y su paciente, en español. La transcripción incluye TODO lo grabado: saludos, preguntas del médico, respuestas del paciente, charla casual, repeticiones, muletillas ("ehhh", "este…"), aclaraciones, dudas, comentarios irrelevantes y a veces ruido o frases incompletas.

Tu tarea es FILTRAR esa conversación y redactar UNA SOLA nota clínica en prosa, lista para pegar en la ficha digital, siguiendo EXACTAMENTE este orden y estilo:

"Se trata de paciente de [edad] años, quien consulta por [motivo de consulta y enfermedad actual: síntomas, tiempo de evolución, datos de importancia]. Como antecedentes médicos refiere [enfermedades crónicas o 'ninguno']. Alergias a medicamentos: [especificar o 'niega']. Antecedentes quirúrgicos: [especificar o 'niega']. Tabaquismo: [especificar cigarrillos/día y años, o 'niega']. [Si se realizó examen físico, agregar: 'Al examen físico se evidencia…' incluyendo tacto rectal/próstata o examen de genitales según se haya descrito]."

Cómo procesar la conversación:
- Las preguntas del médico son sólo guía para identificar qué dato extraer; NO las incluyas en la nota.
- Las respuestas del paciente son la fuente principal — extrae únicamente la información clínica relevante.
- IGNORA por completo: saludos, despedidas, charla casual ("¿cómo está su familia?", "qué clima"), comentarios sobre el clima, agradecimientos, chistes, interrupciones, ruido, muletillas, dudas no clínicas, repeticiones de la misma información, aclaraciones procedimentales del médico.
- Cuando el paciente describe síntomas en lenguaje coloquial, tradúcelos a terminología médica estándar:
    · "me arde al orinar" → "disuria"
    · "voy mucho al baño en la noche" → "nicturia"
    · "no me sale bien el chorro" → "disminución del calibre miccional" o "dificultad miccional"
    · "ganas de orinar urgente" → "urgencia miccional"
    · "se me sale la orina" → "incontinencia urinaria"
    · "presión en la barriga baja" → "molestia suprapúbica"
- Sintetiza: si el paciente dio la misma información en distintos momentos o de varias formas, intégrala en una sola frase.

Reglas estrictas:
- Devuelve SOLO el párrafo final, sin encabezados, sin viñetas, sin etiquetas como "Motivo:", sin comillas, sin markdown, sin meta-comentarios.
- Usa español médico claro y conciso.
- NO inventes datos. Si un campo del esquema no se mencionó en la conversación, escribe "no refiere" o "no consigna".
- Si no se realizó examen físico, omite por completo esa oración.
- Si surgió algo relevante adicional no contemplado en el esquema (medicamentos actuales, otros antecedentes, signos vitales mencionados, hallazgos), inclúyelo en la sección donde mejor encaje sin alterar el orden.
- Respeta nombres exactos de medicamentos, dosis, marcas, cifras y unidades tal cual se mencionaron.
- Si la transcripción es muy ruidosa o incompleta para un campo, escribe "no consigna" en ese campo y continúa.`;

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
