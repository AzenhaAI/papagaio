// Wikipedia lookup for a word, in both languages.
//
// Only some words have an encyclopedia behind them — "levada", "fado",
// "saudade", "bacalhau" do; "olá" does not. Getting that judgement wrong is
// worse than returning nothing: a naive search for "olá" confidently returns a
// village in Panama.
//
// So the rule is strict. The Portuguese article must exist AND its title must
// be the word itself; the English article is then taken from that article's own
// interlanguage link, never from a separate search. That guarantees the two
// halves are the same subject, and that a greeting yields silence.
//
// Nothing here is generated — it is Wikipedia's own summary, CC BY-SA, shown
// with attribution and a link back.

const UA = 'PapaGaio/1.0 (https://shpara.com/papagaio)';

/// Parts of speech that never have an encyclopedia article worth reading.
/// A verb resolves to philosophy, a preposition to grammar trivia.
const SKIP_POS = /^(verb|interj|prep|conj|pron|adv|art|num|phrase)/i;

/// Accent- and case-insensitive, so "Levada" matches "levada".
const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

async function summary(lang, title) {
  const url =
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/` +
    encodeURIComponent(title.replace(/ /g, '_'));
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!r.ok) return null;
  const j = await r.json();

  // Disambiguation pages and redirects to lists are noise, not an explanation.
  if (j.type && j.type !== 'standard') return null;
  if (!j.extract) return null;

  return {
    lang,
    title: j.title ?? title,
    extract: j.extract,
    url:
      j.content_urls?.desktop?.page ??
      `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    thumb: j.thumbnail?.source ?? null,
  };
}

/** The English title of a Portuguese article, via its interlanguage link. */
async function englishTitle(ptTitle) {
  const url =
    'https://pt.wikipedia.org/w/api.php?action=query&prop=langlinks&lllang=en' +
    `&format=json&origin=*&titles=${encodeURIComponent(ptTitle)}`;
  const r = await fetch(url, { headers: { 'user-agent': UA } });
  if (!r.ok) return null;
  const j = await r.json();
  const pages = j?.query?.pages ?? {};
  for (const page of Object.values(pages)) {
    const link = page?.langlinks?.[0]?.['*'];
    if (link) return link;
  }
  return null;
}

/**
 * Looks the word up. Returns { pt, en } — both null when the word is not an
 * encyclopedia subject, which is the common and correct outcome.
 */
export async function lookupWiki(term, _trans, pos) {
  if (pos && SKIP_POS.test(pos)) return { pt: null, en: null };

  // Nouns live in the deck with their article — "a casa", "o comboio" — because
  // that is how you have to learn them. Wikipedia files them without it.
  const word = term.replace(/^(os|as|o|a|uns|umas|um|uma)\s+/i, '').trim();
  if (!word) return { pt: null, en: null };

  const pt = await summary('pt', word).catch(() => null);
  // The title has to be the word. "Casa" is fine; a redirect to something else
  // is not.
  if (!pt || norm(pt.title) !== norm(word)) return { pt: null, en: null };

  const enTitle = await englishTitle(pt.title).catch(() => null);
  const en = enTitle ? await summary('en', enTitle).catch(() => null) : null;

  return { pt, en };
}
