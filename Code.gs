/**
 * Code.gs — SPX Exception Handling WebApp.
 * DB: Google Sheets (Items/Photos/ActivityLog) + Drive ảnh.
 * Schema: docs/db-schema.md. SSOT status: scripts/import-csv.js STATUS_RULES.
 */

var TZ = 'Asia/Ho_Chi_Minh';
var PROP_SHEET = 'SPREADSHEET_ID';
var PROP_FOLDER = 'FOLDER_ID';
var PROP_ADMINS = 'ADMIN_EMAILS';
var USERS_HEADER = ['email', 'role', 'added_at', 'added_by'];
var LIST_LIMIT = 150; // listItems/listFull chỉ đọc tối đa 150 dòng đầu (đơn mới insert ở dòng 2)
var TAIL_ROWS = 3000; // list paths chỉ đọc tail Photos/Log (anh/log cua head-150 nam o cuoi do append)

var ITEMS_HEADER = ['code', 'created_at', 'description', 'kind', 'photo_path_outer',
  'photo_path_product', 'status', 'status_note', 'mvdn', 'trip', 'reporter', 'note'];
var PHOTOS_HEADER = ['code', 'slot', 'drive_file_id', 'uploaded_at'];
var LOG_HEADER = ['at', 'code', 'from_status', 'to_status', 'by', 'note', 'reason'];
var PRINTED_HEADER = ['code', 'printed_at', 'printed_by', 'kind'];

// KHỚP import: scripts/import-csv.js STATUS_RULES (copy, không tự bịa thêm).
var STATUS_RULES = [
  [/tieu huy|da vut|hu hong.*(vut|huy)|chay nuoc.*tieu/, 'tieu_huy'],
  [/tim thay bill|tim duoc.*bill|da tim.*bill/, 'da_tim_bill'],
  [/thanh l|thanhblys|thanhys/, 'thanh_ly'],
  [/cho di|giao.*theo|da cho di|di theo|spxvn[0-9a-z]+|luan chuyen|done|bu hang|hold tai/, 'da_cho_di']
];
var STATUS_LABEL = {
  chua_xu_ly: 'Lưu kho', da_tim_bill: 'Resolve', da_cho_di: 'Đã cho đi',
  thanh_ly: 'Thanh Lý', tieu_huy: 'Tiêu hủy'
};

function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate()
    .setTitle('SPX Exception Handling')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function ok(data) { return { ok: true, data: data }; }
function fail(msg) { return { ok: false, error: msg }; }

function nowStr_() {
  return Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss');
}

function todayPart_() {
  return Utilities.formatDate(new Date(), TZ, 'dd-MM-yyyy');
}

function currentEmail_() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; }
}

function strip_(s) {
  return String(s || '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'D')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function canonicalStatus_(raw) {
  var t = strip_(raw).trim();
  if (!t) return 'chua_xu_ly';
  for (var i = 0; i < STATUS_RULES.length; i++) {
    if (STATUS_RULES[i][0].test(t)) return STATUS_RULES[i][1];
  }
  return 'chua_xu_ly';
}

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP_SHEET);
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Chưa cấu hình SPREADSHEET_ID (Apps Script > Project settings > Script properties).');
  return ss;
}

var SS_ = null;
function ss_() {
  if (!SS_) SS_ = getSpreadsheet_();
  return SS_;
}

function getSheet_(name, header) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, header.length).setValues([header]);
  }
  return sh;
}

function cellText_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'dd/MM/yyyy HH:mm:ss');
  return v === null || v === undefined ? '' : String(v);
}

function rowsToItems_(rows) {
  return rows.map(function (r) {
    var o = {};
    for (var i = 0; i < ITEMS_HEADER.length; i++) o[ITEMS_HEADER[i]] = cellText_(r[i]);
    return o;
  });
}

function toClient_(o, days, extras) {
  return {
    code: o.code, kind: o.kind, createdAt: o.created_at, createdBy: o.reporter,
    imgOuter: thumbUrl_(o.photo_path_outer), imgProduct: thumbUrl_(o.photo_path_product),
    description: o.description, note: o.note, status: o.status || 'chua_xu_ly',
    statusLabel: STATUS_LABEL[o.status] || STATUS_LABEL.chua_xu_ly,
    bill: o.mvdn, days: days == null ? storageDays_(o.created_at, o.code) : days,
    extras: extras || []
  };
}

function driveIdFromUrl_(v) {
  var m = String(v || '').match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  m = String(v || '').match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : '';
}

// SSOT tach Drive file ID: ID tran giu nguyen, link drive boc ID ra, rac tra ''.
// Dung chung cho allowlist (photoIds_) + reshare (fixPhotoSharing) de khong lech.
function fileIdOf_(v) {
  var t = String(v || '').trim();
  if (/^[a-zA-Z0-9_-]{10,}$/.test(t)) return t;
  return driveIdFromUrl_(t);
}

function thumbUrl_(v) {
  v = String(v || '').trim();
  if (!v) return '';
  if (/^[a-zA-Z0-9_-]{10,}$/.test(v)) return 'https://drive.google.com/thumbnail?id=' + v + '&sz=w400';
  var id = driveIdFromUrl_(v);
  if (id) return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w400';
  if (/^https?:/.test(v)) return v;
  return '';
}

// Kiem quyen anh theo CAY folder FOLDER_ID — O(1) Drive API, KHONG doc sheet.
// photoIds_ doc full Photos + Items MOI lan kiem 1 anh (~60k o/call o 20k dong).
// File do create_/adminEditItem tao deu qua monthFolder_() → nam duoi FOLDER_ID.
// KHONG fallback sang photoIds_() (fallback = quet full = DoS chinh minh).
function inPhotoFolder_(fileId) {
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(String(fileId || ''))) return false;
  var ck = 'phok_' + fileId;
  try {
    var hit = CacheService.getScriptCache().get(ck);
    if (hit === '1') return true;
    if (hit === '0') return false;
  } catch (e0) {}
  var rootId = String(PropertiesService.getScriptProperties().getProperty(PROP_FOLDER) || '').trim();
  if (!rootId) return false;
  var f;
  try { f = DriveApp.getFileById(fileId); } catch (e1) { return false; }
  var ok = false;
  try {
    var it = f.getParents(), d1 = 0;
    while (it.hasNext() && d1 < 3) {
      var p = it.next();
      if (p.getId() === rootId) { ok = true; break; }
      var gp = p.getParents(), d2 = 0;
      while (gp.hasNext() && d2 < 3) {
        if (gp.next().getId() === rootId) { ok = true; break; }
        d2++;
      }
      if (ok) break;
      d1++;
    }
  } catch (e2) { Logger.log(e2); return false; }
  try { CacheService.getScriptCache().put(ck, ok ? '1' : '0', 21600); } catch (e3) {}
  return ok;
}

