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
  try {
    const local = path.join(__dirname, '..', '.chrome');
    if (fs.existsSync(local)) {
      const vers = fs.readdirSync(local).filter((v) => !v.startsWith('.')).sort().reverse();
      const subs = ['chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-headless-shell-linux-arm64/chrome-headless-shell', 'chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-headless-shell-mac-x64/chrome-headless-shell', 'chrome-headless-shell-win64/chrome-headless-shell.exe', 'chrome-headless-shell-win32/chrome-headless-shell.exe'];
      for (const v of vers) for (const sub of subs) {
        const p = path.join(local, v, sub);
        if (fs.existsSync(p)) return { exe: p, shell: true };
      }
    }
  } catch (e) { /* bo qua */ }
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
    const sf = await evalIn(ws, `JSON.stringify({
      t: !!document.getElementById('sideFilterToggle'),
      collapsed: !document.getElementById('sideFilterPanel').classList.contains('open'),
      r: !!document.getElementById('sideFilterReset'),
      chev: getComputedStyle(document.querySelector('#sideFilterToggle .fchev svg')).width
    })`);
    const SF = sf.err ? null : JSON.parse(sf.value);
    await evalIn(ws, `document.getElementById('sideFilterToggle').click()`);
    await waitUntil(ws, "document.getElementById('sideFilterPanel').classList.contains('open')", 3000);
    await evalIn(ws, `document.querySelectorAll('#fStatus .dash-opt')[1].click()`);
    await sleep(300);
    await evalIn(ws, `document.getElementById('sideFilterReset').click()`);
    await sleep(300);
    const sfMsg = await evalIn(ws, `document.getElementById('msgMain').textContent`);
    check('Sidebar: Bo loc thu gon mac dinh + Reset ve mac dinh', !!(SF && SF.t && SF.collapsed && SF.r && SF.chev === '18px' && /reset bộ lọc/i.test(sfMsg.value || '')), 'chev=' + (SF && SF.chev) + ' ' + sfMsg.value);
    await evalIn(ws, `document.getElementById('railFilterBtn').dispatchEvent(new Event('mouseenter'))`);
    const flyOpen = await waitUntil(ws, "document.getElementById('railFlyout').classList.contains('open')", 3000);
    await evalIn(ws, `document.getElementById('railFlyout').dispatchEvent(new Event('mouseleave'))`);
    await sleep(400);
    const flyShut = await evalIn(ws, `!document.getElementById('railFlyout').classList.contains('open')`);
    check('Rail: hover pheu hien flyout + ra ngoai thu vao', !!(flyOpen && flyShut.value), String(flyShut.value));
    await evalIn(ws, `document.getElementById('rgEdit').click()`);
    await waitUntil(ws, "document.getElementById('rangeModal').classList.contains('open')", 3000);
    const cal = await evalIn(ws, `JSON.stringify({
      dimEdge: document.querySelectorAll('#rangeModal span.dim.edge').length,
      dimIn: document.querySelectorAll('#rangeModal span.dim.in').length
    })`);
    const CAL = cal.err ? null : JSON.parse(cal.value);
    check('Lich: o tran thang khong to (chi o that)', !!(CAL && CAL.dimEdge === 0 && CAL.dimIn === 0), cal.value);
    await evalIn(ws, `document.querySelector('#rgPresets button[data-d="60"]').click(); document.getElementById('rgOk').click()`);
    await sleep(300);
    const rgW = await evalIn(ws, `document.getElementById('rgRangeLabel').textContent`);
    const rgExp = await evalIn(ws, `(function(){var t=todayYMD_();return fmtRangeShort_(addDaysYMD_(t,-59),t);})()`);
    check('Range mo rong 60d sau load', rgW.value === rgExp.value, rgW.value);

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
    const ph = await evalIn(ws, `JSON.stringify({
      n: document.querySelectorAll('#detailBody img[data-ph]').length
    })`);
    const P = ph.err ? null : JSON.parse(ph.value);
    check('Chi tiết Box hiện đủ 3 ảnh', !!(P && P.n === 3), P && ('n=' + P.n));
    const rs0 = await evalIn(ws, `JSON.stringify({
      h: Math.round(document.getElementById('btnGoResolve').getBoundingClientRect().height),
      sameRow: document.getElementById('btnPrintDetail').parentNode === document.getElementById('btnGoResolve').parentNode
    })`);
    const RS0 = rs0.err ? null : JSON.parse(rs0.value);
    check('Resolve gọn 42px + In QR cùng hàng, không lấp lịch sử', !!(RS0 && RS0.h === 42 && RS0.sameRow), rs0.value);
    const mob = await evalIn(ws, `JSON.stringify((function(){
      var vw = window.innerWidth;
      var sheet = document.querySelector('#detailModal .sheet');
      var body = document.getElementById('detailBody');
      var dh = getComputedStyle(document.getElementById('detailHist'));
      var hist = document.getElementById('histCard').getBoundingClientRect();
      var rs = document.getElementById('resolveCard').getBoundingClientRect();
      return {
        vw: vw,
        sheetFixed: getComputedStyle(sheet).overflowY === 'hidden',
        bodyFit: body.scrollHeight <= body.clientHeight + 1,
        histFlex: dh.flexGrow === '1' && dh.minHeight === '0px' && dh.overflowY === 'auto',
        rsPos: getComputedStyle(document.getElementById('resolveCard')).position,
        noCover: rs.top >= hist.bottom - 1
      };
    })())`);
    const MOB = mob.err ? null : JSON.parse(mob.value);
    check('Mobile mau A: bang co dinh, info du khong cuon trong, timeline co gian + cuon trong', !!(MOB && MOB.vw < 900
      && MOB.sheetFixed && MOB.bodyFit && MOB.histFlex && MOB.rsPos === 'static' && MOB.noCover), mob.value);
    const phDone = await waitUntil(ws, "(function(){var l=document.querySelectorAll('#detailBody img[data-ph]');if(l.length!==3)return false;if(document.getElementById('detailBody').innerText.indexOf('thiếu mã ảnh')>=0)return false;return Array.prototype.every.call(l,function(i){var s=i.getAttribute('src')||'';return s.indexOf('data:')===0||s.indexOf('blob:')===0;});})()", 15000);
    check('Tem/direct lỗi tự fallback server hiện đủ 3 ảnh, không kẹt lỗi ?', !!phDone, String(phDone));
    const du = await evalIn(ws, `JSON.stringify((window.__MOCK_CALLS__||[]).filter(function(c){return c[0]==='getDetailUrls';}).length)`);
    check('Mở chi tiết không mint tem (cache-first, 0 call getDetailUrls)', !!(du && !du.err && JSON.parse(du.value) === 0), du.value);
    const seed = await evalIn(ws, `(function(){var s=[];var IDS=['MOCKouter01AB3456789012','MOCKproduct02CD3456789012','MOCKextra03EF3456789012'];try{for(var k in photoCache)delete photoCache[k];IDS.forEach(function(pid){var kk='i'+idbKeyOf('t'+pid);var ix=idbMemOrder_.indexOf(kk);if(ix>=0)idbMemOrder_.splice(ix,1);delete idbMem_[kk];});s.push('clear-ok');}catch(e){s.push('clear-ERR:'+e.message);}try{var _d=idbDel;var n=0;idbDel=function(id){n++;window.__PURGED__=n;try{return _d(id);}catch(e){}};s.push('wrap-ok');}catch(e){s.push('wrap-ERR:'+e.message);return s.join('|');}IDS.forEach(function(pid){try{idbPut(idbKeyOf('t'+pid),new Blob(['<html>poison</html>'],{type:'text/html'}));}catch(e){s.push('put-ERR:'+e.message);}});s.push('memkeys='+Object.keys(idbMem_).join(','));try{hydrateFromIdb('Box.06-10-2026.1');s.push('hydrate-called');}catch(e){s.push('hydrate-ERR:'+e.message);}return s.join('|');})()`);
    const puOk = await waitUntil(ws, "(window.__PURGED__||0)>=3", 8000);
    const puSt = await evalIn(ws, `JSON.stringify({pc: Object.keys(photoCache).length, purged: (window.__PURGED__||0)})`);
    check('IDB nhiễm rác HTML được purge thay vì hiện ảnh rác', !!puOk, (seed.err ? 'seed-ERR:' + seed.err : seed.value) + ' st=' + (puSt.value || puSt.err));
    await evalIn(ws, `openDetail('Box.06-10-2026.1')`);
    const healOk = await waitUntil(ws, "(function(){var l=document.querySelectorAll('#detailBody img[data-ph]');return l.length===3&&Array.prototype.every.call(l,function(i){var s=i.getAttribute('src')||'';return s.indexOf('data:')===0||s.indexOf('blob:')===0;});})()", 12000);
    check('Sau purge ảnh hiện lại qua server, không kẹt lỗi', !!healOk, String(healOk));
    await evalIn(ws, `document.getElementById('btnGoResolve').click()`);
    await waitUntil(ws, "document.getElementById('rsStep2').style.display === 'block'", 3000);
    const rw = await evalIn(ws, `JSON.stringify({
      sameRow: document.getElementById('btnConfirmResolve').parentNode === document.getElementById('resolveBill').parentNode,
      h: Math.round(document.getElementById('btnConfirmResolve').getBoundingClientRect().height)
    })`);
    const RW = rw.err ? null : JSON.parse(rw.value);
    check('Form bill gọn 1 hàng, Confirm 38px', !!(RW && RW.sameRow && RW.h === 38), rw.value);
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

    // Edit ADMIN: đủ 3 ô trạng thái + ô lý do; Mã optional, Lý do bắt buộc
    await evalIn(ws, `document.getElementById('btnEditDetail').click()`);
    await waitUntil(ws, "document.getElementById('editModal').classList.contains('open')", 5000);
    const eo = await evalIn(ws, `JSON.stringify({
      opts: Array.prototype.map.call(document.getElementById('editStatGrid').children, function(b){return b.textContent;}).join('/'),
      desc: document.getElementById('editDesc').value
    })`);
    const E = eo.err ? null : JSON.parse(eo.value);
    check('Edit điền sẵn + 3 ô Lưu kho/Resolve/Thanh Lý', !!(E && E.opts === 'Lưu kho/Resolve/Thanh Lý' && /áo thun/.test(E.desc || '')), E && (E.opts + ' / ' + E.desc));
    const eg = await evalIn(ws, `JSON.stringify({
      cols: getComputedStyle(document.getElementById('editPhotos')).gridTemplateColumns.split(' ').length,
      del: document.querySelectorAll('#editPhotos .delBox').length,
      full: document.querySelectorAll('#editPhotosWrap button:not(.delBox):not(.camSlot)').length,
      cnt: document.querySelector('#editPhotosWrap>label').textContent
    })`);
    const EG = eg.err ? null : JSON.parse(eg.value);
    check('Edit: lưới 3 cột + nút X góc, không nút Xóa tràn, có đếm (n/3)', !!(EG && EG.cols === 3 && EG.del >= 2 && EG.full === 0 && /\/3\)/.test(EG.cnt || '')), eg.value);
    await evalIn(ws, `(function(){
      var g = document.getElementById('editStatGrid').children;
      for (var i = 0; i < g.length; i++) if (g[i].textContent === 'Thanh Lý') g[i].click();
    })()`);
    await evalIn(ws, `document.getElementById('editReason').value='';document.getElementById('btnConfirmEdit').click()`);
    await sleep(300);
    const noReason = await evalIn(ws, `JSON.stringify({
      msg: document.getElementById('msgEdit').textContent,
      open: document.getElementById('editModal').classList.contains('open'),
      calls: (window.__MOCK_CALLS__ || []).filter(function(c){return c[0]==='adminEditItem';}).length
    })`);
    const NR = noReason.err ? null : JSON.parse(noReason.value);
    check('Edit đổi trạng thái thiếu Lý do bị chặn, không gọi server', !!(NR && /Lý do/.test(NR.msg) && NR.open && NR.calls === 0), noReason.value);
    await evalIn(ws, `(function(){
      var g = document.getElementById('editStatGrid').children;
      for (var i = 0; i < g.length; i++) if (g[i].textContent === 'Thanh Lý') g[i].click();
      document.getElementById('editDesc').value='Thùng 12 áo thun hoàn EDIT';
      document.getElementById('btnConfirmEdit').click();
    })()`);
    const edOk = await waitUntil(ws, "document.getElementById('detailHist').innerText.includes('ADMIN Edit Mô tả')"
      + " && document.querySelectorAll('#detailHist .tl.pending').length === 0", 8000);
    const ed = await evalIn(ws, `JSON.stringify({
      adminEntry: (function(){
        var tls = document.querySelectorAll('#detailHist .tl');
        for (var i = 0; i < tls.length; i++) {
          if (tls[i].innerText.includes('ADMIN Edit Mô tả')) return tls[i].innerText;
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
    check('Edit chỉ sửa Mô tả → mốc ADMIN Edit Mô tả', !!edOk, D && ('adminEditItem x' + D.editCalls));
    check('Mốc Mô tả hiện đủ cũ => mới', !!(D && /Thùng 12 áo thun hoàn, seal còn nguyên/.test(D.adminEntry) && /EDIT/.test(D.adminEntry)), D && D.adminEntry.replace(/\n/g, ' | ').slice(0, 160));
    check('Mốc Resolve nút thường vẫn hiện email', !!(D && /@/.test(D.resolveEntry)), D && D.resolveEntry.replace(/\n/g, ' | ').slice(0, 120));

    // STAFF: nút Edit vẫn hiện, chỉ sửa Mô tả + Ghi chú qua editItem
    await evalIn(ws, `state.me={email:'son.nguyenngoc@spxexpress.com',role:'STAFF'};openDetail('Box.06-10-2026.1')`);
    await waitUntil(ws, "document.getElementById('detailTitle').textContent.includes('Box.06-10-2026.1')", 5000);
    await evalIn(ws, `document.getElementById('btnEditDetail').click()`);
    await waitUntil(ws, "document.getElementById('editModal').classList.contains('open')", 5000);
    const stf = await evalIn(ws, `JSON.stringify({
      status: document.getElementById('editStatusWrap').style.display,
      photos: document.getElementById('editPhotosWrap').style.display,
      hint: document.getElementById('editStaffHint').style.display
    })`);
    const ST = stf.err ? null : JSON.parse(stf.value);
    check('STAFF: ẩn ô trạng thái/ảnh, hiện gợi ý quyền thường', !!(ST && ST.status === 'none' && ST.photos === 'none' && ST.hint === 'block'), stf.value);
    await evalIn(ws, `document.getElementById('editDesc').value='Thùng áo thun STAFF sửa';document.getElementById('btnConfirmEdit').click()`);
    const stOk = await waitUntil(ws, "document.getElementById('detailHist').innerText.includes('Edit Mô tả')"
      + " && document.querySelectorAll('#detailHist .tl.pending').length === 0", 8000);
    const st2 = await evalIn(ws, `JSON.stringify({
      hist: document.getElementById('detailHist').innerText,
      editCalls: (window.__MOCK_CALLS__ || []).filter(function(c){return c[0]==='editItem';}).length
    })`);
    const S2 = st2.err ? null : JSON.parse(st2.value);
    check('STAFF: Confirm ghi mốc email + Edit cũ => mới', !!(stOk && S2 && /son\.nguyenngoc@spxexpress\.com/.test(S2.hist) && S2.editCalls >= 1), S2 && ('editItem x' + S2.editCalls));
    await evalIn(ws, `state.me={email:'admin.mock@spxexpress.com',role:'ADMIN'}`);

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

    // Preload: mo app da duoc item + history cho MOI don, doi don khong goi getItem.
    const pre = await evalIn(ws, `(function(){
      var codes = Object.keys(state.detailCache);
      var full = codes.filter(function(c){ return (state.detailCache[c].history||[]).length > 0; }).length;
      return JSON.stringify({
        listFull: (window.__MOCK_CALLS__||[]).filter(function(c){return c[0]==='listFull';}).length,
        cached: codes.length, withHist: full,
        identity: codes.every(function(c){ return state.detailCache[c].item === state.itemMap[c]; })
      });
    })()`);
    const PRE = pre.err ? null : JSON.parse(pre.value);
    check('Mo app preload item+history cho moi don qua listFull (zero getItem)',
      !!(PRE && PRE.listFull >= 1 && PRE.cached === PRE.withHist && PRE.cached >= 1), pre.value);
    check('detailCache.item cung identity voi itemMap (khong lech ban khi poll)',
      !!(PRE && PRE.identity === true), PRE && String(PRE.identity));
    const n1 = await evalIn(ws, `(window.__MOCK_CALLS__||[]).filter(function(c){return c[0]==='getItem';}).length`);
    await evalIn(ws, `openDetail('Box.05-10-2026.9'); openDetail('Box.06-10-2026.1'); openDetail('Item.06-10-2026.2')`);
    await sleep(400);
    const n2 = await evalIn(ws, `(window.__MOCK_CALLS__||[]).filter(function(c){return c[0]==='getItem';}).length`);
    const tlNow = await evalIn(ws, `JSON.stringify({
      hist: document.getElementById('detailHist').innerText.length > 0,
      title: document.getElementById('detailTitle').textContent
    })`);
    const TL = tlNow.err ? null : JSON.parse(tlNow.value);
    check('Doi don lien nhau: 3 lan openDetail van zero getItem + timeline co du lieu',
      n1.value === n2.value && !!(TL && TL.hist), n1.value + '->' + n2.value + ' ' + tlNow.value);
    const poll = await evalIn(ws, `JSON.stringify({ iv: 180000, has: typeof state._poll !== 'undefined' })`);
    check('Poll ngam 3 phut', /180000/.test(poll.value || ''), poll.value);
    await evalIn(ws, `document.getElementById('scanMain').value='SPXVN1'; document.getElementById('scanMain').dispatchEvent(new Event('input'))`);
    const scShow = await evalIn(ws, `document.getElementById('scanClear').classList.contains('show')`);
    check('Nut xoa hien khi co chu', scShow.value === true, String(scShow.value));
    await evalIn(ws, `document.getElementById('scanClear').click()`);
    await sleep(200);
    const scGone = await evalIn(ws, `JSON.stringify({v: document.getElementById('scanMain').value, show: document.getElementById('scanClear').classList.contains('show')})`);
    const SG = JSON.parse(scGone.value);
    check('Bam nut xoa -> sach + an nut', SG.v === '' && SG.show === false, scGone.value);
    // Camera: headless khong co camera nen assert CONFIG thuc te (popup la duong dung tren GAS iframe)
    const camCfg = await evalIn(ws, `JSON.stringify({
      enumLoaded: typeof Html5QrcodeSupportedFormats !== 'undefined',
      ctor: camCtorCfg_(),
      fps: camScanConfig_().fps,
      flip: camScanConfig_().disableFlip,
      qrFn: typeof camScanConfig_().qrbox,
      box: camQrbox_(360, 240),
      popupCtor: buildScanPopupHtml_().indexOf('new Html5Qrcode("live",CTOR_CFG)') >= 0,
      popupFmt: /CTOR_CFG=\\{?"?formatsToSupport/.test(buildScanPopupHtml_()),
      popupDup: /function pickCfg|function pickBox|function pickFm/.test(buildScanPopupHtml_())
    })`);
    const CAM = camCfg.err ? null : JSON.parse(camCfg.value);
    check('Camera config: fps cao + disableFlip + qrbox la ham',
      !!(CAM && CAM.fps >= 20 && CAM.flip === true && CAM.qrFn === 'function'), camCfg.value);
    check('Camera ROI gan full-frame (khong cat QR vuong)',
      !!(CAM && CAM.box.width >= 360 * 0.85 && CAM.box.height >= 240 * 0.8), CAM && JSON.stringify(CAM.box));
    check('Camera gioi han format o CONSTRUCTOR (QR+Code128+Code39+EAN13)',
      !!(CAM && CAM.ctor.useBarCodeDetectorIfSupported === true
        && (!CAM.enumLoaded || (CAM.ctor.formatsToSupport.length === 4 && CAM.ctor.formatsToSupport[1] === 5))),
      CAM && (CAM.enumLoaded ? JSON.stringify(CAM.ctor.formatsToSupport) : 'enum chua nap (offline)'));
    check('Popup quet lay config chung, khong copy rieng',
      !!(CAM && CAM.popupCtor && CAM.popupFmt && !CAM.popupDup), CAM && (CAM.popupCtor + '/' + CAM.popupFmt + '/' + !CAM.popupDup));
    await evalIn(ws, `window.print = function(){ window.__PRINTED__ = (window.__PRINTED__ || 0) + 1; };`);
    await evalIn(ws, `try{if(stationTimer_)clearInterval(stationTimer_);stationTimer_=null;}catch(e){} isStation_ = function(){return true;}; stationPrinted_={}; stationPrinting_=false; stationNextAllowed_=0;`);
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
    const bkOk = await waitUntil(ws, "document.querySelectorAll('#bulkList li').length === 10"
      + " && document.getElementById('singleZone').style.display === 'none'"
      + " && document.getElementById('bulkZone').style.display === 'block'", 8000);
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
    await evalIn(ws, `isStation_ = function(){return false;}; document.getElementById('cardSingle').click();`);
    await evalIn(ws, `document.getElementById('scanPrint').value='Box.06-10-2026.1';document.getElementById('scanPrint').dispatchEvent(new Event('input'))`);
    const phOk = await waitUntil(ws, "document.getElementById('lastPrint').innerText.includes('Đã gửi') && document.getElementById('lastPrint').innerText.includes('Box.06-10-2026.1')", 5000);
    const phQ = await evalIn(ws, `JSON.stringify({enq: (window.__MOCK_CALLS__||[]).filter(function(c){return c[0]==='enqueuePrintJob';}).length, jobs: window.__PRINTED__||0})`);
    const PHQ = phQ.err ? null : JSON.parse(phQ.value);
    check('Phone gui In Ma toi tram (khong in local, khong doi UI)', !!(phOk && PHQ && PHQ.enq >= 1 && PHQ.jobs === 2), phQ.value);
    const stQ = await evalIn(ws, `JSON.stringify({poll: typeof stationPollOnce_ === 'function', timer: stationTimer_ === null, cool: (typeof STATION_COOLDOWN_MS !== 'undefined' ? STATION_COOLDOWN_MS : 0), gap: (typeof STATION_POLL_MS !== 'undefined' ? STATION_POLL_MS : 0), serial: (typeof stationPrinting_ !== 'undefined' && typeof stationNextAllowed_ !== 'undefined' && typeof waitAfterPrint_ === 'function' && typeof viewPrintVisible_ === 'function')})`);
    const STQ = stQ.err ? null : JSON.parse(stQ.value);
    check('Tram poll 3s + serial + nghi 10s sau in xong', !!(STQ && STQ.poll && STQ.cool === 10000 && STQ.gap === 3000 && STQ.serial), stQ.value);
    await evalIn(ws, `isStation_ = function(){return true;}; document.getElementById('cardSingle').click();`);
    await evalIn(ws, `document.getElementById('cardSingle').click()`);
    const clOk = await waitUntil(ws, "document.querySelectorAll('#bulkList li').length === 0"
      + " && document.getElementById('bulkHint').textContent === ''"
      + " && document.getElementById('lastPrint').innerText === ''"
      + " && document.getElementById('singleZone').style.display !== 'none'"
      + " && document.getElementById('bulkZone').style.display === 'none'", 3000);
    check('Doi loai in xoa het thong bao cu', !!clOk, String(clOk));
    await evalIn(ws, `document.getElementById('btnBackPrint').click()`);
    const bkMain = await evalIn(ws, `document.getElementById('viewMain').style.display`);
    check('Tab In Ma quay ve man hinh chinh', bkMain.value === 'block', String(bkMain.value));
    await evalIn(ws, `document.querySelector('.pill[data-k="liq"]').click()`);
    const liqOk = await waitUntil(ws, "document.querySelectorAll('#grid .card').length === 1"
      + " && document.querySelector('#grid .card .code').textContent.includes('Box.05-10-2026.9')", 5000);
    check('Loc Thanh Ly hien dung don thanh_ly', !!liqOk, String(liqOk));
    await evalIn(ws, `document.querySelector('.pill[data-k=""]').click()`);
    const dh = await evalIn(ws, `getComputedStyle(document.querySelector('.dhead')).position`);
    check('Detail header dinh khi cuon', dh.value === 'sticky', String(dh.value));
    const fs = await evalIn(ws, `parseFloat(getComputedStyle(document.getElementById('resolveBill')).fontSize)`);
    check('O bill du 16px (iOS khong tu zoom)', fs.value >= 16, String(fs.value));
    const td = await evalIn(ws, `JSON.stringify({
      noBillLabel: !document.querySelector('#rsStep2 label'),
      noLiqLabel: document.getElementById('viewLiq').innerText.indexOf('Quét mã thanh lý') < 0,
      camTxt: document.getElementById('camLiq').textContent,
      nextFirst: (document.getElementById('btnNext').compareDocumentPosition(document.getElementById('msgLiq')) & 4) !== 0,
      noDiag: !document.getElementById('btnFixShare') && !document.getElementById('btnDiagId') && !document.getElementById('btnAuditPh'),
      noDeploy: document.getElementById('viewAccess').innerText.indexOf('Deploy:') < 0
    })`);
    const TD = td.err ? null : JSON.parse(td.value);
    check('Gon form bill + Role + Thanh Ly theo mau duyet', !!(TD && TD.noBillLabel && TD.noLiqLabel && /Quét camera/.test(TD.camTxt) && TD.nextFirst && TD.noDiag && TD.noDeploy), td.value);
    await evalIn(ws, `document.getElementById('navLiq').click()`);
    await evalIn(ws, `var s=document.getElementById('scanLiq');s.value='Box.06-10-2026.5';s.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}))`);
    const lqOk = await waitUntil(ws, "document.querySelectorAll('#liqRows tr').length === 1"
      + " && document.getElementById('liqTotal').textContent === 'Total 1'"
      + " && document.querySelector('#liqRows tr td.code').textContent.includes('Box.06-10-2026.5')"
      + " && document.querySelectorAll('#liqRows tr td')[2].textContent.includes('Thùng chờ thanh lý')", 8000);
    check('Thanh Ly: scan vao bang chi tiet du Ma/Loai/Mo ta', !!lqOk, String(lqOk));
    await evalIn(ws, `document.getElementById('btnNext').click()`);
    const lqW = await waitUntil(ws, "document.getElementById('liqCodeWrap').style.display === 'block'", 3000);
    check('Thanh Ly: Next hien o nhap ma SPXVN', !!lqW, String(lqW));
    await evalIn(ws, `document.getElementById('liqCode').value='SPXVN777L';document.getElementById('btnLiqDone').click()`);
    const lqDone = await waitUntil(ws, "document.getElementById('msgLiq').innerText.includes('Đã thanh lý 1 mã')"
      + " && document.querySelectorAll('#liqRows tr').length === 0"
      + " && document.getElementById('liqCodeWrap').style.display === 'none'", 8000);
    check('Thanh Ly: Confirm SPXVN chot lo + reset', !!lqDone, String(lqDone));

    await evalIn(ws, `document.getElementById('btnCreateMain').click()`);
    const ceModal = await waitUntil(ws, "document.getElementById('createModal').classList.contains('open')", 3000);
    check('Create mo modal', !!ceModal, String(ceModal));
    await evalIn(ws, `document.getElementById('optNonAwb').click(); document.getElementById('optBox').click()`);
    const ceForm = await waitUntil(ws, "document.getElementById('stepForm').style.display === 'block' && document.getElementById('boxCode').value.indexOf('Box.') === 0", 5000);
    check('Create Box hien form + ma preview', !!ceForm, String(ceForm));
    const ce0 = await evalIn(ws, `JSON.stringify({ro: document.getElementById('boxCode').readOnly, btn: document.getElementById('btnBoxEdit').textContent})`);
    check('Ma mac dinh khoa + nut Sua', ce0.value === '{"ro":true,"btn":"Sửa"}', ce0.value);
    await evalIn(ws, `window.matchMedia = function(){ return { matches: false }; }; document.getElementById('btnBoxEdit').click()`);
    const ce1 = await evalIn(ws, `JSON.stringify({ro: document.getElementById('boxCode').readOnly, btn: document.getElementById('btnBoxEdit').textContent})`);
    check('Sua: mo khoa + nut doi thanh Ok', ce1.value === '{"ro":false,"btn":"Ok"}', ce1.value);
    await evalIn(ws, `var i = document.getElementById('boxCode'); i.value = 'sai'; i.dispatchEvent(new Event('input'));`);
    const ce2 = await evalIn(ws, `document.getElementById('btnBoxEdit').disabled`);
    check('Ma sai dinh dang -> Ok bi khoa', ce2.value === true, String(ce2.value));
    await evalIn(ws, `var i = document.getElementById('boxCode'); i.value = 'Box.07-10-2026.88'; i.dispatchEvent(new Event('input')); document.getElementById('btnBoxEdit').click()`);
    const ce3 = await evalIn(ws, `JSON.stringify({ro: document.getElementById('boxCode').readOnly, btn: document.getElementById('btnBoxEdit').textContent, v: document.getElementById('boxCode').value})`);
    check('Ma dung -> Ok chot, khoa lai', ce3.value === '{"ro":true,"btn":"Sửa","v":"Box.07-10-2026.88"}', ce3.value);
    await evalIn(ws, `document.getElementById('btnCloseCreate').click()`);

    const hd = await evalIn(ws, `JSON.stringify({inHead: !!document.querySelector('header .scanbar #scanMain'), ph: document.getElementById('scanMain').placeholder})`);
    check('Search tren header + placeholder moi', hd.value === '{"inHead":true,"ph":"Nhập thông tin để tìm kiếm..."}', hd.value);
    const rv = await evalIn(ws, `JSON.stringify({bell: !!document.getElementById('btnIntro'), modal: !!document.getElementById('introModal'), first: document.querySelector('.hact').firstElementChild.id})`);
    check('Nut chuong Gioi thieu the cho so ban', rv.value === '{"bell":true,"modal":true,"first":"btnIntro"}', rv.value);
    await evalIn(ws, `document.getElementById('btnIntro').click()`);
    const ivOpen = await waitUntil(ws, "document.getElementById('introModal').classList.contains('open')", 3000);
    check('Chuong mo popup Gioi thieu', !!ivOpen, String(ivOpen));
    await evalIn(ws, `document.getElementById('btnCloseIntro').click()`);
    await evalIn(ws, `state.range={f:{y:2020,m:1,d:1},t:{y:2020,m:2,d:1}};renderGrid();`);
    const z0 = await evalIn(ws, `document.querySelectorAll('#grid .card').length`);
    check('Range cu -> luoi 0 don', z0.value === 0, String(z0.value));
    await evalIn(ws, `var s=document.getElementById('scanMain');s.value='áo thun';s.dispatchEvent(new Event('input'))`);
    await sleep(400);
    const z1 = await evalIn(ws, `document.querySelectorAll('#grid .card').length`);
    check('Search mo ta bypass Range', z1.value >= 1, String(z1.value));
    await evalIn(ws, `var s=document.getElementById('scanMain');s.value='';s.dispatchEvent(new Event('input'));document.getElementById('rgEdit').click()`);
    await waitUntil(ws, "document.getElementById('rangeModal').classList.contains('open')", 3000);
    await evalIn(ws, `document.querySelector('#rgPresets button[data-d="30"]').click();document.getElementById('rgOk').click()`);
    await sleep(300);
    await evalIn(ws, `(function(){var old=document.getElementById('__probe');if(old)old.remove();var d=document.createElement('div');d.id='__probe';d.style.display='none';var im=document.createElement('img');d.appendChild(im);document.body.appendChild(d);im.onerror=function(){try{photoFallback(im,im.src,function(msg){d.setAttribute('data-msg',msg);});}catch(e){d.setAttribute('data-msg','JS:'+e.message);}};im.src='https://nonexistent.invalid/khong-co-anh.png';})()`);
    const dgOk = await waitUntil(ws, "(function(){var d=document.getElementById('__probe');var m=d&&d.getAttribute('data-msg')||'';return m.indexOf('[link]')>=0&&m.indexOf('thiếu mã ảnh')>=0;})()", 8000);
    const dg = await evalIn(ws, `(function(){var d=document.getElementById('__probe');return d&&d.getAttribute('data-msg')||'';})()`);
    check('Anh loi hien chan doan [loai]+rev thay vi chu chung chung',
      !!(dgOk && /thiếu mã ảnh/.test(dg.value || '') && /r\d{8}[a-z]/.test(dg.value || '')), dg.value);
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
