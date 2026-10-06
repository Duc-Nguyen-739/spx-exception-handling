const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Contract: detail da mo trong TTL thi zero call; qua TTL moi refresh nen.
const TTL = 5 * 60 * 1000;
function needsRefresh(cachedAt, now) {
  return (now - (cachedAt || 0)) >= TTL;
}

test('detail-ttl: tuoi thi zero call, het han moi refresh', () => {
  const now = Date.now();
  assert.strictEqual(needsRefresh(now - 60 * 1000, now), false);
  assert.strictEqual(needsRefresh(now - TTL - 1, now), true);
  assert.strictEqual(needsRefresh(0, now), true);
});

test('detail-ttl: app dong dau thoi gian + check tuoi truoc fetch', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes('var DETAIL_TTL_MS=5*60*1000;'));
  assert.ok(html.includes('detailAt:{},_loadingGrid'));
  const stamps = html.match(/state\.detailAt\[code\]=Date\.now\(\)/g) || [];
  const caches = html.match(/state\.detailCache\[code\]=/g) || [];
  assert.strictEqual(stamps.length, caches.length);
  assert.ok(html.includes('if(Date.now()-((state.detailAt||{})[code]||0)<DETAIL_TTL_MS)return;'));
});
