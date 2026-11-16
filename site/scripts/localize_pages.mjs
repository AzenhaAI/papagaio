// Static language versions of the main sections: /papagaio/pt/<section>/ and
// /papagaio/ru/<section>/ beside the English /papagaio/<section>/.
//
// The site translates itself in the browser ([data-t] swaps in BaseLayout),
// so every URL used to arrive in English and search engines saw no
// Portuguese or Russian at all. After the build this step copies each
// section page once per language and does the same swaps in the HTML:
//   - [data-t] text, [data-tp] placeholders, [data-ta] aria-label/title
//     (the dictionaries of src/lib/i18n.js, keys left in place so the
//     browser pass still works);
//   - <html lang> and data-ui (the page's language wins over the saved
//     choice, src/lib/i18n.js ui()), title and description from
//     src/lib/locales.js, canonical and og:url to the page itself;
//   - hreflang alternates on every version, the English one included;
//   - links to other localized sections stay in the same language.
// Word pages are not copied: 11,000 more files would break the 20,000-file
// Pages limit, and they are already bilingual.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, parseFragment, serialize } from 'parse5';
import { tr } from '../src/lib/i18n.js';
import { th } from '../src/lib/l10n/index.js';
import { LANGS, LOCALIZED, HREFLANG, SEO, pageUrl } from '../src/lib/locales.js';

const BASE = '/papagaio';
// {n} in a description: the Madeirense entry count, as the English page says it.
const MADEIRA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'madeira', 'madeira.json');
const fill = (s) => s.includes('{n}')
  ? s.replace('{n}', JSON.parse(readFileSync(MADEIRA, 'utf8')).entries.length.toLocaleString('en').replace(/,/g, '\u00a0'))
  : s;

const attr = (n, k) => n.attrs?.find((a) => a.name === k)?.value;
const setAttr = (n, k, v) => {
  const a = n.attrs.find((x) => x.name === k);
  if (a) a.value = v; else n.attrs.push({ name: k, value: v });
};
const text = (n) => (n.nodeName === '#text' ? n.value : (n.childNodes ?? []).map(text).join(''));
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
function* walk(n) {
  yield n;
  for (const c of n.childNodes ?? []) yield* walk(c);
  if (n.content) yield* walk(n.content); // <template>
}
const el = (tag, attrs, parent) => ({
  nodeName: tag, tagName: tag, attrs: Object.entries(attrs).map(([name, value]) => ({ name, value })),
  namespaceURI: 'http://www.w3.org/1999/xhtml', childNodes: [], parentNode: parent,
});

/** Section key -> its links: /papagaio/translate/ -> 'translate', /papagaio/ -> ''. */
function sectionOf(href) {
  const m = /^\/papagaio\/([a-z]*)\/?(?=$|[?#])/.exec(href);
  return m && LOCALIZED.includes(m[1]) ? m[1] : null;
}

function alternates(head, section) {
  for (const n of [...head.childNodes]) {
    if (n.nodeName === 'link' && attr(n, 'rel') === 'alternate' && attr(n, 'hreflang')) {
      head.childNodes.splice(head.childNodes.indexOf(n), 1);
    }
  }
  // Right after <meta charset>, ahead of BaseLayout's head script, which reads
  // them to send a reader with a saved language to that language's address.
  let at = head.childNodes.findIndex((n) => n.nodeName === 'meta' && attr(n, 'charset') != null) + 1;
  for (const l of [...LANGS, 'x-default']) {
    const link = el('link', { rel: 'alternate', hreflang: l === 'x-default' ? l : HREFLANG[l], href: pageUrl(l === 'x-default' ? 'en' : l, section) }, head);
    head.childNodes.splice(at++, 0, link);
  }
}

function localize(html, lang, section) {
  const doc = parse(html);
  const root = doc.childNodes.find((n) => n.nodeName === 'html');
  const head = root.childNodes.find((n) => n.nodeName === 'head');
  alternates(head, section);
  if (lang === 'en') return serialize(doc);

  setAttr(root, 'lang', HREFLANG[lang]);
  setAttr(root, 'data-ui', lang);
  const raw = SEO[section]?.[lang];
  const seo = raw && { title: raw.title, desc: fill(raw.desc) };
  const self = pageUrl(lang, section);
  for (const n of walk(doc)) {
    if (!n.attrs) continue;
    if (n.nodeName === 'title' && seo) n.childNodes = [{ nodeName: '#text', value: seo.title, parentNode: n }];
    if (n.nodeName === 'meta') {
      const k = attr(n, 'name') || attr(n, 'property');
      if (seo && (k === 'description' || k === 'og:description')) setAttr(n, 'content', seo.desc);
      if (seo && k === 'og:title') setAttr(n, 'content', seo.title);
      if (k === 'og:url') setAttr(n, 'content', self);
    }
    if (n.nodeName === 'link' && attr(n, 'rel') === 'canonical') setAttr(n, 'href', self);
    if (n.nodeName === 'a') {
      const href = attr(n, 'href') || '';
      const s = sectionOf(href);
      if (s !== null) setAttr(n, 'href', href.replace(/^\/papagaio\/[a-z]*\/?/, `${BASE}/${lang}/${s ? s + '/' : ''}`));
    }
    const dt = attr(n, 'data-t');
    if (dt != null) {
      const key = dt || norm(text(n));
      let s = tr(lang, key);
      const tn = attr(n, 'data-tn');
      if (tn != null) s = s.replace('{n}', tn);
      setAttr(n, 'data-t', key);
      n.childNodes = [{ nodeName: '#text', value: s, parentNode: n }];
    }
    // [data-th="<id>"]: a block with markup inside (links, <em>), translated
    // whole from src/lib/l10n/<page>.js; English when that id has no entry.
    const thId = attr(n, 'data-th');
    if (thId) {
      const h = th(lang, thId);
      if (h != null) n.childNodes = parseFragment(h).childNodes.map((c) => ((c.parentNode = n), c));
      else missing.push(`${lang}:${thId}`);
    }
    const tp = attr(n, 'data-tp');
    if (tp != null) {
      const key = tp || attr(n, 'placeholder') || '';
      setAttr(n, 'data-tp', key);
      setAttr(n, 'placeholder', tr(lang, key));
    }
    const ta = attr(n, 'data-ta');
    if (ta != null) {
      for (const a of ['aria-label', 'title']) {
        const v = attr(n, a);
        if (v != null) { if (!ta) setAttr(n, 'data-ta', v); setAttr(n, a, tr(lang, ta || v)); }
      }
    }
  }
  let out = serialize(doc);
  // The front door sends people on to the translator in their language.
  if (section === '') out = out.replace("location.replace('/papagaio/translate/')", `location.replace('${BASE}/${lang}/translate/')`);
  return out;
}

const missing = [];

export function localizePages(dist) {
  let written = 0;
  missing.length = 0;
  for (const section of LOCALIZED) {
    const src = join(dist, section, 'index.html');
    if (!existsSync(src)) throw new Error(`localize: no ${section || 'home'} page in the build`);
    const html = readFileSync(src, 'utf8');
    for (const lang of LANGS) {
      const out = lang === 'en' ? src : join(dist, lang, section, 'index.html');
      mkdirSync(join(out, '..'), { recursive: true });
      writeFileSync(out, localize(html, lang, section));
      if (lang !== 'en') written++;
    }
  }
  if (missing.length) console.warn(`language versions: ${missing.length} [data-th] blocks left in English: ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? ' …' : ''}`);
  return { sections: LOCALIZED.length, written, missing: missing.length };
}
