// Reserves the home page's dot map box before the first paint (#184). The
// pages are pre-rendered at build time (#99) and cannot know the date, so the
// build emits a few hundred bytes of plain script, from the config's dates
// (src/features/waitTimes/homeMapWindow.js), and loads it first in every page's
// head. While the map window is open it marks <html> with `data-home-map`, and
// src/index.css then shows the box at its reserved height. It is a hashed
// same-origin file, so the Content-Security-Policy (`script-src 'self'`) allows
// it and it is cached for good; it loads alongside the stylesheet, which blocks
// the first paint anyway. With the home map off (`waitTimes.homeMap`) nothing
// is added. In every mode (build, dev, tests) it also defines the window as
// `__HOME_MAP_WINDOW__` for src/features/waitTimes/homeMapMode.js,
// so the app knows it without loading the City's config in the first load.
//
// vite.config.js loads this file in plain Node: it imports only the window
// module, which reads the config.

import { createHash } from 'node:crypto';
import { homeMapWindow, windowScript } from '../features/waitTimes/homeMapWindow.js';

/**
 * @param {{ window?: { start: number, end: number } | null }} [options] For tests.
 * @returns {import('vite').Plugin}
 */
export default function homeMapScript({ window = homeMapWindow() } = {}) {
  const source = window ? windowScript(window) : null;
  const hash = source && createHash('sha256').update(source).digest('hex').slice(0, 8);
  const fileName = source && `assets/home-map-${hash}.js`;
  let build = false;
  return {
    name: 'mapthevote-home-map-script',
    config() {
      return { define: { __HOME_MAP_WINDOW__: JSON.stringify(window) } };
    },
    configResolved(config) {
      build = config.command === 'build';
    },
    generateBundle() {
      if (source && build) this.emitFile({ type: 'asset', fileName, source });
    },
    transformIndexHtml: {
      order: 'post',
      handler() {
        if (!source || !build) return [];
        return [{ tag: 'script', attrs: { src: `/${fileName}` }, injectTo: 'head-prepend' }];
      },
    },
  };
}
