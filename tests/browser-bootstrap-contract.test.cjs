'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const testsPath = __dirname;

test('browser regression script selectors match the current async app bootstrap', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const mainScripts = scripts.filter(s => s.includes('const writer=await RoomStorageSafety.acquireWriter'));
  assert.equal(mainScripts.length, 1, 'exactly one main application script is expected');

  const currentBootstrap = "(async()=>{'use strict';";
  const obsoleteBootstrap = '(' + "()=>{'use strict';";
  assert.ok(mainScripts[0].includes(currentBootstrap), 'the current async bootstrap was not found');

  const files = fs.readdirSync(testsPath).filter(name => name.endsWith('.browser.test.cjs'));
  assert.ok(files.length >= 1, 'browser-test sources must exist');

  let matchingTests = 0;
  for (const filename of files) {
    const source = fs.readFileSync(path.join(testsPath, filename), 'utf8');
    assert.ok(!source.includes(obsoleteBootstrap), filename + ' uses the obsolete synchronous bootstrap');
    if (source.includes(currentBootstrap)) matchingTests++;
  }
  assert.ok(matchingTests > 0, 'no browser-test source uses the current app bootstrap');
});
