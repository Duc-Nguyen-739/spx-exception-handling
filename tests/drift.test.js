/**
 * tests/drift.test.js — gate chống drift dual runtime (GAS ↔ Python ↔ import-csv).
 * Chạy đúng logic của scripts/check-drift.js (checkDrift()) — drift → test fail.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { checkDrift } = require('../scripts/check-drift.js');

test('drift: Code.gs ↔ api/logic.py không lệch (hàm CORE + STATUS_LABEL)', () => {
  const res = checkDrift();
  const d = res.drifts.filter((x) => x.startsWith('Code.gs') || x.startsWith('api/logic.py') || x.startsWith('STATUS_LABEL'));
  assert.deepEqual(d, [], 'drift: ' + d.join(' | '));
});

test('drift: STATUS_RULES đồng bộ 3 bản (Code.gs ↔ api/logic.py ↔ scripts/import-csv.js)', () => {
  const res = checkDrift();
  const d = res.drifts.filter((x) => x.startsWith('STATUS_RULES'));
  assert.deepEqual(d, [], 'drift: ' + d.join(' | '));
});

test('drift: sanity — mirror thật tồn tại (xoá 1 bên thì 2 test trên fail)', () => {
  const gs = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  const py = fs.readFileSync(path.join(__dirname, '..', 'api', 'logic.py'), 'utf8');
  assert.ok(gs.includes('function parseCreatedSmart_'), 'parseCreatedSmart_ phải tồn tại ở Code.gs');
  assert.ok(py.includes('def parse_created_smart'), 'parse_created_smart phải tồn tại ở api/logic.py');
});
