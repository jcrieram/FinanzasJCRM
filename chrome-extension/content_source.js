// content_source.js — extrae datos del paciente y ejecuta macros en loscarrera.masterkey.cl

function extractPatientData() {
  const body = document.body.innerText;
  let nombre = '', rut = '', edad = '';

  const rutMatch = body.match(/Rut\/Pasaporte\s*:\s*([0-9]{1,2}\.[0-9]{3}\.[0-9]{3}-[0-9kK])/i);
  if (rutMatch) rut = rutMatch[1];

  const edadMatch = body.match(/Edad\s*:\s*(\d+)\s*A[ñn]/i);
  if (edadMatch) edad = edadMatch[1];

  const nombreMatch = body.match(/Paciente\s*:\s*([A-ZÁÉÍÓÚÑÜÀ ]+?)(?:\n|\r|$)/i);
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

// ===== Helpers para macros =====
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isVisible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
}

// Busca un elemento clickeable cuyo texto coincida (ignorando mayúsculas/acentos)
function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function findClickableByText(text, opts = {}) {
  const target = normalize(text);
  const selector = opts.selector || 'button, a, [role="button"], input[type="button"], input[type="submit"], span, div, i, li';
  const all = Array.from(document.querySelectorAll(selector));
  // Primero matches exactos
  let exact = all.find((el) => isVisible(el) && normalize(el.innerText || el.value || el.textContent) === target);
  if (exact) return exact;
  // Luego matches por inclusión, prefiriendo el de menor texto (más específico)
  const partial = all
    .filter((el) => isVisible(el) && normalize(el.innerText || el.value || el.textContent).includes(target))
    .sort((a, b) => (a.innerText || a.textContent || '').length - (b.innerText || b.textContent || '').length);
  return partial[0] || null;
}

async function waitForClickable(text, timeout = 5000, opts = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const el = findClickableByText(text, opts);
    if (el) return el;
    await sleep(150);
  }
  return null;
}

async function clickByText(text, opts = {}) {
  const el = await waitForClickable(text, opts.timeout || 5000, opts);
  if (!el) {
    console.warn(`[URO macro] No se encontró: "${text}"`);
    return false;
  }
  console.log(`[URO macro] Click en: "${text}"`, el);
  el.click();
  return true;
}

// Busca un botón por su atributo title (ej: "Agregar exámenes")
async function clickByTitle(titleText, timeout = 5000) {
  const target = normalize(titleText);
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const btn = Array.from(document.querySelectorAll('button, a, [role="button"]'))
      .find((el) => {
        if (!isVisible(el)) return false;
        const t = normalize(el.getAttribute('title') || '');
        return t === target || t.includes(target);
      });
    if (btn) {
      console.log(`[URO macro] Click en botón title="${titleText}"`, btn);
      btn.click();
      return true;
    }
    await sleep(150);
  }
  console.warn(`[URO macro] No se encontró botón con title="${titleText}"`);
  return false;
}

// ===== Macro: Sin Órdenes Médicas =====
async function runSinOrdenes() {
  showBanner('▶️ Ejecutando macro Sin Órdenes…', '#3498db');
  try {
    // 1) Click en "+" de Agregar exámenes
    let ok = await clickByTitle('Agregar exámenes', 6000);
    if (!ok) ok = await clickByTitle('Agregar examenes', 2000);
    if (!ok) {
      showBanner('❌ No encontré el botón "+" de exámenes.', '#e74c3c');
      return;
    }
    await sleep(1500);

    // 2) Click en "Sin órdenes médicas" (categoría/sección)
    ok = await clickByText('Sin órdenes médicas', { timeout: 6000 });
    if (!ok) ok = await clickByText('Sin ordenes medicas', { timeout: 2000 });
    if (!ok) {
      showBanner('❌ No encontré categoría "Sin órdenes médicas".', '#e74c3c');
      return;
    }
    await sleep(700);

    // 3) Click en "Sin órdenes médicas" (item en la lista de exámenes)
    ok = await clickByText('Sin órdenes médicas', { timeout: 5000 });
    if (!ok) ok = await clickByText('Sin ordenes medicas', { timeout: 2000 });
    if (!ok) {
      showBanner('❌ No encontré el ítem "Sin órdenes médicas" en la lista.', '#e74c3c');
      return;
    }
    await sleep(600);

    // 4) Click en Guardar (con fallbacks)
    ok = await clickByText('Guardar', { timeout: 5000 });
    if (!ok) ok = await clickByText('Guardar y cerrar', { timeout: 1500 });
    if (!ok) ok = await clickByText('Aceptar', { timeout: 1500 });
    if (!ok) ok = await clickByText('Confirmar', { timeout: 1500 });
    if (!ok) {
      showBanner('❌ No encontré el botón "Guardar".', '#e74c3c');
      return;
    }
    await sleep(900);

    // 5) Click en "Cerrar ventana" (con fallbacks)
    ok = await clickByText('Cerrar ventana', { timeout: 5000 });
    if (!ok) ok = await clickByText('Cerrar', { timeout: 1500 });
    if (!ok) ok = await clickByText('Salir', { timeout: 1500 });
    if (!ok) {
      showBanner('⚠️ Guardado, pero no encontré "Cerrar ventana".', '#f39c12');
      return;
    }
    await sleep(700);

    // 6) Click en "Cerrar" final (con fallbacks)
    ok = await clickByText('Cerrar', { timeout: 5000 });
    if (!ok) ok = await clickByText('Aceptar', { timeout: 1500 });
    if (!ok) ok = await clickByText('Salir', { timeout: 1500 });
    if (!ok) {
      showBanner('⚠️ Casi listo, pero no encontré el "Cerrar" final.', '#f39c12');
      return;
    }

    showBanner('✅ Sin Órdenes Médicas registrado.');
  } catch (err) {
    console.error('[URO macro] Error en Sin Órdenes:', err);
    showBanner('❌ Error en macro: ' + err.message, '#e74c3c');
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'copyPatient') {
    const data = extractPatientData();
    if (!data.nombre && !data.rut && !data.edad) {
      showBanner('⚠️ No se encontraron datos del paciente en esta página.', '#e74c3c');
      return;
    }
    chrome.runtime.sendMessage({ action: 'savePatient', data }, () => {
      showBanner(
        `✅ Copiado (MasterKey):\n👤 ${data.nombre || '—'}\n🪪 ${data.rut || '—'}\n📅 ${data.edad ? data.edad + ' años' : '—'}`
      );
    });
    return;
  }

  if (message.action === 'runSinOrdenes') {
    runSinOrdenes();
    return;
  }
});
