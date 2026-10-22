import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';
import searchEngines from './src/features/learn/content/searchEngines.js';
import learnContent from './src/features/learn/content/vitePlugin.js';
import prerender, { previewRoutes } from './src/prerender/plugin.js';

export default defineConfig({
  base: '/',
  // learnContent builds and checks the voter education topics under content/;
  // searchEngines writes robots.txt and sitemap.xml (#97); prerender writes the
  // public pages' static HTML and previewRoutes serves it in `vite preview` (#99).
  plugins: [react(), tailwindcss(), learnContent(), searchEngines(), prerender(), previewRoutes()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    // .claude holds Claude worktrees: full copies of the repo on other branches.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
});
