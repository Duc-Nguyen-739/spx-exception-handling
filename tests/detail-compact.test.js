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

test('compact: strip can theo so luong (1 giua, 2 deu, 3 nhu cu)', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes('.phstrip.n2{grid-template-columns:repeat(2,1fr)}'));
  assert.ok(html.includes('.phstrip.n1{grid-template-columns:1fr;justify-items:center}'));
  assert.ok(html.includes('.phstrip.n1 .thumb{max-width:260px;width:100%}'));
  assert.ok(html.includes('<div class="phstrip n\'+Math.min(photos.length,3)+\'">'));
});

test('compact mobile: resolve sticky day + anh nho + timeline 70dvh', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes('#resolveCard{position:sticky;bottom:0'));
  assert.ok(html.includes('#resolveCard #btnConfirmResolve{height:42px;padding:0 13px;font-size:13px}'));
  assert.ok(html.includes('#detailHist{max-height:70dvh}'));
  assert.ok(html.includes('#detailBody .phstrip.n1 .thumb{max-width:140px}'));
  assert.ok(html.includes('.ph img{height:160px}'));
  assert.ok(html.includes('.phstrip.n1 .thumb{max-width:260px;width:100%}'));
  assert.ok(html.includes('.ph img{width:100%;height:210px;'));
});

test('compact: fallback chiu duoc .thumb + caption lightbox', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes("im.closest('.ph')||im.closest('.thumb')"));
  assert.ok(html.includes("querySelector('.cap')"));
});
