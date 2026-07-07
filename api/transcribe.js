// Recibe audio multipart/form-data y devuelve { text }.
// El audio se reenvía al proveedor de transcripción en streaming y NO se persiste.
//
// Pipeline: audio → transcripción (cascada de modelos, del más capaz al más
// simple) → pasada de corrección de errores fonéticos → { text } que ve el
// médico y que alimenta a /api/extract.
//
// CASCADA DE MODELOS (se intenta en orden; el primero que responda bien gana):
//   1. Gemini (gemini-2.5-flash) — SOLO si GEMINI_API_KEY está configurada en
//      Vercel. Es transcripción CONTEXTUAL: el modelo escucha el audio
//      entendiendo que es una consulta urológica, por lo que no confunde
//      "próstata" con "prórroga" ni "control" con "contrato". La opción más
//      precisa para audio clínico difícil.
//   2. gpt-4o-transcribe — el mejor STT de OpenAI (mejor que el mini).
//   3. gpt-4o-mini-transcribe — rápido, buena precisión.
//   4. whisper-1 — último recurso (con prompt corto: solo usa ~224 tokens).
//
// Cada intento tiene su timeout (AbortController) para que un modelo lento no
// consuma el maxDuration completo y deje sin tiempo a los respaldos. Todos los
// fallos quedan en console.error → visibles en los logs de Vercel.

import { authenticate } from '../lib/auth.js';

export const config = {
    api: { bodyParser: false },
    maxDuration: 60
};

// Presupuesto total del handler (deja margen frente al maxDuration de 60 s).
const TOTAL_BUDGET_MS = 55000;
// Reserva mínima para la pasada de corrección al final.
const CORRECTION_RESERVE_MS = 9000;

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

    const started = Date.now();
    const remaining = () => TOTAL_BUDGET_MS - (Date.now() - started);

    // Construir la cascada de intentos.
    const attempts = [];
    if (process.env.GEMINI_API_KEY) {
        const filePart = extractFilePart(rawBuf, contentType);
        if (filePart) {
            attempts.push({
                name: 'gemini',
                contextual: true, // ya corrige por contexto; no necesita la pasada extra
                run: (ms) => transcribeGemini(filePart, ms),
                cap: 30000
            });
        }
    }
    attempts.push({ name: 'gpt-4o-transcribe', run: (ms) => transcribeOpenAI(apiKey, rawBuf, contentType, 'gpt-4o-transcribe', ms), cap: 28000 });
    attempts.push({ name: 'gpt-4o-mini-transcribe', run: (ms) => transcribeOpenAI(apiKey, rawBuf, contentType, 'gpt-4o-mini-transcribe', ms), cap: 20000 });
    attempts.push({ name: 'whisper-1', run: (ms) => transcribeOpenAI(apiKey, rawBuf, contentType, 'whisper-1', ms), cap: 15000 });

    let text = null;
    let usedAttempt = null;
    let lastError = 'Error desconocido';

    for (const attempt of attempts) {
        const budget = Math.min(attempt.cap, remaining() - CORRECTION_RESERVE_MS);
        if (budget < 5000) {
            console.error(`[transcribe] sin presupuesto de tiempo para "${attempt.name}" (${budget}ms) — se omite`);
            continue;
        }
        try {
            const t = await attempt.run(budget);
            if (t && t.trim()) {
                text = t.trim();
                usedAttempt = attempt;
                break;
            }
            lastError = `El modelo "${attempt.name}" devolvió una transcripción vacía`;
            console.error(`[transcribe] ${lastError}`);
        } catch (e) {
            lastError = e.message;
            console.error(`[transcribe] modelo "${attempt.name}" falló: ${e.message}`);
        }
    }

    if (!text) {
        return res.status(502).json({ error: `La transcripción falló con todos los modelos disponibles. Último error: ${lastError}` });
    }

    // Pasada de corrección fonética — solo para los modelos acústicos de
    // OpenAI. Gemini ya transcribe con contexto, no la necesita.
    if (!usedAttempt.contextual) {
        const budget = Math.min(15000, remaining() - 2000);
        if (budget >= 6000) {
            text = await correctTranscript(apiKey, text, budget);
        } else {
            console.error('[transcribe] sin presupuesto para la pasada de corrección — se devuelve el texto crudo');
        }
    }

    return res.status(200).json({ text });
}

async function streamToBuffer(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return Buffer.concat(chunks);
}

// ═══════════════════════════════════════════════════════════════
// OpenAI — /v1/audio/transcriptions
// ═══════════════════════════════════════════════════════════════

