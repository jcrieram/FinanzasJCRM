// Devuelve un resumen de 2-3 líneas de una noticia urológica reciente,
// usando Claude (Anthropic) con búsqueda web. Cacheado en CDN una hora
// para evitar llamadas repetidas.
//
// Anti-abuso: la vista por defecto (sin ?force) se sirve cacheada en el
// edge — a lo sumo 1 llamada real a OpenAI por hora en todo el CDN, sea
// quien sea el visitante. El bypass de cache (?force, botón "Otra") es el
// único camino que genera una llamada por request, así que EXIGE sesión de
// Supabase: sin token válido no se puede forzar gasto.

import { authenticate } from '../lib/auth.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada' });
    }

    // Si viene ?force=... el cliente quiere bypass del cache (otra noticia).
    const force = req.query?.force;
    if (!force) {
        // Cache en el edge de Vercel: 1 hora fresco, 10 min stale-while-revalidate.
        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
    } else {
        // El bypass de cache solo para usuarios autenticados (no PIN).
        const auth = await authenticate(req);
        if (!auth.ok) {
            return res.status(auth.status).json({ error: 'Inicia sesión para ver más novedades' });
        }
        res.setHeader('Cache-Control', 'no-store');
    }

    const prompt = `Busca en internet una noticia o publicación científica urológica relevante de los últimos 7 días (puede ser de revistas como European Urology, Journal of Urology, BJUI; sociedades AUA, EAU, CAU; o medios especializados). Resume en 2 o 3 líneas en español lo más importante para un urólogo en consulta. No agregues introducción ni saludo. Al final entre paréntesis menciona la fuente y la fecha si la tienes. Si encuentras varias, elige la más impactante clínicamente.`;

    try {
        // Claude (Anthropic) con la herramienta integrada de búsqueda web.
        // Se usa el ecosistema que ya tiene créditos (antes se usaba OpenAI,
        // cuyo modelo de búsqueda fue deprecado y cuya cuenta quedó sin crédito).
        const upstream = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 600,
                tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
                messages: [{ role: 'user', content: prompt }]
            })
        });
        const data = await upstream.json();
        if (!upstream.ok) {
            return res.status(upstream.status).json({ error: data.error?.message || 'Error de Anthropic' });
        }
        // La respuesta trae bloques; concatenamos solo los de texto del asistente.
        const news = (data.content || [])
            .filter(b => b.type === 'text' && typeof b.text === 'string')
            .map(b => b.text)
            .join('')
            .trim();
        return res.status(200).json({ news: news || 'Sin resultados.' });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
