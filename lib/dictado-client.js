// Módulo de dictado compartido (navegador). Un botón que alterna entre
// "grabar" y "terminar": graba audio con MediaRecorder y lo transcribe vía
// /api/transcribe. No sabe nada de campos de formulario: entrega el texto por
// callback y la app decide qué hacer con él.

import { apiFetch } from '/lib/supabase-client.js';

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

async function transcribe(blob, mime) {
    const ext = mime.includes('mp4') || mime.includes('aac') ? 'm4a'
        : mime.includes('webm') ? 'webm'
        : mime.includes('ogg') ? 'ogg'
        : 'm4a';
    const fd = new FormData();
    fd.append('file', blob, `dictado.${ext}`);
    const res = await apiFetch('/api/transcribe', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Transcripción falló (${res.status}): ${await res.text()}`);
    const data = await res.json();
    return data.text || '';
}

// Conecta un botón al flujo de dictado.
//   button       — el elemento <button>
//   onTranscript — async (texto) => void ; se llama con el texto transcrito
//   setStatus    — (mensaje) => void ; opcional, para mostrar estado
//   labelIdle    — texto del botón en reposo (default '🎤 Dictar')
export function attachDictado({ button, onTranscript, setStatus = () => {}, labelIdle = '🎤 Dictar' }) {
    let state = 'idle'; // idle | recording | processing
    let mediaRecorder = null;
    let stream = null;
    let chunks = [];
    let pickedMime = '';

    button.textContent = labelIdle;

    async function start() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1, sampleRate: 16000 }
            });
        } catch (e) {
            setStatus('No se pudo acceder al micrófono. Revisa los permisos del navegador.');
            return;
        }
        const mimeType = pickMimeType();
        try {
            mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 24000 } : { audioBitsPerSecond: 24000 });
        } catch (e) {
            mediaRecorder = new MediaRecorder(stream);
        }
        pickedMime = mimeType || mediaRecorder.mimeType || '';
        chunks = [];
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        mediaRecorder.onstop = handleStop;
        mediaRecorder.start(1000);
        state = 'recording';
        button.textContent = '⏹️ Terminar dictado';
        button.dataset.state = 'recording';
        setStatus('Grabando… habla y toca "Terminar" al finalizar.');
    }

    function finish() {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
        mediaRecorder.stop();
        if (stream) stream.getTracks().forEach(t => t.stop());
        state = 'processing';
        button.textContent = labelIdle;
        button.dataset.state = 'processing';
        button.disabled = true;
        setStatus('Transcribiendo…');
    }

    async function handleStop() {
        const mime = pickedMime || mediaRecorder.mimeType || 'audio/mp4';
        const blob = new Blob(chunks, { type: mime });
        chunks = [];
        if (blob.size === 0) {
            setStatus('No se grabó audio. Intenta de nuevo.');
            reset();
            return;
        }
        try {
            const text = await transcribe(blob, mime);
            setStatus('Repartiendo datos…');
            await onTranscript(text);
            setStatus('Listo. Revisa y corrige antes de generar.');
        } catch (e) {
            setStatus('Error: ' + (e.message || e));
        } finally {
            reset();
        }
    }

    function reset() {
        state = 'idle';
        button.disabled = false;
        button.textContent = labelIdle;
        button.dataset.state = 'idle';
    }

    button.addEventListener('click', () => {
        if (state === 'idle') start();
        else if (state === 'recording') finish();
    });
}
