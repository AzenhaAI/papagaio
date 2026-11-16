// Wide dictionary search from a precomputed token index shipped with the Worker
// (scripts/build_search_index.mjs builds it). One small shard file per query
// token replaces a scan of the whole lexicon; D1 then reads only the rows
// that matched, by primary key.

export const SHARDS = 1024;
export const CAP = 100;

/** Shard number of a token: FNV-1a over its first three characters, so every
 *  token sharing a 3-letter start lives in one file and a prefix query reads
 *  exactly one shard. */
export function shardOf(token) {
  let h = 0x811c9dc5;
  for (const ch of token.slice(0, 3)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % SHARDS;
}

/** Russian as stored, compared the way people type it: lower case, no stress marks. */
export const ruNorm = (s) => String(s ?? '').toLowerCase().replace(/́/g, '');

/** Words of 3+ characters; the same rule at build time and at query time. */
export const tokens = (s) => String(s ?? '').split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 3);

// Shards are small and immutable until the next upload, so an isolate keeps
// the last few it read.
const kept = new Map();
const KEEP = 24;

async function shard(env, course, n) {
  const key = `${course}/${n}.json`;
  if (kept.has(key)) {
    const v = kept.get(key);
    kept.delete(key);
    kept.set(key, v);
    return v;
  }
  // The files ship with the Worker as static assets (wrangler.toml [assets],
  // directory build/search_index), so code and index always deploy together.
  const res = await env.SEARCH_FILES.fetch(`https://index.local/${key}`);
  if (!res.ok) throw new Error(`search index shard missing: ${key} (${res.status})`);
  const v = await res.json();
  kept.set(key, v);
  if (kept.size > KEEP) kept.delete(kept.keys().next().value);
  return v;
}

/** Cards whose words match one token: the token itself (tier 1, a whole
 *  word, like `fold LIKE '% s %'`) or a word starting with it (tier 3). */
async function matchToken(env, course, t) {
  const s = await shard(env, course, shardOf(t));
  const hits = new Map();
  for (const [id, freq] of s[t] ?? []) hits.set(id, { tier: 1, freq });
  for (const k of Object.keys(s)) {
    if (k === t || !k.startsWith(t)) continue;
    for (const [id, freq] of s[k]) if (!hits.has(id)) hits.set(id, { tier: 3, freq });
  }
  return hits;
}

/** A phrase matches cards holding all its words; the last may be unfinished. */
async function matchPhrase(env, course, text) {
  const ts = tokens(text);
  if (!ts.length) return new Map();
  let acc = null;
  for (const t of ts) {
    const m = await matchToken(env, course, t);
    if (!acc) { acc = m; continue; }
    const next = new Map();
    for (const [id, a] of acc) {
      const b = m.get(id);
      if (b) next.set(id, { tier: Math.max(a.tier, b.tier), freq: a.freq });
    }
    acc = next;
  }
  return acc;
}

/**
 * Ranked card ids for the wide search, or null when no index is bound (local
 * dev without the [assets] index) so the caller can fall back. `texts` are the forms
 * to look up: the folded query, and for Russian input the raw and lemma forms.
 */
export async function indexSearch(env, course, texts, limit = 25) {
  if (!env.SEARCH_FILES) return null;
  const best = new Map();
  for (const text of new Set(texts.filter(Boolean))) {
    for (const [id, h] of await matchPhrase(env, course, text)) {
      const was = best.get(id);
      if (!was || h.tier < was.tier) best.set(id, h);
    }
  }
  return [...best.entries()]
    .sort((a, b) => a[1].tier - b[1].tier || a[1].freq - b[1].freq || (a[0] < b[0] ? -1 : 1))
    .slice(0, limit)
    .map(([id]) => id);
}

// ---- Example sentences (Tatoeba pairs) -------------------------------------
// The same idea for /api/examples, whose instr() over the sentence column read
// the whole pair, 60–90k rows a look-up (1.07M rows in 18 runs, 15.11.2026).
// Per pair: word -> [[rowid, rank], ...], rank = sentence length, plus a
// million when the pair was pivoted through English (direct pairs first), so
// the lists come pre-sorted the way the old ORDER BY sorted them. Words of 2+
// letters count here: "eu", "ir", "lá" are what example sentences are for.

export const EX_SHARDS = 512;
export const EX_CAP = 60;
export const exTokens = (s) => String(s ?? '').split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2);
export const exShardOf = (t) => shardOf(t) % EX_SHARDS;

/** Rowids of the best example sentences holding any of `forms` (each form a
 *  word or a phrase, already folded), best first; null without the [assets] index. */
export async function exampleIds(env, pair, forms, limit) {
  if (!env.SEARCH_FILES) return null;
  const best = new Map();
  for (const form of forms) {
    const ts = exTokens(form);
    let acc = null;
    for (const t of ts) {
      const s = await shard(env, `ex-${pair}`, exShardOf(t));
      const m = new Map(s[t] ?? []);
      acc = acc ? new Map([...acc].filter(([id]) => m.has(id))) : m;
      if (!acc.size) break;
    }
    for (const [id, rank] of acc ?? []) best.set(id, rank);
  }
  return [...best].sort((a, b) => a[1] - b[1] || a[0] - b[0]).slice(0, limit).map(([id]) => id);
}
