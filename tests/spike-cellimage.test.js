const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Contract spike CELLIMAGE (KHOP scripts/spike-cellimage.gs):
// script do chi ghi sheet tam + property tam, khong lo secret, co verdict.
const SRC = 'scripts/spike-cellimage.gs';

test('spike: co du 3 ham Mint/Check/Cleanup', () => {
  const s = fs.readFileSync(SRC, 'utf8');
  assert.ok(s.includes('function spikeCellImage_Mint()'));
  assert.ok(s.includes('function spikeCellImage_Check()'));
  assert.ok(s.includes('function spikeCellImage_Cleanup()'));
});

test('spike: doc CELLIMAGE bang getContentUrl (khong doc blob)', () => {
  const s = fs.readFileSync(SRC, 'utf8');
  assert.ok(s.includes('newCellImage()'));
  assert.ok(s.includes('setSourceUrl('));
  assert.ok(s.includes('getContentUrl()'));
  assert.ok(s.includes("typeof cv.getContentUrl !== 'function'"), 'kiem tra kieu o tem');
});

test('spike: chi ghi sheet tam + property tam, co cleanup', () => {
  const s = fs.readFileSync(SRC, 'utf8');
  assert.ok(s.includes("__SPIKE_CELLIMAGE__") || s.includes('__SPIKE_CELLIMAGE'));
  assert.ok(s.includes('deleteSheet('), 'cleanup xoa sheet tam');
  assert.ok(s.includes('deleteProperty('), 'cleanup xoa property tam');
  assert.ok(!s.includes("getSheetByName('Items')"), 'khong dung vao Items');
  assert.ok(!s.includes("getSheetByName('ActivityLog')"), 'khong dung vao ActivityLog');
});

test('spike: khong lo secret/fileId/URL ra log', () => {
  const s = fs.readFileSync(SRC, 'utf8');
  assert.ok(!/openById\(['"`]1[A-Za-z0-9_-]{20,}/.test(s), 'khong hardcode Sheet ID');
  assert.ok(s.includes('chi in do dai'), 'chi in do dai URL');
});

test('spike: co nguong verdict de ket luan', () => {
  const s = fs.readFileSync(SRC, 'utf8');
  assert.ok(s.includes('SPIKE_WRITE_BUDGET_MS'));
  assert.ok(s.includes('SPIKE_READ_BUDGET_MS'));
  assert.ok(s.includes('PASS') && s.includes('FAIL'));
});

test('spike: khong bi clasp day len GAS production', () => {
  const ig = fs.readFileSync('.claspignore', 'utf8');
  assert.ok(ig.split('\n').some((l) => l.trim() === 'scripts/**'), 'scripts/** bi loai khoi clasp push');
});
