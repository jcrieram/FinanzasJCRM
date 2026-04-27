// Recibe audio multipart/form-data y devuelve { text }.
// El audio se reenvía a OpenAI Whisper en streaming y NO se persiste.

export const config = {
    api: { bodyParser: false },
    maxDuration: 60
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'OPENAI_API_KEY no configurada' });
    }

    const requiredPin = process.env.CONSULTA_PIN;
    if (requiredPin && req.headers['x-consulta-pin'] !== requiredPin) {
        return res.status(401).json({ error: 'PIN inválido' });
    }

    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
        return res.status(400).json({ error: 'Se esperaba multipart/form-data' });
    }

    try {
        const upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': contentType
            },
            body: await streamToBuffer(req),
            duplex: 'half'
        });

        const data = await upstream.json();
        if (!upstream.ok) {
            return res.status(upstream.status).json({ error: data.error?.message || 'Error de OpenAI' });
        }
        return res.status(200).json({ text: data.text });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}

async function streamToBuffer(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buf = Buffer.concat(chunks);
    // Para Whisper hay que adjuntar 'model' y 'language' al multipart.
    // Si el cliente no los envió, los inyectamos.
    return injectFields(buf, req.headers['content-type']);
}

function injectFields(buf, contentType) {
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
    if (!boundaryMatch) return buf;
    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const text = buf.toString('binary');
    if (text.includes('name="model"')) return buf;

    const extra =
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="model"\r\n\r\n` +
        `whisper-1\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="language"\r\n\r\n` +
        `es\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
        `json\r\n`;

    const closing = `--${boundary}--`;
    const idx = text.lastIndexOf(closing);
    if (idx < 0) return buf;
    const before = text.slice(0, idx);
    const after = text.slice(idx);
    return Buffer.from(before + extra + after, 'binary');
}
