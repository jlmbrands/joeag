/* joe.ag — the server. No dependencies.
   - serves ./public with byte ranges and sane caching
   - a small WebSocket relay so people in the town can see each other
   - keeps the blocks people place in data/edits.json
   - /api/brief fetches the latest Morgan Brief headline (cached ten minutes)
   - /api/reset?key=... clears the edits (set RESET_KEY in the environment) */

'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.join(__dirname, 'public');
const DATA = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'edits.json');
const RESET_KEY = process.env.RESET_KEY || '';
const MAX_EDITS = 40000;

/* ---------- static files ---------- */

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8'
};
function cacheFor(ext) {
  if (ext === '.html') return 'no-cache';
  if (ext === '.mp3') return 'public, max-age=2592000';
  return 'public, max-age=3600';
}
function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, headers || {}));
  res.end(body);
}
function json(res, status, obj) { send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' }); }

function serveFile(req, res, file, stat) {
  const ext = path.extname(file).toLowerCase();
  const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': cacheFor(ext), 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' };
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      const start = m[1] === '' ? Math.max(0, stat.size - Number(m[2])) : Number(m[1]);
      const end = m[2] === '' || m[1] === '' ? stat.size - 1 : Math.min(Number(m[2]), stat.size - 1);
      if (start <= end && start < stat.size) {
        headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
        headers['Content-Length'] = end - start + 1;
        res.writeHead(206, headers);
        if (req.method === 'HEAD') return res.end();
        return fs.createReadStream(file, { start, end }).pipe(res);
      }
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
  }
  headers['Content-Length'] = stat.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

/* ---------- block edits, kept on disk ---------- */

let edits = {};          /* "x,y,z" -> block id */
let saveTimer = null;
function loadEdits() {
  try { edits = JSON.parse(fs.readFileSync(DATA, 'utf8')) || {}; } catch (e) { edits = {}; }
}
function saveEdits() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(DATA), { recursive: true });
      fs.writeFileSync(DATA, JSON.stringify(edits));
    } catch (e) { console.error('could not save edits:', e.message); }
  }, 1500);
}
function applyEdit(x, y, z, id) {
  if (![x, y, z, id].every(Number.isInteger)) return false;
  if (x < 0 || y < 0 || z < 0 || x >= 192 || y >= 40 || z >= 192 || id < 0 || id > 60) return false;
  if (Object.keys(edits).length > MAX_EDITS && !(`${x},${y},${z}` in edits)) return false;
  edits[`${x},${y},${z}`] = id;
  saveEdits();
  return true;
}
loadEdits();

/* ---------- the numbers on Joe's desk ---------- */

const STATS = path.join(path.dirname(DATA), 'stats.json');
let stats = { fireworks: 0, blocks: 0, visits: 0, days: {} };
try { stats = Object.assign(stats, JSON.parse(fs.readFileSync(STATS, 'utf8')) || {}); } catch (e) { /* fresh */ }
let statsTimer = null;
function saveStats() {
  clearTimeout(statsTimer);
  statsTimer = setTimeout(() => {
    try { fs.mkdirSync(path.dirname(STATS), { recursive: true }); fs.writeFileSync(STATS, JSON.stringify(stats)); } catch (e) { /* best effort */ }
  }, 3000);
}
function today() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); }
function bump(key) { stats[key] = (stats[key] || 0) + 1; saveStats(); }
function visit() {
  const d = today();
  if (!stats.days[d]) { stats.days[d] = 0; const keys = Object.keys(stats.days).sort(); while (keys.length > 60) delete stats.days[keys.shift()]; }
  stats.days[d]++; stats.visits++; saveStats();
}

/* ---------- the guestbook ---------- */

