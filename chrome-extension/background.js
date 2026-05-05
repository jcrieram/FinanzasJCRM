// background.js — service worker: maneja atajos de teclado y almacenamiento

const SOURCE_DOMAINS = [
  'masterkey.cl',
  'hospitalclinico.cl',
  'softwaremedilink.com',
  'reservo.cl',
  'his.redsalud.cl',
];
const DEST_DOMAIN = 'finanzas-jcrm.vercel.app';

function isSourceTab(url) {
  return SOURCE_DOMAINS.some((d) => url.includes(d));
}

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  if (command === 'copy-patient') {
    if (isSourceTab(tab.url)) {
      chrome.tabs.sendMessage(tab.id, { action: 'copyPatient' });
    } else {
      chrome.tabs.sendMessage(tab.id, { action: 'wrongTab', expected: 'ficha clínica' }).catch(() => {});
    }
  }

  if (command === 'paste-patient') {
    if (tab.url.includes(DEST_DOMAIN)) {
      chrome.tabs.sendMessage(tab.id, { action: 'pastePatient' });
    } else {
      chrome.tabs.sendMessage(tab.id, { action: 'wrongTab', expected: 'InformesUro' }).catch(() => {});
    }
  }

  if (command === 'sin-ordenes') {
    if (tab.url.includes('masterkey.cl')) {
      chrome.tabs.sendMessage(tab.id, { action: 'runSinOrdenes' });
    }
  }

  if (command === 'historial-riera') {
    if (tab.url.includes('masterkey.cl')) {
      chrome.tabs.sendMessage(tab.id, { action: 'runHistorial' });
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'savePatient') {
    chrome.storage.local.set({ patient: message.data }, () => sendResponse({ success: true }));
    return true;
  }
  if (message.action === 'getPatient') {
    chrome.storage.local.get('patient', (result) => sendResponse({ data: result.patient || null }));
    return true;
  }
});
