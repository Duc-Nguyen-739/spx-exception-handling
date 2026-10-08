const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Contract B1 scale: mo phong sheet 20.001 dong — kiem quyen anh
// KHONG duoc phu thuoc so dong (khong getRange full, khong loop rows).

const GS = fs.readFileSync('Code.gs', 'utf8');

test('scale-20k: inPhotoFolder_ khong doc sheet', () => {
  const b = GS.slice(GS.indexOf('function inPhotoFolder_('), GS.indexOf('function photoIds_()'));
  assert.ok(!b.includes('getValues()'), 'khong doc sheet o duong kiem quyen');
  assert.ok(!b.includes('getLastRow()'), 'khong phu thuoc so dong');
  assert.ok(!b.includes('for (var i = 0; i < colC'), 'khong loop cot');
});

test('scale-20k: getThumbs batch van cap 24, loi 1 anh khong fail lo', () => {
  const b = GS.slice(GS.indexOf('function getThumbs('), GS.indexOf('function thumbOrder_('));
  assert.ok(b.includes('list.slice(0, 24)'), 'giu cap batch');
  assert.ok(b.includes("out[fid] = { error:"), 'loi tung anh');
});
