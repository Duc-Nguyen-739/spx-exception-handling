const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Share 0/19: server khong cham duoc file nao. Khoa che 2 dang that bai
// (khong doc duoc file vs bi chan share) + SSOT tach ID (fileIdOf_)
// de link drive dang full URL khong lam lech allowlist/reshare.

// KHOP Code.gs fileIdOf_.
function fileIdOf(v) {
  const t = String(v == null ? '' : v).trim();
  if (/^[A-Za-z0-9_-]{10,}$/.test(t)) return t;
  let m = t.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  m = t.match(/\/d\/([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : '';
}

test('photo-share: ID tran giu nguyen', () => {
  assert.strictEqual(fileIdOf('1AbCdefGhIjKlMnOp'), '1AbCdefGhIjKlMnOp');
  assert.strictEqual(fileIdOf('  1AbCdefGhIjKlMnOp  '), '1AbCdefGhIjKlMnOp');
});

test('photo-share: boc ID tu moi bien the link drive', () => {
  assert.strictEqual(fileIdOf('https://drive.google.com/thumbnail?id=1AbCdefGhIjKlMnOp&sz=w400'), '1AbCdefGhIjKlMnOp');
  assert.strictEqual(fileIdOf('https://drive.google.com/file/d/1AbCdefGhIjKlMnOp/view'), '1AbCdefGhIjKlMnOp');
  assert.strictEqual(fileIdOf('https://drive.google.com/uc?id=1AbCdefGhIjKlMnOp&export=view'), '1AbCdefGhIjKlMnOp');
});

test('photo-share: rac ve rong, khong lot URL la vao allowlist', () => {
  assert.strictEqual(fileIdOf(''), '');
  assert.strictEqual(fileIdOf('ngan'), '');
  assert.strictEqual(fileIdOf('Data_Images_Matbill/BOX.01.jpg'), '');
  assert.strictEqual(fileIdOf('https://www.appsheet.com/template/gettablefileurl?appName=x&fileName=y.jpg'), '');
});

const GS = fs.readFileSync('Code.gs', 'utf8');
const HTML = fs.readFileSync('index.html', 'utf8');

test('photo-share: SSOT fileIdOf_ dung chung, khong con pattern lech', () => {
  assert.strictEqual((GS.match(/function fileIdOf_\(/g) || []).length, 1);
  assert.ok(!GS.includes("trim() || driveIdFromUrl_("), 'khong con nhanh truthy-truoc-boc-sau');
  const uses = (GS.match(/fileIdOf_\(/g) || []).length;
  assert.ok(uses >= 6, 'helper + >=5 cho dung (photoIds 2 + reshare 3), hien co ' + uses);
});

test('photo-share: reshare phan loai that bai, khong nuot loi', () => {
  const b = GS.slice(GS.indexOf('function fixPhotoSharing('), GS.indexOf('function readPhotosAll_('));
  assert.ok(b.includes('unreadable'), 'dem file doc khong duoc (ID rac/quyen)');
  assert.ok(b.includes('blocked'), 'dem file bi chan share');
  assert.ok(b.includes('f = DriveApp.getFileById(fid)'), 'doc file tach rieng khoi doi share');
  assert.ok(b.includes('unreadable: unreadable, blocked: blocked'), 'tra breakdown cho client');
});

test('photo-share: UI hien breakdown de user bao lai dung benh', () => {
  assert.ok(HTML.includes('không đọc được file: '), 'hien so file doc khong duoc');
  assert.ok(HTML.includes('bị chặn share: '), 'hien so file bi chan share');
});
