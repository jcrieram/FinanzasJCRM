// /api/uroatlas/cases — operaciones sobre casos del usuario.
// GET  /api/uroatlas/cases       -> lista los últimos 50 casos del usuario
// GET  /api/uroatlas/cases?id=X  -> devuelve el caso completo (incluye chunks)
// POST /api/uroatlas/cases       -> guarda feedback { case_id, rating, comment? }

import { authenticate, getServiceClient } from '../../lib/auth.js';

export const config = { maxDuration: 15 };

const VOYAGE_MODEL = 'voyage-3';

async function voyageEmbed(text, apiKey) {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: text, model: VOYAGE_MODEL, input_type: 'document' })
    });
    if (!res.ok) throw new Error(`Voyage error ${res.status}`);
    const data = await res.json();
    return data.data[0].embedding;
}

async function handleFeedback(req, res, auth) {
    let body;
    try { body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); }
    catch { return res.status(400).json({ error: 'JSON inválido' }); }

    const { case_id, rating, comment } = body;
    if (!case_id) return res.status(400).json({ error: 'case_id requerido' });
    if (rating !== 1 && rating !== -1) return res.status(400).json({ error: 'rating debe ser 1 o -1' });

    const commentText = (comment || '').trim();

    let embedding = null;
    if (commentText.length > 10) {
        const voyageKey = process.env.VOYAGE_API_KEY;
        if (voyageKey) {
            try { embedding = await voyageEmbed(commentText, voyageKey); }
            catch (e) { console.warn('Voyage embed para feedback falló:', e.message); }
        }
    }

    const supa = getServiceClient();
    const { error } = await supa.from('case_feedback').insert({
        case_id,
        user_id: auth.user.id,
        rating,
        comment: commentText || null,
        embedding
    });
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true });
}

async function handleGet(req, res, auth) {
    const supa = getServiceClient();
    const userId = auth.user.id;
    const id = req.query?.id;

    if (id) {
        const { data, error } = await supa
            .from('cases')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();
        if (error) {
            if (error.code === 'PGRST116') return res.status(404).json({ error: 'Caso no encontrado' });
            throw error;
        }
        return res.status(200).json({ case: data });
    }

    const { data, error } = await supa
        .from('cases')
        .select('id, clinical_text, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
    if (error) throw error;
    return res.status(200).json({ cases: data || [] });
}

async function handleDelete(req, res, auth) {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id requerido' });
    const supa = getServiceClient();
    const { error } = await supa
        .from('cases')
        .delete()
        .eq('id', id)
        .eq('user_id', auth.user.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
    const auth = await authenticate(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    if (!auth.user) return res.status(401).json({ error: 'Auth con JWT requerida (no PIN)' });

    try {
        if (req.method === 'GET') return await handleGet(req, res, auth);
        if (req.method === 'POST') return await handleFeedback(req, res, auth);
        if (req.method === 'DELETE') return await handleDelete(req, res, auth);
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
