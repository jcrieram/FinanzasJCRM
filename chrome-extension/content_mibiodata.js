// content_mibiodata.js — extrae datos del encabezado en mibiodata.hospitalclinico.cl

function extractPatientData() {
  const body = document.body.innerText;
  let nombre = '', rut = '', edad = '';

  // Nombre: tras la etiqueta "Nombre", antes de "Sexo"/"Número"/"Previsión"
  const nombreMatch = body.match(/\bNombre\b[\t ]+([A-ZÁÉÍÓÚÑÜÀ][A-ZÁÉÍÓÚÑÜÀ\s]{2,70}?)[\t ]+(?:Sexo|Número|Previsión)/i);
  if (nombreMatch) nombre = nombreMatch[1].replace(/\s+/g, ' ').trim();
  if (!nombre) {
    const nl = body.match(/\bNombre\b\s*\n\s*([A-ZÁÉÍÓÚÑÜÀ][A-ZÁÉÍÓÚÑÜÀ\s]{2,70}?)\s*\n/i);
    if (nl) nombre = nl[1].replace(/\s+/g, ' ').trim();
  }

  const rutMatch = body.match(/\bRut\b[\s\t]+([0-9]{1,2}\.[0-9]{3}\.[0-9]{3}-[0-9kK])/i);
  if (rutMatch) rut = rutMatch[1];

  const edadMatch = body.match(/\(\s*(\d+)\s*años/i);
  if (edadMatch) edad = edadMatch[1];

  return { nombre, rut, edad };
}

function showBanner(message, color = '#27ae60') {
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'copyPatient') return;
  const data = extractPatientData();
  // Requiere nombre O rut: la edad sola no identifica a un paciente.
  if (!data.nombre && !data.rut) {
    showBanner('⚠️ No se encontraron datos del paciente en esta página.', '#e74c3c');
    sendResponse({ ok: false, reason: 'no-data' });
    return true;
  }
  chrome.runtime.sendMessage({ action: 'savePatient', data }, () => {
    showBanner(
      `✅ Copiado (miBiodata):\n👤 ${data.nombre || '—'}\n🪪 ${data.rut || '—'}\n📅 ${data.edad ? data.edad + ' años' : '—'}`
    );
    sendResponse({ ok: true, data });
  });
  return true; // respuesta asíncrona
});
