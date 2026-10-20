// node test/harness/serve.mjs  → http://localhost:3300/?  (UI + in-browser Postgres). Add ?seed=0 for an empty user without a space.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.wasm': 'application/wasm', '.data': 'application/octet-stream', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.sql': 'text/plain' };
const MAP = [['/pglite/', 'node_modules/@electric-sql/pglite/dist/'], ['/test/', 'test/'], ['/supabase/', 'supabase/'], ['/', 'public/']];
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); let p = decodeURIComponent(u.pathname);
  if (p === '/') { let html = await readFile(join(ROOT, 'public/index.html'), 'utf8'); html = html.replace('<script src="config.js"></script>', '').replace('<script src="vendor/supabase.js"></script>', '').replace('<script type="module" src="js/app.js"></script>', '<script type="module" src="/test/harness/boot.js"></script>').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
    res.writeHead(200, { 'Content-Type': MIME['.html'] }); return res.end(html); }
  const [prefix, dir] = MAP.find(([x]) => p.startsWith(x)); const file = normalize(join(ROOT, dir, p.slice(prefix.length)));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try { const body = await readFile(file); res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(body); } catch { res.writeHead(404); res.end('nf'); }
}).listen(3300, '127.0.0.1', () => console.log('harness → http://localhost:3300/'));
