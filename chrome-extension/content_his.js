// content_his.js — extrae datos del header de TrakCare en his.redsalud.cl
// HIS muestra el nombre como "Apellido Apellido Nombre(s)" — lo reordenamos
// a "Nombre(s) Apellido Apellido" para que coincida con el formato de los otros sistemas.

function extractPatientData() {
  const body = document.body.innerText;
  let nombre = '', rut = '', edad = '';

  // RUN (no "RUT"): "RUN: 16753296-9"
  const runMatch = body.match(/RUN:\s*([0-9]{1,2}\.?[0-9]{3}\.?[0-9]{3}-[0-9kK])/i);
  if (runMatch) rut = runMatch[1];

  // Edad: "Edad: 38Años 6 Meses..."  (nota el formato "38Años" pegado)
  const edadMatch = body.match(/Edad:\s*(\d+)\s*A[ñn]os/i);
  if (edadMatch) edad = edadMatch[1];

  // Nombre: aparece entre el bloque "Episodio: ..." y "Fecha de Nacimiento"
  // Texto típico (con tabs o saltos): "Episodio: A0048795276    Vera Villarroel Cristian    Fecha de Nacimiento: ..."
  const nombreMatch = body.match(/Episodio:\s*[A-Z0-9]+\s+([A-ZÁÉÍÓÚÑÜÀ][A-Za-záéíóúñüàÁÉÍÓÚÑÜÀ\s]{2,80}?)\s+Fecha de Nacimiento/i);
  if (nombreMatch) {
    const raw = nombreMatch[1].replace(/\s+/g, ' ').trim();
    const parts = raw.split(' ');
    if (parts.length >= 3) {
      // En Chile: convención HIS es "AP1 AP2 N1 [N2 ...]"
      const apellidos = parts.slice(0, 2).join(' ');
      const nombres   = parts.slice(2).join(' ');
      nombre = `${nombres} ${apellidos}`;
    } else {
      nombre = raw;
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
      `✅ Copiado (HIS):\n👤 ${data.nombre || '—'}\n🪪 ${data.rut || '—'}\n📅 ${data.edad ? data.edad + ' años' : '—'}`
    );
  });
});
