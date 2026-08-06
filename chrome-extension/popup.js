// popup.js — lógica del popup de la extensión

const SOURCE_DOMAINS = ['masterkey.cl', 'hospitalclinico.cl', 'softwaremedilink.com', 'reservo.cl', 'his.redsalud.cl'];
const DEST_DOMAIN    = 'finanzas-jcrm.vercel.app';

function renderPatient(data) {
  const card = document.getElementById('patient-card');
  if (!data) {
    card.innerHTML = '<div class="empty">Sin datos copiados aún</div>';
    return;
  }
  card.innerHTML = `
    <div class="field">
      <span class="field-label">Paciente</span>
      <span class="field-value">${data.nombre || '—'}</span>
    </div>
    <div class="field">
      <span class="field-label">RUT</span>
      <span class="field-value">${data.rut || '—'}</span>
    </div>
    <div class="field">
      <span class="field-label">Edad</span>
      <span class="field-value">${data.edad ? data.edad + ' años' : '—'}</span>
    </div>
  `;
}

function setStatus(msg, type = '') {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = type;
  if (msg) setTimeout(() => { el.textContent = ''; el.className = ''; }, 3500);
}

// Cargar datos guardados al abrir el popup
chrome.storage.local.get('patient', (result) => renderPatient(result.patient || null));

document.getElementById('btn-copy').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isSource = tab && SOURCE_DOMAINS.some((d) => tab.url.includes(d));
  if (!isSource) {
    setStatus('⚠️ Abre una ficha clínica (MasterKey, miBiodata, Medilink, Reservo o HIS)', 'error');
    return;
  }
  // Usamos la RESPUESTA DIRECTA del content script (no un timeout que leía
  // storage y podía mostrar al paciente ANTERIOR con "✅ copiado").
  chrome.tabs.sendMessage(tab.id, { action: 'copyPatient' }, (resp) => {
    if (chrome.runtime.lastError) {
      // El content script no está inyectado (página abierta antes de instalar
      // o actualizar la extensión). No hay dato nuevo: no confirmar copia.
      setStatus('⚠️ Recarga la ficha del paciente y vuelve a intentar', 'error');
      return;
    }
    if (resp && resp.ok && resp.data) {
      renderPatient(resp.data);
      setStatus('✅ ¡Datos copiados!', 'ok');
    } else {
      // Copia fallida: limpiar el paciente guardado para que un "pegar"
      // posterior NO pegue por error al paciente anterior.
      chrome.storage.local.remove('patient', () => renderPatient(null));
      setStatus('⚠️ No se encontraron datos en la página', 'error');
    }
  });
});

document.getElementById('btn-paste').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url.includes(DEST_DOMAIN)) {
    setStatus('⚠️ Abre InformesUro (finanzas-jcrm.vercel.app) primero', 'error');
    return;
  }
  chrome.storage.local.get('patient', (result) => {
    if (!result.patient) { setStatus('⚠️ No hay datos copiados aún', 'error'); return; }
    chrome.tabs.sendMessage(tab.id, { action: 'pastePatient' });
    setStatus('✅ Pegando datos...', 'ok');
  });
});

document.getElementById('btn-historial').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url.includes('masterkey.cl')) {
    setStatus('⚠️ Abre la ficha del paciente en MasterKey', 'error');
    return;
  }
  chrome.tabs.sendMessage(tab.id, { action: 'runHistorial' });
  setStatus('⏳ Abriendo historial…', 'ok');
});

document.getElementById('btn-sin-ordenes').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url.includes('masterkey.cl')) {
    setStatus('⚠️ Abre la ficha del paciente en MasterKey', 'error');
    return;
  }
  chrome.tabs.sendMessage(tab.id, { action: 'runSinOrdenes' });
  setStatus('⏳ Ejecutando macro…', 'ok');
});
