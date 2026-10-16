/**
 * scripts/cdp-helper.js — Điều khiển Chrome qua CDP (Chrome DevTools Protocol).
 * Công cụ dev cho agent tự test UI: mở app mock (file:// hoặc npm run dev), eval
 * JS để đo/kiểm tra, chụp màn hình, click tọa độ — không cần test nào viết sẵn.
 *
 * Port từ spx-diem-danh/scripts/cdp-helper.js (giữ timeout 10/15s + onclose
 * reject — bug 2026-08-18: WS đóng làm treo vô hạn). Khác:
 *   - Tự boot chrome-headless-shell (scripts/chrome-path.js) khi CDP chưa mở —
 *     agent chạy được ngay, không cần ai mở Chrome trước.
 *   - Port 9222, env CDP_PORT override (test:chrome dùng 9223 nên không đụng nhau).
 *   - Bỏ evalframe/evaliframe (repo không chạy app trong iframe GAS).
 *
 * Usage:
 *   node scripts/cdp-helper.js list               → danh sách tab
 *   node scripts/cdp-helper.js open <url>         → mở tab mới
 *   node scripts/cdp-helper.js eval <expr>        → chạy JS trong tab đang active, in JSON
 *   node scripts/cdp-helper.js shot <file.png>    → chụp screenshot tab đang active
 *   node scripts/cdp-helper.js click <x> <y>      → click chuột tại tọa độ viewport
 *   node scripts/cdp-helper.js reload             → reload tab đang active
 *   node scripts/cdp-helper.js select <tabIdPrefix> → chọn tab (trong cùng lần chạy)
 *   node scripts/cdp-helper.js close              → đóng tab app do phiên này mở
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { findChrome } = require('./chrome-path.js');
try { if (typeof WebSocket === 'undefined') globalThis.WebSocket = require('ws'); } catch (e) { /* Node 22+ có WebSocket global */ }

const CDP_PORT = parseInt(process.env.CDP_PORT, 10) || 9222;
const CDP_HTTP = 'http://127.0.0.1:' + CDP_PORT;
const WS_CONNECT_TIMEOUT_MS = 10000;  // connect WS không treo vĩnh viễn (bug 2026-08-18)
const WS_SEND_TIMEOUT_MS = 15000;     // CDP không phản hồi → reject thay vì treo main()
const args = process.argv.slice(2);
const cmd = args[0] || 'help';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function rejectAllPending(err) {
  pending.forEach((p) => { if (p.timeout) clearTimeout(p.timeout); p.reject(err); });
  pending.clear();
}

function httpGet(pathname, method) {
  return new Promise((resolve, reject) => {
    const req = http.request(CDP_HTTP + pathname, { method: method || 'GET' }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Bad JSON: ' + data.slice(0, 80))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// /json/close trả text thuần ("Target is closing"), không phải JSON.
function httpGetText(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request(CDP_HTTP + pathname, { method: 'GET' }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data.trim()));
    });
    req.on('error', reject);
    req.end();
  });
}

// Chưa có CDP → boot chrome-headless-shell riêng (detached, sống tiếp giữa các lần chạy).
async function ensureCdp() {
  try { await httpGet('/json/version'); return; } catch (e) { /* chưa mở */ }
  const { exe, shell } = findChrome();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spx-exc-cdp-'));
  console.log('Boot Chrome headless (CDP port ' + CDP_PORT + '): ' + exe);
  const chromeArgs = [
    ...(shell ? [] : ['--headless=new']),
    '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + userDataDir,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--no-sandbox', '--disable-dev-shm-usage', '--disable-setuid-sandbox',
    'about:blank',
  ];
  const proc = spawn(exe, chromeArgs, { stdio: 'ignore', detached: true });
  proc.unref();
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try { await httpGet('/json/version'); return; } catch (e) { /* retry */ }
  }
  throw new Error('Không mở được CDP port ' + CDP_PORT + ' sau 10s');
}

let msgId = 0;
const pending = new Map();
let selectedTabId = null;

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    let ws;
    const to = setTimeout(() => {
      try { ws && ws.close(); } catch (e) {}
      reject(new Error('WS connect timeout'));
    }, WS_CONNECT_TIMEOUT_MS);
    ws = new WebSocket(wsUrl);
    ws.onopen = () => { clearTimeout(to); resolve(ws); };
    ws.onerror = (e) => { clearTimeout(to); reject(new Error('WS error: ' + (e && e.message))); };
    // WS đóng giữa chừng (CDP đóng/tab đóng) → reject mọi promise đang chờ — không treo.
    ws.onclose = () => { clearTimeout(to); rejectAllPending(new Error('WS closed')); };
  });
}

function send(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const to = setTimeout(() => {
      pending.delete(id);
      reject(new Error('CDP timeout: ' + method));
    }, WS_SEND_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timeout: to });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}