function photoIds_() {
  var ids = {};
  var phSh = getSheet_('Photos', PHOTOS_HEADER);
  var phLast = phSh.getLastRow();
  if (phLast >= 2) {
    var colC = phSh.getRange(2, 3, phLast - 1, 1).getValues();
    for (var i = 0; i < colC.length; i++) {
      var pid = fileIdOf_(colC[i][0]);
      if (pid) ids[pid] = true;
    }
  }
  var ish = getSheet_('Items', ITEMS_HEADER);
  var ilast = ish.getLastRow();
  if (ilast >= 2) {
    var icols = ish.getRange(2, 5, ilast - 1, 2).getValues();
    for (var j = 0; j < icols.length; j++) {
      var cols = [icols[j][0], icols[j][1]];
      for (var k = 0; k < cols.length; k++) {
        var cid = fileIdOf_(cols[k]);
        if (cid) ids[cid] = true;
      }
    }
  }
  return ids;
}

function getPhoto(fileId) {
  try {
    fileId = String(fileId || '').trim();
    if (!/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) return fail('Ảnh không hợp lệ.');
    if (!inPhotoFolder_(fileId)) return fail('Không xem được ảnh.');
    var blob = DriveApp.getFileById(fileId).getBlob();
    var ct = String(blob.getContentType() || '');
    if (ct.indexOf('image/') !== 0) return fail('Không xem được ảnh.');
    var bytes = blob.getBytes();
    if (bytes.length > 8 * 1024 * 1024) return fail('Ảnh quá lớn.');
    return ok({ mime: ct, b64: Utilities.base64Encode(bytes) });
  } catch (e) { Logger.log(e); return fail('Không xem được ảnh.'); }
}

// Fallback NHANH cho <img> thumbnail direct: tra base64 thumb nho thay vi full anh.
// Server tu tao file nen OAuth token cua script du quyen doc.
function getThumb(fileId, size) {
  try {
    fileId = String(fileId || '').trim();
    if (!/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) return fail('Ảnh không hợp lệ.');
    if (!inPhotoFolder_(fileId)) return fail('Không xem được ảnh.');
    var sz = Math.min(Math.max(parseInt(size, 10) || 800, 200), 1200);
    var resp = UrlFetchApp.fetch('https://drive.google.com/thumbnail?id=' + fileId + '&sz=w' + sz, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) return fail('Không tải được ảnh.');
    var blob = resp.getBlob();
    if (String(blob.getContentType() || '').indexOf('image/') !== 0) return fail('Không tải được ảnh.');
    var bytes = blob.getBytes();
    if (!bytes.length || bytes.length > 2 * 1024 * 1024) return fail('Không tải được ảnh.');
    return ok({ mime: String(blob.getContentType() || 'image/jpeg'), b64: Utilities.base64Encode(bytes) });
  } catch (e) { Logger.log(e); return fail('Không tải được ảnh.'); }
}

// Prefetch batch: 1 call lay nhieu thumb cho anh hien tren man hinh + anh trong chi tiet.
// Loi 1 anh khong fail ca lo; client giu URL goc cho anh loi.
function getThumbs(ids, size) {
  try {
    var seen = {}, list = [];
    (ids || []).forEach(function (v) {
      var id = String(v || '').trim();
      if (/^[a-zA-Z0-9_-]{10,}$/.test(id) && !seen[id]) { seen[id] = true; list.push(id); }
    });
    list = list.slice(0, 24);
    if (!list.length) return fail('Thiếu danh sách ảnh.');
    var sz = Math.min(Math.max(parseInt(size, 10) || 400, 200), 800);
    var token = ScriptApp.getOAuthToken();
    var out = {};
    for (var i = 0; i < list.length; i++) {
      var fid = list[i];
      if (!inPhotoFolder_(fid)) { out[fid] = { error: 'Không xem được ảnh.' }; continue; }
      try {
        var resp = UrlFetchApp.fetch('https://drive.google.com/thumbnail?id=' + fid + '&sz=w' + sz, {
          headers: { Authorization: 'Bearer ' + token },
          muteHttpExceptions: true
        });
        if (resp.getResponseCode() !== 200) { out[fid] = { error: 'Không tải được ảnh.' }; continue; }
        var blob = resp.getBlob();
        if (String(blob.getContentType() || '').indexOf('image/') !== 0) { out[fid] = { error: 'Không tải được ảnh.' }; continue; }
        var bytes = blob.getBytes();
        if (!bytes.length || bytes.length > 2 * 1024 * 1024) { out[fid] = { error: 'Không tải được ảnh.' }; continue; }
        out[fid] = { mime: String(blob.getContentType() || 'image/jpeg'), b64: Utilities.base64Encode(bytes) };
      } catch (e1) { out[fid] = { error: 'Không tải được ảnh.' }; }
    }
    return ok({ size: sz, items: out });
  } catch (e) { Logger.log(e); return fail('Không tải được ảnh.'); }
}

function parseCreated_(s) {
  var m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}

