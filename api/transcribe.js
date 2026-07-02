// Recibe audio multipart/form-data y devuelve { text }.
// El audio se reenvía a OpenAI en streaming y NO se persiste.
//
// Pipeline: audio → transcripción (gpt-4o-mini-transcribe, con respaldo a
// whisper-1) → pasada de corrección de errores fonéticos sobre el texto
// crudo → { text } que ve el médico y que alimenta a /api/extract.
//
// Estrategia de resiliencia: se intenta primero con gpt-4o-mini-transcribe
// (mejor precisión con términos médicos). Si ese modelo falla por cualquier
// razón (error de OpenAI, timeout de red, respuesta vacía), se reintenta
// automáticamente con whisper-1 antes de reportar error al médico. Cada
// intento fallido se registra con console.error para poder diagnosticarlo
// después en los logs de Vercel.

import { authenticate } from '../lib/auth.js';

export const config = {
    api: { bodyParser: false },
    maxDuration: 60
};

const MODELS = ['gpt-4o-mini-transcribe', 'whisper-1'];

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'OPENAI_API_KEY no configurada' });
    }

    const auth = await authenticate(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
        return res.status(400).json({ error: 'Se esperaba multipart/form-data' });
    }

    let rawBuf;
    try {
        rawBuf = await streamToBuffer(req);
    } catch (e) {
        return res.status(400).json({ error: 'No se pudo leer el audio: ' + e.message });
    }
    if (!rawBuf || rawBuf.length === 0) {
        return res.status(400).json({ error: 'El archivo de audio llegó vacío' });
    }

    let lastError = 'Error desconocido';
    for (const model of MODELS) {
        try {
            const body = injectFields(rawBuf, contentType, model);
            const upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': contentType
                },
                body,
                duplex: 'half'
            });

            const data = await upstream.json().catch(() => null);
            if (!upstream.ok) {
                lastError = data?.error?.message || `Error de OpenAI (${upstream.status})`;
                console.error(`[transcribe] modelo "${model}" respondió ${upstream.status}: ${lastError}`);
                continue;
            }
            if (!data?.text || !data.text.trim()) {
                lastError = `El modelo "${model}" devolvió una transcripción vacía`;
                console.error(`[transcribe] ${lastError}`);
                continue;
            }
            const corrected = await correctTranscript(apiKey, data.text);
            return res.status(200).json({ text: corrected });
        } catch (e) {
            lastError = e.message;
            console.error(`[transcribe] modelo "${model}" lanzó excepción: ${e.message}`);
            continue;
        }
    }

    return res.status(502).json({ error: `La transcripción falló con todos los modelos disponibles. Último error: ${lastError}` });
}

async function streamToBuffer(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return Buffer.concat(chunks);
}

// Vocabulario urológico para sesgar el reconocimiento (laboratorios,
// imágenes, mediciones, diagnósticos, síntomas, medicamentos y
// procedimientos frecuentes en la consulta del Dr. Juan Carlos Riera).
//
// gpt-4o-mini-transcribe acepta prompts largos y descriptivos sin límite
// estricto de tokens — este es el prompt completo, usado como modelo
// principal.
const VOCAB_PROMPT = 'Consulta urológica entre médico urólogo (Dr. Juan Carlos Riera) y paciente, en español. El médico suele indicar al inicio si es "primera vez", "primera consulta" o "consulta de control" / "control de próstata" — nunca dice "contrato". Siglas que el médico pronuncia letra por letra: PSA (P-S-A), PI-RADS (PI-RADS), HPB (H-P-B), HBP, RTU, ITU, IVU, BUN, LDL, HDL, TSH, AST, ALT, TGO, TGP, INR, TP, TPT, IPSS, AUA, EAU, MIBC, NMIBC. El estudio de flujo urinario se llama SIEMPRE "uroflujometría" (no "euroflujometría", no "euroflujo", no "fluometría"). Frases típicas del médico: "uroflujometría con Qmax de", "PSA total de", "PSA libre de", "porcentaje de PSA libre", "índice PSA libre/total", "relación PSA libre sobre total", "Gleason 6", "Gleason 7", "Gleason 8", "PI-RADS 2", "PI-RADS 3", "PI-RADS 4", "volumen premiccional de", "residuo postmiccional de", "próstata de X gramos", "cistoscopía", "citoscopía", "goteo postmiccional", "vamos a hacer el tacto rectal". Términos frecuentes: PSA total, PSA libre, PI-RADS 1, PI-RADS 2, PI-RADS 3, PI-RADS 4, PI-RADS 5, score de Gleason, biopsia transrectal, biopsia transperineal, creatinina, BUN, urea, hemoglobina, hematocrito, glucosa, glicemia, HbA1c, testosterona, sodio, potasio, calcio, colesterol, triglicéridos, transaminasas, bilirrubinas, leucocitos, plaquetas, examen de orina, urocultivo, ecografía renal, ecografía vesical, ecografía transrectal, ecografía prostática, tomografía, uroTAC, resonancia magnética, urografía, uroflujometría, Qmax, residuo postmiccional, volumen premiccional, volumen miccional, próstata, riñón, vejiga, uréter, hiperplasia prostática benigna, HPB, nicturia, disuria, polaquiuria, urgencia miccional, hematuria, calibre miccional, retención urinaria, incontinencia urinaria, infección urinaria, prostatitis, cistitis, pielonefritis, litiasis renal, urolitiasis, cáncer de próstata, biopsia prostática, tacto rectal, cistoscopía, tamsulosina, finasteride, dutasteride, sildenafil, tadalafil, ciprofloxacino, nitrofurantoína, fosfomicina, doxazosina, oxibutinina, solifenacina, mirabegron, bicalutamida, enzalutamida, leuprolide, RTU prostática, prostatectomía, nefrectomía, ureterolitotomía, litotricia, mililitros, centímetros cúbicos, nanogramos por mililitro.';

