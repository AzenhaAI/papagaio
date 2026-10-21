// The link preview (og.png, 1200x630) from the same mark as the app icon and
// the favicon. It was a hand-drawn circle with a beak — the bird from before
// the icon existed — and every link pasted into a chat showed it.
//
//   node scripts/make_og.mjs      (cwd: papagaio/site)
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { flagBack, parrot, svg } from '../../scripts/mark.mjs';
const __dirname = dirname(fileURLToPath(import.meta.url));

const W = 1200, H = 630, I = 300;
const icon = await sharp(Buffer.from(svg(I, flagBack(I) + parrot(I, 0.62))))
  .composite([{ input: Buffer.from(`<svg width="${I}" height="${I}"><rect width="${I}" height="${I}" rx="${Math.round(I * 0.225)}" fill="#fff"/></svg>`), blend: 'dest-in' }])
  .png().toBuffer();
const text = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="#0e1a14"/>
<rect width="${W / 2}" height="8" fill="#2fd27a"/><rect x="${W / 2}" width="${W / 2}" height="8" fill="#e5484d"/>
<text x="470" y="250" font-family="Inter, Helvetica Neue, Arial" font-weight="800" font-size="104" fill="#eef4ef">PapaGaio</text>
<rect x="474" y="278" width="150" height="8" rx="4" fill="#2fd27a"/><rect x="624" y="278" width="150" height="8" rx="4" fill="#e5484d"/>
<text x="474" y="350" font-family="Inter, Helvetica Neue, Arial" font-size="38" fill="#cfdcd3">European Portuguese, the way</text>
<text x="474" y="398" font-family="Inter, Helvetica Neue, Arial" font-size="38" fill="#cfdcd3">Portugal speaks it.</text>
<text x="474" y="470" font-family="Inter, Helvetica Neue, Arial" font-weight="600" font-size="30" fill="#2fd27a">AI Coach · Dictionary · Translator</text>
<text x="474" y="520" font-family="Inter, Helvetica Neue, Arial" font-size="26" fill="#8fa596">Free · iPhone · Android · Mac · Windows</text>
</svg>`);
await sharp(text).composite([{ input: icon, left: 110, top: Math.round((H - I) / 2) }])
  .png().toFile(join(__dirname, '../public/og.png'));
console.log('og.png written');
