// Parity pipeline step — run from build/parity/ (paths are relative to it); gate rules: docs/parity/gate-rules.md, copied to build/parity/RULES.md.
// Merge edit outputs of a run dir into gate proposals, split into gate batches. Run: node run_gate_prep.mjs <dir> [perGate]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const dir = process.argv[2], per = Number(process.argv[3] ?? 150);
const n = readdirSync(dir).filter((f) => /^edit_in_\d+\.json$/.test(f)).length;
const props = [], stat = { rows: 0, keep: { en: 0, ru: 0, pt: 0 }, change: { en: 0, ru: 0, pt: 0 }, fill: { en: 0, ru: 0, pt: 0 } };
for (let b = 0; b < n; b++) {
  const inp = JSON.parse(readFileSync(`${dir}/edit_in_${b}.json`)), out = JSON.parse(readFileSync(`${dir}/edit_out_${b}.json`));
  if (out.length !== inp.length) throw new Error(`batch ${b} length`);
  out.forEach((o, k) => {
    const r = inp[k]; if (o.id !== r.id) throw new Error(`misaligned ${b}:${k}`); stat.rows++;
    for (const L of ['en', 'ru', 'pt']) {
      const c = o[L];
      if (!c || c.new == null || String(c.new).trim() === (r[L] ?? '')) { stat.keep[L]++; continue; }
      (r[L] == null ? stat.fill : stat.change)[L]++;
      props.push({ key: `${r.id}#${L}`, id: r.id, term: r.term, pos: r.pos, gender: r.gender, layer: L,
        old: r[L], new: String(c.new).trim(), why: c.why, context: { en: r.en, ru: r.ru, pt: r.pt } });
    }
  });
}
writeFileSync(`${dir}/proposals.json`, JSON.stringify(props, null, 1));
const g = Math.ceil(props.length / per);
for (let i = 0; i < g; i++) writeFileSync(`${dir}/gate_in_${i}.json`, JSON.stringify(props.slice(i * per, (i + 1) * per), null, 1));
console.log(JSON.stringify(stat), 'proposals', props.length, 'gate batches', g);
