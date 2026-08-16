// JSON API shared by the bot, the website and the future mobile app.
// The Worker is an API first; the Telegram bot is one client of it.

import { translate } from './translate.js';
import { schedule } from './fsrs.js';
import { ensureEntry, lookupWord } from './entry.js';
import { SCENARIOS, LEVELS, coachTurn, coachRecap, scenarioList } from './coach.js';
import { chat, transcribe } from './groq.js';
import { readAndTranslate } from './vision.js';
import { lookupWiki } from './wiki.js';
import { synthesize } from './tts.js';
import { analyse } from './read.js';
import { buildStats } from './stats.js';
import { recordMistakes } from './mistakes.js';
import { courseMap, lessonById, lessonScene, checkGoal, completeLesson } from './course.js';
import { conjugate } from './conjugate.js';
import { VERBS, findVerb, fold } from './verbs.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, x-device-token',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
  });

// Public translate endpoint powers the website, so it needs a cheap abuse guard.
// Live-translate fires on typing pauses, so the cap is per-request, not per-phrase.
const PUBLIC_DAILY_CAP = 500;

async function underPublicCap(env, request) {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const day = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare(
    `INSERT INTO api_usage (day, ip, n) VALUES (?, ?, 1)
     ON CONFLICT(day, ip) DO UPDATE SET n = n + 1
     RETURNING n`
  ).bind(day, ip).first();
  return (row?.n ?? 0) <= PUBLIC_DAILY_CAP;
}

/**
 * The lemma a Portuguese word form belongs to, or null.
 *
 * Verbs go through the conjugation engine backwards — every form of all 439
 * verbs is generated and compared, which is how "olhare" finds olhar. Nouns
 * and adjectives get the plural rules, which are pure orthography in
 * Portuguese: -ões/-ães/-ais/-is/-ns and the plain -s/-es.
 */
// Built once per isolate, not per request: 439 verbs × a dozen tenses is a
// lot of string work to redo on every dictionary miss.
let VERB_FORMS = null;
function verbForms() {
  if (VERB_FORMS) return VERB_FORMS;
  VERB_FORMS = new Map();
  for (const v of VERBS) {
    const inf = v.inf.replace(/-se$/, '');
    const c = conjugate(inf);
    if (!c) continue;
    for (const [tense, forms] of Object.entries(c)) {
      for (const f of [forms].flat()) {
        if (typeof f !== 'string' || !f) continue;
        const k = fold(f);
        // First verb wins: the frequency-ordered list puts the common one
        // first, so "for" resolves to ser/ir the way a learner expects.
        if (!VERB_FORMS.has(k)) VERB_FORMS.set(k, { word: inf, kind: 'verb', tense, gloss: v.gloss });
      }
    }
  }
  return VERB_FORMS;
}

/**
 * Lemmas a Portuguese word form might belong to, best guess first.
 *
 * Verbs come from the conjugation engine run backwards — that is how "olhare"
 * finds olhar. Nouns and adjectives get the plural rules, which in Portuguese
 * are pure orthography: -ões/-ães/-ais/-éis/-is/-ns and the plain -s/-es.
 */
function lemmaCandidates(folded, course) {
  if (course !== 'pt' || !folded || folded.includes(' ')) return [];
  const out = [];
  const verb = verbForms().get(folded);
  if (verb && verb.word !== folded) out.push(verb);

  const plural = (w) => ({ word: w, kind: 'plural' });
  if (folded.endsWith('oes')) out.push(plural(`${folded.slice(0, -3)}ao`));
  if (folded.endsWith('aes')) out.push(plural(`${folded.slice(0, -3)}ao`));
  if (folded.endsWith('ais')) out.push(plural(`${folded.slice(0, -3)}al`));
  if (folded.endsWith('eis')) out.push(plural(`${folded.slice(0, -3)}el`));
  if (folded.endsWith('ois')) out.push(plural(`${folded.slice(0, -3)}ol`));
  if (folded.endsWith('uis')) out.push(plural(`${folded.slice(0, -3)}ul`));
  if (folded.endsWith('is')) out.push(plural(`${folded.slice(0, -2)}il`));
  if (folded.endsWith('ns')) out.push(plural(`${folded.slice(0, -2)}m`));
  if (folded.endsWith('es')) out.push(plural(folded.slice(0, -2)));
  if (folded.endsWith('s')) out.push(plural(folded.slice(0, -1)));
  // Last resort, a typo guard: one letter too many turns olhar into "olhare",
  // and a dictionary that answers "nothing" to that is being pedantic.
  if (folded.length >= 5) out.push({ word: folded.slice(0, -1), kind: 'spelling' });
  return out.filter((c) => c.word.length >= 2 && c.word !== folded);
}

