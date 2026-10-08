const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Contract B5: tra cuu sheet chiu tai 20k dong.
// TextFinder lay so dong re hon ~55% doc full roi loc (tanaike benchmark);
// lay gia tri thi doc dong nho. Cam range unbounded ("A:A" gay Service
// error >10k dong) — luon bound bang getLastRow().

const GS = fs.readFileSync('Code.gs', 'utf8');

test('scale-read: khong co TextFinder unbounded', () => {
  assert.ok(!GS.includes('"A:A"'), 'cam cot unbounded');
  assert.ok(!GS.includes('"C:C"'), 'cam cot unbounded');
  assert.ok(!GS.includes("'A:A'"), 'cam cot unbounded');
});

test('scale-read: findItemRow_ TextFinder bounded + fallback loop', () => {
  const b = GS.slice(GS.indexOf('function findItemRow_('), GS.indexOf('function readAllItems_('));
  assert.ok(b.includes('createTextFinder(code)'), 'tra TextFinder truoc');
  assert.ok(b.includes('matchEntireCell(true)'), 'khop dung ma');
  assert.ok(b.includes('getRange(2, 1, last - 1, 1)'), 'bound theo getLastRow');
  assert.ok(b.includes('findNext()'), 'tra 1 ma thi findNext');
  assert.ok(b.includes('readItemCodes_()'), 'giu fallback loop cu');
});

test('scale-read: photosForCodesStrict_ bounded + cap + dedup', () => {
  assert.strictEqual((GS.match(/function photosForCodesStrict_\(/g) || []).length, 1);
  const b = GS.slice(GS.indexOf('function photosForCodesStrict_('), GS.indexOf('function photosByCode_('));
  assert.ok(b.includes('keys.length > 25'), 'tran cap thi nho full cu');
  assert.ok(b.includes('getRange(2, 1, last - 1, 1)'), 'TextFinder bound');
  assert.ok(b.includes('findAll()'), 'quet het dong cua 1 ma');
  assert.ok(b.includes('getRange(found[j].getRow(), 1, 1,'), 'doc dong nho, khong full');
  assert.ok(b.includes('seen[k]'), 'dedup dong trung');
});

test('scale-read: duong doc user uu tien tail roi strict, full cuoi cung', () => {
  for (const fn of ['function photosByCode_(', 'function firstExtraMap_(']) {
    const end = fn === 'function photosByCode_(' ? 'function readPhotosTail_(' : 'function listItems(';
    const b = GS.slice(GS.indexOf(fn), GS.indexOf(end));
    const iTail = b.indexOf('photosForCodes_(want)');
    const iStrict = b.indexOf('photosForCodesStrict_(want)');
    const iFull = b.indexOf('readPhotosAll_()');
    assert.ok(iTail > 0 && iStrict > iTail && iFull > iStrict, fn + ': tail -> strict -> full');
  }
});
