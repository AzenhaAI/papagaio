// Mechanical clean-up of a Russian gloss: only changes that cannot alter what
// the gloss means, so they may skip the model gate.
//
//   - stress marks (U+0301) removed — the parity rules ask for none;
//   - senses split on top-level "; " (never inside parentheses), trimmed,
//     empties dropped, exact repeats dropped (case-insensitive);
//   - inside a sense, exact repeats in a comma list dropped the same way;
//   - runs of spaces collapsed.
//
// Everything else a gloss can get wrong (wrong word, part of speech, padding
// phrases) needs judgement; flagRu() only points at the cheap-to-detect cases.

const splitTop = (s, sep) => {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    else if ((ch === ')' || ch === ']') && depth > 0) depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
};

const uniq = (parts) => {
  const seen = new Set();
  return parts.map((p) => p.trim()).filter((p) => {
    const k = p.toLowerCase();
    if (!p || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

export function cleanRu(s) {
  if (s == null) return s;
  const flat = String(s).replace(/́/g, '').replace(/[ \t ]+/g, ' ').trim();
  const senses = uniq(splitTop(flat, ';')).map((sense) => uniq(splitTop(sense, ',')).join(', '));
  return uniq(senses).join('; ');
}

// What a person or the gate should look at; nothing here is rewritten.
export function flagRu(s) {
  const f = [];
  if (!s) return f;
  if (/[a-z][а-яё]|[а-яё][a-z]/i.test(s)) f.push('mixed-script');
  if (!/[а-яё]/i.test(s)) f.push('no-cyrillic');
  if (/…|\.\.\.$/.test(s)) f.push('truncated');
  if (splitTop(s, ';').length > 4) f.push('>4 senses');
  if (s.length > 160) f.push('long');
  return f;
}
