const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Manifest phai khai bao scope tuong minh (Google khuyen dung auto-detect):
// deploy dong bang grant tu lan consent xua, CI khong bao gio nang scope
// non-interactive duoc -> getEffectiveUser().getEmail() trong + setSharing
// Access denied trong khi getActiveUser (login session) van hien.
const WANT = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/script.external_request',
];

test('manifest: json hop le + du 4 scope doc/ghi can thiet', () => {
  const m = JSON.parse(fs.readFileSync('appsscript.json', 'utf8'));
  assert.deepStrictEqual(m.oauthScopes, WANT);
});

test('manifest: giu timezone + webapp DOMAIN nhu cu', () => {
  const m = JSON.parse(fs.readFileSync('appsscript.json', 'utf8'));
  assert.strictEqual(m.timeZone, 'Asia/Ho_Chi_Minh');
  assert.strictEqual(m.webapp.executeAs, 'USER_DEPLOYING');
  assert.strictEqual(m.webapp.access, 'DOMAIN');
});
