// Proves the acceptance criterion of #19 the way a translator would meet it:
// a copy of src/i18n with an es.json and one more line in config.js, loaded
// through Vite, so the real import.meta.glob loader is what finds the file.
// @vitest-environment node
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '../..');
let dir;
let server;

beforeAll(async () => {
  // Under node_modules so the copy resolves react like the app does.
  const cache = path.join(ROOT, 'node_modules/.cache');
  await mkdir(cache, { recursive: true });
  dir = await mkdtemp(path.join(cache, 'i18n-add-locale-'));
  await cp(import.meta.dirname, dir, {
    filter: (src) => !/\.test\.jsx?$/.test(src) && !src.endsWith('.jsx'),
    recursive: true,
  });
  await writeFile(
    path.join(dir, 'es.json'),
    JSON.stringify({ home: { heading: 'Guia del votante' } }),
  );
  const config = await readFile(path.join(dir, 'config.js'), 'utf8');
  await writeFile(
    path.join(dir, 'config.js'),
    config.replace(
      "  en: { label: 'English', intl: 'en-US' },\n",
      "  en: { label: 'English', intl: 'en-US' },\n  es: { label: 'Espanol', intl: 'es-US' },\n",
    ),
  );
  server = await createServer({
    root: dir,
    configFile: false,
    // Its own cache, so it never clears the dev server's optimized deps in
    // node_modules/.vite.
    cacheDir: path.join(dir, '.vite'),
    optimizeDeps: { noDiscovery: true },
    logLevel: 'silent',
    server: { middlewareMode: true, hmr: false, watch: null },
  });
}, 30_000);

afterAll(async () => {
  await server?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});

it('turns on Spanish with es.json and one config line', async () => {
  globalThis.document = { documentElement: { lang: 'en' } };
  try {
    const i18n = await server.ssrLoadModule(path.join(dir, 'index.js'));
    expect(i18n.t('home.heading')).toBe('St. Louis Voter Guide');

    // Picking English while Spanish is still loading: the last pick wins.
    const slow = i18n.setLocale('es');
    await i18n.setLocale('en');
    await slow;
    expect(i18n.getLocale()).toBe('en');
    expect(globalThis.document.documentElement.lang).toBe('en');

    await i18n.setLocale('es');
    expect(i18n.t('home.heading')).toBe('Guia del votante');
    expect(i18n.t('home.intro')).toBe(
      'For voters in St. Louis City and St. Louis County: find your precinct, polling places near you and your sample ballot.',
    );
    expect(globalThis.document.documentElement.lang).toBe('es');
  } finally {
    delete globalThis.document;
  }
});
