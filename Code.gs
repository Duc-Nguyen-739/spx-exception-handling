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
var LIST_LIMIT = 100; // listItems chỉ đọc tối đa 100 dòng đầu (đơn mới insert ở dòng 2)

var ITEMS_HEADER = ['code', 'created_at', 'description', 'kind', 'photo_path_outer',
  'photo_path_product', 'status', 'status_note', 'mvdn', 'trip', 'reporter', 'note'];
var PHOTOS_HEADER = ['code', 'slot', 'drive_file_id', 'uploaded_at'];
var LOG_HEADER = ['at', 'code', 'from_status', 'to_status', 'by', 'note'];

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

function getSheet_(name, header) {
  var ss = getSpreadsheet_();
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
    bill: o.mvdn, days: days == null ? storageDays_(o.created_at) : days,
    extras: extras || []
  };
}

function driveIdFromUrl_(v) {
  var m = String(v || '').match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  m = String(v || '').match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : '';
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

function photoIds_() {
  var ids = {};
  var ph = readPhotosAll_();
  for (var i = 0; i < ph.length; i++) {
    var pid = String(ph[i][2] || '').trim() || driveIdFromUrl_(ph[i][2]);
    if (pid) ids[pid] = true;
  }
  var r = readAllItems_();
  for (var j = 0; j < r.items.length; j++) {
    var cols = [r.items[j].photo_path_outer, r.items[j].photo_path_product];
    for (var k = 0; k < cols.length; k++) {
      var t = String(cols[k] || '').trim();
      var cid = (/^[a-zA-Z0-9_-]{10,}$/.test(t) ? t : driveIdFromUrl_(t));
      if (cid) ids[cid] = true;
    }
  }
  return ids;
}

function getPhoto(fileId) {
  try {
    fileId = String(fileId || '').trim();
    if (!/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) return fail('Ảnh không hợp lệ.');
    if (!photoIds_()[fileId]) return fail('Không xem được ảnh.');
    var blob = DriveApp.getFileById(fileId).getBlob();
    var ct = String(blob.getContentType() || '');
    if (ct.indexOf('image/') !== 0) return fail('Không xem được ảnh.');
    var bytes = blob.getBytes();
    if (bytes.length > 8 * 1024 * 1024) return fail('Ảnh quá lớn.');
    return ok({ mime: ct, b64: Utilities.base64Encode(bytes) });
  } catch (e) { Logger.log(e); return fail('Không xem được ảnh.'); }
}

function parseCreated_(s) {
  var m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}

function storageDays_(createdAt) {
  var d = parseCreated_(createdAt);
  if (!d) return 0;
  var ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

function readAllItems_() {
  var sh = getSheet_('Items', ITEMS_HEADER);
  var last = sh.getLastRow();
  if (last < 2) return { sh: sh, items: [] };
  var vals = sh.getRange(2, 1, last - 1, ITEMS_HEADER.length).getValues();
  return { sh: sh, items: rowsToItems_(vals) };
}

function readHeadItems_(maxRows) {
  var sh = getSheet_('Items', ITEMS_HEADER);
  var last = sh.getLastRow();
  if (last < 2) return { sh: sh, items: [] };
  var n = Math.min(last - 1, Math.max(1, maxRows || LIST_LIMIT));
  var vals = sh.getRange(2, 1, n, ITEMS_HEADER.length).getValues();
  return { sh: sh, items: rowsToItems_(vals) };
}

function firstExtraMap_(codes) {
  var want = {};
  for (var i = 0; i < codes.length; i++) want[codes[i]] = true;
  var map = {};
  var vals = readPhotosAll_();
  for (var j = 0; j < vals.length; j++) {
    var code = String(vals[j][0]);
    if (!want[code] || map[code]) continue;
    var slot = String(vals[j][1]);
    if (slot === 'ngoai_quan' || slot === 'san_pham') continue;
    var url = thumbUrl_(vals[j][2]);
    if (url) map[code] = url;
  }
  return map;
}

function listItems(limit) {
  try {
    var n = limit ? Math.min(limit, LIST_LIMIT) : LIST_LIMIT;
    var r = readHeadItems_(n);
    var codes = r.items.map(function (o) { return o.code; });
    var exMap = firstExtraMap_(codes);
    var out = r.items.map(function (o) {
      var t = toClient_(o);
      if (exMap[o.code]) t.extras = [exMap[o.code]];
      return t;
    });
    out.sort(function (a, b) {
      var da = parseCreated_(a.createdAt), db = parseCreated_(b.createdAt);
      return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
    });
    if (limit && out.length > limit) out = out.slice(0, limit);
    return ok(out);
  } catch (e) { Logger.log(e); return fail('Không tải được danh sách: ' + e.message); }
}

function photosFor_(code) {
  var sh = getSheet_('Photos', PHOTOS_HEADER);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, PHOTOS_HEADER.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(code)) {
      out.push({ slot: cellText_(vals[i][1]), fileId: cellText_(vals[i][2]) });
    }
  }
  return out;
}

