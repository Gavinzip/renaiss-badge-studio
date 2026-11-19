import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const fromRoot = path => fileURLToPath(new URL(path, import.meta.url));

function studioEntry() {
  function redirect(request, response, next) {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path !== '/') return next();
    response.statusCode = 302;
    response.setHeader('Location', '/badges/');
    response.setHeader('Cache-Control', 'no-store');
    response.end();
  }
  return {
    name: 'badge-studio-entry',
    configureServer(server) { server.middlewares.use(redirect); },
    configurePreviewServer(server) { server.middlewares.use(redirect); },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'index.html',
        source: '<!doctype html><html lang="zh-Hant"><meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=./badges/"><title>Renaiss 徽章工作室</title><a href="./badges/">開啟徽章工作室</a></html>',
      });
    },
  };
}

export default defineConfig({
  root: fromRoot('./app'),
  publicDir: false,
  envDir: fromRoot('./'),
  plugins: [studioEntry()],
  server: { strictPort: true },
  preview: { strictPort: true },
  build: {
    outDir: fromRoot('./dist'),
    rolldownOptions: {
      input: { badges: fromRoot('./app/badges/index.html') },
      output: {
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            { name: 'three-core', test: /node_modules\/three\/build\/three\.core\.js$/ },
            { name: 'three-renderer', test: /node_modules\/three\/build\/three\.module\.js$/ },
          ],
        },
      },
    },
  },
});