/** Resolves x-device-token to a user id, or null. */
async function authUser(env, request) {
  const token = request.headers.get('x-device-token');
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT user_id FROM devices WHERE token = ?`
  ).bind(token).first();
  return row?.user_id ?? null;
}

export async function handleApi(request, env, path) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  // ---- public ----

  if (path === '/api/translate' && request.method === 'POST') {
    if (!env.GROQ_API_KEY) return json({ error: 'translator not configured' }, 503);
    if (!(await underPublicCap(env, request))) return json({ error: 'daily limit reached' }, 429);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid json' }, 400);
    }
    if (!body?.text?.trim()) return json({ error: 'text is required' }, 400);
    try {
      const t = await translate(env, body.text, body.direction, body.ui);
      // Corrections land in the ledger — the recurring ones become cards.
      if (t.corrections?.length) {
        const who = await authUser(env, request).catch(() => null);
        if (who) await recordMistakes(env, who, t.corrections, 'translate').catch(() => {});
      }
      return json(t);
    } catch (e) {
      return json({ error: e.message }, 502);
    }
  }

  if (path === '/api/tts' && request.method === 'POST') {
    if (!(await underPublicCap(env, request))) return json({ error: 'daily limit reached' }, 429);
    const body = await request.json().catch(() => null);
    const text = String(body?.text ?? '').trim().slice(0, 300);
    if (!text) return json({ error: 'text is required' }, 400);
    const course = body?.course === 'en' ? 'en' : 'pt';

    // Same phrase → same audio; cache it at the edge for a week.
    const cache = caches.default;
    const key = new Request(
      `https://papagaio.cache/tts/${course}/${encodeURIComponent(text)}`
    );
    const hit = await cache.match(key);
    if (hit) return hit;

    try {
      const audio = await synthesize(text, course);
      const resp = new Response(audio, {
        headers: {
          'content-type': 'audio/mpeg',
          'cache-control': 'public, max-age=604800',
          ...CORS,
        },
      });
      await cache.put(key, resp.clone());
      return resp;
    } catch (e) {
      return json({ error: 'tts failed: ' + e.message }, 502);
    }
  }

  if (path === '/api/deck' && request.method === 'GET') {
    const url = new URL(request.url);
    const course = url.searchParams.get('course') ?? 'pt';
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 2000);
    const { results } = await env.DB.prepare(
      `SELECT id, course, term, trans, trans_ru, trans_pt, pos, gender, note, ex_t, ex_trans, tags, freq, audio, unit, entry
       FROM cards WHERE course = ? AND owner IS NULL AND pos IS NOT 'drill'
       ORDER BY freq LIMIT ?`
    ).bind(course, limit).all();
    return json({ course, count: results.length, cards: results });
  }

  if (path.startsWith('/api/card/') && request.method === 'GET') {
    const id = decodeURIComponent(path.slice('/api/card/'.length));
    const card = await env.DB.prepare(
      `SELECT * FROM cards WHERE id = ? AND owner IS NULL`
    ).bind(id).first();
    return card ? json(card) : json({ error: 'not found' }, 404);
  }

  // Reading mode. Public, but a device token turns it from a glossing tool into
  // a progress-aware reader: words you already know stop being highlighted.
  if (path === '/api/read' && request.method === 'POST') {
    if (!env.GROQ_API_KEY) return json({ error: 'reader not configured' }, 503);
    if (!(await underPublicCap(env, request))) return json({ error: 'daily limit reached' }, 429);
    const body = await request.json().catch(() => null);
    if (!body?.text?.trim()) return json({ error: 'text is required' }, 400);
    try {
      return json(await analyse(env, body.text, await authUser(env, request)));
    } catch (e) {
      return json({ error: e.message }, 502);
    }
  }

  // Photo in, phrase out. One round trip does the reading and the translation,
  // which is why this is not on-device OCR.
  if (path === '/api/vision' && request.method === 'POST') {
    if (!env.GROQ_API_KEY) return json({ error: 'translator not configured' }, 503);
    if (!(await underPublicCap(env, request))) return json({ error: 'daily limit reached' }, 429);
    const body = await request.json().catch(() => null);
    const image = String(body?.image ?? '');
    if (!image) return json({ error: 'image is required' }, 400);
    try {
      const out = await readAndTranslate(env, image, body?.direction);
      if (!out.source) return json({ error: 'no text found in that picture' }, 422);
      return json(out);
    } catch (e) {
      return json({ error: e.message }, 502);
    }
  }

  // An account without Telegram. The bot is one way in, not the only one: the
  // app can create its own user and token, and everything except the chat
  // works the same. Ids are negative so they can never collide with a Telegram
  // user id, and chat_id < 0 is what keeps the cron push away from them.
  if (path === '/api/device' && request.method === 'POST') {
    if (!(await underPublicCap(env, request))) return json({ error: 'daily limit reached' }, 429);
    const body = await request.json().catch(() => ({}));
    const courses = body?.courses === 'en' || body?.courses === 'pt,en' ? body.courses : 'pt';

    const row = await env.DB.prepare(
      `SELECT MIN(id) AS lo FROM users WHERE id < 0`
    ).first();
    const id = Math.min(-1, (row?.lo ?? 0) - 1);

    const token = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (id, chat_id, name, courses, created_at) VALUES (?, ?, 'app', ?, ?)`
      ).bind(id, id, courses, new Date().toISOString()),
      env.DB.prepare(
        `INSERT INTO devices (token, user_id, label, created_at) VALUES (?, ?, 'app', ?)`
      ).bind(token, id, new Date().toISOString()),
    ]);
    return json({ token, courses });
  }

  // The dictionary article, written on first request and kept forever, so a
  // word costs one model call in its whole life. Public like /api/translate —
  // the cap is what stops it being a free LLM endpoint for the internet.
  if (path.startsWith('/api/entry/') && request.method === 'GET') {
    const id = decodeURIComponent(path.slice('/api/entry/'.length));
    const ui = new URL(request.url).searchParams.get('ui') === 'ru' ? 'ru' : 'en';
    const card = await env.DB.prepare(`SELECT * FROM cards WHERE id = ?`).bind(id).first();
    if (!card) return json({ error: 'not found' }, 404);
    if (!card[ui === 'ru' ? 'entry_ru' : 'entry'] && !(await underPublicCap(env, request))) {
      return json({ error: 'daily limit reached' }, 429);
    }
    try {
      return json({ id, entry: await ensureEntry(env, card, ui) });
    } catch (e) {
      return json({ error: e.message }, 502);
    }
  }

  // What Wikipedia has on the word, in both languages. Not every word has an
  // encyclopedia behind it — "levada" does, "obrigado" does not — so an empty
  // answer is a normal answer. Cached at the edge for a day: the summaries
  // barely move and this is somebody else's server.
  if (path.startsWith('/api/wiki/') && request.method === 'GET') {
    const id = decodeURIComponent(path.slice('/api/wiki/'.length));
    const card = await env.DB.prepare(
      `SELECT term, trans, pos FROM cards WHERE id = ?`
    ).bind(id).first();
    if (!card) return json({ error: 'not found' }, 404);

    const cache = caches.default;
    // Version in the key: bumping it retires every cached answer at once.
    const key = new Request(`https://papagaio.cache/wiki/v4/${encodeURIComponent(id)}`);
    const hit = await cache.match(key);
    if (hit) return hit;

    try {
      const found = await lookupWiki(card.term, card.trans, card.pos);
      const resp = new Response(JSON.stringify({ id, ...found }), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'public, max-age=86400',
          ...CORS,
        },
      });
      await cache.put(key, resp.clone());
      return resp;
    } catch (e) {
      return json({ error: e.message }, 502);
    }
  }

  // The product's headline numbers, computed from the data rather than typed
  // into pages that instantly go stale. Cached at the edge for an hour.
  if (path === '/api/counts' && request.method === 'GET') {
    const cache = caches.default;
    const key = new Request('https://papagaio.cache/counts/v3');
    const hit = await cache.match(key);
    if (hit) return hit;
    const row = await env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM cards WHERE course='pt' AND owner IS NULL AND pos IS NOT 'drill') AS pt_cards,
        (SELECT COUNT(*) FROM cards WHERE course='pt' AND owner IS NULL AND pos='drill') AS pt_drills,
        (SELECT COUNT(*) FROM cards WHERE course='en' AND owner IS NULL) AS en_cards,
        (SELECT COUNT(*) FROM cards WHERE owner IS NULL AND tags LIKE '%"frase"%') AS frases,
        (SELECT COUNT(*) FROM cards WHERE owner IS NULL AND unit='fado') AS fado,
        (SELECT COUNT(*) FROM cards WHERE owner='lex') AS lexicon,
        -- The Lingvo shelf: how many entries each layer holds, shown right in
        -- the dictionary header so the shelf is visible, not folklore.
        (SELECT COUNT(*) FROM cards WHERE id LIKE 'lex:%' AND course='pt') AS lex_pt_en,
        (SELECT COUNT(*) FROM cards WHERE id LIKE 'lexpt:%') AS lex_pt_def,
        (SELECT COUNT(*) FROM cards WHERE owner='lex' AND course='pt' AND trans_ru IS NOT NULL) AS lex_pt_ru,
        (SELECT COUNT(*) FROM cards WHERE id LIKE 'lexen:%') AS lex_en,
        (SELECT COUNT(*) FROM cards WHERE owner='lex' AND course='en' AND trans_ru IS NOT NULL) AS lex_en_ru,
        (SELECT COUNT(*) FROM cards WHERE owner='lex' AND course='en' AND trans_pt IS NOT NULL) AS lex_en_pt,
        (SELECT COUNT(*) FROM examples) AS examples`
    ).first();
    const resp = new Response(JSON.stringify({ ...row, verbs: VERBS.length }), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=3600',
        ...CORS,
      },
    });
    await cache.put(key, resp.clone());
    return resp;
  }

  // A dictionary that only answers for words it already teaches is a deck
  // browser. "gato" is not in the frequency deck and never will be at 400 words,
  // but a learner who types it deserves an answer, so unknown words are looked
  // up live and kept from then on.
  if (path === '/api/lookup' && request.method === 'GET') {
    const q = new URL(request.url).searchParams.get('q') ?? '';
    if (!q.trim()) return json({ error: 'q required' }, 400);

    // The deck first: its cards are hand-checked and carry audio. Matching runs
    // on the folded column, so cafe, café and cafe' are the same question.
    const fq = fold(q.trim());
    // Whole words beat prefixes: "cat" is gato (trans word "cat"), then only
    // catorze (prefix); and never estar via "loCATed". LIKE has no \b, so the
    // tiers are spelled out by hand.
    const hit = await env.DB.prepare(
      `SELECT * FROM cards WHERE owner IS NULL AND pos IS NOT 'drill'
         AND (fold LIKE ?2 OR fold LIKE ?3 OR fold LIKE ?4 OR fold LIKE ?5 OR fold LIKE ?6)
       ORDER BY CASE
           WHEN fold = ?1 OR fold LIKE ?2 THEN 0   -- the term itself
           WHEN fold LIKE ?3 OR fold LIKE ?4 THEN 1 -- exact word anywhere
           WHEN fold LIKE ?5 THEN 2                 -- term prefix
           ELSE 3 END,                              -- word-start anywhere
         freq LIMIT 1`
    ).bind(fq, `${fq} %`, `% ${fq} %`, `% ${fq}`, `${fq}%`, `% ${fq}%`).first();

    const exampleLines = async (term, ui2) => {
      const pair = ui2 === 'ru' ? 'pt-ru' : 'pt-en';
      const w = fold(term.replace(/^([oa]s? |um |uma )/, ''));
      const { results } = await env.DB.prepare(
        `SELECT src, dst FROM examples WHERE pair = ?1
           AND (fold LIKE ?2 OR fold LIKE ?3 OR fold LIKE ?4)
         ORDER BY length(src) LIMIT 3`
      ).bind(pair, `${w} %`, `% ${w} %`, `% ${w}`).all().catch(() => ({ results: [] }));
      return results.map((r) => ({ t: `${r.src} — ${r.dst}`, tag: 'Tatoeba CC-BY' }));
    };
    const uiLang = new URL(request.url).searchParams.get('ui') === 'ru' ? 'ru' : 'en';

    if (hit) {
      // No article yet is no reason to withhold examples: an empty shell
      // carries the Tatoeba lines just fine.
      const entry = (await ensureEntry(env, hit).catch(() => null))
        ?? { meanings: [], synonyms: [], collocations: [], grammar: '', conj: {} };
      entry.corpus = [...(entry.corpus ?? []), ...await exampleLines(hit.term, uiLang)];
      return json({ source: 'deck', card: { ...hit, entry }, conj: conjugate(hit.term) });
    }

    // Then the lexicon: 18k Wiktionary headwords, human-written and free. A word
    // like "gato" costs nothing and answers instantly — the model is for the
    // tail this misses, not for the middle of the language.
    const lex = await env.DB.prepare(
      `SELECT * FROM cards WHERE owner = 'lex' AND (lower(term) = ?1 OR fold LIKE ?2 OR fold LIKE ?4 OR lower(trans_ru) LIKE ?3)
       ORDER BY CASE WHEN lower(term) = ?1 THEN 0 ELSE 1 END,
                CASE pos WHEN 'noun' THEN 0 WHEN 'verb' THEN 1 ELSE 2 END, freq LIMIT 1`
    ).bind(q.trim().toLowerCase(), `${fold(q.trim())} %`, `${q.trim().toLowerCase()}%`, `% ${fold(q.trim())}%`).first();

    if (lex) {
      const entry = lex.entry ? JSON.parse(lex.entry) : null;
      // The monolingual layer rides into the article: Portuguese definitions
      // after the English glosses, labelled so the client can flag them.
      if (lex.def_pt && entry && !entry.meanings?.some((m) => m.note === 'definição em português')) {
        for (const d of String(lex.def_pt).split('; ').slice(0, 4)) {
          entry.meanings.push({ trans: d, note: 'definição em português' });
        }
      }
      if (entry) entry.corpus = [...(entry.corpus ?? []), ...await exampleLines(lex.term, uiLang)];
      return json({ source: 'lexicon', card: { ...lex, entry }, conj: conjugate(lex.term) });
    }

    if (!(await underPublicCap(env, request))) return json({ error: 'daily limit reached' }, 429);
    try {
      const card = await lookupWord(env, q);
      if (!card) return json({ error: 'not found' }, 404);
      // The engine is the authority on forms — the model is not asked for them.
      return json({ source: 'lookup', card, conj: conjugate(card.term.replace(/^[oa]s? /, '')) });
    } catch (e) {
      return json({ error: e.message }, 502);
    }
  }

  // Type-ahead over the lexicon. Cheap and public: it is one indexed LIKE over
  // rows we already have, no model involved.
  if (path === '/api/search' && request.method === 'GET') {
    const sp = new URL(request.url).searchParams;
    const course = sp.get('course') === 'en' ? 'en' : 'pt';
    const raw = (sp.get('q') ?? '').trim().toLowerCase();
    const s = fold(raw);
    if (s.length < 2) return json({ q: raw, words: [] });
    // Russian input may arrive in any case form — «кошкой» resolves to its
    // lemma through the inflection table before the glosses are searched.
    let ruQ = raw;
    if (/[а-яё]/.test(raw)) {
      const hit = await env.DB.prepare(
        `SELECT lemma FROM ru_forms WHERE form = ?1`
      ).bind(raw).first().catch(() => null);
      if (hit?.lemma) ruQ = hit.lemma.toLowerCase();
    }
    // Matching happens on the accent-blind column: "cao" must find "cão" —
    // and the stored Russian keeps its stress marks (ко́шка), so the acute is
    // stripped at compare time.
    const { results } = await env.DB.prepare(
      `SELECT id, term, trans, trans_ru, trans_pt, pos, gender, freq FROM cards
       WHERE owner = 'lex' AND course = ?7 AND (fold LIKE ?1 OR fold LIKE ?2 OR fold LIKE ?5
         OR replace(lower(trans_ru), '́', '') LIKE ?4
         OR replace(lower(trans_ru), '́', '') LIKE ?8)
       ORDER BY CASE WHEN fold = ?3 OR fold LIKE ?6 THEN 0
                     WHEN fold LIKE ?2 THEN 1
                     WHEN fold LIKE ?1 THEN 2 ELSE 3 END, freq
       LIMIT 25`
    ).bind(`${s}%`, `% ${s} %`, s, `%${raw}%`, `% ${s}%`, `${s} %`, course, `%${ruQ}%`).all();

    // A headword is a lemma; the reader met a FORM. "gatos" used to answer
    // with gato-pingado and gatonet — real rows, so the old empty-results
    // gate never fired — while gato itself was one plural rule away. Resolve
    // the form whenever nothing matched the spelling EXACTLY, and let the
    // lemma lead; the substring neighbours keep their place underneath.
    const exact = (results ?? []).some((r) => {
      const f = fold(r.term);
      return f === s || f.startsWith(`${s} `);
    });
    if (exact) return json({ q: s, words: results });

    for (const lemma of lemmaCandidates(s, course)) {
      const f = fold(lemma.word);
      const { results: byLemma } = await env.DB.prepare(
        `SELECT id, term, trans, trans_ru, trans_pt, pos, gender, freq FROM cards
         WHERE owner = 'lex' AND course = ?3 AND (fold = ?1 OR fold LIKE ?2)
         ORDER BY freq LIMIT 25`
      ).bind(f, `${f} %`, course).all();
      if (byLemma?.length) {
        const seen = new Set(byLemma.map((r) => r.id));
        const rest = (results ?? []).filter((r) => !seen.has(r.id));
        return json({
          q: s,
          words: [...byLemma, ...rest].slice(0, 25),
          from_form: { form: s, ...lemma },
        });
      }
    }
    return json({ q: s, words: results ?? [] });
  }

  // Real sentences containing a word, with their translation — Tatoeba pairs.
  // The dictionary's examples block: what the word looks like in the wild.
  if (path === '/api/examples' && request.method === 'GET') {
    const sp = new URL(request.url).searchParams;
    const raw = (sp.get('q') ?? '').trim();
    const w = fold(raw);
    const pair = ['pt-ru', 'pt-en', 'en-ru'].includes(sp.get('pair')) ? sp.get('pair') : 'pt-en';
    if (w.length < 2) return json({ examples: [] });

    // A dictionary headword is a lemma; sentences hold its forms. Verbs expand
    // through the conjugation engine (falar → falou, falámos…); everything
    // else gets the plural spellings. Searching all of them is what lets
    // "gato" surface a sentence about gatos.
    const forms = new Set([w]);
    const verb = findVerb(raw);
    if (verb && !pair.startsWith('en')) {
      for (const t of Object.values(conjugate(verb.inf))) {
        for (const f of [t].flat()) if (typeof f === 'string') forms.add(fold(f));
      }
    } else {
      if (w.endsWith('ao')) { forms.add(`${w.slice(0, -2)}oes`); forms.add(`${w.slice(0, -2)}aes`); forms.add(`${w}s`); }
      else if (w.endsWith('m')) forms.add(`${w.slice(0, -1)}ns`);
      else if (w.endsWith('l')) forms.add(`${w.slice(0, -1)}is`);
      else if (/[rzs]$/.test(w)) forms.add(`${w}es`);
      else forms.add(`${w}s`);
      if (w.endsWith('s')) forms.add(w.slice(0, -1));
    }

    const list = [...forms].slice(0, 60);
    const cond = list.map((_, i) => `instr(' '||fold||' ', ?${i + 2}) > 0`).join(' OR ');
    // Direct pairs outrank pivoted ones (via='en'): human beats chained.
    const { results } = await env.DB.prepare(
      `SELECT src, dst, via FROM examples WHERE pair = ?1 AND (${cond})
       ORDER BY via IS NOT NULL, length(src)
       LIMIT ${Math.min(parseInt(sp.get('limit') ?? '4', 10) || 4, 20)}`
    ).bind(pair, ...list.map((f) => ` ${f} `)).all();
    return json({ examples: results });
  }

  // An endless stream of real sentences for the cloze grinder — the
  // Clozemaster idea on our own corpus: 90k pt-en pairs, free forever.
  if (path === '/api/examples/random' && request.method === 'GET') {
    const sp = new URL(request.url).searchParams;
    const pair = ['pt-ru', 'pt-en', 'en-ru'].includes(sp.get('pair')) ? sp.get('pair') : 'pt-en';
    const { results } = await env.DB.prepare(
      `SELECT src, dst FROM examples WHERE pair = ?1 AND via IS NULL
         AND length(src) BETWEEN 15 AND 70
       ORDER BY RANDOM() LIMIT ?2`
    ).bind(pair, Math.min(parseInt(sp.get('limit') ?? '20', 10) || 20, 50)).all();
    return json({ examples: results });
  }

  // Batch glossing: a list of terms in, one-line translations out. Powers the
  // hidden translation layers of the English deck (EN→PT for everyone,
  // EN→RU for the Russian mode). Public-capped like every model endpoint.
  if (path === '/api/gloss' && request.method === 'POST') {
    if (!env.GROQ_API_KEY) return json({ error: 'not configured' }, 503);
    // Our own batch jobs authenticate past the public cap; the street stays capped.
    const isBatch = env.BATCH_KEY && request.headers.get('x-batch-key') === env.BATCH_KEY;
    if (!isBatch && !(await underPublicCap(env, request))) return json({ error: 'daily limit reached' }, 429);
    const body = await request.json().catch(() => null);
    const terms = Array.isArray(body?.terms) ? body.terms.map(String).slice(0, 25) : [];
    const to = body?.to === 'ru' ? 'Russian' : 'European Portuguese (pt-PT, never Brazilian)';
    const from = body?.from === 'pt' ? 'European Portuguese' : 'English';
    if (!terms.length) return json({ error: 'terms required' }, 400);
    // rich mode: a Multitran-style row instead of a one-worder — equivalents
    // separated by «;», each with an optional bracketed domain/style hint.
    const style = body?.rich
      ? `2-4 equivalents separated by "; ", each optionally followed by a short ` +
        `bracketed hint in ${to} marking domain, style or nuance — like ` +
        `"кот (самец); кошка (о животном)". No other explanations.`
      : `Short dictionary glosses, 1-4 words, no explanations.`;
    // Batch jobs run on the SMALL model as primary: one-word glosses don't
    // need 70b, and Groq budgets are per-model — so overnight batches and
    // daytime users stop competing for the same tokens entirely.
    let raw;
    try {
      raw = await chat(env, [
        { role: 'system', content:
          `Translate each ${from} term into ${to}. ${style} ` +
          `Answer strictly as JSON: {"glosses": ["...", ...]} in the same order.` },
        { role: 'user', content: terms.map((t, i) => `${i + 1}. ${t}`).join('\n') },
      ], { json: true, noFallback: true, ...(isBatch ? { model: 'llama-3.1-8b-instant' } : {}) });
    } catch (e) {
      return json({ error: String(e.message ?? e).slice(0, 140) }, 429);
    }
    try {
      const out = JSON.parse(raw);
      return json({ glosses: (out.glosses ?? []).map(String).slice(0, terms.length) });
    } catch {
      return json({ error: 'bad model output' }, 502);
    }
  }

  // Every verb conjugates, whether or not the deck teaches it — by rule, and by
  // table where the rules break.
  if (path === '/api/conjugate' && request.method === 'GET') {
    const p = new URL(request.url).searchParams;
    if (p.get('list') !== null) return json({ count: VERBS.length, verbs: VERBS });

    // Reverse lookup: "era" → ser (Imperfeito, eu / ele-ela). What every real
    // dictionary does, because the form is what you actually meet in the wild.
    const form = p.get('form');
    if (form) {
      const q = fold(form).trim();
      const matches = [];
      outer: for (const v of VERBS) {
        const c = conjugate(v.inf.replace(/-se$/, ''));
        if (!c) continue;
        for (const [tense, forms] of Object.entries(c)) {
          if (!Array.isArray(forms)) {
            if (fold(String(forms)) === q) matches.push({ verb: v.inf, gloss: v.gloss, tense, person: -1 });
            continue;
          }
          forms.forEach((f, i) => {
            if (f && fold(f) === q) matches.push({ verb: v.inf, gloss: v.gloss, tense, person: i });
          });
        }
        if (matches.length >= 24) break outer;
      }
      return json({ form, matches });
    }
    const v = p.get('v') ?? '';
    const known = findVerb(v);
    const inf = (known?.inf ?? v).replace(/-se$/, '').trim().toLowerCase();
    const forms = conjugate(inf);
    if (!forms) return json({ error: 'not a verb' }, 404);
    return json({ verb: known?.inf ?? inf, gloss: known?.gloss ?? '', conj: forms });
  }

  if (path === '/api/coach/scenarios' && request.method === 'GET') {
    const course = new URL(request.url).searchParams.get('course') ?? 'pt';
    return json({
      course,
      scenarios: scenarioList(course),
      levels: Object.entries(LEVELS).map(([key, l]) => ({ key, label: l.label })),
    });
  }

  // ---- authenticated ----

  const uid = await authUser(env, request);
  if (path.startsWith('/api/') && !uid) return json({ error: 'device token required' }, 401);

  // Browser microphone → text. Sits behind the device token like the coach
  // itself: transcription costs Groq minutes, and the page that records is
  // token-gated anyway.
  if (path === '/api/transcribe' && request.method === 'POST') {
    if (!env.GROQ_API_KEY) return json({ error: 'transcription not configured' }, 503);
    const form = await request.formData().catch(() => null);
    const f = form?.get('audio');
    if (!f || typeof f === 'string') return json({ error: 'audio file is required' }, 400);
    if (f.size > 2_000_000) return json({ error: 'recording too long' }, 413);
    const language = form.get('language') === 'en' ? 'en' : 'pt';
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const text = await transcribe(env, bytes, language, f.name || 'voice.webm', f.type || 'audio/webm');
      return json({ text });
    } catch (e) {
      return json({ error: e.message }, 502);
    }
  }

  if (path === '/api/course' && request.method === 'GET') {
    return json(await courseMap(env, uid));
  }

  if (path === '/api/stats' && request.method === 'GET') {
    return json(await buildStats(env, uid));
  }

  if (path === '/api/progress' && request.method === 'GET') {
    const s = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM user_cards WHERE user_id = ?1 AND reps > 0) AS learned,
         (SELECT COUNT(*) FROM user_cards WHERE user_id = ?1 AND due <= ?2) AS due_now,
         (SELECT COUNT(*) FROM events WHERE user_id = ?1 AND kind = 'answer') AS answers,
         (SELECT COUNT(*) FROM events WHERE user_id = ?1 AND kind = 'answer' AND correct = 1) AS correct`
    ).bind(uid, new Date().toISOString()).first();
    return json(s);
  }

  if (path === '/api/next' && request.method === 'GET') {
    const url = new URL(request.url);
    const course = url.searchParams.get('course') ?? 'pt';
    const card = await env.DB.prepare(
      `SELECT c.* FROM user_cards uc JOIN cards c ON c.id = uc.card_id
       WHERE uc.user_id = ? AND uc.due <= ? AND c.course = ?
       ORDER BY uc.due LIMIT 1`
    ).bind(uid, new Date().toISOString(), course).first();
    if (card) return json({ card, isNew: false });
    const fresh = await env.DB.prepare(
      // Numbered placeholders throughout: mixing `?` with `?1` made D1 throw,
      // which only ever showed up for a user with no cards yet — the very
      // first card of a fresh account.
      `SELECT * FROM cards WHERE course = ?1 AND (owner IS NULL OR owner = ?2)
       AND id NOT IN (SELECT card_id FROM user_cards WHERE user_id = ?2)
       ORDER BY freq LIMIT 1`
    ).bind(course, uid).first();
    return fresh ? json({ card: fresh, isNew: true }) : json({ card: null });
  }

  if (path === '/api/units' && request.method === 'GET') {
    const course = new URL(request.url).searchParams.get('course') ?? 'pt';
    const { results } = await env.DB.prepare(
      `SELECT c.unit AS unit, COUNT(*) AS total,
         SUM(CASE WHEN uc.card_id IS NOT NULL THEN 1 ELSE 0 END) AS started,
         SUM(CASE WHEN uc.reps > 0 THEN 1 ELSE 0 END) AS learned
       FROM cards c LEFT JOIN user_cards uc ON uc.card_id = c.id AND uc.user_id = ?1
       WHERE c.course = ?2 AND c.owner IS NULL GROUP BY c.unit`
    ).bind(uid, course).all();
    return json({ course, units: results });
  }

  // ---- coach ----
  //
  // The bot talks to it in voice; the app talks in text and asks /api/tts when
  // it wants to hear the line. Both go through coachTurn, so there is one
  // personality, not two. The session lives in `dialog`, one row per user, so a
  // conversation started in the app can be continued in Telegram.

  if (path === '/api/coach' && request.method === 'GET') {
    const s = await env.DB.prepare(`SELECT * FROM dialog WHERE user_id = ?`).bind(uid).first();
    if (!s) return json({ session: null });
    return json({
      session: {
        course: s.course,
        scenario: s.scenario,
        level: s.level,
        messages: JSON.parse(s.messages ?? '[]'),
      },
    });
  }

  if (path === '/api/coach' && request.method === 'POST') {
    if (!env.GROQ_API_KEY) return json({ error: 'coach not configured' }, 503);
    const body = await request.json().catch(() => null);

    // Leaving the scene: close the session and hand back the error recap.
    if (body?.stop) {
      const s = await env.DB.prepare(`SELECT * FROM dialog WHERE user_id = ?`).bind(uid).first();
      await env.DB.prepare(`DELETE FROM dialog WHERE user_id = ?`).bind(uid).run();
      const history = JSON.parse(s?.messages ?? '[]');
      if (!history.some((m) => m.role === 'user')) return json({ recap: '' });
      try {
        // Structured, so a client can offer the corrections as cards instead of
        // leaving them as prose to be read once and forgotten.
        const { summary, mistakes } = await coachRecap(env, history, body?.ui);
        const recap = [summary, ...mistakes.map((m) => `❌ ${m.wrong} → ✅ ${m.right}`)]
          .filter(Boolean).join('\n');
        return json({ recap, summary, mistakes, course: s?.course ?? 'pt' });
      } catch (e) {
        return json({ recap: '', mistakes: [], error: e.message });
      }
    }

    // A lesson carries its own scene and pace, so the client sends one id.
    const lesson = body?.lesson ? lessonById(String(body.lesson)) : null;
    if (body?.lesson && !lesson) return json({ error: 'unknown lesson' }, 400);

    const course = lesson ? 'pt' : (body?.course === 'en' ? 'en' : 'pt');
    const scenario = lesson ? lesson.scenario : String(body?.scenario ?? '');
    const level = lesson
      ? (LEVELS[lesson.level] ? lesson.level : 'normal')
      : (LEVELS[body?.level] ? body.level : 'normal');
    const scen = lesson ? lessonScene(lesson) : SCENARIOS[course]?.[scenario];
    if (!scen) return json({ error: 'unknown scenario' }, 400);

    // Opening the scene: no model call, just the scripted first line.
    if (body?.start) {
      const opening = [{ role: 'assistant', content: scen.open }];
      await env.DB.prepare(
        `INSERT INTO dialog (user_id, course, scenario, level, lesson, messages, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET course = excluded.course, scenario = excluded.scenario,
           level = excluded.level, lesson = excluded.lesson, messages = excluded.messages,
           started_at = excluded.started_at`
      ).bind(uid, course, scenario, level, lesson?.id ?? null,
             JSON.stringify(opening), new Date().toISOString()).run();
      return json({
        reply: scen.open,
        gloss: scen.gloss ?? '',
        note: '',
        hints: lesson?.phrases?.length
          ? lesson.phrases.map((p) => ({ pt: p, en: '' }))
          : scen.hints ?? [],
        messages: opening,
        lesson: lesson && {
          id: lesson.id, title: lesson.title, goal: lesson.goal,
          must: lesson.must, met: [], done: false,
        },
      });
    }

    const said = String(body?.message ?? '').trim().slice(0, 600);
    if (!said) return json({ error: 'message is required' }, 400);

    const s = await env.DB.prepare(`SELECT * FROM dialog WHERE user_id = ?`).bind(uid).first();
    const history = JSON.parse(s?.messages ?? '[]');

    try {
      const turn = await coachTurn(env, {
        userId: uid,
        course,
        scenario,
        level,
        history,
        said,
        ui: body?.ui,
      });
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO dialog (user_id, course, scenario, level, messages, started_at) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET messages = excluded.messages`
        ).bind(uid, course, scenario, level, JSON.stringify(turn.history), new Date().toISOString()),
        env.DB.prepare(
          `INSERT INTO events (user_id, kind, exercise, created_at) VALUES (?, 'coach', 'app_talk', ?)`
        ).bind(uid, new Date().toISOString()),
      ]);

      // Inside a lesson every turn also updates the checklist, and completing
      // it is announced the moment it happens — not on /stop.
      const activeLesson = s?.lesson ? lessonById(s.lesson) : null;
      let lessonState = null;
      if (activeLesson) {
        const { met, done } = await checkGoal(env, activeLesson, turn.history);
        lessonState = {
          id: activeLesson.id, title: activeLesson.title, goal: activeLesson.goal,
          must: activeLesson.must, met, done,
        };
        if (done) await completeLesson(env, uid, activeLesson.id);
      }
      return json({
        reply: turn.reply, gloss: turn.gloss, note: turn.note, hints: turn.hints,
        messages: turn.history, lesson: lessonState,
      });
    } catch (e) {
      return json({ error: e.message }, 502);
    }
  }

  if (path === '/api/mine' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM cards WHERE owner = ? ORDER BY id DESC LIMIT 200`
    ).bind(uid).all();
    return json({ cards: results });
  }

  if (path === '/api/mine' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body?.term || !body?.trans) return json({ error: 'term and trans are required' }, 400);
    const id = `u${uid.toString(36)}-${Date.now().toString(36)}`;
    // The sentence the word was met in travels with it — a word captured from
    // a Finanças letter without its sentence is a word stripped of the one
    // thing that made it memorable (and of its future cloze exercise).
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO cards (id, course, term, trans, note, ex_t, ex_trans, tags, freq, owner, unit)
         VALUES (?, ?, ?, ?, ?, ?, ?, '["mine"]', 100000, ?, 'mine')`
      ).bind(id, body.course ?? 'pt', body.term, body.trans, body.note ?? '',
             body.ex_t ?? null, body.ex_trans ?? null, uid),
      env.DB.prepare(`INSERT INTO user_cards (user_id, card_id, due) VALUES (?, ?, ?)`)
        .bind(uid, id, new Date().toISOString()),
    ]);
    return json({ ok: true, id });
  }

  if (path === '/api/answer' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body?.card_id || !body?.grade) return json({ error: 'card_id and grade are required' }, 400);
    const uc = await env.DB.prepare(
      `SELECT * FROM user_cards WHERE user_id = ? AND card_id = ?`
    ).bind(uid, body.card_id).first();
    const ns = schedule(uc, body.grade);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO user_cards (user_id, card_id, stability, difficulty, reps, lapses, state, due, last_review)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, card_id) DO UPDATE SET
           stability = excluded.stability, difficulty = excluded.difficulty,
           reps = excluded.reps, lapses = excluded.lapses, state = excluded.state,
           due = excluded.due, last_review = excluded.last_review`
      ).bind(uid, body.card_id, ns.stability, ns.difficulty, ns.reps, ns.lapses, ns.state, ns.due, ns.last_review),
      env.DB.prepare(
        `INSERT INTO events (user_id, card_id, kind, exercise, rating, correct, created_at)
         VALUES (?, ?, 'answer', ?, ?, ?, ?)`
      ).bind(uid, body.card_id, body.exercise ?? 'app', body.grade, body.grade > 1 ? 1 : 0, new Date().toISOString()),
    ]);
    return json({ ok: true, due: ns.due });
  }

  return json({ error: 'unknown endpoint' }, 404);
}
