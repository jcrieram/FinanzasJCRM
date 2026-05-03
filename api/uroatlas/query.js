// /api/uroatlas/query — pipeline RAG completo:
// 1) embedding del caso clínico con Voyage AI
// 2) retrieval de top-k chunks desde pgvector (función match_documents)
// 3) Claude Sonnet 4.6 con system prompt clínico + chunks + caso
// 4) devuelve { response, citations, retrieved }

import { authenticate, getServiceClient } from '../../lib/auth.js';

export const config = {
    maxDuration: 60,
    api: { bodyParser: { sizeLimit: '20mb' } }
};

const VOYAGE_MODEL = 'voyage-3';
const CLAUDE_MODEL = 'claude-sonnet-4-6';
const TOP_K = 8;

const SYSTEM_PROMPT = `Eres un asistente urológico experto que asiste al Dr. Juan Carlos Riera M. con una segunda opinión clínica basada en los fragmentos de guidelines AUA, EAU y libros de urología que se te proporcionan como contexto, y en las imágenes médicas que el médico te envíe.

REGLAS INVIOLABLES:
1. Solo usa información presente en los fragmentos del CONTEXTO. Si la información no está, dilo explícitamente. No completes con conocimiento general.
2. Cada afirmación clínica debe llevar una cita numérica al final, formato [1], [2], etc.
3. NUNCA recomiendes medicamentos, dosis, conductas o estudios sin respaldo en los fragmentos.
4. Si recibes UNA O MÁS IMÁGENES junto con el caso, ES OBLIGATORIO que las analices clínicamente y dediques una sección "DESCRIPCIÓN DE IMAGEN" antes del análisis. NUNCA las ignores. Describe lo que ves: modalidad (TAC, RM, ecografía), órgano evaluado, hallazgos relevantes (lesiones, dimensiones, intensidad, realce), y su impacto en la conducta del caso. No inventes hallazgos que no veas.

FORMATO OBLIGATORIO DE LA RESPUESTA:
- NO uses headers de markdown (nada de ###, ##, #). Para los nombres de secciones usa MAYÚSCULAS sueltas en línea propia, sin numeración ni símbolos.
- NO uses separadores horizontales (nada de --- ni ___).
- NO uses negritas (** **) ni cursivas.
- Sin emojis.
- Oraciones técnicas, terminología médica precisa, lenguaje impersonal. Evita "el paciente nos cuenta", "es importante señalar", "cabe destacar".

ESTRUCTURA (en este orden, omitiendo secciones que no apliquen):

ANÁLISIS DEL CASO
Un único párrafo integrando el cuadro clínico globalmente — qué problema urológico se está planteando y cómo se conectan los hallazgos entre sí. NO listes los signos y síntomas uno por uno; intégralos en un razonamiento conjunto.

DESCRIPCIÓN DE IMAGEN (solo si el médico envió imagen)
Una a dos oraciones clínicas describiendo lo que se ve y su relevancia para el caso.

EVIDENCIA Y RECOMENDACIONES
Tres a seis bullets cortos. Cada bullet conecta una guideline con el caso e incluye la conducta sugerida con dosis o duración cuando los fragmentos las den. Cita [n].

BANDERAS ROJAS
Solo si las guidelines las describen para este caso. Conciso, máximo tres bullets. Cita [n]. Si no aplican, omite la sección entera.

LIMITACIONES
Aspectos del caso que los fragmentos disponibles no cubren, y datos adicionales del paciente que harían falta para una opinión más completa. Conciso.

Sé directo y técnico. El destinatario es urólogo experto, no necesita explicaciones básicas. No repitas literalmente la información que el médico ya te dio en el caso.`;

async function voyageEmbedQuery(text, apiKey) {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ input: text, model: VOYAGE_MODEL, input_type: 'query' })
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Voyage error ${res.status}: ${err}`);
    }
    const data = await res.json();
    return data.data[0].embedding;
}

// content puede ser un string (solo texto) o array de bloques
// (texto + imágenes) según la API Messages de Anthropic.
async function callClaude(systemPrompt, content, apiKey, opts = {}) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            model: CLAUDE_MODEL,
            max_tokens: opts.maxTokens || 1500,
            temperature: opts.temperature ?? 0.2,
            system: systemPrompt,
            messages: [{ role: 'user', content }]
        })
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Claude error ${res.status}: ${err}`);
    }
    const data = await res.json();
    return data.content?.[0]?.text || '';
}

