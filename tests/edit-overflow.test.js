const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const gs = fs.readFileSync('Code.gs', 'utf8');

// Mirror thuật toán đặt slot server (Code.gs adminEditItem): ảnh mới lấp
// slot need còn thiếu trước, rồi mới họ bo_sung. Client confirmEdit KHỚP.
function place(keep, adds, kind) {
  const have = {};
  keep.forEach((s) => { have[s] = true; });
  const need = kind === 'Item' ? ['san_pham'] : ['ngoai_quan', 'san_pham'];
  const cands = ['bo_sung', 'bo_sung_1', 'bo_sung_2', 'bo_sung_3'];
  const out = keep.slice();
  adds.forEach(() => {
    let slot = '';
    for (const q of need) if (!have[q]) { slot = q; break; }
    if (!slot) for (const t of cands) if (!have[t]) { slot = t; break; }
    if (!slot) slot = 'bo_sung_moi';
    have[slot] = true;
    out.push(slot);
  });
  return out;
}

test('edit-overflow: xoa cu + chup moi → anh moi lap dung slot can', () => {
  assert.deepStrictEqual(place([], [1, 2, 3], 'Box'), ['ngoai_quan', 'san_pham', 'bo_sung']);
  assert.deepStrictEqual(place(['san_pham'], [1], 'Box'), ['san_pham', 'ngoai_quan']);
  assert.deepStrictEqual(place(['ngoai_quan', 'san_pham'], [1], 'Box'), ['ngoai_quan', 'san_pham', 'bo_sung']);
  assert.deepStrictEqual(place([], [1], 'Item'), ['san_pham']);
});

test('edit-overflow: client chan giu + moi > 3 truoc khi goi server', () => {
  assert.ok(html.includes('kept.length+editAdd.length>3'), 'thieu dieu kien chan');
  assert.ok(html.includes('Tối đa 3 ảnh'), 'thieu message ro');
});

test('edit-overflow: server khong che bien dong sheet bang file Drive', () => {
  assert.ok(!gs.includes('var f = folder.createFile(dataUrlToBlob_(placed'), 'con shadowing var f');
  assert.ok(gs.includes('var nf = folder.createFile(blobs[u])'), 'thieu rename nf');
  assert.ok(gs.includes('Ảnh mới '), 'thieu bao loi theo tung anh');
});

test('edit-overflow: UI edit 3 cot + X overlay + dem (n/3)', () => {
  assert.ok(html.includes('#editPhotos{display:grid;grid-template-columns:repeat(3,1fr)'), 'thieu grid');
  assert.ok(html.includes('class="delBox"'), 'thieu nut X overlay');
  assert.ok(html.includes('/3)'), 'thieu dem (n/3)');
});
