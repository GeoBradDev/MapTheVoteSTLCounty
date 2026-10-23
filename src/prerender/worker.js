// Writes the pre-rendered public pages (#99), in a worker thread started by
// plugin.js after the client build. A Vite server (the project's config, in
// serve mode, so the build-only plugins do not run again) compiles
// src/entry-server.jsx for Node; each page goes to the file outputFile names.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { workerData } from 'node:worker_threads';
import { createServer } from 'vite';
import { outputFile } from './outputFile.js';

const { root, configFile, mode, outDir, template } = workerData;

const server = await createServer({
  root,
  configFile,
  mode,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
try {
  const { prepare, prerenderPaths, renderRoute } =
    await server.ssrLoadModule('/src/entry-server.jsx');
  await prepare();
  for (const route of prerenderPaths()) {
    const file = path.join(outDir, outputFile(route));
    await mkdir(path.dirname(file), { recursive: true });
    let html;
    try {
      html = renderRoute(route, template);
    } catch (error) {
      throw new Error(`Pre-rendering ${route} failed: ${error.message}`, { cause: error });
    }
    await writeFile(file, html);
  }
} finally {
  await server.close();
}
