'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createPreviewServer } = require('../work/preview-server.cjs');

const root = path.resolve(__dirname, '..');
function request(port, url) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: url }, response => {
      response.resume();
      response.on('error', reject);
      response.on('end', () => resolve({
        status: response.statusCode,
        type: response.headers['content-type'] || ''
      }));
    });
    req.on('error', reject);
  });
}

test('local preview serves all HTML scripts and stylesheets and rejects unrelated paths', async t => {
  const server = createPreviewServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+\.(?:m?js|css)(?:\?[^"]*)?)"/g)]
    .map(match => match[1]);
  assert.ok(refs.length >= 15, 'the test must inspect actual application dependencies');
  for (const filename of ['dxf-engine.js', 'dxf-objects.js', 'detail-routing.js', 'storage-safety.js']) {
    assert.ok(refs.some(ref => ref.replace(/^\.\//, '').split('?')[0] === filename), filename);
  }
  for (const ref of refs) {
    const result = await request(port, '/' + ref.replace(/^\.\//, ''));
    assert.equal(result.status, 200, 'missing dependency: ' + ref);
    assert.match(result.type, /(?:javascript|css)/, 'wrong MIME type: ' + ref);
  }
  for (const url of ['/package.json', '/README.md', '/audit/regression/checkpoint.json', '/work/preview-server.cjs']) {
    const result = await request(port, url);
    assert.equal(result.status, 404, 'unrelated file must not be served: ' + url);
  }
});
