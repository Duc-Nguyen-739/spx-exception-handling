const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Contract: iOS tu zoom khi focus o chu <16px -> mobile inputs >=16px, giu focus ban phim.
test('input-zoom: mobile inputs du 16px de iOS khong tu zoom', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const m = html.match(/@media\(max-width:899px\)\{input,textarea,select,\.scanbar input\{font-size:(\d+)px\}\}/);
  assert.ok(m, 'thieu rule khoa zoom');
  assert.ok(parseInt(m[1], 10) >= 16);
});

test('input-zoom: khong khoa zoom chu dong cua user + giu focus', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const vp = html.match(/<meta name="viewport" content="([^"]+)">/);
  assert.ok(vp);
  assert.ok(!/maximum-scale|user-scalable=no/.test(vp[1]));
  assert.ok(html.includes("document.getElementById('resolveBill').focus()"));
});
