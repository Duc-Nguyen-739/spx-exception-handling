const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Mirror client: syncScanClear hien khi co chu, an khi rong.
function visibleFor(value) {
  return String(value || '').trim().length > 0;
}

test('search-clear: hien khi co chu, an khi rong/khoang trang', () => {
  assert.strictEqual(visibleFor('Trung'), true);
  assert.strictEqual(visibleFor(''), false);
  assert.strictEqual(visibleFor('   '), false);
});

test('search-clear: nut + wiring co mat trong app', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes('id="scanClear"'));
  assert.ok(html.includes('#scanClear.show{display:block}'));
  assert.ok(html.includes('function syncScanClear()'));
  assert.ok(html.includes("getElementById('scanClear').onclick"));
  const i = html.indexOf("getElementById('scanMain').addEventListener('input'");
  assert.ok(html.slice(i, i + 200).includes('syncScanClear()'));
});
