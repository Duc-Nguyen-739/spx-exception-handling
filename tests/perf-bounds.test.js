const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Contract hieu nang (goi C): chan doc full vo han o list paths, ghi dich danh,
// batch log, memo Spreadsheet, cache folder thang.
// Mirror logic coverage fail-safe cua photosForCodes_/logsForCodes_.
function coverageOk(want, seen) {
  for (const k of Object.keys(want)) {
    if (!seen[k]) return null;
  }
  return seen;
}

test('perf: memo Spreadsheet/execution, khong openById moi getSheet_', () => {
  const gs = fs.readFileSync('Code.gs', 'utf8');
  assert.ok(gs.includes('var SS_ = null;'));
  assert.ok(gs.includes('function ss_()'));
  assert.ok(gs.includes('var ss = ss_();'));
  const calls = (gs.match(/getSpreadsheet_\(\)/g) || []).length;
  assert.strictEqual(calls, 2, 'getSpreadsheet_ chi duoc goi trong ss_ (dn + 1 call), hien: ' + calls);
});

test('perf: list paths doc tail Photos/Log + fallback full khi thieu coverage', () => {
  const gs = fs.readFileSync('Code.gs', 'utf8');
  assert.ok(gs.includes('var TAIL_ROWS = 3000;'));
  assert.ok(gs.includes('function readPhotosTail_(maxRows)'));
  assert.ok(gs.includes('function readLogTail_(maxRows)'));
  assert.ok(gs.includes('sh.getRange(last - n + 1, 1, n,'));
  assert.ok(gs.includes('function photosForCodes_(want)'));
  assert.ok(gs.includes('function logsForCodes_(want)'));
  assert.ok(gs.includes('var grp = logsForCodes_(want);'));
  assert.ok(gs.includes('var grouped = photosForCodes_(want);'));
});

test('perf: coverage fail-safe — thieu 1 ma la fallback, du la dung tail', () => {
  assert.deepStrictEqual(coverageOk({ A: 1, B: 1 }, { A: 1, B: 1 }), { A: 1, B: 1 });
  assert.strictEqual(coverageOk({ A: 1, B: 1 }, { A: 1 }), null);
  assert.deepStrictEqual(coverageOk({}, {}), {});
});

test('perf: liquidateBatch ghi dich danh + batch log, khong rewrite full', () => {
  const gs = fs.readFileSync('Code.gs', 'utf8');
  const i = gs.indexOf('function liquidateBatch(');
  const block = gs.slice(i, gs.indexOf('function fixPhotoSharing'));
  assert.ok(block.includes('getRange(pi + 2, 7, 1, 3)'));
  assert.ok(!block.includes('getRange(2, 1, vals.length'), 'khong rewrite toan sheet');
  assert.ok(block.includes('logSh.getRange(logSh.getLastRow() + 1, 1, logRows.length'));
  assert.ok(!block.includes('appendRow'), 'log phai batch 1 setValues');
});

test('perf: tim 1 don bang cot A + doc 1 dong (getItem/resolve/edit/adminEdit/preview)', () => {
  const gs = fs.readFileSync('Code.gs', 'utf8');
  assert.ok(gs.includes('function findItemRow_(code)'));
  assert.ok(gs.includes('function readItemCodes_()'));
  for (const fn of ['function getItem(', 'function resolveItem(', 'function editItem(', 'function adminEditItem(']) {
    const b = gs.slice(gs.indexOf(fn), gs.indexOf(fn) + 1200);
    assert.ok(b.includes('findItemRow_(code)'), fn + ' phai dung findItemRow_');
  }
  const fullReads = (gs.match(/readAllItems_\(\)/g) || []).length;
  assert.ok(fullReads <= 3, 'readAllItems_ full chi con dinh nghia + liquidateBatch, hien: ' + fullReads);
});

test('perf: log edit gom batch, photoIds_ doc hep cot', () => {
  const gs = fs.readFileSync('Code.gs', 'utf8');
  assert.ok(gs.includes('noteRows.length, LOG_HEADER.length'));
  assert.ok(gs.includes('newLogs.length, LOG_HEADER.length'));
  assert.ok(gs.includes('newPh.length, PHOTOS_HEADER.length'));
  const p = gs.slice(gs.indexOf('function photoIds_()'), gs.indexOf('function getPhoto('));
  assert.ok(p.includes('getRange(2, 3,'), 'Photos chi doc cot C');
  assert.ok(p.includes('getRange(2, 5,'), 'Items chi doc cot E:F');
});

test('perf: monthFolder_ cache theo thang + fallback', () => {
  const gs = fs.readFileSync('Code.gs', 'utf8');
  const b = gs.slice(gs.indexOf('function monthFolder_()'), gs.indexOf('function withLock_('));
  assert.ok(b.includes('getScriptCache()'));
  assert.ok(b.includes("'folder_' + name"));
  assert.ok(b.includes('getFoldersByName(name)'), 'giu fallback tra Drive');
});
