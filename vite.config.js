import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';
import learnContent from './src/features/learn/content/vitePlugin.js';

export default defineConfig({
  base: '/',
  // learnContent builds and checks the voter education topics under content/.
  plugins: [react(), tailwindcss(), learnContent()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    // .claude holds Claude worktrees: full copies of the repo on other branches.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
});
