const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Contract B4: tang 2 (direct drive) chet han thi dung lang phi.
// Dem loi theo phien (>=3 anh direct hong -> IMG_A_DEAD), prefetch
// chuyen sang batch 1 exec thay vi warm 24 URL chet. Reset khi reload.

const HTML = fs.readFileSync('index.html', 'utf8');

test('breaker: co bien dem + nguong theo phien', () => {
  assert.ok(HTML.includes('var IMG_A_FAILS=0,IMG_A_DEAD=false;'), 'khai bao truoc photoFallback');
  const f = HTML.indexOf('function fallbackToServer_(im,src,showNo,id){');
  assert.ok(f > 0);
  const b = HTML.slice(f, f + 400);
  assert.ok(b.includes('IMG_A_FAILS>=3'), 'nguong chet phien');
  assert.ok(b.includes('IMG_A_DEAD=true'), 'danh dau chet');
  assert.ok(b.includes('IMG_A_FAILS<99'), 'chan dem tran');
});

test('breaker: prefetch ton trong, chet thi di batch', () => {
  const p = HTML.indexOf('function prefetchHeadThumbs(){');
  assert.ok(p > 0);
  const b = HTML.slice(p, p + 900);
  assert.ok(b.includes('if(IMG_A_DEAD)'), 'nhanh chet rieng');
  assert.ok(b.includes('serverThumbsBatch(ids)'), 'chet thi gom batch 1 exec');
  assert.ok(b.includes("photoCache['t'+pid]"), 'batch bo qua da cache');
});

test('breaker: khong con retry 400ms', () => {
  assert.ok(!HTML.includes('setTimeout(function(){im.src=src;},400)'), 'xoa thu lai cung URL');
  assert.ok(!HTML.includes('dataset.rt'), 'xoa co retry');
});

test('breaker: chet thi prefetch di batch thay vi warm direct', () => {
  const vm = require('node:vm');
  const i = HTML.indexOf('function prefetchHeadThumbs(){');
  let depth = 0, end = i;
  for (let j = i; j < HTML.length; j++) {
    if (HTML[j] === '{') depth++;
    if (HTML[j] === '}') { depth--; if (!depth) { end = j + 1; break; } }
  }
  const batched = [];
  const sandbox = {
    IMG_A_DEAD: true, IMG_A_FAILS: 3, photoCache: {},
    document: { hidden: false }, preWarmed: {},
    visibleItems: () => [{ imgProduct: 'https://drive.google.com/thumbnail?id=ID1111111111&sz=w400' }],
    thumb: (it) => it.imgProduct || '',
    extractDriveId: (u) => ((String(u || '').match(/[?&]id=([A-Za-z0-9_-]{10,})/) || [])[1] || ''),
    serverThumbsBatch: (ids) => { batched.push(ids); return Promise.resolve([]); },
    setTimeout,
  };
  vm.createContext(sandbox);
  vm.runInContext(HTML.slice(i, end), sandbox);
  vm.runInContext('prefetchHeadThumbs()', sandbox);
  assert.strictEqual(JSON.stringify(batched), JSON.stringify([['ID1111111111']]), 'gom id goi batch 1 exec');
});
