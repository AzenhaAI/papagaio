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

function open(text, rect) {
  mount();
  close();
  const sel = (text ?? window.getSelection()?.toString() ?? '').trim().slice(0, 600);
  if (!sel) return;
  const at = rect ?? selectionRect() ?? { left: 20, top: 20, bottom: 20 };

  card = document.createElement('div');
  card.className = 'wrap';
  card.innerHTML = `
    <div class="head"><span class="brand">PapaGaio</span><span class="x">✕</span></div>
    <div class="body"><div class="src"></div><div class="out">…</div><div class="note"></div></div>
    <div class="langs"></div>
    <div class="acts">
      <span class="btn copy">Copy</span>
      <a class="btn" target="_blank" rel="noreferrer">Open PapaGaio</a>
    </div>`;
  root.append(card);

  const q = (s) => card.querySelector(s);
  q('.src').textContent = sel;
  q('.x').addEventListener('click', close);
  q('a.btn').href = `https://azenha.ai/papagaio/translate/?q=${encodeURIComponent(sel)}`;

  const langs = q('.langs');
  for (const [code, name] of TARGETS) {
    const b = document.createElement('span');
    b.className = 'lang' + (code === target ? ' on' : '');
    b.textContent = name;
    b.addEventListener('click', () => {
      if (code === target) return;
      target = code;
      chrome.storage.local.set({ target: code });
      open(sel, at);
    });
    langs.append(b);
  }

  place(card, at);
  render(sel, q, at);
}

function render(sel, q, at) {
  chrome.runtime.sendMessage(
    { kind: 'translate', text: sel, target, ui: target === 'pt' ? 'en' : target },
    (res) => {
      if (!card) return;
      if (!res?.ok) {
        q('.out').innerHTML = `<span class="err">${res?.error || 'No connection.'}</span>`;
        return;
      }
      const t = res.t;
      q('.out').textContent = t.translation;

      const notes = [];
      if (t.br_diff?.length) {
        notes.push('🇵🇹 ' + t.br_diff
          .map((d) => `${d.pt} — in Brazil: ${d.br}`)
          .join(' · '));
      }
      if (t.register && t.register !== 'neutral') notes.push('🗣 ' + t.register);
      if (t.corrections?.length) {
        notes.push('✏️ ' + t.corrections
          .slice(0, 2).map((c) => `${c.wrong} → ${c.right}`).join(' · '));
      }
      if (t.note) notes.push('ℹ️ ' + t.note);
      for (const w of res.words ?? []) {
        const gloss = target === 'ru' && w.trans_ru ? w.trans_ru : w.trans;
        if (gloss) {
          notes.push(`📖 ${w.term}${w.gender ? ` (${w.gender})` : ''} — ${String(gloss).slice(0, 160)}`);
        }
      }

      const note = q('.note');
      note.innerHTML = '';
      for (const line of notes) {
        const d = document.createElement('div');
        d.textContent = line;
        note.append(d);
      }
      for (const e of res.examples ?? []) {
        const d = document.createElement('div');
        d.className = 'ex';
        d.innerHTML = '💬 ';
        d.append(document.createTextNode(e.src));
        const i = document.createElement('i');
        i.textContent = ` — ${e.dst}`;
        d.append(i);
        note.append(d);
      }

      // Hearing it is half of learning a language you have to speak.
      const ptSide = t.direction?.endsWith('->pt') ? t.translation : t.source;
      if (ptSide) {
        const play = document.createElement('div');
        play.className = 'ex';
        play.style.cursor = 'pointer';
        play.textContent = '🔊 Listen';
        play.addEventListener('click', () => {
          play.textContent = '🔊 …';
          chrome.runtime.sendMessage({ kind: 'tts', text: ptSide }, (a) => {
            play.textContent = '🔊 Listen';
            if (a?.ok) new Audio(a.audio).play().catch(() => {});
          });
        });
        note.append(play);
      }

      q('.copy').addEventListener('click', () => {
        navigator.clipboard?.writeText(t.translation);
        q('.copy').textContent = 'Copied';
      });
      place(card, at);
    }
  );
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
