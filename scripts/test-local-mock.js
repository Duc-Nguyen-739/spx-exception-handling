/**
 * scripts/test-local-mock.js — Test UI thật trên Chrome headless qua CDP.
 *
 * KHỚP spx-diem-danh/scripts/test-local-mock.js: build-local → spawn Chrome
 * headless riêng (port 9223) → CDP WebSocket thuần (Node 22+ native, không
 * cần thư viện) → Runtime.evaluate chuỗi check + waitUntil poll 100ms.
 * Khác: mock-google.js của repo này (listItems/getItem/resolveItem/
 * adminEditItem…), DOM IDs: grid/detailModal/detailHist/editModal.
 *
 * Usage: node scripts/test-local-mock.js   (exit 0/1)
 */
'use strict';
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const { build } = require('./build-local.js');

build();

const CDP_PORT = 9223;
const CDP_HTTP = 'http://127.0.0.1:' + CDP_PORT;
const INDEX_FILE = 'file:///' + path.resolve(__dirname, '..', 'index.local.html').replace(/\\/g, '/');

function findChrome() {
  if (process.env.CHROME_PATH) return { exe: process.env.CHROME_PATH, shell: false };
  const cands = [
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
  ];
  for (const p of cands) if (fs.existsSync(p)) return { exe: p, shell: false };
  try {
    const root = path.join(os.homedir(), '.cache', 'puppeteer');
    for (const kind of ['chrome-headless-shell', 'chrome']) {
      const base = path.join(root, kind);
      if (!fs.existsSync(base)) continue;
      const versions = fs.readdirSync(base).filter((v) => !v.startsWith('.')).sort().reverse();
      for (const v of versions) {
        for (const sub of ['chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux64/chrome', 'chrome-linux/chrome']) {
          const p = path.join(base, v, sub);
          if (fs.existsSync(p)) return { exe: p, shell: sub.includes('headless-shell') };
        }
      }
    }
  } catch (e) { /* bỏ qua */ }
  return { exe: 'google-chrome', shell: false };
}

let chromeProc = null;
let userDataDir = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpGet(p, method) {
  return new Promise((resolve, reject) => {
    const req = http.request(CDP_HTTP + p, { method: method || 'GET' }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Bad JSON: ' + data.slice(0, 80))); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function ensureCdp() {
  try { await httpGet('/json/version'); return; } catch (e) { /* chưa mở */ }
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spx-exc-mock-'));
  const { exe, shell } = findChrome();
  console.log('Boot Chrome headless (CDP port ' + CDP_PORT + '): ' + exe);
  const args = [
    ...(shell ? [] : ['--headless=new']),
    '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + userDataDir,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--no-sandbox', '--disable-dev-shm-usage', '--disable-setuid-sandbox',
    'about:blank',
  ];
  chromeProc = spawn(exe, args, { stdio: 'ignore' });
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try { await httpGet('/json/version'); return; } catch (e) { /* retry */ }
  }
  throw new Error('Không mở được CDP port sau 10s');
}

let msgId = 0;
const pending = new Map();
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    let ws;
    const to = setTimeout(() => { try { ws && ws.close(); } catch (e) {} reject(new Error('WS connect timeout')); }, 10000);
    ws = new WebSocket(wsUrl);
    ws.onopen = () => { clearTimeout(to); resolve(ws); };
    ws.onerror = () => { clearTimeout(to); reject(new Error('WS error')); };
    ws.onclose = () => { clearTimeout(to); rejectAll(new Error('WS closed')); };
  });
}
function rejectAll(err) {
  pending.forEach((p) => { if (p.timeout) clearTimeout(p.timeout); p.reject(err); });
  pending.clear();
}
function send(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const to = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 15000);
    pending.set(id, { resolve, reject, timeout: to });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}
function setupListener(ws) {
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (p.timeout) clearTimeout(p.timeout);
      if (m.error) p.reject(new Error(m.error.message));
      else p.resolve(m.result);
    }
  };
  ws.onclose = () => rejectAll(new Error('WS closed'));
}
async function evalIn(ws, expression) {
  const res = await send(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) return { err: (res.exceptionDetails.exception && res.exceptionDetails.exception.description) || 'exception' };
  return { value: res.result && res.result.value };
}
async function waitUntil(ws, expression, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 5000);
  while (Date.now() < deadline) {
    const r = await evalIn(ws, '!!(' + expression + ')');
    if (!r.err && r.value === true) return true;
    await sleep(100);
  }
  return false;
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond });
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  — ' + detail : ''));
}

