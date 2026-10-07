const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Contract: detail mo tuc thi tu list cache; Item khong co ngoai quan; poll 5' silent.
function shouldShowOuter(kind, imgOuter) {
  return kind === 'Box' || !!imgOuter;
}

test('instant-detail: Item khong hien ngoai quan, Box hien, Item legacy co anh thi hien', () => {
  assert.strictEqual(shouldShowOuter('Item', ''), false);
  assert.strictEqual(shouldShowOuter('Box', ''), true);
  assert.strictEqual(shouldShowOuter('Item', 'https://x'), true);
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes("if(it.kind==='Box'||it.imgOuter)arr.push(['Ngoại quan'"));
  assert.ok(html.includes('function detailPhotos_(it){'));
});

test('instant-detail: miss detailCache nhung list co san -> ve ngay roi moi fetch', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const i = html.indexOf('Đang tải chi tiết…');
  assert.ok(i > 0);
  const win = html.slice(Math.max(0, i - 500), i);
  assert.ok(win.includes('paintDetail(code'));
  assert.ok(html.includes('findCached(code)||state.items.filter'));
});

test('instant-detail: log Tao moi gon, khong suffix share', () => {
  const gs = fs.readFileSync('Code.gs', 'utf8');
  assert.ok(gs.includes(`appendRow(["'" + at, code, '', 'chua_xu_ly', by, 'Tạo mới'])`));
  assert.ok(gs.includes('shareOk'));
});

test('instant-detail: poll 5 phut silent + bo qua khi tab an', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes('setInterval(function(){if(!document.hidden)loadGrid({silent:true});},300000)'));
});
