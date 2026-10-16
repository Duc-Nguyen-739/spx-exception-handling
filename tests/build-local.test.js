/**
 * tests/build-local.test.js — guard scripts/build-local.js (SSOT build cho test:chrome).
 * Gap 2026-10-16: build-local chặn sót directive GAS <?!= ?> nhưng không test
 * nào cover — directive lọt vào index.local.html thì test:chrome chạy trên file
 * lỗi mà npm test vẫn xanh.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { build } = require('../scripts/build-local.js');

test('build-local: build() chặn sót directive GAS <?!= ?>', () => {
  const html = build();
  assert.ok(!/<\?!=/.test(html), 'output không được còn directive GAS <?!= ... ?>');
});

test('build-local: index.local.html là bản copy 1-1 của index.html (LF, không BOM)', () => {
  build();
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const out = fs.readFileSync(path.join(ROOT, 'index.local.html'), 'utf8');
  assert.strictEqual(out, src, 'build single-file = copy nguyên văn');
  const raw = fs.readFileSync(path.join(ROOT, 'index.local.html'));
  assert.ok(raw.slice(0, 3).toString('hex') !== 'efbbbf', 'không BOM (GAS serve có BOM sinh khoảng trống header)');
  assert.strictEqual(raw.indexOf('\r'), -1, 'phải LF, không CRLF');
});
