const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Khoa layout tem 4x2 can doi: 1 layout duy nhat, in duoc ca giay 4x2 va 4x6.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('print-42: @page dung kho tem 4x2', () => {
  assert.ok(html.includes('@page{size:4in 2in;margin:0}'), 'thieu @page 4x2');
  assert.ok(!html.includes('@page{size:4in 6in'), 'khong con @page 4x6');
});

test('print-42: tem 4x2 can doi, khong sat mep', () => {
  assert.ok(html.includes('#printArea .plabel{width:4in;height:2in'), 'tem phai 4x2');
  assert.ok(html.includes('padding:4mm'), 'padding can doi 4mm');
  assert.ok(html.includes('box-sizing:border-box'), 'box-sizing giu dung 2in');
});

test('print-42: QR 1.35in + chu 30px gon 1 dong', () => {
  assert.ok(html.includes('width:1.35in!important;height:1.35in!important'), 'QR phai 1.35in');
  assert.ok(!html.includes('width:2.8in!important'), 'khong con QR 2.8in');
  assert.ok(html.includes('#printArea .pcode{font-size:30px'), 'chu phai 30px');
  assert.ok(html.includes('white-space:nowrap'), 'ma 1 dong khong wrap');
});

test('print-42: bulk giu page-break moi tem', () => {
  assert.ok(html.includes('page-break-after:always'), 'bulk moi tem 1 trang');
  assert.ok(html.includes('#printArea .plabel:last-child{page-break-after:auto}'), 'tem cuoi khong trang thua');
});

test('print-42: QR render nhe cho 203dpi', () => {
  assert.ok(html.includes('new QRCode(q,{text:code,width:220,height:220})'), 'render 220px');
  assert.ok(!html.includes('width:320,height:320'), 'khong con render 320px');
});
