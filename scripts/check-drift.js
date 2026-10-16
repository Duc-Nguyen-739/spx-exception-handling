/**
 * scripts/check-drift.js — Drift checker dual runtime.
 *
 * Contract domain có 3 bản mirror PHẢI khớp nhau (đừng để lệch âm thầm):
 *   1. Code.gs            — GAS webapp chạy thật
 *   2. api/logic.py       — Python mirror, test offline (marker "KHỚP Code.gs")
 *   3. scripts/import-csv.js — công cụ import (STATUS_RULES, canonicalStatus/Kind)
 *
 * So sánh CẤU TRÚC (không so text từng dòng — khác ngôn ngữ):
 *   - 10 cặp hàm CORE Code.gs ↔ api/logic.py
 *   - STATUS_RULES parity 3 nơi (pattern + status, đúng thứ tự)
 *   - STATUS_LABEL parity Code.gs ↔ api/logic.py
 *
 * KHÔNG check PERM_KEYS — đã có SSOT guard riêng tests/perm-model.test.js (luật 10).
 * Exit 1 khi drift. Cũng dùng làm test: tests/drift.test.js require checkDrift().
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// Cặp hàm mirror — GAS name ↔ Python name (không suy ra máy móc được: có cặp
// khác tên nhưng cùng semantics, vd nextSeqBothCodes_ ↔ next_seq_reserved).
const CORE_PAIRS = [
  { gas: 'canonicalStatus_', py: 'canonical_status' },
  { gas: 'codeDate_', py: 'code_date' },
  { gas: 'parseCreatedSmart_', py: 'parse_created_smart' },
  { gas: 'driveIdFromUrl_', py: 'extract_drive_id' },
  { gas: 'storageDays_', py: 'storage_days' },
  { gas: 'normSite_', py: 'norm_site' },
  { gas: 'sheetName_', py: 'sheet_name' },
  { gas: 'normHead_', py: '_norm_head' },
  { gas: 'billOf_', py: 'history_bill' },
  { gas: 'nextSeqBothCodes_', py: 'next_seq_reserved' },
];

function extractGasFunctions(src) {
  const out = new Set();
  const re = /^function ([A-Za-z0-9_]+)\s*\(/gm;
  let m;
  while ((m = re.exec(src))) out.add(m[1]);
  return out;
}

function extractPyFunctions(src) {
  const out = new Set();
  const re = /^def ([A-Za-z0-9_]+)\s*\(/gm;
  let m;
  while ((m = re.exec(src))) out.add(m[1]);
  return out;
}

// STATUS_RULES dạng JS: [[/pattern/, 'status'], ...] — Code.gs + import-csv.js.
function extractJsRules(src) {
  const block = src.match(/STATUS_RULES\s*=\s*\[([\s\S]*?)\n\];/);
  const out = [];
  if (!block) return out;
  const re = /\[\/([^/]+)\/,\s*'([a-z_]+)'\]/g;
  let m;
  while ((m = re.exec(block[1]))) out.push([m[1], m[2]]);
  return out;
}

// STATUS_RULES dạng Python: [(re.compile(r"..."), "status"), ...].
function extractPyRules(src) {
  const block = src.match(/STATUS_RULES\s*=\s*\[([\s\S]*?)\n\]/);
  const out = [];
  if (!block) return out;
  const re = /\(re\.compile\(r"([^"]+)"\),\s*"([a-z_]+)"\)/g;
  let m;
  while ((m = re.exec(block[1]))) out.push([m[1], m[2]]);
  return out;
}

function extractGasLabels(src) {
  const out = new Map();
  const block = src.match(/var STATUS_LABEL\s*=\s*\{([\s\S]*?)\n\};/);
  if (!block) return out;
  const re = /([a-z_]+)\s*:\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(block[1]))) out.set(m[1], m[2]);
  return out;
}

function extractPyLabels(src) {
  const out = new Map();
  const block = src.match(/STATUS_LABEL\s*=\s*\{([\s\S]*?)\n\}/);
  if (!block) return out;
  const re = /"([a-z_]+)":\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(block[1]))) out.set(m[1], m[2]);
  return out;
}

function compareRules(a, b, label, drifts) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const ra = a[i], rb = b[i];
    if (!ra) { drifts.push(label + ': bên phải có thêm rule #' + (i + 1) + ' → ' + rb[1]); continue; }
    if (!rb) { drifts.push(label + ': bên trái có thêm rule #' + (i + 1) + ' → ' + ra[1]); continue; }
    if (ra[0] !== rb[0]) drifts.push(label + ': pattern #' + (i + 1) + ' lệch — "' + ra[0] + '" vs "' + rb[0] + '"');
    if (ra[1] !== rb[1]) drifts.push(label + ': status #' + (i + 1) + ' lệch — ' + ra[1] + ' vs ' + rb[1]);
  }
}

function compareLabels(gsMap, pyMap, label, drifts) {
  for (const [k, v] of gsMap) {
    if (!pyMap.has(k)) { drifts.push(label + ': key ' + k + ' thiếu ở api/logic.py'); continue; }
    if (pyMap.get(k) !== v) drifts.push(label + ': ' + k + ' lệch giá trị — Code.gs="' + v + '" vs Python="' + pyMap.get(k) + '"');
  }
  for (const k of pyMap.keys()) {
    if (!gsMap.has(k)) drifts.push(label + ': key ' + k + ' chỉ có ở api/logic.py (thiếu Code.gs)');
  }
}

function checkDrift() {
  const drifts = [];
  const gs = read('Code.gs');
  const py = read('api/logic.py');
  const imp = read('scripts/import-csv.js');

  // ===== 1. Hàm CORE Code.gs ↔ api/logic.py =====
  const gsFns = extractGasFunctions(gs);
  const pyFns = extractPyFunctions(py);
  for (const pair of CORE_PAIRS) {
    if (!gsFns.has(pair.gas)) drifts.push('Code.gs thiếu hàm ' + pair.gas);
    if (!pyFns.has(pair.py)) drifts.push('api/logic.py thiếu mirror ' + pair.py);
  }

  // ===== 2. STATUS_RULES parity 3 nơi =====
  const gsRules = extractJsRules(gs);
  const pyRules = extractPyRules(py);
  const imRules = extractJsRules(imp);
  if (!gsRules.length) drifts.push('Code.gs: không trích được STATUS_RULES');
  if (!pyRules.length) drifts.push('api/logic.py: không trích được STATUS_RULES');
  if (!imRules.length) drifts.push('scripts/import-csv.js: không trích được STATUS_RULES');
  compareRules(gsRules, pyRules, 'STATUS_RULES Code.gs ↔ api/logic.py', drifts);
  compareRules(gsRules, imRules, 'STATUS_RULES Code.gs ↔ scripts/import-csv.js', drifts);

  // ===== 3. STATUS_LABEL parity Code.gs ↔ api/logic.py =====
  const gsLabels = extractGasLabels(gs);
  const pyLabels = extractPyLabels(py);
  if (!gsLabels.size) drifts.push('Code.gs: không trích được STATUS_LABEL');
  if (!pyLabels.size) drifts.push('api/logic.py: không trích được STATUS_LABEL');
  compareLabels(gsLabels, pyLabels, 'STATUS_LABEL', drifts);

  return { ok: drifts.length === 0, drifts };
}

module.exports = { checkDrift, CORE_PAIRS };

if (require.main === module) {
  const res = checkDrift();
  if (res.ok) {
    console.log('Drift check OK — Code.gs ↔ api/logic.py ↔ scripts/import-csv.js đồng bộ');
    process.exit(0);
  }
  console.error('DRIFT PHÁT HIỆN (' + res.drifts.length + '):');
  for (const d of res.drifts) console.error('  - ' + d);
  process.exit(1);
}