function extrasFor_(code) {
  return photosFor_(code)
    .filter(function (p) { return p.slot !== 'ngoai_quan' && p.slot !== 'san_pham'; })
    .map(function (p) { return thumbUrl_(p.fileId); })
    .filter(Boolean);
}

function historyFor_(code) {
  var sh = getSheet_('ActivityLog', LOG_HEADER);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var width = Math.max(sh.getLastColumn(), LOG_HEADER.length);
  var head = sh.getRange(1, 1, 1, width).getValues()[0]
    .map(function (h) { return String(h || '').trim().toLowerCase(); });
  function col(names) {
    for (var k = 0; k < names.length; k++) {
      var i = head.indexOf(names[k]);
      if (i >= 0) return i;
    }
    return -1;
  }
  var iCode = col(['code']);
  if (iCode < 0) return [];
  var iAt = col(['at']), iFrom = col(['from_status', 'from']), iTo = col(['to_status', 'to']);
  var iBy = col(['by']), iNote = col(['note']);
  var want = String(code || '').trim();
  var vals = sh.getRange(2, 1, last - 1, width).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][iCode] || '').trim() !== want) continue;
    out.push({
      at: iAt >= 0 ? cellText_(vals[i][iAt]) : '',
      code: want,
      from: iFrom >= 0 ? String(vals[i][iFrom] || '') : '',
      to: iTo >= 0 ? String(vals[i][iTo] || '') : '',
      by: iBy >= 0 ? String(vals[i][iBy] || '') : '',
      note: iNote >= 0 ? String(vals[i][iNote] || '') : ''
    });
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
    var r = readAllItems_();
    for (var i = 0; i < r.items.length; i++) {
      if (r.items[i].code === code) {
        var it = toClient_(r.items[i]);
        it.extras = extrasFor_(code);
        it.slots = photosFor_(code).map(function (p) { return { slot: p.slot, url: thumbUrl_(p.fileId) }; });
        var hist = historyFor_(code).map(function (x) {
          x.bill = billOf_(x.from, x.to, x.note);
          return x;
        });
        return ok({ item: it, history: hist });
      }
    }
    return fail('Không Có');
  } catch (e) { Logger.log(e); return fail('Không đọc được đơn: ' + e.message); }
}

function previewCode(kind) {
  try {
    var k = kind === 'Item' ? 'Item' : 'Box';
    var r = readAllItems_();
    var seq = nextSeq_(r.items, k, todayPart_());
    return ok({ code: prefix_(k) + todayPart_() + '.' + seq, datePart: todayPart_(), seq: seq });
  } catch (e) { Logger.log(e); return fail(e.message); }
}

function prefix_(kind) { return kind === 'Item' ? 'Item.' : 'Box.'; }

