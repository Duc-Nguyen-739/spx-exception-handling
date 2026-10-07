const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Regression: Edit tung anh hong trong khi Detail van hien (cung URL).
// Nguyen nhan: Detail co bindPhotoFallback (thumbnail hong -> getPhoto),
// Edit render <img> tran khong co onerror. KHOP index.html.
const html = fs.readFileSync('index.html', 'utf8');

test('edit-photo: anh Edit co fallback giong Detail', () => {
  assert.ok(html.includes('function bindEditPhotoFallback_(box,url){'), 'thieu helper');
  assert.ok(html.includes('bindEditPhotoFallback_(box,x.url);'), 'Edit khong goi fallback');
  assert.ok(
    html.includes('photoFallback(im,url||im.src,'),
    'Edit khong reuse SSOT photoFallback'
  );
});

test('edit-photo: khong render <img src=""> tran', () => {
  assert.ok(!html.includes("src=\"'+esc(x.url||'')+'\""), 'con <img src=""> tran');
  assert.ok(html.includes('if(x.url)box.innerHTML'), 'thieu guard url rong');
});
