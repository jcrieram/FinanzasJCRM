// /api/uroatlas/query — pipeline RAG completo:
// 1) embedding del caso clínico con Voyage AI
// 2) retrieval de top-k chunks desde pgvector (función match_documents)
// 3) Claude Sonnet 4.6 con system prompt clínico + chunks + caso
// 4) devuelve { response, citations, retrieved }

import { authenticate, getServiceClient } from '../../lib/auth.js';

export const config = { maxDuration: 60 };

const VOYAGE_MODEL = 'voyage-3';
const CLAUDE_MODEL = 'claude-sonnet-4-6';
const TOP_K = 8;

const SYSTEM_PROMPT = `Eres un asistente urológico experto que asiste al Dr. Juan Carlos Riera M. dándole una "segunda opinión" basada exclusivamente en los fragmentos de guidelines AUA, EAU y libros de urología que se te proporcionan como contexto.

REGLAS INVIOLABLES:
1. Solo usa información presente en los fragmentos del CONTEXTO. Si la información no está, dilo explícitamente con la frase "Los fragmentos disponibles no cubren este punto" — no inventes ni completes con conocimiento general.
2. Cada afirmación clínica relevante debe llevar una cita numérica al final, formato [1], [2], etc., haciendo referencia al chunk usado. Numeración secuencial empezando en [1] para la primera fuente que cites.
3. Responde en español, con terminología médica precisa y oraciones cortas. NO uses lenguaje narrativo ("el paciente nos cuenta", "es importante señalar"). Estilo de consola clínica, no cuento.
4. NUNCA recomiendes medicamentos, dosis, conductas o estudios que no estén respaldados por los fragmentos.

ESTRUCTURA DE RESPUESTA (en este orden, omitiendo secciones que no apliquen):

1. ANÁLISIS DEL CASO
Una o dos oraciones técnicas sobre el problema clínico planteado.

2. EVIDENCIA RELEVANTE
Bullet points con los hallazgos de las guidelines aplicables al caso, con citas [n].

3. RECOMENDACIONES
Bullet points con las conductas/estudios/tratamientos sugeridos según las guidelines, con citas [n] y precisando dosis o duración cuando los fragmentos las den.

4. BANDERAS ROJAS (solo si los fragmentos las describen)
Cualquier alarma o criterio de derivación urgente, con citas [n].

5. LIMITACIONES
Si el caso del médico tiene aspectos que los fragmentos no cubren, dilo explícitamente. Si necesitas más datos del paciente para una opinión completa, especifica cuáles.

Sé conciso y directo. El médico es urólogo, no necesita explicaciones básicas.`;

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

async function callClaude(systemPrompt, userMessage, apiKey) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            model: CLAUDE_MODEL,
            max_tokens: 1500,
            temperature: 0.2,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }]
        })
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Claude error ${res.status}: ${err}`);
    }
    const data = await res.json();
    return data.content?.[0]?.text || '';
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
    if (!clinicalText) return res.status(400).json({ error: 'Falta clinical_text' });
    if (clinicalText.length > 5000) return res.status(400).json({ error: 'Caso demasiado largo (máx 5000 chars)' });

    try {
        // 1) Embedding del caso
        const queryEmbedding = await voyageEmbedQuery(clinicalText, voyageKey);

        // 2) Retrieval con pgvector
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

        // 3) Armar contexto y citas para Claude
        const contextBlocks = chunks.map((c, i) => {
            const tag = `[${i + 1}]`;
            const ref = `${c.source} — ${c.guideline_name || 'sin nombre'}${c.page ? `, p.${c.page}` : ''}`;
            return `${tag} ${ref}\n${c.content}`;
        }).join('\n\n────────\n\n');

        const userMessage = `CONTEXTO (fragmentos recuperados de las guidelines, ordenados por relevancia):\n\n${contextBlocks}\n\n────────────────────\n\nCASO CLÍNICO DEL MÉDICO:\n\n${clinicalText}\n\n────────────────────\n\nRedacta tu opinión siguiendo la estructura indicada en el system prompt. Recuerda citar [1], [2], etc.`;

        // 4) Llamada a Claude
        const responseText = await callClaude(SYSTEM_PROMPT, userMessage, anthropicKey);

        // 5) Construir lista de citas para la UI (todas las recuperadas, la UI puede mostrar solo las que aparezcan en el texto si quiere)
        const citations = chunks.map((c, i) => ({
            n: i + 1,
            source: c.source,
            guideline_name: c.guideline_name,
            page: c.page,
            section: c.section,
            similarity: c.similarity,
            preview: (c.content || '').slice(0, 220)
        }));

        return res.status(200).json({
            response: responseText,
            citations,
            retrieved: chunks.length
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
