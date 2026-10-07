const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Contract: mo lai don da cache thi zero call; freshness do poll 3' listFull lo.
test('detail-ttl: cached hit zero call, khong fetch rieng khi doi don', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const i = html.indexOf('var cached=state.detailCache[code];');
  assert.ok(i > 0);
  const end = html.indexOf('return;', i);
  assert.ok(end > i);
  const block = html.slice(i, end);
  assert.ok(block.includes('state.detail=cached'));
  assert.ok(block.includes("paintDetail(code,'')"));
  assert.ok(!block.includes("gs('getItem'"));
  assert.ok(!block.includes('DETAIL_TTL_MS'));
});

test('detail-ttl: loadGrid preload listFull 150 + dong dau detailAt', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const gs = fs.readFileSync('Code.gs', 'utf8');
  assert.ok(gs.includes('var LIST_LIMIT = 150;'));
  assert.ok(gs.includes('function listFull(limit)'));
  assert.ok(html.includes("gs('listFull',[150])"));
  assert.ok(html.includes('detailAt:{},_loadingGrid'));
  const stamps = html.match(/state\.detailAt\[code\]=Date\.now\(\)/g) || [];
  const caches = html.match(/state\.detailCache\[code\]=/g) || [];
  assert.ok(stamps.length >= 2);
  assert.strictEqual(stamps.length, caches.length);
});
