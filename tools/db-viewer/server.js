const express = require('express');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const app = express();
const PORT = 3000;
const POLL_MS = Number(process.env.POLL_MS || 1000);

// The app's LIVE database lives in app-private storage, which `adb pull` cannot
// read — but the app is debuggable, so `run-as` can. This is the only copy the
// viewer reads, so what you see is always the database the app is writing to.
const privateDbs = [
  { pkg: 'com.audiotracker', dir: 'files', match: /^DriveApp_\d+\.db$/ },
];

// World-readable paths come over plain `adb pull`. Nothing is listed here now
// that the live DB above is read directly; kept as the hook for any future DB
// that does sit on shared storage.
const dbPathsOnDevice = [];

const sh = (cmd) =>
  new Promise((resolve) =>
    exec(cmd, { maxBuffer: 1024 * 1024 * 64 }, (error, stdout, stderr) =>
      resolve({ error, stdout: stdout || '', stderr: stderr || '' })
    )
  );

// ---------------------------------------------------------------- adb syncing

async function onlineDevices() {
  const { error, stdout } = await sh('adb devices');
  if (error) return [];
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.endsWith('\tdevice')) // ✅ ONLY ONLINE
    .map((line) => line.split('\t')[0]);
}

// Which databases exist on this device right now. The private filename carries
// a user id, so it is discovered rather than hardcoded — switching accounts in
// the app just changes which file shows up here.
async function discoverSources(deviceId) {
  const sources = [];

  for (const { pkg, dir, match } of privateDbs) {
    const { error, stdout } = await sh(
      `adb -s ${deviceId} shell run-as ${pkg} ls ${dir}`
    );
    if (error) continue; // not debuggable, or package missing
    for (const name of stdout.split('\n').map((l) => l.trim())) {
      if (match.test(name)) {
        sources.push({ kind: 'runas', pkg, remote: `${dir}/${name}`, fileName: name });
      }
    }
  }

  for (const p of dbPathsOnDevice) {
    sources.push({ kind: 'pull', remote: p, fileName: path.basename(p) });
  }

  return sources;
}

async function signatureOf(deviceId, src) {
  const cmd =
    src.kind === 'runas'
      ? `adb -s ${deviceId} shell run-as ${src.pkg} stat -c %Y:%s "${src.remote}"`
      : `adb -s ${deviceId} shell stat -c %Y:%s "${src.remote}"`;
  const { error, stdout } = await sh(cmd);
  if (error) return null;
  const sig = stdout.trim();
  return sig && sig.includes(':') ? sig : null;
}

// `exec-out` keeps the byte stream intact; plain `shell` would mangle it.
function runAsCat(deviceId, pkg, remote, tmpPath) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmpPath);
    const p = spawn('adb', [
      '-s', deviceId, 'exec-out', 'run-as', pkg, 'cat', remote,
    ]);
    let err = '';
    let code = null;
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (c) => (code = c));
    p.stdout.pipe(out);
    out.on('error', reject);
    out.on('finish', () =>
      code !== 0 && err.trim() ? reject(new Error(err.trim())) : resolve()
    );
  });
}

// A copy taken mid-write would parse as garbage, so nothing is promoted into
// place until sqlite can actually open it. On failure the previous good copy
// stays put and the next poll tries again.
async function validateSqlite(file) {
  if (!SQL) SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(file));
  try {
    db.exec('SELECT count(*) FROM sqlite_master');
  } finally {
    db.close();
  }
}

const signatures = new Map(); // "device|remote" -> last synced signature
const state = { devices: [], lastError: null, version: 0 };

async function syncOne(deviceId, src) {
  const deviceDir = path.join(__dirname, deviceId);
  fs.mkdirSync(deviceDir, { recursive: true });

  const destPath = path.join(deviceDir, src.fileName);
  const key = `${deviceId}|${src.remote}`;

  const sig = await signatureOf(deviceId, src);
  if (sig && signatures.get(key) === sig && fs.existsSync(destPath)) {
    return { ...src, destPath, changed: false };
  }

  if (src.kind === 'runas') {
    const tmp = `${destPath}.tmp`;
    await runAsCat(deviceId, src.pkg, src.remote, tmp);
    await validateSqlite(tmp);
    fs.renameSync(tmp, destPath);
  } else {
    const { error } = await sh(
      `adb -s ${deviceId} pull "${src.remote}" "${destPath}"`
    );
    if (error) throw new Error(`${deviceId}: pull failed for ${src.fileName}`);
    // WAL sidecars, in case the app ever switches to WAL journaling
    for (const ext of ['-wal', '-shm']) {
      await sh(
        `adb -s ${deviceId} pull "${src.remote}${ext}" "${destPath}${ext}"`
      );
    }
  }

  if (sig) signatures.set(key, sig);
  return { ...src, destPath, changed: true };
}

