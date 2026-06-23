// scripts/supabase-health.js
//
// Diagnóstico rápido del proyecto Supabase de UroWorkNet. Verifica:
//   1. Conectividad básica (URL responde)
//   2. Que las extensiones, tablas y RPCs requeridas existan
//   3. Que el bucket de storage exista
//   4. Que los embeddings de documentos estén poblados
//
// Cómo correr:
//   SUPABASE_URL='https://tjomuijpmujcstxcjmsz.supabase.co' \
//   SUPABASE_SERVICE_ROLE_KEY='<service_role>' \
//     node scripts/supabase-health.js
//
// Salida: tabla con ✓ / ✗ por cada chequeo. Exit code != 0 si algo falla.

import { createClient } from '@supabase/supabase-js';

const NEED_TABLES = ['documents', 'cases', 'case_feedback', 'generated_documents'];
const NEED_RPCS = ['match_documents', 'match_corrections'];
const NEED_BUCKETS = ['uroatlas-sources'];

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
    console.error('✗ Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    process.exit(2);
}

const results = [];
function record(name, ok, detail = '') {
    results.push({ name, ok, detail });
    const mark = ok ? '✓' : '✗';
    const color = ok ? '\x1b[32m' : '\x1b[31m';
    console.log(`${color}${mark}\x1b[0m ${name.padEnd(40)} ${detail}`);
}

async function withTimeout(promise, ms, label) {
    let to;
    const timeout = new Promise((_, rej) => {
        to = setTimeout(() => rej(new Error(`timeout ${ms}ms en ${label}`)), ms);
    });
    try { return await Promise.race([promise, timeout]); }
    finally { clearTimeout(to); }
}

async function checkConnectivity() {
    try {
        const res = await withTimeout(fetch(`${url}/auth/v1/health`), 5000, 'auth/health');
        record('Conectividad Supabase (auth/health)', res.ok || res.status === 200, `HTTP ${res.status}`);
        return res.ok;
    } catch (e) {
        record('Conectividad Supabase (auth/health)', false, e.message);
        return false;
    }
}

async function checkRestEndpoint() {
    try {
        const res = await withTimeout(fetch(`${url}/rest/v1/`, {
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
        }), 5000, 'rest/v1');
        record('REST API alcanzable', res.status < 500, `HTTP ${res.status}`);
    } catch (e) {
        record('REST API alcanzable', false, e.message);
    }
}

async function checkTables(supa) {
    for (const t of NEED_TABLES) {
        try {
            const { count, error } = await withTimeout(
                supa.from(t).select('*', { count: 'exact', head: true }),
                5000, `tabla ${t}`
            );
            if (error) record(`Tabla "${t}"`, false, error.message);
            else record(`Tabla "${t}"`, true, `${count ?? 0} filas`);
        } catch (e) {
            record(`Tabla "${t}"`, false, e.message);
        }
    }
}

async function checkRpcs(supa) {
    // Embedding dummy de 1024 dimensiones (ceros) — el RPC debe responder
    // sin error aunque el resultado sea irrelevante.
    const zeros = new Array(1024).fill(0);
    try {
        const { error } = await withTimeout(
            supa.rpc('match_documents', { query_embedding: zeros, match_count: 1 }),
            8000, 'match_documents'
        );
        record('RPC match_documents', !error, error?.message || 'responde');
    } catch (e) {
        record('RPC match_documents', false, e.message);
    }

    try {
        const { error } = await withTimeout(
            supa.rpc('match_corrections', {
                query_embedding: zeros,
                target_user_id: '00000000-0000-0000-0000-000000000000',
                match_count: 1
            }),
            8000, 'match_corrections'
        );
        record('RPC match_corrections', !error, error?.message || 'responde');
    } catch (e) {
        record('RPC match_corrections', false, e.message);
    }
}

async function checkBuckets(supa) {
    try {
        const { data, error } = await withTimeout(
            supa.storage.listBuckets(), 5000, 'listBuckets'
        );
        if (error) {
            record('Listado de buckets', false, error.message);
            return;
        }
        const names = (data || []).map(b => b.name);
        for (const want of NEED_BUCKETS) {
            const has = names.includes(want);
            record(`Bucket "${want}"`, has, has ? 'existe' : 'NO existe');
        }
    } catch (e) {
        record('Listado de buckets', false, e.message);
    }
}

async function checkDocumentsPopulated(supa) {
    try {
        const { count, error } = await withTimeout(
            supa.from('documents').select('*', { count: 'exact', head: true }),
            5000, 'documents count'
        );
        if (error) {
            record('Documentos indexados', false, error.message);
            return;
        }
        const ok = (count || 0) > 100; // mínimo razonable
        record('Documentos indexados', ok, `${count} chunks ${ok ? '' : '(se esperan miles)'}`);
    } catch (e) {
        record('Documentos indexados', false, e.message);
    }
}

(async () => {
    console.log(`\nUroWorkNet Supabase health check`);
    console.log(`Proyecto: ${url}\n`);

    const live = await checkConnectivity();
    await checkRestEndpoint();

    if (!live) {
        console.log('\n\x1b[33m⚠  Proyecto no responde. Pasos a seguir:\x1b[0m');
        console.log('   1. Entrar a https://supabase.com/dashboard');
        console.log('   2. Si dice "paused" → click "Restore project" (free tier pausa por inactividad)');
        console.log('   3. Esperar 1-2 min y reintentar este script\n');
        process.exit(1);
    }

    const supa = createClient(url, serviceKey, { auth: { persistSession: false } });
    await checkTables(supa);
    await checkRpcs(supa);
    await checkBuckets(supa);
    await checkDocumentsPopulated(supa);

    const failed = results.filter(r => !r.ok);
    console.log(`\n${failed.length === 0 ? '\x1b[32m' : '\x1b[31m'}${results.length - failed.length}/${results.length} chequeos OK\x1b[0m`);

    if (failed.length) {
        console.log('\nFallaron:');
        failed.forEach(f => console.log(`  ✗ ${f.name} — ${f.detail}`));
        console.log('\nVer supabase/README.md para el runbook de recuperación.');
        process.exit(1);
    }

    console.log('\nTodo OK.');
})();
