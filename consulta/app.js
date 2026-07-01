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
let _supaToken = null;
async function getSupabaseToken() {
    if (_supaToken !== null) return _supaToken;
    try {
        const mod = await import('/lib/supabase-client.js');
        _supaToken = await mod.getAccessToken();
    } catch {
        _supaToken = '';
    }
    return _supaToken;
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

let mediaRecorder = null;
let chunks = [];
let stream = null;
let state = 'idle';
let elapsedMs = 0;
let segmentStart = 0;
let timerInterval = null;
let wakeLock = null;
let pickedMime = '';

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
function refreshTimer() { timerEl.textContent = fmtTime(currentMs()); }

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
    if (newState === 'idle') {
        primaryBtn.textContent = 'Grabar';
        primaryBtn.disabled = false;
        finishBtn.classList.add('hidden');
        setStatus('Listo para grabar');
    } else if (newState === 'recording') {
        primaryBtn.textContent = 'Pausar';
        primaryBtn.disabled = false;
        finishBtn.classList.remove('hidden');
        setStatus('Grabando…');
    } else if (newState === 'paused') {
        primaryBtn.textContent = 'Reanudar';
        primaryBtn.disabled = false;
        finishBtn.classList.remove('hidden');
        setStatus('En pausa');
    } else if (newState === 'processing') {
        primaryBtn.textContent = 'Grabar';
        primaryBtn.disabled = true;
        finishBtn.classList.add('hidden');
    }
}

async function startRecording() {
    hideError();
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                channelCount: 1
            }
        });
    } catch (e) {
        showError('No se pudo acceder al micrófono. Revisa los permisos en Ajustes > Safari.');
        return;
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
    mediaRecorder.start(1000);

    segmentStart = Date.now();
    timerEl.textContent = '00:00';
    timerInterval = setInterval(refreshTimer, 500);
    setUI('recording');
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

    const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
    if (blob.size === 0) {
        showError('No se grabó audio. Intenta de nuevo (revisa permiso del micrófono).');
        setUI('idle');
        return;
    }
    if (blob.size > 4 * 1024 * 1024) {
        showError(`El audio pesa ${sizeMB} MB y supera el límite de la plataforma (4 MB). Para consultas largas, graba en dos sesiones de máximo 15 minutos cada una.`);
        setUI('idle');
        return;
    }

    processingPanel.classList.remove('hidden');
    processingText.textContent = `Transcribiendo audio (${sizeMB} MB)…`;

    let transcript = '';
    try {
        transcript = await transcribe(blob, mime);
        if (!transcript || !transcript.trim()) {
            processingPanel.classList.add('hidden');
            showError('La transcripción llegó vacía. Asegúrate de hablar cerca del micrófono y en un ambiente sin ruido excesivo. Intenta de nuevo.');
            setUI('idle');
            return;
        }
        processingText.textContent = 'Generando nota clínica…';
        const note = await extract(transcript);
        processingPanel.classList.add('hidden');
        rawTranscript.textContent = transcript;
        noteText.value = note;
        resultPanel.classList.remove('hidden');
        setUI('idle');
    } catch (e) {
        processingPanel.classList.add('hidden');
        rawTranscript.textContent = transcript;
        showError('Error al procesar: ' + (e.message || e));
        if (transcript) resultPanel.classList.remove('hidden');
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

async function extract(transcript) {
    const res = await fetch('/api/extract', {
        method: 'POST',
        headers: await withAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ transcript })
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
    if (state === 'idle') startRecording();
    else if (state === 'recording') pauseRecording();
    else if (state === 'paused') resumeRecording();
});

finishBtn.addEventListener('click', finishRecording);

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

newBtn.addEventListener('click', () => {
    resultPanel.classList.add('hidden');
    noteText.value = '';
    rawTranscript.textContent = '';
    timerEl.textContent = '00:00';
    elapsedMs = 0;
    setUI('idle');
    hideError();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    });
}

ensurePin();