function codeDate_(code) {
  var m = String(code || '').match(/^(?:Box|Item)\.(\d{2})-(\d{2})-(\d{4})\./);
  if (m) return { y: +m[3], m: +m[2], d: +m[1] };
  var o = String(code || '').match(/^(?:BOX|ITEM|TTC)\.(\d{2})(\d{2})(\d{4})\./i);
  if (o) return { y: +o[3], m: +o[2], d: +o[1] };
  return null;
}
function validYMD_(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  var t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
}
function parseCreatedSmart_(s, code) {
  var m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  var hh = +(m[4] || 0), mi = +(m[5] || 0), ss = +(m[6] || 0);
  var vn = validYMD_(+m[3], +m[2], +m[1]) ? new Date(+m[3], +m[2] - 1, +m[1], hh, mi, ss) : null;
  var us = validYMD_(+m[3], +m[1], +m[2]) ? new Date(+m[3], +m[1] - 1, +m[2], hh, mi, ss) : null;
  var cd = codeDate_(code);
  if (cd) {
    if (vn && vn.getFullYear() === cd.y && vn.getMonth() === cd.m - 1 && vn.getDate() === cd.d) return vn;
    if (us && us.getFullYear() === cd.y && us.getMonth() === cd.m - 1 && us.getDate() === cd.d) return us;
  }
  return vn || us;
}
function normAt_(at, code) {
  var d = parseCreatedSmart_(at, code);
  if (!d) return String(at || '');
  return Utilities.formatDate(d, TZ, 'dd/MM/yyyy HH:mm:ss');
}
function textDate_(v) {
  var s = cellText_(v);
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return "'" + s;
  return s;
}
function storageDays_(createdAt, code) {
  var d = parseCreatedSmart_(createdAt, code);
  if (!d) return 0;
  var ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

// Chi cot A (code) de tinh seq/check trung/tim dong — re hon full read.
function readItemCodes_() {
  var sh = getSheet_('Items', ITEMS_HEADER);
  var last = sh.getLastRow();
  if (last < 2) return { sh: sh, codes: [] };
  var codes = sh.getRange(2, 1, last - 1, 1).getValues()
    .map(function (x) { return String(x[0] || ''); }).filter(Boolean);
  return { sh: sh, codes: codes };
}

// Tim dong sheet (2-based) cua 1 ma bang quet cot A — tra row=-1 neu khong thay.
function findItemRow_(code) {
  code = String(code || '').trim();
  var sh = getSheet_('Items', ITEMS_HEADER);
  if (!code) return { sh: sh, row: -1 };
  var last = sh.getLastRow();
  if (last >= 2) {
    try {
      // TextFinder tren cot A co gioi han dong (range unbounded gay Service error >10k dong).
      // Re hon doc full cot A roi loop JS o 20k dong.
      var found = sh.getRange(2, 1, last - 1, 1).createTextFinder(code)
        .matchEntireCell(true).matchCase(true).findNext();
      if (found) return { sh: sh, row: found.getRow() };
    } catch (e) { Logger.log(e); }
  }
  var rc = readItemCodes_();
  for (var i = 0; i < rc.codes.length; i++) {
    if (rc.codes[i] === code) return { sh: rc.sh, row: i + 2 };
  }
  return { sh: rc.sh, row: -1 };
}

function readAllItems_() {
  var sh = getSheet_('Items', ITEMS_HEADER);
  var last = sh.getLastRow();
  if (last < 2) return { sh: sh, items: [] };
  var vals = sh.getRange(2, 1, last - 1, ITEMS_HEADER.length).getValues();
  return { sh: sh, items: rowsToItems_(vals) };
}

function readHeadItems_(maxRows, offset) {
  var sh = getSheet_('Items', ITEMS_HEADER);
  var last = sh.getLastRow();
  if (last < 2) return { sh: sh, items: [] };
  var off = Math.max(0, offset || 0);
  if (off >= last - 1) return { sh: sh, items: [] };
  var n = Math.min(last - 1 - off, Math.max(1, maxRows || LIST_LIMIT));
  var vals = sh.getRange(2 + off, 1, n, ITEMS_HEADER.length).getValues();
  return { sh: sh, items: rowsToItems_(vals) };
}

function firstExtraMap_(codes) {
  var want = {};
  for (var i = 0; i < codes.length; i++) want[codes[i]] = true;
  var map = {};
  function pick(code, slot, fileId) {
    if (map[code]) return;
    if (slot === 'ngoai_quan' || slot === 'san_pham') return;
    var url = thumbUrl_(fileId);
    if (url) map[code] = url;
  }
  var grouped = photosForCodes_(want);
  if (grouped) {
    for (var k in grouped) {
      for (var i = 0; i < grouped[k].length; i++) pick(k, grouped[k][i].slot, grouped[k][i].fileId);
    }
    return map;
  }
  var strict = photosForCodesStrict_(want);
  if (strict) {
    for (var s in strict) {
      for (var t = 0; t < strict[s].length; t++) pick(s, strict[s][t].slot, strict[s][t].fileId);
    }
    return map;
  }
  var vals = readPhotosAll_();
  for (var j = 0; j < vals.length; j++) {
    var code = String(vals[j][0]);
    if (!want[code]) continue;
    pick(code, String(vals[j][1]), vals[j][2]);
  }
  return map;
}

function listItems(limit, offset) {
  try {
    var n = limit ? Math.min(limit, LIST_LIMIT) : LIST_LIMIT;
    var r = readHeadItems_(n, offset);
    var codes = r.items.map(function (o) { return o.code; });
    var exMap = firstExtraMap_(codes);
    var out = r.items.map(function (o) {
      var t = toClient_(o);
      if (exMap[o.code]) t.extras = [exMap[o.code]];
      return t;
    });
    out.sort(function (a, b) {
      var da = parseCreatedSmart_(a.createdAt, a.code), db = parseCreatedSmart_(b.createdAt, b.code);
      return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
    });
    if (limit && out.length > limit) out = out.slice(0, limit);
    return ok(out);
  } catch (e) { Logger.log(e); return fail('Không tải được danh sách: ' + e.message); }
}

function listFull(limit, offset) {
  try {
    var n = limit ? Math.min(limit, LIST_LIMIT) : LIST_LIMIT;
    var r = readHeadItems_(n, offset);
    var want = {};
    for (var w = 0; w < r.items.length; w++) want[r.items[w].code] = true;
    var phByCode = photosByCode_(want);
    var grp = logsForCodes_(want);
    var histByCode = {};
    if (grp) {
      histByCode = grp.byCode;
    } else {
      var log = readLogRows_();
      if (log.cols && log.cols.code >= 0) {
        for (var j = 0; j < log.rows.length; j++) {
          var hc = String(log.rows[j][log.cols.code] || '').trim();
          if (!want[hc]) continue;
          (histByCode[hc] = histByCode[hc] || []).push(logEntry_(log.rows[j], log.cols, hc));
        }
      }
    }
    var out = r.items.map(function (o) {
      var t = toClient_(o);
      applyPhotos_(t, phByCode[o.code] || []);
      return { item: t, history: histByCode[o.code] || [] };
    });
    out.sort(function (a, b) {
      var da = parseCreatedSmart_(a.item.createdAt, a.item.code), db = parseCreatedSmart_(b.item.createdAt, b.item.code);
      return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
    });
    if (limit && out.length > limit) out = out.slice(0, limit);
    return ok(out);
  } catch (e) { Logger.log(e); return fail('Không tải được dữ liệu: ' + e.message); }
}

function photosFor_(code) {
  var want = {};
  want[String(code)] = true;
  return photosByCode_(want)[String(code)] || [];
}

// Gom 1 lần đọc Photos theo code cho cả list lẫn getItem (batch, không loop sheet).
// Tim anh theo code bang TextFinder tren cot A BOUNDED + doc dong nho.
// Thay readPhotosAll_() o duong doc user (20k dong = full scan moi lan mo don cu).
// Cap 25 code/lan: vuot thi tra null de caller fallback full (hiem — tail-3000
// da cover head-150; strict chi chay cho don le ngoai tail).
function photosForCodesStrict_(want) {
  var keys = Object.keys(want || {});
  if (!keys.length) return {};
  if (keys.length > 25) return null;
  var sh = getSheet_('Photos', PHOTOS_HEADER);
  var last = sh.getLastRow();
  if (last < 2) return {};
  var out = {}, seen = {};
  try {
    for (var i = 0; i < keys.length; i++) {
      var code = String(keys[i]);
      var found = sh.getRange(2, 1, last - 1, 1).createTextFinder(code)
        .matchEntireCell(true).matchCase(true).findAll();
      for (var j = 0; j < found.length; j++) {
        var r = sh.getRange(found[j].getRow(), 1, 1, PHOTOS_HEADER.length).getValues()[0];
        if (String(r[0] || '').trim() !== code) continue;
        var k = code + '|' + r[1] + '|' + r[2];
        if (seen[k]) continue;
        seen[k] = true;
        (out[code] = out[code] || []).push({ slot: cellText_(r[1]), fileId: cellText_(r[2]) });
      }
    }
  } catch (e) { Logger.log(e); return null; }
  return out;
}

function photosByCode_(want) {
  var grouped = photosForCodes_(want);
  if (grouped) return grouped;
  var strict = photosForCodesStrict_(want);
  if (strict) return strict;
  var vals = readPhotosAll_();
  var map = {};
  for (var i = 0; i < vals.length; i++) {
    var code = String(vals[i][0] || '').trim();
    if (!want[code]) continue;
    (map[code] = map[code] || []).push({ slot: cellText_(vals[i][1]), fileId: cellText_(vals[i][2]) });
  }
  return map;
}

// Anh/log cua head-150 nam o vung tail (append cuoi) — doc bounded; thieu coverage
// (moi want-code phai co >=1 dong) thi tra null de caller fallback full read.
function readPhotosTail_(maxRows) {
  var sh = getSheet_('Photos', PHOTOS_HEADER);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var n = Math.min(last - 1, Math.max(1, maxRows || TAIL_ROWS));
  return sh.getRange(last - n + 1, 1, n, PHOTOS_HEADER.length).getValues();
}

function readLogTail_(maxRows) {
  var sh = getSheet_('ActivityLog', LOG_HEADER);
  var last = sh.getLastRow();
  if (last < 2) return { cols: null, rows: [] };
  var width = Math.max(sh.getLastColumn(), LOG_HEADER.length);
  var n = Math.min(last - 1, Math.max(1, maxRows || TAIL_ROWS));
  return { cols: logCols_(sh, width), rows: sh.getRange(last - n + 1, 1, n, width).getValues() };
}

function photosForCodes_(want) {
  var map = {}, seen = {};
  var vals = readPhotosTail_();
  for (var i = 0; i < vals.length; i++) {
    var code = String(vals[i][0] || '').trim();
    if (!want[code]) continue;
    seen[code] = true;
    (map[code] = map[code] || []).push({ slot: cellText_(vals[i][1]), fileId: cellText_(vals[i][2]) });
  }
  for (var k in want) {
    if (!seen[k]) return null;
  }
  return map;
}

function logsForCodes_(want) {
  var r = readLogTail_();
  if (!r.cols || r.cols.code < 0) return null;
  var byCode = {}, seen = {};
  for (var i = 0; i < r.rows.length; i++) {
    var hc = String(r.rows[i][r.cols.code] || '').trim();
    if (!want[hc]) continue;
    seen[hc] = true;
    (byCode[hc] = byCode[hc] || []).push(logEntry_(r.rows[i], r.cols, hc));
  }
  for (var k in want) {
    if (!seen[k]) return null;
  }
  return { cols: r.cols, byCode: byCode };
}

function applyPhotos_(item, photos) {
  item.slots = photos.map(function (p) { return { slot: p.slot, url: thumbUrl_(p.fileId) }; });
  item.extras = photos
    .filter(function (p) { return p.slot !== 'ngoai_quan' && p.slot !== 'san_pham'; })
    .map(function (p) { return thumbUrl_(p.fileId); })
    .filter(Boolean);
  return item;
}

// Cột ActivityLog resolve theo tên header (sheet có sẵn có thể lệch thứ tự).
function logCols_(sh, width) {
  var head = sh.getRange(1, 1, 1, width).getValues()[0]
    .map(function (h) { return String(h || '').trim().toLowerCase(); });
  function col(names) {
    for (var k = 0; k < names.length; k++) {
      var i = head.indexOf(names[k]);
      if (i >= 0) return i;
    }
    return -1;
  }
  return {
    code: col(['code']), at: col(['at']),
    from: col(['from_status', 'from']), to: col(['to_status', 'to']),
    by: col(['by']), note: col(['note']),
    reason: col(['reason', 'ly_do', 'lydo'])
  };
}

function logEntry_(row, c, code) {
  var from = c.from >= 0 ? String(row[c.from] || '') : '';
  var to = c.to >= 0 ? String(row[c.to] || '') : '';
  var note = c.note >= 0 ? String(row[c.note] || '') : '';
  return {
    at: c.at >= 0 ? normAt_(cellText_(row[c.at]), code) : '',
    code: code, from: from, to: to,
    by: c.by >= 0 ? String(row[c.by] || '') : '',
    note: note, bill: billOf_(from, to, note),
    reason: c.reason >= 0 ? String(row[c.reason] || '') : ''
  };
}

function readLogRows_() {
  var sh = getSheet_('ActivityLog', LOG_HEADER);
  var last = sh.getLastRow();
  if (last < 2) return { cols: null, rows: [] };
  var width = Math.max(sh.getLastColumn(), LOG_HEADER.length);
  return { cols: logCols_(sh, width), rows: sh.getRange(2, 1, last - 1, width).getValues() };
}

function historyFor_(code) {
  var r = readLogRows_();
  if (!r.cols || r.cols.code < 0) return [];
  var want = String(code || '').trim();
  var out = [];
  for (var i = 0; i < r.rows.length; i++) {
    if (String(r.rows[i][r.cols.code] || '').trim() !== want) continue;
    out.push(logEntry_(r.rows[i], r.cols, want));
  }
  return out;
}

function billOf_(from, to, note) {
  if (from !== to && (to === 'da_tim_bill' || to === 'thanh_ly')) return String(note || '');
  return '';
}

function getItem(code) {
  try {
    code = String(code || '').trim();
    if (!code) return fail('Thiếu mã đơn.');
    var f = findItemRow_(code);
    if (f.row < 0) return fail('Không Có');
    var vals = f.sh.getRange(f.row, 1, 1, ITEMS_HEADER.length).getValues();
    var it = applyPhotos_(toClient_(rowsToItems_(vals)[0]), photosFor_(code));
    return ok({ item: it, history: historyFor_(code) });
  } catch (e) { Logger.log(e); return fail('Không đọc được đơn: ' + e.message); }
}

function previewCode(kind) {
  try {
    var k = kind === 'Item' ? 'Item' : 'Box';
    var seq = nextSeqBothCodes_(readItemCodes_().codes, readPrintedCodes_(), k, todayPart_());
    return ok({ code: prefix_(k) + todayPart_() + '.' + seq, datePart: todayPart_(), seq: seq });
  } catch (e) { Logger.log(e); return fail(e.message); }
}

function previewBulkCodes(kind, count) {
  try {
    var k = kind === 'Item' ? 'Item' : 'Box';
    var n = Math.min(Math.max(parseInt(count, 10) || 10, 1), 10);
    return ok(withLock_(function () {
      var datePart = todayPart_();
      var start = nextSeqBothCodes_(readItemCodes_().codes, readPrintedCodes_(), k, datePart);
      var codes = [];
      for (var i = 0; i < n; i++) codes.push(prefix_(k) + datePart + '.' + (start + i));
      var at = nowStr_(), by = currentEmail_();
      var rows = codes.map(function (c) { return [c, "'" + at, by, k]; });
      var sh = getSheet_('PrintedCodes', PRINTED_HEADER);
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, PRINTED_HEADER.length).setValues(rows);
      return { codes: codes, kind: k };
    }));
  } catch (e) { Logger.log(e); return fail(e.message); }
}

