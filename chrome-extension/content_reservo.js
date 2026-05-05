// content_reservo.js — extrae datos del header en reservo.cl

function extractPatientData() {
  const body = document.body.innerText;
  let nombre = '', rut = '', edad = '';

  // RUT: "RUT: 15742831-4" — Reservo lo muestra sin puntos pero permitimos ambos
  const rutMatch = body.match(/RUT:\s*([0-9]{1,2}\.?[0-9]{3}\.?[0-9]{3}-[0-9kK])/i);
  if (rutMatch) rut = rutMatch[1];

  // Edad: "(42 años, 6 meses)"
  const edadMatch = body.match(/\(\s*(\d+)\s*años/i);
  if (edadMatch) edad = edadMatch[1];

  // Nombre: línea con paréntesis de edad
  // Texto típico: "Gonzalo Altamirano Oyanedel (42 años, 6 meses)"
  const nombreMatch = body.match(/([A-ZÁÉÍÓÚÑÜÀ][A-Za-záéíóúñüàÁÉÍÓÚÑÜÀ\s]{3,80}?)\s*\(\s*\d+\s*años/);
  if (nombreMatch) nombre = nombreMatch[1].replace(/\s+/g, ' ').trim();

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
      `✅ Copiado (Reservo):\n👤 ${data.nombre || '—'}\n🪪 ${data.rut || '—'}\n📅 ${data.edad ? data.edad + ' años' : '—'}`
    );
  });
});
