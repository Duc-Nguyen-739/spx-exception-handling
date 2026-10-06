const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Contract: click anh detail mo lightbox nen den (khong tab moi); zoom clamp 1..5.
function clampZoom(s, f) {
  return Math.min(5, Math.max(1, s * f));
}

test('lightbox: zoom clamp 1..5 + reset ve 1', () => {
  assert.strictEqual(clampZoom(1, 1.4), 1.4);
  assert.strictEqual(clampZoom(4, 1.4), 5);
  assert.strictEqual(clampZoom(1, 1 / 1.4), 1);
  assert.strictEqual(clampZoom(2.5, 0), 1);
});

test('lightbox: phBox khong con link tab moi, anh co data-ph + cursor zoom', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const i = html.indexOf('function phBox(label,url){');
  const win = html.slice(i, i + 600);
  assert.ok(!win.includes('<a '));
  assert.ok(!win.includes('target="_blank"'));
  assert.ok(win.includes('img data-ph'));
  assert.ok(html.includes('.ph img[data-ph]{cursor:zoom-in}'));
});

test('lightbox: overlay + wiring day du (open/close/zoom/esc/backdrop/drag)', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  for (const s of ['id="lightbox"', 'id="lbImg"', 'id="lbStage"', 'function openLightbox(src,cap)',
    'function closeLightbox()', 'function lbZoom(f)', 'function initLightbox()',
    "key==='Escape'", 'pointerdown', "addEventListener('wheel'"]) {
    assert.ok(html.includes(s), s);
  }
  assert.ok(html.includes('openLightbox(im.src'));
});
