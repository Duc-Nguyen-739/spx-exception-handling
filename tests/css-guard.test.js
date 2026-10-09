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

test('css-guard: search + range + pills gop 1 khoi dinh trong header', () => {
  assert.ok(html.indexOf('<header>') < html.indexOf('id="rangebar"'), 'rangebar phai trong header');
  assert.ok(html.indexOf('id="pillsRow"') < html.indexOf('</header>'), 'pills phai trong header');
  assert.ok(!html.includes('--hdrH') && !html.includes('syncSticky_'), 'bo do hdrH');
  assert.ok(!html.includes('mới mở chi tiết'), 'bo thong bao caption');
  assert.ok(html.includes('header #rangebar{grid-column:1/-1;grid-row:3;margin:4px 0}'), 'mobile range sat');
  assert.ok(html.includes('header{grid-template-columns:1fr auto;padding:8px 10px;gap:4px}'), 'mobile header siet');
  assert.ok(html.includes('#msgMain:empty{display:none}'), 'msg rong tu an');
  const headers = rulesFor('header').join(';') + html.slice(html.indexOf('/* ===== header ===== */'), html.indexOf('/* ===== header ===== */') + 400);
  assert.ok(/position\s*:\s*sticky/.test(headers), 'header phai sticky');
});

test('css-guard: main giu margin theo sidebar', () => {
  const mains = rulesFor('main').join(';');
  assert.ok(/margin-left\s*:\s*250px/.test(mains), 'thieu main margin 250px');
  const rail = rulesFor('body.rail main').join(';');
  assert.ok(/margin-left\s*:\s*64px/.test(rail), 'thieu rail margin 64px');
});

test('css-guard: drawer mo thi header co phai theo (khong che range + pills)', () => {
  assert.ok(html.includes('body.has-drawer header{padding-right:498px}'), 'thieu header co 498px');
  assert.ok(html.includes('body.wide.has-drawer header{padding-right:668px}'), 'thieu header co 668px');
  assert.ok(html.includes('header{transition:padding-right .28s ease}'), 'thieu transition header');
  const desk = html.slice(html.indexOf('body.has-drawer main{padding-right:498px}'));
  const wideHdr = desk.indexOf('body.wide.has-drawer header{padding-right:668px}');
  const shortHdr = desk.indexOf('header{padding:12px 22px 12px 262px;grid-template-columns:1fr minmax(0,720px) 1fr}');
  assert.ok(wideHdr > shortHdr && shortHdr >= 0, 'rule co header phai dat SAU shorthand padding');
});

test('css-guard: sidebar mo thi header chua le trai 262px (khong che range + pills)', () => {
  assert.ok(html.includes('header{padding:12px 22px 12px 262px;grid-template-columns:1fr minmax(0,720px) 1fr}'), 'header desktop phai chua le trai 262px theo sidebar');
  assert.ok(!html.includes('header{padding:12px 22px;grid-template-columns'), 'cam shorthand reset le trai ve 22px');
  assert.ok(html.includes('body.rail header{padding-left:76px}'), 'rail giu le trai 76px');
});

test('css-guard: ctxBar ngu canh thay filter o tab khac (mau B)', () => {
  assert.ok(html.indexOf('id="ctxBar"') < html.indexOf('</header>'), 'ctxBar phai trong header');
  assert.ok(html.includes('header #ctxBar{grid-column:1/-1;grid-row:4;margin-bottom:0}'), 'thieu ctxBar mobile row 4');
  assert.ok(html.includes('header #ctxBar{grid-column:1/-1;grid-row:3;margin-bottom:0}'), 'thieu ctxBar desktop row 3');
  assert.ok(html.includes('function syncTabHeader(tab)'), 'thieu syncTabHeader');
  assert.ok(html.includes("syncTabHeader(on?'liq':'list')"), 'showLiq phai sync header');
  assert.ok(html.includes("syncTabHeader(on?'print':'list')"), 'showPrint phai sync header');
  assert.ok(html.includes("syncTabHeader('role')"), 'showAccess phai sync header');
  assert.ok(html.includes('id="liqTotalTop"'), 'thieu tong don da quet');
});
