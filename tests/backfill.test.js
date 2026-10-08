const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Contract backfill tem CELLIMAGE (KHOP scripts/backfill-thumbs.gs):
// chay theo dot, skip slot da co tem, bao file mat theo ma (khong lo fileId).
const SRC = 'scripts/backfill-thumbs.gs';

test('backfill: co du 3 ham Run/Status/Reset + chunk bounded', () => {
  const s = fs.readFileSync(SRC, 'utf8');
  assert.ok(s.includes('function BackfillRun()'));
  assert.ok(s.includes('function BackfillStatus()'));
  assert.ok(s.includes('function BackfillReset()'));
  assert.ok(s.includes('BACKFILL_CHUNK = 40'));
});

test('backfill: dedup theo Thumbs, chi append, khong dung sheet khac', () => {
  const s = fs.readFileSync(SRC, 'utf8');
  assert.ok(s.includes('have['), 'join RAM de skip slot da co tem');
  assert.ok(s.includes('getLastRow() + 1'), 'chi append, khong ghi de');
  assert.ok(!s.includes("getSheetByName('Items')"), 'khong dung Items');
  assert.ok(!s.includes("getSheetByName('ActivityLog')"), 'khong dung ActivityLog');
  assert.ok(s.includes('newCellImage()'), 'in tem CELLIMAGE');
});

test('backfill: bao file mat theo ma, khong lo fileId ra log', () => {
  const s = fs.readFileSync(SRC, 'utf8');
  assert.ok(s.includes('gone.push'), 'gom danh sach file mat');
  assert.ok(s.includes('file mat'), 'log neu ro file mat de audit');
  const logLines = s.split('\n').filter((l) => l.includes('Logger.log'));
  for (const l of logLines) {
    assert.ok(!/fid|fileId/.test(l), 'khong in fileId ra log: ' + l.slice(0, 80));
  }
});

test('backfill: cursor tiep tuc duoc qua Property + co reset', () => {
  const s = fs.readFileSync(SRC, 'utf8');
  assert.ok(s.includes('BACKFILL_THUMBS'));
  assert.ok(s.includes('setProperty(BACKFILL_PROP'), 'luu cursor sau moi dot');
  assert.ok(s.includes('deleteProperty(BACKFILL_PROP'), 'xoa cursor khi xong/reset');
});

test('backfill: khong bi clasp day len GAS production', () => {
  const ig = fs.readFileSync('.claspignore', 'utf8');
  assert.ok(ig.split('\n').some((l) => l.trim() === 'scripts/**'), 'scripts/** bi loai khoi clasp push');
});
