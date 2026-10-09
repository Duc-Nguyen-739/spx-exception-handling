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

test('compact mobile: mau A — bang co dinh, info du, timeline cuon trong', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(!html.includes('#detailModal .sheet{display:block'));
  assert.ok(!html.includes('#histCard{display:block'));
  assert.ok(html.includes('#detailHist{flex:1;min-height:0;max-height:none}'));
  assert.ok(!html.includes('#resolveCard{position:sticky'));
  assert.ok(html.includes('#resolveCard #btnConfirmResolve{height:38px;flex:none;padding:0 14px;font-size:12.5px}'));
  assert.ok(html.includes('#detailBody .phstrip.n1 .thumb{max-width:220px}'));
  assert.ok(html.includes('#detailBody .phstrip.n1 .thumb img{height:110px;aspect-ratio:auto}'));
  assert.ok(html.includes('#detailBody .phstrip.n2 .thumb img{height:110px;aspect-ratio:auto}'));
  assert.ok(html.includes('#detailBody .phstrip.n2{grid-template-columns:repeat(2,minmax(0,150px));justify-content:center}'));
  assert.ok(html.includes('#detailBody .kv{padding:6px 0;font-size:11.5px}'));
  assert.ok(html.includes('.ph img{height:160px}'));
  assert.ok(html.includes('#detailHist{overflow-y:auto;max-height:420px;'));
  assert.ok(html.includes('.phstrip.n1 .thumb{max-width:260px;width:100%}'));
  assert.ok(html.includes('.ph img{width:100%;height:210px;'));
});

test('compact: form bill 1 hang [quet][bill][confirm 42px] + mo form tu cuon day', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const i = html.indexOf('id="btnConfirmResolve"');
  const j = html.indexOf('id="rsStep2"');
  const k = html.indexOf('id="btnCancelResolve"');
  assert.ok(j < i && i < k, 'Confirm phai nam trong form bill');
  assert.ok(!html.includes('<div class="btnrow"><button id="btnConfirmResolve"'), 'xoa wrapper btnrow thua');
  assert.ok(html.includes('#resolveCard #btnConfirmResolve{height:38px;flex:none;'));
  assert.ok(html.includes("sh.scrollTop=sh.scrollHeight"));
});

test('tidy: form bill bo label + gon; Role bo Deploy + 3 nut; Liq gon', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(!html.includes('<label>Mã bill</label>'), 'bo label Ma bill');
  assert.ok(html.includes('#resolveCard .billrow button{padding:8px 10px;font-size:12px}'));
  assert.ok(!html.includes("· Deploy: '"), 'bo duoi Deploy Role tab');
  assert.ok(!html.includes('id="btnFixShare"') && !html.includes('id="btnDiagId"') && !html.includes('id="btnAuditPh"'), 'bo 3 nut chan doan');
  assert.ok(!html.includes('Quét mã thanh lý'), 'bo label Liq');
  assert.ok(html.includes('<button id="camLiq">📷 Quét camera</button>'));
  assert.ok(html.indexOf('id="btnNext"') < html.indexOf('id="msgLiq"'), 'Next ngay duoi thanh scan');
  assert.ok(html.includes('#viewLiq .lnextrow .primary{flex:1}'));
});

test('intro: nut chuong the cho so ban, mo popup Gioi thieu', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes('<button id="btnIntro"'));
  assert.ok(html.indexOf('id="btnIntro"') < html.indexOf('id="btnTheme"'));
  assert.ok(!html.includes('appRev') && !html.includes('BUILD_REV') && !html.includes('.revtag'));
  assert.ok(html.includes('id="introModal"'));
  assert.ok(html.includes('Giới thiệu - Hướng dẫn sử dụng'));
  assert.ok(html.includes('Exception Handling nơi quản lý - xử lý những đơn hàng mất bill'));
  assert.ok(html.indexOf('bigbell') < html.indexOf('Giới thiệu - Hướng dẫn sử dụng'), 'chuong phai tren tieu de');
  assert.ok(html.includes('#introModal .sheet{text-align:center}'), 'popup can giua');
});

test('compact: fallback chiu duoc .thumb + caption lightbox', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes("im.closest('.ph')||im.closest('.thumb')"));
  assert.ok(html.includes("querySelector('.cap')"));
});
