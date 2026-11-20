'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('browser suites use portable Chromium launcher with optional executable override', () => {
  const root = __dirname;
  const files = fs.readdirSync(root).filter(name => name.endsWith('.browser.test.cjs'));
  assert.ok(files.length >= 90, 'expected browser regression suites');
  let launchers = 0;
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /C:\\|C:\/Program Files|msedge\.exe/i, file + ' contains a hardcoded Windows path');
    if (source.includes('chromium.launch(')) {
      launchers++;
      assert.match(source, /process\.env\.(?:TEST_BROWSER_PATH|BROWSER_EXECUTABLE)/,
        file + ' must allow an optional browser override');
    }
  }
  assert.ok(launchers >= 85, 'expected Playwright Chromium browser suites');
});
