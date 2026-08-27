// The panel that appears over the page when you select something.
//
// It lives in a shadow root on purpose: a translation card that inherits the
// page's CSS looks different on every site and eventually breaks on one of
// them. Nothing here reads or rewrites the page — only the selection is read,
// and only when you ask for it.

const TARGETS = [
  ['en', 'English'],
  ['ru', 'Русский'],
  ['pt', 'Português'],
];

let host = null;
let root = null;
let pill = null;
let target = 'en';

chrome.storage.local.get('target').then(({ target: saved }) => {
  if (saved) target = saved;
  else {
    const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    target = TARGETS.some(([c]) => c === nav) ? nav : 'en';
  }
});

const CSS = `
:host { all: initial; }
.wrap {
  position: fixed; z-index: 2147483647; max-width: 380px; width: max-content;
  background: #16181d; color: #f2f4f7; border: 1px solid #2b2f36;
  border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.45);
  font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
}
.head { display: flex; align-items: center; gap: 8px; padding: 10px 12px;
  border-bottom: 1px solid #2b2f36; }
.brand { font-weight: 600; font-size: 13px; color: #29b89a; flex: 1; }
.x { cursor: pointer; color: #8b929e; padding: 2px 6px; border-radius: 6px; }
.x:hover { background: #23262d; color: #f2f4f7; }
.body { padding: 12px; max-height: 60vh; overflow-y: auto; }
.src { color: #8b929e; font-size: 13px; margin-bottom: 6px; word-break: break-word; }
.out { font-size: 19px; font-weight: 600; word-break: break-word; }
.row { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.note { color: #a7aeba; font-size: 12.5px; margin-top: 10px; }
.note div { margin-top: 4px; }
.ex { color: #c9d0da; font-size: 12.5px; margin-top: 4px; }
.ex i { color: #8b929e; font-style: normal; }
.langs { display: flex; gap: 6px; padding: 10px 12px; border-top: 1px solid #2b2f36; }
.lang { flex: 1; text-align: center; padding: 6px 0; border-radius: 8px;
  background: #21242b; color: #c9d0da; cursor: pointer; font-size: 12.5px; }
.lang.on { background: #29b89a; color: #08110f; font-weight: 600; }
.acts { display: flex; gap: 8px; padding: 0 12px 12px; }
.btn { flex: 1; text-align: center; padding: 7px 0; border-radius: 8px;
  background: #21242b; color: #c9d0da; cursor: pointer; font-size: 12.5px;
  text-decoration: none; }
.btn:hover { background: #2a2e36; }
.chips { display: flex; align-items: center; gap: 8px; padding: 10px 12px 4px; }
.chip { flex: 1; text-align: center; padding: 7px 0; border-radius: 10px;
  background: #21242b; color: #e8ecf2; font-size: 13px; cursor: pointer; }
.swap { color: #8b929e; cursor: pointer; padding: 0 2px; font-size: 15px; }
.line { display: flex; align-items: flex-start; gap: 8px; padding: 8px 12px; }
.line .txt { flex: 1; word-break: break-word; }
.line.top { border-bottom: 1px solid #23262d; }
.line.top .txt { color: #e8ecf2; font-size: 15px; }
.line.out .txt { font-size: 19px; font-weight: 600; }
.spk { color: #8b929e; cursor: pointer; user-select: none; }
.spk:hover { color: #29b89a; }
.tabs { display: flex; gap: 6px; padding: 8px 12px 0; }
.tab { padding: 5px 10px; border-radius: 999px; background: #21242b;
  color: #a7aeba; font-size: 12px; cursor: pointer; }
.tab.on { background: #2f333c; color: #f2f4f7; }
.sense { padding: 8px 12px 0; }
.sense .n { color: #8b929e; font-size: 12px; }
.syn { display: inline-block; background: #2a2e36; color: #e8ecf2; border-radius: 6px;
  padding: 2px 7px; margin: 3px 4px 0 0; font-size: 12.5px; }
.syn.ant { background: transparent; border: 1px solid #3a3f49; color: #a7aeba; }
.gloss { color: #a7aeba; font-size: 12.5px; margin-top: 2px; }
.pill { position: fixed; z-index: 2147483647; cursor: pointer;
  background: #16181d; border: 1px solid #2b2f36; border-radius: 999px;
  padding: 5px 10px; font-size: 15px; box-shadow: 0 6px 20px rgba(0,0,0,.4); }
.err { color: #ff8b8b; }
`;

function mount() {
  if (host) return;
  host = document.createElement('div');
  host.style.all = 'initial';
  root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = CSS;
  root.append(style);
  document.documentElement.append(host);
}

function place(el, rect) {
  // Below the selection when there is room, above it otherwise — a card that
  // covers the sentence you are reading defeats the point.
  const pad = 8;
  const w = el.offsetWidth || 360;
  const h = el.offsetHeight || 200;
  let left = Math.min(Math.max(pad, rect.left), window.innerWidth - w - pad);
  let top = rect.bottom + pad;
  if (top + h > window.innerHeight - pad) top = Math.max(pad, rect.top - h - pad);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function selectionRect() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0).getBoundingClientRect();
  return r.width || r.height ? r : null;
}

