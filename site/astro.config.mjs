import { defineConfig } from 'astro/config';

// Served from shpara.com/papagaio/ — base path matters for all asset links.
export default defineConfig({
  site: 'https://shpara.com',
  base: '/papagaio',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
});
