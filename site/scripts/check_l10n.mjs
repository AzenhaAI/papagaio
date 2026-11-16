// Every [data-th="<id>"] in the pages and components has a Portuguese and a
// Russian entry in src/lib/l10n/, ids are unique, and no entry is orphaned.
// Fast (no build): node scripts/check_l10n.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFragment } from 'parse5';
import { th } from '../src/lib/l10n/index.js';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const files = ['pages', 'components'].flatMap((d) =>
  readdirSync(join(src, d)).filter((f) => f.endsWith('.astro')).map((f) => join(src, d, f)));
const seen = new Map();
let bad = 0;
for (const f of files) {
  for (const m of readFileSync(f, 'utf8').matchAll(/data-th="([^"]+)"/g)) {
    const id = m[1];
    if (seen.has(id)) { console.log(`duplicate id ${id}: ${seen.get(id)} and ${f}`); bad++; }
    seen.set(id, f);
    for (const lang of ['pt', 'ru']) {
      const h = th(lang, id);
      if (h == null) { console.log(`missing ${lang} ${id}`); bad++; continue; }
      // Markup must survive a round trip: an unclosed tag would swallow the page.
      const frag = parseFragment(h);
      if (/<(\w+)\b[^>]*>(?![\s\S]*<\/\1>)/.test(h.replace(/<(br|img|wbr|hr)\b[^>]*>/g, '')) ) { console.log(`unclosed tag in ${lang} ${id}`); bad++; }
      if (!frag.childNodes.length) { console.log(`empty ${lang} ${id}`); bad++; }
    }
  }
}
const mods = readdirSync(join(src, 'lib', 'l10n')).filter((f) => f !== 'index.js');
for (const f of mods) {
  const mod = (await import(join(src, 'lib', 'l10n', f))).default;
  for (const lang of ['pt', 'ru']) for (const id of Object.keys(mod[lang] ?? {})) {
    if (!seen.has(id)) { console.log(`orphan ${lang} ${id} in ${f}`); bad++; }
  }
}
console.log(`${seen.size} blocks, ${bad} problems`);
process.exit(bad ? 1 : 0);
