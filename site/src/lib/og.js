// Share card (og:image) of a word page: its own card from the R2 bucket when
// scripts/upload_og_cards.sh has confirmed it (build/og/uploaded.txt), the
// site's generic picture otherwise. Read once per build.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const LIST = join(process.cwd(), '..', 'build', 'og', 'uploaded.txt');
const uploaded = new Set(existsSync(LIST)
  ? readFileSync(LIST, 'utf8').split('\n').filter(Boolean).map((f) => f.replace(/\.png$/, ''))
  : []);

export const GENERIC_OG = 'https://azenha.ai/papagaio/og.png?v=2';
export const ogImage = (slug) => (uploaded.has(slug)
  ? `https://audio.azenha.ai/og/${encodeURIComponent(slug)}.png`
  : GENERIC_OG);
