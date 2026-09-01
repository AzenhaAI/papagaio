// The daily self-check.
//
// Everything here has broken at least once in a way nobody noticed until a
// person tried it: audio files missing from a release, a site page deployed
// without its section, downloads on the site three weeks older than the code,
// an endpoint that answered 404 because a route was never registered. A
// product spread across a site, five installers, a bot and an API cannot be
// held in anyone's head, so once a morning it holds itself.
//
// Silence means healthy. A message arrives only when something is wrong —
// except on Mondays, when it reports in regardless so that a silent monitor
// cannot be mistaken for a healthy product.

const SITE = 'https://azenha.ai';

/** One check: a name, and what "fine" looks like. */
async function probe(name, url, { method = 'GET', body, expectText, minBytes } = {}) {
  try {
    const r = await fetch(url, {
      method,
      ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    if (!r.ok) return { name, ok: false, why: `HTTP ${r.status}` };

    if (minBytes) {
      const buf = await r.arrayBuffer();
      if (buf.byteLength < minBytes) {
        return { name, ok: false, why: `${buf.byteLength} bytes, expected at least ${minBytes}` };
      }
      return { name, ok: true };
    }
    if (expectText) {
      const text = await r.text();
      if (!text.includes(expectText)) return { name, ok: false, why: `missing "${expectText}"` };
    }
    return { name, ok: true };
  } catch (e) {
    return { name, ok: false, why: String(e.message || e).slice(0, 80) };
  }
}

export async function runHealthCheck(env) {
  const checks = await Promise.all([
    // The API, feature by feature — each of these is something a person taps.
    probe('translate', `${SITE}/api/translate`, {
      method: 'POST',
      body: { text: 'obrigado', direction: 'auto->en', ui: 'en' },
      expectText: 'translation',
    }),
    probe('news bulletin', `${SITE}/api/news?level=b1`, { expectText: '"text"' }),
    probe('speech', `${SITE}/api/tts`, {
      method: 'POST',
      body: { text: 'bom dia', course: 'pt' },
      minBytes: 3000,
    }),
    probe('deck', `${SITE}/api/deck?course=pt&limit=50`, { expectText: '"cards"' }),
    probe('dictionary search', `${SITE}/api/search?q=comboio&course=pt`, { expectText: 'comboio' }),

    // The site: a page that returns 200 while missing its own content is the
    // failure mode a plain status check sleeps through.
    probe('site: home', `${SITE}/papagaio/`, { expectText: 'PapaGaio' }),
    probe('site: news', `${SITE}/papagaio/news/`, { expectText: 'Today on the island' }),
    probe('site: features', `${SITE}/papagaio/features/`, { expectText: 'Works offline' }),
    probe('site: apps', `${SITE}/papagaio/apps/`, { expectText: 'App Store' }),

    // The downloads, by size: a truncated or placeholder file answers 200 as
    // happily as a real one. The Mac image once held a 384 KB shell of an app.
    probe('download: Android', `${SITE}/dl/PapaGaio.apk`, { minBytes: 15_000_000 }),
    probe('download: macOS', `${SITE}/dl/PapaGaio-mac.dmg`, { minBytes: 15_000_000 }),
    probe('download: Windows', `${SITE}/dl/PapaGaio-windows.zip`, { minBytes: 8_000_000 }),
    probe('download: Chrome', `${SITE}/dl/PapaGaio-chrome.zip`, { minBytes: 10_000 }),

    // And the store listing, which is not ours to fix but ours to know about.
    probe('App Store listing', 'https://itunes.apple.com/lookup?id=6802084974&country=us', {
      expectText: 'papagaio',
    }),
  ]);

  const bad = checks.filter((c) => !c.ok);
  return { checks, bad, ok: bad.length === 0 };
}

/** Formats the report the way it is worth reading at seven in the morning. */
export function formatHealth({ checks, bad }) {
  if (!bad.length) return `✅ All ${checks.length} checks passed.`;
  return (
    `⚠️ *${bad.length} of ${checks.length} checks failed*\n\n` +
    bad.map((c) => `• ${c.name} — ${c.why}`).join('\n')
  );
}
