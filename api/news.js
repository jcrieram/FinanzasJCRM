// Devuelve un resumen de 2-3 líneas de una noticia urológica reciente,
// usando el modelo de OpenAI con búsqueda web. Cacheado en CDN una hora
// para evitar llamadas repetidas.

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'OPENAI_API_KEY no configurada' });
    }

    // Si viene ?force=... el cliente quiere bypass del cache (otra noticia).
    const force = req.query?.force;
    if (!force) {
        // Cache en el edge de Vercel: 1 hora fresco, 10 min stale-while-revalidate.
        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
    } else {
        res.setHeader('Cache-Control', 'no-store');
    }

    const prompt = `Busca en internet una noticia o publicación científica urológica relevante de los últimos 7 días (puede ser de revistas como European Urology, Journal of Urology, BJUI; sociedades AUA, EAU, CAU; o medios especializados). Resume en 2 o 3 líneas en español lo más importante para un urólogo en consulta. No agregues introducción ni saludo. Al final entre paréntesis menciona la fuente y la fecha si la tienes. Si encuentras varias, elige la más impactante clínicamente.`;

    try {
        const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini-search-preview',
                messages: [{ role: 'user', content: prompt }],
                web_search_options: {}
            })
        });
        const data = await upstream.json();
        if (!upstream.ok) {
            return res.status(upstream.status).json({ error: data.error?.message || 'Error de OpenAI' });
        }
        const news = data.choices?.[0]?.message?.content?.trim() || '';
        return res.status(200).json({ news });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
