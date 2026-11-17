// Share cards (og:image, 1200x630) for the word pages.
//
// A link to a word page shared in a chat used to unfurl with the one generic
// site picture; a card that shows the word, its meaning and an example is what
// gets clicked. 11,000 PNGs would break the 20,000-file limit of the site, so
// they live in the R2 bucket behind audio.azenha.ai under og/ (no file limit,
// far inside the free storage), uploaded by scripts/upload_og_cards.sh.
//
//   node scripts/og_cards.mjs                 all word pages -> ../build/og/
//   node scripts/og_cards.mjs saudade casa    only these slugs (previews)
//
// Rendering: SVG through sharp (librsvg); system fonts (Helvetica Neue on the
// Mac that builds). Only pages whose PNG exists get the card: src/lib/og.js.
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..');
const out = join(site, '..', 'build', 'og');
const data = JSON.parse(readFileSync(join(site, 'src', 'data', 'words.json'), 'utf8'));
const icon = readFileSync(join(site, 'public', 'icon-192.png')).toString('base64');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const first = (s) => String(s ?? '').split(/[;,/]| \(/)[0].trim();
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);
const POS = { noun: 'noun', verb: 'verb', adj: 'adjective', adv: 'adverb', phrase: 'phrase', interj: 'interjection',
  num: 'number', pron: 'pronoun', conj: 'conjunction', prep: 'preposition', det: 'determiner' };

function svg(p) {
  const term = cut(String(p.term), 44);
  // Bold Helvetica runs about 0.6 em a character; 1056 px is the width inside the margins.
  const size = Math.max(40, Math.min(132, Math.floor(1056 / (Math.max(term.length, 6) * 0.6))));
  const en = cut(first(p.trans) || '', 44);
  const ru = cut(first(p.meanings?.[0]?.ru ?? p.trans_ru) || '', 44);
  const pos = [POS[p.pos] ?? p.pos, p.gender === 'm' ? 'masculine' : p.gender === 'f' ? 'feminine' : null].filter(Boolean).join(', ');
  const ex = p.ex_t ? cut(p.ex_t, 62) : '';
  const F = "Helvetica Neue, Helvetica, Arial, sans-serif";
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0e1a14"/>
  <rect x="0" y="0" width="1200" height="10" fill="#34d17b"/>
  <rect x="0" y="10" width="600" height="6" fill="#1c6b3f"/><rect x="600" y="10" width="600" height="6" fill="#c8102e"/>
  <image x="72" y="62" width="64" height="64" xlink:href="data:image/png;base64,${icon}"/>
  <text x="152" y="104" font-family="${F}" font-size="30" font-weight="700" fill="#e8f2ea">PapaGaio</text>
  <text x="300" y="104" font-family="${F}" font-size="26" fill="#8fa898">European Portuguese (pt-PT)</text>
  <text x="72" y="${236 + size * 0.35}" font-family="${F}" font-size="${size}" font-weight="700" fill="#ffffff">${esc(term)}</text>
  ${pos ? `<text x="76" y="${300 + size * 0.35}" font-family="${F}" font-size="28" font-style="italic" fill="#8fa898">${esc(pos)}</text>` : ''}
  <text x="72" y="${372 + size * 0.3}" font-family="${F}" font-size="46" font-weight="600" fill="#34d17b">${esc(en)}</text>
  ${ru ? `<text x="72" y="${430 + size * 0.3}" font-family="${F}" font-size="38" fill="#c9dccf">${esc(ru)}</text>` : ''}
  ${ex ? `<text x="72" y="580" font-family="${F}" font-size="30" font-style="italic" fill="#8fa898">«${esc(ex)}»</text>` : ''}
  <text x="1128" y="104" text-anchor="end" font-family="${F}" font-size="24" fill="#8fa898">azenha.ai/papagaio</text>
</svg>`;
}

const only = process.argv.slice(2);
const pages = only.length ? data.pages.filter((p) => only.includes(p.slug)) : data.pages;
mkdirSync(out, { recursive: true });
let made = 0;
for (const p of pages) {
  const file = join(out, `${p.slug}.png`);
  if (!only.length && existsSync(file)) continue;
  await sharp(Buffer.from(svg(p))).png({ compressionLevel: 9, palette: true }).toFile(file);
  if (++made % 500 === 0) process.stderr.write(`\r${made} cards`);
}
process.stderr.write(`\r${made} cards -> ${out}\n`);
