import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';

export default defineConfig([
  // .claude holds Claude worktrees: full copies of the repo on other branches.
  globalIgnores([
    'dist',
    'coverage',
    'docs/raw',
    '.claude',
    'test-results',
    'playwright-report',
    'lighthouse-reports',
  ]),
  {
    files: ['**/*.{js,jsx,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      react.configs.flat.recommended,
      react.configs.flat['jsx-runtime'],
      reactHooks.configs.flat.recommended,
      jsxA11y.flatConfigs.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // React 19 ignores propTypes. Document props with JSDoc where it helps.
      'react/prop-types': 'off',
    },
  },
  {
    // Words the app shows come from src/i18n/en.json through t() (#19), never
    // from JSX text. Punctuation between a sentence and its link is allowed.
    files: ['src/**/*.jsx'],
    ignores: ['src/**/*.test.jsx', 'src/test/**'],
    rules: {
      'react/jsx-no-literals': [
        'error',
        { noStrings: false, allowedStrings: ['.', ',', ':', '(', ')', '),', '[', ']'] },
      ],
    },
  },
  {
    files: ['src/**/*.test.{js,jsx}', 'src/test/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.vitest, ...globals.node },
    },
  },
  {
    files: ['*.config.js', 'scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Playwright specs run in Node; their page.evaluate callbacks run in the page.
    files: ['e2e/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  prettier,
]);
