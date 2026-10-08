const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Contract B3: he CELLIMAGE mint-on-open DA XOA.
// Ly do: URL tem la URL ky co han → khong cache vo han → bat buoc mint lai
// moi lan mo (~1s). Tang 2 (direct Drive, da share domain) song → tem thua.
// Cam hoi sinh: getDetailUrls / THUMBS_HEADER / newCellImage / mint-swap.

test('notem: server khong con mint tem', () => {
  const gs = fs.readFileSync('Code.gs', 'utf8');
  assert.ok(!gs.includes('function getDetailUrls('), 'xoa API mint');
  assert.ok(!gs.includes('function thumbOrder_('), 'xoa helper sap tem');
  assert.ok(!gs.includes('THUMBS_HEADER'), 'xoa sheet tem');
  assert.ok(!gs.includes('newCellImage'), 'khong in tem nua');
  assert.ok(!gs.includes("getSheet_('Thumbs'"), 'khong doc/ghi sheet tem');
});

test('notem: create_/adminEditItem khong nhan/ghi tem', () => {
  const gs = fs.readFileSync('Code.gs', 'utf8');
  assert.ok(!gs.includes('p.thumbs'), 'create bo tham so thumbs');
  assert.ok(!gs.includes('p.addThumbs'), 'edit bo tham so addThumbs');
});

test('notem: client khong mint, khong swap tem, khong gui tem', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  for (const s of ['refreshDetailUrls', 'applyDetailUrls', 'getDetailUrls',
    'makeThumb_', 'slotName_', "dataset.src='cell'", "' (tem)'", 'thumbs:thumbs',
    'addThumbs:addThumbs']) {
    assert.ok(!html.includes(s), 'khong con: ' + s);
  }
  assert.ok(html.includes('function cellDriveId_(im){'), 'giu fallback id goc cho duong poison');
  assert.ok(html.includes('function warmIfMissing(code){'), 'prime qua cache-first');
});

test('notem: mock khong con tem', () => {
  const m = fs.readFileSync('mock/mock-google.js', 'utf8');
  assert.ok(!m.includes('getDetailUrls'), 'mock bo API tem');
});

test('notem: thu tu render chi tiet giu nguyen (outer -> product -> extras)', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const d = html.indexOf('function detailPhotos_(it){');
  assert.ok(d > 0);
  const db = html.slice(d, d + 400);
  assert.ok(db.indexOf('imgOuter') < db.indexOf('imgProduct'), 'outer truoc product');
  assert.ok(db.indexOf('imgProduct') < db.indexOf('extras'), 'product truoc extras');
});
