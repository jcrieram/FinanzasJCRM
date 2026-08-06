const PIN_KEY = 'consultavoz_pin';
const pinOverlay = document.getElementById('pinOverlay');
const pinInput = document.getElementById('pinInput');
const pinSubmit = document.getElementById('pinSubmit');
const pinError = document.getElementById('pinError');

function getPin() { return localStorage.getItem(PIN_KEY) || ''; }
function savePin(p) { localStorage.setItem(PIN_KEY, p); }
function clearPin() { localStorage.removeItem(PIN_KEY); }

function showPinModal() {
    pinError.textContent = '';
    pinInput.value = '';
    pinOverlay.classList.remove('hidden');
    setTimeout(() => pinInput.focus(), 50);
}
function hidePinModal() { pinOverlay.classList.add('hidden'); }

async function ensurePin() {
    if (!getPin()) {
        showPinModal();
        return new Promise((resolve) => {
            const onSubmit = async () => {
                const candidate = pinInput.value.trim();
                if (!candidate) { pinError.textContent = 'Ingresa el PIN'; return; }
                pinError.textContent = '';
                pinSubmit.disabled = true;
                pinSubmit.textContent = 'Verificando…';
                const ok = await verifyPin(candidate);
                pinSubmit.disabled = false;
                pinSubmit.textContent = 'Entrar';
                if (ok) {
                    savePin(candidate);
                    hidePinModal();
                    pinSubmit.removeEventListener('click', onSubmit);
                    pinInput.removeEventListener('keydown', onKey);
                    resolve();
                } else {
                    pinError.textContent = 'PIN incorrecto';
                    pinInput.value = '';
                    pinInput.focus();
                }
            };
            const onKey = (e) => { if (e.key === 'Enter') onSubmit(); };
            pinSubmit.addEventListener('click', onSubmit);
            pinInput.addEventListener('keydown', onKey);
        });
    }
}

async function verifyPin(pin) {
    try {
        const res = await fetch('/api/verify-pin', {
            method: 'POST',
            headers: { 'X-Consulta-Pin': pin }
        });
        return res.ok;
    } catch (e) {
        return false;
    }
}

// Si el usuario está logueado en Supabase, mandamos el JWT.
// Si no, caemos al PIN legacy (mientras dure la migración).
// NO cacheamos el token: getAccessToken() ya lo refresca solo vía getSession(),
// y cachearlo provocaba 401 al expirar la sesión a mitad de jornada (y con ello
// la pérdida del audio recién grabado). El import dinámico sí lo cachea el navegador.
async function getSupabaseToken() {
    try {
        const mod = await import('/lib/supabase-client.js');
        return await mod.getAccessToken();
    } catch {
        return '';
    }
}

function withPinHeaders(extra = {}) {
    return { ...extra, 'X-Consulta-Pin': getPin() };
}

async function withAuthHeaders(extra = {}) {
    const headers = { ...extra };
    const token = await getSupabaseToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    else headers['X-Consulta-Pin'] = getPin();
    return headers;
}

const primaryBtn = document.getElementById('primaryBtn');
const finishBtn = document.getElementById('finishBtn');
const examBtn = document.getElementById('examBtn');
const timerEl = document.getElementById('timer');
const statusEl = document.getElementById('status');
const processingPanel = document.getElementById('processingPanel');
const processingText = document.getElementById('processingText');
const resultPanel = document.getElementById('resultPanel');
const noteText = document.getElementById('noteText');
const rawTranscript = document.getElementById('rawTranscript');
const copyBtn = document.getElementById('copyBtn');
const emailBtn = document.getElementById('emailBtn');
const newBtn = document.getElementById('newBtn');
const errorPanel = document.getElementById('errorPanel');
const retryBtn = document.getElementById('retryBtn');

let mediaRecorder = null;
let chunks = [];
let stream = null;
let state = 'idle';
let starting = false; // guard de reentrada para evitar doble-toque en Grabar
// 'consulta' = entrevista completa → nota clínica.
// 'examenes' = dictado de laboratorios/imágenes → lista de resultados.
let recordMode = 'consulta';
let elapsedMs = 0;
let segmentStart = 0;
let timerInterval = null;
let wakeLock = null;
let pickedMime = '';
// Última grabación pendiente de procesar { blob, mime, mode }. Se conserva
// hasta que la transcripción+extracción tengan éxito, para poder reintentar
// sin regrabar si falla la red/servidor.
let pendingAudio = null;

// Límite de duración: a 48 kbps, 4 MB ≈ 11,6 min. Cortamos antes con margen
// para no superar el tope de plataforma (4 MB) y no perder la grabación.
const HARD_LIMIT_MS = 10 * 60 * 1000;   // auto-finaliza a los 10 min (~3,6 MB)
const WARN_LIMIT_MS = 8.5 * 60 * 1000;  // avisa a los 8,5 min