function prefix_(kind) { return kind === 'Item' ? 'Item.' : 'Box.'; }

function seqNum_(code, prefix) {
  var c = String(code || '');
  if (c.indexOf(prefix) !== 0) return 0;
  var n = parseInt(c.slice(prefix.length), 10);
  return isNaN(n) ? 0 : n;
}

function readPrintedCodes_() {
  var sh = getSheet_('PrintedCodes', PRINTED_HEADER);
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 1).getValues()
    .map(function (r) { return String(r[0] || ''); })
    .filter(Boolean);
}

function nextSeqBothCodes_(codes, printed, kind, datePart) {
  var p = prefix_(kind) + datePart + '.';
  var best = 0;
  for (var i = 0; i < codes.length; i++) {
    var a = seqNum_(codes[i], p);
    if (a > best) best = a;
  }
  for (var j = 0; j < printed.length; j++) {
    var b = seqNum_(printed[j], p);
    if (b > best) best = b;
  }
  return best + 1;
}


function dataUrlToBlob_(dataUrl, name) {
  var m = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) throw new Error('Ảnh không đúng định dạng (cần JPG/PNG chụp từ máy).');
  var b64 = m[2].replace(/\s/g, '');
  if (b64.length > 8 * 1024 * 1024) throw new Error('Ảnh quá lớn, vui lòng chụp lại.');
  try {
    return Utilities.newBlob(Utilities.base64Decode(b64), m[1], name);
  } catch (e) {
    throw new Error('Không giải mã được ảnh chụp, vui lòng chụp lại.');
  }
}

