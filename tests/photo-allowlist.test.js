const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Contract B1: kiem quyen anh O(1) theo cay folder, KHONG doc full sheet.
// photoIds_ quet full Photos cot C + Items cot E:F MOI lan kiem 1 anh
// (~60k o/call o 20k dong) → thay bang inPhotoFolder_ (Drive parents + cache).

const GS = fs.readFileSync('Code.gs', 'utf8');

test('photo-allowlist: co inPhotoFolder_ dung 1 lan, khong trung', () => {
  assert.strictEqual((GS.match(/function inPhotoFolder_\(/g) || []).length, 1);
});

test('photo-allowlist: 3 API anh dung folder check, photoIds_ da xoa', () => {
  assert.ok(!GS.includes('function photoIds_('), 'khong hoi sinh full-scan');
  for (const fn of ['function getPhoto(', 'function getThumb(', 'function getThumbs(']) {
    assert.ok(GS.includes(fn), 'thieu ' + fn);
  }
  const photo = GS.slice(GS.indexOf('function getPhoto('), GS.indexOf('function parseCreated_('));
  assert.ok(!photo.includes('photoIds_()'), 'duong anh khong duoc quet full sheet');
  assert.ok(photo.includes('inPhotoFolder_(fileId)'), 'getPhoto phai kiem folder');
  assert.ok(photo.includes('inPhotoFolder_(fid)'), 'getThumbs phai kiem folder tung anh');
});

test('photo-allowlist: co cache ScriptCache + gioi han depth', () => {
  const b = GS.slice(GS.indexOf('function inPhotoFolder_('), GS.indexOf('function getPhoto('));
  assert.ok(b.includes("'phok_' + fileId"), 'cache theo file');
  assert.ok(b.includes('ok ? 21600 : 600'), 'am 10 phut, duong 6h');
  assert.ok(b.includes('getParents()'), 'kiem cay folder');
  assert.ok(b.includes('d1 < 3') && b.includes('d2 < 3'), 'gioi han depth chong loop');
  assert.ok(b.includes('PROP_FOLDER'), 'so voi FOLDER_ID, khong hardcode');
});

test('photo-allowlist: id rac tra false ngay, khong cham Drive', () => {
  const b = GS.slice(GS.indexOf('function inPhotoFolder_('), GS.indexOf('function getPhoto('));
  const i = b.indexOf("if (!/^[a-zA-Z0-9_-]{10,}$/");
  assert.ok(i >= 0 && i < b.indexOf('getFileById'), 'validate truoc getFileById');
});
