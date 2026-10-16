const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// KHỚP client index.html: pager mobile 50 don/trang + cuon an/hien muot (mockup v15 duyet).
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const MOB_PAGE = 50;
function pageSlice(list, page) {
  const pages = Math.max(1, Math.ceil(list.length / MOB_PAGE));
  const p = Math.min(Math.max(1, page), pages);
  return { page: p, pages, items: list.slice((p - 1) * MOB_PAGE, p * MOB_PAGE) };
}
function pgLabel(p) { return 'Trang ' + p + ' · 50 đơn'; }

test('mob-pager: cat lat 50 don/trang', () => {
  const list = Array.from({ length: 120 }, (_, i) => i);
  assert.strictEqual(pageSlice(list, 1).items.length, 50);
  assert.strictEqual(pageSlice(list, 3).items.length, 20);
  assert.strictEqual(pageSlice(list, 3).pages, 3);
  assert.strictEqual(pageSlice(list, 9).page, 3);
  assert.deepStrictEqual(pageSlice([], 1), { page: 1, pages: 1, items: [] });
});

test('mob-pager: nhan dung mau Trang X · 50 don', () => {
  assert.strictEqual(pgLabel(1), 'Trang 1 · 50 đơn');
  assert.ok(html.includes('id="pgSize"'), 'thieu nhan tong don/trang');
  assert.ok(html.includes("document.getElementById('pgSize').textContent=MOB_PAGE"), 'pager phai render tong don theo MOB_PAGE');
});

test('mob-pager: DOM + CSS mobile', () => {
  assert.ok(html.includes('id="navCreate"'), 'thieu nut Tao moi giua nav');
  assert.ok(html.includes('id="gridPager"'), 'thieu thanh phan trang');
  assert.ok(html.includes('var MOB_PAGE=50'), 'thieu MOB_PAGE=50');
  assert.ok(html.includes('#btnCreateMain{display:none!important}'), 'mobile phai an +Create canh In Ma');
  assert.ok(html.includes('#rangebar .rg-l1{flex:none}'), 'Display Range mobile phai 1 hang');
  assert.ok(html.includes("document.getElementById('navCreate').onclick=document.getElementById('btnCreateTop').onclick"), 'navCreate phai mo form Create');
  assert.ok(html.includes('id="fabCreate"'), 'thieu FAB Tao moi goc phai');
  assert.ok(html.includes('#navCreate{display:none!important}'), 'mobile phai an nut Tao moi giua nav');
  assert.ok(html.includes("document.getElementById('fabCreate').onclick=document.getElementById('btnCreateTop').onclick"), 'FAB phai mo form Create');
  assert.ok(html.includes('pgList.forEach'), 'renderGrid phai render theo lat trang');
  assert.ok(html.includes('id="mHide"'), 'thieu wrapper thu gon header');
  assert.ok(html.includes('body.hidebars #mHide'), 'mobile cuon xuong phai an search/range/pills');
  assert.ok(html.includes('grid-template-rows'), 'thu gon phai dung grid 0fr/1fr cho muot');
  assert.ok(html.includes('requestAnimationFrame(_applyHide_)'), 'scroll phai gom qua rAF');
  assert.ok(html.includes('if(y<0||Date.now()<_hideLock)return;'), 'thieu guard iOS bounce + khoa chong nhap nhay');
  assert.ok(html.includes('.mh-clip{display:block'), 'mobile phai tat display:contents cua lop kep chieu cao');
});
