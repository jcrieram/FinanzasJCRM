// lib/drive.js — Sube documentos a Google Drive del propio médico.
//
// Modelo de token de Google Identity Services (GIS) con scope `drive.file`:
// la app SOLO puede ver y tocar los archivos que ella misma crea, nunca el
// resto del Drive del usuario. El Client ID es público (va en el navegador),
// no es un secreto.
//
// Estructura de carpetas creada en el Drive del médico:
//   UroWorkNet / Pacientes / "12.345.678-9 — Juan Pérez" / informe_2026-08-06.pdf

const CLIENT_ID = '597283206434-mfdibkblf3hiuj76jejosr38md2edj2h.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const ROOT_FOLDER = 'UroWorkNet';
const PATIENTS_FOLDER = 'Pacientes';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0;
let gisReady = null;
let pendingResolve = null, pendingReject = null;

function loadGis() {
    if (gisReady) return gisReady;
    gisReady = new Promise((resolve, reject) => {
        if (window.google?.accounts?.oauth2) return resolve();
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true; s.defer = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('No se pudo cargar Google Identity Services'));
        document.head.appendChild(s);
    });
    return gisReady;
}

async function initTokenClient() {
    await loadGis();
    if (tokenClient) return;
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (resp) => {
            if (resp.error) {
                if (pendingReject) pendingReject(new Error(resp.error_description || resp.error));
            } else {
                accessToken = resp.access_token;
                tokenExpiry = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000;
                if (pendingResolve) pendingResolve(accessToken);
            }
            pendingResolve = pendingReject = null;
        }
    });
}

export function isDriveConnected() {
    return !!accessToken && Date.now() < tokenExpiry;
}

// interactive=true muestra el popup de consentimiento (debe llamarse desde un
// gesto del usuario, p. ej. un click). interactive=false intenta refrescar el
// token en silencio (sin popup) si la sesión de Google sigue vigente.
export async function connectDrive(interactive = true) {
    await initTokenClient();
    if (isDriveConnected()) return accessToken;
    return new Promise((resolve, reject) => {
        pendingResolve = resolve; pendingReject = reject;
        try {
            tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
        } catch (e) {
            pendingResolve = pendingReject = null;
            reject(e);
        }
    });
}

async function ensureToken() {
    if (isDriveConnected()) return accessToken;
    return connectDrive(false); // refresco silencioso
}

async function driveFetch(url, opts = {}) {
    const token = await ensureToken();
    const res = await fetch(url, {
        ...opts,
        headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Drive API ' + res.status + ': ' + (await res.text()));
    return res.json();
}

async function findFolder(name, parentId) {
    const safe = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    let q = `name='${safe}' and mimeType='${FOLDER_MIME}' and trashed=false`;
    if (parentId) q += ` and '${parentId}' in parents`;
    const data = await driveFetch(
        'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) +
        '&fields=files(id,name)&spaces=drive'
    );
    return data.files?.[0]?.id || null;
}

async function createFolder(name, parentId) {
    const body = { name, mimeType: FOLDER_MIME };
    if (parentId) body.parents = [parentId];
    const data = await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return data.id;
}

// Con scope drive.file, la búsqueda solo devuelve carpetas que la propia app
// creó, así que reutilizar por nombre es idempotente entre sesiones.
async function ensureFolder(name, parentId) {
    return (await findFolder(name, parentId)) || createFolder(name, parentId);
}

// Sube un PDF (Blob) a UroWorkNet/Pacientes/{folderName}/{filename}.
// Devuelve { id, webViewLink } del archivo creado.
export async function uploadPdf(blob, { filename, folderName }) {
    const root = await ensureFolder(ROOT_FOLDER, null);
    const pacientes = await ensureFolder(PATIENTS_FOLDER, root);
    const patientFolder = await ensureFolder(folderName, pacientes);

    const token = await ensureToken();
    const boundary = '----uro' + Date.now();
    const metadata = { name: filename, parents: [patientFolder] };
    const pre =
        `--${boundary}\r\n` +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        `\r\n--${boundary}\r\n` +
        'Content-Type: application/pdf\r\n\r\n';
    const close = `\r\n--${boundary}--`;
    const body = new Blob([pre, blob, close], { type: 'multipart/related; boundary=' + boundary });

    const res = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
        {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + token,
                'Content-Type': 'multipart/related; boundary=' + boundary
            },
            body
        }
    );
    if (!res.ok) throw new Error('Subida a Drive falló (' + res.status + '): ' + (await res.text()));
    return res.json();
}
