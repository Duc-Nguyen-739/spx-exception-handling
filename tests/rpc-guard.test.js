'use strict';
// Guard RPC: mọi hàm UI gọi qua gs('fn') phải tồn tại công khai ở Code.gs và có
// trong mock (test:chrome). Google chỉ expose hàm top-level không hậu tố `_`.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const gs = fs.readFileSync(path.join(ROOT, 'Code.gs'), 'utf8');
const mock = fs.readFileSync(path.join(ROOT, 'mock', 'mock-google.js'), 'utf8');

// 2 hàm ADMIN chẩn đoán chủ đích KHÔNG mock (test:chrome không đi vào nhánh này).
const NO_MOCK_OK = new Set(['auditPhotosOutsideFolder', 'diagIdentity']);

// Đoạn source arg #1 của gs(...): tới ','/')' đầu tiên (quote-aware).
function firstArg(src, start) {
  let i = start, out = '', quote = null;
  while (i < src.length) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') { out += ch + (src[i + 1] || ''); i += 2; continue; }
      if (ch === quote) quote = null;
      out += ch; i++; continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; out += ch; i++; continue; }
    if (ch === ',' || ch === ')') break;
    out += ch; i++;
  }
  return out;
}

// Tên RPC UI gọi: literal gs('x') + nhánh ternary động gs(isBox?'createBox':'createItem').
function rpcNames(src) {
  const out = new Set();
  const re = /\bgs\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const pre = src.slice(0, m.index).trimEnd();
    if (/function$/.test(pre)) continue; // bỏ định nghĩa `function gs(`
    const arg = firstArg(src, m.index + m[0].length);
    for (const lit of arg.match(/'([A-Za-z_][A-Za-z0-9_]*)'/g) || []) out.add(lit.slice(1, -1));
  }
  return out;
}

// Key của block API trong mock (`var API = {` … `  };`).
function mockApiKeys(src) {
  const start = src.indexOf('var API = {');
  assert.ok(start >= 0, 'mock: không thấy "var API = {"');
  const end = src.indexOf('\n  };', start);
  assert.ok(end > start, 'mock: không thấy cuối block API');
  const keys = new Set();
  const re = /^ {4}([A-Za-z_][A-Za-z0-9_]*): function/gm;
  let m;
  while ((m = re.exec(src.slice(start, end))) !== null) keys.add(m[1]);
  assert.ok(keys.size >= 20, 'trích mock API keys hỏng: ' + keys.size);
  return keys;
}

const names = [...rpcNames(html)].sort();
const keys = mockApiKeys(mock);
const isPublicFn = (n) => new RegExp('^function ' + n + '\\(', 'm').test(gs);

test('rpc-guard: scanner thấy đủ tên, gồm cả nhánh ternary động', () => {
  assert.ok(names.length >= 32, 'chỉ thấy ' + names.length + ' tên RPC trong index.html');
  assert.ok(names.includes('createBox') && names.includes('createItem'), 'thiếu tên gọi động');
});

test('rpc-guard: mỗi tên UI gọi là hàm công khai trong Code.gs', () => {
  const missing = names.filter((n) => !isPublicFn(n));
  assert.deepStrictEqual(missing, [], 'thiếu trong Code.gs: ' + missing.join(', '));
  const priv = names.filter((n) => n.endsWith('_'));
  assert.deepStrictEqual(priv, [], 'tên private (hậu tố _) không gọi được từ client: ' + priv.join(', '));
});

test('rpc-guard: mỗi tên UI gọi có mock (trừ allowlist ADMIN)', () => {
  const missing = names.filter((n) => !keys.has(n) && !NO_MOCK_OK.has(n));
  assert.deepStrictEqual(missing, [], 'thiếu trong mock/mock-google.js: ' + missing.join(', '));
});

test('rpc-guard: mỗi mock key có hàm tương ứng trong Code.gs', () => {
  const stale = [...keys].filter((n) => !isPublicFn(n));
  assert.deepStrictEqual(stale, [], 'mock mồ côi (không có trong Code.gs): ' + stale.join(', '));
});

test('rpc-guard: allowlist không hết hạn', () => {
  for (const n of NO_MOCK_OK) {
    assert.ok(isPublicFn(n), n + ' không còn trong Code.gs — bỏ khỏi allowlist');
    assert.ok(!keys.has(n), n + ' đã có mock — bỏ khỏi allowlist');
  }
});