// ── Persistencia del audio en IndexedDB (sobrevive a recargas/cierres) ──
const AUDIO_DB = 'consultavoz-audio';
const AUDIO_STORE = 'pending';
const AUDIO_KEY = 'last';

function idbOpen() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(AUDIO_DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(AUDIO_STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function idbSaveAudio(blob, mime, mode) {
    try {
        const db = await idbOpen();
        await new Promise((res, rej) => {
            const tx = db.transaction(AUDIO_STORE, 'readwrite');
            tx.objectStore(AUDIO_STORE).put({ blob, mime, mode, ts: Date.now() }, AUDIO_KEY);
            tx.oncomplete = res; tx.onerror = () => rej(tx.error);
        });
        db.close();
    } catch (e) { /* best-effort: si IDB falla, seguimos con la copia en memoria */ }
}
async function idbLoadAudio() {
    try {
        const db = await idbOpen();
        const val = await new Promise((res, rej) => {
            const tx = db.transaction(AUDIO_STORE, 'readonly');
            const r = tx.objectStore(AUDIO_STORE).get(AUDIO_KEY);
            r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        });
        db.close();
        return val || null;
    } catch (e) { return null; }
}
async function idbClearAudio() {
    try {
        const db = await idbOpen();
        await new Promise((res, rej) => {
            const tx = db.transaction(AUDIO_STORE, 'readwrite');
            tx.objectStore(AUDIO_STORE).delete(AUDIO_KEY);
            tx.oncomplete = res; tx.onerror = () => rej(tx.error);
        });
        db.close();
    } catch (e) {}
}

function showRetry() { retryBtn.classList.remove('hidden'); }
function hideRetry() { retryBtn.classList.add('hidden'); }

function showError(msg) {
    errorPanel.textContent = msg;
    errorPanel.classList.remove('hidden');
}
function hideError() { errorPanel.classList.add('hidden'); }
function setStatus(msg) { statusEl.textContent = msg; }
function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
}
function currentMs() {
    return state === 'recording' ? elapsedMs + (Date.now() - segmentStart) : elapsedMs;
}
function refreshTimer() {
    timerEl.textContent = fmtTime(currentMs());
    checkLimit();
}

// Corta la grabación antes de superar el tope de 4 MB (que descartaría el audio).
function checkLimit() {
    if (state !== 'recording') return;
    const ms = currentMs();
    if (ms >= HARD_LIMIT_MS) {
        setStatus('Límite de duración alcanzado — finalizando…');
        finishRecording();
    } else if (ms >= WARN_LIMIT_MS) {
        setStatus('⚠️ Cerca del límite (~10 min). Conviene finalizar pronto.');
    }
}

async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) {}
}
function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

function pickMimeType() {
    const candidates = [
        'audio/mp4',
        'audio/mp4;codecs=mp4a.40.2',
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus'
    ];
    for (const t of candidates) if (MediaRecorder.isTypeSupported(t)) return t;
    return '';
}

function setUI(newState) {
    state = newState;
    primaryBtn.dataset.state = newState === 'processing' ? 'idle' : newState;
    const isExam = recordMode === 'examenes';
    if (newState === 'idle') {
        primaryBtn.textContent = 'Grabar';
        primaryBtn.disabled = false;
        finishBtn.classList.add('hidden');
        examBtn.classList.remove('hidden');
        examBtn.disabled = false;
        setStatus('Listo para grabar');
    } else if (newState === 'recording') {
        primaryBtn.textContent = 'Pausar';
        primaryBtn.disabled = false;
        finishBtn.classList.remove('hidden');
        examBtn.classList.add('hidden');
        setStatus(isExam ? 'Dictando exámenes…' : 'Grabando…');
    } else if (newState === 'paused') {
        primaryBtn.textContent = 'Reanudar';
        primaryBtn.disabled = false;
        finishBtn.classList.remove('hidden');
        examBtn.classList.add('hidden');
        setStatus('En pausa');
    } else if (newState === 'processing') {
        primaryBtn.textContent = 'Grabar';
        primaryBtn.disabled = true;
        finishBtn.classList.add('hidden');
        examBtn.classList.add('hidden');
    }
}