var LASTSHAREERR_ = '';
function shareErrKind_(e) {
  var m = String((e && e.message) || e || '')
    .replace(/[\w.+-]+@[\w.-]+\.\w+/g, '[EMAIL]')
    .replace(/[A-Za-z0-9_-]{25,}/g, '[ID]')
    .replace(/\s+/g, ' ').trim();
  return (m || 'unknown').slice(0, 120);
}
// Folder FOLDER_ID da share DOMAIN 1 lan → file con ke thua. KHONG share PUBLIC.
function tryShareFile_(f) {
  LASTSHAREERR_ = '';
  try {
    f.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    return 'domain';
  } catch (e) { LASTSHAREERR_ = shareErrKind_(e); }
  return 'none';
}

function monthFolder_() {
  var rootId = String(PropertiesService.getScriptProperties().getProperty(PROP_FOLDER) || '').trim();
  if (!rootId) throw new Error('Thiếu FOLDER_ID trong Script Properties (nơi lưu ảnh).');
  var root;
  try {
    root = DriveApp.getFolderById(rootId);
  } catch (e) {
    throw new Error('FOLDER_ID không đúng (chỉ dán ID thư mục, không dán cả URL).');
  }
  var name = Utilities.formatDate(new Date(), TZ, 'yyyy-MM');
  try {
    var hit = CacheService.getScriptCache().get('folder_' + name);
    if (hit) return DriveApp.getFolderById(hit);
  } catch (e1) { /* fallback tra Drive */ }
  var it = root.getFoldersByName(name);
  var folder = it.hasNext() ? it.next() : root.createFolder(name);
  try { CacheService.getScriptCache().put('folder_' + name, folder.getId(), 21600); } catch (e2) {}
  return folder;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Hệ thống đang bận, thử lại sau.');
  try { return fn(); }
  finally { lock.releaseLock(); }
}

function create_(kind, p) {
  p = p || {};
  var custom = String(p.customCode || '').trim();
  if (custom) {
    if (!/^(Box|Item)\.\d{2}-\d{2}-\d{4}\.\d+$/.test(custom)) throw new Error('Mã sửa chưa đúng định dạng Box./Item. (ngày-tháng-năm.số).');
    if (custom.indexOf(prefix_(kind)) !== 0) throw new Error('Mã sửa phải bắt đầu bằng ' + prefix_(kind));
  }
  var desc = String(p.description || '').trim();
  if (!desc) throw new Error('Vui lòng nhập mô tả sản phẩm.');
  var outer = String(p.outer || '').trim();
  var product = String(p.product || '').trim();
  var extras = (p.extras || []).filter(Boolean);
  if (kind === 'Box' && !(outer && product)) throw new Error('Box cần đủ Ảnh ngoại quan + Ảnh sản phẩm.');
  if (kind === 'Item' && !product) throw new Error('Item cần Ảnh sản phẩm.');
  var count = (outer ? 1 : 0) + (product ? 1 : 0) + extras.length;
  if (!count) throw new Error('Cần ít nhất 1 ảnh mới Confirm được.');
  if (count > 3) throw new Error('Tối đa 3 ảnh.');

  return withLock_(function () {
    // Chi doc cot A de tinh seq + check trung — giam cells doc trong lock, van insert dau sheet.
    var rc = readItemCodes_();
    var sh = rc.sh, codes = rc.codes;
    var printedCodes = readPrintedCodes_();
    var datePart = todayPart_();
    var code = custom || (prefix_(kind) + datePart + '.' + nextSeqBothCodes_(codes, printedCodes, kind, datePart));
    if (custom) {
      if (codes.indexOf(custom) >= 0 || printedCodes.indexOf(custom) >= 0) throw new Error('Mã ' + custom + ' đã tồn tại — sửa mã khác.');
    }
    var at = nowStr_();
    var by = currentEmail_();
    var folder = monthFolder_();
    var jobs = [];
    if (outer) jobs.push(['ngoai_quan', outer]);
    if (product) jobs.push(['san_pham', product]);
    var usedExtra = 0;
    for (var e = 0; e < extras.length; e++) {
      usedExtra++;
      jobs.push(['bo_sung' + (usedExtra > 1 ? '_' + usedExtra : ''), extras[e]]);
    }
    var ids = {};
    var shareOk = true; // giu contract response; file ke thua share DOMAIN cua folder

    for (var s = 0; s < jobs.length; s++) {
      var f = folder.createFile(dataUrlToBlob_(jobs[s][1], code + '.' + jobs[s][0] + '.jpg'));
      ids[jobs[s][0]] = f.getId();
    }
    var outerId = ids['ngoai_quan'] || '', productId = ids['san_pham'] || '';

    var row = [code, "'" + at, desc, kind, outerId, productId, 'chua_xu_ly', '',
      '', '', by, String(p.note || '').trim()];
    sh.insertRowBefore(2);
    sh.getRange(2, 1, 1, row.length).setValues([row]);

    var ph = getSheet_('Photos', PHOTOS_HEADER);
    var phRows = jobs.map(function (j) { return [code, j[0], ids[j[0]], "'" + at]; });
    ph.getRange(ph.getLastRow() + 1, 1, phRows.length, PHOTOS_HEADER.length).setValues(phRows);

    getSheet_('ActivityLog', LOG_HEADER).appendRow(["'" + at, code, '', 'chua_xu_ly', by, 'Tạo mới', '']);
    var created = { code: code, created_at: at, description: desc, kind: kind, photo_path_outer: outerId, photo_path_product: productId, status: 'chua_xu_ly', status_note: '', mvdn: '', trip: '', reporter: by, note: String(p.note || '').trim() };
    return { code: code, shareOk: shareOk, item: toClient_(created) };
  });
}

function createBox(p) {
  try { return ok(create_('Box', p)); }
  catch (e) { Logger.log(e); return fail(e.message); }
}

function createItem(p) {
  try { return ok(create_('Item', p)); }
  catch (e) { Logger.log(e); return fail(e.message); }
}

