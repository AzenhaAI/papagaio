// The extension's only privileged half: it holds the device token and does the
// network, so no page ever sees either. Content scripts ask through messages.
//
// Everything is free and anonymous — the token is not an account, it is the
// same one-tap device registration the app and the bot use, and it exists so
// the API can rate-limit rather than to identify anybody.

const API = 'https://azenha.ai';

/// Two kinds of token can be here, and the difference matters.
///
/// The anonymous one is minted on first use so translating works with no setup
/// at all. The paired one comes from the bot's /link and belongs to a person
/// who already has a deck — cards added from a page must land there, not in an
/// account nobody will ever open again.
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

/// Joins the account the bot and the app already share.
///
/// Without this the extension registers a device of its own, and a word kept
/// from a web page lands in a deck nobody studies — the button worked and the
/// word was gone. `/link` in the bot issues the code; pasting it here replaces
/// whatever anonymous account this browser had.
async function pair(code) {
  const clean = String(code ?? '').trim();
  if (!/^[0-9a-f-]{30,40}$/i.test(clean)) throw new Error('That does not look like a code');
  const r = await fetch(`${API}/api/progress`, { headers: { 'x-device-token': clean } });
  if (!r.ok) throw new Error('That code was not accepted — send /link again');
  await chrome.storage.local.set({ token: clean, paired: true });
  return true;
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
      if (msg.kind === 'status') {
        const { paired } = await chrome.storage.local.get('paired');
        reply({ ok: true, paired: paired === true });
        return;
      }
      if (msg.kind === 'pair') {
        const code = String(msg.code ?? '').trim();
        if (!code) { reply({ ok: false, error: 'no code' }); return; }
        // Verified before it is stored: a mistyped code would otherwise be
        // discovered later, when the cards had already gone somewhere else.
        const r = await fetch(`${API}/api/progress`, { headers: { 'x-device-token': code } });
        if (!r.ok) { reply({ ok: false, error: 'that code was refused' }); return; }
        const stats = await r.json().catch(() => ({}));
        await chrome.storage.local.set({ token: code, paired: true });
        reply({ ok: true, learned: stats.learned ?? 0 });
        return;
      }
      if (msg.kind === 'unpair') {
        // The anonymous token is dropped along with the paired one: keeping it
        // would silently resume writing into the throwaway account.
        await chrome.storage.local.remove(['token', 'paired']);
        reply({ ok: true });
        return;
      }
      if (msg.kind === 'add') {
        const { paired } = await chrome.storage.local.get('paired');
        if (paired !== true) { reply({ ok: false, error: 'not paired' }); return; }
        const j = await call('/api/read/collect', { method: 'POST', body: { text: msg.text } });
        reply({ ok: true, added: j.added ?? 0, words: j.words ?? [] });
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
      if (msg.kind === 'pair') {
        await pair(msg.code);
        reply({ ok: true });
        return;
      }
      if (msg.kind === 'status') {
        const { paired } = await chrome.storage.local.get('paired');
        reply({ ok: true, paired: paired === true });
        return;
      }
      // Keeping a word: the same endpoint the app's dictionary uses, so a word
      // kept here is the same card, with one history, not a copy.
      if (msg.kind === 'keep') {
        const t = await call('/api/mine', {
          method: 'POST',
          body: { term: msg.term, trans: msg.trans, course: 'pt', ex_t: msg.example ?? '' },
        });
        reply({ ok: true, id: t.id });
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
