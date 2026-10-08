const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Contract anh nhanh/it loi: direct thumbnail truoc -> getThumb (nho) ->
// getPhoto (full, cho lightbox) -> chu. Grid giu w400 (retina), khong ha.
function chain(attempt, directOk, thumbOk, fullOk) {
  if (attempt === 0) return directOk ? 'shown-direct' : 'retry-or-thumb';
  if (attempt === 1) return thumbOk ? 'shown-thumb' : 'try-full';
  return fullOk ? 'shown-full' : 'showNo';
}

test('photo-perf: Code.gs co getThumb (UrlFetch + OAuth, clamp size, folder check)', () => {
  const gs = fs.readFileSync('Code.gs', 'utf8');
  assert.strictEqual((gs.match(/function getThumb\(/g) || []).length, 1);
  const b = gs.slice(gs.indexOf('function getThumb('), gs.indexOf('function parseCreated_('));
  assert.ok(b.includes('UrlFetchApp.fetch'));
  assert.ok(b.includes('ScriptApp.getOAuthToken()'));
  assert.ok(b.includes('inPhotoFolder_(fileId)'), 'kiem folder O(1) thay photoIds_ full-scan');
  assert.ok(!b.includes('photoIds_()'), 'khong quet full sheet o duong anh');
  assert.ok(b.includes('&sz=w'));
  assert.ok(b.includes('2 * 1024 * 1024'), 'chan blob thumb qua lon');
});

test('photo-perf: client thu dung thu tu direct -> getThumb -> getPhoto', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes("gs('getThumb',[id,800])"));
  const i = html.indexOf('function photoFallback(');
  const block = html.slice(i, html.indexOf('}', html.indexOf('else{done();}')) + 1);
  const ti = block.indexOf('serverThumb(id)');
  const fi = block.indexOf('serverPhoto(id)');
  assert.ok(ti > 0 && fi > ti, 'getThumb truoc getPhoto');
  assert.ok(!block.includes('dataset.rt'), 'B4: bo retry 400ms vo ich');
  assert.ok(!block.includes('setTimeout(function(){im.src=src;}'), 'khong thu lai cung URL vua fail');
  assert.ok(html.includes('IMG_A_DEAD'), 'co circuit breaker theo phien');
});

test('photo-perf: mirror chuoi fallback (n lan loi -> bac tiep theo)', () => {
  assert.strictEqual(chain(0, true), 'shown-direct');
  assert.strictEqual(chain(0, false), 'retry-or-thumb');
  assert.strictEqual(chain(1, false, true), 'shown-thumb');
  assert.strictEqual(chain(1, false, false), 'try-full');
  assert.strictEqual(chain(2, false, false, true), 'shown-full');
  assert.strictEqual(chain(2, false, false, false), 'showNo');
});

test('photo-perf: grid giu w400 + lightbox nang full ngam', () => {
  const gs = fs.readFileSync('Code.gs', 'utf8');
  assert.ok(gs.includes('&sz=w400'), 'giu fast path w400 cho retina');
  assert.ok(!gs.includes('sz=w200'), 'khong ha chat luong grid');
  const html = fs.readFileSync('index.html', 'utf8');
  const i = html.indexOf('function openLightbox(src,cap){');
  const block = html.slice(i, i + 900);
  assert.ok(block.includes('lb.classList.add(\'open\')'));
  assert.ok(block.indexOf('serverPhoto(fid)') > block.indexOf('lb.classList.add(\'open\')'),
    'mo ngay bang src cu, nang full sau');
});

test('photo-perf: Code.gs co getThumbs batch (1 call nhieu anh, cap 24, loi 1 anh khong fail lo)', () => {
  const gs = fs.readFileSync('Code.gs', 'utf8');
  assert.strictEqual((gs.match(/function getThumbs\(/g) || []).length, 1);
  const b = gs.slice(gs.indexOf('function getThumbs('), gs.indexOf('function parseCreated_('));
  assert.ok(b.includes('slice(0, 24)'), 'cap 24 id/call giu payload duoi gioi han');
  assert.ok(b.includes('inPhotoFolder_(fid)'), 'kiem folder O(1) tung anh, khong full-scan');
  assert.ok(b.includes('ScriptApp.getOAuthToken()'));
  assert.ok(b.includes('out[fid] = { error:'), 'loi 1 anh khong fail ca lo');
  assert.ok(b.includes('return ok({ size: sz, items: out })'));
});

test('photo-perf: mo chi tiet am bounded + cache 2 lop (hien ngay lan 2)', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes('function serverThumbsBatch(ids){'), 'batch on-demand van giu');
  assert.ok(html.includes("gs('getThumbs',[ch,400])"), 'batch dung thumb nho w400');
  const wi = html.indexOf('function warmDetailImages(code){');
  assert.ok(wi > 0);
  assert.ok(html.slice(wi, wi + 700).includes('ids.slice(0,3)'), 'warm chi tiet toi da 3 id, khong dot GAS');
  const pi = html.indexOf('function prefetchHeadThumbs(){');
  assert.ok(!html.slice(pi, pi + 700).includes('warmPhotoCache'), 'prefetch khong goi batch');
  assert.ok(html.includes('function hydrateFromIdb(code){'), 'hydrate local truoc khi warm mang');
  assert.ok(html.includes('try{primeImages_(it.code);}catch(e){}'), 'paint nao cung prime anh');
  assert.ok(html.includes('function idbGet(id){') && html.includes('function idbPut(id,blob,mime){'), 'IDB blob song qua reload');
  assert.ok(html.includes('IDB_MAX=600'), 'cap 600 muc cho 150 don x 1-3 anh');
  assert.ok(html.includes('URL.revokeObjectURL(ou)'), 'evict blob thi revoke, khong leak');
  assert.ok(html.includes('function cachedSrc(url){'), 'render uu tien ban da cache');
  assert.ok(html.includes('var src=cachedSrc(thumb(it));'), 'grid dung anh cache');
  assert.ok(html.includes('cachedSrc(p[1])'), 'chi tiet dung anh cache');
  assert.ok(html.includes('<link rel="preconnect" href="https://drive.google.com">'), 'preconnect host anh');
});

// Mirror LRU that (KHOP index.html putPhotoCache): toi da 200, evict cu nhat.
function makeLRU(limit) {
  const cache = {}, order = [];
  return {
    cache, order,
    put(k, u) {
      if (!k || !u || cache[k]) return;
      if (order.length >= limit) { const old = order.shift(); delete cache[old]; }
      order.push(k); cache[k] = u;
    },
  };
}

test('photo-perf: LRU evict — vuot thi xoa cu nhat, khong crash', () => {
  const lru = makeLRU(200);
  for (let i = 0; i < 201; i++) lru.put('t' + i, 'data:x');
  assert.strictEqual(Object.keys(lru.cache).length, 200);
  assert.ok(!('t0' in lru.cache), 'evict cu nhat');
  assert.ok('t200' in lru.cache);
  lru.put('t200', 'data:y');
  assert.strictEqual(lru.cache.t200, 'data:x', 'khong ghi de da cache');
});
