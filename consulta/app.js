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
let state = 'idle'; // 'idle' | 'recording' | 'paused' | 'processing'
let elapsedMs = 0;
let segmentStart = 0;
let timerInterval = null;
let wakeLock = null;

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
    primaryBtn.classList.remove('pulse-rec', 'bg-red-600', 'hover:bg-red-700', 'bg-red-700', 'bg-amber-500', 'hover:bg-amber-600', 'bg-emerald-600', 'hover:bg-emerald-700');
    if (newState === 'idle') {
        primaryBtn.textContent = 'Grabar';
        primaryBtn.classList.add('bg-red-600', 'hover:bg-red-700');
        primaryBtn.disabled = false;
        finishBtn.classList.add('hidden');
        setStatus('Listo para grabar');
    } else if (newState === 'recording') {
        primaryBtn.textContent = 'Pausar';
        primaryBtn.classList.add('bg-amber-500', 'hover:bg-amber-600', 'pulse-rec');
        primaryBtn.disabled = false;
        finishBtn.classList.remove('hidden');
        setStatus('Grabando…');
    } else if (newState === 'paused') {
        primaryBtn.textContent = 'Reanudar';
        primaryBtn.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
        primaryBtn.disabled = false;
        finishBtn.classList.remove('hidden');
        setStatus('En pausa');
    } else if (newState === 'processing') {
        primaryBtn.textContent = 'Grabar';
        primaryBtn.classList.add('bg-red-600');
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
                channelCount: 1,
                sampleRate: 16000
            }
        });
    } catch (e) {
        showError('No se pudo acceder al micrófono. Revisa los permisos en Ajustes > Safari.');
        return;
    }

    const mimeType = pickMimeType();
    try {
        mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 24000 } : { audioBitsPerSecond: 24000 });
    } catch (e) {
        mediaRecorder = new MediaRecorder(stream);
    }
    chunks = [];
    elapsedMs = 0;
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = handleStop;
    mediaRecorder.start();

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
    const mime = mediaRecorder.mimeType || 'audio/webm';
    const blob = new Blob(chunks, { type: mime });
    chunks = [];

    const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
    if (blob.size > 24 * 1024 * 1024) {
        showError(`Audio muy largo (${sizeMB} MB). El límite es 25 MB.`);
        setUI('idle');
        return;
    }

    processingPanel.classList.remove('hidden');
    processingText.textContent = `Transcribiendo (${sizeMB} MB)…`;

    try {
        const transcript = await transcribe(blob, mime);
        processingText.textContent = 'Extrayendo datos clínicos…';
        const note = await extract(transcript);
        processingPanel.classList.add('hidden');
        rawTranscript.textContent = transcript;
        noteText.value = note;
        resultPanel.classList.remove('hidden');
        setUI('idle');
    } catch (e) {
        processingPanel.classList.add('hidden');
        showError('Error: ' + (e.message || e));
        setUI('idle');
    }
}

async function transcribe(blob, mime) {
    const ext = mime.includes('mp4') ? 'm4a' : mime.includes('webm') ? 'webm' : mime.includes('ogg') ? 'ogg' : 'audio';
    const fd = new FormData();
    fd.append('file', blob, `consulta.${ext}`);
    const res = await fetch('/api/transcribe', { method: 'POST', body: fd });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Transcripción falló (${res.status}): ${txt}`);
    }
    const data = await res.json();
    return data.text;
}

async function extract(transcript) {
    const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript })
    });
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: noteText.value })
        });
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
