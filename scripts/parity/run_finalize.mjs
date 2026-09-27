// Parity pipeline step — run from build/parity/ (paths are relative to it); gate rules: docs/parity/gate-rules.md, copied to build/parity/RULES.md.
// Gate verdicts of a run dir → accepted.json (with the exact D1 value each replaces) + rejected.json. Run: node run_finalize.mjs <dir>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const dir = process.argv[2];
const rows = new Map(JSON.parse(readFileSync(`${dir}/rows.json`)).map((r) => [r.id, r]));
const props = JSON.parse(readFileSync(`${dir}/proposals.json`));
const verdict = new Map();
for (const f of readdirSync(dir).filter((f) => /^gate_out_\d+\.json$/.test(f))) for (const v of JSON.parse(readFileSync(`${dir}/${f}`))) verdict.set(v.key, v);
const lint = (L, s) => {
  const e = [];
  if (!s.trim()) e.push('empty');
  if (L === 'ru' && /́/.test(s)) e.push('stress mark');
  if (L === 'ru' && !/[а-яё]/i.test(s)) e.push('no Cyrillic in ru');
  if (L === 'ru' && /[a-z][а-яё]|[а-яё][a-z]/i.test(s)) e.push('mixed-script word');
  const senses = s.split('; ');
  if (senses.length > 4) e.push('>4 senses');
  if (new Set(senses.map((x) => x.trim().toLowerCase())).size < senses.length) e.push('duplicate sense');
  if (s.length > { ru: 160, en: 260, pt: 400 }[L]) e.push('too long');
  if (/;;|; *$|^ *;/.test(s)) e.push('stray semicolon');
  return e;
};
const accepted = [], rejected = [];
for (const p of props) {
  const v = verdict.get(p.key);
  if (!v) throw new Error(`no verdict for ${p.key}`);
  if (!v.accept) { rejected.push({ ...p, gate: v.why }); continue; }
  const e = lint(p.layer, p.new);
  if (e.length) { rejected.push({ ...p, gate: `lint: ${e.join(', ')}` }); continue; }
  const d = rows.get(p.id)._d1, lexpt = p.id.startsWith('lexpt:');
  const old = p.layer === 'ru' ? d.trans_ru : p.layer === 'pt' ? d.def_pt : lexpt ? d.trans_en : d.trans;
  accepted.push({ id: p.id, layer: p.layer, old: old ?? null, new: p.new, why: p.why, term: p.term, pos: p.pos, oldShown: p.old });
}
writeFileSync(`${dir}/accepted.json`, JSON.stringify(accepted, null, 1));
writeFileSync(`${dir}/rejected.json`, JSON.stringify(rejected, null, 1));
const t = (a) => a.reduce((m, x) => ((m[x.layer] = (m[x.layer] ?? 0) + 1), m), {});
console.log('accepted', t(accepted), 'rejected', t(rejected));