// Vocabulario urológico para sesgar el reconocimiento (laboratorios,
// imágenes, mediciones, diagnósticos, síntomas, medicamentos y
// procedimientos frecuentes en la consulta del Dr. Juan Carlos Riera).
//
// gpt-4o-transcribe y gpt-4o-mini-transcribe aceptan prompts largos y
// descriptivos — este es el prompt completo, usado con ambos.
const VOCAB_PROMPT = 'Consulta urológica entre médico urólogo (Dr. Juan Carlos Riera) y paciente, en español. El médico suele indicar al inicio si es "primera vez", "primera consulta" o "consulta de control" / "control de próstata" — nunca dice "contrato". Siglas que el médico pronuncia letra por letra: PSA (P-S-A), PI-RADS (PI-RADS), HPB (H-P-B), HBP, RTU, ITU, IVU, BUN, LDL, HDL, TSH, AST, ALT, TGO, TGP, INR, TP, TPT, IPSS, AUA, EAU, MIBC, NMIBC. El estudio de flujo urinario se llama SIEMPRE "uroflujometría" (no "euroflujometría", no "euroflujo", no "fluometría"). Frases típicas del médico: "uroflujometría con Qmax de", "PSA total de", "PSA libre de", "porcentaje de PSA libre", "índice PSA libre/total", "relación PSA libre sobre total", "Gleason 6", "Gleason 7", "Gleason 8", "PI-RADS 2", "PI-RADS 3", "PI-RADS 4", "volumen premiccional de", "residuo postmiccional de", "próstata de X gramos", "cistoscopía", "citoscopía", "goteo postmiccional", "vamos a hacer el tacto rectal". Términos frecuentes: PSA total, PSA libre, PI-RADS 1, PI-RADS 2, PI-RADS 3, PI-RADS 4, PI-RADS 5, score de Gleason, biopsia transrectal, biopsia transperineal, creatinina, BUN, urea, hemoglobina, hematocrito, glucosa, glicemia, HbA1c, testosterona, sodio, potasio, calcio, colesterol, triglicéridos, transaminasas, bilirrubinas, leucocitos, plaquetas, examen de orina, urocultivo, ecografía renal, ecografía vesical, ecografía transrectal, ecografía prostática, tomografía, uroTAC, resonancia magnética, urografía, uroflujometría, Qmax, residuo postmiccional, volumen premiccional, volumen miccional, próstata, riñón, vejiga, uréter, hiperplasia prostática benigna, HPB, nicturia, disuria, polaquiuria, urgencia miccional, hematuria, calibre miccional, retención urinaria, incontinencia urinaria, infección urinaria, prostatitis, cistitis, pielonefritis, litiasis renal, urolitiasis, cáncer de próstata, biopsia prostática, tacto rectal, cistoscopía, tamsulosina, finasteride, dutasteride, sildenafil, tadalafil, ciprofloxacino, nitrofurantoína, fosfomicina, doxazosina, oxibutinina, solifenacina, mirabegron, bicalutamida, enzalutamida, leuprolide, RTU prostática, prostatectomía, nefrectomía, ureterolitotomía, litotricia, mililitros, centímetros cúbicos, nanogramos por mililitro.';

// whisper-1 SOLO usa los últimos ~224 tokens del prompt e ignora el resto.
// Versión corta y densa, pensada para caber entera dentro del límite.
const WHISPER_FALLBACK_PROMPT = 'Consulta urológica en español, Dr. Juan Carlos Riera. Términos: PSA, PI-RADS, Gleason, HPB, uroflujometría, Qmax, residuo postmiccional, volumen premiccional, goteo postmiccional, tacto rectal, próstata, creatinina, testosterona, nicturia, disuria, hematuria, biopsia prostática, cistoscopía, tamsulosina, finasteride, "primera vez", "primera consulta", "consulta de control", "control de próstata".';

function promptForModel(model) {
    return model === 'whisper-1' ? WHISPER_FALLBACK_PROMPT : VOCAB_PROMPT;
}

async function transcribeOpenAI(apiKey, rawBuf, contentType, model, timeoutMs) {
    const body = injectFields(rawBuf, contentType, model);
    const upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': contentType
        },
        body,
        duplex: 'half',
        signal: AbortSignal.timeout(timeoutMs)
    });
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok) {
        throw new Error(data?.error?.message || `Error de OpenAI (${upstream.status})`);
    }
    return data?.text || '';
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

// ═══════════════════════════════════════════════════════════════
// Gemini — transcripción contextual (requiere GEMINI_API_KEY en Vercel)
// ═══════════════════════════════════════════════════════════════