function resolveItem(code, bill) {
  try {
    code = String(code || '').trim();
    bill = String(bill || '').trim();
    if (!code) return fail('Thiếu mã đơn.');
    if (!bill) return fail('Vui lòng nhập mã bill xử lý.');
    return ok(withLock_(function () {
      var f = findItemRow_(code);
      if (f.row < 0) throw new Error('Không Có');
      var it = rowsToItems_(f.sh.getRange(f.row, 1, 1, ITEMS_HEADER.length).getValues())[0];
      var cur = it.status || 'chua_xu_ly';
      if (cur === 'da_tim_bill') throw new Error('Đã Resolve');
      if (cur === 'thanh_ly') throw new Error('Đã Thanh Lý');
      if (cur !== 'chua_xu_ly') throw new Error('Trạng thái hiện tại: ' + (STATUS_LABEL[cur] || cur));

      var at = nowStr_();
      var by = currentEmail_();
      // G:I 1 lần ghi (status, giữ status_note, mvdn). Không đè reporter/created_at.
      f.sh.getRange(f.row, 7, 1, 3).setValues([['da_tim_bill', it.status_note || '', bill]]);
      getSheet_('ActivityLog', LOG_HEADER).appendRow(["'" + at, code, cur, 'da_tim_bill', by, bill, '']);
      return { code: code, status: 'da_tim_bill', at: at, by: by };
    }));
  } catch (e) { Logger.log(e); return fail(e.message); }
}

function liquidateBatch(codes, liqCode) {
  try {
    liqCode = String(liqCode || '').trim().toUpperCase();
    codes = (codes || []).map(function (c) { return String(c).trim(); }).filter(Boolean);
    if (!codes.length) return fail('Chưa scan mã nào.');
    if (!liqCode) return fail('Vui lòng nhập mã thanh lý.');
    if (!/SPXVN[0-9A-Z]+/.test(liqCode)) return fail('Mã thanh lý phải chứa SPXVN (vd SPXVN...).');
    return ok(withLock_(function () {
      var r = readAllItems_();
      var pos = {};
      for (var i = 0; i < r.items.length; i++) pos[r.items[i].code] = i;
      var bad = [];
      for (var j = 0; j < codes.length; j++) {
        var it = r.items[pos[codes[j]]];
        if (!it) bad.push(codes[j] + ': Không Có');
        else if ((it.status || 'chua_xu_ly') === 'thanh_ly') bad.push(codes[j] + ': Đã Thanh Lý');
        else if ((it.status || 'chua_xu_ly') === 'da_tim_bill') bad.push(codes[j] + ': Đã Resolve');
        else if ((it.status || 'chua_xu_ly') !== 'chua_xu_ly') bad.push(codes[j] + ': ' + it.status);
      }
      if (bad.length) throw new Error(bad.join('; '));

      var at = nowStr_();
      var by = currentEmail_();
      // Chi ghi dong matched (cot G:I), khong rewrite toan sheet.
      for (var k = 0; k < codes.length; k++) {
        var pi = pos[codes[k]];
        r.sh.getRange(pi + 2, 7, 1, 3).setValues([['thanh_ly', r.items[pi].status_note || '', liqCode]]);
      }
      var logRows = codes.map(function (cd) { return ["'" + at, cd, 'chua_xu_ly', 'thanh_ly', by, liqCode, '']; });
      var logSh = getSheet_('ActivityLog', LOG_HEADER);
      logSh.getRange(logSh.getLastRow() + 1, 1, logRows.length, LOG_HEADER.length).setValues(logRows);
      return { count: codes.length, at: at, by: by, liqCode: liqCode };
    }));
  } catch (e) { Logger.log(e); return fail(e.message); }
}

var RESHARE_BATCH = 200;
function fixPhotoSharing(resume) {
  try {
    requireAdmin_();
    var ids = {};
    var phSh = getSheet_('Photos', PHOTOS_HEADER);
    var phLast = phSh.getLastRow();
    if (phLast >= 2) {
      var colC = phSh.getRange(2, 3, phLast - 1, 1).getValues();
      for (var i = 0; i < colC.length; i++) {
        var id = fileIdOf_(colC[i][0]);
        if (id) ids[id] = true;
      }
    }
    var ish = getSheet_('Items', ITEMS_HEADER);
    var ilast = ish.getLastRow();
    if (ilast >= 2) {
      var icols = ish.getRange(2, 5, ilast - 1, 2).getValues();
      for (var j = 0; j < icols.length; j++) {
        var a = String(icols[j][0] || '').trim();
        var b = String(icols[j][1] || '').trim();
        var ia = fileIdOf_(a);
        var ib = fileIdOf_(b);
        if (ia) ids[ia] = true;
        if (ib) ids[ib] = true;
      }
    }
    var order = Object.keys(ids).sort();
    var props = PropertiesService.getScriptProperties();
    var acc = null;
    if (resume) {
      try { acc = JSON.parse(props.getProperty('reshare_state') || 'null'); } catch (eP) { acc = null; }
      if (!acc || acc.total !== order.length) acc = null;
    }
    if (!acc) acc = { i: 0, total: order.length, shared: 0, domainOnly: false, failed: [], unreadable: 0, blocked: 0, ownedByMe: 0, ownedByOthers: 0, unknownOwner: 0, errMap: {} };
    var me = deployerEmail_();
    function noteErr_(e) {
      var p = shareErrKind_(e) || 'unknown';
      acc.errMap[p] = (acc.errMap[p] || 0) + 1;
    }
    var batch = order.slice(acc.i, acc.i + RESHARE_BATCH);
    for (var b = 0; b < batch.length; b++) {
      var fid = batch[b];
      var f = null;
      try {
        f = DriveApp.getFileById(fid);
        var ow = '';
        try { ow = String(f.getOwner().getEmail() || ''); } catch (eOw) {}
        if (!me) acc.unknownOwner++;
        else if (ow && ow.toLowerCase() === String(me).toLowerCase()) acc.ownedByMe++;
        else acc.ownedByOthers++;
      } catch (e0) {
        acc.unreadable++;
        acc.failed.push(fid);
        continue;
      }
      try {
        var lv = tryShareFile_(f);
        if (lv === 'domain') acc.domainOnly = true;
        if (lv === 'none') { acc.blocked++; noteErr_(LASTSHAREERR_ || 'share-level none'); acc.failed.push(fid); continue; }
        acc.shared++;
      } catch (e1) {
        acc.blocked++;
        noteErr_(e1);
        acc.failed.push(fid);
      }
    }
    acc.i += batch.length;
    var done = acc.i >= order.length;
    if (acc.failed.length > 50) acc.failed = acc.failed.slice(0, 50);
    if (!done) props.setProperty('reshare_state', JSON.stringify(acc));
    else props.deleteProperty('reshare_state');
    var errTop = '', errTopN = 0;
    for (var p in acc.errMap) {
      if (acc.errMap[p] > errTopN) { errTopN = acc.errMap[p]; errTop = p; }
    }
    return ok({ total: acc.total, shared: acc.shared, failed: acc.failed, domainOnly: acc.domainOnly, unreadable: acc.unreadable, blocked: acc.blocked, ownedByMe: acc.ownedByMe, ownedByOthers: acc.ownedByOthers, unknownOwner: acc.unknownOwner, errTop: errTop, errTopN: errTopN, done: done, processed: acc.i });
  } catch (e) { Logger.log(e); return fail(e.message); }
}

