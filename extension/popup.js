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