function nextSeq_(items, kind, datePart) {
  var p = prefix_(kind) + datePart + '.';
  var best = 0;
  for (var i = 0; i < items.length; i++) {
    var c = String(items[i].code || '');
    if (c.indexOf(p) === 0) {
      var n = parseInt(c.slice(p.length), 10);
      if (n > best) best = n;
    }
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

function tryShareFile_(f) {
  try {
    f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return 'link';
  } catch (e1) { /* org chặn share ngoài */ }
  try {
    f.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    return 'domain';
  } catch (e2) { /* deployer không thuộc domain hoặc drive khóa share */ }
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
  var it = root.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return root.createFolder(name);
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Hệ thống đang bận, thử lại sau.');
  try { return fn(); }
  finally { lock.releaseLock(); }
}

function create_(kind, p) {
  p = p || {};
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
    var r = readAllItems_();
    var datePart = todayPart_();
    var code = prefix_(kind) + datePart + '.' + nextSeq_(r.items, kind, datePart);
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
    var shareOk = true;

    for (var s = 0; s < jobs.length; s++) {
      var f = folder.createFile(dataUrlToBlob_(jobs[s][1], code + '.' + jobs[s][0] + '.jpg'));
      if (tryShareFile_(f) === 'none') shareOk = false;
      ids[jobs[s][0]] = f.getId();
    }
    var outerId = ids['ngoai_quan'] || '', productId = ids['san_pham'] || '';

    var row = [code, "'" + at, desc, kind, outerId, productId, 'chua_xu_ly', '',
      '', '', by, String(p.note || '').trim()];
    r.sh.insertRowBefore(2);
    r.sh.getRange(2, 1, 1, row.length).setValues([row]);

    var ph = getSheet_('Photos', PHOTOS_HEADER);
    for (var k = 0; k < jobs.length; k++) {
      ph.appendRow([code, jobs[k][0], ids[jobs[k][0]], at]);
    }

    getSheet_('ActivityLog', LOG_HEADER).appendRow([at, code, '', 'chua_xu_ly', by, 'Tạo mới']);
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
      var r = readAllItems_();
      var idx = -1;
      for (var i = 0; i < r.items.length; i++) {
        if (r.items[i].code === code) { idx = i; break; }
      }
      if (idx < 0) throw new Error('Không Có');
      var cur = r.items[idx].status || 'chua_xu_ly';
      if (cur === 'da_tim_bill') throw new Error('Đã Resolve');
      if (cur === 'thanh_ly') throw new Error('Đã Thanh Lý');
      if (cur !== 'chua_xu_ly') throw new Error('Trạng thái hiện tại: ' + (STATUS_LABEL[cur] || cur));

      var at = nowStr_();
      var by = currentEmail_();
      // G:I 1 lần ghi (status, giữ status_note, mvdn). Không đè reporter/created_at.
      r.sh.getRange(idx + 2, 7, 1, 3).setValues([['da_tim_bill', r.items[idx].status_note || '', bill]]);
      getSheet_('ActivityLog', LOG_HEADER).appendRow([at, code, cur, 'da_tim_bill', by, bill]);
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
      // Batch 1 lần ghi: dựng lại mảng values rồi setValues.
      var sh = r.sh;
      var last = sh.getLastRow();
      var vals = sh.getRange(2, 1, last - 1, ITEMS_HEADER.length).getValues();
      for (var k = 0; k < vals.length; k++) {
        if (codes.indexOf(String(vals[k][0])) >= 0) {
          vals[k][8] = liqCode;
          vals[k][6] = 'thanh_ly';
        }
      }
      sh.getRange(2, 1, vals.length, ITEMS_HEADER.length).setValues(vals);
      var log = getSheet_('ActivityLog', LOG_HEADER);
      for (var m = 0; m < codes.length; m++) {
        log.appendRow([at, codes[m], 'chua_xu_ly', 'thanh_ly', by, liqCode]);
      }
      return { count: codes.length, at: at, by: by, liqCode: liqCode };
    }));
  } catch (e) { Logger.log(e); return fail(e.message); }
}