let syncing = false;

async function syncAll() {
  const devices = await onlineDevices();
  if (devices.length === 0) {
    state.devices = [];
    state.lastError = 'No ONLINE emulators found';
    return;
  }

  const errors = [];
  const summary = [];

  for (const deviceId of devices) {
    const files = [];
    for (const src of await discoverSources(deviceId)) {
      try {
        const r = await syncOne(deviceId, src);
        if (r.changed) {
          state.version++;
          console.log(`✅ ${deviceId}: synced ${r.fileName} (${r.kind})`);
        }
        files.push({
          name: r.fileName,
          kind: r.kind,
          live: r.kind === 'runas',
          size: fs.existsSync(r.destPath) ? fs.statSync(r.destPath).size : 0,
        });
      } catch (e) {
        errors.push(`${src.fileName}: ${e.message}`);
      }
    }
    summary.push({ id: deviceId, files });
  }

  state.devices = summary;
  state.lastSync = Date.now();
  state.lastError = errors.length ? errors.join('\n') : null;
}

// background loop — keeps the local copies fresh with no clicking
setInterval(async () => {
  if (syncing) return; // never let slow pulls stack up
  syncing = true;
  try {
    await syncAll();
  } catch (e) {
    state.lastError = e.message;
  } finally {
    syncing = false;
  }
}, POLL_MS);

// ------------------------------------------------------------- sqlite reading

let SQL = null;
const dbCache = new Map(); // destPath -> { mtimeMs, size, db }

async function openDb(destPath) {
  if (!SQL) SQL = await initSqlJs();
  if (!fs.existsSync(destPath)) throw new Error(`Not synced yet: ${destPath}`);

  const { mtimeMs, size } = fs.statSync(destPath);
  const cached = dbCache.get(destPath);
  if (cached && cached.mtimeMs === mtimeMs && cached.size === size) return cached.db;

  if (cached) cached.db.close();
  const db = new SQL.Database(fs.readFileSync(destPath));
  dbCache.set(destPath, { mtimeMs, size, db });
  return db;
}

function defaultFile(deviceId) {
  const dev = state.devices.find((d) => d.id === deviceId);
  const live = dev && dev.files.find((f) => f.live);
  return live ? live.name : dev && dev.files[0] ? dev.files[0].name : null;
}

function dbFileFor(deviceId, fileName) {
  const name = fileName || defaultFile(deviceId);
  if (!name) throw new Error('No database synced for this device yet');
  if (name.includes('/') || name.includes('\\')) throw new Error('Bad file name');
  return path.join(__dirname, deviceId, name);
}

// sql.js ships without FTS5, so a virtual table like `notes` cannot be opened.
// Its shadow table `notes_content` holds the same rows and reads as plain SQL.
function readableTable(db, table) {
  try {
    db.exec(`SELECT 1 FROM "${table}" LIMIT 1`);
    return { table, note: null };
  } catch (e) {
    if (!/no such module/i.test(e.message)) throw e;
    const shadow = `${table}_content`;
    db.exec(`SELECT 1 FROM "${shadow}" LIMIT 1`); // throws if there is none
    return { table: shadow, note: `${table} is FTS5 — showing ${shadow}` };
  }
}

// sql.js hands back BLOBs as Uint8Array, which JSON-encodes into byte soup
const jsonSafe = (v) => (v instanceof Uint8Array ? `⟨blob ${v.length}B⟩` : v);

// A single base64 image cell runs to ~120KB, so a 100-row page of them would
// ship megabytes every poll. Long values travel clipped; the viewer fetches the
// whole thing from /api/cell only when you actually open one.
const MAX_CELL = 300;
const clipCell = (v) => {
  const s = jsonSafe(v);
  return typeof s === 'string' && s.length > MAX_CELL
    ? { __clipped: true, head: s.slice(0, 160), len: s.length }
    : s;
};

// ------------------------------------------------------------------- HTTP API

app.get('/api/status', (req, res) => {
  res.json({
    devices: state.devices,
    lastSync: state.lastSync,
    lastError: state.lastError,
    version: state.version,
    pollMs: POLL_MS,
  });
});

