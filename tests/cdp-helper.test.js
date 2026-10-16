/**
 * tests/cdp-helper.test.js — guard scripts/cdp-helper.js + chrome-path.js (SSOT).
 * Bug gốc 18/08/2026 (spx-diem-danh): lệnh 'select' đọc nhầm args[0] (tên lệnh)
 * nên không bao giờ khớp tab + thiếu return; connect/send không timeout nên WS
 * đóng giữa chừng làm treo vô hạn.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'cdp-helper.js'), 'utf8');

test('cdp-helper select: đọc prefix từ args[1] + có return', () => {
  const block = src.slice(src.indexOf("cmd === 'select'"), src.indexOf("cmd === 'list'"));
  assert.ok(block.indexOf('const prefix = args[1];') >= 0,
    'prefix phải lấy từ args[1] — args[0] là tên lệnh "select" (bug: args[0] không bao giờ khớp tab)');
  assert.ok(block.indexOf('return;') >= 0,
    'sau khi chọn tab phải return — nếu không rơi xuống "Lệnh không biết: select"');
});

test('cdp-helper: connect/send không treo vĩnh viễn (timeout + onclose) — bug 2026-08-18', () => {
  assert.match(src, /WS_CONNECT_TIMEOUT_MS/, 'phải có hằng số timeout connect');
  assert.match(src, /WS_SEND_TIMEOUT_MS/, 'phải có hằng số timeout send');
  // connect(): onclose phải reject mọi promise đang chờ (tab đóng giữa chừng).
  const connectBlock = src.slice(src.indexOf('function connect('), src.indexOf('function send('));
  assert.ok(connectBlock.indexOf('ws.onclose') >= 0,
    'connect() phải set onclose — nếu WS đóng, promise connect/pending không bao giờ resolve → treo');
  // send(): timeout reject + clear khỏi pending.
  const sendBlock = src.slice(src.indexOf('function send('), src.indexOf('function setupListener('));
  assert.ok(sendBlock.indexOf('setTimeout') >= 0 && sendBlock.indexOf('pending.delete(id)') >= 0,
    'send() phải có timeout reject và xóa khỏi pending');
});

test('cdp-helper + test-local-mock dùng chung scripts/chrome-path.js (SSOT findChrome — luật 10)', () => {
  assert.match(src, /require\('\.\/chrome-path\.js'\)/, 'cdp-helper phải require chrome-path.js');
  assert.ok(src.indexOf('function findChrome') < 0, 'cdp-helper không được khai báo bản findChrome thứ 2');
  const tlm = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'test-local-mock.js'), 'utf8');
  assert.match(tlm, /require\('\.\/chrome-path\.js'\)/, 'test-local-mock phải require chrome-path.js');
  assert.ok(tlm.indexOf('function findChrome') < 0, 'test-local-mock không được khai báo bản findChrome thứ 2');
  const { findChrome } = require('../scripts/chrome-path.js');
  const hit = findChrome();
  assert.ok(hit && typeof hit.exe === 'string' && hit.exe.length > 0 && typeof hit.shell === 'boolean',
    'findChrome() phải trả { exe, shell }');
});
