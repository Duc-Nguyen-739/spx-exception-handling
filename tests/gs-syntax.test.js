/**
 * tests/gs-syntax.test.js — parse TẤT CẢ file .gs (GAS server) bằng new Function.
 *
 * Regression 19/08/2026 (spx-diem-danh): lỗi syntax lọt qua `npm test` (không test
 * nào load nguyên file .gs) nhưng GAS reject clasp push → CI deploy FAIL. GAS server
 * không chạy được trên Node (phụ thuộc SpreadsheetApp/LockService) → parse syntax
 * bằng new Function(src) là đủ bắt lỗi này.
 *
 * Quét động *.gs ở root — file .gs mới tự được guard, không cần đăng ký.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const GS_FILES = fs.readdirSync(ROOT).filter((f) => f.endsWith('.gs')).sort();

test('gs-syntax: có ít nhất Code.gs để guard', () => {
  assert.ok(GS_FILES.includes('Code.gs'), 'phải có Code.gs ở root');
});

test('gs-syntax: mọi file .gs parse không lỗi syntax (sai là GAS reject clasp push)', () => {
  GS_FILES.forEach((f) => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.doesNotThrow(() => new Function(src), `${f} có lỗi syntax — GAS sẽ reject clasp push`);
  });
});