const GEMINI_TRANSCRIBE_PROMPT = `Transcribe este audio de forma VERBATIM (palabra por palabra), en español. Es una consulta médica de urología entre el Dr. Juan Carlos Riera y su paciente.

Contexto para transcribir correctamente los términos que escuches: es una consulta urológica. Vocabulario esperado: próstata, PSA total, PSA libre, PI-RADS, Gleason, HPB (hiperplasia prostática benigna), uroflujometría, Qmax, volumen premiccional, residuo postmiccional, goteo postmiccional, tacto rectal, creatinina, glicemia, testosterona, hemoglobina, nicturia, disuria, polaquiuria, hematuria, urgencia miccional, calibre miccional, infección urinaria, urocultivo, ecografía renal/vesical/prostática, cistoscopía, biopsia prostática, tamsulosina, finasteride, dutasteride. El médico suele decir al inicio si es "primera vez"/"primera consulta" o "consulta de control"/"control de próstata".

Reglas:
1. Transcribe TODO lo que se dice, incluyendo muletillas y repeticiones. No resumas, no omitas, no parafrasees.
2. Usa el contexto médico para escribir correctamente los términos clínicos aunque el audio sea difícil (p. ej., si suena parecido a "prórroga" en una consulta de próstata, es "próstata").
3. Las cifras se escriben en números cuando el hablante dicta valores ("cero coma nueve" → 0.9).
4. Si un fragmento es realmente ininteligible, escribe [inaudible] en su lugar. NUNCA inventes lo que no se oye.
5. Devuelve SOLO la transcripción, sin comentarios ni encabezados.`;

// Extrae los bytes del archivo de audio del multipart (el campo con filename=).
function extractFilePart(buf, contentType) {
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
    if (!boundaryMatch) return null;
    const boundary = '--' + (boundaryMatch[1] || boundaryMatch[2]);
    const bin = buf.toString('binary');
    const parts = bin.split(boundary);
    for (const part of parts) {
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd < 0) continue;
        const headers = part.slice(0, headerEnd);
        if (!/filename=/i.test(headers)) continue;
        let body = part.slice(headerEnd + 4);
        if (body.endsWith('\r\n')) body = body.slice(0, -2);
        const mimeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);
        return {
            bytes: Buffer.from(body, 'binary'),
            mime: mimeMatch ? mimeMatch[1].trim() : 'audio/mp4'
        };
    }
    return null;
}

// Normaliza el MIME al set que Gemini acepta (AAC/m4a de iPhone → audio/aac).
function geminiMime(mime) {
    const m = (mime || '').toLowerCase();
    if (m.includes('mp4') || m.includes('aac') || m.includes('m4a')) return 'audio/aac';
    if (m.includes('mp3') || m.includes('mpeg')) return 'audio/mp3';
    if (m.includes('wav')) return 'audio/wav';
    if (m.includes('flac')) return 'audio/flac';
    if (m.includes('ogg') || m.includes('opus')) return 'audio/ogg';
    return m || 'audio/aac';
}

async function transcribeGemini(filePart, timeoutMs) {
    const key = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_TRANSCRIBE_MODEL || 'gemini-2.5-flash';
    const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: GEMINI_TRANSCRIBE_PROMPT },
                        { inline_data: { mime_type: geminiMime(filePart.mime), data: filePart.bytes.toString('base64') } }
                    ]
                }],
                generationConfig: { temperature: 0 }
            }),
            signal: AbortSignal.timeout(timeoutMs)
        }
    );
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok) {
        throw new Error(data?.error?.message || `Error de Gemini (${upstream.status})`);
    }
    const text = (data?.candidates?.[0]?.content?.parts || [])
        .map(p => p.text || '')
        .join('')
        .trim();
    if (!text) throw new Error('Gemini devolvió una transcripción vacía');
    return text;
}

// ═══════════════════════════════════════════════════════════════
// Pasada de corrección fonética (solo para modelos acústicos de OpenAI)
// ═══════════════════════════════════════════════════════════════

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

// Best-effort: si falla o el resultado es sospechoso (vacío o con un largo
// muy distinto al original), se devuelve el texto crudo sin corregir en vez
// de bloquear la transcripción. Usa gpt-4o (no mini) — mejor comprensión
// médica para decidir qué corregir y qué dejar intacto.
async function correctTranscript(apiKey, rawText, timeoutMs) {
    try {
        const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                temperature: 0,
                messages: [
                    { role: 'system', content: CORRECTION_SYSTEM_PROMPT },
                    { role: 'user', content: rawText }
                ]
            }),
            signal: AbortSignal.timeout(timeoutMs)
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
