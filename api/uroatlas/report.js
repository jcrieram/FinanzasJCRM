// /api/uroatlas/report — toma el caso clínico + opinión de UroAtlas + datos
// del paciente y genera un INFORME MÉDICO UROLÓGICO formal usando Claude.
// Devuelve { html } listo para mostrar en la UI o imprimir.

import { authenticate } from '../../lib/auth.js';

export const config = { maxDuration: 30 };

const CLAUDE_MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `Eres un asistente que redacta INFORMES MÉDICOS UROLÓGICOS formales en español, con estilo profesional chileno.

Recibes:
1. Datos del paciente (nombre, edad, RUT).
2. La descripción del caso clínico que dictó el médico (Dr. Juan Carlos Riera M.).
3. La opinión técnica generada por UroAtlas con base en guidelines AUA/EAU y libros de urología.

Tu tarea es FUSIONAR esa información en un informe médico narrativo, profesional, listo para entregar al paciente o adjuntar a la ficha clínica.

ESTRUCTURA OBLIGATORIA (encabezados en MAYÚSCULAS sueltas, sin markdown):

DATOS DEL PACIENTE
Nombre, edad, RUT, fecha del informe.

MOTIVO DE CONSULTA / RESUMEN DEL CASO
Un párrafo único integrando el cuadro clínico que el médico describió.

HALLAZGOS CLÍNICOS Y EXÁMENES
Lo que el caso reportó (síntomas, examen físico, laboratorios, imágenes), redactado en prosa técnica.

ANÁLISIS Y DISCUSIÓN
Razonamiento clínico basado en la opinión de UroAtlas, integrando guidelines aplicables. Conserva las citas [1], [2] tal como vengan en la opinión.

DIAGNÓSTICO PRESUNTIVO
Lista corta y precisa, en términos médicos.

CONDUCTA Y RECOMENDACIONES
Plan terapéutico y/o estudios solicitados, en bullets cortos. Solo lo que la opinión de UroAtlas respaldó.

OBSERVACIONES
Banderas rojas si las hubiera, datos faltantes que el médico debería completar, próxima consulta.

REGLAS:
- NO inventes datos clínicos que no estén en el caso o en la opinión.
- NO uses markdown (sin ###, **, ---). Encabezados en línea propia, en mayúsculas.
- Mantén las citas [1], [2] de la opinión donde correspondan.
- Tono profesional médico, oraciones cortas, sin lenguaje narrativo o emocional.
- Cierra el informe con: "Atentamente, Dr. Juan Carlos Riera M. — Urólogo".`;

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

    const { case_text = '', response = '', patient = {} } = body;
    if (!case_text || !response) return res.status(400).json({ error: 'Faltan case_text y/o response' });

    const { nombre = '', edad = '', rut = '' } = patient;
    if (!nombre || !rut) return res.status(400).json({ error: 'Faltan nombre o RUT del paciente' });

    const fecha = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });

    const userMessage = `DATOS DEL PACIENTE:
- Nombre: ${nombre}
- Edad: ${edad || 'no especificada'}
- RUT: ${rut}
- Fecha: ${fecha}

CASO CLÍNICO DICTADO POR EL MÉDICO:

${case_text}

OPINIÓN DE UROATLAS (basada en guidelines):

${response}

Redacta el informe médico siguiendo la estructura del system prompt.`;

    try {
        const resApi = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: CLAUDE_MODEL,
                max_tokens: 2000,
                temperature: 0.2,
                system: SYSTEM_PROMPT,
                messages: [{ role: 'user', content: userMessage }]
            })
        });
        if (!resApi.ok) {
            const err = await resApi.text();
            return res.status(resApi.status).json({ error: `Claude error ${resApi.status}: ${err}` });
        }
        const data = await resApi.json();
        const text = data.content?.[0]?.text || '';

        return res.status(200).json({
            text,
            patient: { nombre, edad, rut },
            fecha
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