function diagIdentity() {
  try {
    requireAdmin_();
    var out = {};
    try { out.active = Session.getActiveUser().getEmail() || '(trống)'; }
    catch (eA) { out.active = 'THROW'; }
    try { out.effective = Session.getEffectiveUser().getEmail() || '(trống)'; }
    catch (eE) { out.effective = 'THROW:' + shareErrKind_(eE); }
    var fid = '';
    var phSh = getSheet_('Photos', PHOTOS_HEADER);
    var phLast = phSh.getLastRow();
    if (phLast >= 2) {
      var colC = phSh.getRange(2, 3, phLast - 1, 1).getValues();
      for (var i = 0; i < colC.length && !fid; i++) fid = fileIdOf_(colC[i][0]);
    }
    if (!fid) {
      var ish = getSheet_('Items', ITEMS_HEADER);
      var ilast = ish.getLastRow();
      if (ilast >= 2) {
        var icols = ish.getRange(2, 5, ilast - 1, 2).getValues();
        for (var j = 0; j < icols.length && !fid; j++) fid = fileIdOf_(icols[j][0]) || fileIdOf_(icols[j][1]);
      }
    }
    if (!fid) {
      out.note = 'không có file ảnh nào trong sheet';
      return ok(out);
    }
    try {
      var f = DriveApp.getFileById(fid);
      try { out.owner = f.getOwner().getEmail() || '(trống)'; } catch (eO) { out.owner = 'THROW'; }
      try { out.sharing = String(f.getSharingAccess()); } catch (eS) { out.sharing = 'THROW'; }
    } catch (eF) {
      out.readErr = shareErrKind_(eF);
    }
    return ok(out);
  } catch (e) { Logger.log(e); return fail(e.message); }
}

// CHI dung du phong: audit/admin + tran cap strict (>25 code). Duong doc user
// (listFull/getItem) di tail-3000 roi photosForCodesStrict_, KHONG goi ham nay.
function readPhotosAll_() {
  var sh = getSheet_('Photos', PHOTOS_HEADER);
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, PHOTOS_HEADER.length).getValues();
}

function adminEditItem(p) {
  try {
    requireAdmin_();
    p = p || {};
    var code = String(p.code || '').trim();
    if (!code) return fail('Thiếu mã đơn.');
    var desc = (p.description == null) ? null : String(p.description).trim();
    var note = (p.note == null) ? null : String(p.note).trim();
    var delSlots = (p.deleteSlots || []).map(function (s) { return String(s); });
    var adds = (p.addPhotos || []).filter(Boolean);
    var toStatus = p.toStatus ? String(p.toStatus) : '';
    var bill = String(p.bill || '').trim();
    var reason = String(p.reason || '').trim();
    if (desc !== null && !desc) return fail('Vui lòng nhập mô tả sản phẩm.');
    if (adds.length > 3) return fail('Tối đa 3 ảnh.');
    if (toStatus && ['chua_xu_ly', 'da_tim_bill', 'thanh_ly'].indexOf(toStatus) < 0) return fail('Trạng thái không hợp lệ.');
    if ((toStatus === 'da_tim_bill' || toStatus === 'thanh_ly') && !bill) {
      return fail('Đổi sang ' + (STATUS_LABEL[toStatus] || toStatus) + ' phải điền mã bill.');
    }
    return ok(withLock_(function () {
      var f = findItemRow_(code);
      if (f.row < 0) throw new Error('Không Có');
      var it0 = rowsToItems_(f.sh.getRange(f.row, 1, 1, ITEMS_HEADER.length).getValues())[0];
      var cur = it0.status || 'chua_xu_ly';
      var kind = it0.kind === 'Item' ? 'Item' : 'Box';
      var need = (kind === 'Box') ? ['ngoai_quan', 'san_pham'] : ['san_pham'];
      var curPhotos = photosFor_(code);
      var keep = curPhotos.filter(function (x) { return delSlots.indexOf(String(x.slot)) < 0; });
      var total = keep.length + adds.length;
      if (total > 3) throw new Error('Tối đa 3 ảnh.');
      var have = {};
      keep.forEach(function (x) { have[String(x.slot)] = true; });
      var placed = [];
      for (var a = 0; a < adds.length; a++) {
        var slot = '';
        for (var q = 0; q < need.length; q++) {
          if (!have[need[q]]) { slot = need[q]; break; }
        }
        if (!slot) {
          var cands = ['bo_sung', 'bo_sung_1', 'bo_sung_2', 'bo_sung_3'];
          for (var t = 0; t < cands.length; t++) {
            if (!have[cands[t]]) { slot = cands[t]; break; }
          }
        }
        if (!slot) slot = 'bo_sung_' + Date.now();
        have[slot] = true;
        placed.push([slot, adds[a]]);
      }
      for (var v = 0; v < need.length; v++) {
        if (!have[need[v]]) {
          throw new Error(kind === 'Box' ? 'Box cần đủ Ảnh ngoại quan + Ảnh sản phẩm.' : 'Item cần Ảnh sản phẩm.');
        }
      }
      var editNotes = [];
      if (desc !== null && desc !== String(it0.description || '')) {
        editNotes.push('ADMIN Edit Mô tả: ' + String(it0.description || '') + ' => ' + desc);
      }
      if (note !== null && note !== String(it0.note || '')) {
        editNotes.push('ADMIN Edit Ghi chú: ' + String(it0.note || '') + ' => ' + note);
      }
      var photoChanged = (delSlots.length || placed.length) ? true : false;
      var row = f.row;
      if (desc !== null) f.sh.getRange(row, 3, 1, 1).setValues([[desc]]);
      if (note !== null) f.sh.getRange(row, 12, 1, 1).setValues([[note]]);
      if (delSlots.length) {
        var ph = getSheet_('Photos', PHOTOS_HEADER);
        var last = ph.getLastRow();
        if (last > 1) {
          var vals = ph.getRange(2, 1, last - 1, PHOTOS_HEADER.length).getValues();
          var left = vals.filter(function (v) {
            return !(String(v[0]) === String(code) && delSlots.indexOf(String(v[1])) >= 0);
          });
          ph.getRange(2, 1, last - 1, PHOTOS_HEADER.length).clearContent();
          if (left.length) ph.getRange(2, 1, left.length, PHOTOS_HEADER.length).setValues(left);
        }
      }
      var at = nowStr_(), by = currentEmail_();
      var outerId = '', productId = '';
      keep.forEach(function (x) {
        if (String(x.slot) === 'ngoai_quan') outerId = x.fileId;
        if (String(x.slot) === 'san_pham') productId = x.fileId;
      });
      if (placed.length) {
        var folder = monthFolder_();
        var newPh = [];
        for (var w = 0; w < placed.length; w++) {
          var f = folder.createFile(dataUrlToBlob_(placed[w][1], code + '.' + placed[w][0] + '.jpg'));
          newPh.push([code, placed[w][0], f.getId(), "'" + at]);
          if (placed[w][0] === 'ngoai_quan') outerId = f.getId();
          if (placed[w][0] === 'san_pham') productId = f.getId();
        }
        var ph2 = getSheet_('Photos', PHOTOS_HEADER);
        ph2.getRange(ph2.getLastRow() + 1, 1, newPh.length, PHOTOS_HEADER.length).setValues(newPh);
      }
      f.sh.getRange(row, 5, 1, 2).setValues([[outerId, productId]]);
      var finalSt = cur;
      var newLogs = [];
      if (toStatus && toStatus !== cur) {
        if (toStatus === 'chua_xu_ly') {
          f.sh.getRange(row, 7, 1, 1).setValues([[toStatus]]);
        } else {
          f.sh.getRange(row, 7, 1, 3).setValues([[toStatus, it0.status_note || '', bill]]);
        }
        newLogs.push(["'" + at, code, cur, toStatus, 'ADMIN đổi trạng thái', bill, reason]);
        finalSt = toStatus;
      }
      for (var n = 0; n < editNotes.length; n++) {
        newLogs.push(["'" + at, code, finalSt, finalSt, by, editNotes[n], '']);
      }
      if (photoChanged) {
        newLogs.push(["'" + at, code, finalSt, finalSt, by, 'ADMIN chỉnh sửa Ảnh', '']);
      }
      if (newLogs.length) {
        var logSh = getSheet_('ActivityLog', LOG_HEADER);
        logSh.getRange(logSh.getLastRow() + 1, 1, newLogs.length, LOG_HEADER.length).setValues(newLogs);
      }
      return { code: code };
    }));
  } catch (e) { Logger.log(e); return fail(e.message); }
}

