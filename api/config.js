// Devuelve la configuración pública para que el frontend instancie
// el cliente de Supabase sin hardcodear credenciales en el HTML.

export const config = { maxDuration: 5 };

export default function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const url = process.env.SUPABASE_URL;
    const anon = process.env.SUPABASE_ANON_KEY;
    if (!url || !anon) {
        return res.status(500).json({ error: 'Supabase env vars no configuradas' });
    }
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
    return res.status(200).json({ supabase_url: url, supabase_anon_key: anon });
}