function setupListener(ws) {
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (p.timeout) clearTimeout(p.timeout);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    }
  };
}

// Tab của app này: index.html / index.local.html local, preview npm run dev
// (127.0.0.1/localhost), hoặc apps script.
function isOurTab(t) {
  return t.type === 'page' && /index(\.local)?\.html|https?:\/\/(127\.0\.0\.1|localhost)[:/]|macros|scripts\.google/i.test(t.url);
}

async function getActiveTab() {
  const tabs = await httpGet('/json');
  if (selectedTabId) {
    const sel = tabs.find((t) => t.type === 'page' && t.id === selectedTabId);
    if (sel) return sel;
  }
  const target = tabs.find(isOurTab) || tabs.find((t) => t.type === 'page');
  if (!target) throw new Error('Không có tab page nào');
  return target;
}

function printUsage() {
  console.log('Usage: node scripts/cdp-helper.js list|open <url>|eval <expr>|shot <png>|click <x> <y>|reload|select <tabIdPrefix>|close');
  console.log('Env: CDP_PORT (mặc định 9222) · CHROME_PATH (mặc định .chrome/ hoặc Chrome hệ thống)');
}

async function main() {
  if (cmd === 'help' || cmd === '--help' || cmd === '-h') { printUsage(); return; }

  await ensureCdp();

  if (cmd === 'select') {
    // select <tabIdPrefix> — chọn tab theo prefix id để các lệnh sau dùng.
    // Prefix phải ở args[1] (args[0] là tên lệnh "select") — bug 2026-08-18.
    const prefix = args[1];
    if (!prefix) { console.log('Cần tabId prefix (xem list)'); process.exit(1); }
    const tabs = await httpGet('/json');
    const tab = tabs.find((t) => t.type === 'page' && t.id.startsWith(prefix));
    if (!tab) { console.log('Không tìm thấy tab ' + prefix); process.exit(1); }
    selectedTabId = tab.id;
    console.log('Selected: ' + tab.id);
    return;
  }
  if (cmd === 'list') {
    const tabs = await httpGet('/json');
    tabs.filter((t) => t.type === 'page').forEach((t) => {
      console.log(`[${t.id}] ${t.title} — ${t.url.slice(0, 110)}`);
    });
    return;
  }

  if (cmd === 'open') {
    const url = args[1];
    if (!url) throw new Error('Thiếu URL');
    const target = await httpGet('/json/new?' + encodeURIComponent(url), 'PUT');
    console.log('Opened:', target.id, target.url);
    return;
  }

  if (cmd === 'eval') {
    const expr = args.slice(1).join(' ');
    const tab = await getActiveTab();
    const ws = await connect(tab.webSocketDebuggerUrl);
    setupListener(ws);
    await send(ws, 'Runtime.enable');
    const res = await send(ws, 'Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    console.log(JSON.stringify(res.result && res.result.value !== undefined ? res.result.value : res, null, 2));
    ws.close();
    return;
  }

  if (cmd === 'shot') {
    const file = args[1] || 'shot.png';
    const tab = await getActiveTab();
    const ws = await connect(tab.webSocketDebuggerUrl);
    setupListener(ws);
    await send(ws, 'Page.enable');
    const res = await send(ws, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
    console.log('Saved:', file);
    ws.close();
    return;
  }

  if (cmd === 'reload') {
    const tab = await getActiveTab();
    const ws = await connect(tab.webSocketDebuggerUrl);
    setupListener(ws);
    await send(ws, 'Page.enable');
    await send(ws, 'Page.reload', { ignoreCache: true });
    console.log('Reloaded:', tab.id);
    ws.close();
    return;
  }

  if (cmd === 'click') {
    // click <x> <y> — click chuột tại tọa độ viewport (Input.dispatchMouseEvent).
    const x = parseFloat(args[1]);
    const y = parseFloat(args[2]);
    if (isNaN(x) || isNaN(y)) { console.log('Cần tọa độ: click <x> <y>'); process.exit(1); }
    const tab = await getActiveTab();
    const ws = await connect(tab.webSocketDebuggerUrl);
    setupListener(ws);
    await send(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    console.log('Clicked:', x, y);
    ws.close();
    return;
  }

  if (cmd === 'close') {
    const tabs = await httpGet('/json');
    const tab = tabs.find((t) => isOurTab(t) && (!selectedTabId || t.id === selectedTabId))
      || tabs.find(isOurTab);
    if (!tab) { console.log('Không có tab app nào để đóng'); return; }
    const out = await httpGetText('/json/close/' + tab.id);
    console.log('Closed:', tab.id, out);
    return;
  }

  console.log('Lệnh không biết: ' + cmd);
  printUsage();
  process.exit(1);
}

main().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
