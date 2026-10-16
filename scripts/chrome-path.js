/**
 * scripts/chrome-path.js — SSOT tìm Chrome binary cho test/dev (luật 10).
 * Dùng chung: scripts/test-local-mock.js (test:chrome) + scripts/cdp-helper.js.
 *
 * Thứ tự ưu tiên: env CHROME_PATH → .chrome/ (npm run setup:chrome) → Chrome hệ
 * thống → cache Puppeteer. Trả { exe, shell }: shell=true khi là
 * chrome-headless-shell (bản này tự headless, KHÔNG truyền --headless).
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function findChrome() {
  if (process.env.CHROME_PATH) return { exe: process.env.CHROME_PATH, shell: false };
  try {
    const local = path.join(__dirname, '..', '.chrome');
    if (fs.existsSync(local)) {
      const vers = fs.readdirSync(local).filter((v) => !v.startsWith('.')).sort().reverse();
      const subs = ['chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-headless-shell-linux-arm64/chrome-headless-shell', 'chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-headless-shell-mac-x64/chrome-headless-shell', 'chrome-headless-shell-win64/chrome-headless-shell.exe', 'chrome-headless-shell-win32/chrome-headless-shell.exe'];
      for (const v of vers) for (const sub of subs) {
        const p = path.join(local, v, sub);
        if (fs.existsSync(p)) return { exe: p, shell: true };
      }
    }
  } catch (e) { /* bo qua */ }
  const cands = [
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
  ];
  for (const p of cands) if (fs.existsSync(p)) return { exe: p, shell: false };
  try {
    const root = path.join(os.homedir(), '.cache', 'puppeteer');
    for (const kind of ['chrome-headless-shell', 'chrome']) {
      const base = path.join(root, kind);
      if (!fs.existsSync(base)) continue;
      const versions = fs.readdirSync(base).filter((v) => !v.startsWith('.')).sort().reverse();
      for (const v of versions) {
        for (const sub of ['chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux64/chrome', 'chrome-linux/chrome']) {
          const p = path.join(base, v, sub);
          if (fs.existsSync(p)) return { exe: p, shell: sub.includes('headless-shell') };
        }
      }
    }
  } catch (e) { /* bỏ qua */ }
  return { exe: 'google-chrome', shell: false };
}

module.exports = { findChrome };
