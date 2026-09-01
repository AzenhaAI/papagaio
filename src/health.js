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

// A worker cannot probe its own routes over their public address: Cloudflare
// sends such a subrequest past the worker to the origin, which is the static
// site, which has no /api — so every internal check answered 404 and the first
// run cried wolf about three healthy endpoints. Ours are therefore checked
// from the inside, against the database and the services themselves; only what
// belongs to somebody else goes over the network.


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
  const fast = await runFastCheck(env);

  const outside = await Promise.all([
    probe('site: news', `${SITE}/papagaio/news/`, { expectText: 'Today on the island' }),
    probe('site: features', `${SITE}/papagaio/features/`, { expectText: 'Works offline' }),
    probe('site: apps', `${SITE}/papagaio/apps/`, { expectText: 'App Store' }),
    // By size, because a placeholder answers 200 as happily as an app: the Mac
    // image once held a 384 KB shell of one.
    probe('download: Android', `${SITE}/dl/PapaGaio.apk`, { minBytes: 15_000_000 }),
    probe('download: macOS', `${SITE}/dl/PapaGaio-mac.dmg`, { minBytes: 15_000_000 }),
    probe('download: Windows', `${SITE}/dl/PapaGaio-windows.zip`, { minBytes: 8_000_000 }),
    probe('download: Chrome', `${SITE}/dl/PapaGaio-chrome.zip`, { minBytes: 10_000 }),
    probe('App Store listing', 'https://itunes.apple.com/lookup?id=6802084974&country=us', {
      expectText: 'papagaio',
    }),
    // The bot's own face. It disappeared once with nobody able to say when:
    // Telegram falls back to its generic logo, which looks like a loading
    // state rather than a missing file. The public page names the real avatar,
    // so the fallback is visible from outside.
    await (async () => {
      try {
        const r = await fetch('https://t.me/papagaio_ebot');
        const html = await r.text();
        const m = /<meta property="og:image" content="([^"]+)"/.exec(html);
        const src = m?.[1] ?? '';
        if (!src) return { name: 'bot avatar', ok: false, why: 'page has no image at all' };
        if (src.includes('telegram.org/img/t_logo')) {
          return { name: 'bot avatar', ok: false, why: 'missing — BotFather /setuserpic' };
        }
        return { name: 'bot avatar', ok: true };
      } catch (e) {
        return { name: 'bot avatar', ok: false, why: String(e.message || e).slice(0, 60) };
      }
    })(),
  ]);

  // The two that cost money, once a day rather than every quarter hour.
  const paid = [
    await inside('translation', async () => {
      const { translate } = await import('./translate.js');
      const t = await translate(env, 'obrigado', 'auto->en', 'en');
      if (!t?.translation) throw new Error('empty translation');
    }),
    await inside('speech', async () => {
      const { synthesize } = await import('./tts.js');
      const audio = await synthesize('bom dia', 'pt');
      if (!audio || audio.byteLength < 3000) throw new Error('no audio returned');
    }),
  ];

  const checks = [...fast.checks, ...outside, ...paid];
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

/** The cheap half, safe to run every few minutes: no model calls, no money. */
export async function runFastCheck(env) {
  const checks = [];

  // The taught deck: a thousand cards or the loader has gone wrong.
  checks.push(await inside('deck', async () => {
    const r = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM cards WHERE course = 'pt' AND owner IS NULL`
    ).first();
    if ((r?.n ?? 0) < 1000) throw new Error(`only ${r?.n ?? 0} cards`);
  }));

  // The lexicon behind every lookup. Checked the way the search itself looks:
  // `fold` is an index holding the word AND its glosses run together, so an
  // equality test against it never matches — which is how this probe cried
  // wolf the first morning it ran.
  checks.push(await inside('dictionary', async () => {
    const size = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM cards WHERE owner = 'lex'`
    ).first();
    if ((size?.n ?? 0) < 100000) throw new Error(`lexicon down to ${size?.n ?? 0} rows`);
    const hit = await env.DB.prepare(
      `SELECT 1 AS ok FROM cards WHERE owner = 'lex' AND term = 'comboio' LIMIT 1`
    ).first();
    if (!hit) throw new Error('comboio missing from the lexicon');
  }));

  // Today's bulletin, which the morning job should have written.
  checks.push(await inside('news bulletin', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const r = await env.DB.prepare(
      `SELECT length(text) AS n FROM bulletins WHERE day = ?1 LIMIT 1`
    ).bind(today).first();
    if (!r || (r.n ?? 0) < 200) throw new Error('no bulletin for today');
  }));

  // And the site, which is somebody else's service and answers honestly.
  checks.push(await probe('site', `${SITE}/papagaio/`, { expectText: 'PapaGaio' }));

  return { checks, bad: checks.filter((c) => !c.ok), ok: checks.every((c) => c.ok) };
}

/** Runs one internal check and reports it in the same shape as a probe. */
async function inside(name, fn) {
  try {
    await fn();
    return { name, ok: true };
  } catch (e) {
    return { name, ok: false, why: String(e.message || e).slice(0, 80) };
  }
}

/**
 * Alerts on the edges, not on the state: a message when something starts
 * failing and another when it recovers. Repeating an outage every five minutes
 * trains people to mute the channel, and a muted alert is worse than none.
 */
export async function alertOnChange(env, { checks }) {
  const { results } = await env.DB.prepare(`SELECT name, failing FROM health_state`).all();
  const known = new Map((results ?? []).map((r) => [r.name, r.failing]));
  const now = new Date().toISOString();
  const started = [];
  const fixed = [];

  for (const c of checks) {
    const was = known.get(c.name) === 1;
    if (!c.ok && !was) started.push(c);
    if (c.ok && was) fixed.push(c);
    await env.DB.prepare(
      `INSERT INTO health_state (name, failing, since, why) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(name) DO UPDATE SET failing = excluded.failing,
         since = CASE WHEN health_state.failing != excluded.failing THEN excluded.since ELSE health_state.since END,
         why = excluded.why`
    ).bind(c.name, c.ok ? 0 : 1, now, c.ok ? null : (c.why ?? '')).run();
  }

  const lines = [];
  if (started.length) {
    lines.push('🔴 *Broken just now*');
    for (const c of started) lines.push(`• ${c.name} — ${c.why}`);
  }
  if (fixed.length) {
    lines.push((lines.length ? '\n' : '') + '🟢 *Working again*');
    for (const c of fixed) lines.push(`• ${c.name}`);
  }
  return lines.join('\n');
}