async function startRecording() {
    // Guard de reentrada: evita que un doble-toque cree dos grabadoras y
    // fugue un stream de micrófono.
    if (state !== 'idle' || starting) return;
    starting = true;
    hideError();
    hideRetry();
    primaryBtn.disabled = true;
    examBtn.disabled = true;
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1
            }
        });
    } catch (e) {
        showError('No se pudo acceder al micrófono. Revisa los permisos en Ajustes > Safari.');
        starting = false;
        setUI('idle');
        return;
    }

    // Si el sistema corta el micrófono (llamada entrante, Siri, otra app toma
    // el audio), avisamos en vez de seguir "grabando" en silencio.
    const track = stream.getAudioTracks()[0];
    if (track) {
        track.onended = () => {
            if (state === 'recording' || state === 'paused') {
                showError('El micrófono se interrumpió (¿una llamada u otra app?). Finaliza para procesar lo grabado hasta aquí.');
            }
        };
    }

    const mimeType = pickMimeType();
    try {
        mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 48000 } : { audioBitsPerSecond: 48000 });
    } catch (e) {
        mediaRecorder = new MediaRecorder(stream);
    }
    pickedMime = mimeType || mediaRecorder.mimeType || '';
    chunks = [];
    elapsedMs = 0;
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = handleStop;
    mediaRecorder.onerror = () => {
        showError('Error de grabación. Finaliza para intentar procesar lo capturado.');
    };
    mediaRecorder.start(1000);

    segmentStart = Date.now();
    timerEl.textContent = '00:00';
    timerInterval = setInterval(refreshTimer, 500);
    setUI('recording');
    starting = false;
    requestWakeLock();
}

function pauseRecording() {
    if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
    mediaRecorder.pause();
    elapsedMs += Date.now() - segmentStart;
    refreshTimer();
    setUI('paused');
    releaseWakeLock();
}

function resumeRecording() {
    if (!mediaRecorder || mediaRecorder.state !== 'paused') return;
    mediaRecorder.resume();
    segmentStart = Date.now();
    setUI('recording');
    requestWakeLock();
}

function finishRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
    if (mediaRecorder.state === 'recording') elapsedMs += Date.now() - segmentStart;
    mediaRecorder.stop();
    if (stream) stream.getTracks().forEach(t => t.stop());
    clearInterval(timerInterval);
    refreshTimer();
    setUI('processing');
    setStatus('Procesando audio…');
    releaseWakeLock();
}

async function handleStop() {
    const mime = pickedMime || mediaRecorder.mimeType || 'audio/mp4';
    const blob = new Blob(chunks, { type: mime });
    chunks = [];
    const capturedMode = recordMode;

    const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
    if (blob.size === 0) {
        showError('No se grabó audio. Intenta de nuevo (revisa permiso del micrófono).');
        setUI('idle');
        return;
    }

    // Guardar el audio ANTES de procesar. Si la transcripción falla (red,
    // timeout, sesión), la grabación NO se pierde: queda para reintentar.
    pendingAudio = { blob, mime, mode: capturedMode };
    await idbSaveAudio(blob, mime, capturedMode);

    if (blob.size > 4 * 1024 * 1024) {
        showError(`El audio pesa ${sizeMB} MB y supera el límite de la plataforma (4 MB). Para consultas largas, finaliza antes de los 10 minutos. La grabación quedó guardada en este dispositivo.`);
        setUI('idle');
        return;
    }

    await processRecording(blob, mime, capturedMode);
}

// Transcribe → extrae → muestra. Reutilizable por el botón "Reintentar".
// En cualquier fallo conserva el audio (pendingAudio + IndexedDB) y ofrece
// reintentar, en vez de descartar la consulta.
async function processRecording(blob, mime, mode) {
    hideError();
    hideRetry();
    const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
    processingPanel.classList.remove('hidden');
    processingText.textContent = `Transcribiendo audio (${sizeMB} MB)…`;

    let transcript = '';
    try {
        transcript = await transcribe(blob, mime);
        if (!transcript || !transcript.trim()) {
            processingPanel.classList.add('hidden');
            showError('La transcripción llegó vacía. Habla cerca del micrófono, en un ambiente sin ruido. La grabación quedó guardada: puedes reintentar.');
            showRetry();
            setUI('idle');
            return;
        }
        processingText.textContent = mode === 'examenes' ? 'Estructurando exámenes…' : 'Generando nota clínica…';
        const note = await extract(transcript, mode);
        // Éxito: la grabación ya cumplió su función, la descartamos.
        pendingAudio = null;
        await idbClearAudio();
        processingPanel.classList.add('hidden');
        rawTranscript.textContent = transcript;
        noteText.value = note;
        const titleEl = resultPanel.querySelector('.result-title');
        if (titleEl) titleEl.textContent = mode === 'examenes' ? 'Exámenes' : 'Nota clínica';
        resultPanel.classList.remove('hidden');
        setUI('idle');
    } catch (e) {
        processingPanel.classList.add('hidden');
        rawTranscript.textContent = transcript;
        // La transcripción cruda (si se logró) se muestra para no perderla,
        // y el audio queda para reintentar la extracción.
        showError('No se pudo procesar la grabación: ' + (e.message || e) + ' — La grabación quedó guardada, puedes reintentar.');
        if (transcript) resultPanel.classList.remove('hidden');
        showRetry();
        setUI('idle');
    }
}

