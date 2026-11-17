// The word-of-the-day pool for src/components/WordOfDay.astro: the hand-checked
// deck words (each has native audio and an example), in a fixed shuffled
// order. The browser picks entry (days since 1970, UTC) mod length, so every
// visitor sees the same word on the same day and no deploy is needed per day.
import data from '../data/words.json';

const first = (s) => String(s ?? '').split(/[;,/]| \(/)[0].trim();

// Deterministic shuffle (mulberry32): the order must not change between builds,
// or today's word would jump the moment the site is redeployed.
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function GET() {
  const pool = data.pages
    .filter((p) => !p.lex && p.audio && p.ex_t && p.ex_t.length <= 90 && p.term.length <= 24
      && !['drill', 'num'].includes(p.pos))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((p) => ({
      s: p.slug, t: p.term, p: p.pos, e: first(p.trans), r: first(p.meanings?.[0]?.ru ?? p.trans_ru),
      x: p.ex_t, xe: p.ex_trans, a: p.audio,
    }));
  const r = rng(2026);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return new Response(JSON.stringify(pool), { headers: { 'content-type': 'application/json' } });
}