function clearPill() {
  pill?.remove();
  pill = null;
}

/// A small handle rather than an instant panel: translating on every accidental
/// selection would fire off requests nobody asked for and cover the page while
/// you are still choosing words.
function showPill(rect, text) {
  mount();
  clearPill();
  pill = document.createElement('div');
  pill.className = 'pill';
  pill.textContent = '🦜';
  pill.title = 'Translate with PapaGaio';
  pill.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearPill();
    open(text, rect);
  });
  root.append(pill);
  place(pill, rect);
}

let card = null;

function close() {
  card?.remove();
  card = null;
}

const NAMES = { auto: 'Auto', pt: 'Português', en: 'English', ru: 'Русский' };

let current = { text: '', at: null, answer: null, tab: 'dict' };

function open(text, rect) {
  mount();
  close();
  const sel = (text ?? window.getSelection()?.toString() ?? '').trim().slice(0, 600);
  if (!sel) return;
  current = { text: sel, at: rect ?? selectionRect() ?? { left: 20, top: 20, bottom: 20 }, answer: null, tab: 'dict' };

  card = document.createElement('div');
  card.className = 'wrap';
  card.innerHTML = `
    <div class="head"><span class="brand">PapaGaio</span><span class="x">✕</span></div>
    <div class="chips">
      <span class="chip from"></span><span class="swap">⇄</span><span class="chip to"></span>
    </div>
    <div class="line top"><span class="txt src"></span><span class="spk spk-src">🔊</span></div>
    <div class="line out"><span class="txt res">…</span><span class="spk spk-out">🔊</span></div>
    <div class="body"></div>
    <div class="acts">
      <span class="btn copy">Copy</span>
      <span class="btn deck">➕ Deck</span>
      <a class="btn" target="_blank" rel="noreferrer">Open</a>
    </div>`;
  root.append(card);

  const q = (x) => card.querySelector(x);
  q('.src').textContent = sel;
  q('.x').addEventListener('click', close);
  q('a.btn').href = `https://azenha.ai/papagaio/translate/?q=${encodeURIComponent(sel)}`;
  q('.copy').addEventListener('click', () => {
    navigator.clipboard?.writeText(current.answer?.translation ?? '');
    q('.copy').textContent = 'Copied';
  });

  // The word plus the sentence it was met in: a card without its context is a
  // word list, and word lists are what people abandon.
  q('.deck').addEventListener('click', () => {
    const btn = q('.deck');
    btn.textContent = '…';
    const payload = [sel, sentenceAround(sel)].filter(Boolean).join('. ');
    chrome.runtime.sendMessage({ kind: 'add', text: payload }, (r) => {
      if (r?.error === 'not paired') {
        btn.textContent = 'Pair first';
        note(q, 'Open the PapaGaio button in the toolbar and paste the code from /link in the bot — otherwise cards go to an account you will never open.');
        return;
      }
      if (!r?.ok) { btn.textContent = 'Failed'; return; }
      btn.textContent = r.added > 0 ? `✓ ${r.added} added` : '✓ known already';
    });
  });

  // The target chip cycles; the source is whatever the server detected, which
  // is why it says Auto until the answer comes back. Swapping means "give me
  // the other direction", the one thing a two-language reader keeps needing.
  q('.chip.to').textContent = NAMES[target];
  q('.chip.to').addEventListener('click', () => {
    const order = ['en', 'ru', 'pt'];
    target = order[(order.indexOf(target) + 1) % order.length];
    chrome.storage.local.set({ target });
    open(current.text, current.at);
  });
  q('.chip.from').textContent = NAMES.auto;
  q('.swap').addEventListener('click', () => {
    const detected = current.answer?.detected;
    if (!detected || detected === target) return;
    target = detected;
    chrome.storage.local.set({ target });
    open(current.answer.translation, current.at);
  });

  q('.spk-src').addEventListener('click', () =>
    speak(current.text, q('.spk-src'), current.answer?.detected ?? 'pt'));
  q('.spk-out').addEventListener('click', () =>
    speak(current.answer?.translation ?? '', q('.spk-out'), current.out ?? target));

  place(card, current.at);
  render();
}


/// The sentence the selection sits in, so the card carries its context. Falls
/// back to nothing rather than to a whole paragraph.
function sentenceAround(text) {
  const sel = window.getSelection();
  const block = sel?.anchorNode?.parentElement?.closest('p, li, td, blockquote, div');
  const full = (block?.innerText ?? '').replace(/\s+/g, ' ').trim();
  if (!full || full.length > 600) return '';
  const parts = full.split(/(?<=[.!?…])\s+/);
  return parts.find((p) => p.toLowerCase().includes(text.toLowerCase())) ?? '';
}

/// A one-off line under the answer — used when an action needs explaining
/// rather than silently failing.
function note(q, message) {
  const box = q('.body');
  const d = document.createElement('div');
  d.className = 'sense gloss';
  d.textContent = message;
  box.append(d);
}

