/**
 * SPIKE — do nhanh CELLIMAGE lam cache tem anh (chi do, khong phai code that).
 *
 * Cach chay (trong Apps Script editor cua project, KHONG can commit):
 *  1. Tao file tam `spike.gs` trong editor, copy TOAN BO file nay dan vao, Save.
 *  2. Chay `spikeCellImage_Mint`  -> xem View > Logs (ghi tem + mint URL + verdict).
 *  3. Cho 1-3 tieng, chay `spikeCellImage_Check` -> biet URL song bao lau (expiry).
 *  4. Chay `spikeCellImage_Cleanup` -> xoa sheet tam + property tam. Xoa luon file spike.gs.
 *
 * An toan: KHONG ghi vao sheet production (chi sheet tam __SPIKE_CELLIMAGE),
 * KHONG in fileId/URL ra log (URL la bearer — chi in do dai).
 * Nguong dat (de lam that): ghi 1 tem < 3000ms · doc batch + mint 5 URL < 5000ms ·
 * URL song > 60 phut · sheet khong phinh dot bien.
 */

var SPIKE_SHEET = '__SPIKE_CELLIMAGE';
var SPIKE_PROP = 'SPIKE_CELLIMAGE';
var SPIKE_N = 5;
var SPIKE_WRITE_BUDGET_MS = 3000;
var SPIKE_READ_BUDGET_MS = 5000;

function spikeCellImage_Mint() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Mo script dang bound voi Spreadsheet DB roi chay lai.');
  var sizeBefore = -1;
  try { sizeBefore = DriveApp.getFileById(ss.getId()).getSize(); } catch (e0) {}
  var ph = ss.getSheetByName('Photos');
  if (!ph) throw new Error('Khong thay sheet Photos.');
  var last = ph.getLastRow();
  if (last < 2) throw new Error('Sheet Photos chua co du lieu.');
  var vals = ph.getRange(2, 1, Math.min(last - 1, 200), 3).getValues();
  var ids = [];
  for (var i = 0; i < vals.length && ids.length < SPIKE_N; i++) {
    var v = String(vals[i][2] || '').trim();
    if (/^[A-Za-z0-9_-]{10,}$/.test(v)) ids.push(v);
  }
  if (!ids.length) throw new Error('Khong tim thay fileId anh hop le trong 200 dong dau Photos.');
  var tmp = ss.getSheetByName(SPIKE_SHEET);
  if (!tmp) tmp = ss.insertSheet(SPIKE_SHEET);
  tmp.clear();
  tmp.getRange(1, 1, 1, 2).setValues([['note', 'thumb']]);
  var token = ScriptApp.getOAuthToken();
  var writeMs = [];
  for (var j = 0; j < ids.length; j++) {
    var t0 = Date.now();
    var resp = UrlFetchApp.fetch('https://drive.google.com/thumbnail?sz=w320&id=' + ids[j], {
      headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) throw new Error('Thumbnail fetch that bai (item ' + j + ', HTTP ' + resp.getResponseCode() + ').');
    var blob = resp.getBlob();
    var b64 = Utilities.base64Encode(blob.getBytes());
    var img = SpreadsheetApp.newCellImage()
      .setSourceUrl('data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + b64)
      .setAltTextTitle('spike-' + j)
      .build();
    tmp.getRange(j + 2, 2).setValue(img);
    writeMs.push(Date.now() - t0);
  }
  var r0 = Date.now();
  var cells = tmp.getRange(2, 2, ids.length, 1).getValues();
  var urls = [];
  for (var k = 0; k < cells.length; k++) {
    var cv = cells[k][0];
    if (!cv || typeof cv.getContentUrl !== 'function') throw new Error('O tem khong phai CellImage (item ' + k + ').');
    urls.push(cv.getContentUrl());
  }
  var readMs = Date.now() - r0;
  var sizeAfter = -1;
  try { sizeAfter = DriveApp.getFileById(ss.getId()).getSize(); } catch (e2) {}
  PropertiesService.getScriptProperties().setProperty(SPIKE_PROP,
    JSON.stringify({ at: new Date().getTime(), n: urls.length, urls: urls }));
  var wSum = 0;
  for (var w = 0; w < writeMs.length; w++) wSum += writeMs[w];
  var wAvg = Math.round(wSum / writeMs.length);
  var lens = urls.map(function (u) { return String(u || '').length; }).join(',');
  Logger.log('SPIKE mint: n=' + ids.length + ' writeMs=[' + writeMs.join(',') + '] avg=' + wAvg
    + (wAvg <= SPIKE_WRITE_BUDGET_MS ? ' PASS' : ' FAIL'));
  Logger.log('SPIKE mint: batchReadMintMs=' + readMs + ' urlLens=[' + lens + ']'
    + (readMs <= SPIKE_READ_BUDGET_MS ? ' PASS' : ' FAIL'));
  Logger.log('SPIKE mint: sheetBytes before=' + sizeBefore + ' after=' + sizeAfter);
  Logger.log('Tiep theo: cho 1-3h roi chay spikeCellImage_Check() do expiry, xong spikeCellImage_Cleanup().');
}

function spikeCellImage_Check() {
  var raw = PropertiesService.getScriptProperties().getProperty(SPIKE_PROP);
  if (!raw) throw new Error('Chua chay Mint (khong thay property tam).');
  var d = JSON.parse(raw);
  var ageMin = Math.round((Date.now() - d.at) / 60000);
  var alive = 0;
  var codes = [];
  for (var i = 0; i < d.urls.length; i++) {
    var t0 = Date.now();
    try {
      var r = UrlFetchApp.fetch(d.urls[i], { muteHttpExceptions: true });
      codes.push(r.getResponseCode());
      if (r.getResponseCode() === 200) alive++;
    } catch (e) {
      codes.push('ERR');
    }
    Logger.log('SPIKE check item ' + i + ': ' + codes[codes.length - 1] + ' (' + (Date.now() - t0) + 'ms)');
  }
  var verdict = alive === d.urls.length ? (ageMin >= 60 ? ' PASS (song >1h)' : ' OK-tam (chua du 1h, chay lai sau)') : ' FAIL';
  Logger.log('SPIKE check: ageMin=' + ageMin + ' alive=' + alive + '/' + d.urls.length + verdict);
}

function spikeCellImage_Cleanup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) {
    var tmp = ss.getSheetByName(SPIKE_SHEET);
    if (tmp) ss.deleteSheet(tmp);
  }
  PropertiesService.getScriptProperties().deleteProperty(SPIKE_PROP);
  Logger.log('SPIKE cleanup: xong (da xoa sheet tam + property tam). Nho xoa luon file spike.gs trong editor.');
}
