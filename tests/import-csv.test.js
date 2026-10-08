const { test } = require('node:test');
const assert = require('node:assert');
const imp = require('../scripts/import-csv.js');

// Contract import anh (KHOP scripts/import-csv.js normalizePhoto +
// Code.gs driveIdFromUrl_/thumbUrl_): chi Drive fileId di tiep,
// link drive chuan hoa ve ID, rac rot co note de audit.
const { normalizePhoto, normalizeRow, run } = imp;

test('import-photo: ID tran giu nguyen, link drive chuan hoa ve ID', () => {
  assert.deepStrictEqual(normalizePhoto('1AbCdefGhIjKlMnOp'), { id: '1AbCdefGhIjKlMnOp', dropped: false });
  assert.deepStrictEqual(
    normalizePhoto('https://drive.google.com/file/d/1AbCdefGhIjKlMnOp/view'),
    { id: '1AbCdefGhIjKlMnOp', dropped: false });
  assert.deepStrictEqual(
    normalizePhoto('https://drive.google.com/open?id=1AbCdefGhIjKlMnOp'),
    { id: '1AbCdefGhIjKlMnOp', dropped: false });
  assert.deepStrictEqual(
    normalizePhoto('https://drive.google.com/thumbnail?id=1AbCdefGhIjKlMnOp&sz=w400'),
    { id: '1AbCdefGhIjKlMnOp', dropped: false });
});

test('import-photo: trong/ID ngan/rac xu ly dung', () => {
  assert.deepStrictEqual(normalizePhoto(''), { id: '', dropped: false });
  assert.deepStrictEqual(normalizePhoto('  '), { id: '', dropped: false });
  assert.deepStrictEqual(normalizePhoto('abc123'), { id: '', dropped: true });
  assert.deepStrictEqual(normalizePhoto('co anh ngoai quan'), { id: '', dropped: true });
  assert.deepStrictEqual(
    normalizePhoto('https://example.com/x.jpg'),
    { id: 'https://example.com/x.jpg', dropped: false });
});

test('import-photo: normalizeRow loc rac + note audit + dem stats', () => {
  const cols = ['01/10/2026', 'BOX.01102026.1', 'Mo ta', 'Box', 'co anh', '1AbCdefGhIjKlMnOp', '', '', '', '', 'a@x.com'];
  const n = normalizeRow(cols);
  assert.strictEqual(n.photo_path_outer, '');
  assert.strictEqual(n.photo_path_product, '1AbCdefGhIjKlMnOp');
  assert.ok(/anh la: co anh/.test(n.note));
  const { stats } = run('ngay,mã sản phẩm,mô tả,loại,ảnh 1,ảnh 2,x,y,z,t,reporter\n' + cols.join(',') + '\n');
  assert.strictEqual(stats.weird_photo, 1);
});
