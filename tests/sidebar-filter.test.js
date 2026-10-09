const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Mau 3g (donesidebar don sac + Bo loc thu gon + Reset): guard HTML/CSS/JS wiring.
const html = fs.readFileSync('index.html', 'utf8');

test('sidebar-filter: nut Bo loc + panel thu gon + Reset co mat', () => {
  assert.ok(html.includes('id="sideFilterToggle"'), 'thieu nut Bo loc');
  assert.ok(html.includes('id="sideFilterPanel"'), 'thieu panel');
  assert.ok(html.includes('id="sideFilterReset"'), 'thieu nut Reset');
  assert.ok(html.includes('aria-expanded="false"'), 'mac dinh phai thu gon');
  assert.ok(!/id="sideFilterPanel"[^>]*class="[^"]*open/.test(html), 'panel mac dinh khong open');
  assert.ok(html.includes('class="fchev"'), 'thieu chevron');
  assert.ok(html.includes('class="fchev"><svg viewBox="0 0 24 24"><path d="M6 9.5l6 6 6-6"/></svg>'), 'chevron phai la SVG to');
  assert.ok(html.includes('stroke-width:2.6'), 'chevron phai net dam 2.6');
  assert.ok(html.includes('class="rwrap"'), 'Reset phai can giua (rwrap)');
});

test('sidebar-filter: CSS don sac desktop, mobile giu nguyen', () => {
  assert.ok(html.includes('background:#1b2434'), 'sidebar phai nen #1b2434');
  assert.ok(html.includes('.bnav .fhead'), 'thieu rule dong Bo loc');
  assert.ok(html.includes('.fpanel.open'), 'thieu rule panel mo');
  assert.ok(html.includes('.bnav .freset'), 'thieu rule nut Reset');
  assert.ok(html.includes('.side-brand,.sfilter,.railbox{display:none}'), 'mobile phai an sidebar');
  assert.ok(!html.includes('border-left-color:var(--o)'), 'bo vien cam muc mo');
});

test('sidebar-filter: JS day/keo + Reset tai su dung resetKindStatus', () => {
  assert.ok(html.includes("getElementById('sideFilterToggle').onclick"), 'thieu wiring nut Bo loc');
  assert.ok(html.includes("getElementById('sideFilterReset').onclick"), 'thieu wiring Reset');
  assert.ok(html.includes('function resetKindStatus()'), 'thieu ham goc resetKindStatus');
  const i = html.indexOf("getElementById('sideFilterReset').onclick");
  assert.ok(html.slice(i, i + 260).includes('resetKindStatus()'), 'Reset phai goi lai resetKindStatus (khong logic moi)');
});
