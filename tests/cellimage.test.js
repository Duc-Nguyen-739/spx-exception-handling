const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Contract CELLIMAGE mint-on-open (KHOP Code.gs getDetailUrls + index.html
// refreshDetailUrls/applyDetailUrls/makeThumb_): tem w320 trong sheet Thumbs
// rieng, mint URL luc mo, graceful khi thieu tem.

// KHOP Code.gs thumbOrder_: outer -> product -> extras.
function thumbOrder(slot) {
  if (slot === 'ngoai_quan') return 0;
  if (slot === 'san_pham') return 1;
  return 2;
}
function sortThumbs(found) {
  return found.slice().sort((a, b) => {
    const d = thumbOrder(a.slot) - thumbOrder(b.slot);
    return d !== 0 ? d : (a.slot < b.slot ? -1 : 1);
  });
}

test('cellimage: server co sheet Thumbs tach rieng + API mint', () => {
  const gs = fs.readFileSync('Code.gs', 'utf8');
  assert.ok(gs.includes("var THUMBS_HEADER = ['code', 'slot', 'thumb'];"));
  assert.ok(gs.includes("getSheet_('Thumbs', THUMBS_HEADER)"));
  assert.strictEqual((gs.match(/function getDetailUrls\(/g) || []).length, 1);
  assert.strictEqual((gs.match(/function thumbOrder_\(/g) || []).length, 1);
});

test('cellimage: getDetailUrls doc nhe + mint + graceful', () => {
  const gs = fs.readFileSync('Code.gs', 'utf8');
  const b = gs.slice(gs.indexOf('function getDetailUrls('), gs.indexOf('function parseCreated_('));
  assert.ok(b.includes("findItemRow_(code).row < 0"), 'don khong ton tai thi bao loi');
  assert.ok(b.includes('getRange(2, 1, last - 1, 1)'), 'chi doc 1 cot A de tim dong');
  assert.ok(b.includes('rows.length < 6'), 'chan toi da 6 dong nho');
  assert.ok(b.includes('getContentUrl'), 'mint URL tuoi, khong fetch byte');
  assert.ok(b.includes('thumbs: []'), 'don chua co tem thi tra rong de client fallback cu');
});

test('cellimage: create_/adminEditItem ghi + xoa tem dong bo', () => {
  const gs = fs.readFileSync('Code.gs', 'utf8');
  assert.ok(gs.includes('p.thumbs'), 'create_ nhan tem w320 tu client');
  assert.ok(gs.includes('newCellImage().setSourceUrl('), 'in tem CELLIMAGE');
  assert.ok(gs.includes('p.addThumbs'), 'edit nhan tem anh moi thang hang');
  const i = gs.indexOf('function adminEditItem(');
  const win = gs.slice(i, i + 9000);
  assert.ok(win.includes("getSheet_('Thumbs', THUMBS_HEADER)"), 'xoa slot thi xoa luon dong tem');
});

test('cellimage: client prime khong mint, swap co guard', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const p = html.indexOf('function primeImages_(code){');
  const end = html.indexOf('function refreshDetailUrls', p);
  const pb = html.slice(p, end > 0 ? end : p + 400);
  assert.ok(!pb.includes('refreshDetailUrls(code)'),
    'B2: mo don khong mint tem (B3 xoa han ham mint)');
  const a = html.indexOf('function applyDetailUrls(code,slots){');
  assert.ok(html.slice(a, a + 500).includes('imgs.length!==(slots||[]).length'),
    'lech so luong thi khong swap');
  assert.ok(html.includes("toDataURL('image/jpeg',0.65)"), 'tem client w320 nhe');
  assert.ok(html.includes('thumbs:thumbs'), 'create gui kem tem');
  assert.ok(html.includes('addThumbs:addThumbs'), 'edit gui kem tem');
});

test('cellimage: thu tu server khop thu tu render client', () => {
  const out = sortThumbs([
    { slot: 'bo_sung', url: 'e' }, { slot: 'san_pham', url: 'p' }, { slot: 'ngoai_quan', url: 'o' },
  ]).map((x) => x.slot);
  assert.deepStrictEqual(out, ['ngoai_quan', 'san_pham', 'bo_sung']);
  const html = fs.readFileSync('index.html', 'utf8');
  const d = html.indexOf('function detailPhotos_(it){');
  const db = html.slice(d, d + 400);
  assert.ok(db.indexOf('imgOuter') < db.indexOf('imgProduct'), 'client render outer truoc product');
  assert.ok(db.indexOf('imgProduct') < db.indexOf('extras'), 'client render product truoc extras');
});

test('cellimage: mock co getDetailUrls', () => {
  const m = fs.readFileSync('mock/mock-google.js', 'utf8');
  assert.ok(m.includes('getDetailUrls: function (code)'));
});