const BOOK = path.join(path.dirname(DATA), 'guestbook.json');
let book = [];
try { book = JSON.parse(fs.readFileSync(BOOK, 'utf8')) || []; } catch (e) { book = []; }
function saveBook() {
  try { fs.mkdirSync(path.dirname(BOOK), { recursive: true }); fs.writeFileSync(BOOK, JSON.stringify(book.slice(-400))); } catch (e) { console.error('could not save guestbook:', e.message); }
}
function clean(str, max) {
  return String(str || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}
const lastNote = new Map();   /* ip -> time */
function addNote(ip, name, text) {
  const now = Date.now();
  if (now - (lastNote.get(ip) || 0) < 20000) return null;
  const note = { name: clean(name, 24) || 'someone', text: clean(text, 90), at: now };
  if (!note.text) return null;
  lastNote.set(ip, now);
  book.push(note);
  if (book.length > 400) book = book.slice(-400);
  saveBook();
  return note;
}
function readBody(req, limit, cb) {
  let body = '';
  req.on('data', (d) => { body += d; if (body.length > limit) { req.destroy(); } });
  req.on('end', () => cb(body));
}

/* ---------- the Brief ---------- */

let brief = { title: '', link: 'https://themorganbrief.com', summary: '', date: '', at: 0 };
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, function (_, n) {
      var c = Number(n);
      return (c > 0 && c < 0x110000) ? String.fromCodePoint(c) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, function (_, h) {
      var c = parseInt(h, 16);
      return (c > 0 && c < 0x110000) ? String.fromCodePoint(c) : '';
    })
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}
function stripHtml(h) {
  return decodeEntities(String(h || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}
function fetchBrief(cb) {
  if (Date.now() - brief.at < 600000 && brief.title) return cb(brief);
  const req = https.get('https://themorganbrief.com/feed', { headers: { 'User-Agent': 'joe.ag' }, timeout: 6000 }, (r) => {
    let body = '';
    r.on('data', (d) => { body += d; if (body.length > 400000) r.destroy(); });
    r.on('end', () => {
      const item = /<item>([\s\S]*?)<\/item>/.exec(body);
      if (item) {
        const t = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(item[1]);
        const l = /<link>([\s\S]*?)<\/link>/.exec(item[1]);
        const d = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(item[1]);
        const body = /<content:encoded>([\s\S]*?)<\/content:encoded>/.exec(item[1]) || /<description>([\s\S]*?)<\/description>/.exec(item[1]);
        brief = { title: t ? stripHtml(t[1]) : '', link: l ? l[1].trim() : brief.link, summary: body ? stripHtml(body[1]).slice(0, 600) : '', date: d ? d[1].trim() : '', at: Date.now() };
      } else brief.at = Date.now();
      cb(brief);
    });
  });
  req.on('error', () => { brief.at = Date.now(); cb(brief); });
  req.on('timeout', () => { req.destroy(); });
}

/* ---------- http ---------- */

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch (e) { return send(res, 400, 'Bad request'); }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch (e) { return send(res, 400, 'Bad request'); }

  if (pathname === '/api/guestbook') {
    if (req.method === 'POST') {
      return readBody(req, 2048, (body) => {
        let data;
        try { data = JSON.parse(body); } catch (e) { return send(res, 400, 'Bad request'); }
        const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
        const note = addNote(ip, data.name, data.text);
        if (!note) return send(res, 429, 'One line every twenty seconds, and it has to say something.');
        broadcast(null, Object.assign({ t: 'note' }, note));
        return json(res, 200, note);
      });
    }
    return json(res, 200, book.slice(-24));
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  if (pathname === '/api/edits') return json(res, 200, edits);
  if (pathname === '/api/brief') return fetchBrief((b) => json(res, 200, { title: b.title, link: b.link, summary: b.summary, date: b.date }));
  if (pathname === '/api/reset') {
    if (!RESET_KEY || url.searchParams.get('key') !== RESET_KEY) return send(res, 403, 'No.');
    edits = {}; saveEdits(); broadcast(null, { t: 'reset' });
    return send(res, 200, 'Reset. The town is clean again.');
  }
  if (pathname === '/api/count') return json(res, 200, { people: clients.size });
  if (pathname === '/api/stats') return json(res, 200, { people: clients.size, fireworks: stats.fireworks, blocks: stats.blocks, visits: stats.visits, today: stats.days[today()] || 0, notes: book.length });

  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.normalize(path.join(ROOT, pathname));
  if (!file.startsWith(ROOT + path.sep)) return send(res, 403, 'Forbidden');
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, 'Not found');
    serveFile(req, res, file, stat);
  });
});