// whisper-1 SOLO usa los últimos ~224 tokens del prompt e ignora el resto
// (a diferencia de gpt-4o-mini-transcribe, que sí aprovecha prompts largos).
// El VOCAB_PROMPT completo (~500+ tokens) se trunca casi por completo si se
// usa tal cual con whisper-1 — por eso whisper-1 usa esta versión corta y
// densa, pensada para caber entera dentro del límite.
const WHISPER_FALLBACK_PROMPT = 'Consulta urológica en español, Dr. Juan Carlos Riera. Términos: PSA, PI-RADS, Gleason, HPB, uroflujometría, Qmax, residuo postmiccional, volumen premiccional, goteo postmiccional, tacto rectal, próstata, creatinina, testosterona, nicturia, disuria, hematuria, biopsia prostática, cistoscopía, tamsulosina, finasteride, "primera vez", "primera consulta", "consulta de control", "control de próstata".';

function promptForModel(model) {
    return model === 'whisper-1' ? WHISPER_FALLBACK_PROMPT : VOCAB_PROMPT;
}

function injectFields(buf, contentType, model) {
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
    if (!boundaryMatch) return buf;
    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const text = buf.toString('binary');
    const prompt = promptForModel(model);

    const extra =
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="model"\r\n\r\n` +
        `${model}\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="language"\r\n\r\n` +
        `es\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
        `json\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="prompt"\r\n\r\n` +
        `${prompt}\r\n`;

    const closing = `--${boundary}--`;
    const idx = text.lastIndexOf(closing);
    if (idx < 0) return buf;
    const before = text.slice(0, idx);
    const after = text.slice(idx);
    return Buffer.from(before + extra + after, 'binary');
}

const CORRECTION_SYSTEM_PROMPT = `Eres un corrector de transcripciones de audio de consultas médicas urológicas en español. Recibes una transcripción generada por reconocimiento de voz automático que puede contener errores FONÉTICOS típicos (palabras que suenan parecido a un término médico pero no tienen sentido en el contexto).

TAREA: corregir ÚNICAMENTE errores fonéticos obvios de reconocimiento de voz relacionados con términos médicos, anatomía, medicamentos, siglas o vocabulario clínico urológico. Ejemplos de errores típicos que debes corregir cuando el contexto lo deja claro:
- "prórroga" → "próstata"
- "impacto" (al examinar) → "tacto" (tacto rectal)
- "contrato" (de control/seguimiento) → "control"
- "boteo postmiccional" → "goteo postmiccional"
- "acetosterona" o variantes similares → "testosterona"
- Siglas mal transcritas foneticamente (PSA, PI-RADS, Gleason, HPB, etc.)
- Cualquier otro término médico/anatómico/farmacológico claramente deformado por el reconocimiento de voz

PROHIBIDO — reglas estrictas:
- NUNCA cambies el significado clínico de nada.
- NUNCA elimines ni resumas contenido, aunque sea repetitivo, tenga muletillas ("eh", "este", "o sea"), esté mal redactado o sea charla no clínica — el habla natural se conserva TAL CUAL, palabra por palabra, salvo el término puntual que corriges.
- NUNCA corrijas gramática, redacción o puntuación de estilo — SOLO el reconocimiento erróneo de palabras médicas/técnicas.
- NUNCA agregues información, palabras o frases que no estén en el texto original.
- Si tienes duda sobre si una palabra es un error de reconocimiento o es realmente lo que se dijo, NO la cambies — déjala igual.
- El texto corregido debe tener aproximadamente el mismo largo que el original.

Devuelve SOLO el texto corregido completo. Sin comentarios, sin explicaciones, sin comillas alrededor.`;

// Pasada de corrección sobre el texto crudo: usa gpt-4o-mini con contexto
// completo de la oración (a diferencia del sesgo acústico del prompt de
// Whisper) para arreglar errores fonéticos recurrentes de términos médicos
// urológicos. Best-effort: si falla o el resultado es sospechoso (vacío o
// con un largo muy distinto al original), se devuelve el texto crudo sin
// corregir en vez de bloquear la transcripción.
async function correctTranscript(apiKey, rawText) {
    try {
        const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                temperature: 0,
                messages: [
                    { role: 'system', content: CORRECTION_SYSTEM_PROMPT },
                    { role: 'user', content: rawText }
                ]
            })
        });
        const data = await upstream.json().catch(() => null);
        if (!upstream.ok) {
            console.error(`[transcribe] corrección falló (${upstream.status}): ${data?.error?.message}`);
            return rawText;
        }
        const corrected = data?.choices?.[0]?.message?.content?.trim();
        if (!corrected) return rawText;
        // Sanity check: si el largo cambió demasiado, algo salió mal
        // (resumen, corte, alucinación) — mejor devolver el crudo.
        const ratio = corrected.length / rawText.length;
        if (ratio < 0.6 || ratio > 1.4) {
            console.error(`[transcribe] corrección descartada por cambio de largo sospechoso (ratio ${ratio.toFixed(2)})`);
            return rawText;
        }
        return corrected;
    } catch (e) {
        console.error(`[transcribe] corrección lanzó excepción: ${e.message}`);
        return rawText;
    }
}
