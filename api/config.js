// Devuelve la configuración pública para que el frontend instancie
// el cliente de Supabase sin hardcodear credenciales en el HTML.
//
// SEGURIDAD: este endpoint es público, así que SOLO debe entregar una clave
// pública (anon o publishable). Si la variable SUPABASE_ANON_KEY estuviera mal
// configurada (p. ej. con la service_role), la ignoramos y usamos la anon
// pública conocida — así nunca se expone una credencial de administrador y el
// login sigue funcionando. (La clave anon es pública por diseño.)

export const config = { maxDuration: 5 };

// Clave anon PÚBLICA del proyecto (role: "anon"). Es segura de exponer.
const ANON_FALLBACK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqb211aWpwbXVqY3N0eGNqbXN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NDYwODIsImV4cCI6MjA5MzMyMjA4Mn0.qCuzOvLxpPqtnBXOd_Se10KUPnP9tyOhOZjlkS3Iad4';
const SUPABASE_URL_FALLBACK = 'https://tjomuijpmujcstxcjmsz.supabase.co';

// true solo si la clave es pública: publishable (sb_publishable_…) o un JWT
// con role "anon". Nunca para service_role u otros.
function isPublicKey(k) {
    if (!k || typeof k !== 'string') return false;
    if (k.startsWith('sb_publishable_')) return true;
    const parts = k.split('.');
    if (parts.length !== 3) return false;
    try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        return payload.role === 'anon';
    } catch {
        return false;
    }
}

export default function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const url = process.env.SUPABASE_URL || SUPABASE_URL_FALLBACK;
    const envKey = process.env.SUPABASE_ANON_KEY;
    const anon = isPublicKey(envKey) ? envKey : ANON_FALLBACK;

    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
    return res.status(200).json({ supabase_url: url, supabase_anon_key: anon });
}
