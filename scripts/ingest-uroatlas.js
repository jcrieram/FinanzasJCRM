// scripts/ingest-uroatlas.js
//
// Ingesta única de los 82 PDFs urológicos a Supabase + pgvector.
// Para cada PDF: descarga del bucket -> extrae texto -> chunking ->
// embeddings con Voyage AI -> inserta en la tabla documents.
//
// Cómo correr (desde la raíz del repo):
//   SUPABASE_URL=...   SUPABASE_SERVICE_ROLE_KEY=...   VOYAGE_API_KEY=...   \
//     node scripts/ingest-uroatlas.js
//
// Reanudable: si el script se cae, la próxima vez salta los PDFs ya ingresados
// (los detecta por la columna documents.metadata->>'storage_path').

import { createClient } from '@supabase/supabase-js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const BUCKET = 'uroatlas-sources';

const FOLDERS = {
    'eau-pocket':    { source: 'EAU-Pocket',      language: 'en' },
    'eau-full':      { source: 'EAU',              language: 'en' },
    'aua-non-onc':   { source: 'AUA-Non-Onc',     language: 'en' },
    'aua-onc':       { source: 'AUA-Onc',          language: 'en' },
    'libros':        { source: 'Libros',           language: 'en' },
    'imagenologia':  { source: 'Imagenología',     language: 'en' },
    'uro-general':   { source: 'Uro-General',      language: 'en' }
};

const CHUNK_SIZE = 1200;     // caracteres aprox; ~300 tokens
const CHUNK_OVERLAP = 150;   // overlap para no cortar conceptos
const EMBED_BATCH = 64;      // Voyage soporta hasta 128, vamos conservador
const VOYAGE_MODEL = 'voyage-3';

function need(name) {
    const v = process.env[name];
    if (!v) { console.error(`✗ Falta env var: ${name}`); process.exit(1); }
    return v;
}

const supa = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false }
});
const VOYAGE_KEY = need('VOYAGE_API_KEY');

// ─────────────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────────────

async function extractPdfText(buffer) {
    const uint8 = new Uint8Array(buffer);
    const loadingTask = getDocument({
        data: uint8,
        disableFontFace: true,
        useSystemFonts: false,
        verbosity: 0,
        isEvalSupported: false
    });
    const pdf = await loadingTask.promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        try {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items
                .filter(it => 'str' in it)
                .map(it => it.str)
                .join(' ');
            pages.push(pageText);
            page.cleanup();
        } catch (e) {
            // Página corrupta, continuamos con el resto.
        }
    }
    await pdf.destroy();
    return pages.join('\n').trim();
}

function chunkText(text) {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= CHUNK_SIZE) return cleaned.length > 50 ? [cleaned] : [];
    const chunks = [];
    let i = 0;
    const MAX_CHUNKS = 50000; // safety net: ningún PDF razonable produce más
    while (i < cleaned.length && chunks.length < MAX_CHUNKS) {
        let end = Math.min(i + CHUNK_SIZE, cleaned.length);
        if (end < cleaned.length) {
            const slice = cleaned.slice(i, end);
            const lastPunct = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('? '), slice.lastIndexOf('! '));
            if (lastPunct > CHUNK_SIZE * 0.6) end = i + lastPunct + 1;
        }
        chunks.push(cleaned.slice(i, end).trim());
        if (end >= cleaned.length) break; // ya cubrimos todo el texto
        const next = end - CHUNK_OVERLAP;
        i = next > i ? next : end; // si el overlap nos dejaría en el mismo lugar, avanzamos sin overlap
    }
    return chunks.filter(c => c.length > 50);
}

