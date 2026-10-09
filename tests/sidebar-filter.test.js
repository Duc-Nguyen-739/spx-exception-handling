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
  assert.ok(html.includes('.side-brand,.sfilter,.railbox,.rfly{display:none}'), 'mobile phai an sidebar + flyout');
  assert.ok(!html.includes('border-left-color:var(--o)'), 'bo vien cam muc mo');
});



test('footer-divider: vach mo + nut ria phai can giua chieu cao', () => {
  assert.ok(html.includes('.bottom-row{display:flex;gap:8px;margin-top:auto;align-items:center;justify-content:flex-end;border-top:1px solid rgba(255,255,255,.09);height:58px;padding:0 8px 0 0}'), 'o chan mo: vach + cao 58px + nut ria phai');
  assert.ok(html.includes('body.rail .railbox .expand{margin-top:auto;width:100%;height:58px;'), 'o chan rail: vach + cao 58px');
});

test('rail-flyout: nut pheu + bang phu + hover wiring', () => {
  assert.ok(html.includes('id="railFlyout"'), 'thieu flyout');
  assert.ok(html.includes('id="flyStatus"') && html.includes('id="flyKind"'), 'thieu host flyout');
  assert.ok(html.includes('id="flyReset"'), 'thieu Reset flyout');
  assert.ok(html.includes('railFilterBtn'), 'thieu nut pheu rail');
  assert.ok(html.includes('.rfly.open'), 'thieu CSS mo flyout');
  assert.ok(html.includes('left:72px'), 'flyout phai sat rail');
  assert.ok(html.includes('.railbox,.rfly{display:none}'), 'mobile phai an flyout');
  assert.ok(html.includes("addEventListener('mouseenter',openRailFly)"), 'thieu hover mo');
  assert.ok(html.includes("addEventListener('mouseleave',schedRailFly)"), 'thieu hover dong');
  assert.ok(html.includes('function buildFilterInto_('), 'thieu builder SSOT');
  const i = html.indexOf("getElementById('flyReset').onclick");
  assert.ok(html.slice(i, i + 200).includes('resetKindStatus()'), 'Reset flyout tai su dung');
});
test('sidebar-filter: JS day/keo + Reset tai su dung resetKindStatus', () => {
  assert.ok(html.includes("getElementById('sideFilterToggle').onclick"), 'thieu wiring nut Bo loc');
  assert.ok(html.includes("getElementById('sideFilterReset').onclick"), 'thieu wiring Reset');
  assert.ok(html.includes('function resetKindStatus()'), 'thieu ham goc resetKindStatus');
  const i = html.indexOf("getElementById('sideFilterReset').onclick");
  assert.ok(html.slice(i, i + 260).includes('resetKindStatus()'), 'Reset phai goi lai resetKindStatus (khong logic moi)');
});
