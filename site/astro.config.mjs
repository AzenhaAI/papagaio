import { defineConfig } from 'astro/config';

// Served from azenha.ai/papagaio/ — base path matters for all asset links.
export default defineConfig({
  site: 'https://azenha.ai',
  base: '/papagaio',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
});
