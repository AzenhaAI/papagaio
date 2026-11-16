// Packs the built word pages into a shell plus a few data files, so they cost
// the site SHARDS + 1 files instead of one each.
//
// Why: azenha.ai deploys to Cloudflare Pages, which refuses any deployment
// over 20,000 files, and the site already sat at ~19,840. 1,088 pages as
// directories broke every section's deploy (14 Nov 2026).
//
// How: Astro still renders every page, so the HTML is exactly what was
// designed. This step splits each page into the parts that differ — title,
// description, canonical, og tags, JSON-LD and the <main> — and the shell
// that is byte-identical across all of them (checked here, the build fails
// otherwise). The azenha Pages Function functions/papagaio/palavra/[[path]].js
// puts them back together per request, so readers and crawlers get the same
// full HTML at the same address.
import { readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// 11,000 pages as 16 shards made each a ~3 MB JSON the Function parses on a
// cold start; 64 keep a shard well under a megabyte. The count is written into
// the shell (<!--pg-shards:N-->), so the Function reads it instead of keeping
// a copy of this number in step.
export const SHARDS = 64;
// Same hash in the Function: which shard a slug lives in.
export const shardOf = (slug) => {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % SHARDS;
};

const PARTS = {
  title: /<title>[\s\S]*?<\/title>/,
  desc: /<meta name="description"[^>]*>/,
  canon: /<link rel="canonical"[^>]*>/,
  ogt: /<meta property="og:title"[^>]*>/,
  ogd: /<meta property="og:description"[^>]*>/,
  ogu: /<meta property="og:url"[^>]*>/,
  ld: /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
  main: /(<main[^>]*>)[\s\S]*?(<\/main>)/,
};

function split(html) {
  const got = {};
  let shell = html;
  for (const [k, rx] of Object.entries(PARTS)) {
    const m = shell.match(rx);
    if (!m) throw new Error(`word page without ${k}`);
    if (k === 'main') {
      got[k] = m[0].slice(m[1].length, m[0].length - m[2].length);
      shell = shell.replace(rx, `$1@@${k}@@$2`);
    } else {
      got[k] = m[0];
      shell = shell.replace(rx, `@@${k}@@`);
    }
  }
  return { shell, got };
}

export function packWordPages(dist) {
  const dir = join(dist, 'palavra');
  let entries;
  try { entries = readdirSync(dir); } catch { return { count: 0 }; }
  const shards = Array.from({ length: SHARDS }, () => ({}));
  let shell = null;
  let count = 0;
  for (const slug of entries) {
    const p = join(dir, slug);
    if (!statSync(p).isDirectory()) continue;
    const html = readFileSync(join(p, 'index.html'), 'utf8');
    const s = split(html);
    if (shell === null) shell = s.shell;
    else if (s.shell !== shell) throw new Error(`word page ${slug}: shell differs from the others — the Function would serve it wrong`);
    shards[shardOf(slug.normalize('NFC'))][slug.normalize('NFC')] = s.got;
    rmSync(p, { recursive: true });
    count++;
  }
  if (!count) return { count };
  const out = join(dist, '_words');
  mkdirSync(out, { recursive: true });
  // The build stamp names this build in the Function's edge-cache key, so a
  // deploy is seen at once instead of after the cached copies expire.
  writeFileSync(join(out, 'shell.html'), `<!--pg-shards:${SHARDS}:${Date.now().toString(36)}-->` + shell);
  shards.forEach((s, i) => writeFileSync(join(out, `${i}.json`), JSON.stringify(s)));
  return { count, files: SHARDS + 1 };
}
