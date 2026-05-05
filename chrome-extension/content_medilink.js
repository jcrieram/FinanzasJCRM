// content_medilink.js — extrae datos del header azul en *.softwaremedilink.com

function extractPatientData() {
  const body = document.body.innerText;
  let nombre = '', rut = '', edad = '';

  const rutMatch = body.match(/\bRUT\s+([0-9]{1,2}\.?[0-9]{3}\.?[0-9]{3}-[0-9kK])/i);
  if (rutMatch) rut = rutMatch[1];

  const edadPipe = body.match(/\|\s*(\d+)\s*años/i);
  if (edadPipe) {
    edad = edadPipe[1];
  } else {
    const edadGen = body.match(/(\d+)\s*años/i);
    if (edadGen) edad = edadGen[1];
  }

  const nombreMatch = body.match(/([A-ZÁÉÍÓÚÑÜÀ][a-záéíóúñüàA-ZÁÉÍÓÚÑÜÀ\s]{3,70}?)\s*\n\s*RUT\s+/i);
  if (nombreMatch) nombre = nombreMatch[1].replace(/\s+/g, ' ').trim();

  if (!nombre) {
    const selectors = [
      '.patient-name',
      "[class*='patientName']",
      "[class*='patient-header'] h2",
      "[class*='patient-header'] h1",
      'h2.name',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length > 3) {
        nombre = el.textContent.trim();
        break;
      }
    }
  }

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

chrome.runtime.onMessage.addListener((message) => {
  if (message.action !== 'copyPatient') return;
  const data = extractPatientData();
  if (!data.nombre && !data.rut && !data.edad) {
    showBanner('⚠️ No se encontraron datos del paciente en esta página.', '#e74c3c');
    return;
  }
  chrome.runtime.sendMessage({ action: 'savePatient', data }, () => {
    showBanner(
      `✅ Copiado (Medilink):\n👤 ${data.nombre || '—'}\n🪪 ${data.rut || '—'}\n📅 ${data.edad ? data.edad + ' años' : '—'}`
    );
  });
});