function render() {
  const q = (x) => card.querySelector(x);
  chrome.runtime.sendMessage(
    { kind: 'translate', text: current.text, target, ui: target === 'pt' ? 'en' : target },
    (res) => {
      if (!card) return;
      if (!res?.ok) {
        q('.res').innerHTML = `<span class="err">${res?.error || 'No connection.'}</span>`;
        return;
      }
      current.answer = { ...res.t, examples: res.examples ?? [], words: res.words ?? [] };
      q('.res').textContent = res.t.translation;
      // Label both chips from the direction the server actually took, not from
      // what we asked for: selecting an English word while the target is
      // English makes the server translate into Portuguese instead, and a chip
      // reading "English → English" over a Portuguese answer is a lie.
      const [from, to] = String(res.t.direction ?? '').split('->');
      const src = res.t.detected || from;
      q('.chip.from').textContent = NAMES[src] ?? NAMES.auto;
      q('.chip.to').textContent = NAMES[to] ?? NAMES[target];
      current.out = to || target;
      // Only Portuguese and English have a voice: showing a speaker that
      // returns silence is a promise the product cannot keep.
      q('.spk-src').style.display = src === 'ru' ? 'none' : '';
      q('.spk-out').style.display = current.out === 'ru' ? 'none' : '';
      drawBody();
      place(card, current.at);
    }
  );
}

/// Two tabs, and only the ones that have something behind them. A tab that
/// opens onto nothing is worse than no tab.
function drawBody() {
  const a = current.answer;
  const body = card.querySelector('.body');
  body.innerHTML = '';

  const notes = [];
  if (a.br_diff?.length) {
    notes.push('🇵🇹 ' + a.br_diff.map((d) => `${d.pt} — in Brazil: ${d.br}`).join(' · '));
  }
  if (a.register && a.register !== 'neutral') notes.push('🗣 ' + a.register);
  if (a.corrections?.length) {
    notes.push('✏️ ' + a.corrections.slice(0, 2).map((c) => `${c.wrong} → ${c.right}`).join(' · '));
  }
  if (a.note) notes.push('ℹ️ ' + a.note);

  const has = { dict: (a.senses ?? []).length > 0, ex: (a.examples ?? []).length > 0 };
  if (has.dict || has.ex) {
    const tabs = document.createElement('div');
    tabs.className = 'tabs';
    const add = (key, label) => {
      const t = document.createElement('span');
      t.className = 'tab' + (current.tab === key ? ' on' : '');
      t.textContent = label;
      t.addEventListener('click', () => { current.tab = key; drawBody(); });
      tabs.append(t);
    };
    if (has.dict) add('dict', 'Dictionary');
    if (has.ex) add('ex', 'Examples');
    body.append(tabs);
    if (current.tab === 'dict' && !has.dict) current.tab = 'ex';
    if (current.tab === 'ex' && !has.ex) current.tab = 'dict';
  }

  if (current.tab === 'dict') {
    (a.senses ?? []).forEach((s, i) => {
      const box = document.createElement('div');
      box.className = 'sense';
      const head = document.createElement('div');
      head.innerHTML = `<span class="n">${i + 1}</span> `;
      for (const w of s.synonyms ?? []) {
        const chip = document.createElement('span');
        chip.className = 'syn';
        chip.textContent = w;
        head.append(chip);
      }
      // Antonyms are outlined rather than filled: a learner reaching for a
      // word must never grab the opposite one by mistake.
      for (const w of s.antonyms ?? []) {
        const chip = document.createElement('span');
        chip.className = 'syn ant';
        chip.textContent = '≠ ' + w;
        head.append(chip);
      }
      box.append(head);
      const g = document.createElement('div');
      g.className = 'gloss';
      g.textContent = s.pos ? `${s.gloss} · ${s.pos}` : s.gloss;
      box.append(g);
      body.append(box);
    });
  } else {
    for (const e of a.examples ?? []) {
      const d = document.createElement('div');
      d.className = 'sense';
      d.append(document.createTextNode(e.src));
      const i = document.createElement('div');
      i.className = 'gloss';
      i.textContent = e.dst;
      d.append(i);
      body.append(d);
    }
  }

  for (const line of notes) {
    const d = document.createElement('div');
    d.className = 'sense gloss';
    d.textContent = line;
    body.append(d);
  }
}

function speak(text, icon, lang) {
  const t = (text ?? '').trim();
  if (!t || lang === 'ru') return;
  icon.textContent = '⏳';
  chrome.runtime.sendMessage({ kind: 'tts', text: t, course: lang === 'en' ? 'en' : 'pt' }, (a) => {
    icon.textContent = '🔊';
    if (a?.ok) new Audio(a.audio).play().catch(() => {});
  });
}

document.addEventListener('mouseup', () => {
  // Let the click that dismisses the card land first.
  setTimeout(() => {
    const rect = selectionRect();
    const text = window.getSelection()?.toString().trim() ?? '';
    if (!rect || !text || text.length > 600) { clearPill(); return; }
    if (card) return; // a card is already answering
    showPill(rect, text);
  }, 10);
});

document.addEventListener('mousedown', (e) => {
  if (host && !e.composedPath().includes(host)) { clearPill(); close(); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { clearPill(); close(); } });

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.kind === 'open') open(msg.text);
});
