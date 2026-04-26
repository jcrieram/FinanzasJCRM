const recordBtn = document.getElementById('recordBtn');
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
let startTime = 0;
let timerInterval = null;
let isRecording = false;
let wakeLock = null;

function showError(msg) {
    errorPanel.textContent = msg;
    errorPanel.classList.remove('hidden');
}
function hideError() {
    errorPanel.classList.add('hidden');
}
function setStatus(msg) { statusEl.textContent = msg; }
function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
}

async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (e) { /* ignore */ }
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
    for (const t of candidates) {
        if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
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
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = handleStop;
    mediaRecorder.start();

    isRecording = true;
    startTime = Date.now();
    timerEl.textContent = '00:00';
    timerInterval = setInterval(() => {
        timerEl.textContent = fmtTime(Date.now() - startTime);
    }, 500);

    recordBtn.textContent = 'Detener';
    recordBtn.classList.add('pulse-rec');
    recordBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
    recordBtn.classList.add('bg-red-700');
    setStatus('Grabando…');
    requestWakeLock();
}

function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
    mediaRecorder.stop();
    if (stream) stream.getTracks().forEach(t => t.stop());
    clearInterval(timerInterval);
    isRecording = false;
    recordBtn.textContent = 'Grabar';
    recordBtn.classList.remove('pulse-rec', 'bg-red-700');
    recordBtn.classList.add('bg-red-600', 'hover:bg-red-700');
    recordBtn.disabled = true;
    setStatus('Procesando audio…');
    releaseWakeLock();
}

async function handleStop() {
    const mime = mediaRecorder.mimeType || 'audio/webm';
    const blob = new Blob(chunks, { type: mime });
    chunks = [];

    const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
    if (blob.size > 24 * 1024 * 1024) {
        showError(`Audio muy largo (${sizeMB} MB). El límite es 25 MB. Intenta sesiones más cortas.`);
        recordBtn.disabled = false;
        setStatus('Listo para grabar');
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
        setStatus('Listo');
        recordBtn.disabled = false;
    } catch (e) {
        processingPanel.classList.add('hidden');
        showError('Error: ' + (e.message || e));
        recordBtn.disabled = false;
        setStatus('Listo para grabar');
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

recordBtn.addEventListener('click', () => {
    if (isRecording) stopRecording();
    else startRecording();
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
    setStatus('Listo para grabar');
    hideError();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    });
}
