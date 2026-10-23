// The head script that reserves the home page's dot map box (#184).
// @vitest-environment node
import { homeMapWindow, windowScript } from '../features/waitTimes/homeMapWindow.js';
import homeMapScript from './homeMapScript.js';

function emitted(plugin) {
  const files = [];
  plugin.generateBundle.call({ emitFile: (file) => files.push(file) });
  return files;
}

describe('homeMapScript', () => {
  it('emits the window script as a hashed asset and loads it first in the head', () => {
    const window = { start: 100, end: 200 };
    const plugin = homeMapScript({ window });
    const [file] = emitted(plugin);
    expect(file).toEqual({
      type: 'asset',
      fileName: expect.stringMatching(/^assets\/home-map-[0-9a-f]{8}\.js$/),
      source: windowScript(window),
    });
    expect(plugin.transformIndexHtml.order).toBe('post');
    expect(plugin.transformIndexHtml.handler()).toEqual([
      { tag: 'script', attrs: { src: `/${file.fileName}` }, injectTo: 'head-prepend' },
    ]);
  });

  it('names the file by its content', () => {
    const a = emitted(homeMapScript({ window: { start: 1, end: 2 } }))[0].fileName;
    const b = emitted(homeMapScript({ window: { start: 1, end: 3 } }))[0].fileName;
    expect(a).not.toBe(b);
  });

  it('adds nothing with the home map off', () => {
    const plugin = homeMapScript({ window: null });
    expect(emitted(plugin)).toEqual([]);
    expect(plugin.transformIndexHtml.handler()).toEqual([]);
  });

  it('reads the config by default', () => {
    const [file] = emitted(homeMapScript());
    expect(file.source).toBe(windowScript(homeMapWindow()));
  });

  it('runs only in the build', () => {
    expect(homeMapScript().apply).toBe('build');
  });
});
