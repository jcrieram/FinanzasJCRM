// Endpoint de consulta a UroAtlas. Fase 1: solo verifica auth y devuelve
// un mensaje placeholder. Fase 3 implementa el pipeline RAG completo
// (embedding -> retrieval pgvector -> Claude Sonnet con citas).

import { authenticate } from '../../lib/auth.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const auth = await authenticate(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    return res.status(200).json({
        response:
            'UroAtlas está en construcción. La Fase 1 (auth + UI) está activa. ' +
            'La Fase 2 ingiere los 82 PDFs como vectores en pgvector. ' +
            'La Fase 3 conecta el caso con Claude Sonnet 4.6 y devuelve la opinión con citas.\n\n' +
            'Tu caso fue recibido correctamente. Cuando esté lista la Fase 3, ' +
            'esta misma interfaz te devolverá la opinión clínica basada en guidelines.'
    });
}
