import { defineConfig } from 'astro/config';

// Served from azenha.ai/papagaio/ — base path matters for all asset links.
export default defineConfig({
  site: 'https://azenha.ai',
  base: '/papagaio',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  // Hoisted scripts used ?. ?? ??= which iOS below 13.4/14 cannot parse; one
  // syntax error there took the whole page script with it.
  vite: { build: { target: ['es2019', 'safari12'] } },
});