function fixPhotoSharing() {
  try {
    requireAdmin_();
    var ids = {};
    var ph = readPhotosAll_();
    for (var i = 0; i < ph.length; i++) {
      var id = String(ph[i][2] || '').trim() || driveIdFromUrl_(ph[i][2]);
      if (id) ids[id] = true;
    }
    var r = readAllItems_();
    for (var j = 0; j < r.items.length; j++) {
      var a = String(r.items[j].photo_path_outer || '').trim();
      var b = String(r.items[j].photo_path_product || '').trim();
      var ia = (/^[a-zA-Z0-9_-]{10,}$/.test(a) ? a : driveIdFromUrl_(a));
      var ib = (/^[a-zA-Z0-9_-]{10,}$/.test(b) ? b : driveIdFromUrl_(b));
      if (ia) ids[ia] = true;
      if (ib) ids[ib] = true;
    }
    var shared = 0, domainOnly = false, failed = [];
    for (var fid in ids) {
      try {
        var lv = tryShareFile_(DriveApp.getFileById(fid));
        if (lv === 'domain') domainOnly = true;
        if (lv === 'none') { failed.push(fid); continue; }
        shared++;
      } catch (e) {
        failed.push(fid);
      }
    }
    return ok({ total: Object.keys(ids).length, shared: shared, failed: failed, domainOnly: domainOnly });
  } catch (e) { Logger.log(e); return fail(e.message); }
}

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
    if (desc !== null && !desc) return fail('Vui lòng nhập mô tả sản phẩm.');
    if (adds.length > 3) return fail('Tối đa 3 ảnh.');
    if (toStatus && ['chua_xu_ly', 'da_tim_bill', 'thanh_ly'].indexOf(toStatus) < 0) return fail('Trạng thái không hợp lệ.');
    if ((toStatus === 'da_tim_bill' || toStatus === 'thanh_ly') && !bill) {
      return fail('Đổi sang ' + (STATUS_LABEL[toStatus] || toStatus) + ' phải điền mã bill.');
    }
    return ok(withLock_(function () {
      var r = readAllItems_();
      var idx = -1;
      for (var i = 0; i < r.items.length; i++) {
        if (r.items[i].code === code) { idx = i; break; }
      }
      if (idx < 0) throw new Error('Không Có');
      var cur = r.items[idx].status || 'chua_xu_ly';
      var kind = r.items[idx].kind === 'Item' ? 'Item' : 'Box';
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
      var changed = [];
      if (desc !== null && desc !== String(r.items[idx].description || '')) changed.push('Mô tả sản phẩm');
      if (note !== null && note !== String(r.items[idx].note || '')) changed.push('Ghi chú');
      if (delSlots.length || placed.length) changed.push('Ảnh');
      var row = idx + 2;
      if (desc !== null) r.sh.getRange(row, 3, 1, 1).setValues([[desc]]);
      if (note !== null) r.sh.getRange(row, 12, 1, 1).setValues([[note]]);
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
        var ph2 = getSheet_('Photos', PHOTOS_HEADER);
        for (var w = 0; w < placed.length; w++) {
          var f = folder.createFile(dataUrlToBlob_(placed[w][1], code + '.' + placed[w][0] + '.jpg'));
          tryShareFile_(f);
          ph2.appendRow([code, placed[w][0], f.getId(), at]);
          if (placed[w][0] === 'ngoai_quan') outerId = f.getId();
          if (placed[w][0] === 'san_pham') productId = f.getId();
        }
      }
      r.sh.getRange(row, 5, 1, 2).setValues([[outerId, productId]]);
      var finalSt = cur;
      if (toStatus && toStatus !== cur) {
        if (toStatus === 'chua_xu_ly') {
          r.sh.getRange(row, 7, 1, 1).setValues([[toStatus]]);
        } else {
          r.sh.getRange(row, 7, 1, 3).setValues([[toStatus, r.items[idx].status_note || '', bill]]);
        }
        getSheet_('ActivityLog', LOG_HEADER).appendRow([at, code, cur, toStatus, 'ADMIN đổi trạng thái', bill]);
        finalSt = toStatus;
      }
      if (changed.length) {
        getSheet_('ActivityLog', LOG_HEADER).appendRow([at, code, finalSt, finalSt, by, 'ADMIN chỉnh sửa ' + changed.join(', ')]);
      }
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
        u.sh.appendRow([seeds[i], 'ADMIN', at, by]);
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
      u.sh.appendRow([email, 'ADMIN', nowStr_(), currentEmail_()]);
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
      u.sh.getRange(2, 1, last - 1, USERS_HEADER.length).clearContent();
      if (vals.length) u.sh.getRange(2, 1, vals.length, USERS_HEADER.length).setValues(vals);
      return { email: email };
    }));
  } catch (e) { Logger.log(e); return fail(e.message); }
}
