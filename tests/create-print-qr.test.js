const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Contract: dang +Create an nut In Ma (Box + Item); Confirm xong moi hien;
// o QR (createResult/createQR/showCreateQR) bi xoa hoan toan.
test('create-print-qr: nut In Ma an luc dau (Box + Item)', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes('<button id="btnBoxPrint" style="display:none">'));
  assert.ok(html.includes('<button id="btnItemPrint" style="display:none">'));
});

test('create-print-qr: setCreateDoneUI dieu khien an/hien nut In Ma', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const i = html.indexOf('function setCreateDoneUI(done)');
  assert.ok(i >= 0);
  const win = html.slice(i, i + 700);
  assert.ok(win.includes("getElementById('btnBoxPrint')"));
  assert.ok(win.includes("getElementById('btnItemPrint')"));
  assert.ok(win.includes("style.display=done?'':'none'"));
});

test('create-print-qr: khong con o QR trong index.html', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(!html.includes('createResult'));
  assert.ok(!html.includes('createQR'));
  assert.ok(!html.includes('showCreateQR'));
});

test('create-print-qr: lib QR giu lai cho in tem 4x6', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes('qrcode.min.js'));
  assert.ok(html.includes('function doPrintMany'));
});