function editItem(p) {
  try {
    p = p || {};
    var code = String(p.code || '').trim();
    if (!code) return fail('Thiếu mã đơn.');
    var desc = (p.description == null) ? null : String(p.description).trim();
    var note = (p.note == null) ? null : String(p.note).trim();
    if (desc !== null && !desc) return fail('Vui lòng nhập mô tả sản phẩm.');
    return ok(withLock_(function () {
      var f = findItemRow_(code);
      if (f.row < 0) throw new Error('Không Có');
      var it = rowsToItems_(f.sh.getRange(f.row, 1, 1, ITEMS_HEADER.length).getValues())[0];
      var cur = it.status || 'chua_xu_ly';
      var notes = [];
      if (desc !== null && desc !== String(it.description || '')) {
        notes.push('Edit Mô tả: ' + String(it.description || '') + ' => ' + desc);
      }
      if (note !== null && note !== String(it.note || '')) {
        notes.push('Edit Ghi chú: ' + String(it.note || '') + ' => ' + note);
      }
      if (!notes.length) throw new Error('Không có gì thay đổi.');
      var row = f.row;
      if (desc !== null) f.sh.getRange(row, 3, 1, 1).setValues([[desc]]);
      if (note !== null) f.sh.getRange(row, 12, 1, 1).setValues([[note]]);
      var at = nowStr_(), by = currentEmail_();
      var noteRows = notes.map(function (t) { return ["'" + at, code, cur, cur, by, t, '']; });
      var logSh = getSheet_('ActivityLog', LOG_HEADER);
      logSh.getRange(logSh.getLastRow() + 1, 1, noteRows.length, LOG_HEADER.length).setValues(noteRows);
      return { code: code };
    }));
  } catch (e) { Logger.log(e); return fail(e.message); }
}

function normEmail_(s) {
  return String(s || '').trim().toLowerCase();
}

function seedAdmins_() {
  var raw = PropertiesService.getScriptProperties().getProperty(PROP_ADMINS) || '';
  return raw.split(',').map(normEmail_).filter(Boolean);
}

function readUsers_() {
  var sh = getSheet_('Users', USERS_HEADER);
  var last = sh.getLastRow();
  if (last < 2) return { sh: sh, rows: [] };
  var vals = sh.getRange(2, 1, last - 1, USERS_HEADER.length).getValues();
  return { sh: sh, rows: vals };
}

function getRole_() {
  var me = normEmail_(currentEmail_());
  if (!me) return 'STAFF';
  var u = readUsers_();
  for (var i = 0; i < u.rows.length; i++) {
    if (normEmail_(u.rows[i][0]) === me) return u.rows[i][1] === 'ADMIN' ? 'ADMIN' : 'STAFF';
  }
  if (seedAdmins_().indexOf(me) >= 0) return 'ADMIN';
  return 'STAFF';
}

function requireAdmin_() {
  if (getRole_() !== 'ADMIN') throw new Error('Cần quyền ADMIN.');
}

function deployerEmail_() {
  try { return Session.getEffectiveUser().getEmail() || ''; } catch (e) { return ''; }
}

function me() {
  try { return ok({ email: currentEmail_(), role: getRole_(), deployer: deployerEmail_() }); }
  catch (e) { Logger.log(e); return fail(e.message); }
}

function listUsers() {
  try {
    requireAdmin_();
    var u = readUsers_();
    if (!u.rows.length) {
      var seeds = seedAdmins_();
      var at = nowStr_(), by = currentEmail_();
      for (var i = 0; i < seeds.length; i++) {
        u.sh.appendRow([seeds[i], 'ADMIN', "'" + at, by]);
        u.rows.push([seeds[i], 'ADMIN', at, by]);
      }
    }
    var out = u.rows.map(function (r) { return { email: cellText_(r[0]), role: cellText_(r[1]), addedAt: cellText_(r[2]), addedBy: cellText_(r[3]) }; });
    return ok(out);
  } catch (e) { Logger.log(e); return fail(e.message); }
}

function addAdmin(email) {
  try {
    requireAdmin_();
    email = normEmail_(email);
    if (!email || email.indexOf('@') < 0) throw new Error('Nhập email cần thêm.');
    return ok(withLock_(function () {
      var u = readUsers_();
      for (var i = 0; i < u.rows.length; i++) {
        if (normEmail_(u.rows[i][0]) === email) throw new Error('Email đã có trong danh sách.');
      }
      u.sh.appendRow([email, 'ADMIN', "'" + nowStr_(), currentEmail_()]);
      return { email: email, role: 'ADMIN' };
    }));
  } catch (e) { Logger.log(e); return fail(e.message); }
}

function deleteUser(email) {
  try {
    requireAdmin_();
    email = normEmail_(email);
    if (!email) throw new Error('Thiếu email.');
    if (normEmail_(currentEmail_()) === email) throw new Error('Không tự xóa chính mình.');
    return ok(withLock_(function () {
      var u = readUsers_();
      var idx = -1, admins = 0;
      for (var i = 0; i < u.rows.length; i++) {
        if (u.rows[i][1] === 'ADMIN') admins++;
        if (normEmail_(u.rows[i][0]) === email) idx = i;
      }
      if (idx < 0) throw new Error('Email không có trong danh sách.');
      if (u.rows[idx][1] === 'ADMIN' && admins <= 1) throw new Error('Không thể xóa ADMIN cuối cùng.');
      var last = u.sh.getLastRow();
      var vals = u.sh.getRange(2, 1, last - 1, USERS_HEADER.length).getValues();
      vals.splice(idx, 1);
      for (var q = 0; q < vals.length; q++) vals[q][2] = textDate_(vals[q][2]);
      u.sh.getRange(2, 1, last - 1, USERS_HEADER.length).clearContent();
      if (vals.length) u.sh.getRange(2, 1, vals.length, USERS_HEADER.length).setValues(vals);
      return { email: email };
    }));
  } catch (e) { Logger.log(e); return fail(e.message); }
}
