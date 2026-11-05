/* joe.ag — the player, the camera, input, and everything on the screen.
   The world is in world.js, the sky in sky.js, the people in players.js,
   the vehicles in vehicles.js, the fireworks in fireworks.js, sound in audio.js. */

(function () {
  'use strict';

  var W = window.WORLD, B = window.BLOCKS, ID = W.ID;
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('view'), overlay = $('overlay'), startBtn = $('start'), fine = $('fine');
  var prompt = $('prompt'), promptTitle = $('prompt-title'), promptSub = $('prompt-sub'), promptKey = $('prompt-key');
  var whereEl = $('where'), whoEl = $('people'), clockEl = $('clock'), toastEl = $('toast'), tollEl = $('toll');
  var touchUI = $('touch'), stick = $('stick'), knob = $('knob');
  var jumpBtn = $('jump'), visitBtn = $('visit'), fireBtn = $('fire'), buildBtn = $('build'), soundBtn = $('sound'), mapBtn = $('mapbtn');
  var hotbar = $('hotbar'), minimap = $('minimap'), crosshair = $('crosshair');
  var photoBtn = $('photo'), nameInput = $('name'), bar = $('bar'), released = $('released');
  var book = $('book'), bookForm = $('bookform'), bookText = $('booktext'), bookClose = $('bookclose'), bookStatus = $('bookstatus');

  var isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  /* ---------- renderer, scene, world ---------- */

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !isTouch, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(68, 1, 0.1, 1200);
  scene.add(camera);

  scene.add(W.group);
  var ready = false;
  W.build(function (k) { bar.style.width = Math.round(k * 100) + '%'; }).then(function () {
    ready = true;
    startBtn.disabled = false;
    startBtn.textContent = 'Walk in';
    bar.parentElement.style.visibility = 'hidden';
    mapBase = null;
  });

  function blockMat(tileName) {
    var tw = 1 / B.COLS, th = 1 / B.ROWS, tile = B.tile[tileName];
    var t = W.texture.clone();
    t.needsUpdate = true;
    t.repeat.set(tw, th);
    t.offset.set((tile % B.COLS) * tw, 1 - (Math.floor(tile / B.COLS) + 1) * th);
    return new THREE.MeshLambertMaterial({ map: t });
  }

  var mapBase = null;
  var sky = window.Sky(scene, camera, W);
  var fireworks = window.Fireworks(scene, camera);
  var people = window.Players(scene, W, blockMat);
  var vehicles = window.Vehicles(scene, W, blockMat);

  /* ---------- signs ---------- */

  var signs = {};
  var signMeshes = [];
  function isUrlLine(s) { return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(String(s || '').trim()); }
  function hostOf(href) {
    try { return new URL(href).host.replace(/^www\./, ''); } catch (e) { return ''; }
  }
  function plaqueLines(p) {
    var lines = (p.lines && p.lines.length) ? p.lines.slice() : (p.sub ? [p.sub] : []);
    return lines.filter(function (l) { return l && !isUrlLine(l); });
  }
  function promptSub(p) {
    var human = '';
    if (p.sub && !isUrlLine(p.sub)) human = p.sub;
    else if (p.lines && p.lines.length && !isUrlLine(p.lines[0])) human = p.lines[0];
    var host = p.href ? hostOf(p.href) : '';
    if (human && host) return human + '  ·  ' + host;
    return host || human || '';
  }
  function fitFont(x, text, max, size, family, weight) {
    var s = size;
    do {
      x.font = weight + ' ' + s + 'px ' + family;
      if (x.measureText(text).width <= max || s <= 18) return s;
      s -= 2;
    } while (s > 16);
    return s;
  }
  function wrapText(x, text, max) {
    var words = String(text || '').split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) {
      if (!w) return;
      var test = cur ? cur + ' ' + w : w;
      if (x.measureText(test).width > max && cur) { lines.push(cur); cur = w; } else cur = test;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function drawSign(c, p) {
    var x = c.getContext('2d');
    var serif = '"Playfair Display", Georgia, serif';
    var sans = 'Inter, sans-serif';
    var max = c.width - 56;
    x.clearRect(0, 0, c.width, c.height);
    x.fillStyle = '#F6F3EC'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#C56A3A'; x.fillRect(0, 0, c.width, 8);
    x.strokeStyle = '#1C1917'; x.lineWidth = 3; x.strokeRect(1.5, 1.5, c.width - 3, c.height - 3);
    x.font = '400 24px ' + sans;
    var lines = [];
    plaqueLines(p).forEach(function (l) { wrapText(x, l, max).forEach(function (w) { lines.push(w); }); });
    lines = lines.slice(0, 2);
    var title = p.text || p.title || '';
    x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillStyle = '#1C1917';
    fitFont(x, title, max, lines.length > 1 ? 46 : 54, serif, '500');
    x.fillText(title, c.width / 2, lines.length ? 96 : 124, max);
    x.fillStyle = '#3F463C';
    lines.forEach(function (l, i) {
      fitFont(x, l, max, 26, sans, '400');
      x.fillText(l, c.width / 2, 150 + i * 34, max);
    });
  }
  function makeSign(p) {
    var c = document.createElement('canvas');
    c.width = 640; c.height = 220;
    drawSign(c, p);
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter;
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: true }));
    var k = p.small ? 0.62 : 1;
    var w = 5.2 * k;
    s.scale.set(w, w * c.height / c.width, 1);
    var pos = p.sign || { x: p.x, y: p.y + 4.2, z: p.z - 0.5 };
    s.position.set(pos.x + 0.5, pos.y, pos.z + 0.5);
    s.userData = { canvas: c, texture: t, place: p };
    return s;
  }
  W.places.forEach(function (p) {
    if (p.sign === null) return;
    var s = makeSign(p);
    scene.add(s);
    signMeshes.push(s);
    if (p.id) signs[p.id] = s;
  });
  function redrawSigns() {
    signMeshes.forEach(function (s) {
      drawSign(s.userData.canvas, s.userData.place);
      s.userData.texture.needsUpdate = true;
    });
  }
  function updateSign(id, patch) {
    var s = signs[id]; if (!s) return;
    Object.assign(s.userData.place, patch);
    drawSign(s.userData.canvas, s.userData.place);
    s.userData.texture.needsUpdate = true;
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redrawSigns);

  /* ---------- the launcher in hand ---------- */

  var hand = new THREE.Group();
  (function () {
    var clay = new THREE.MeshBasicMaterial({ color: 0xc56a3a });
    var paper = new THREE.MeshBasicMaterial({ color: 0xf6f3ec });
    var ink = new THREE.MeshBasicMaterial({ color: 0x1c1917 });
    /* a cardboard tube standing up, with a rocket nose out the top */
    var tube = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.052, 0.2, 16), paper);
    var band = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.032, 16), clay);
    var nose = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 10), clay);
    var stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.11, 6), ink);
    var spark = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), clay);
    band.position.y = -0.02;
    nose.position.y = 0.145;
    stick.position.set(0.055, 0.02, 0); stick.rotation.z = 0.9;
    spark.position.set(0.1, 0.07, 0);
    hand.add(tube); hand.add(band); hand.add(nose); hand.add(stick); hand.add(spark);
    hand.position.set(0.46, -0.28, -0.5);
    hand.rotation.set(-0.35, -0.2, 0.15);
    camera.add(hand);
  })();
  var heldBlock = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), blockMat('planks'));
  heldBlock.position.set(0.38, -0.32, -0.7); heldBlock.rotation.set(0.3, 0.6, 0); heldBlock.visible = false;
  camera.add(heldBlock);
  var kick = 0, lastShot = 0;

  /* ---------- who you are ---------- */

  var TOWNS = ['Roanoke', 'Haslet', 'Keller', 'Justin', 'Northlake', 'Argyle', 'Denton', 'Fort Worth', 'Saginaw', 'Rhome', 'Decatur', 'Flower Mound', 'Trophy Club', 'Westlake'];
  var myName = '';
  try { myName = localStorage.getItem('joeag-name') || ''; } catch (e) {}
  if (!myName) myName = 'visitor from ' + TOWNS[Math.floor(Math.random() * TOWNS.length)];
  nameInput.value = myName;
  function commitName() {
    var v = nameInput.value.replace(/\s+/g, ' ').trim().slice(0, 24);
    if (v) myName = v;
    try { localStorage.setItem('joeag-name', myName); } catch (e) {}
    lastSent = null;
  }
  nameInput.addEventListener('change', commitName);
  nameInput.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') { commitName(); startBtn.click(); } });
  nameInput.addEventListener('keyup', function (e) { e.stopPropagation(); });

  /* ---------- network ---------- */

  var net = window.Net({
    hello: function (m) { m.people.forEach(people.upsert); setPeople(); },
    join: function () { setPeople(); },
    leave: function (m) { people.remove(m.id); setPeople(); },
    pos: function (m) { people.upsert(m); setPeople(); },
    fire: function (m) { fireworks.remote(m); },
    edit: function (m) { W.setBlock(m.x, m.y, m.z, m.id); },
    reset: function () { location.reload(); },
    note: function (m) {
      var i;
      for (i = notes.length - 1; i >= Math.max(0, notes.length - 5); i--) if (notes[i].at === m.at && notes[i].text === m.text) return;
      notes.push(m); renderNotes(); toast(m.name + ' wrote on the Diner wall.');
    },
    offline: function () { Object.keys(people.people).forEach(function (k) { people.remove(Number(k)); }); setPeople(); }
  });
  function setPeople() {
    var n = people.count();
    whoEl.textContent = n === 0 ? 'Just you here' : (n === 1 ? 'One other person here' : n + ' other people here');
  }
  setPeople();
  net.loadEdits(function (edits) {
    var k, p;
    for (k in edits) { p = k.split(',').map(Number); W.setBlock(p[0], p[1], p[2], edits[k]); }
  });
  net.loadBrief(function (b) {
    if (b && b.title) updateSign('brief', { text: 'This morning', lines: [b.title], href: b.link || 'https://themorganbrief.com' });
    var place = W.places.filter(function (p) { return p.id === 'brief'; })[0];
    if (place) { place.sub = b && b.title ? 'read this morning\'s Brief' : 'every morning'; if (b && b.link) place.href = b.link; }
    newspaper(b);
  });

  /* ---------- the front page on The Brief ---------- */

  function wrap(x, text, maxWidth) {
    var words = text.split(' '), lines = [], cur = '';
    words.forEach(function (w) {
      var test = cur ? cur + ' ' + w : w;
      if (x.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; } else cur = test;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  var paperMesh = null, paperBrief = null;
  function paintPaper(c, b) {
    var x = c.getContext('2d');
    var serif = '"Playfair Display", Georgia, "Times New Roman", serif';
    var pad = 72;
    x.fillStyle = '#F6F3EC'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#1C1917';
    x.fillRect(pad, 28, c.width - pad * 2, 4);
    x.textAlign = 'center'; x.font = '500 64px ' + serif;
    x.fillText('The Morgan Brief', c.width / 2, 108);
    x.font = '400 22px Inter, sans-serif'; x.fillStyle = '#6B655C';
    var dateText = 'Every morning';
    if (b && b.date) { var d = new Date(b.date); if (!isNaN(d)) dateText = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); }
    x.fillText(dateText, c.width / 2, 142);
    x.fillStyle = '#C56A3A'; x.fillRect(c.width / 2 - 28, 158, 56, 3);
    var title = (b && b.title) || 'The stories worth knowing each morning, plus my take.';
    var size = 46, inner = c.width - pad * 2, tl, y;
    x.fillStyle = '#1C1917'; x.textAlign = 'center';
    do {
      x.font = '500 ' + size + 'px ' + serif;
      tl = wrap(x, title, inner);
      size -= 2;
    } while (tl.length > 3 && size > 26);
    tl = tl.slice(0, 3);
    y = 214;
    tl.forEach(function (l) { x.fillText(l, c.width / 2, y, inner); y += size + 18; });
    x.font = '400 32px ' + serif; x.fillStyle = '#3F463C'; x.textAlign = 'left';
    var body = (b && b.summary) || 'The stories worth knowing each morning, plus my take.';
    var cols = 2, gap = 36, colW = (inner - gap) / cols;
    var lines = wrap(x, body, colW), perCol = Math.max(1, Math.floor((c.height - 36 - y) / 32)), k;
    for (k = 0; k < lines.length && k < perCol * cols; k++) x.fillText(lines[k], pad + Math.floor(k / perCol) * (colW + gap), y + 8 + (k % perCol) * 32);
  }
  function newspaper(b) {
    var f = W.briefFront(); if (!f) return;
    paperBrief = b || null;
    var c = document.createElement('canvas'); c.width = 1536; c.height = 640;
    paintPaper(c, b);
    if (paperMesh) {
      paperMesh.material.map.image = c;
      paperMesh.material.map.needsUpdate = true;
      paperMesh.userData.canvas = c;
      return;
    }
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter;
    /* unlit, so the page stays paper-colored after dark */
    var m = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.h), new THREE.MeshBasicMaterial({ map: t, fog: true }));
    m.position.set(f.x, f.y, f.z);
    m.userData.canvas = c;
    paperMesh = m;
    scene.add(m);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { if (paperMesh) newspaper(paperBrief); });
  }
  if (!/^https?:$/.test(location.protocol)) newspaper(null);

  /* ---------- Joe's place ---------- */

  var J = W.joes();
  var homeLit = false, homeInside = false;
  function pixelPortrait(name) {
    /* a 16x16 painting, drawn from text */
    var luke = [
      '................', '......####......', '.....######.....', '....########....', '....##.##.##....', '....########....',
      '.....##..##.....', '......####......', '....########....', '...##########...', '..############..', '..############..',
      '..##.######.##..', '..##..####..##..', '..##..####..##..', '................'];
    var novy = luke;
    var rows = name === 'Luke' ? luke : novy, body = name === 'Luke' ? '#1a1a1a' : '#b5522a', light = name === 'Luke' ? '#333' : '#e7b98a';
    var c = document.createElement('canvas'); c.width = 256; c.height = 256;
    var x = c.getContext('2d');
    x.fillStyle = '#d8c7a0'; x.fillRect(0, 0, 256, 256);
    x.fillStyle = '#5a3a1e'; x.fillRect(0, 0, 256, 14); x.fillRect(0, 242, 256, 14); x.fillRect(0, 0, 14, 256); x.fillRect(242, 0, 14, 256);
    var i, j, k = 14;
    for (j = 0; j < 16; j++) for (i = 0; i < 16; i++) if (rows[j][i] === '#') { x.fillStyle = (j === 4 && (i === 6 || i === 9)) ? '#fff' : (j > 11 && (i < 4 || i > 11) ? light : body); x.fillRect(16 + i * k, 16 + j * k, k, k); }
    if (name === 'Novy') { x.fillStyle = '#fff'; x.fillRect(16 + 7 * k, 16 + 6 * k, 2 * k, k); x.fillRect(16 + 6 * k, 16 + 9 * k, 4 * k, 3 * k); }
    x.fillStyle = '#5a3a1e'; x.font = 'bold 22px "Courier New", monospace'; x.textAlign = 'center'; x.fillText(name, 128, 234);
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter;
    return new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshLambertMaterial({ map: t }));
  }
  var FACTS = [
    ['web', 'Builds websites. Fifteen years of it, freelance, before any of this town.'],
    ['2019', 'Texas A&M. B.S. Political Science. Studied abroad in Europe along the way.'],
    ['ops', 'Healthcare operations. Nine years and counting.'],
    ['now', 'Senior Manager, AI, at CVS Health.'],
    ['JLM Brands', 'The company under which everything in this town got built.'],
    ['Haslet, TX', 'Home. The water tower is real. The toll is real too.'],
    ['Luke & Novy', 'Black Lab and a toller. They run this place.']
  ];
  function wallPage() {
    var c = document.createElement('canvas'); c.width = 1024; c.height = 768;
    var x = c.getContext('2d');
    x.fillStyle = '#F6F3EC'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#1C1917'; x.font = '500 54px "Playfair Display", Georgia, serif'; x.textAlign = 'left';
    x.fillText('Joseph Morgan', 48, 84);
    x.font = '400 22px Inter, sans-serif'; x.fillStyle = '#6B655C'; x.fillText('the short version', 48, 122);
    var y = 190, i;
    for (i = 0; i < FACTS.length; i++) {
      x.fillStyle = '#C56A3A'; x.font = '500 26px Inter, sans-serif'; x.fillText(FACTS[i][0], 48, y);
      x.fillStyle = '#1C1917'; x.font = '400 26px "Playfair Display", Georgia, serif';
      wrap(x, FACTS[i][1], 700).forEach(function (l, k) { x.fillText(l, 290, y + k * 32); });
      y += 78;
    }
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter;
    var m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.4), new THREE.MeshLambertMaterial({ map: t }));
    m.rotation.y = Math.PI / 2;
    return m;
  }
  var wallStep = 0;
  function wallTour() {
    var f = FACTS[wallStep % FACTS.length]; wallStep++;
    toast(f[0] + ': ' + f[1], 4500);
  }
  var screenCanvas = document.createElement('canvas'); screenCanvas.width = 512; screenCanvas.height = 384;
  var screenTex = new THREE.CanvasTexture(screenCanvas); screenTex.colorSpace = THREE.SRGBColorSpace; screenTex.minFilter = THREE.LinearFilter;
  function drawScreen(st) {
    var x = screenCanvas.getContext('2d');
    x.fillStyle = '#0b1a14'; x.fillRect(0, 0, 512, 384);
    x.fillStyle = '#52e08a'; x.font = 'bold 30px "Courier New", monospace'; x.textAlign = 'left';
    x.fillText('JOE.AG // DESK', 24, 48);
    x.fillStyle = '#2a6a46'; x.fillRect(24, 62, 464, 2);
    var rows = st ? [
      ['people here now', String(st.people)],
      ['visitors today', String(st.today)],
      ['visitors, all time', String(st.visits)],
      ['fireworks fired', String(st.fireworks)],
      ['blocks placed', String(st.blocks)],
      ['lines in the guestbook', String(st.notes)]
    ] : (/^https?:$/.test(location.protocol) ? [['connecting', '']] : [['no server here', ''], ['numbers live on joe.ag', '']]);
    x.font = '24px "Courier New", monospace';
    rows.forEach(function (r, i) {
      x.fillStyle = '#9fe8bf'; x.fillText(r[0], 24, 110 + i * 42);
      x.fillStyle = '#ffffff'; x.textAlign = 'right'; x.fillText(r[1], 488, 110 + i * 42); x.textAlign = 'left';
    });
    x.fillStyle = '#52e08a'; x.font = '18px "Courier New", monospace';
    x.fillText(clockText(sky.hour()), 24, 368);
    if (Math.floor(performance.now() / 600) % 2 === 0) x.fillRect(470, 352, 14, 20);
    screenTex.needsUpdate = true;
  }
  var lastStats = null, statsAt = -1e9;
  if (J) {
    scene.add((function () { var m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.75), new THREE.MeshBasicMaterial({ map: screenTex })); m.position.set(J.screen.x, J.screen.y, J.screen.z); return m; })());
    J.portraits.forEach(function (pt) { var m = pixelPortrait(pt.name); m.position.set(pt.x + 0.5, pt.y, pt.z); scene.add(m); });
    var wp = wallPage(); wp.position.set(J.timeline.x, J.timeline.y, J.timeline.z); scene.add(wp);
    drawScreen(null);
  }
  function homeTick(dt) {
    if (!J) return;
    var inside = player.x > J.x0 && player.x < J.x1 + 1 && player.z > J.z0 && player.z < J.z1 + 1 && player.y >= J.y - 0.5 && player.y < J.y + 3;
    if (inside && !homeInside) arriveHome();
    homeInside = inside;
    if (inside && performance.now() - statsAt > 20000) {
      statsAt = performance.now();
      net.loadStats(function (st) { lastStats = st; drawScreen(st); });
    } else if (inside && Math.floor(acc * 2) !== Math.floor((acc - dt) * 2)) drawScreen(lastStats);
  }
  function arriveHome() {
    if (homeLit) return;
    homeLit = true;
    var i;
    J.lamps.forEach(function (l, k) {
      setTimeout(function () { W.setBlock(l[0], l[1], l[2], ID.lamp); if (window.JoeAudio) window.JoeAudio.place(); }, 500 + k * 320);
      /* one flicker */
      setTimeout(function () { W.setBlock(l[0], l[1], l[2], ID.black); }, 500 + k * 320 + 90);
      setTimeout(function () { W.setBlock(l[0], l[1], l[2], ID.lamp); }, 500 + k * 320 + 180);
    });
    setTimeout(function () { W.setBlock(J.fire[0], J.fire[1], J.fire[2], ID.fire); toast('The fire is on. Make yourself at home.', 3500); }, 2300);
    setTimeout(function () { if (window.JoeAudio) window.JoeAudio.narrate(); }, 2600);
    /* the dogs come home */
    people.dogs.forEach(function (d, k) {
      setTimeout(function () {
        d.x = J.door.x + 0.5 + (k ? 1 : -1); d.z = J.door.z + 1.5; d.following = true;
        if (window.JoeAudio) window.JoeAudio.bark();
      }, 1200 + k * 500);
    });
    for (i = 0; i < 1; i++) { /* keep linter quiet */ }
  }
  function knock() {
    if (window.JoeAudio) { window.JoeAudio.step('wood'); setTimeout(function () { window.JoeAudio.step('wood'); }, 160); setTimeout(function () { window.JoeAudio.bark(); }, 600); }
    toast(homeLit ? 'Come on in.' : 'Nobody answers. The door is open, though. Go on in.', 3500);
  }

  /* ---------- the guestbook ---------- */

  var notes = [], noteSprites = [];
  function noteSprite(n, side) {
    var c = document.createElement('canvas'); c.width = 512; c.height = 128;
    var x = c.getContext('2d');
    x.fillStyle = '#F6F3EC'; x.fillRect(0, 0, 512, 128);
    x.fillStyle = '#C56A3A'; x.fillRect(0, 0, 512, 6);
    x.strokeStyle = '#1C1917'; x.lineWidth = 2; x.strokeRect(1, 1, 510, 126);
    x.fillStyle = '#1C1917'; x.textAlign = 'left'; x.font = '400 26px Inter, sans-serif';
    var lines = wrap(x, n.text, 476).slice(0, 2);
    lines.forEach(function (l, i) { x.fillText(l, 18, 46 + i * 32); });
    x.fillStyle = '#6B655C'; x.font = '400 18px Inter, sans-serif'; x.textAlign = 'right';
    x.fillText('\u2014 ' + n.name, 494, 112);
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter;
    var m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: t }));
    m.rotation.y = side === 'west' ? Math.PI / 2 : -Math.PI / 2;
    return m;
  }
  function renderNotes() {
    var walls = W.guestWalls(); if (!walls) return;
    noteSprites.forEach(function (m) { scene.remove(m); });
    noteSprites = [];
    var recent = notes.slice(-16), i, n, side, w, slot, z, y;
    for (i = 0; i < recent.length; i++) {
      n = recent[recent.length - 1 - i];
      side = i % 2 ? 'east' : 'west'; w = walls[side];
      slot = Math.floor(i / 2);
      z = w.z0 + 0.9 + (slot % 4) * 1.75; y = w.y + 0.3 - Math.floor(slot / 4) * 0.55;
      if (z > w.z1 + 0.5) continue;
      var m = noteSprite(n, side);
      m.position.set(w.x, y, z);
      scene.add(m); noteSprites.push(m);
    }
  }
  net.loadBook(function (list) { notes = list || []; renderNotes(); });
  function openBook() {
    book.hidden = false; bookStatus.textContent = ''; bookText.value = '';
    if (document.pointerLockElement) document.exitPointerLock();
    setTimeout(function () { bookText.focus(); }, 50);
  }
  function closeBook() { book.hidden = true; if (!isTouch) canvas.requestPointerLock(); }
  bookClose.addEventListener('click', closeBook);
  bookText.addEventListener('keydown', function (e) { e.stopPropagation(); });
  bookText.addEventListener('keyup', function (e) { e.stopPropagation(); });
  bookForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = bookText.value.trim();
    if (!text) return;
    bookStatus.textContent = 'Writing it on the wall.';
    net.postNote(myName, text, function (note, err) {
      if (note) { notes.push(note); renderNotes(); closeBook(); toast('It is on the wall.'); if (window.JoeAudio) window.JoeAudio.play('chime'); }
      else if (err === 'offline') { notes.push({ name: myName, text: text, at: Date.now() }); renderNotes(); closeBook(); toast('No server here, so it stays on the wall for this visit only.'); }
      else bookStatus.textContent = err;
    });
  });

  /* ---------- the player ---------- */

  var player = {
    x: W.spawn.x + 0.5, y: 0, z: W.spawn.z + 0.5, vx: 0, vy: 0, vz: 0,
    yaw: 0, pitch: -0.04, onGround: false, inWater: false,
    radius: 0.3, height: 1.8, eye: 1.62, moving: false
  };
  player.y = W.surface(W.spawn.x, W.spawn.z) + 1;

  var keys = {};
  var move = { x: 0, z: 0 };
  var wantJump = false;
  var buildMode = false;
  var slot = 0;
  var PALETTE = [['planks', 'planks'], ['brick', 'brick'], ['stone_brick', 'stone_brick'], ['glass', 'glass'], ['log', 'log_side'], ['gold', 'gold'], ['lamp', 'lamp'], ['leaves', 'leaves']];

  function collides(x, y, z) {
    var r = player.radius, h = player.height;
    var x0 = Math.floor(x - r), x1 = Math.floor(x + r), z0 = Math.floor(z - r), z1 = Math.floor(z + r), y0 = Math.floor(y), y1 = Math.floor(y + h - 0.05);
    var i, j, k;
    for (j = y0; j <= y1; j++) for (k = z0; k <= z1; k++) for (i = x0; i <= x1; i++) if (W.solidAt(i, j, k)) return true;
    return false;
  }
  function blockUnder() { return W.get(Math.floor(player.x), Math.floor(player.y - 0.05), Math.floor(player.z)); }
  function surfaceName(id) {
    if (id === ID.grass || id === ID.leaves) return 'grass';
    if (id === ID.dirt || id === ID.hay) return 'dirt';
    if (id === ID.asphalt || id === ID.asphalt_line || id === ID.asphalt_dash) return 'road';
    if (id === ID.planks || id === ID.log || id === ID.door || id === ID.hatch) return 'wood';
    if (id === ID.metal || id === ID.rail) return 'metal';
    if (id === ID.sand) return 'sand';
    return 'stone';
  }

  var stepDist = 0, wasInWater = false;
  function step(dt) {
    if (vehicles.riding()) {
      camera.position.set(player.x, player.y + player.eye, player.z);
      camera.rotation.order = 'YXZ'; camera.rotation.y = player.yaw; camera.rotation.x = player.pitch;
      return;
    }
    var fwd = 0, side = 0;
    if (keys.KeyW || keys.ArrowUp) fwd += 1;
    if (keys.KeyS || keys.ArrowDown) fwd -= 1;
    if (keys.KeyD || keys.ArrowRight) side += 1;
    if (keys.KeyA || keys.ArrowLeft) side -= 1;
    fwd += move.z; side += move.x;
    var len = Math.sqrt(fwd * fwd + side * side);
    if (len > 1) { fwd /= len; side /= len; }
    player.moving = len > 0.1;

    var feet = W.get(Math.floor(player.x), Math.floor(player.y + 0.4), Math.floor(player.z));
    var head = W.get(Math.floor(player.x), Math.floor(player.y + 1.4), Math.floor(player.z));
    player.inWater = feet === ID.water;
    var submerged = head === ID.water;
    if (player.inWater && !wasInWater && window.JoeAudio) window.JoeAudio.splash();
    wasInWater = player.inWater;

    var speed = player.inWater ? 2.6 : 5.2;
    var sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
    var dx = (-sin * fwd + cos * side) * speed, dz = (-cos * fwd - sin * side) * speed;

    if (player.inWater) {
      player.vy += (-3 - player.vy) * Math.min(1, dt * 2);
      if (keys.Space || wantJump) player.vy = submerged ? 3.2 : 4.5;
    } else {
      player.vy -= 22 * dt;
      if ((keys.Space || wantJump) && player.onGround) { player.vy = 7.5; player.onGround = false; }
    }
    wantJump = false;

    var nx = player.x + dx * dt;
    if (!collides(nx, player.y, player.z)) player.x = nx;
    else if ((player.onGround || player.inWater) && !collides(nx, player.y + 1.01, player.z)) { player.x = nx; player.y += 1.01; }
    var nz = player.z + dz * dt;
    if (!collides(player.x, player.y, nz)) player.z = nz;
    else if ((player.onGround || player.inWater) && !collides(player.x, player.y + 1.01, nz)) { player.z = nz; player.y += 1.01; }
    var ny = player.y + player.vy * dt;
    if (collides(player.x, ny, player.z)) {
      if (player.vy < 0) { player.onGround = true; player.y = Math.floor(player.y); }
      player.vy = 0;
    } else { player.y = ny; player.onGround = false; }
    player.x = Math.max(1, Math.min(W.SX - 1, player.x));
    player.z = Math.max(1, Math.min(W.SZ - 1, player.z));
    if (player.y < -10) { player.y = W.surface(Math.floor(player.x), Math.floor(player.z)) + 2; player.vy = 0; }

    /* footsteps */
    if (player.moving && (player.onGround || player.inWater)) {
      stepDist += speed * dt;
      if (stepDist > 2.2) { stepDist = 0; if (window.JoeAudio) window.JoeAudio.step(player.inWater ? 'water' : surfaceName(blockUnder())); }
    }

    camera.position.set(player.x, player.y + (submerged ? 1.2 : player.eye), player.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
  }

  /* ---------- doors open when you come close ---------- */

  function doors() {
    var i, d, dx, dz, near;
    for (i = 0; i < W.doors.length; i++) {
      d = W.doors[i]; dx = d.x + 0.5 - player.x; dz = d.z + 0.5 - player.z;
      near = dx * dx + dz * dz < 6.5;
      if (near && !d.open) { d.open = true; W.setBlock(d.x, d.y, d.z, 0); W.setBlock(d.x, d.y + 1, d.z, 0); if (window.JoeAudio) window.JoeAudio.play('door'); }
      else if (!near && d.open) { d.open = false; W.setBlock(d.x, d.y, d.z, ID.door); W.setBlock(d.x, d.y + 1, d.z, ID.door_top); }
    }
  }

  /* ---------- places, animals, vehicles: what can I do here? ---------- */

  var near = null, nearKind = null, lastNarrateCheck = 0;
  function showPrompt(title, sub, key) {
    promptTitle.textContent = title; promptSub.textContent = sub; promptKey.textContent = key || 'E';
    prompt.hidden = false; visitBtn.hidden = false; visitBtn.textContent = key === 'E' || !key ? 'Visit' : key;
  }
  function hidePrompt() { prompt.hidden = true; visitBtn.hidden = true; }
  function checkNear() {
    var best = null, bd = 1e9, i, p, dx, dy, dz, d, r;
    if (vehicles.riding()) { near = vehicles.riding(); nearKind = 'leave'; showPrompt('Riding ' + near.name, vehicles.riding() === vehicles.truck ? 'W and S drive, A and D change lane' : 'enjoy the view', 'E to get off'); return; }
    for (i = 0; i < W.places.length; i++) {
      p = W.places[i]; r = p.radius || 3.2;
      dx = p.x + 0.5 - player.x; dz = p.z + 0.5 - player.z; dy = p.inside ? (p.y - player.y) : 0; d = dx * dx + dz * dz + dy * dy * 0.5;
      if (d < r * r && d < bd) { bd = d; best = p; }
    }
    var kind = best ? 'place' : null;
    if (!best) { var v = vehicles.nearest(player); if (v) { best = v; kind = 'vehicle'; } }
    if (!best) { var c = people.nearestCow(player, 2.6); if (c) { best = c; kind = 'cow'; } }
    if (!best) { var g = people.nearestDog(player, 2.4); if (g) { best = g; kind = 'dog'; } }
    if (best !== near || kind !== nearKind) {
      near = best; nearKind = kind;
      if (!best) hidePrompt();
      else if (kind === 'place') { showPrompt(best.title, promptSub(best), 'E'); if (best.narrate && window.JoeAudio) window.JoeAudio.narrate(); }
      else if (kind === 'vehicle') showPrompt(best === vehicles.truck ? 'The pickup' : 'The Santa Fe', best === vehicles.truck ? 'hop in' : 'hop on the flat car', 'E');
      else if (kind === 'cow') showPrompt('A cow', 'pet it', 'E');
      else if (kind === 'dog') showPrompt(best.name, best.name === 'Luke' ? 'black Lab, good boy' : 'toller, very good girl', 'E');
    }
  }
  function act() {
    if (!near) return;
    if (nearKind === 'leave') { vehicles.leave(); near = null; hidePrompt(); return; }
    if (nearKind === 'vehicle') { vehicles.board(near); near = null; hidePrompt(); return; }
    if (nearKind === 'cow') { people.pet(near); toast('moo.'); return; }
    if (nearKind === 'dog') { if (window.JoeAudio) window.JoeAudio.bark(); toast(near.name + ' wags.'); return; }
    if (near.id === 'guestbook') { openBook(); return; }
    if (near.id === 'joes-door') { knock(); return; }
    if (near.id === 'joes-desk') { mailto('mailto:mail@jmorg.org?subject=' + encodeURIComponent('I was in your town')); return; }
    if (near.id === 'joes-record') { if (window.JoeAudio && window.JoeAudio.isOn()) { window.JoeAudio.play('narration'); toast('Joe, again.'); } else toast('Turn the sound on first (N).'); return; }
    if (near.id === 'joes-wall') { wallTour(); return; }
    if (!near.href) { toast(near.sub); return; }
    if (/^mailto:/.test(near.href)) { mailto(near.href); return; }
    window.open(near.href, '_blank', 'noopener');
  }

  function mailto(href) {
    var a = document.createElement('a');
    a.href = href; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    toast('Opening your mail app. mail@jmorg.org if it does not.', 4000);
  }

  var toastTimer = 0;
  function toast(text, ms) {
    toastEl.textContent = text; toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, ms || 2600);
  }

  /* ---------- the toll ---------- */

  var tolls = 0, underGantry = false;
  function toll() {
    var inLane = Math.abs(player.x - (W.LANE_X + 0.5)) < 3 && Math.abs(player.z - (W.GANTRY_Z + 0.5)) < 1.2;
    if (inLane && !underGantry) {
      tolls++;
      tollEl.textContent = 'Tolls paid: $' + (tolls * 24).toFixed(2);
      tollEl.hidden = false;
      toast('$24.00. Six miles. Thanks for driving.', 3000);
      if (window.JoeAudio) window.JoeAudio.toll();
      if (tolls === 3) setTimeout(function () { toast('That is $72. The money goes to Amsterdam. Walk back to the gantry and press E.', 6000); }, 3200);
    }
    underGantry = inLane;
  }

  /* ---------- building ---------- */

  function raycast() {
    /* step through blocks along the view until something solid, up to six away */
    var dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    var ox = camera.position.x, oy = camera.position.y, oz = camera.position.z;
    var x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    var sx = dir.x > 0 ? 1 : -1, sy = dir.y > 0 ? 1 : -1, sz = dir.z > 0 ? 1 : -1;
    var tdx = Math.abs(1 / (dir.x || 1e-9)), tdy = Math.abs(1 / (dir.y || 1e-9)), tdz = Math.abs(1 / (dir.z || 1e-9));
    var tx = ((sx > 0 ? x + 1 - ox : ox - x)) * tdx, ty = ((sy > 0 ? y + 1 - oy : oy - y)) * tdy, tz = ((sz > 0 ? z + 1 - oz : oz - z)) * tdz;
    var lx = x, ly = y, lz = z, i, id;
    for (i = 0; i < 40; i++) {
      id = W.get(x, y, z);
      if (id && id !== ID.water) return { x: x, y: y, z: z, px: lx, py: ly, pz: lz, id: id };
      lx = x; ly = y; lz = z;
      if (tx < ty && tx < tz) { if (tx > 6) break; x += sx; tx += tdx; }
      else if (ty < tz) { if (ty > 6) break; y += sy; ty += tdy; }
      else { if (tz > 6) break; z += sz; tz += tdz; }
    }
    return null;
  }
  function protectedBlock(x, y, z) {
    /* keep the roads and the rail; everything else is fair game, and there is a reset */
    return Math.abs(z - W.ROAD_Z) <= 3 && y <= W.GROUND || Math.abs(x - W.LANE_X) <= 3 && y <= W.GROUND || Math.abs(x - W.RAIL_X) <= 1 && y <= W.GROUND;
  }
  function placeBlock() {
    var hit = raycast(); if (!hit) return;
    var x = hit.px, y = hit.py, z = hit.pz;
    if (y < 1 || y >= W.SY - 1) return;
    /* not inside yourself */
    if (Math.floor(player.x) === x && Math.floor(player.z) === z && (y === Math.floor(player.y) || y === Math.floor(player.y + 1))) return;
    var id = ID[PALETTE[slot][0]];
    if (W.setBlock(x, y, z, id)) { net.send({ t: 'edit', x: x, y: y, z: z, id: id }); if (window.JoeAudio) window.JoeAudio.place(); }
  }
  function breakBlock() {
    var hit = raycast(); if (!hit) return;
    if (hit.y < 1 || protectedBlock(hit.x, hit.y, hit.z)) { toast('Not that one.'); return; }
    if (W.setBlock(hit.x, hit.y, hit.z, 0)) { net.send({ t: 'edit', x: hit.x, y: hit.y, z: hit.z, id: 0 }); if (window.JoeAudio) window.JoeAudio.breakBlock(); }
  }
  function setBuildMode(on) {
    buildMode = on;
    hotbar.hidden = !on;
    heldBlock.visible = on; hand.visible = !on;
    if (buildBtn) buildBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (isTouch) crosshair.style.display = on ? 'block' : 'none';
    toast(on ? (isTouch ? 'Build mode. Tap to place a block, hold to break one. Tap a block type below.' : 'Build mode. Left click places, right click breaks. Keys 1 to 8 or the scroll wheel pick the block.') : 'Build mode off.');
  }
  function setSlot(i) {
    slot = i;
    heldBlock.material = blockMat(PALETTE[slot][1]);
    [].slice.call(hotbar.children).forEach(function (el, k) { el.classList.toggle('on', k === slot); });
  }
  PALETTE.forEach(function (p, i) {
    var el = document.createElement('button');
    el.type = 'button'; el.className = 'slot';
    el.innerHTML = '<b></b><span></span>';
    el.querySelector('b').textContent = isTouch ? '' : String(i + 1);
    el.querySelector('span').textContent = p[0].replace('_', ' ');
    el.setAttribute('aria-label', p[0]);
    el.addEventListener('click', function () { setSlot(i); });
    hotbar.appendChild(el);
  });
  setSlot(0);

  function shoot() {
    var now = performance.now();
    if (now - lastShot < 450) return;
    lastShot = now; kick = 1;
    var r = fireworks.fire();
    net.send(Object.assign({ t: 'fire' }, r));
  }

  /* ---------- photo mode ---------- */

  var photoHidden = false;
  function photo() {
    var hud = document.querySelectorAll('.hud, .prompt, .crosshair, .touch, .hotbar, .toast, .tollbox, .minimap');
    hud.forEach(function (el) { el.style.visibility = 'hidden'; });
    renderer.render(scene, camera);
    var out = document.createElement('canvas');
    out.width = canvas.width; out.height = canvas.height;
    var x = out.getContext('2d');
    x.drawImage(canvas, 0, 0);
    x.font = 'italic 500 ' + Math.round(out.width / 28) + 'px "Playfair Display", Georgia, serif';
    x.fillStyle = '#F6F3EC';
    x.textAlign = 'right';
    x.fillText('joe.ag', out.width - out.width / 28, out.height - out.height / 22);
    hud.forEach(function (el) { el.style.visibility = ''; });
    if (window.JoeAudio) window.JoeAudio.shutter();
    var name = 'joe-ag-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.png';
    out.toBlob(function (blob) {
      if (!blob) return;
      var file;
      try { file = new File([blob], name, { type: 'image/png' }); } catch (e) { file = null; }
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'joe.ag', text: 'I was in Joe\'s town. joe.ag' }).catch(function () {});
        return;
      }
      var a = document.createElement('a');
      a.download = name;
      a.href = URL.createObjectURL(blob);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      toast('Saved.');
    }, 'image/png');
  }
  photoBtn.addEventListener('click', photo);

  /* ---------- minimap ---------- */

  var mapOn = false;
  function drawMapBase() {
    var c = document.createElement('canvas'); c.width = W.SX; c.height = W.SZ;
    var x = c.getContext('2d'), img = x.createImageData(W.SX, W.SZ), d = img.data, i, j, id, h, k, col;
    for (j = 0; j < W.SZ; j++) for (i = 0; i < W.SX; i++) {
      h = W.surface(i, j); id = W.get(i, h, j);
      col = [96, 150, 62];
      if (id === ID.water || id === ID.sand && h < W.GROUND) col = [54, 110, 190];
      else if (id === ID.asphalt || id === ID.asphalt_line || id === ID.asphalt_dash) col = [66, 66, 70];
      else if (id === ID.rail) col = [120, 100, 80];
      else if (id === ID.leaves || id === ID.log) col = [40, 90, 40];
      else if (id === ID.sand) col = [214, 200, 150];
      else if (id !== ID.grass && id !== ID.dirt) col = [200, 200, 200];
      k = (j * W.SX + i) * 4; d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  function drawMap() {
    if (!mapBase) mapBase = drawMapBase();
    var S = minimap.width, x = minimap.getContext('2d'), k = S / W.SX;
    x.clearRect(0, 0, S, S);
    x.imageSmoothingEnabled = false;
    x.drawImage(mapBase, 0, 0, S, S);
    W.places.forEach(function (p) {
      if (p.inside) return;
      x.fillStyle = p.kind === 'soon' ? '#8fe0a0' : (p.kind === 'lore' ? '#d8d2b8' : '#9cc8ff');
      x.fillRect(p.x * k - 2, p.z * k - 2, 5, 5);
    });
    var o;
    for (o in people.people) { x.fillStyle = '#ffffff'; x.fillRect(people.people[o].x * k - 2, people.people[o].z * k - 2, 4, 4); }
    x.save(); x.translate(player.x * k, player.z * k); x.rotate(-player.yaw);
    x.fillStyle = '#C56A3A'; x.beginPath(); x.moveTo(0, -7); x.lineTo(5, 5); x.lineTo(-5, 5); x.closePath(); x.fill();
    x.restore();
  }
  function setMap(on) { mapOn = on; minimap.hidden = !on; if (on) drawMap(); }

  function district() {
    var x = player.x - W.C, z = player.z - W.C;
    if (player.z < 12 && Math.abs(x) < 20) return 'The edge';
    if (player.x < 16 && player.z < 16) return 'Out here';
    if (x < -40 && z > 26) return 'The Ranch';
    if (x > 38) return 'Alliance';
    if (z < -20) return 'The Prairie';
    if (Math.abs(x) < 32 && z > -16 && z < 30) return 'Downtown';
    if (z > 30) return 'Henrietta Creek';
    return 'Haslet, Texas';
  }
  function clockText(h) {
    var hh = Math.floor(h), mm = Math.floor((h - hh) * 60), ap = hh >= 12 ? 'pm' : 'am', h12 = hh % 12 || 12;
    return h12 + ':' + (mm < 10 ? '0' : '') + mm + ' ' + ap + ' in Texas';
  }

  /* ---------- input ---------- */

  var locked = false;
  document.addEventListener('mousemove', function (e) {
    if (!locked) return;
    player.yaw -= e.movementX * 0.0022;
    player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch - e.movementY * 0.0022));
  });
  document.addEventListener('pointerlockchange', function () {
    locked = document.pointerLockElement === canvas;
    if (locked) { overlay.hidden = true; released.hidden = true; }
    else { keys = {}; if (arrived) released.hidden = false; }
  });
  document.addEventListener('keydown', function (e) {
    if (!book.hidden) { if (e.key === 'Escape') closeBook(); return; }
    if (!overlay.hidden) return;
    var typing = e.target && e.target.closest && e.target.closest('input, textarea, button, a, summary, details');
    if (typing && !locked) return;
    var active = locked || isTouch || (arrived && !locked && book.hidden);
    if (e.code === 'KeyE' || e.code === 'Enter') { if (active) act(); return; }
    if (e.code === 'KeyF') { if (active) shoot(); return; }
    if (e.code === 'KeyB') { if (active) setBuildMode(!buildMode); return; }
    if (e.code === 'KeyP') { if (active) photo(); return; }
    if (e.code === 'KeyM') { if (active) setMap(!mapOn); return; }
    if (e.code === 'KeyN') { if (active) soundBtn.click(); return; }
    if (e.code === 'KeyT') { if (active) { sky.skip(1); toast(clockText(sky.hour())); } return; }
    if (e.code === 'KeyR') { if (active) { var cyc = ['clear', 'rain', 'storm', 'snow']; var nxt = cyc[(cyc.indexOf(window.__weather || 'clear') + 1) % cyc.length]; window.__weather = nxt; sky.force(nxt); toast('Weather: ' + nxt); } return; }
    if (/^Digit[1-8]$/.test(e.code)) { if (buildMode) setSlot(Number(e.code.slice(5)) - 1); return; }
    keys[e.code] = true;
    if (e.code === 'Space' && active) e.preventDefault();
  });
  document.addEventListener('keyup', function (e) { keys[e.code] = false; });

  var arrived = false;
  startBtn.addEventListener('click', function () {
    if (!ready) return;
    commitName();
    if (!arrived) { arrived = true; setTimeout(function () { toast('Follow the path down to the Diner. The dogs are at the ranch, off to your left.', 5000); }, 800); }
    if (isTouch) { overlay.hidden = true; touchUI.hidden = false; return; }
    canvas.requestPointerLock();
  });
  canvas.addEventListener('click', function () { if (!locked && !isTouch && ready && book.hidden) canvas.requestPointerLock(); });
  released.addEventListener('click', function () { if (!isTouch) canvas.requestPointerLock(); });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  var wheelAcc = 0;
  document.addEventListener('wheel', function (e) {
    if (!buildMode || !(locked || isTouch)) return;
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) < 40) return;
    setSlot((slot + (wheelAcc > 0 ? 1 : PALETTE.length - 1)) % PALETTE.length);
    wheelAcc = 0;
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('mousedown', function (e) {
    if (!locked) return;
    if (buildMode) { if (e.button === 0) placeBlock(); else if (e.button === 2) breakBlock(); }
    else if (e.button === 2) shoot();
  });

  /* touch */
  var stickId = null, lookId = null, lookLast = null, stickCenter = null, lookStart = 0, lookMoved = 0, pressTimer = 0;
  function stickVector(t) {
    var dx = t.clientX - stickCenter.x, dy = t.clientY - stickCenter.y, r = 44, len = Math.sqrt(dx * dx + dy * dy);
    if (len > r) { dx *= r / len; dy *= r / len; }
    knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    move.x = dx / r; move.z = -dy / r;
  }
  stick.addEventListener('touchstart', function (e) {
    var t = e.changedTouches[0], r = stick.getBoundingClientRect();
    stickCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    stickId = t.identifier; stickVector(t); e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchstart', function (e) {
    var i, t;
    for (i = 0; i < e.changedTouches.length; i++) {
      t = e.changedTouches[i];
      if (lookId === null) {
        lookId = t.identifier; lookLast = { x: t.clientX, y: t.clientY }; lookStart = performance.now(); lookMoved = 0;
        clearTimeout(pressTimer);
        if (buildMode) pressTimer = setTimeout(function () { if (lookMoved < 12) { breakBlock(); lookStart = 0; } }, 550);
      }
    }
    e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchmove', function (e) {
    var i, t;
    for (i = 0; i < e.changedTouches.length; i++) {
      t = e.changedTouches[i];
      if (t.identifier === stickId) stickVector(t);
      else if (t.identifier === lookId) {
        lookMoved += Math.abs(t.clientX - lookLast.x) + Math.abs(t.clientY - lookLast.y);
        player.yaw -= (t.clientX - lookLast.x) * 0.006;
        player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch - (t.clientY - lookLast.y) * 0.006));
        lookLast = { x: t.clientX, y: t.clientY };
      }
    }
    if (stickId !== null || lookId !== null) e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchend', function (e) {
    var i, t;
    for (i = 0; i < e.changedTouches.length; i++) {
      t = e.changedTouches[i];
      if (t.identifier === stickId) { stickId = null; move.x = 0; move.z = 0; knob.style.transform = ''; }
      if (t.identifier === lookId) {
        clearTimeout(pressTimer);
        if (buildMode && lookStart && performance.now() - lookStart < 350 && lookMoved < 12) placeBlock();
        lookId = null;
      }
    }
  });
  jumpBtn.addEventListener('touchstart', function (e) { wantJump = true; e.preventDefault(); }, { passive: false });
  fireBtn.addEventListener('touchstart', function (e) { shoot(); e.preventDefault(); }, { passive: false });
  visitBtn.addEventListener('click', act);
  buildBtn.addEventListener('click', function () { setBuildMode(!buildMode); });
  mapBtn.addEventListener('click', function () { setMap(!mapOn); });
  if (!isTouch) { soundBtn.textContent = 'Sound off (N)'; mapBtn.textContent = 'Map (M)'; buildBtn.textContent = 'Build (B)'; photoBtn.textContent = 'Photo (P)'; }
  soundBtn.addEventListener('click', function () {
    var on = window.JoeAudio.toggle();
    soundBtn.textContent = (on ? 'Sound on' : 'Sound off') + (isTouch ? '' : ' (N)');
    soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  /* ---------- loop ---------- */

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    fireworks.resize(h);
  }
  window.addEventListener('resize', resize);
  resize();

  var last = performance.now(), acc = 0, netAcc = 0, lastSent = null;
  function loop(now) {
    var dt = Math.min(0.1, (now - last) / 1000); last = now;
    acc += dt; netAcc += dt;
    vehicles.update(dt, keys, player);
    step(dt);
    doors();
    homeTick(dt);
    checkNear();
    toll();
    fireworks.update(dt);
    people.update(dt, player);
    var skyState = sky.update(dt, player);
    if (kick > 0) kick = Math.max(0, kick - dt * 4);
    hand.position.y = -0.28 - kick * 0.03; hand.rotation.x = -0.35 + kick * 0.12;
    W.flush();
    if (netAcc > 0.1) {
      netAcc = 0;
      var s = { t: 'pos', x: +player.x.toFixed(2), y: +player.y.toFixed(2), z: +player.z.toFixed(2), yaw: +player.yaw.toFixed(2), pitch: +player.pitch.toFixed(2), m: player.moving ? 1 : 0, n: myName };
      var key = s.x + ',' + s.y + ',' + s.z + ',' + s.yaw + ',' + s.m + ',' + s.n + ',' + (net.isOpen() ? 1 : 0);
      if (key !== lastSent && net.isOpen()) { net.send(s); lastSent = key; }
    }
    if (Math.floor(acc * 2) !== Math.floor((acc - dt) * 2)) {
      var placeName = district();
      if (whereEl.textContent !== placeName) {
        whereEl.textContent = placeName;
        whereEl.classList.remove('swap');
        void whereEl.offsetWidth;
        whereEl.classList.add('swap');
      }
      clockEl.textContent = clockText(skyState.hour) + (skyState.weather !== 'clear' ? ' · ' + skyState.weather : '');
      if (mapOn) drawMap();
    }
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  window.__set = function (yaw, pitch, x, z) {
    player.yaw = yaw; player.pitch = pitch;
    if (x !== undefined) { player.x = x; player.z = z; player.y = W.surface(Math.floor(x), Math.floor(z)) + 1; player.vy = 0; }
  };
  window.__sky = sky; window.__fw = fireworks; window.__game = { placeBlock: placeBlock, breakBlock: breakBlock, setBuildMode: setBuildMode, photo: photo, setMap: setMap, act: act, player: player, vehicles: vehicles, people: people, shoot: shoot, keys: function () { return keys; } };

  fine.textContent = isTouch ? 'Your name stays on this phone.' : 'Your mouse is captured until you press Esc. Right-click also fires.';
  requestAnimationFrame(loop);
})();
