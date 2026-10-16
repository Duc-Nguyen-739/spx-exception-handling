'use strict';
// Phủ fallback của scripts/chrome-path.js (SSOT tìm Chrome) — env → .chrome/ →
// Chrome hệ thống → cache Puppeteer → fallback. fs/os được stub theo scenario;
// mỗi file test chạy 1 process riêng nên override không ảnh hưởng file khác.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { findChrome } = require('../scripts/chrome-path.js');

const ROOT = path.join(__dirname, '..');
const LOCAL = path.join(ROOT, '.chrome');
const HOME = '/home/tester';

const real = { existsSync: fs.existsSync, readdirSync: fs.readdirSync, homedir: os.homedir };

function vfs() {
  return { exists: new Set(), readdir: {}, throwOn: new Set() };
}

function stubFs(t, v) {
  delete process.env.CHROME_PATH;
  fs.existsSync = (p) => v.exists.has(String(p));
  fs.readdirSync = (p) => {
    if (v.throwOn.has(String(p))) throw new Error('EACCES');
    return v.readdir[String(p)] || [];
  };
  os.homedir = () => HOME;
  t.after(() => {
    fs.existsSync = real.existsSync;
    fs.readdirSync = real.readdirSync;
    os.homedir = real.homedir;
    delete process.env.CHROME_PATH;
  });
}

test('chrome-path: env CHROME_PATH thắng mọi nguồn', (t) => {
  stubFs(t, vfs());
  process.env.CHROME_PATH = '/opt/fake/chrome';
  assert.deepStrictEqual(findChrome(), { exe: '/opt/fake/chrome', shell: false });
});

test('chrome-path: .chrome/ headless-shell mới nhất → shell:true', (t) => {
  const v = vfs();
  stubFs(t, v);
  v.exists.add(LOCAL);
  v.readdir[LOCAL] = ['.tmp', '125.0', '126.0'];
  const exe = path.join(LOCAL, '126.0', 'chrome-headless-shell-linux64', 'chrome-headless-shell');
  v.exists.add(exe);
  assert.deepStrictEqual(findChrome(), { exe, shell: true });
});

test('chrome-path: Chrome hệ thống', (t) => {
  const v = vfs();
  stubFs(t, v);
  v.exists.add('/usr/bin/chromium');
  assert.deepStrictEqual(findChrome(), { exe: '/usr/bin/chromium', shell: false });
});

test('chrome-path: cache Puppeteer chrome-linux64 → shell:false', (t) => {
  const v = vfs();
  stubFs(t, v);
  const base = path.join(HOME, '.cache', 'puppeteer', 'chrome');
  v.exists.add(base);
  v.readdir[base] = ['131.0.6778.85'];
  const exe = path.join(base, '131.0.6778.85', 'chrome-linux64', 'chrome');
  v.exists.add(exe);
  assert.deepStrictEqual(findChrome(), { exe, shell: false });
});

test('chrome-path: không có nguồn nào → fallback google-chrome', (t) => {
  stubFs(t, vfs());
  assert.deepStrictEqual(findChrome(), { exe: 'google-chrome', shell: false });
});

test('chrome-path: readdirSync lỗi → bỏ qua nguồn đó, chạy tiếp', (t) => {
  const v = vfs();
  stubFs(t, v);
  v.exists.add(LOCAL);
  v.readdir[LOCAL] = ['125.0'];
  v.throwOn.add(LOCAL);
  v.exists.add('/usr/bin/chromium-browser');
  assert.deepStrictEqual(findChrome(), { exe: '/usr/bin/chromium-browser', shell: false });
});

test('chrome-path: puppeteer readdir lỗi → fallback', (t) => {
  const v = vfs();
  stubFs(t, v);
  const base = path.join(HOME, '.cache', 'puppeteer', 'chrome');
  v.exists.add(base);
  v.throwOn.add(base);
  assert.deepStrictEqual(findChrome(), { exe: 'google-chrome', shell: false });
});