/* ---------- websocket relay (RFC 6455, the parts we need) ---------- */

const clients = new Map();   /* socket -> { id, state } */
let nextId = 1;

function frame(data) {
  const payload = Buffer.from(data);
  const len = payload.length;
  let header;
  if (len < 126) header = Buffer.from([0x81, len]);
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([header, payload]);
}
function sendTo(sock, obj) {
  if (sock.destroyed) return;
  try { sock.write(frame(JSON.stringify(obj))); } catch (e) { /* gone */ }
}
function broadcast(from, obj) {
  const msg = frame(JSON.stringify(obj));
  for (const [sock] of clients) {
    if (sock === from || sock.destroyed) continue;
    try { sock.write(msg); } catch (e) { /* gone */ }
  }
}

server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || req.url !== '/ws') { sock.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  sock.setNoDelay(true);

  const me = { id: nextId++, state: null, lastEdit: 0 };
  clients.set(sock, me);
  visit();
  sendTo(sock, { t: 'hello', id: me.id, people: [...clients.values()].filter(c => c !== me && c.state).map(c => Object.assign({ id: c.id }, c.state)) });
  broadcast(sock, { t: 'join', id: me.id });

  let buf = Buffer.alloc(0);
  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (len > 65536) { sock.destroy(); return; }
      if (!masked) { sock.destroy(); return; }
      if (buf.length < off + 4 + len) return;
      const mask = buf.slice(off, off + 4);
      const data = Buffer.alloc(len);
      for (let i = 0; i < len; i++) data[i] = buf[off + 4 + i] ^ mask[i & 3];
      buf = buf.slice(off + 4 + len);
      if (op === 8) { sock.end(); return; }
      if (op === 9) { try { sock.write(Buffer.concat([Buffer.from([0x8a, data.length]), data])); } catch (e) {} continue; }
      if (op !== 1 || !fin) continue;
      let msg;
      try { msg = JSON.parse(data.toString('utf8')); } catch (e) { continue; }
      handle(sock, me, msg);
    }
  });
  const bye = () => { if (clients.delete(sock)) broadcast(sock, { t: 'leave', id: me.id }); };
  sock.on('close', bye); sock.on('error', bye); sock.on('end', bye);
});

function handle(sock, me, msg) {
  if (!msg || typeof msg.t !== 'string') return;
  switch (msg.t) {
    case 'pos': {
      const s = { x: +msg.x, y: +msg.y, z: +msg.z, yaw: +msg.yaw, pitch: +msg.pitch, n: clean(msg.n, 24), m: msg.m ? 1 : 0 };
      if ([s.x, s.y, s.z, s.yaw, s.pitch].some(Number.isNaN)) return;
      me.state = s;
      broadcast(sock, Object.assign({ t: 'pos', id: me.id }, s));
      break;
    }
    case 'fire': {
      if ([msg.x, msg.y, msg.z, msg.dx, msg.dy, msg.dz].some(v => typeof v !== 'number')) return;
      broadcast(sock, { t: 'fire', id: me.id, x: msg.x, y: msg.y, z: msg.z, dx: msg.dx, dy: msg.dy, dz: msg.dz });
      bump('fireworks');
      break;
    }
    case 'edit': {
      const now = Date.now();
      if (now - me.lastEdit < 60) return;           /* no block machine guns */
      me.lastEdit = now;
      if (!applyEdit(msg.x, msg.y, msg.z, msg.id)) return;
      broadcast(sock, { t: 'edit', x: msg.x, y: msg.y, z: msg.z, id: msg.id });
      if (msg.id) bump('blocks');
      break;
    }
    default: break;
  }
}

server.listen(PORT, () => { console.log(`joe.ag listening on :${PORT}`); });
