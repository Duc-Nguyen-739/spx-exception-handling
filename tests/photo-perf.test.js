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

test('photo-perf: Code.gs co getThumb (UrlFetch + OAuth, clamp size, allowlist)', () => {
  const gs = fs.readFileSync('Code.gs', 'utf8');
  assert.strictEqual((gs.match(/function getThumb\(/g) || []).length, 1);
  const b = gs.slice(gs.indexOf('function getThumb('), gs.indexOf('function parseCreated_('));
  assert.ok(b.includes('UrlFetchApp.fetch'));
  assert.ok(b.includes('ScriptApp.getOAuthToken()'));
  assert.ok(b.includes('photoIds_()[fileId]'));
  assert.ok(b.includes('&sz=w'));
  assert.ok(b.includes('2 * 1024 * 1024'), 'chan blob thumb qua lon');
});

test('photo-perf: client thu dung thu tu direct -> getThumb -> getPhoto', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes("gs('getThumb',[id,800])"));
  const i = html.indexOf('function photoFallback(');
  const block = html.slice(i, html.indexOf('}', html.indexOf('else{showNo();}')) + 1);
  const ti = block.indexOf('serverThumb(id)');
  const fi = block.indexOf('serverPhoto(id)');
  assert.ok(ti > 0 && fi > ti, 'getThumb truoc getPhoto');
  assert.ok(block.includes('dataset.rt'), 'retry direct 1 lan transient');
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
  assert.ok(b.includes('photoIds_()'), 'allowlist 1 lan cho ca lo thay vi N lan');
  assert.ok(b.includes('ScriptApp.getOAuthToken()'));
  assert.ok(b.includes('out[fid] = { error:'), 'loi 1 anh khong fail ca lo');
  assert.ok(b.includes('return ok({ size: sz, items: out })'));
});

test('photo-perf: client am batch + render uu tien anh da cache (mo chi tiet hien ngay)', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes('function serverThumbsBatch(ids){'), 'batch chunk 20, dedup photoLoading');
  assert.ok(html.includes("gs('getThumbs',[ch,400])"), 'batch dung thumb nho w400');
  assert.ok(html.includes('function putPhotoCache(k,u){'), 'LRU memory-only');
  assert.ok(html.includes('photoCacheOrder.length>=200'), 'cap 200 data-URL chong OOM mobile');
  assert.ok(html.includes('function cachedSrc(url){'), 'render uu tien data-URL da cache');
  assert.ok(html.includes('var src=cachedSrc(thumb(it));'), 'grid dung anh cache');
  assert.ok(html.includes("src=\"'+esc(cachedSrc(p[1]))+'\""), 'chi tiet dung anh cache');
  assert.ok(html.includes('warmDetailImages(code);'), 'mo chi tiet am ngay anh thieu nen');
  assert.ok(html.includes('function swapCachedImgs(){'), 'doi img sang data-URL tai cho khong render lai');
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

test('photo-perf: LRU 200 — vuot thi xoa cu nhat, khong crash', () => {
  const lru = makeLRU(200);
  for (let i = 0; i < 201; i++) lru.put('t' + i, 'data:x');
  assert.strictEqual(Object.keys(lru.cache).length, 200);
  assert.ok(!('t0' in lru.cache), 'evict cu nhat');
  assert.ok('t200' in lru.cache);
  lru.put('t200', 'data:y');
  assert.strictEqual(lru.cache.t200, 'data:x', 'khong ghi de da cache');
});