app.get('/api/tables', async (req, res) => {
  try {
    const db = await openDb(dbFileFor(req.query.device, req.query.file));
    const rows = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    res.json({ tables: rows.length ? rows[0].values.map((v) => v[0]) : [] });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/rows', async (req, res) => {
  const requested = String(req.query.table || '');
  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  if (!/^[A-Za-z0-9_]+$/.test(requested)) {
    return res.status(400).json({ error: 'Bad table name' });
  }
  try {
    const db = await openDb(dbFileFor(req.query.device, req.query.file));
    const { table, note } = readableTable(db, requested);

    let count = 0;
    try {
      count = db.exec(`SELECT COUNT(*) FROM "${table}"`)[0].values[0][0];
    } catch {
      /* some virtual tables refuse COUNT */
    }

    // newest first where the table has a usable rowid. The rowid rides along so
    // a clipped cell can be fetched back in full from /api/cell.
    let out;
    let hasRowid = true;
    try {
      out = db.exec(
        `SELECT rowid AS __rowid, * FROM "${table}" ORDER BY rowid DESC LIMIT ${limit}`
      );
    } catch {
      hasRowid = false;
      out = db.exec(`SELECT * FROM "${table}" LIMIT ${limit}`);
    }

    const cols = out.length ? out[0].columns : [];
    const raw = out.length ? out[0].values : [];
    const rowids = hasRowid ? raw.map((r) => r[0]) : null;
    const body = hasRowid ? raw.map((r) => r.slice(1)) : raw;

    res.json({
      columns: hasRowid ? cols.slice(1) : cols,
      values: body.map((r) => r.map(clipCell)),
      rowids,
      count,
      note,
      version: state.version,
      lastSync: state.lastSync,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// One cell, in full — what the viewer opens when you click a clipped value.
app.get('/api/cell', async (req, res) => {
  const requested = String(req.query.table || '');
  const column = String(req.query.column || '');
  const rowid = Number(req.query.rowid);
  if (!/^[A-Za-z0-9_]+$/.test(requested) || !/^[A-Za-z0-9_]+$/.test(column)) {
    return res.status(400).json({ error: 'Bad table or column name' });
  }
  if (!Number.isFinite(rowid)) {
    return res.status(400).json({ error: 'Bad rowid' });
  }
  try {
    const db = await openDb(dbFileFor(req.query.device, req.query.file));
    const { table } = readableTable(db, requested);
    const out = db.exec(
      `SELECT "${column}" FROM "${table}" WHERE rowid = ${rowid} LIMIT 1`
    );
    if (!out.length || !out[0].values.length) {
      return res.status(404).json({ error: 'Row not found' });
    }
    res.json({ value: jsonSafe(out[0].values[0][0]) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------------------------------------------------------------- viewer page

const VIEWER_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>ADB DB Viewer</title><style>
:root{color-scheme:light dark}
/* an author display rule outranks the hidden attribute's own display:none,
   so #back{display:flex} would otherwise pin the modal open forever */
[hidden]{display:none!important}
body{margin:0;font:13px/1.5 ui-sans-serif,system-ui,sans-serif}
header{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 14px;
  border-bottom:1px solid #8884;position:sticky;top:0;background:Canvas;z-index:2}
select,input,button{font:inherit;padding:4px 6px}
#meta{margin-left:auto;opacity:.7;font-variant-numeric:tabular-nums}
.wrap{overflow:auto;max-height:calc(100vh - 60px)}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #8883;padding:4px 8px;text-align:left;white-space:nowrap;
  max-width:420px;overflow:hidden;text-overflow:ellipsis}
th{position:sticky;top:0;background:Canvas;box-shadow:inset 0 -1px #8886}
tbody tr:nth-child(odd){background:#8881}
tbody tr.new td:first-child{box-shadow:inset 3px 0 #22c55e}
tbody td{cursor:pointer}
tbody td.clip{color:inherit;opacity:.85;font-style:italic}
#badge{color:#16a34a;font-weight:600}
#err{color:#ef4444;padding:0 14px}
#back{position:fixed;inset:0;background:#0008;display:flex;align-items:center;
  justify-content:center;padding:24px;z-index:9}
#modal{background:Canvas;border-radius:8px;max-width:900px;width:100%;
  max-height:85vh;display:flex;flex-direction:column;box-shadow:0 12px 40px #0006}
#mhead{display:flex;gap:10px;align-items:center;padding:10px 14px;
  border-bottom:1px solid #8884}
#mhead b{font-family:ui-monospace,monospace}
#mhead .sp{margin-left:auto;opacity:.6}
#mbody{overflow:auto;padding:14px}
#mval{margin:0;white-space:pre-wrap;word-break:break-all;
  font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;user-select:text}
#mimg{max-width:100%;border:1px solid #8884;border-radius:6px;margin-bottom:12px}
</style></head><body>
<header>
  <select id="device"></select>
  <select id="file"></select>
  <select id="table"></select>
  <label>rows <input id="limit" type="number" value="100" min="1" max="1000" style="width:70px"></label>
  <label><input id="auto" type="checkbox" checked> auto-refresh</label>
  <button id="now">Refresh now</button>
  <span id="badge"></span>
  <span id="meta"></span>
</header>
<div id="err"></div>
<div class="wrap"><table><thead id="head"></thead><tbody id="body"></tbody></table></div>
<div id="back" hidden><div id="modal">
  <div id="mhead">
    <b id="mcol"></b><span id="mlen" class="sp"></span>
    <button id="mcopy">Copy</button><button id="mclose">Close</button>
  </div>
  <div id="mbody"><img id="mimg" hidden><pre id="mval"></pre></div>
</div></div>
<script>
const $ = (id) => document.getElementById(id);
const HIGHLIGHT_MS = 20000; // how long a newly-arrived row stays lit
let pollMs = 3000, seen = new Map(), first = true, timer = null, devices = [];
let lastRowids = null;

async function jget(u){
  const r = await fetch(u); const j = await r.json();
  if(!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

function esc(v){
  return v === null ? '∅' : String(v).replace(/[&<>"]/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

// A clipped cell shows its head plus a size hint; the full value lives server
// side until you open it. Everything else carries its value in a data-* attr so
// copying never has to round-trip.
function cell(v, ci){
  if(v && typeof v === 'object' && v.__clipped){
    return '<td class="clip" data-ci="' + ci + '" data-clip="1">'
      + esc(v.head) + ' … <span style="opacity:.6">('
      + v.len.toLocaleString() + ' chars)</span></td>';
  }
  return '<td data-ci="' + ci + '" data-v="' + esc(v) + '">' + esc(v) + '</td>';
}

function hasTableSelection(){
  const s = window.getSelection();
  if(!s || s.isCollapsed || !s.toString().trim()) return false;
  const n = s.anchorNode;
  return !!(n && document.querySelector('.wrap').contains(n));
}

function qs(){
  return 'device=' + encodeURIComponent($('device').value)
    + '&file=' + encodeURIComponent($('file').value);
}

async function boot(){
  const s = await jget('/api/status');
  pollMs = s.pollMs;
  devices = s.devices;
  $('device').innerHTML = devices.map(d => '<option>' + d.id + '</option>').join('')
    || '<option value="">(no online device)</option>';
  fillFiles();
  await loadTables();
  tick();
}

function fillFiles(){
  const dev = devices.find(d => d.id === $('device').value);
  const files = dev ? dev.files : [];
  // the live app-private DB sorts first and is selected by default
  files.sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0));
  $('file').innerHTML = files.map(f =>
    '<option value="' + f.name + '">' + f.name
    + (f.live ? '  ● live' : '  (snapshot)') + '</option>').join('');
}

async function loadTables(){
  if(!$('device').value || !$('file').value) return;
  const prev = $('table').value;
  try{
    const t = await jget('/api/tables?' + qs());
    $('table').innerHTML = t.tables.map(n => '<option>' + n + '</option>').join('');
    if(t.tables.includes(prev)) $('table').value = prev;
  }catch(e){ $('err').textContent = e.message; }
}

async function load(){
  const tbl = $('table').value;
  if(!$('device').value || !tbl) return;
  try{
    const d = await jget('/api/rows?' + qs()
      + '&table=' + encodeURIComponent(tbl) + '&limit=' + $('limit').value);
    $('err').textContent = '';
    $('head').innerHTML = '<tr>' + d.columns.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr>';
    // Rebuilding the tbody would yank a selection out from under a copy, and
    // the modal reads from the live DOM, so both freeze the repaint.
    if(!$('back').hidden || hasTableSelection()) return;

    const now = Date.now();
    let fresh = 0;
    lastRowids = d.rowids;
    $('body').innerHTML = d.values.map((row, ri) => {
      const key = tbl + '|' + JSON.stringify(row);
      // Rows seen on the very first render are backdated so they never light up;
      // everything after that is stamped when it first appears.
      if(!seen.has(key)) seen.set(key, first ? 0 : now);
      const age = now - seen.get(key);
      const lit = seen.get(key) > 0 && age < HIGHLIGHT_MS;
      if(lit) fresh++;
      // Inline style beats the zebra rule, and fading by age survives the full
      // tbody rebuild that happens on every poll.
      const alpha = lit ? (1 - age / HIGHLIGHT_MS) * 0.45 : 0;
      return '<tr data-ri="' + ri + '" class="' + (lit ? 'new' : '') + '"'
        + (lit ? ' style="background:rgba(74,222,128,' + alpha.toFixed(3) + ')"' : '')
        + '>' + row.map((v, ci) => cell(v, ci)).join('') + '</tr>';
    }).join('');
    first = false;
    $('badge').textContent = fresh ? '● ' + fresh + ' new' : '';
    $('meta').textContent = (d.note ? d.note + ' · ' : '')
      + d.count.toLocaleString() + ' rows · synced '
      + (d.lastSync ? new Date(d.lastSync).toLocaleTimeString() : '—');
  }catch(e){ $('err').textContent = e.message; }
}

function tick(){
  clearTimeout(timer);
  load().finally(() => { if($('auto').checked) timer = setTimeout(tick, pollMs); });
}

function reset(){ seen.clear(); first = true; }

// ── cell detail ───────────────────────────────────────────────────────────────

function showModal(colName, value){
  $('mcol').textContent = colName;
  $('mlen').textContent = value === null ? 'NULL'
    : String(value).length.toLocaleString() + ' chars';
  $('mval').textContent = value === null ? '∅' : String(value);
  const isImg = typeof value === 'string' && value.startsWith('data:image/');
  $('mimg').hidden = !isImg;
  if(isImg) $('mimg').src = value;
  $('back').hidden = false;
}

function closeModal(){
  $('back').hidden = true;
  $('mimg').removeAttribute('src');
  if($('auto').checked) tick(); // repaint was frozen while it was open
}

$('body').addEventListener('click', async (ev) => {
  const td = ev.target.closest('td');
  if(!td) return;
  const ci = Number(td.dataset.ci);
  const colName = $('head').rows[0] ? $('head').rows[0].cells[ci].textContent : '';
  if(!td.dataset.clip){
    showModal(colName, td.dataset.v === '∅' ? null : td.dataset.v);
    return;
  }
  const ri = Number(td.parentElement.dataset.ri);
  const rowid = lastRowids ? lastRowids[ri] : null;
  if(rowid === null || rowid === undefined){
    showModal(colName, td.textContent); // no rowid to fetch by
    return;
  }
  $('mcol').textContent = colName;
  $('mval').textContent = 'Loading…';
  $('mimg').hidden = true;
  $('back').hidden = false;
  try{
    const r = await jget('/api/cell?' + qs() + '&table='
      + encodeURIComponent($('table').value) + '&column=' + encodeURIComponent(colName)
      + '&rowid=' + rowid);
    showModal(colName, r.value);
  }catch(e){ $('mval').textContent = 'Error: ' + e.message; }
});

$('mcopy').onclick = async () => {
  try{
    await navigator.clipboard.writeText($('mval').textContent);
    $('mcopy').textContent = 'Copied ✓';
  }catch{
    // clipboard API needs a secure context; fall back to selecting the text
    const r = document.createRange();
    r.selectNodeContents($('mval'));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(r);
    $('mcopy').textContent = 'Selected — Ctrl+C';
  }
  setTimeout(() => ($('mcopy').textContent = 'Copy'), 1500);
};

$('mclose').onclick = closeModal;
$('back').onclick = (e) => { if(e.target === $('back')) closeModal(); };
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape' && !$('back').hidden) closeModal();
});

$('device').onchange = async () => { reset(); fillFiles(); await loadTables(); tick(); };
$('file').onchange = async () => { reset(); await loadTables(); tick(); };
$('table').onchange = () => { reset(); tick(); };
$('limit').onchange = tick;
$('now').onclick = tick;
$('auto').onchange = () => { if($('auto').checked) tick(); else clearTimeout(timer); };
boot();
</script></body></html>`;

app.get('/', (req, res) => {
  res.type('html').send(VIEWER_HTML);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`👀 Live viewer:     http://localhost:${PORT}/`);
  console.log(`🔁 Auto-syncing every ${POLL_MS}ms`);
  syncAll().catch((e) => console.error(e.message));
});
