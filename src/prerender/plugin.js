// Vite plugins that pre-render the public pages to static HTML (#99), so
// search engines and link preview bots that do not run JavaScript get each
// page's content and head.
//
// After the client build is written, `prerender` keeps the built index.html as
// the client-rendered shell (shell.html), loads src/entry-server.jsx in Node
// through a Vite server and writes one file per public page: index.html (the
// home page), learn/index.html, learn/<id>/index.html and privacy/index.html.
// render.yaml rewrites every path with no file to /shell.html, so precinct
// pages (/p/*), whose data is live, are never baked into a build.
//
// `previewRoutes` makes `vite preview` (the e2e and Lighthouse runs) serve
// those files the way Render does: a directory's index.html for its path with
// or without the trailing slash, and the shell for any path with no file.
//
// This file is loaded by vite.config.js in plain Node, so it must not import
// app code; the app is loaded only through the Vite server below.

import { existsSync, statSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

/** The client-rendered shell, served for every path with no file. */
export const SHELL_FILE = 'shell.html';

/** Runs src/prerender/worker.js with `data`; rejects with its error. */
function runWorker(data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.js', import.meta.url), { workerData: data });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Pre-render worker exited with code ${code}`));
    });
  });
}

/** @returns {import('vite').Plugin} */
export default function prerender() {
  /** @type {import('vite').ResolvedConfig} */
  let config;
  return {
    name: 'mapthevote-prerender',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    async closeBundle(error) {
      if (error || config.build.ssr || config.build.write === false) return;
      const outDir = path.resolve(config.root, config.build.outDir);
      const template = await readFile(path.join(outDir, 'index.html'), 'utf8');
      await writeFile(path.join(outDir, SHELL_FILE), template);
      // In a worker thread: its own module cache, so the React it renders
      // with is never one the calling process already loaded in another mode
      // (the build test builds from inside Vitest).
      await runWorker({
        root: config.root,
        configFile: config.configFile,
        mode: config.mode,
        outDir,
        template,
      });
    },
  };
}

const isFile = (file) => existsSync(file) && statSync(file).isFile();

/**
 * Where `vite preview` should look for `pathname`, the way Render answers it.
 * @param {string} outDir
 * @param {string} pathname Decoded, without the query string.
 * @returns {string | null} The path to serve instead, or null to serve as is.
 */
export function previewTarget(outDir, pathname) {
  const local = path.join(outDir, pathname);
  if (local !== outDir && !local.startsWith(`${outDir}${path.sep}`)) return null;
  if (isFile(local)) return null;
  const index = path.join(local, 'index.html');
  if (isFile(index)) return `${pathname.replace(/\/+$/, '')}/index.html`;
  return `/${SHELL_FILE}`;
}

/**
 * Whether `vite preview` should route `req` like Render: a GET or HEAD for a
 * page, by the same test Vite's own fallback to index.html uses (an Accept
 * that allows HTML, and not /favicon.ico). Anything else, such as the
 * browser's own favicon request, is left to Vite as before, so the Lighthouse
 * run loads no extra file.
 * @param {{ method?: string, url?: string, headers: Record<string, string | undefined> }} req
 */
export function isPageRequest(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  if (req.url === '/favicon.ico') return false;
  const accept = req.headers.accept;
  return !accept || accept.includes('text/html') || accept.includes('*/*');
}

/** @returns {import('vite').Plugin} */
export function previewRoutes() {
  return {
    name: 'mapthevote-preview-routes',
    apply: (_, env) => env.isPreview === true,
    configurePreviewServer(server) {
      const outDir = path.resolve(server.config.root, server.config.build.outDir);
      server.middlewares.use((req, _res, next) => {
        if (!isPageRequest(req)) return next();
        const [pathname, query] = req.url.split(/\?(.*)/s);
        let decoded;
        try {
          decoded = decodeURIComponent(pathname);
        } catch {
          return next();
        }
        const target = previewTarget(outDir, decoded);
        if (target) req.url = query === undefined ? target : `${target}?${query}`;
        return next();
      });
    },
  };
}
