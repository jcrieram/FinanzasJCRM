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
const TOP_K = 15;

const SYSTEM_PROMPT = `Eres un urólogo senior que asiste al Dr. Juan Carlos Riera M. con una segunda opinión sobre los casos que te presenta. Tu razonamiento se fundamenta en los fragmentos de guidelines AUA, EAU y libros de urología que se te proporcionan como CONTEXTO, y en las imágenes médicas si las hay.

OBJETIVO: opinión BREVE, PUNTUAL y ACCIONABLE. El doctor tiene la consulta en curso y necesita decidir rápido. Apunta a 250-400 palabras totales. Sin párrafos largos, sin repetir lo que el médico ya escribió, sin teoría innecesaria.

REGLAS INVIOLABLES:
1. Solo recomiendas conductas, fármacos, dosis o estudios respaldados por los fragmentos del CONTEXTO. Si algo clínicamente relevante no está respaldado, dilo o márcalo como "[práctica clínica establecida]" cuando sea conocimiento fisiopatológico básico (ej. ley de Frank-Starling, ajuste PSA bajo 5-ARI).
2. Cada afirmación clínica relevante (umbrales, conductas, fármacos, dosis, contraindicaciones) lleva una cita [n] al final de la oración.
3. NUNCA inventes valores numéricos, dosis ni citas.
4. Si recibes una o más imágenes, una línea de descripción clínica al inicio. No las ignoras.

TONO Y VOZ:
Primera persona, autoritativo, como un colega que da la opinión en el pasillo. Sin frases de apertura tipo "Analizando este caso...", sin "Mi conducta se fundamenta en...". Sin lenguaje narrativo ("el paciente nos cuenta", "es importante destacar"). Sin saludos ni cierres. Sin emojis. Sin separadores horizontales (---).

FORMATO PERMITIDO:
- **Negritas** para lead-ins y los dos subtítulos.
- Numeración 1., 2., 3. solo en la sección de Conducta.
- NO uses headers de markdown (#, ##).

ESTRUCTURA OBLIGATORIA — exactamente dos bloques:

**Análisis:**
2 a 4 oraciones que identifican el problema central, el hallazgo clave que define el plan y el diagnóstico de trabajo. Incluye solo los umbrales o cálculos críticos que apliquen al caso (ej. Qmax, BVE, ajuste PSA bajo 5-ARI, eficiencia de vaciado). Cita [n] donde corresponda. Si hay imagen, la describes en la primera oración. Si hay un riesgo o contraindicación que cambia todo, lo dices acá en una frase.

**Conducta:**
1. **[Acción puntual]:** [justificación breve, una línea][n]
2. **[Acción puntual]:** [justificación breve][n]
3. **[Estudio o seguimiento]:** [para qué][n]
(Máximo 5 puntos. Si hay alerta farmacológica o bandera roja, va como punto numerado.)

Si los fragmentos no cubren algo clínicamente importante, agrega una línea al final: "Los fragmentos no cubren X."

NO incluyas:
- Reformulación del caso clínico ("Nos encontramos ante un paciente de…").
- Secciones tipo "Interpretación fisiopatológica" como bloque aparte — integra el razonamiento en una frase del Análisis solo si cambia el plan.
- "Educación al paciente" como punto, salvo que sea parte crítica de la conducta.
- Listas largas de diagnósticos diferenciales.`;

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
            max_tokens: opts.maxTokens || 900,
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

// Traduce el texto clínico al inglés para mejorar el retrieval contra
// documentos en inglés. Usa haiku (rápido y barato). Falla silenciosamente.
async function translateToEnglish(text, apiKey) {
    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 800,
                temperature: 0,
                system: 'Translate the clinical case to medical English. Preserve all values, drug names, diagnoses and lab results exactly. Return ONLY the translated text, nothing else.',
                messages: [{ role: 'user', content: text }]
            })
        });
        if (!res.ok) return text;
        const data = await res.json();
        return data.content?.[0]?.text?.trim() || text;
    } catch {
        return text;
    }
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
        const supa = getServiceClient();

        // Rate limit: 5 consultas cada 10 min por usuario (solo JWT).
        // Cuenta filas en la tabla `cases` (cada query inserta una).
        if (auth.user) {
            const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
            const { count } = await supa
                .from('cases')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', auth.user.id)
                .gte('created_at', tenMinAgo);
            const RATE_LIMIT = 5;
            if (count !== null && count >= RATE_LIMIT) {
                res.setHeader('Retry-After', '600');
                return res.status(429).json({
                    error: `Límite alcanzado: ${RATE_LIMIT} consultas cada 10 minutos. Intenta de nuevo más tarde.`
                });
            }
        }

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

        // 2) Traducir al inglés para mejorar retrieval contra guidelines en inglés
        const retrievalQueryEn = await translateToEnglish(retrievalQuery, anthropicKey);

        // 3) Embedding de la query
        const queryEmbedding = await voyageEmbedQuery(retrievalQueryEn, voyageKey);

        // 4) Retrieval con pgvector
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

        // 5) Armar contexto y prompt para Claude
        const contextBlocks = chunks.map((c, i) => {
            const tag = `[${i + 1}]`;
            const ref = `${c.source} — ${c.guideline_name || 'sin nombre'}${c.page ? `, p.${c.page}` : ''}`;
            return `${tag} ${ref}\n${c.content}`;
        }).join('\n\n────────\n\n');

        // Recuperar correcciones previas del doctor para casos similares
        let correctionContext = '';
        if (auth.user) {
            try {
                const { data: corrections } = await supa.rpc('match_corrections', {
                    query_embedding: queryEmbedding,
                    target_user_id: auth.user.id,
                    match_count: 3
                });
                const relevant = (corrections || []).filter(c => c.rating === -1 && c.comment && c.similarity > 0.75);
                if (relevant.length) {
                    correctionContext = '\n\n────────\n\nCORRECCIONES DEL DOCTOR EN CASOS SIMILARES (considerar al redactar la opinión):\n'
                        + relevant.map(c => `• ${c.comment}`).join('\n');
                }
            } catch {
                // match_corrections aún no existe; se activa después de correr el SQL
            }
        }

        const caseSection = clinicalText
            ? `CASO CLÍNICO DEL MÉDICO:\n\n${clinicalText}`
            : `CASO CLÍNICO: el médico envió únicamente la imagen adjunta y solicita una opinión sobre lo que se observa.`;

        const textPrompt = `CONTEXTO (fragmentos recuperados de las guidelines, ordenados por relevancia):\n\n${contextBlocks}${correctionContext}\n\n────────────────────\n\n${caseSection}\n\n────────────────────\n\nRedacta tu opinión siguiendo la estructura del system prompt. Recuerda: sin headers de markdown, sin separadores horizontales, análisis global. Cita [1], [2], etc.`;

        const messageContent = imageBlocks.length
            ? [...imageBlocks, { type: 'text', text: textPrompt }]
            : textPrompt;

        // 6) Llamada a Claude (con o sin imágenes)
        const responseText = await callClaude(SYSTEM_PROMPT, messageContent, anthropicKey);

        // 7) Construir lista de citas para la UI
        const citations = chunks.map((c, i) => ({
            n: i + 1,
            source: c.source,
            guideline_name: c.guideline_name,
            page: c.page,
            section: c.section,
            similarity: c.similarity,
            preview: (c.content || '').slice(0, 220)
        }));

        // 8) Persistir el caso en la tabla `cases` (si el usuario está autenticado vía JWT, no PIN).
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
