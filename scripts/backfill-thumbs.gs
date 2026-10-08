/**
 * BACKFILL tem CELLIMAGE cho anh cu (chay trong Apps Script editor, theo dot).
 *
 * Cach chay: tao file tam `backfill.gs` trong editor, copy TOAN BO file nay dan
 * vao, Save. Chay `BackfillRun()` nhieu lan (moi dot ~40 slot, tranh timeout 6
 * phut) cho den khi log bao xong. Xem tien do: `BackfillStatus()`. Chay lai tu
 * dau: `BackfillReset()` roi `BackfillRun()`. Xong thi xoa file backfill.gs.
 *
 * An toan: chi APPEND vao sheet Thumbs (khong sua/xoa dong cu), skip slot da co
 * tem (chay lap khong tao trung), KHONG in fileId/URL ra log (chi in ma + slot),
 * khong dung vao Items/Photos/ActivityLog.
 */

var BACKFILL_PROP = 'BACKFILL_THUMBS';
var BACKFILL_CHUNK = 40;
var BH_HEADER = ['code', 'slot', 'thumb'];

function bhSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Mo script dang bound voi Spreadsheet DB roi chay lai.');
  var sh = ss.getSheetByName('Thumbs');
  if (!sh) {
    sh = ss.insertSheet('Thumbs');
    sh.getRange(1, 1, 1, BH_HEADER.length).setValues([BH_HEADER]);
  }
  return sh;
}

function bhMissing_(cursor) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ph = ss.getSheetByName('Photos');
  if (!ph || ph.getLastRow() < 2) return { rows: [], total: 0 };
  var vals = ph.getRange(2, 1, ph.getLastRow() - 1, 3).getValues();
  var th = ss.getSheetByName('Thumbs');
  var have = {};
  if (th && th.getLastRow() > 1) {
    var tv = th.getRange(2, 1, th.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < tv.length; i++) have[String(tv[i][0]) + '|' + String(tv[i][1])] = true;
  }
  var rows = [];
  for (var j = 0; j < vals.length; j++) {
    var code = String(vals[j][0] || '').trim(), slot = String(vals[j][1] || '').trim();
    var fid = String(vals[j][2] || '').trim();
    if (!code || have[code + '|' + slot]) continue;
    rows.push({ code: code, slot: slot, fid: fid });
  }
  return { rows: rows.slice(cursor, cursor + BACKFILL_CHUNK), total: rows.length };
}

function BackfillRun() {
  var prop = PropertiesService.getScriptProperties();
  var cursor = parseInt(prop.getProperty(BACKFILL_PROP) || '0', 10) || 0;
  if (cursor < 0) cursor = 0;
  var m = bhMissing_(cursor);
  if (!m.rows.length) {
    prop.deleteProperty(BACKFILL_PROP);
    Logger.log('BACKFILL: xong (khong con slot thieu tem). Nho xoa file backfill.gs trong editor.');
    return;
  }
  var token = ScriptApp.getOAuthToken();
  var th = bhSheet_();
  var okRows = [], fail = [], gone = [];
  for (var i = 0; i < m.rows.length; i++) {
    var r = m.rows[i];
    try {
      if (!/^[A-Za-z0-9_-]{10,}$/.test(r.fid)) { fail.push(r.code + '/' + r.slot + ' ID-sai'); continue; }
      var resp = UrlFetchApp.fetch('https://drive.google.com/thumbnail?sz=w320&id=' + r.fid, {
        headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true
      });
      if (resp.getResponseCode() !== 200) { gone.push(r.code + '/' + r.slot + ' HTTP' + resp.getResponseCode()); continue; }
      var blob = resp.getBlob();
      var b64 = Utilities.base64Encode(blob.getBytes());
      okRows.push([r.code, r.slot, SpreadsheetApp.newCellImage()
        .setSourceUrl('data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + b64).build()]);
    } catch (e) { fail.push(r.code + '/' + r.slot + ' ERR'); }
  }
  if (okRows.length) th.getRange(th.getLastRow() + 1, 1, okRows.length, BH_HEADER.length).setValues(okRows);
  prop.setProperty(BACKFILL_PROP, String(cursor + m.rows.length));
  Logger.log('BACKFILL: dot xong ok=' + okRows.length + ' loi=' + fail.length + ' mat=' + gone.length
    + ' con lai~' + Math.max(0, m.total - cursor - m.rows.length));
  if (fail.length) Logger.log('BACKFILL loi: ' + fail.slice(0, 10).join(', '));
  if (gone.length) Logger.log('BACKFILL file mat (khong tai duoc, can kiem tra Drive): ' + gone.slice(0, 10).join(', '));
  Logger.log('Chay lai BackfillRun() cho dot tiep theo.');
}

function BackfillStatus() {
  var prop = PropertiesService.getScriptProperties();
  var cursor = parseInt(prop.getProperty(BACKFILL_PROP) || '0', 10) || 0;
  if (cursor < 0) cursor = 0;
  var m = bhMissing_(0);
  Logger.log('BACKFILL: tong thieu tem=' + m.total + ' (tinh tu dau, da qua dot toi vi tri ' + cursor + ').');
}

function BackfillReset() {
  PropertiesService.getScriptProperties().deleteProperty(BACKFILL_PROP);
  Logger.log('BACKFILL: da reset cursor. Chay BackfillRun() de quet lai tu dau.');
}
