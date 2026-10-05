// import-csv.js — chuẩn hóa CSV "[HN2] Mất bill" về schema docs/db-schema.md.
//
// Usage:
//   node scripts/import-csv.js input.csv > items.clean.csv 2> report.json
//   cat input.csv | node scripts/import-csv.js > items.clean.csv 2> report.json
//
// Không dependency. Đọc từ file argv[2] hoặc stdin, ghi CSV sạch ra stdout,
// report JSON ra stderr. Logic thuần trong normalizeRow() để WebApp (.gs) reuse.

const fs = require('fs');

// SSOT map trạng thái (docs/db-schema.md §3) — WebApp copy bảng này, không tự bịa thêm.
// So khớp trên text đã strip dấu (tránh bug regex unicode + /i không /u).
const strip = s => (s || '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'D').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const STATUS_RULES = [
  [/tieu huy|da vut|hu hong.*(vut|huy)|chay nuoc.*tieu/, 'tieu_huy'],
  [/tim thay bill|tim duoc.*bill|da tim.*bill/, 'da_tim_bill'],
  [/thanh l|thanhblys|thanhys/, 'thanh_ly'],
  [/cho di|giao.*theo|da cho di|di theo|spxvn[0-9a-z]+|luan chuyen|done|bu hang|hold tai/, 'da_cho_di'],
];

function canonicalStatus(raw) {
  const t = strip(raw).trim();
  if (!t) return 'chua_xu_ly';
  for (const [re, st] of STATUS_RULES) if (re.test(t)) return st;
  return 'chua_xu_ly';
}

function canonicalKind(code, rawKind) {
  const c = (code || '').trim().toUpperCase();
  if (c.startsWith('BOX') || c.startsWith('TTC')) return 'Box';
  if (c.startsWith('ITEM')) return 'Item';
  const k = (rawKind || '').trim().toLowerCase();
  return k === 'box' ? 'Box' : 'Item';
}

function extractCodes(text, re) {
  const m = String(text || '').toUpperCase().match(re);
  return m ? [...new Set(m)] : [];
}

// Parser CSV tối thiểu đúng RFC4180 (quote + comma + dòng xuống trong quote).
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch === '\r') { /* skip, LF xử lý ở \n */ }
    else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const OUT_HEADER = ['code', 'created_at', 'description', 'kind', 'photo_path_outer',
  'photo_path_product', 'status', 'status_note', 'mvdn', 'trip', 'reporter', 'note'];

function normalizeRow(cols) {
  const p = i => (cols[i] || '').trim();
  const code = p(1);
  const rawHandle = p(8), rawUpdate = p(9);
  const combined = (rawHandle + ' ' + rawUpdate).trim();
  const status = canonicalStatus(rawUpdate || rawHandle);
  const mvdn = extractCodes(combined, /SPXVN[0-9A-Z]+/g);
  const trip = extractCodes(combined + ' ' + p(2), /LT0Q[0-9A-Z]+/g);
  const notes = [];
  if (mvdn.length > 1) notes.push('nhieu MVDN: ' + mvdn.join(','));
  if (!/^(BOX|ITEM|TTC)\./i.test(code) && code) notes.push('ma la: ' + code);
  if ((p(3) || '').toLowerCase() === 'box' && /^ITEM/i.test(code)) notes.push('loai goc la Box, chuan hoa theo prefix');
  if ((p(3) || '').toLowerCase() === 'item' && /^(BOX|TTC)/i.test(code)) notes.push('loai goc la Item, chuan hoa theo prefix');
  return {
    code, created_at: p(0), description: p(2),
    kind: canonicalKind(code, p(3)),
    photo_path_outer: p(4), photo_path_product: p(5),
    status, status_note: rawHandle,
    mvdn: mvdn[0] || '', trip: trip.join(','), reporter: p(10), note: notes.join('; '),
  };
}

function run(input) {
  const rows = parseCsv(input);
  const data = rows.filter(r => strip(r[1] || '').indexOf('ma san pham') !== 0);
  const out = [OUT_HEADER.join(',')];
  const stats = { total: 0, by_status: {}, kind_mismatch: 0, weird_code: 0, multi_mvdn: 0 };
  for (const r of data) {
    if (!r[1] || !r[1].trim()) continue;
    const n = normalizeRow(r);
    stats.total++;
    stats.by_status[n.status] = (stats.by_status[n.status] || 0) + 1;
    if (/loai goc/.test(n.note)) stats.kind_mismatch++;
    if (/ma la/.test(n.note)) stats.weird_code++;
    if (/nhieu MVDN/.test(n.note)) stats.multi_mvdn++;
    out.push(OUT_HEADER.map(h => csvCell(n[h])).join(','));
  }
  return { csv: out.join('\n') + '\n', stats };
}

if (require.main === module) {
  const input = process.argv[2]
    ? fs.readFileSync(process.argv[2], 'utf8')
    : fs.readFileSync(0, 'utf8');
  const { csv, stats } = run(input);
  process.stdout.write(csv);
  process.stderr.write(JSON.stringify(stats, null, 2) + '\n');
}

module.exports = { parseCsv, normalizeRow, canonicalStatus, canonicalKind, run, STATUS_RULES };
