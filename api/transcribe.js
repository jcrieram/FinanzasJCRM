// Recibe audio multipart/form-data y devuelve { text }.
// El audio se reenvía a OpenAI en streaming y NO se persiste.
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
            return res.status(200).json({ text: data.text });
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
const VOCAB_PROMPT = 'Consulta urológica entre médico urólogo (Dr. Juan Carlos Riera) y paciente, en español. El médico suele indicar al inicio si es "primera vez", "primera consulta" o "consulta de control" / "control de próstata" — nunca dice "contrato". Siglas que el médico pronuncia letra por letra: PSA (P-S-A), PI-RADS (PI-RADS), HPB (H-P-B), HBP, RTU, ITU, IVU, BUN, LDL, HDL, TSH, AST, ALT, TGO, TGP, INR, TP, TPT, IPSS, AUA, EAU, MIBC, NMIBC. El estudio de flujo urinario se llama SIEMPRE "uroflujometría" (no "euroflujometría", no "euroflujo", no "fluometría"). Frases típicas del médico: "uroflujometría con Qmax de", "PSA total de", "PSA libre de", "porcentaje de PSA libre", "índice PSA libre/total", "relación PSA libre sobre total", "Gleason 6", "Gleason 7", "Gleason 8", "PI-RADS 2", "PI-RADS 3", "PI-RADS 4", "volumen premiccional de", "residuo postmiccional de", "próstata de X gramos", "cistoscopía", "citoscopía". Términos frecuentes: PSA total, PSA libre, PI-RADS 1, PI-RADS 2, PI-RADS 3, PI-RADS 4, PI-RADS 5, score de Gleason, biopsia transrectal, biopsia transperineal, creatinina, BUN, urea, hemoglobina, hematocrito, glucosa, glicemia, HbA1c, testosterona, sodio, potasio, calcio, colesterol, triglicéridos, transaminasas, bilirrubinas, leucocitos, plaquetas, examen de orina, urocultivo, ecografía renal, ecografía vesical, ecografía transrectal, ecografía prostática, tomografía, uroTAC, resonancia magnética, urografía, uroflujometría, Qmax, residuo postmiccional, volumen premiccional, volumen miccional, próstata, riñón, vejiga, uréter, hiperplasia prostática benigna, HPB, nicturia, disuria, polaquiuria, urgencia miccional, hematuria, calibre miccional, retención urinaria, incontinencia urinaria, infección urinaria, prostatitis, cistitis, pielonefritis, litiasis renal, urolitiasis, cáncer de próstata, biopsia prostática, tacto rectal, cistoscopía, tamsulosina, finasteride, dutasteride, sildenafil, tadalafil, ciprofloxacino, nitrofurantoína, fosfomicina, doxazosina, oxibutinina, solifenacina, mirabegron, bicalutamida, enzalutamida, leuprolide, RTU prostática, prostatectomía, nefrectomía, ureterolitotomía, litotricia, mililitros, centímetros cúbicos, nanogramos por mililitro.';

function injectFields(buf, contentType, model) {
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
    if (!boundaryMatch) return buf;
    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const text = buf.toString('binary');

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
        `${VOCAB_PROMPT}\r\n`;

    const closing = `--${boundary}--`;
    const idx = text.lastIndexOf(closing);
    if (idx < 0) return buf;
    const before = text.slice(0, idx);
    const after = text.slice(idx);
    return Buffer.from(before + extra + after, 'binary');
}
