import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import { precache } from './scripts/sw_precache.mjs';

// After every build the service worker gets this build's file list and a
// content version, so offline copies are complete and never outlive a deploy.
const swPrecache = {
  name: 'sw-precache',
  hooks: {
    'astro:build:done': ({ dir }) => {
      const r = precache(fileURLToPath(dir));
      console.log(`sw precache: ${r.count} files, version ${r.version}`);
    },
  },
};

// Served from azenha.ai/papagaio/ — base path matters for all asset links.
export default defineConfig({
  site: 'https://azenha.ai',
  base: '/papagaio',
  trailingSlash: 'ignore',
  integrations: [swPrecache],
  build: { format: 'directory' },
  // Hoisted scripts used ?. ?? ??= which iOS below 13.4/14 cannot parse; one
  // syntax error there took the whole page script with it.
  vite: { build: { target: ['es2019', 'safari12'] } },
});
