/**
 * scripts/serve.js — Static server preview local (không framework, không dependency).
 * Port từ spx-diem-danh/scripts/serve.js, gọn cho repo single-file: index.html tự
 * nạp mock/mock-google.js khi thiếu google.script (index.html:903-907) nên KHÔNG
 * cần inject demo/standalone như bản gốc.
 *
 * - Allowlist ĐÚNG file phục vụ UI: index.html + mock/*.js|json — mọi URL khác 403
 *   (Code.gs, api/, scripts/, docs/, .clasp.json, appsscript.json... không lộ ra mạng).
 * - Bind `127.0.0.1` (mặc định). Remote workspace cần public: `HOST=0.0.0.0 npm run dev`.
 *
 * Usage: node scripts/serve.js   (npm run dev)
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const ALLOW_RE = /^(index\.html|index\.local\.html|mock\/[\w.-]+\.(js|json))$/;

function safeResolve(urlPath) {
  let clean;
  try {
    clean = decodeURIComponent(String(urlPath).split('?')[0].split('#')[0]);
  } catch (e) {
    return null; // URL encode lỗi
  }
  const rel = clean === '/' ? 'index.html' : clean.replace(/^\/+/, '');
  if (!ALLOW_RE.test(rel)) return null;
  const abs = path.resolve(ROOT, rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  return abs;
}

const server = http.createServer((req, res) => {
  const abs = safeResolve(req.url || '/');
  if (!abs) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const type = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    const stream = fs.createReadStream(abs);
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('500 Read error');
    });
    stream.pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log('[serve] SPX Exception Handling preview: http://' + HOST + ':' + PORT + '/ (root ' + ROOT + ')');
});