async function transcribe(blob, mime) {
    const ext = mime.includes('mp4') || mime.includes('aac') ? 'm4a'
        : mime.includes('webm') ? 'webm'
        : mime.includes('ogg') ? 'ogg'
        : mime.includes('wav') ? 'wav'
        : 'm4a';
    const fd = new FormData();
    fd.append('file', blob, `consulta.${ext}`);
    const sizeKB = (blob.size / 1024).toFixed(0);
    const res = await fetch('/api/transcribe', { method: 'POST', headers: await withAuthHeaders(), body: fd });
    if (res.status === 401) { clearPin(); throw new Error('Sesión expirada. Vuelve a abrir la app.'); }
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Transcripción falló (${res.status}) [mime=${mime}, ext=${ext}, ${sizeKB}KB]: ${txt}`);
    }
    const data = await res.json();
    return data.text;
}

async function extract(transcript, mode = recordMode) {
    const res = await fetch('/api/extract', {
        method: 'POST',
        headers: await withAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ transcript, mode })
    });
    if (res.status === 401) { clearPin(); throw new Error('Sesión expirada. Vuelve a abrir la app.'); }
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Extracción falló (${res.status}): ${txt}`);
    }
    const data = await res.json();
    return data.note;
}

primaryBtn.addEventListener('click', () => {
    if (state === 'idle') { recordMode = 'consulta'; startRecording(); }
    else if (state === 'recording') pauseRecording();
    else if (state === 'paused') resumeRecording();
});

examBtn.addEventListener('click', () => {
    if (state !== 'idle') return;
    recordMode = 'examenes';
    startRecording();
});

finishBtn.addEventListener('click', finishRecording);

retryBtn.addEventListener('click', async () => {
    if (!pendingAudio) {
        const saved = await idbLoadAudio();
        if (saved && saved.blob) pendingAudio = { blob: saved.blob, mime: saved.mime, mode: saved.mode || 'consulta' };
    }
    if (!pendingAudio || !pendingAudio.blob) {
        showError('No hay ninguna grabación guardada para reintentar.');
        hideRetry();
        return;
    }
    recordMode = pendingAudio.mode;
    await processRecording(pendingAudio.blob, pendingAudio.mime, pendingAudio.mode);
});

// Re-adquiere el wake lock al volver a la app (el sistema lo libera al
// pasar a segundo plano); si no, la pantalla podría apagarse grabando.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state === 'recording') requestWakeLock();
});

copyBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(noteText.value);
        const original = copyBtn.textContent;
        copyBtn.textContent = '¡Copiado!';
        setTimeout(() => { copyBtn.textContent = original; }, 1500);
    } catch (e) {
        noteText.select();
        document.execCommand('copy');
    }
});

emailBtn.addEventListener('click', async () => {
    emailBtn.disabled = true;
    const original = emailBtn.textContent;
    emailBtn.textContent = 'Enviando…';
    try {
        const res = await fetch('/api/send-email', {
            method: 'POST',
            headers: await withAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ note: noteText.value })
        });
        if (res.status === 401) { clearPin(); throw new Error('Sesión expirada. Vuelve a abrir la app.'); }
        if (!res.ok) throw new Error(await res.text());
        emailBtn.textContent = '¡Enviado!';
        setTimeout(() => { emailBtn.textContent = original; emailBtn.disabled = false; }, 2000);
    } catch (e) {
        emailBtn.textContent = 'Error';
        showError('No se pudo enviar el email: ' + e.message);
        setTimeout(() => { emailBtn.textContent = original; emailBtn.disabled = false; }, 2000);
    }
});

newBtn.addEventListener('click', async () => {
    resultPanel.classList.add('hidden');
    noteText.value = '';
    rawTranscript.textContent = '';
    timerEl.textContent = '00:00';
    elapsedMs = 0;
    // Descartar explícitamente la grabación anterior al empezar de cero.
    pendingAudio = null;
    await idbClearAudio();
    hideRetry();
    setUI('idle');
    hideError();
});

// Al abrir la app, si quedó una grabación sin procesar de una sesión previa
// (cierre, recarga, crash), ofrecer reintentar en vez de perderla.
async function checkPendingAudio() {
    const saved = await idbLoadAudio();
    if (saved && saved.blob && saved.blob.size > 0) {
        pendingAudio = { blob: saved.blob, mime: saved.mime, mode: saved.mode || 'consulta' };
        recordMode = pendingAudio.mode;
        const mins = saved.ts ? Math.round((Date.now() - saved.ts) / 60000) : null;
        showError('Quedó una grabación sin procesar' + (mins !== null ? ` (hace ~${mins} min)` : '') + '. Puedes reintentar o iniciar una nueva.');
        showRetry();
    }
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    });
}

ensurePin();
checkPendingAudio();
