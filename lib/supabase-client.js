// Helper de cliente Supabase para el frontend.
// Se importa con: <script type="module" src="/lib/supabase-client.js"></script>
// O bien: import { getSupabase, requireAuth, signOut } from '/lib/supabase-client.js'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

let _client = null;
let _initPromise = null;

export async function getSupabase() {
    if (_client) return _client;
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
        const res = await fetch('/api/config');
        if (!res.ok) throw new Error('No se pudo cargar configuración');
        const cfg = await res.json();
        _client = createClient(cfg.supabase_url, cfg.supabase_anon_key);
        return _client;
    })();
    return _initPromise;
}

// Si no hay sesión, redirige a /portal/login.html?next=<path>
export async function requireAuth() {
    const supa = await getSupabase();
    const { data } = await supa.auth.getSession();
    if (!data?.session) {
        const next = encodeURIComponent(location.pathname + location.search);
        location.href = `/portal/login.html?next=${next}`;
        return null;
    }
    return data.session;
}

export async function getCurrentUser() {
    const supa = await getSupabase();
    const { data } = await supa.auth.getUser();
    return data?.user || null;
}

export async function signOut() {
    const supa = await getSupabase();
    await supa.auth.signOut();
    location.href = '/portal/';
}

// Devuelve el JWT actual para enviarlo en Authorization a las APIs.
export async function getAccessToken() {
    const supa = await getSupabase();
    const { data } = await supa.auth.getSession();
    return data?.session?.access_token || null;
}

// Helper: fetch a una API protegida con Bearer JWT.
export async function apiFetch(url, options = {}) {
    const token = await getAccessToken();
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...options, headers });
}
