const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Mirror client: detailPhotos_ + phStrip (header dinh + dai anh ngang).
function detailPhotos_(it) {
  const arr = [];
  if (it.kind === 'Box' || it.imgOuter) arr.push(['Ngoại quan', it.imgOuter]);
  arr.push(['Sản phẩm', it.imgProduct]);
  (it.extras || []).forEach((u, i) => arr.push(['Bổ sung ' + (i + 1), u]));
  return arr.filter((p) => !!p[1]);
}

test('compact: Box du 3 anh, Item bo ngoai quan trong, anh rong bi loc', () => {
  const box = detailPhotos_({ kind: 'Box', imgOuter: 'o', imgProduct: 'p', extras: ['e'] });
  assert.deepStrictEqual(box.map((p) => p[0]), ['Ngoại quan', 'Sản phẩm', 'Bổ sung 1']);
  const item = detailPhotos_({ kind: 'Item', imgOuter: '', imgProduct: 'p', extras: [] });
  assert.deepStrictEqual(item.map((p) => p[0]), ['Sản phẩm']);
  const empty = detailPhotos_({ kind: 'Item', imgOuter: '', imgProduct: '', extras: [] });
  assert.deepStrictEqual(empty, []);
});

test('compact: dhead sticky + strip CSS co mat', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const d = html.match(/\.dhead\{[^}]*\}/)[0];
  assert.ok(d.includes('position:sticky'));
  assert.ok(d.includes('background:var(--card)'));
  assert.ok(d.includes('z-index:5'));
  assert.ok(html.includes('.phstrip{display:grid;grid-template-columns:repeat(3,1fr)'));
  assert.ok(html.includes("function phStrip(photos){"));
  assert.ok(html.includes("function detailPhotos_(it){"));
});

test('compact: fallback chiu duoc .thumb + caption lightbox', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes("im.closest('.ph')||im.closest('.thumb')"));
  assert.ok(html.includes("querySelector('.cap')"));
});
