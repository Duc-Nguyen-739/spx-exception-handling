const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Contract: mo lai don da cache thi zero call; freshness do poll 3' listFull lo.
test('detail-ttl: cached hit zero call, khong fetch rieng khi doi don', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const i = html.indexOf('var cached=state.detailCache[code];');
  assert.ok(i > 0);
  const end = html.indexOf('return;', i);
  assert.ok(end > i);
  const block = html.slice(i, end);
  assert.ok(block.includes('state.detail=cached'));
  assert.ok(block.includes("paintDetail(code,'')"));
  assert.ok(!block.includes("gs('getItem'"));
  assert.ok(!block.includes('DETAIL_TTL_MS'));
});

test('detail-ttl: loadGrid preload listFull 150 qua cacheDetail_', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const gs = fs.readFileSync('Code.gs', 'utf8');
  assert.ok(gs.includes('var LIST_LIMIT = 150;'));
  assert.ok(gs.includes('function listFull(limit, offset)'));
  assert.ok(html.includes("gs('listFull',[PAGE,off])"));
  assert.ok(html.includes('detailAt:{},_loadingGrid'));
  assert.ok(html.includes('cacheDetail_(e.item.code,e.item,e.history,e.item.slots)'));
});

// Contract: detailCache.item PHAI la cung object voi itemMap — neu tao object moi
// moi lan poll, applyLocalItem (Resolve/Edit) sua mot ban roi detail ve ban cu.
test('detail-ttl: detailCache.item dung chung object itemMap', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const i = html.indexOf('function cacheDetail_(code,item,history,slots){');
  assert.ok(i > 0);
  const block = html.slice(i, html.indexOf('}', html.indexOf('return state.detailCache[code];')));
  assert.ok(block.includes('upsertItem(item);'));
  assert.ok(block.includes('item:findCached(code)'));
  const j = html.indexOf('function applyLocalItem(code,fn){');
  const aBlock = html.slice(j, html.indexOf('function applyLocalStatus'));
  assert.ok(aBlock.includes('seen.indexOf(o)<0'), 'applyLocalItem phai dedupe bang identity');
  assert.ok(aBlock.includes('var dc=state.detailCache[code];if(dc)once(dc.item);'));
});

// Contract: moi noi ghi detailCache phai di qua cacheDetail_ (khong gan tay).
test('detail-ttl: khong con gan detailCache truc tiep ngoai cacheDetail_', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const writes = html.match(/state\.detailCache\[[^\]]+\]=/g) || [];
  const direct = writes.filter((w) => !w.includes('code]'));
  assert.deepStrictEqual(direct, [], 'gan detailCache truc tiep: ' + direct.join(' '));
  const fnCount = (html.match(/function cacheDetail_\(/g) || []).length;
  assert.strictEqual(fnCount, 1);
});

// Contract (luat 10 SSOT): map cot ActivityLog va doc Photos chi co MOT noi,
// listFull + historyFor_/getItem phai dung chung — tranh 2 ban lech nhau.
test('detail-ttl: server doc log/photos qua helper chung, khong copy logic', () => {
  const gs = fs.readFileSync('Code.gs', 'utf8');
  const lf = gs.slice(gs.indexOf('function listFull(limit, offset)'), gs.indexOf('function photosFor_(code)'));
  assert.ok(!lf.includes('getSheet_('), 'listFull phai dung logsForCodes_/photosByCode_ thay getSheet_');
  assert.ok(lf.includes('logsForCodes_(want)'));
  assert.ok(lf.includes('logEntry_(log.rows[j], log.cols, hc)'));
  assert.ok(lf.includes('photosByCode_(want)'));
  assert.ok(lf.includes('applyPhotos_(t,'));
  // header mapping chi ton tai o logCols_ (candidate da normalize, khong dau/gach)
  assert.strictEqual((gs.match(/fromstatus', 'from'/g) || []).length, 1);
  assert.strictEqual((gs.match(/function logCols_\(/g) || []).length, 1);
  // doc Photos truc tiep chi trong helper (photoIds_/fixPhotoSharing doc ca file la hop le)
  assert.ok(gs.includes('function applyPhotos_(item, photos)'));
});
