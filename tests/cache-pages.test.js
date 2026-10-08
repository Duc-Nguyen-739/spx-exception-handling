const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

// Contract cache-first: phan trang offset, merge tich luy, poll 5', prefetch anh.
// Mirror logic thuan (khong network).
const PAGE = 150;
function pageWindow(total, page, limit) {
  const off = (Math.max(1, page) - 1) * limit;
  if (off >= total) return [];
  return { off, n: Math.min(total - off, limit) };
}
function mergeInto(map, list) {
  for (const it of list || []) {
    if (!it || !it.code) continue;
    map[it.code] = Object.assign(map[it.code] || {}, it);
  }
  return map;
}

test('pages: cua so offset dung (trang 1 head, trang 2 tiep, het -> rong)', () => {
  assert.deepStrictEqual(pageWindow(400, 1, PAGE), { off: 0, n: 150 });
  assert.deepStrictEqual(pageWindow(400, 2, PAGE), { off: 150, n: 150 });
  assert.deepStrictEqual(pageWindow(400, 3, PAGE), { off: 300, n: 100 });
  assert.deepStrictEqual(pageWindow(400, 4, PAGE), []);
});

test('pages: merge tich luy — trang sau khong xoa trang truoc, trung thi update', () => {
  const cache = {};
  mergeInto(cache, [{ code: 'A', status: 'chua_xu_ly' }]);
  mergeInto(cache, [{ code: 'B', status: 'chua_xu_ly' }, { code: 'A', status: 'da_tim_bill' }]);
  assert.deepStrictEqual(Object.keys(cache).sort(), ['A', 'B']);
  assert.strictEqual(cache.A.status, 'da_tim_bill');
});

test('pages: server ho tro offset (readHeadItems_ window + listFull/listItems)', () => {
  const gs = fs.readFileSync('Code.gs', 'utf8');
  assert.ok(gs.includes('function readHeadItems_(maxRows, offset)'));
  assert.ok(gs.includes('sh.getRange(2 + off, 1, n, ITEMS_HEADER.length)'));
  assert.ok(gs.includes('function listFull(limit, offset)'));
  assert.ok(gs.includes('function listItems(limit, offset)'));
  assert.ok(gs.includes('readHeadItems_(n, offset)'));
});

test('pages: sentinel + observer chi goi khi cuon toi (khong goi thua)', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes('id="gridMore"'));
  assert.ok(html.includes('new IntersectionObserver'));
  assert.ok(html.includes('es[0].isIntersecting&&!state.noMore&&!state._loadingGrid'));
  assert.ok(html.includes('loadGrid({more:true,silent:true})'));
  assert.ok(html.includes('if(full.length<PAGE)state.noMore=true'));
});

test('pages: poll 5 phut silent + refresh/reset tu trang 1', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes('loadGrid({silent:true,reset:true});},300000)'));
  assert.ok(!html.includes(',180000)'), 'khong con poll 3 phut');
  assert.ok(html.includes('if(opts.reset){state.page=1;state.noMore=false;}'));
  assert.ok(html.includes('loadGrid({reset:true})'));
});

test('pages: prefetch anh nhe sau render (0 GAS call, co dedup)', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const i = html.indexOf('function prefetchHeadThumbs(){');
  assert.ok(i > 0);
  const block = html.slice(i, i + 600);
  assert.ok(block.includes('slice(0,24)'), 'gioi han 24 don dau');
  assert.ok(!block.includes('warmPhotoCache'), 'KHONG ban GAS batch nang luc load trang');
  assert.ok(!block.includes('getThumbs'), 'KHONG goi server khi prefetch');
  assert.ok(block.includes('cachedSrc'));
  assert.ok(block.includes('preWarmed'));
  assert.ok(block.includes('new Image()'));
  assert.ok(html.includes('setTimeout(prefetchHeadThumbs,600)'));
});

// Prefetch THAT trong sandbox co timers: nap thumb that tu index.html,
// stub nhe (cachedSrc identity, visibleItems/document/Image).
function makePrefetchEnv(items, hidden) {
  const html = fs.readFileSync('index.html', 'utf8');
  const thumbSrc = html.match(/function thumb\(it\)\{[^}]*\}/)[0];
  const start = html.indexOf('function prefetchHeadThumbs(){');
  let depth = 0, end = start;
  for (let i = start; i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}') { depth--; if (!depth) { end = i + 1; break; } }
  }
  const preSrc = html.slice(start, end);
  const loaded = [];
  function FakeImage() {}
  Object.defineProperty(FakeImage.prototype, 'src', { set(u) { loaded.push(u); } });
  const sandbox = {
    setTimeout, clearTimeout, Image: FakeImage,
    IMG_A_DEAD: false, IMG_A_FAILS: 0,
    document: { hidden: !!hidden },
    preWarmed: {},
    visibleItems: () => items.slice(),
    cachedSrc: (u) => u,
  };
  vm.createContext(sandbox);
  vm.runInContext(thumbSrc + '\n' + preSrc, sandbox, { filename: 'prefetch-inline.js' });
  return { sandbox, loaded };
}
function fakeItems(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ code: 'Box.08-10-2026.' + i, imgProduct: 'https://x/img' + i });
  return out;
}

test('pages: prefetch that chi nap 24 don dau (sandbox co timers)', async () => {
  const { sandbox, loaded } = makePrefetchEnv(fakeItems(35), false);
  vm.runInContext('prefetchHeadThumbs()', sandbox);
  assert.strictEqual(loaded.length, 24);
  assert.strictEqual(loaded[0], 'https://x/img0');
  assert.strictEqual(loaded[23], 'https://x/img23');
});

test('pages: prefetch that dedup — chay lai khong nap them', async () => {
  const { sandbox, loaded } = makePrefetchEnv(fakeItems(35), false);
  vm.runInContext('prefetchHeadThumbs()', sandbox);
  vm.runInContext('prefetchHeadThumbs()', sandbox);
  assert.strictEqual(loaded.length, 24);
});

test('pages: prefetch chi lay 1 thumb luoi/don (anh chi tiet chi am khi mo)', async () => {
  const items = [{ code: 'Box.08-10-2026.1', imgOuter: 'https://x/o', imgProduct: 'https://x/p', extras: ['https://x/e1'] }];
  const { sandbox, loaded } = makePrefetchEnv(items, false);
  vm.runInContext('prefetchHeadThumbs()', sandbox);
  assert.deepStrictEqual(loaded, ['https://x/p']);
});

test('pages: prefetch that bo qua khi tab an', async () => {
  const { loaded } = makePrefetchEnv(fakeItems(35), true);
  assert.strictEqual(loaded.length, 0);
});

test('pages: deferred prefetch chay duoc qua setTimeout trong sandbox', async () => {
  const { sandbox, loaded } = makePrefetchEnv(fakeItems(5), false);
  vm.runInContext('setTimeout(prefetchHeadThumbs,10)', sandbox);
  await new Promise((r) => setTimeout(r, 60));
  assert.strictEqual(loaded.length, 5);
});
