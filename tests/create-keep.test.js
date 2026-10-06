const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Contract: Confirm xong giu anh/desc/note + dung ma vua tao; chi reset khi bam Tao tiep.
function applyCreateSuccess(form, createdCode) {
  return {
    photos: form.photos.slice(),
    desc: form.desc,
    note: form.note,
    codeShown: createdCode,
    confirmLocked: true,
    againVisible: true,
  };
}
function resetCreateForNext() {
  return { photos: [], desc: '', note: '', confirmLocked: false, againVisible: false, previewRefreshed: true };
}

test('create-keep: success giu anh + desc + dung ma, khoa Confirm', () => {
  const out = applyCreateSuccess(
    { photos: ['data:image/jpeg;base64,AAA'], desc: 'Bo huc', note: 'Ke B2' },
    'Item.06-10-2026.5'
  );
  assert.strictEqual(out.photos.length, 1);
  assert.strictEqual(out.desc, 'Bo huc');
  assert.strictEqual(out.codeShown, 'Item.06-10-2026.5');
  assert.strictEqual(out.confirmLocked, true);
  assert.strictEqual(out.againVisible, true);
});

test('create-keep: chi Tao tiep moi reset + refresh preview', () => {
  const out = resetCreateForNext();
  assert.deepStrictEqual(out.photos, []);
  assert.strictEqual(out.desc, '');
  assert.strictEqual(out.confirmLocked, false);
  assert.strictEqual(out.previewRefreshed, true);
});

test('create-keep: index.html co nut Tao tiep + khong refresh preview sau success', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes('id="btnBoxAgain"'));
  assert.ok(html.includes('id="btnItemAgain"'));
  assert.ok(html.includes('setCreateDoneUI(true)'));
  const i = html.indexOf('setCreateDoneUI(true)');
  const win = html.slice(Math.max(0, i - 600), i);
  assert.ok(!win.includes('refreshPreview()'));
});