async function main() {
  let ws = null;
  try {
    console.log('INDEX:', INDEX_FILE);
    await ensureCdp();
    const target = await httpGet('/json/new?' + encodeURIComponent(INDEX_FILE), 'PUT');
    console.log('Opened tab:', target.id);
    ws = await connect(target.webSocketDebuggerUrl);
    setupListener(ws);
    await send(ws, 'Runtime.enable');

    const ready = await waitUntil(ws, "window.__MOCK_CALLS__ && document.querySelectorAll('#grid .card').length > 0", 15000);
    const load = await evalIn(ws, `JSON.stringify({
      hasMock: !!(window.google && window.google.script && window.google.script.run),
      cards: document.querySelectorAll('#grid .card').length,
      errors: (window.__PAGE_ERRORS__ || []).length
    })`);
    const L = load.err ? null : JSON.parse(load.value);
    check('App load + mock google.script.run', !!(ready && L && L.hasMock), L ? JSON.stringify(L) : load.err);
    check('Grid render ≥ 1 card từ mock', !!(L && L.cards >= 1), L && String(L.cards));

    // Chi tiết + timeline (mock Item đã Resolve, có bill + mốc ADMIN)
    await evalIn(ws, `openDetail('Item.06-10-2026.2')`);
    const tlOk = await waitUntil(ws, "document.getElementById('detailHist').innerText.includes('SPXVN123456789')", 5000);
    const tl = await evalIn(ws, `JSON.stringify({
      hist: document.getElementById('detailHist').innerText.slice(0, 400),
      cnt: document.getElementById('histCnt').textContent,
      admin: document.getElementById('detailHist').innerText.includes('ADMIN chỉnh sửa')
    })`);
    const T = tl.err ? null : JSON.parse(tl.value);
    check('Timeline hiện mốc bill SPXVN123456789', !!tlOk, T && T.hist.replace(/\n/g, ' | ').slice(0, 160));
    check('Timeline có mốc ADMIN + đếm = 3', !!(T && T.admin && T.cnt === '3'), T && ('cnt=' + T.cnt));

    // Resolve: thiếu bill báo lỗi, đủ bill đổi token + ghi mốc
    await evalIn(ws, `openDetail('Box.06-10-2026.1')`);
    await waitUntil(ws, "document.getElementById('detailTitle').textContent.includes('Box.06-10-2026.1')", 5000);
    await evalIn(ws, `document.getElementById('btnGoResolve').click()`);
    await evalIn(ws, `document.getElementById('btnConfirmResolve').click()`);
    await sleep(300);
    const needBill = await evalIn(ws, `document.getElementById('msgDetail').textContent`);
    check('Resolve thiếu bill báo lỗi', /mã bill/.test(needBill.value || ''), needBill.value);
    await evalIn(ws, `document.getElementById('resolveBill').value = 'SPXVN777'; document.getElementById('btnConfirmResolve').click()`);
    const rsOk = await waitUntil(ws, "document.getElementById('detailHist').innerText.includes('SPXVN777')"
      + " && document.querySelectorAll('#detailHist .tl.pending').length === 0", 8000);
    const rs = await evalIn(ws, `JSON.stringify({
      token: document.getElementById('detailBody').innerText.includes('Resolve'),
      calls: (window.__MOCK_CALLS__ || []).map(function(c){return c[0];}).join(',')
    })`);
    const R = rs.err ? null : JSON.parse(rs.value);
    check('Resolve đủ bill → token Resolve + mốc bill', !!(rsOk && R && R.token), R && R.calls);

    // Edit: đơn Resolve có 2 ô, bill bắt buộc, Confirm ghi ADMIN (không email)
    await evalIn(ws, `document.getElementById('btnEditDetail').click()`);
    await waitUntil(ws, "document.getElementById('editModal').classList.contains('open')", 5000);
    const eo = await evalIn(ws, `JSON.stringify({
      opts: Array.prototype.map.call(document.getElementById('editStatGrid').children, function(b){return b.textContent;}).join('/'),
      desc: document.getElementById('editDesc').value
    })`);
    const E = eo.err ? null : JSON.parse(eo.value);
    check('Edit điền sẵn + 2 ô Lưu kho/Thanh Lý', !!(E && E.opts === 'Lưu kho/Thanh Lý' && /áo thun/.test(E.desc || '')), E && (E.opts + ' / ' + E.desc));
    await evalIn(ws, `(function(){
      var g = document.getElementById('editStatGrid').children;
      for (var i = 0; i < g.length; i++) if (g[i].textContent === 'Lưu kho') g[i].click();
    })()`);
    await evalIn(ws, `document.getElementById('btnConfirmEdit').click()`);
    const edOk = await waitUntil(ws, "document.getElementById('detailHist').innerText.includes('ADMIN đổi trạng thái')"
      + " && document.querySelectorAll('#detailHist .tl.pending').length === 0", 8000);
    const ed = await evalIn(ws, `JSON.stringify({
      adminEntry: (function(){
        var tls = document.querySelectorAll('#detailHist .tl');
        for (var i = 0; i < tls.length; i++) {
          if (tls[i].innerText.includes('ADMIN đổi trạng thái')) return tls[i].innerText;
        }
        return '';
      })(),
      resolveEntry: (function(){
        var tls = document.querySelectorAll('#detailHist .tl');
        for (var i = 0; i < tls.length; i++) {
          if (tls[i].innerText.includes('SPXVN777')) return tls[i].innerText;
        }
        return '';
      })(),
      editCalls: (window.__MOCK_CALLS__ || []).filter(function(c){return c[0]==='adminEditItem';}).length
    })`);
    const D = ed.err ? null : JSON.parse(ed.value);
    check('Edit về Lưu kho → mốc ADMIN đổi trạng thái', !!edOk, D && ('adminEditItem x' + D.editCalls));
    check('Mốc Edit không lộ email ADMIN', !!(D && /ADMIN đổi trạng thái/.test(D.adminEntry) && !/@/.test(D.adminEntry)), D && D.adminEntry.replace(/\n/g, ' | '));
    check('Mốc Resolve nút thường vẫn hiện email', !!(D && /@/.test(D.resolveEntry)), D && D.resolveEntry.replace(/\n/g, ' | ').slice(0, 120));

    await evalIn(ws, `openLightbox('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','Demo')`);
    const lbOk = await waitUntil(ws, "document.getElementById('lightbox').classList.contains('open')", 3000);
    check('Lightbox mo overlay giua man hinh', !!lbOk, lbOk ? 'open' : 'no open');
    await evalIn(ws, `document.getElementById('lbX').click()`);
    await sleep(200);
    const lbClosed = await evalIn(ws, `!document.getElementById('lightbox').classList.contains('open')`);
    check('Lightbox dong bang nut X', lbClosed.value === true, String(lbClosed.value));

    await evalIn(ws, `openDetail('Box.06-10-2026.1')`);
    await waitUntil(ws, "document.getElementById('detailTitle').textContent.includes('Box.06-10-2026.1')", 5000);
    await evalIn(ws, `openDetail('Box.06-10-2026.1'); document.getElementById('btnGoResolve').click(); document.getElementById('resolveBill').value='SPXVN9';`);
    await sleep(600);
    const draft = await evalIn(ws, `JSON.stringify({open: document.getElementById('rsStep2').style.display, bill: document.getElementById('resolveBill').value})`);
    const DF = JSON.parse(draft.value);
    check('Fetch nen khong day form Resolve', DF.open === 'block' && DF.bill === 'SPXVN9', draft.value);
    const g1 = await evalIn(ws, `(window.__MOCK_CALLS__||[]).filter(function(c){return c[0]==='getItem';}).length`);
    await evalIn(ws, `openDetail('Item.06-10-2026.2')`);
    await sleep(400);
    const g2 = await evalIn(ws, `(window.__MOCK_CALLS__||[]).filter(function(c){return c[0]==='getItem';}).length`);
    check('Don tuoi mo lai zero call', g2.value === g1.value, g1.value + '->' + g2.value);
    await evalIn(ws, `document.getElementById('scanMain').value='SPXVN1'; document.getElementById('scanMain').dispatchEvent(new Event('input'))`);
    const scShow = await evalIn(ws, `document.getElementById('scanClear').classList.contains('show')`);
    check('Nut xoa hien khi co chu', scShow.value === true, String(scShow.value));
    await evalIn(ws, `document.getElementById('scanClear').click()`);
    await sleep(200);
    const scGone = await evalIn(ws, `JSON.stringify({v: document.getElementById('scanMain').value, show: document.getElementById('scanClear').classList.contains('show')})`);
    const SG = JSON.parse(scGone.value);
    check('Bam nut xoa -> sach + an nut', SG.v === '' && SG.show === false, scGone.value);
    await evalIn(ws, `window.print = function(){ window.__PRINTED__ = (window.__PRINTED__ || 0) + 1; };`);
    await evalIn(ws, `document.getElementById('btnPrintMain').click()`);
    const pvOk = await waitUntil(ws, "document.getElementById('viewPrint').style.display === 'block'", 3000);
    check('Nut In Ma vao thang tab In Ma', !!pvOk, String(pvOk));
    await evalIn(ws, `document.getElementById('scanPrint').value='Item.06-10-2026.2';document.getElementById('scanPrint').dispatchEvent(new Event('input'))`);
    const sgOk = await waitUntil(ws, "document.getElementById('lastPrint').innerText.includes('Item.06-10-2026.2')", 5000);
    check('Scan dung dinh dang tu in (ca Box/Item)', !!sgOk, String(sgOk));
    await evalIn(ws, `document.getElementById('cardBulk').click()`);
    const pkOpen = await waitUntil(ws, "document.getElementById('printKindModal').classList.contains('open')", 3000);
    check('The In Nhieu Ma mo bang chon Box/Item', !!pkOpen, String(pkOpen));
    await evalIn(ws, `document.getElementById('optPrintBox').click()`);
    const bkOk = await waitUntil(ws, "document.querySelectorAll('#bulkList li').length === 10", 8000);
    await sleep(600);
    const bk = await evalIn(ws, `JSON.stringify({
      n: document.querySelectorAll('#bulkList li').length,
      first: (document.querySelector('#bulkList li span') || {textContent: ''}).textContent,
      calls: (window.__MOCK_CALLS__ || []).filter(function(c){return c[0]==='previewBulkCodes';}).length,
      jobs: window.__PRINTED__ || 0,
      labels: document.querySelectorAll('#printArea .plabel').length
    })`);
    const B = bk.err ? null : JSON.parse(bk.value);
    check('Bulk sinh 10 ma + tu in 1 lenh duy nhat', !!(bkOk && B && B.n === 10 && B.calls >= 1 && B.jobs === 2 && B.labels === 10), bk.value);
    await evalIn(ws, `document.getElementById('btnBackPrint').click()`);
    const bkMain = await evalIn(ws, `document.getElementById('viewMain').style.display`);
    check('Tab In Ma quay ve man hinh chinh', bkMain.value === 'block', String(bkMain.value));
    const dh = await evalIn(ws, `getComputedStyle(document.querySelector('.dhead')).position`);
    check('Detail header dinh khi cuon', dh.value === 'sticky', String(dh.value));
    const fs = await evalIn(ws, `parseFloat(getComputedStyle(document.getElementById('resolveBill')).fontSize)`);
    check('O bill du 16px (iOS khong tu zoom)', fs.value >= 16, String(fs.value));

    const errs = await evalIn(ws, `JSON.stringify(window.__PAGE_ERRORS__ || [])`);
    check('Không lỗi JS trên trang', errs.value === '[]', errs.value);
  } catch (e) {
    check('CDP run', false, e.message);
  } finally {
    const failed = results.filter((r) => !r.pass).length;
    console.log(`chrome: ${results.length - failed}/${results.length} pass`);
    try { if (ws) ws.close(); } catch (e) {}
    try { if (chromeProc) chromeProc.kill(); } catch (e) {}
    process.exit(failed ? 1 : 0);
  }
}

main();
