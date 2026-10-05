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

function listItems(limit) {
  try {
    var n = limit ? Math.min(limit, LIST_LIMIT) : LIST_LIMIT;
    var r = readHeadItems_(n);
    var out = r.items.map(function (o) { return toClient_(o); });
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
  var vals = sh.getRange(2, 1, last - 1, LOG_HEADER.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][1]) === String(code)) {
      out.push({ at: vals[i][0], code: vals[i][1], from: vals[i][2], to: vals[i][3], by: vals[i][4], note: vals[i][5] });
    }
  }
  return out;
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
        return ok({ item: it, history: historyFor_(code) });
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

function shareFile_(f) {
  try {
    f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return 'link';
  } catch (e1) {
    try {
      f.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
      return 'domain';
    } catch (e2) {
      throw new Error('Không mở share ảnh được — nhờ ADMIN kiểm tra quyền share Drive.');
    }
  }
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

var CREATE_SLOTS = { Box: ['ngoai_quan', 'san_pham', 'bo_sung'], Item: ['san_pham', 'bo_sung_1', 'bo_sung_2'] };

function create_(kind, p) {
  p = p || {};
  var desc = String(p.description || '').trim();
  if (!desc) throw new Error('Vui lòng nhập mô tả sản phẩm.');
  var photos = (p.photos || []).filter(Boolean);
  if (!photos.length) throw new Error('Cần ít nhất 1 ảnh mới Confirm được.');
  if (photos.length > 3) throw new Error('Tối đa 3 ảnh.');

  return withLock_(function () {
    var r = readAllItems_();
    var datePart = todayPart_();
    var code = prefix_(kind) + datePart + '.' + nextSeq_(r.items, kind, datePart);
    var at = nowStr_();
    var by = currentEmail_();
    var folder = monthFolder_();
    var slots = CREATE_SLOTS[kind] || CREATE_SLOTS.Box;
    var ids = {};

    for (var s = 0; s < photos.length; s++) {
      var f = folder.createFile(dataUrlToBlob_(photos[s], code + '.' + slots[s] + '.jpg'));
      shareFile_(f);
      ids[slots[s]] = f.getId();
    }
    var outerId = ids['ngoai_quan'] || '', productId = ids['san_pham'] || '';

    var row = [code, at, desc, kind, outerId, productId, 'chua_xu_ly', '',
      '', '', by, String(p.note || '').trim()];
    r.sh.insertRowBefore(2);
    r.sh.getRange(2, 1, 1, row.length).setValues([row]);

    var ph = getSheet_('Photos', PHOTOS_HEADER);
    for (var k = 0; k < slots.length; k++) {
      if (ids[slots[k]]) ph.appendRow([code, slots[k], ids[slots[k]], at]);
    }

    getSheet_('ActivityLog', LOG_HEADER).appendRow([at, code, '', 'chua_xu_ly', by, 'Tạo mới']);
    return code;
  });
}

function createBox(p) {
  try { return ok({ code: create_('Box', p) }); }
  catch (e) { Logger.log(e); return fail(e.message); }
}

function createItem(p) {
  try { return ok({ code: create_('Item', p) }); }
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
        if (shareFile_(DriveApp.getFileById(fid)) === 'domain') domainOnly = true;
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

function me() {
  try { return ok({ email: currentEmail_(), role: getRole_() }); }
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
    var out = u.rows.map(function (r) { return { email: r[0], role: r[1], addedAt: r[2], addedBy: r[3] }; });
    return ok(out);
  } catch (e) { Logger.log(e); return fail(e.message); }
}

function setUserRole(email, role) {
  try {
    requireAdmin_();
    email = normEmail_(email);
    role = (role === 'ADMIN') ? 'ADMIN' : 'STAFF';
    if (!email || email.indexOf('@') < 0) throw new Error('Email chưa đúng.');
    return ok(withLock_(function () {
      var u = readUsers_();
      var idx = -1;
      for (var i = 0; i < u.rows.length; i++) {
        if (normEmail_(u.rows[i][0]) === email) { idx = i; break; }
      }
      if (idx >= 0 && u.rows[idx][1] === 'ADMIN' && role !== 'ADMIN') {
        var admins = 0;
        for (var k = 0; k < u.rows.length; k++) if (u.rows[k][1] === 'ADMIN') admins++;
        if (admins <= 1) throw new Error('Không thể hạ ADMIN cuối cùng.');
        if (normEmail_(currentEmail_()) === email) throw new Error('Không tự hạ quyền chính mình.');
      }
      var at = nowStr_(), by = currentEmail_();
      if (idx >= 0) u.sh.getRange(idx + 2, 2, 1, 3).setValues([[role, at, by]]);
      else u.sh.appendRow([email, role, at, by]);
      return { email: email, role: role };
    }));
  } catch (e) { Logger.log(e); return fail(e.message); }
}

function adminReopen(code, note) {
  try {
    requireAdmin_();
    code = String(code || '').trim();
    if (!code) return fail('Thiếu mã đơn.');
    return ok(withLock_(function () {
      var r = readAllItems_();
      var idx = -1;
      for (var i = 0; i < r.items.length; i++) {
        if (r.items[i].code === code) { idx = i; break; }
      }
      if (idx < 0) throw new Error('Khong Co');
      var cur = r.items[idx].status || 'chua_xu_ly';
      if (cur === 'chua_xu_ly') throw new Error('Đơn đang Lưu kho, không cần mở lại.');
      var at = nowStr_(), by = currentEmail_();
      r.sh.getRange(idx + 2, 7, 1, 1).setValues([['chua_xu_ly']]);
      getSheet_('ActivityLog', LOG_HEADER).appendRow([at, code, cur, 'chua_xu_ly', by, String(note || 'ADMIN mở lại')]);
      return { code: code, from: cur, to: 'chua_xu_ly', at: at, by: by };
    }));
  } catch (e) { Logger.log(e); return fail(e.message); }
}
