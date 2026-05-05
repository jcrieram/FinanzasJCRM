// content_dest.js — pega datos del paciente en InformesUro (finanzas-jcrm.vercel.app)
// InformesUro usa inputs HTML planos con IDs prefijados por tab activo:
//   informe → i-nombre / i-rut / i-edad
//   cirugia → c-nombre / c-rut / c-edad
//   receta  → r-nombre / r-rut / r-edad
//   etc.

const TAB_PREFIX = {
  'tab-informe':    'i',
  'tab-cirugia':    'c',
  'tab-receta':     'r',
  'tab-examenes':   'e',
  'tab-estudios':   's',
  'tab-alta':       'a',
  'tab-post-quir':  'pq',
  'tab-post-holep': 'ph',
};

function getActivePrefix() {
  const active = document.querySelector('.tab-content.active');
  return active ? (TAB_PREFIX[active.id] || null) : null;
}

function setField(id, value) {
  const el = document.getElementById(id);
  if (!el || !value) return false;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function pastePatientData(data) {
  const prefix = getActivePrefix();
  if (!prefix) return 0;
  let n = 0;
  if (setField(`${prefix}-nombre`, data.nombre)) n++;
  if (setField(`${prefix}-rut`,    data.rut))    n++;
  if (setField(`${prefix}-edad`,   data.edad))   n++;
  return n;
}

function showBanner(message, color = '#2980b9') {
  const existing = document.getElementById('uro-ext-banner');
  if (existing) existing.remove();
  const banner = document.createElement('div');
  banner.id = 'uro-ext-banner';
  Object.assign(banner.style, {
    position: 'fixed', top: '20px', right: '20px', zIndex: '2147483647',
    background: color, color: 'white', padding: '12px 18px',
    borderRadius: '8px', fontFamily: 'Arial, sans-serif', fontSize: '13px',
    boxShadow: '0 4px 14px rgba(0,0,0,0.35)', maxWidth: '360px',
    lineHeight: '1.5', whiteSpace: 'pre-line',
  });
  banner.textContent = message;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 4000);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action !== 'pastePatient') return;

  chrome.runtime.sendMessage({ action: 'getPatient' }, (response) => {
    if (!response || !response.data) {
      showBanner(
        '⚠️ No hay datos copiados.\nVe a la ficha del paciente y presiona Alt+Shift+C primero.',
        '#e74c3c'
      );
      return;
    }
    const data = response.data;
    const n = pastePatientData(data);
    if (n > 0) {
      showBanner(
        `✅ Datos pegados:\n👤 ${data.nombre || '—'}\n🪪 ${data.rut || '—'}\n📅 ${data.edad ? data.edad + ' años' : '—'}`
      );
    } else {
      showBanner(
        '⚠️ No se encontró el tab activo en InformesUro.\nAsegúrate de que la página esté cargada.',
        '#e74c3c'
      );
    }
  });
});
