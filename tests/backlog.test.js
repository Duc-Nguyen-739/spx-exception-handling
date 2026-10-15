const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Mirror: client blFmtCogs/blCogsDigits (nhóm nghìn + bỏ scale x1e9 khi >12 số) + blFmtUpd (B1 -> dd/MM/yyyy).
function blCogsDigits(v) {
  var d = String(v == null ? '' : v).replace(/[^0-9]/g, '');
  if (d.length > 12) d = d.slice(0, -9).replace(/^0+/, '') || '0';
  return d;
}
function blFmtCogs(v) {
  var d = blCogsDigits(v);
  if (!d) return String(v == null ? '' : v);
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function blFmtUpd(s) {
  var m = String(s || '').match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
  return m ? (m[3] + '/' + m[2] + '/' + m[1] + ' ' + m[4]) : String(s || '');
}

test('backlog: fmt helpers — COGS + UpdatedAt', () => {
  assert.strictEqual(blFmtCogs('1334565'), '1,334,565');
  assert.strictEqual(blFmtCogs('35000'), '35,000');
  assert.strictEqual(blFmtCogs('28,890,000'), '28,890,000');
  assert.strictEqual(blFmtCogs('999999999999'), '999,999,999,999');
  assert.strictEqual(blFmtCogs('28890000000000004'), '28,890,000');
  assert.strictEqual(blFmtCogs(''), '');
  assert.strictEqual(blFmtUpd('2026-10-10 18:53:19'), '10/10/2026 18:53:19');
  assert.strictEqual(blFmtUpd('10/10/2026 18:53:19'), '10/10/2026 18:53:19');
});

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('backlog: total COGS — theo dòng lọc, dùng giá trị chuẩn', () => {
  var rows = ['35000', '28890000000000004', '6800'];
  var tot = rows.reduce((s, v) => s + BigInt(blCogsDigits(v) || '0'), 0n);
  assert.strictEqual(tot.toString(), '28931800');
});
const gs = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, '..', 'mock/mock-google.js'), 'utf8');

test('backlog: index.html — nav + view + wiring', () => {
  assert.ok(html.includes('id="navBacklog"'), 'missing #navBacklog');
  assert.ok(html.includes('id="viewBacklog"'), 'missing #viewBacklog');
  assert.ok(html.includes('id="blQ"'), 'missing #blQ search');
  assert.ok(html.includes('id="blSearch"'), 'missing #blSearch');
  assert.ok(html.includes('id="blTbl"'), 'missing #blTbl');
  assert.ok(html.includes('id="blThead"'), 'missing #blThead');
  assert.ok(html.includes('id="blTbody"'), 'missing #blTbody');
  assert.ok(html.includes('id="blDetail"'), 'missing #blDetail modal');
  assert.ok(html.includes('id="blCopy"'), 'missing #blCopy');
  assert.ok(html.includes('id="blHdrop"'), 'missing #blHdrop filter');
  assert.ok(html.includes('id="blPtip"'), 'missing #blPtip tooltip');
  assert.ok(html.includes('gs(\'listBacklog\''), 'missing listBacklog call');
  assert.ok(html.includes('showBacklog'), 'missing showBacklog');
  assert.ok(html.indexOf('id="navMain"') < html.indexOf('id="navBacklog"'), 'backlog nav after main');
  assert.ok(html.indexOf('id="navBacklog"') < html.indexOf('id="navLiq"'), 'backlog nav before liq');
  assert.ok(html.includes('Copy Shipment ID'), 'copy button must use row-2 title');
  assert.ok(/#navBacklog\{display:none\}/.test(html) || html.includes('#navBacklog{display:none}'), 'backlog hidden on mobile');
  assert.ok(html.includes('vnđ'), 'missing COGS total unit');
  assert.ok(html.includes('max-width:680px'), 'search must be capped 680px centered');
  assert.ok(html.includes('BigInt(blCogsDigits'), 'total must sum normalized COGS with BigInt');
});

test('backlog: Code.gs — listBacklog read-only tu hang 4, gate backlog', () => {
  assert.ok(/function listBacklog/.test(gs), 'missing listBacklog');
  assert.ok(/var BACKLOG_KEYS/.test(gs), 'missing BACKLOG_KEYS');
  assert.ok(/var BACKLOG_DEFAULT/.test(gs), 'missing BACKLOG_DEFAULT');
  var body = gs.split('function listBacklog')[1].split(/^function /m)[0];
  assert.ok(body.indexOf('getSheetByName(\'Backlog\')') >= 0, 'must read Backlog sheet');
  assert.ok(body.indexOf('requireAdmin_') < 0, 'listBacklog must not gate ADMIN');
  assert.ok(body.indexOf("checkPerm_('backlog')") >= 0, 'listBacklog must gate backlog');
  assert.ok(body.indexOf('LockService') < 0, 'listBacklog must not lock (read-only)');
  assert.ok(/defaults:\s*BACKLOG_DEFAULT/.test(body), 'must return defaults');
});

test('backlog: Code.gs — default đúng 10 cột chốt', () => {
  var m = gs.match(/var BACKLOG_DEFAULT = \[([\s\S]*?)\];/);
  assert.ok(m, 'missing BACKLOG_DEFAULT');
  var cols = m[1].match(/'[a-z_]+'/g);
  assert.strictEqual(cols.length, 10);
  assert.ok(!cols.includes("'seller_sort_code'"), 'seller hidden by default');
  assert.ok(!cols.includes("'last_touch_by'"), 'last_touch_by hidden by default');
});

test('backlog: mock — seed + endpoint', () => {
  assert.ok(/listBacklog: function/.test(mock), 'mock missing listBacklog');
  assert.ok(/var BACKLOG/.test(mock), 'mock missing BACKLOG seed');
  assert.ok(/var BL_KEYS/.test(mock), 'mock missing BL_KEYS');
});