// Convierte una data URL (data:image/png;base64,...) en el bloque de
// imagen que espera la API de Anthropic.
function dataUrlToImageBlock(dataUrl) {
    const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/i.exec(dataUrl);
    if (!m) return null;
    return {
        type: 'image',
        source: { type: 'base64', media_type: m[1].toLowerCase().replace('image/jpg', 'image/jpeg'), data: m[2] }
    };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const auth = await authenticate(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const voyageKey = process.env.VOYAGE_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!voyageKey || !anthropicKey) {
        return res.status(500).json({ error: 'Missing VOYAGE_API_KEY or ANTHROPIC_API_KEY' });
    }

    let body;
    try { body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); }
    catch { return res.status(400).json({ error: 'JSON inválido' }); }

    const clinicalText = (body.clinical_text || '').trim();
    const imagesIn = Array.isArray(body.images) ? body.images : [];
    if (!clinicalText && imagesIn.length === 0) {
        return res.status(400).json({ error: 'Envía un caso clínico, una imagen, o ambos' });
    }
    if (clinicalText.length > 5000) return res.status(400).json({ error: 'Caso demasiado largo (máx 5000 chars)' });
    if (imagesIn.length > 4) return res.status(400).json({ error: 'Máximo 4 imágenes por consulta' });

    // Convertir imágenes a bloques válidos para Claude.
    const imageBlocks = imagesIn
        .map(dataUrlToImageBlock)
        .filter(Boolean);
    if (imagesIn.length && !imageBlocks.length) {
        return res.status(400).json({ error: 'Imágenes inválidas (formato no soportado)' });
    }

    try {
        // 1) Determinar la query para retrieval.
        // - Si hay texto: úsalo directo.
        // - Si solo hay imagen: pedí a Claude que la describa en una frase corta y úsala como query.
        let retrievalQuery = clinicalText;
        if (!retrievalQuery && imageBlocks.length) {
            const describeContent = [
                ...imageBlocks,
                { type: 'text', text: 'Describe la imagen en UNA frase corta (máx 25 palabras) en términos clínicos urológicos, mencionando órgano, modalidad y hallazgos principales. Solo la frase, sin nada más.' }
            ];
            retrievalQuery = (await callClaude(
                'Eres un radiólogo urológico. Respondes con una sola frase corta.',
                describeContent,
                anthropicKey,
                { maxTokens: 80, temperature: 0.1 }
            )).trim();
        }

        // 2) Embedding de la query
        const queryEmbedding = await voyageEmbedQuery(retrievalQuery, voyageKey);

        // 3) Retrieval con pgvector
        const supa = getServiceClient();
        const { data: chunks, error: matchError } = await supa.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_count: TOP_K
        });
        if (matchError) throw new Error(`Retrieval error: ${matchError.message}`);
        if (!chunks || !chunks.length) {
            return res.status(200).json({
                response: 'No se encontraron fragmentos relevantes en la base de guidelines para este caso. Verifica que el caso tenga información clínica suficiente o reformula la consulta.',
                citations: [],
                retrieved: 0
            });
        }

        // 4) Armar contexto y prompt para Claude
        const contextBlocks = chunks.map((c, i) => {
            const tag = `[${i + 1}]`;
            const ref = `${c.source} — ${c.guideline_name || 'sin nombre'}${c.page ? `, p.${c.page}` : ''}`;
            return `${tag} ${ref}\n${c.content}`;
        }).join('\n\n────────\n\n');

        const caseSection = clinicalText
            ? `CASO CLÍNICO DEL MÉDICO:\n\n${clinicalText}`
            : `CASO CLÍNICO: el médico envió únicamente la imagen adjunta y solicita una opinión sobre lo que se observa.`;

        const textPrompt = `CONTEXTO (fragmentos recuperados de las guidelines, ordenados por relevancia):\n\n${contextBlocks}\n\n────────────────────\n\n${caseSection}\n\n────────────────────\n\nRedacta tu opinión siguiendo la estructura del system prompt. Recuerda: sin headers de markdown, sin separadores horizontales, análisis global. Cita [1], [2], etc.`;

        const messageContent = imageBlocks.length
            ? [...imageBlocks, { type: 'text', text: textPrompt }]
            : textPrompt;

        // 5) Llamada a Claude (con o sin imágenes)
        const responseText = await callClaude(SYSTEM_PROMPT, messageContent, anthropicKey);

        // 6) Construir lista de citas para la UI
        const citations = chunks.map((c, i) => ({
            n: i + 1,
            source: c.source,
            guideline_name: c.guideline_name,
            page: c.page,
            section: c.section,
            similarity: c.similarity,
            preview: (c.content || '').slice(0, 220)
        }));

        // 7) Persistir el caso en la tabla `cases` (si el usuario está autenticado vía JWT, no PIN).
        let caseId = null;
        if (auth.user) {
            const { data: inserted, error: insertError } = await supa
                .from('cases')
                .insert({
                    user_id: auth.user.id,
                    clinical_text: clinicalText || '(consulta solo con imagen)',
                    image_urls: [], // por ahora no persistimos las imágenes; solo el texto
                    response: responseText,
                    retrieved_chunks: citations
                })
                .select('id')
                .single();
            if (!insertError && inserted) caseId = inserted.id;
        }

        return res.status(200).json({
            id: caseId,
            response: responseText,
            citations,
            retrieved: chunks.length,
            images_received: imageBlocks.length
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
