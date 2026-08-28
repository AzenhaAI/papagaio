// The typing half of the extension: same engine, no page needed.

const TARGETS = [['en', 'English'], ['ru', 'Русский'], ['pt', 'Português']];
let target = 'en';

const $ = (id) => document.getElementById(id);

chrome.storage.local.get('target').then(({ target: saved }) => {
  if (saved) target = saved;
  drawLangs();
});

function drawLangs() {
  const box = $('langs');
  box.innerHTML = '';
  for (const [code, name] of TARGETS) {
    const b = document.createElement('span');
    b.className = 'lang' + (code === target ? ' on' : '');
    b.textContent = name;
    b.addEventListener('click', () => {
      target = code;
      chrome.storage.local.set({ target: code });
      drawLangs();
      run();
    });
    box.append(b);
  }
}

let timer = null;
$('in').addEventListener('input', () => {
  clearTimeout(timer);
  // Typing is not a request: wait for a pause, or every keystroke costs a call.
  timer = setTimeout(run, 500);
});

function run() {
  const text = $('in').value.trim().slice(0, 600);
  if (!text) { $('out').textContent = ''; $('note').innerHTML = ''; return; }
  $('out').textContent = '…';
  chrome.runtime.sendMessage(
    { kind: 'translate', text, target, ui: target === 'pt' ? 'en' : target },
    (res) => {
      if (!res?.ok) { $('out').textContent = res?.error || 'No connection.'; return; }
      const t = res.t;
      $('out').textContent = t.translation;
      const notes = [];
      if (t.br_diff?.length) {
        notes.push('🇵🇹 ' + t.br_diff.map((d) => `${d.pt} — in Brazil: ${d.br}`).join(' · '));
      }
      if (t.register && t.register !== 'neutral') notes.push('🗣 ' + t.register);
      if (t.corrections?.length) {
        notes.push('✏️ ' + t.corrections.slice(0, 2).map((c) => `${c.wrong} → ${c.right}`).join(' · '));
      }
      if (t.note) notes.push('ℹ️ ' + t.note);
      for (const e of res.examples ?? []) notes.push(`💬 ${e.src} — ${e.dst}`);
      const box = $('note');
      box.innerHTML = '';
      for (const line of notes) {
        const d = document.createElement('div');
        d.textContent = line;
        box.append(d);
      }
    }
  );
}

// ---- pairing ----
//
// Adding a word to your deck only means something if it is YOUR deck. Without
// this, the extension writes into the anonymous account it minted on first use
// — which nobody will ever open — and the cards are effectively thrown away.

function drawPair() {
  const box = document.getElementById('pair');
  chrome.runtime.sendMessage({ kind: 'status' }, (r) => {
    if (r?.paired) {
      box.innerHTML = '<span class="ok">✓ Paired with your deck.</span> ' +
        'Words you add from a page land in it. <button id="unpair">Unpair</button>';
      document.getElementById('unpair').addEventListener('click', () => {
        chrome.runtime.sendMessage({ kind: 'unpair' }, drawPair);
      });
      return;
    }
    box.innerHTML =
      'To add words to your own deck, paste the code from <b>/link</b> in the ' +
      '<a href="https://t.me/papagaio_ebot" target="_blank">Telegram bot</a>.' +
      '<input id="code" placeholder="paste the code" autocomplete="off">' +
      '<button id="dopair">Pair</button> <span id="pairmsg"></span>';
    document.getElementById('dopair').addEventListener('click', () => {
      const code = document.getElementById('code').value.trim();
      const msg = document.getElementById('pairmsg');
      msg.textContent = '…';
      chrome.runtime.sendMessage({ kind: 'pair', code }, (res) => {
        if (!res?.ok) { msg.textContent = res?.error || 'failed'; return; }
        drawPair();
      });
    });
  });
}

drawPair();

// Pairing. Without it the extension studies a deck of its own, which is the
// worst kind of broken: the button works, the word is saved, and it is saved
// where nobody will ever see it.
const pairBox = document.getElementById('pair');
const pairState = document.getElementById('pairstate');

chrome.runtime.sendMessage({ kind: 'status' }, (res) => {
  if (res?.paired) markPaired();
});

function markPaired() {
  pairBox.classList.add('done');
  pairState.textContent = 'Connected — kept words go to your own deck.';
}

document.getElementById('pairbtn').addEventListener('click', () => {
  const code = document.getElementById('code').value.trim();
  if (!code) return;
  pairState.textContent = 'Checking…';
  chrome.runtime.sendMessage({ kind: 'pair', code }, (res) => {
    if (res?.ok) markPaired();
    else pairState.textContent = res?.error ?? 'That code was not accepted.';
  });
});