async function voyageEmbed(texts, attempt = 0) {
    const MAX_ATTEMPTS = 8;
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${VOYAGE_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ input: texts, model: VOYAGE_MODEL, input_type: 'document' })
    });
    if (res.status === 429 || res.status === 503) {
        if (attempt >= MAX_ATTEMPTS) {
            const err = await res.text();
            throw new Error(`Voyage error ${res.status} (después de ${MAX_ATTEMPTS} intentos): ${err}`);
        }
        // Backoff exponencial: 5s, 10s, 20s, 40s, 60s, 60s, 60s, 60s
        const wait = Math.min(5000 * Math.pow(2, attempt), 60000);
        process.stdout.write(`\r  ⏳ rate limit (429), esperando ${wait / 1000}s y reintentando…   `);
        await new Promise(r => setTimeout(r, wait));
        return voyageEmbed(texts, attempt + 1);
    }
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Voyage error ${res.status}: ${err}`);
    }
    const data = await res.json();
    return data.data.map(d => d.embedding);
}

async function alreadyIngested(storagePath) {
    const { count, error } = await supa
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .filter('metadata->>storage_path', 'eq', storagePath);
    if (error) throw error;
    return (count || 0) > 0;
}

async function listFolder(folder) {
    const { data, error } = await supa.storage.from(BUCKET).list(folder, {
        limit: 1000,
        sortBy: { column: 'name', order: 'asc' }
    });
    if (error) throw error;
    return (data || []).filter(f => f.name && f.name.toLowerCase().endsWith('.pdf'));
}

async function downloadPdf(folder, name) {
    const path = `${folder}/${name}`;
    let data, error;
    try {
        ({ data, error } = await supa.storage.from(BUCKET).download(path));
    } catch (e) {
        throw new Error(`Storage download failed for ${path}: ${e.message}`);
    }
    if (error) throw new Error(`Storage error for ${path}: ${error.message || JSON.stringify(error)}`);
    if (!data) throw new Error(`Storage returned empty data for ${path}`);
    try {
        const ab = await data.arrayBuffer();
        return Buffer.from(ab);
    } catch (e) {
        throw new Error(`arrayBuffer conversion failed for ${path}: ${e.message}`);
    }
}

async function processPdf(folder, fileName, meta) {
    const storagePath = `${folder}/${fileName}`;
    if (await alreadyIngested(storagePath)) {
        console.log(`  ↷ ya ingresado (saltando)`);
        return { skipped: true, chunks: 0 };
    }

    const buf = await downloadPdf(folder, fileName);
    let text = '';
    try {
        text = await extractPdfText(buf);
    } catch (e) {
        console.log(`  ✗ no se pudo extraer texto: ${e.message}`);
        return { skipped: false, chunks: 0, error: e.message };
    }

    if (!text || text.length < 100) {
        console.log(`  ⚠ PDF sin texto extraíble (${text.length} chars)`);
        return { skipped: false, chunks: 0 };
    }

    const chunks = chunkText(text);
    if (!chunks.length) return { skipped: false, chunks: 0 };

    let inserted = 0;
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
        const batch = chunks.slice(i, i + EMBED_BATCH);
        const embeddings = await voyageEmbed(batch);
        const rows = batch.map((content, j) => ({
            source: meta.source,
            guideline_name: fileName.replace(/\.pdf$/i, ''),
            page: null,
            section: null,
            content,
            embedding: embeddings[j],
            language: meta.language,
            metadata: { storage_path: storagePath, total_chunks: chunks.length, chunk_index: i + j }
        }));
        const { error } = await supa.from('documents').insert(rows);
        if (error) throw new Error(`Insert error: ${error.message}`);
        inserted += rows.length;
        process.stdout.write(`\r  → ${inserted}/${chunks.length} chunks`);
    }
    process.stdout.write('\n');
    return { skipped: false, chunks: inserted };
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────

(async () => {
    const startedAt = Date.now();
    let totalFiles = 0, totalChunks = 0, totalSkipped = 0, totalErrors = 0;

    console.log('UroAtlas ingest — iniciando');
    console.log(`Bucket: ${BUCKET}`);
    console.log('');

    for (const [folder, meta] of Object.entries(FOLDERS)) {
        console.log(`\n=== ${folder} (${meta.source}) ===`);
        const files = await listFolder(folder);
        console.log(`  ${files.length} PDFs encontrados`);

        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            console.log(`\n[${folder} ${i + 1}/${files.length}] ${f.name} (${(f.metadata?.size / 1024 / 1024).toFixed(1) || '?'} MB)`);
            try {
                const r = await processPdf(folder, f.name, meta);
                totalFiles++;
                totalChunks += r.chunks;
                if (r.skipped) totalSkipped++;
            } catch (e) {
                totalErrors++;
                console.log(`  ✗ ERROR: ${e.message}`);
                if (e.stack) {
                    const trace = e.stack.split('\n').slice(0, 4).join('\n    ');
                    console.log(`    ${trace}`);
                }
            }
        }
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
    console.log('\n══════════════════════════════════════');
    console.log(`Listo en ${elapsed}s`);
    console.log(`PDFs procesados: ${totalFiles}  (saltados: ${totalSkipped}, errores: ${totalErrors})`);
    console.log(`Chunks insertados: ${totalChunks}`);
    console.log('══════════════════════════════════════');
})();
