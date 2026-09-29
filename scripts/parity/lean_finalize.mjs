// Parity pipeline step — run from build/parity/ (paths are relative to it).
// out_*.json (changed fields only) → accepted.json with the exact D1 value each replaces, after the mechanical lint.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const dir = process.argv[2];
const d1 = JSON.parse(readFileSync(`${dir}/d1.json`));
const lint = (L, s) => {
  const e = [];
  if (!s || !String(s).trim()) e.push('empty');
  if (L === 'ru' && !/[а-яё]/i.test(s)) e.push('no Cyrillic');
  if (L === 'ru' && /́/.test(s)) e.push('stress mark');
  if (L === 'ru' && /[a-z][а-яё]|[а-яё][a-z]/i.test(s)) e.push('mixed-script word');
  const senses = s.split('; ');
  if (senses.length > 4) e.push('>4 senses');
  if (new Set(senses.map((x) => x.trim().toLowerCase())).size < senses.length) e.push('duplicate sense');
  if (s.length > { ru: 160, en: 260, pt: 400 }[L]) e.push('too long');
  if (/;;|; *$|^ *;/.test(s)) e.push('stray semicolon');
  return e;
};
const accepted = [], rejected = [];
for (const f of readdirSync(dir).filter((f) => /^out_\d+\.json$/.test(f))) {
  for (const o of JSON.parse(readFileSync(`${dir}/${f}`))) {
    const r = d1[o.id];
    for (const L of ['en', 'ru', 'pt']) {
      if (o[L] == null) continue;
      const v = String(o[L]).trim(), e = lint(L, v);
      const old = L === 'ru' ? r.ru : L === 'pt' ? r.pt : r.en;
      if (v === (old ?? '')) continue;
      if (e.length) { rejected.push({ id: o.id, layer: L, new: v, lint: e }); continue; }
      accepted.push({ id: o.id, layer: L, old: old ?? null, new: v, why: 'lean pass', term: r.term, pos: r.pos, oldShown: old });
    }
  }
}
writeFileSync(`${dir}/accepted.json`, JSON.stringify(accepted, null, 1));
writeFileSync(`${dir}/rejected.json`, JSON.stringify(rejected, null, 1));
const t = (a) => a.reduce((m, x) => ((m[x.layer] = (m[x.layer] ?? 0) + 1), m), {});
console.log('accepted', t(accepted), 'lint-rejected', t(rejected));
