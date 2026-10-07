const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Guard CSS: #viewPrint KHONG duoc set margin-left (ID specificity de
// margin-left cua main theo sidebar -> tab chui xuoi duoi sidebar).
// Dich phai bang padding-left. KHOP index.html.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function rulesFor(sel) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1].split(',').some((s) => s.trim() === sel)) out.push(m[2]);
  }
  return out;
}

test('css-guard: #viewPrint khong margin-left', () => {
  const bodies = rulesFor('#viewPrint');
  assert.ok(bodies.length > 0, 'thieu rule #viewPrint');
  for (const b of bodies) assert.ok(!/margin-left/.test(b), 'cam margin-left: ' + b);
});

test('css-guard: main giu margin theo sidebar', () => {
  const mains = rulesFor('main').join(';');
  assert.ok(/margin-left\s*:\s*250px/.test(mains), 'thieu main margin 250px');
  const rail = rulesFor('body.rail main').join(';');
  assert.ok(/margin-left\s*:\s*64px/.test(rail), 'thieu rail margin 64px');
});
