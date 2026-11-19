// The site's own share card (public/og.png, 1200x630): what a link to
// azenha.ai/papagaio unfurls with in Telegram, WhatsApp, Mail and search.
// Same look as the word cards (scripts/og_cards.mjs): dark panel, the flag
// stripe on top, the real app icon. The wording follows the A6 flyer.
//
//   node scripts/og_site.mjs          -> public/og.png
//
// Chats cache a card by its URL, so BaseLayout names it with ?v=<n>: bump that
// whenever this card is redrawn.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createRequire } from 'node:module';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const icon = readFileSync(join(site, 'public', 'icon-512.png')).toString('base64');
const F = "Helvetica Neue, Helvetica, Arial, sans-serif";

const items = [
  ['Dictionary', '110,000+ words, in English and Russian'],
  ['Audio', 'native voice and real examples'],
  ['Verbs', 'every verb in every tense'],
  ['Madeira', 'island words no textbook has'],
  ['Translator', 'Portugal’s Portuguese, not Brazil’s'],
  ['AI coach', 'practise real conversations'],
];
const list = items.map(([b, t], i) => {
  const y = 300 + i * 42;
  return `<circle cx="84" cy="${y - 8}" r="6" fill="#34d17b"/>
  <text x="104" y="${y}" font-family="${F}" font-size="25" fill="#e8efe9"><tspan font-weight="700">${b}</tspan><tspan fill="#9fb3a6" dx="9">— ${t}</tspan></text>`;
}).join('\n  ');

// The QR code: the same qrcode package and colours as the A6 flyer
// (papagaio_app/store/flyer/a6_cards.py), pointing at the site.
const require = createRequire(import.meta.url);
const QR = require('/opt/homebrew/lib/node_modules/openclaw/node_modules/qrcode');
const qr = (await QR.toString('https://azenha.ai/papagaio', { type: 'svg', errorCorrectionLevel: 'M', margin: 0,
  color: { dark: '#0e1a14', light: '#0000' } })).replace(/^<\?xml[^>]*>/, '').replace('<svg ', '<svg x="900" y="126" width="196" height="196" ');

// Store badges as on the flyer: Apple's logo and Play's four-colour triangle.
const APPLE = 'M16.37 12.7c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.23 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.4-.03 2.28-1.27 3.13-2.53.99-1.45 1.39-2.85 1.42-2.92-.03-.01-2.72-1.04-2.71-4.13zM13.79 5.07c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.27.68-3 1.54-.66.76-1.24 1.98-1.08 3.15 1.14.09 2.31-.58 3.02-1.44z';
const badge = (y, logo, small, big) => `<rect x="878" y="${y}" width="240" height="64" rx="12" fill="#000" stroke="#a6a6a6" stroke-width="2"/>
  <g transform="translate(896 ${y + 14}) scale(1.5)">${logo}</g>
  <text x="944" y="${y + 26}" font-family="${F}" font-size="14" fill="#dddddd">${small}</text>
  <text x="944" y="${y + 52}" font-family="${F}" font-size="27" font-weight="600" fill="#ffffff">${big}</text>`;
const appStore = badge(364, `<path fill="#fff" d="${APPLE}"/>`, 'Download on the', 'App Store');
const play = badge(442, '<path fill="#34d17a" d="M3.6 1.8 13.4 12 3.6 22.2c-.4-.2-.6-.6-.6-1.1V2.9c0-.5.2-.9.6-1.1z"/><path fill="#fbbc04" d="m16.8 8.6-3.4 3.4 3.4 3.4 3.9-2.2c1.1-.6 1.1-1.8 0-2.4z"/><path fill="#4285f4" d="M3.6 1.8c.3-.2.8-.2 1.3.1l11.9 6.7-3.4 3.4z"/><path fill="#ea4335" d="m13.4 12 3.4 3.4-11.9 6.7c-.5.3-1 .3-1.3.1z"/>', 'GET IT ON', 'Google Play');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0e1a14"/>
  <rect width="600" height="12" fill="#34d17b"/><rect x="600" width="600" height="12" fill="#d42a35"/>
  <clipPath id="r"><rect x="72" y="62" width="84" height="84" rx="19"/></clipPath>
  <image href="data:image/png;base64,${icon}" x="72" y="62" width="84" height="84" clip-path="url(#r)"/>
  <text x="178" y="128" font-family="${F}" font-size="62" font-weight="700" fill="#ffffff">PapaGaio <tspan fill="#34d17b">Portugal</tspan></text>
  <text x="72" y="214" font-family="${F}" font-size="36" fill="#e8efe9">Portuguese as Portugal speaks it</text>
  ${list}
  <text x="72" y="584" font-family="${F}" font-size="23" fill="#9fb3a6">Free · no ads · iPhone, Android, Mac, Windows and the web</text>
  <rect x="884" y="110" width="228" height="228" rx="18" fill="#ffffff"/>
  ${qr}
  ${appStore}
  ${play}
  <text x="998" y="562" text-anchor="middle" font-family="${F}" font-size="27" font-weight="700" fill="#34d17b">azenha.ai/papagaio</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(join(site, 'public', 'og.png'));
console.log('public/og.png written');
