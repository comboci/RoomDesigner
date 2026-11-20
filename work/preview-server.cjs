'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

// Only top-level dependencies used by index.html are explicitly allowed.
// Dynamic assets must remain inside data/ or assets/.
const rootFiles = new Set([
  "index.html",
  "favicon.svg",
  "dxf-engine.js",
  "dxf-objects.js",
  "detail-routing.js",
  "storage-safety.js",
  "svg-engine.js",
  "equipment-release.js",
  "connection-model.js",
  "lighting-model.js",
  "selection-geometry.js",
  "polyline-editor.js",
  "cable-routing.js"
]);

function createPreviewServer() {
  return http.createServer((req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      if (!rootFiles.has(relative) && !relative.startsWith('data/') && !relative.startsWith('assets/')) {
        res.writeHead(404);
        return res.end();
      }
      const file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, {
        'Content-Type': types[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      fs.createReadStream(file).pipe(res);
    } catch {
      res.writeHead(400);
      res.end();
    }
  });
}

if (require.main === module) {
  createPreviewServer().listen(8765, '127.0.0.1', () => {
    console.log('Preview ready: http://127.0.0.1:8765');
  });
}

module.exports = { createPreviewServer };
