'use strict';
// scripts/measure-gas.js — doc timing executions GAS tu local.
// Nguon: Apps Script API processes:listScriptProcesses
// (developers.google.com/apps-script/api/reference/rest/v1/processes,
// scope script.processes). Secret chi qua bien moi truong, khong in ra log.

const API = 'https://script.googleapis.com/v1/processes:listScriptProcesses';

function parseDuration(s) {
  const m = String(s || '').match(/^([\d.]+)s$/);
  if (!m) return null;
  const ms = Math.round(parseFloat(m[1]) * 1000);
  return Number.isFinite(ms) ? ms : null;
}

function buildUrl(scriptId, pageSize, pageToken) {
  let u = API + '?scriptId=' + encodeURIComponent(scriptId)
    + '&pageSize=' + Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 100);
  if (pageToken) u += '&pageToken=' + encodeURIComponent(pageToken);
  return u;
}

function parseArgs(argv) {
  const o = { limit: 20, fn: '', status: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') o.limit = Math.max(parseInt(argv[++i], 10) || 20, 1);
    else if (a === '--fn') o.fn = String(argv[++i] || '');
    else if (a === '--status') o.status = String(argv[++i] || '').toUpperCase();
    else if (a === '--help' || a === '-h') o.help = true;
  }
  return o;
}

function summarize(rows) {
  const g = {};
  for (const r of rows) {
    const k = r.functionName || '(unknown)';
    g[k] = g[k] || { n: 0, known: 0, total: 0, max: 0 };
    g[k].n++;
    if (r.ms != null) {
      g[k].known++;
      g[k].total += r.ms;
      if (r.ms > g[k].max) g[k].max = r.ms;
    }
  }
  return Object.keys(g).sort().map((k) => ({
    fn: k,
    n: g[k].n,
    avg: g[k].known ? Math.round(g[k].total / g[k].known) : null,
    max: g[k].known ? g[k].max : null,
  }));
}

function pad(s, w) {
  s = String(s);
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

async function fetchPage(url, token, get) {
  const res = await (get || fetch)(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) {
    let detail = '';
    try { detail = JSON.stringify(await res.json()).slice(0, 300); } catch (e) { /* bo qua */ }
    throw new Error('Apps Script API ' + res.status + (detail ? ' — ' + detail : ''));
  }
  return res.json();
}

async function main(argv, env, fetchImpl) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('Dung: GAS_SCRIPT_ID=<id> GAS_MEASURE_TOKEN=<token> npm run measure:gas [-- --limit 20 --fn listFull --status COMPLETED]');
    return 0;
  }
  const scriptId = (env.GAS_SCRIPT_ID || '').trim();
  const token = (env.GAS_MEASURE_TOKEN || '').trim();
  if (!scriptId) {
    console.error('Thieu GAS_SCRIPT_ID (Script ID cua Apps Script project).');
    return 1;
  }
  if (!token) {
    console.error('Thieu GAS_MEASURE_TOKEN (OAuth token, scope script.processes — lay tu OAuth Playground).');
    return 1;
  }
  const get = fetchImpl || fetch;
  let rows = [], pageToken = '';
  while (rows.length < args.limit) {
    const data = await fetchPage(buildUrl(scriptId, args.limit - rows.length, pageToken), token, get);
    for (const p of data.processes || []) {
      if (args.fn && p.functionName !== args.fn) continue;
      if (args.status && String(p.processStatus || '').toUpperCase() !== args.status) continue;
      rows.push({
        at: p.startTime || '',
        functionName: p.functionName || '',
        status: p.processStatus || '',
        ms: parseDuration(p.duration),
      });
      if (rows.length >= args.limit) break;
    }
    pageToken = (data.nextPageToken || '').trim();
    if (!pageToken) break;
  }
  if (!rows.length) {
    console.log('Khong co execution nao khop.');
    return 0;
  }
  console.log(pad('START (UTC)', 26) + pad('FUNCTION', 18) + pad('STATUS', 12) + 'DURATION');
  for (const r of rows) {
    console.log(pad(r.at, 26) + pad(r.functionName, 18) + pad(r.status, 12) + (r.ms == null ? '-' : r.ms + ' ms'));
  }
  console.log('\nTong hop theo function:');
  console.log(pad('FUNCTION', 18) + pad('N', 6) + pad('AVG', 10) + 'MAX');
  for (const s of summarize(rows)) {
    console.log(pad(s.fn, 18) + pad(s.n, 6) + pad(s.avg == null ? '-' : s.avg + ' ms', 10) + (s.max == null ? '-' : s.max + ' ms'));
  }
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2), process.env).then(
    (code) => process.exit(code),
    (e) => { console.error('Loi: ' + (e && e.message || e)); process.exit(2); }
  );
}

module.exports = { parseDuration, buildUrl, parseArgs, summarize, main };
