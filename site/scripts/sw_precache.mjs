// Fills the service worker's precache list and version after a build, so the
// worker always stores exactly the pages and assets of this build and drops
// the previous build's cache. Run by the astro.config.mjs integration.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

export function precache(dist, base = '/papagaio/') {
  const files = [];
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p); else files.push(p);
    }
  };
  walk(dist);
  const urls = [];
  const hash = createHash('sha256');
  for (const f of files.sort()) {
    const rel = relative(dist, f).split('\\').join('/');
    if (rel === 'sw.js' || rel === 'sitemap.xml' || rel === 'og.png' || rel.startsWith('audio/')) continue;
    if (!/\.(html|css|js|png|svg|ico|webmanifest)$/.test(rel)) continue;
    hash.update(rel).update(readFileSync(f));
    urls.push(base + (rel.endsWith('index.html') ? rel.slice(0, -'index.html'.length) : rel));
  }
  // The deck behind the dictionary and the cards: 1,100-odd cards, enough for
  // both pages to work with no connection.
  urls.push('/api/deck?course=pt&limit=2000');
  const version = hash.digest('hex').slice(0, 12);
  const swPath = join(dist, 'sw.js');
  const sw = readFileSync(swPath, 'utf8')
    .replace("'__VERSION__'", JSON.stringify(version))
    .replace('const PRECACHE = self.__PRECACHE || [];', `const PRECACHE = ${JSON.stringify(urls)};`);
  writeFileSync(swPath, sw);
  return { version, count: urls.length };
}
