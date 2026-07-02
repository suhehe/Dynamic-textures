import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

function readRequestBody(req: any) {
  return new Promise<string>((resolveBody, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => { body += chunk; });
    req.on('end', () => resolveBody(body));
    req.on('error', reject);
  });
}

function texturePresetData(): Plugin {
  const presetPath = resolve(process.cwd(), 'data/texture-presets.json');
  const empty = { selectedId: null, presets: [] };

  return {
    name: 'texture-preset-data',
    configureServer(server) {
      server.middlewares.use('/__texture/presets', async (req, res) => {
        try {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          if (req.method === 'GET') {
            res.end(existsSync(presetPath) ? readFileSync(presetPath, 'utf-8') : JSON.stringify(empty));
            return;
          }
          if (req.method === 'POST') {
            const body = await readRequestBody(req);
            const data = body ? JSON.parse(body) : empty;
            mkdirSync(dirname(presetPath), { recursive: true });
            writeFileSync(presetPath, JSON.stringify(data, null, 2));
            res.end(JSON.stringify(data));
            return;
          }
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), texturePresetData(), cloudflare()],
  base: './',
  server: {
    port: 3001,
    strictPort: false,
    host: true,
  },
  preview: {
    port: 3001,
    strictPort: false,
    host: true,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    modulePreload: false,
  },
});