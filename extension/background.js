// The extension's only privileged half: it holds the device token and does the
// network, so no page ever sees either. Content scripts ask through messages.
//
// Everything is free and anonymous — the token is not an account, it is the
// same one-tap device registration the app and the bot use, and it exists so
// the API can rate-limit rather than to identify anybody.

const API = 'https://azenha.ai';

async function token() {
  const { token } = await chrome.storage.local.get('token');
  if (token) return token;
  const r = await fetch(`${API}/api/device`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ courses: 'pt' }),
  });
  if (!r.ok) throw new Error('registration failed');
  const j = await r.json();
  await chrome.storage.local.set({ token: j.token });
  return j.token;
}

async function call(path, { method = 'GET', body } = {}) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      'x-device-token': await token(),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

/// The dictionary article and real sentences are a bonus on a short query:
/// they must never delay or break the translation itself.
async function extras(word) {
  const clean = word.trim();
  if (!clean || clean.split(/\s+/).length > 2) return {};
  const [entry, examples] = await Promise.all([
    call(`/api/search?q=${encodeURIComponent(clean)}&course=pt`).catch(() => null),
    call(`/api/examples?q=${encodeURIComponent(clean)}&pair=pt-en&limit=2`).catch(() => null),
  ]);
  return {
    words: entry?.words?.slice(0, 2) ?? [],
    examples: examples?.examples ?? [],
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    try {
      if (msg.kind === 'translate') {
        const t = await call('/api/translate', {
          method: 'POST',
          body: { text: msg.text, direction: `auto->${msg.target}`, ui: msg.ui },
        });
        // Portuguese output is the side worth explaining, whichever way the
        // translation ran.
        const pt = t.direction?.endsWith('->pt') ? t.translation : t.source;
        reply({ ok: true, t, ...(await extras(pt).catch(() => ({}))) });
        return;
      }
      if (msg.kind === 'tts') {
        const r = await fetch(`${API}/api/tts`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: msg.text, course: msg.course === 'en' ? 'en' : 'pt' }),
        });
        if (!r.ok) throw new Error('no audio');
        const buf = await r.arrayBuffer();
        // A data URL travels through sendMessage; a blob URL made here would
        // belong to the worker and be dead by the time the page used it.
        let bin = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) {
          bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        reply({ ok: true, audio: `data:audio/mpeg;base64,${btoa(bin)}` });
        return;
      }
      reply({ ok: false, error: 'unknown request' });
    } catch (e) {
      reply({ ok: false, error: String(e.message || e) });
    }
  })();
  return true; // keep the channel open for the async reply
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'papagaio',
    title: 'Translate with PapaGaio',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'papagaio' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { kind: 'open', text: info.selectionText });
  }
});

chrome.commands?.onCommand.addListener(async (cmd) => {
  if (cmd !== 'translate-selection') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { kind: 'open' });
});
