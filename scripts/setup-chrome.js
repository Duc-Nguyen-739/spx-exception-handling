/**
 * scripts/setup-chrome.js — Tai chrome-headless-shell tu Chrome for Testing
 * (nguon chinh chu Google, cung nguon CI browser-actions/setup-chrome dung)
 * ve .chrome/ de chay test:chrome o local. Binary gitignored + claspignored.
 *
 * Usage: npm run setup:chrome   (chay 1 lan; co san dung version thi skip)
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const CFT_JSON = 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json';
const ROOT = path.resolve(__dirname, '..');
const DEST = path.join(ROOT, '.chrome');

function cftPlatform() {
  const p = process.platform, a = process.arch;
  if (p === 'linux') return a === 'arm64' ? 'linux-arm64' : 'linux64';
  if (p === 'darwin') return a === 'arm64' ? 'mac-arm64' : 'mac-x64';
  if (p === 'win32') return a === 'x64' ? 'win64' : 'win32';
  throw new Error('setup:chrome: platform chua ho tro: ' + p + '/' + a);
}
function binName() { return process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell'; }

async function main() {
  const plat = cftPlatform();
  const r = await fetch(CFT_JSON);
  if (!r.ok) throw new Error('setup:chrome: khong tai duoc CfT JSON (HTTP ' + r.status + ')');
  const j = await r.json();
  const stable = j.channels && j.channels.Stable;
  const dl = stable && stable.downloads && stable.downloads['chrome-headless-shell'];
  const hit = (dl || []).find((d) => d.platform === plat);
  if (!hit) throw new Error('setup:chrome: khong co ban ' + plat);
  const version = stable.version;
  const dir = path.join(DEST, version);
  const bin = path.join(dir, 'chrome-headless-shell-' + plat, binName());
  if (fs.existsSync(bin)) {
    console.log('setup:chrome OK (co san ' + version + ')');
    console.log(bin);
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, 'chrome-headless-shell-' + plat + '.zip');
  console.log('setup:chrome: tai ' + version + ' (' + plat + ')...');
  const zr = await fetch(hit.url);
  if (!zr.ok) throw new Error('setup:chrome: tai zip loi (HTTP ' + zr.status + ')');
  fs.writeFileSync(zip, Buffer.from(await zr.arrayBuffer()));
  try {
    execFileSync('unzip', ['-q', '-o', zip, '-d', dir], { stdio: 'inherit' });
  } catch (e) {
    execFileSync('python3', ['-m', 'zipfile', '-e', zip, dir], { stdio: 'inherit' });
  }
  fs.unlinkSync(zip);
  if (process.platform !== 'win32') fs.chmodSync(bin, 0o755);
  const ver = execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim();
  console.log('setup:chrome OK: ' + ver);
  console.log(bin);
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
