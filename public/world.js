/* joe.ag — the world: a voxel grid, the terrain, the town, and the mesh.
   Coordinates: x east, y up, z south. One block = one metre. */

(function () {
  'use strict';

  var B = window.BLOCKS;
  var ID = B.id;

  var SX = 192, SY = 40, SZ = 192;
  var grid = new Uint8Array(SX * SY * SZ);

  function idx(x, y, z) { return (y * SZ + z) * SX + x; }
  function inside(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ; }
  function get(x, y, z) { return inside(x, y, z) ? grid[idx(x, y, z)] : 0; }
  function set(x, y, z, v) { if (inside(x, y, z)) grid[idx(x, y, z)] = v; }
  function fill(x0, y0, z0, x1, y1, z1, v) {
    var x, y, z;
    for (y = y0; y <= y1; y++) for (z = z0; z <= z1; z++) for (x = x0; x <= x1; x++) set(x, y, z, v);
  }
  function box(x0, y0, z0, x1, y1, z1, wall, floorId, roofId) {
    /* hollow box: walls of `wall`, optional floor and flat roof */
    fill(x0, y0, z0, x1, y1, z1, wall);
    fill(x0 + 1, y0 + (floorId ? 1 : 0), z0 + 1, x1 - 1, y1 - (roofId ? 1 : 0), z1 - 1, 0);
    if (floorId) fill(x0 + 1, y0, z0 + 1, x1 - 1, y0, z1 - 1, floorId);
    if (roofId) fill(x0, y1, z0, x1, y1, z1, roofId);
  }
  function solidAt(x, y, z) { var d = B.byId[get(x, y, z)]; return !!(d && d.solid); }

  /* ---------- terrain ---------- */

  var seed = 1883;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  var perm = []; (function () { var i; for (i = 0; i < 512; i++) perm[i] = Math.floor(rnd() * 256); })();
  function vnoise(x, z) {
    var xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    function h(a, b) { return perm[(perm[a & 255] + b) & 255] / 255; }
    var u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    var a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  var GROUND = 10;
  var heights = new Uint8Array(SX * SZ);

  function terrainHeight(x, z) {
    var n = vnoise(x / 23, z / 23) * 0.7 + vnoise(x / 9, z / 9) * 0.3;
    var h = GROUND + Math.round((n - 0.5) * 5);
    /* flatten the town */
    var dx = x - 96, dz = z - 96, d = Math.sqrt(dx * dx + dz * dz);
    if (d < 58) { var k = Math.max(0, (d - 34) / 24); h = Math.round(GROUND + (h - GROUND) * k); }
    return h;
  }

  function buildTerrain() {
    var x, z, y, h;
    for (z = 0; z < SZ; z++) for (x = 0; x < SX; x++) {
      h = terrainHeight(x, z);
      heights[z * SX + x] = h;
      for (y = 0; y <= h; y++) set(x, y, z, y === h ? ID.grass : (y > h - 3 ? ID.dirt : ID.stone));
    }
  }

  function surface(x, z) { return heights[z * SX + x]; }

  /* ---------- water: the lake and the creek ---------- */

  function lake(cx, cz, rx, rz) {
    var x, z, d;
    for (z = cz - rz - 2; z <= cz + rz + 2; z++) for (x = cx - rx - 2; x <= cx + rx + 2; x++) {
      d = ((x - cx) / rx) * ((x - cx) / rx) + ((z - cz) / rz) * ((z - cz) / rz);
      if (d < 1) {
        fill(x, GROUND - 1, z, x, SY - 1, z, 0);
        set(x, GROUND - 2, z, ID.sand);
        set(x, GROUND - 1, z, ID.water);
        heights[z * SX + x] = GROUND - 2;
      } else if (d < 1.35) {
        fill(x, GROUND + 1, z, x, SY - 1, z, 0);
        set(x, GROUND, z, ID.sand);
        heights[z * SX + x] = GROUND;
      }
    }
  }

  function creek(points) {
    var i, j, a, b, n, t, x, z, ox, oz;
    for (i = 0; i < points.length - 1; i++) {
      a = points[i]; b = points[i + 1];
      n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 2;
      for (j = 0; j <= n; j++) {
        t = j / n; x = Math.round(a[0] + (b[0] - a[0]) * t); z = Math.round(a[1] + (b[1] - a[1]) * t);
        for (ox = -1; ox <= 1; ox++) for (oz = -1; oz <= 1; oz++) {
          fill(x + ox, GROUND, z + oz, x + ox, SY - 1, z + oz, 0);
          set(x + ox, GROUND - 1, z + oz, ID.water);
          set(x + ox, GROUND - 2, z + oz, ID.sand);
          heights[(z + oz) * SX + x + ox] = GROUND - 2;
        }
      }
    }
  }

  /* ---------- roads and rail ---------- */

  function roadEW(z, half) {
    var x, dz;
    for (x = 0; x < SX; x++) for (dz = -half; dz <= half; dz++) {
      fill(x, GROUND + 1, z + dz, x, SY - 1, z + dz, 0);
      set(x, GROUND, z + dz, dz === 0 ? (x % 4 < 2 ? ID.asphalt_dash : ID.asphalt) : ID.asphalt);
      heights[(z + dz) * SX + x] = GROUND;
    }
    /* shoulders */
    for (x = 0; x < SX; x++) { set(x, GROUND, z - half - 1, ID.dirt); set(x, GROUND, z + half + 1, ID.dirt); }
  }

  function laneNS(x, half) {
    var z, dx;
    for (z = 0; z < SZ; z++) for (dx = -half; dx <= half; dx++) {
      fill(x + dx, GROUND + 1, z, x + dx, SY - 1, z, 0);
      set(x + dx, GROUND, z, (dx === -half || dx === half) ? ID.asphalt_line : ID.asphalt);
      heights[z * SX + x + dx] = GROUND;
    }
  }

  function railNS(x) {
    var z;
    for (z = 0; z < SZ; z++) {
      fill(x - 1, GROUND + 1, z, x + 1, SY - 1, z, 0);
      set(x - 1, GROUND, z, ID.dirt); set(x + 1, GROUND, z, ID.dirt);
      set(x, GROUND, z, ID.rail);
      heights[z * SX + x - 1] = GROUND; heights[z * SX + x] = GROUND; heights[z * SX + x + 1] = GROUND;
    }
  }

  /* ---------- trees, hay, lamps ---------- */

  function tree(x, z, big) {
    var y = surface(x, z) + 1, h = big ? 6 : 4, i, dx, dz, dy;
    for (i = 0; i < h; i++) set(x, y + i, z, ID.log);
    for (dy = -2; dy <= 2; dy++) for (dz = -2; dz <= 2; dz++) for (dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) > (big ? 4 : 3)) continue;
      if (dx === 0 && dz === 0 && dy <= 0) continue;
      if (get(x + dx, y + h - 1 + dy, z + dz) === 0) set(x + dx, y + h - 1 + dy, z + dz, ID.leaves);
    }
  }

  function conifer(x, z) {
    var y = surface(x, z) + 1, i, r, dx, dz;
    for (i = 0; i < 7; i++) set(x, y + i, z, ID.log);
    for (i = 1; i < 8; i++) {
      r = i < 7 ? (i % 2 ? 1 : 2) : 0; if (i > 5) r = i === 6 ? 1 : 0;
      if (i === 2 || i === 4) r = 2;
      for (dz = -r; dz <= r; dz++) for (dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) === r && Math.abs(dz) === r && r === 2) continue;
        if (get(x + dx, y + i, z + dz) === 0) set(x + dx, y + i, z + dz, ID.leaves);
      }
    }
    set(x, y + 7, z, ID.leaves);
  }

  function lampPost(x, z) {
    var y = surface(x, z) + 1;
    fill(x, y, z, x, y + 3, z, ID.metal);
    set(x, y + 4, z, ID.lamp);
  }

  function fence(x0, z0, x1, z1) {
    var x, z, y;
    for (z = z0; z <= z1; z++) for (x = x0; x <= x1; x++) {
      if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
      y = surface(x, z) + 1;
      if ((x + z) % 3 === 0) { set(x, y, z, ID.log); set(x, y + 1, z, ID.log); } else set(x, y + 1, z, ID.planks);
    }
  }

  /* ---------- the places. Each registers a door. ---------- */

  var places = [];
  var doors = [];
  function register(p) { places.push(p); }

  /* level the ground around a footprint so doors are at ground level */
  function flattenAround(x0, z0, x1, z1) {
    var x, z, h, y;
    for (z = z0; z <= z1; z++) for (x = x0; x <= x1; x++) {
      if (!inside(x, 0, z)) continue;
      h = surface(x, z);
      if (get(x, h, z) === ID.water || get(x, h, z) === ID.sand && h < GROUND) continue;
      if (h > GROUND) { for (y = GROUND + 1; y <= h + 8; y++) if (get(x, y, z) !== ID.cloud) set(x, y, z, 0); set(x, GROUND, z, ID.grass); }
      else if (h < GROUND) { for (y = h; y < GROUND; y++) set(x, y, z, ID.dirt); set(x, GROUND, z, ID.grass); }
      heights[z * SX + x] = GROUND;
    }
  }

  /* door facing south (toward +z) at bottom-centre of the wall at z1 */
  function doorAt(x, y, z) { set(x, y, z, ID.door); set(x, y + 1, z, ID.door_top); doors.push({ x: x, y: y, z: z, open: false }); }

  function house(cx, cz, w, d, h, wall, roof, info) {
    var y = GROUND + 1, x0 = cx - Math.floor(w / 2), z0 = cz - Math.floor(d / 2), x1 = x0 + w - 1, z1 = z0 + d - 1, i;
    flattenAround(x0 - 2, z0 - 2, x1 + 2, z1 + 3);
    fill(x0, GROUND, z0, x1, GROUND, z1, ID.planks); /* footprint stays flat */
    box(x0, y, z0, x1, y + h - 1, z1, wall, null, null);
    /* gable roof along x */
    for (i = 0; i <= Math.ceil(d / 2); i++) {
      fill(x0 - 1, y + h - 1 + i, z0 + i, x1 + 1, y + h - 1 + i, z0 + i, roof);
      fill(x0 - 1, y + h - 1 + i, z1 - i, x1 + 1, y + h - 1 + i, z1 - i, roof);
      if (i > 0 && z0 + i < z1 - i) { fill(x0, y + h - 1 + i, z0 + i + 1, x1, y + h - 1 + i, z1 - i - 1, i === 1 ? wall : 0); }
    }
    /* windows on the front */
    for (i = x0 + 1; i < x1; i += 2) if (i !== cx) set(i, y + 1, z1, ID.glass);
    doorAt(cx, y, z1);
    var top = y + h - 1 + Math.ceil(d / 2);
    if (info) register(Object.assign({ x: cx, y: y, z: z1 + 1, face: [0, 0, 1], sign: { x: cx, y: top + 2, z: cz } }, info));
    return { x0: x0, z0: z0, x1: x1, z1: z1, top: top };
  }

  function flatBuilding(cx, cz, w, d, h, wall, info, opts) {
    var o = opts || {};
    var y = GROUND + 1, x0 = cx - Math.floor(w / 2), z0 = cz - Math.floor(d / 2), x1 = x0 + w - 1, z1 = z0 + d - 1, i, j;
    flattenAround(x0 - 2, z0 - 2, x1 + 2, z1 + 3);
    fill(x0, GROUND, z0, x1, GROUND, z1, ID.concrete);
    box(x0, y, z0, x1, y + h - 1, z1, wall, null, ID.concrete);
    if (o.windows !== false) {
      for (j = y + 1; j < y + h - 1; j += 2) {
        for (i = x0 + 1; i < x1; i += 2) { set(i, j, z1, ID.glass); set(i, j, z0, ID.glass); }
        for (i = z0 + 1; i < z1; i += 2) { set(x0, j, i, ID.glass); set(x1, j, i, ID.glass); }
      }
    }
    doorAt(cx, y, z1);
    if (o.awning) fill(x0, y + 2, z1 + 1, x1, y + 2, z1 + 1, o.awning);
    if (info) register(Object.assign({ x: cx, y: y, z: z1 + 1, face: [0, 0, 1], sign: { x: cx, y: y + h + 1.2, z: cz } }, info));
    return { x0: x0, z0: z0, x1: x1, z1: z1, top: y + h - 1 };
  }

  function waterTower(cx, cz, info) {
    var y = GROUND + 1, i;
    [[-2, -2], [2, -2], [-2, 2], [2, 2]].forEach(function (o) { fill(cx + o[0], y, cz + o[1], cx + o[0], y + 9, cz + o[1], ID.metal); });
    fill(cx - 2, y + 4, cz - 2, cx + 2, y + 4, cz + 2, ID.metal);
    fill(cx - 2, y + 4, cz - 1, cx + 2, y + 4, cz + 1, 0); fill(cx - 1, y + 4, cz - 2, cx + 1, y + 4, cz + 2, 0);
    fill(cx - 3, y + 10, cz - 3, cx + 3, y + 15, cz + 3, ID.white);
    fill(cx - 2, y + 11, cz - 2, cx + 2, y + 14, cz + 2, 0);
    fill(cx - 2, y + 16, cz - 2, cx + 2, y + 16, cz + 2, ID.metal);
    set(cx, y + 17, cz, ID.metal);
    /* a ladder of planks on the south leg */
    for (i = 0; i < 9; i++) set(cx + 2, y + i, cz + 3, ID.planks);
    if (info) register(Object.assign({ x: cx, y: y, z: cz + 4, face: [0, 0, 1], sign: { x: cx, y: y + 19, z: cz } }, info));
  }

  function radioTower(cx, cz, info) {
    var y = surface(cx, cz) + 1, i, r;
    for (i = 0; i < 22; i++) {
      r = i < 8 ? 2 : (i < 16 ? 1 : 0);
      if (r === 0) set(cx, y + i, cz, ID.metal);
      else {
        [[-r, -r], [r, -r], [-r, r], [r, r]].forEach(function (o) { set(cx + o[0], y + i, cz + o[1], ID.metal); });
        if (i % 4 === 0) { fill(cx - r, y + i, cz - r, cx + r, y + i, cz - r, ID.metal); fill(cx - r, y + i, cz + r, cx + r, y + i, cz + r, ID.metal); fill(cx - r, y + i, cz - r, cx - r, y + i, cz + r, ID.metal); fill(cx + r, y + i, cz - r, cx + r, y + i, cz + r, ID.metal); }
      }
    }
    set(cx, y + 22, cz, ID.lamp);
    fill(cx - 3, y, cz - 3, cx + 3, y, cz + 3, ID.concrete); /* pad */
    fill(cx - 3, y, cz - 2, cx + 3, y, cz + 2, ID.concrete);
    /* a small equipment shed */
    box(cx + 4, y, cz - 1, cx + 6, y + 2, cz + 1, ID.concrete, null, ID.concrete);
    if (info) register(Object.assign({ x: cx, y: y, z: cz + 4, face: [0, 0, 1], sign: { x: cx, y: y + 9, z: cz + 4 } }, info));
  }

  function gantry(x, z, half, info) {
    /* over the north-south express lane at z */
    var y = GROUND + 1, i;
    fill(x - half - 2, y, z, x - half - 2, y + 6, z, ID.metal);
    fill(x + half + 2, y, z, x + half + 2, y + 6, z, ID.metal);
    fill(x - half - 2, y + 6, z, x + half + 2, y + 6, z, ID.metal);
    fill(x - half - 1, y + 4, z, x + half + 1, y + 5, z, ID.black);
    for (i = -2; i <= 2; i++) set(x + i, y + 5, z, ID.yellow);
    if (info) register(Object.assign({ x: x + half + 3, y: y, z: z + 1, face: [0, 0, 1], radius: 5, sign: { x: x, y: y + 8.5, z: z } }, info));
  }

  function crane(cx, cz, info) {
    var y = GROUND + 1, i;
    fill(cx - 6, GROUND, cz - 5, cx + 6, GROUND, cz + 5, ID.dirt);
    /* foundation walls going up */
    box(cx - 5, y, cz - 4, cx + 1, y + 2, cz + 4, ID.concrete, null, null);
    fill(cx - 5, y + 2, cz - 4, cx + 1, y + 2, cz + 4, 0);
    fill(cx - 5, y + 1, cz, cx + 1, y + 2, cz, ID.concrete);
    /* tower */
    fill(cx + 4, y, cz, cx + 4, y + 16, cz, ID.yellow);
    fill(cx + 3, y, cz - 1, cx + 3, y + 16, cz - 1, ID.yellow);
    for (i = 0; i < 17; i += 2) { set(cx + 3, y + i, cz, ID.yellow); set(cx + 4, y + i, cz - 1, ID.yellow); }
    /* jib */
    fill(cx - 8, y + 16, cz, cx + 7, y + 16, cz, ID.yellow);
    fill(cx + 5, y + 15, cz, cx + 7, y + 15, cz, ID.concrete); /* counterweight */
    fill(cx - 2, y + 11, cz, cx - 2, y + 15, cz, ID.metal); /* cable */
    set(cx - 2, y + 10, cz, ID.black);
    /* site fence */
    fence(cx - 7, cz - 6, cx + 7, cz + 6);
    set(cx, surface(cx, cz + 6) + 1, cz + 6, 0); set(cx, surface(cx, cz + 6) + 2, cz + 6, 0);
    if (info) register(Object.assign({ x: cx - 2, y: y, z: cz + 7, face: [0, 0, 1], radius: 5, sign: { x: cx - 2, y: y + 5, z: cz + 4 } }, info));
  }

  function billboard(cx, cz, info) {
    var y = surface(cx, cz) + 1, i;
    set(cx - 2, y, cz, ID.log); set(cx - 2, y + 1, cz, ID.log); set(cx - 2, y + 2, cz, ID.log);
    set(cx + 2, y, cz, ID.log); set(cx + 2, y + 1, cz, ID.log); set(cx + 2, y + 2, cz, ID.log);
    for (i = -3; i <= 3; i++) { set(cx + i, y + 3, cz, ID.sign); set(cx + i, y + 4, cz, ID.sign); set(cx + i, y + 5, cz, ID.sign); }
    if (info) register(Object.assign({ x: cx, y: y, z: cz + 1, face: [0, 0, 1], radius: 5, sign: { x: cx, y: y + 7.5, z: cz } }, info));
  }

  function shed(cx, cz, info) {
    var y = surface(cx, cz) + 1;
    box(cx - 2, y, cz - 2, cx + 2, y + 2, cz + 2, ID.metal, null, ID.shingles);
    fill(cx - 2, y + 3, cz - 2, cx + 2, y + 3, cz + 2, ID.shingles);
    set(cx, y, cz + 2, ID.black); set(cx, y + 1, cz + 2, ID.black); /* a door that does not open */
    if (info) register(Object.assign({ x: cx, y: y, z: cz + 3, face: [0, 0, 1], sign: { x: cx, y: y + 5.5, z: cz } }, info));
  }

  function depot(cx, cz, info) {
    var r = house(cx, cz, 9, 5, 3, ID.red_roof === undefined ? ID.planks : ID.planks, ID.shingles, info);
    /* platform along the rail (west side) */
    fill(r.x0 - 3, GROUND, r.z0 - 2, r.x0 - 1, GROUND, r.z1 + 2, ID.planks);
    fill(r.x0 - 3, GROUND + 1, r.z0 - 2, r.x0 - 1, GROUND + 1, r.z1 + 2, 0);
  }

  /* ---------- interiors ---------- */

  function dinerInside(cx, cz, x0, z0, x1, z1) {
    var y = GROUND + 1, i;
    /* counter one block in from the back wall, stools in front of it */
    fill(x0 + 1, y, z0 + 2, x1 - 1, y, z0 + 2, ID.planks);
    for (i = x0 + 2; i < x1; i += 2) set(i, y, z0 + 3, ID.metal);
    /* kitchen pass: a lit window into the back */
    fill(x0 + 2, y + 1, z0 + 1, x1 - 2, y + 1, z0 + 1, ID.black);
    set(cx, y + 1, z0 + 1, ID.screen);
    /* booths along the side walls */
    [x0 + 1, x1 - 1].forEach(function (x) { set(x, y, z1 - 2, ID.red_awning); set(x, y, z1 - 3, ID.red_awning); });
    set(cx - 2, y + 3, cz, ID.lamp); set(cx + 2, y + 3, cz, ID.lamp);
    register({ x: cx, y: y, z: z0 + 4, inside: true, radius: 2.4, title: 'Menu board', sub: 'the dishes worth going back for', href: 'https://pleasetaste.com', kind: 'site',
      sign: { x: cx, y: y + 1.6, z: z0 + 1.1 }, text: 'MENU', lines: ['lamb chops \u00b7 the paisan \u00b7 omakase', 'how often would you go back?'] });
    /* the guestbook: a lectern by the door */
    set(x1 - 2, y, z1 - 1, ID.planks); set(x1 - 2, y + 1, z1 - 1, ID.paper);
    register({ x: x1 - 2, y: y, z: z1 - 2, inside: true, radius: 2, title: 'Guestbook', sub: 'leave a line', kind: 'lore', id: 'guestbook', sign: null });
    guestWalls = { west: { x: x0 + 1.02, z0: z0 + 1, z1: z1 - 1, y: y + 1.4 }, east: { x: x1 - 0.02, z0: z0 + 1, z1: z1 - 1, y: y + 1.4 } };
  }
  var guestWalls = null;
  var briefFront = null;

  function briefInside(cx, cz, x0, z0, x1, z1) {
    var y = GROUND + 1, i;
    /* the press: a black and metal machine in the back left */
    fill(x0 + 1, y, z0 + 1, x0 + 3, y + 1, z0 + 2, ID.black);
    set(x0 + 2, y + 2, z0 + 1, ID.metal); set(x0 + 1, y, z0 + 3, ID.metal);
    /* stacks of this morning's edition */
    set(x1 - 1, y, z0 + 1, ID.paper); set(x1 - 2, y, z0 + 1, ID.paper); set(x1 - 1, y + 1, z0 + 1, ID.paper);
    set(x1 - 1, y, z0 + 3, ID.paper);
    /* desks */
    for (i = x0 + 2; i < x1 - 1; i += 3) { if (i === cx || i + 1 === cx) continue; set(i, y, z1 - 2, ID.planks); set(i + 1, y, z1 - 2, ID.planks); }
    set(cx, y + 3, cz, ID.lamp);
    register({ x: cx, y: y, z: z0 + 4, inside: true, radius: 2.6, title: 'This morning', sub: 'loading the Brief', href: 'https://themorganbrief.com', kind: 'site',
      sign: { x: cx, y: y + 2.2, z: z0 + 1.1 }, text: 'THE MORGAN BRIEF', lines: ['every morning, the stories worth knowing'], id: 'brief' });
  }

  function arcadeInside(cx, cz, x0, z0, x1, z1) {
    var y = GROUND + 1, i, n = 0;
    for (i = x0 + 1; i < x1; i += 2) {
      set(i, y, z0 + 1, ID.black); set(i, y + 1, z0 + 1, ID.screen);
      n++;
    }
    set(x0 + 1, y, z1 - 2, ID.red_awning); set(x1 - 1, y, z1 - 2, ID.red_awning);
    set(cx - 2, y + 3, cz, ID.lamp); set(cx + 2, y + 3, cz, ID.lamp);
    register({ x: cx, y: y, z: z0 + 3, inside: true, radius: 2.8, title: 'Cabinet', sub: 'play BuddyAudit', href: 'https://buddyaudit.com', kind: 'site',
      sign: { x: cx, y: y + 1.6, z: z0 + 1.1 }, text: 'INSERT COIN', lines: ['how well do your buddies really know you?'] });
  }

  function hqInside(cx, cz, x0, z0, x1, z1) {
    var y = GROUND + 1, i;
    /* a lobby: reception desk, a bench, the brands on the wall */
    fill(cx - 1, y, z0 + 2, cx + 1, y, z0 + 2, ID.planks);
    set(x0 + 1, y, z1 - 2, ID.planks); set(x0 + 2, y, z1 - 2, ID.planks);
    set(x1 - 1, y, z1 - 2, ID.planks); set(x1 - 2, y, z1 - 2, ID.planks);
    for (i = x0 + 2; i < x1; i += 3) set(i, y + 3, cz, ID.lamp);
    var brands = [
      ['pleasetaste', 'food recs, one link', 'https://pleasetaste.com'],
      ['Earned Together', 'money, made together', 'https://earnedtogether.com'],
      ['orbn.', 'your page, your way', 'https://orbn.co'],
      ['BuddyAudit', 'a quiz about you', 'https://buddyaudit.com'],
      ['The Morgan Brief', 'every morning', 'https://themorganbrief.com']
    ];
    brands.forEach(function (b, k) {
      var px = x0 + 1.4 + k * ((x1 - x0 - 2) / 4);
      register({ x: Math.round(px), y: y, z: z0 + 3, inside: true, radius: 1.6, title: b[0], sub: b[1], href: b[2], kind: 'site',
        sign: { x: px - 0.5, y: y + 1.5, z: z0 + 1.1 }, small: true });
    });
  }

  var joes = null;
  function joesPlace(cx, cz) {
    var w = 11, d = 9, h = 5;
    var r = house(cx, cz, w, d, h, ID.planks, ID.shingles, { title: "Joe's place", sub: 'knock', kind: 'lore', id: 'joes-door', sign: { x: cx, y: GROUND + h + Math.ceil(d / 2) + 1, z: cz } });
    var y = GROUND + 1, x0 = r.x0, z0 = r.z0, x1 = r.x1, z1 = r.z1, i;
    /* floor rug */
    fill(cx - 2, GROUND, cz - 1, cx + 2, GROUND, cz + 1, ID.red_awning);
    /* fireplace on the back wall, chimney through the roof */
    fill(cx - 1, y, z0, cx + 1, y + 2, z0, ID.stone_brick);
    fill(cx - 1, y, z0 + 1, cx + 1, y + 1, z0 + 1, ID.stone_brick);
    set(cx, y, z0 + 1, 0); set(cx, y + 1, z0 + 1, 0);
    fill(cx, y + 2, z0 + 1, cx, r.top + 1, z0 + 1, ID.stone_brick);
    set(cx, r.top + 2, z0 + 1, ID.stone_brick);
    set(cx, y + 3, z0, ID.stone_brick);
    /* the desk, by the east wall, with the screen */
    fill(x1 - 3, y, z0 + 2, x1 - 1, y, z0 + 2, ID.planks);
    set(x1 - 2, y + 1, z0 + 1, ID.screen);
    set(x1 - 1, y, z0 + 3, ID.planks);
    /* bookshelf on the west wall */
    fill(x0 + 1, y, z0 + 1, x0 + 1, y + 2, z0 + 3, ID.planks);
    set(x0 + 1, y + 1, z0 + 2, ID.paper); set(x0 + 1, y + 2, z0 + 1, ID.paper); set(x0 + 1, y, z0 + 3, ID.paper); set(x0 + 1, y + 1, z0 + 3, ID.paper);
    /* two dog beds by the fire */
    set(cx - 3, y, z0 + 2, ID.red_awning); set(cx + 3, y, z0 + 2, ID.hay);
    /* a table and two chairs */
    set(cx + 1, y, z1 - 2, ID.planks); set(cx + 2, y, z1 - 2, ID.planks);
    set(cx, y, z1 - 2, ID.log); set(cx + 3, y, z1 - 2, ID.log);
    /* the record player, by the east wall */
    set(x1 - 1, y, cz + 2, ID.planks); set(x1 - 1, y + 1, cz + 2, ID.black);
    /* lamps: they start dark and come on when you walk in */
    var lamps = [[cx - 3, y + 3, cz - 1], [cx + 3, y + 3, cz - 1], [cx - 3, y + 3, cz + 2], [cx + 3, y + 3, cz + 2], [cx, y + 3, cz + 1]];
    lamps.forEach(function (l) { set(l[0], l[1], l[2], ID.black); });
    joes = {
      x0: x0 + 1, z0: z0 + 1, x1: x1 - 1, z1: z1 - 1, y: y,
      lamps: lamps,
      fire: [cx, y, z0 + 1],
      screen: { x: x1 - 2 + 0.5, y: y + 1.5, z: z0 + 2.01 },
      door: { x: cx, z: z1 + 1 },
      portraits: [{ x: cx - 2.5, y: y + 2.1, z: z0 + 1.01, name: 'Luke' }, { x: cx + 2.5, y: y + 2.1, z: z0 + 1.01, name: 'Novy' }],
      timeline: { x: x0 + 1.01, y: y + 1.9, z: cz + 1.5 }
    };
    register({ x: x1 - 2, y: y, z: z0 + 3, inside: true, radius: 2, title: "Joe's desk", sub: 'write to him', kind: 'lore', id: 'joes-desk', sign: null });
    register({ x: x1 - 2, y: y, z: cz + 2, inside: true, radius: 1.6, title: 'Record player', sub: 'play it again', kind: 'lore', id: 'joes-record', sign: null });
    register({ x: cx - 2, y: y, z: z0 + 3, inside: true, radius: 1.6, title: 'Luke', sub: 'black Lab. good boy.', kind: 'lore', sign: null });
    register({ x: cx + 2, y: y, z: z0 + 3, inside: true, radius: 1.6, title: 'Novy', sub: 'Nova Scotia Duck Tolling Retriever. very good girl.', kind: 'lore', sign: null });
    register({ x: x0 + 2, y: y, z: cz + 1, inside: true, radius: 1.8, title: 'The wall', sub: 'the short version of Joe', kind: 'lore', id: 'joes-wall', sign: null });
    register({ x: cx, y: y, z: z0 + 3, inside: true, radius: 1.8, title: 'The fire', sub: 'warm', kind: 'lore', sign: null });
  }

  function basement(cx, cz) {
    /* a hatch in the corner of the house, a room underneath, stairs back up the other corner */
    var top = GROUND, i;
    box(cx - 3, top - 5, cz - 3, cx + 3, top - 1, cz + 3, ID.stone_brick, ID.stone, null);
    fill(cx - 2, top - 4, cz - 2, cx + 2, top - 1, cz + 2, 0);
    set(cx - 2, top, cz - 2, ID.hatch);                                  /* the drop */
    set(cx + 2, top, cz, 0); set(cx + 2, top, cz + 1, 0);                /* the way out */
    var steps = [[cz - 2, top - 4], [cz - 1, top - 3], [cz, top - 2], [cz + 1, top - 1]];
    for (i = 0; i < steps.length; i++) set(cx + 2, steps[i][1], steps[i][0], ID.stone_brick);
    set(cx, top - 1, cz, ID.lamp);
    set(cx - 2, top - 4, cz + 2, ID.gold);
    register({ x: cx, y: top - 4, z: cz, inside: true, radius: 3, title: 'The basement', sub: 'there is nothing down here either', kind: 'lore',
      sign: { x: cx, y: top - 2.4, z: cz - 2 }, text: 'YOU FOUND THE BASEMENT', lines: ['there is nothing down here either.', 'the stairs are in the other corner.'] });
  }

  /* ---------- build the town ---------- */

  var C = 96;                         /* town centre */
  var ROAD_Z = C + 6;                 /* US 287 */
  var LANE_X = C + 44;                /* I-35W express lane */
  var RAIL_X = C - 40;                /* the Santa Fe */
  var GANTRY_Z = C - 12;
  var TOWER = { x: LANE_X + 22, z: C - 30 };
  var LAKE = { x: C + 56, z: C - 50, rx: 14, rz: 9 };

  function buildTown() {
    lake(LAKE.x, LAKE.z, LAKE.rx, LAKE.rz);
    creek([[C + 40, C - 70], [C + 32, C - 44], [C + 30, C - 20], [C + 34, C + 14], [C + 26, C + 40], [C + 20, C + 70]]);
    roadEW(ROAD_Z, 2);
    laneNS(LANE_X, 2);
    railNS(RAIL_X);

    var r;
    /* Downtown, north of 287 */
    flatBuilding(C - 22, C - 6, 9, 7, 5, ID.brick, { title: 'Savings & Loan', sub: 'earnedtogether.com', href: 'https://earnedtogether.com', kind: 'site' });
    r = flatBuilding(C - 8, C - 6, 11, 7, 6, ID.white, { title: 'The Brief', sub: 'themorganbrief.com', href: 'https://themorganbrief.com', kind: 'site' }, { awning: ID.black });
    briefInside(C - 8, C - 6, r.x0, r.z0, r.x1, r.z1);
    /* the front of The Brief is a newspaper page: no windows up there */
    fill(r.x0 + 1, GROUND + 4, r.z1, r.x1 - 1, GROUND + 6, r.z1, ID.white);
    briefFront = { x: C - 8 + 0.5, y: GROUND + 5.5, z: r.z1 + 1.03, w: 9, h: 3 };
    r = flatBuilding(C + 7, C - 6, 11, 7, 5, ID.white, { title: 'Diner', sub: 'pleasetaste.com', href: 'https://pleasetaste.com', kind: 'site' }, { awning: ID.red_awning });
    dinerInside(C + 7, C - 6, r.x0, r.z0, r.x1, r.z1);
    r = flatBuilding(C + 21, C - 6, 9, 7, 5, ID.blue, { title: 'Arcade', sub: 'buddyaudit.com', href: 'https://buddyaudit.com', kind: 'site' }, { windows: false, awning: ID.yellow });
    arcadeInside(C + 21, C - 6, r.x0, r.z0, r.x1, r.z1);

    /* south of 287 */
    r = flatBuilding(C - 10, C + 20, 11, 9, 12, ID.concrete, { title: 'JLM Brands HQ', sub: 'jmorg.org', href: 'https://jmorg.org', kind: 'site' });
    hqInside(C - 10, C + 20, r.x0, r.z0, r.x1, r.z1);
    house(C + 12, C + 20, 9, 7, 4, ID.planks, ID.red_roof, { title: 'Depot, 1883', sub: 'haslet.net', href: 'https://haslet.net', kind: 'site' });

    /* the prairie, north */
    waterTower(C - 8, C - 34, { title: 'Water tower', sub: 'haslet.net', href: 'https://haslet.net', kind: 'site' });
    billboard(C + 14, C - 30, { title: 'Vacant lot', sub: 'd-a-l-l-a-s.com', href: 'https://d-a-l-l-a-s.com', kind: 'soon', text: 'FOR LEASE' });

    /* Alliance, east */
    radioTower(TOWER.x, TOWER.z, { title: 'Radio tower', sub: 'orbn.co', href: 'https://orbn.co', kind: 'site' });
    gantry(LANE_X, GANTRY_Z, 2, { title: 'Express lane', sub: 'whoownsyourroad.com', href: 'https://whoownsyourroad.com', kind: 'site', text: '$24.00' });
    crane(LANE_X + 22, C + 24, { title: 'Construction', sub: 'chromaconsult.com', href: 'https://chromaconsult.com', kind: 'soon' });

    /* the ranch, southwest */
    fence(C - 70, C + 30, C - 44, C + 60);
    joesPlace(C - 58, C + 40);
    basement(C - 58, C + 40);
    [[-66, 52], [-64, 54], [-52, 56], [-50, 56]].forEach(function (o) { var y = surface(C + o[0], C + o[1]) + 1; set(C + o[0], y, C + o[1], ID.hay); });
    set(C - 66, surface(C - 66, C + 52) + 2, C + 52, ID.hay);
    shed(C + 60, C + 52, { title: 'Shed', sub: "23 x's dot com", href: 'https://xxxxxxxxxxxxxxxxxxxxxxx.com', kind: 'lore' });

    /* secrets */
    var ry = GROUND - 2, i, j;
    for (i = -1; i <= 1; i++) for (j = -1; j <= 1; j++) if (i || j) set(LAKE.x + i, ry, LAKE.z + j, ID.gold);
    register({ x: LAKE.x, y: ry, z: LAKE.z, inside: true, radius: 3, title: 'A ring', sub: 'Class of 2019. Someone should fish that out.', kind: 'lore' });
    billboardPlain(C, 6, 'END OF THE MAP', ['nothing out here.']);
    campfire(8, 8);
    register({ x: 8, y: surface(8, 8) + 1, z: 10, radius: 4, inside: true, title: 'A campfire', sub: 'Told you. Well.', kind: 'lore',
      sign: { x: 8, y: surface(8, 8) + 4, z: 8 }, text: 'TOLD YOU', lines: ['(well.)'] });

    /* the overlook: a small rise south of town where people arrive */
    var ox = C - 2, oz = C + 30, dx, dz, dd, hh;
    for (dz = -6; dz <= 6; dz++) for (dx = -7; dx <= 7; dx++) {
      dd = Math.sqrt(dx * dx * 0.8 + dz * dz);
      hh = dd < 2.2 ? 3 : (dd < 4 ? 2 : (dd < 6 ? 1 : 0));
      if (!hh) continue;
      var sy = surface(ox + dx, oz + dz), k;
      if (get(ox + dx, sy, oz + dz) !== ID.grass) continue;
      for (k = 1; k <= hh; k++) set(ox + dx, sy + k, oz + dz, k === hh ? ID.grass : ID.dirt);
      set(ox + dx, sy, oz + dz, ID.dirt);
      heights[(oz + dz) * SX + ox + dx] = sy + hh;
    }
    /* a worn path from the overlook to the Diner door */
    var px = ox, pz = oz - 7, tx = C + 7, tz = C - 2;
    while (pz > tz || px !== tx) {
      if (pz > tz && (px === tx || (pz % 3 !== 0))) pz--; else px += px < tx ? 1 : -1;
      var py = surface(px, pz);
      if (get(px, py, pz) === ID.grass) set(px, py, pz, ID.dirt);
    }

    /* street lamps along 287 */
    var x;
    for (x = 12; x < SX - 12; x += 16) { lampPost(x, ROAD_Z - 4); lampPost(x + 8, ROAD_Z + 4); }

    /* trees: keep them off roads, water and buildings */
    var z, tries = 0, count = 0;
    while (count < 150 && tries < 4000) {
      tries++;
      x = 2 + Math.floor(rnd() * (SX - 4)); z = 2 + Math.floor(rnd() * (SZ - 4));
      if (Math.abs(z - ROAD_Z) < 6 || Math.abs(x - LANE_X) < 6 || Math.abs(x - RAIL_X) < 4) continue;
      if (get(x, surface(x, z), z) !== ID.grass) continue;
      if (x > C - 34 && x < C + 34 && z > C - 16 && z < C + 30) continue;      /* downtown */
      if (x > C - 72 && x < C - 42 && z > C + 28 && z < C + 62) continue;      /* ranch */
      if (Math.abs(x - (C - 8)) < 6 && Math.abs(z - (C - 34)) < 6) continue;   /* water tower */
      if (Math.abs(x - (C - 2)) < 10 && Math.abs(z - (C + 30)) < 9) continue;   /* the overlook */
      if (Math.abs(x - C) < 6 && z < 12) continue;                               /* the edge sign */
      if (x < 14 && z < 14) continue;                                            /* the campfire */
      if (Math.abs(x - (LANE_X + 22)) < 9 && (Math.abs(z - (C - 30)) < 9 || Math.abs(z - (C + 24)) < 9)) continue;
      if (rnd() < 0.35) conifer(x, z); else tree(x, z, rnd() < 0.3);
      count++;
    }
  }

  function billboardPlain(cx, cz, text, lines) {
    var y = surface(cx, cz) + 1, i;
    set(cx - 2, y, cz, ID.log); set(cx - 2, y + 1, cz, ID.log); set(cx + 2, y, cz, ID.log); set(cx + 2, y + 1, cz, ID.log);
    for (i = -3; i <= 3; i++) { set(cx + i, y + 2, cz, ID.sign); set(cx + i, y + 3, cz, ID.sign); }
    register({ x: cx, y: y, z: cz + 1, radius: 5, inside: true, title: text, sub: lines[0], kind: 'lore', sign: { x: cx, y: y + 5.2, z: cz }, text: text, lines: lines });
  }

  function campfire(cx, cz) {
    var y = surface(cx, cz) + 1;
    set(cx, y, cz, ID.fire);
    set(cx - 1, y, cz, ID.log); set(cx + 1, y, cz, ID.log); set(cx, y, cz - 1, ID.log); set(cx, y, cz + 1, ID.log);
    set(cx + 2, y, cz + 2, ID.planks); set(cx + 2, y + 1, cz + 3, ID.planks);   /* a chair */
    set(cx + 3, y, cz + 2, ID.planks);
  }

  /* ---------- clouds ---------- */
  function clouds() {
    var i, cx, cz, w, d, x, z;
    for (i = 0; i < 14; i++) {
      cx = Math.floor(rnd() * SX); cz = Math.floor(rnd() * SZ); w = 4 + Math.floor(rnd() * 8); d = 3 + Math.floor(rnd() * 5);
      for (z = 0; z < d; z++) for (x = 0; x < w; x++) {
        if ((x === 0 || x === w - 1) && (z === 0 || z === d - 1)) continue;
        set((cx + x) % SX, SY - 3 - (i % 2), (cz + z) % SZ, ID.cloud);
      }
    }
  }

  /* ---------- mesh: 16x16 chunks, with ambient occlusion ---------- */

  var FACES = [
    { dir: [1, 0, 0], corners: [[1, 1, 0], [1, 0, 0], [1, 1, 1], [1, 0, 1]], shade: 0.8, which: 'side', t: [2, 1] },
    { dir: [-1, 0, 0], corners: [[0, 1, 1], [0, 0, 1], [0, 1, 0], [0, 0, 0]], shade: 0.8, which: 'side', t: [2, 1] },
    { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]], shade: 1.0, which: 'top', t: [0, 2] },
    { dir: [0, -1, 0], corners: [[1, 0, 1], [0, 0, 1], [1, 0, 0], [0, 0, 0]], shade: 0.5, which: 'bottom', t: [0, 2] },
    { dir: [0, 0, 1], corners: [[0, 1, 1], [0, 0, 1], [1, 1, 1], [1, 0, 1]], shade: 0.9, which: 'side', t: [0, 1] },
    { dir: [0, 0, -1], corners: [[1, 1, 0], [1, 0, 0], [0, 1, 0], [0, 0, 0]], shade: 0.7, which: 'side', t: [0, 1] }
  ];
  /* fix winding once: which diagonal points along dir */
  FACES.forEach(function (face) {
    var p0 = face.corners[0], p1 = face.corners[1], p2 = face.corners[2];
    var ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    var bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
    var nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    face.flip = (nx * face.dir[0] + ny * face.dir[1] + nz * face.dir[2]) < 0;
  });

  var CH = 16, CX = SX / CH, CZ = SZ / CH;
  var chunks = [];           /* [cz*CX+cx] = { group, dirty } */
  var group = new THREE.Group();
  var texture = new THREE.CanvasTexture(B.atlas);
  texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace; texture.generateMipmaps = false;
  var materials = {
    opaque: new THREE.MeshLambertMaterial({ map: texture, vertexColors: true }),
    cutout: new THREE.MeshLambertMaterial({ map: texture, vertexColors: true, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }),
    water: new THREE.MeshLambertMaterial({ map: texture, vertexColors: true, transparent: true, opacity: 0.8 }),
    cloud: new THREE.MeshBasicMaterial({ map: texture, fog: true }),
    lamp: new THREE.MeshBasicMaterial({ map: texture, fog: true }),
    window: new THREE.MeshBasicMaterial({ map: texture, fog: true, transparent: true, opacity: 0 })
  };

  function opaqueAt(x, y, z) { var d = B.byId[get(x, y, z)]; return !!(d && !d.transparent); }

  function buildChunk(cx, cz) {
    var buckets = { opaque: null, cutout: null, water: null, cloud: null, lamp: null, window: null };
    function bucket(name) { return buckets[name] || (buckets[name] = { pos: [], uv: [], col: [], idx: [] }); }
    var tw = 1 / B.COLS, th = 1 / B.ROWS;
    var x, y, z, id, def, f, face, nid, ndef, target, base, c, ci, u0, v0, tile, tu, tv, name;
    var x0 = cx * CH, z0 = cz * CH;
    var ao = [0, 0, 0, 0];
    for (y = 0; y < SY; y++) for (z = z0; z < z0 + CH; z++) for (x = x0; x < x0 + CH; x++) {
      id = grid[idx(x, y, z)];
      if (!id) continue;
      def = B.byId[id];
      for (f = 0; f < 6; f++) {
        face = FACES[f];
        nid = get(x + face.dir[0], y + face.dir[1], z + face.dir[2]);
        ndef = nid ? B.byId[nid] : null;
        if (ndef && !ndef.transparent) continue;
        if (ndef && ndef.transparent && nid === id) continue;
        if (def.transparent && ndef && !ndef.transparent) continue;
        if (id === ID.water && face.which !== 'top' && ndef) continue;
        name = id === ID.cloud ? 'cloud' : (id === ID.lamp || id === ID.fire ? 'lamp' : (id === ID.water ? 'water' : (def.cutout ? 'cutout' : 'opaque')));
        target = bucket(name);
        tile = def[face.which];
        emit(target, x, y, z, face, tile, id, tw, th, ao, def);
        /* windows: glass gets a second, unlit face that the sky turns on at night */
        if (id === ID.glass && face.which === 'side') emit(bucket('window'), x, y, z, face, B.tile.window_lit, id, tw, th, ao, def);
      }
    }
    var out = {};
    Object.keys(buckets).forEach(function (k) {
      var d = buckets[k];
      if (!d) return;
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(d.col, 3));
      g.setIndex(d.idx);
      g.computeVertexNormals();
      out[k] = g;
    });
    return out;
  }

  function emit(target, x, y, z, face, tile, id, tw, th, ao, def) {
    var tu = (tile % B.COLS) * tw, tv = 1 - (Math.floor(tile / B.COLS) + 1) * th;
    var base = target.pos.length / 3, ci, c, u0, v0, sh, k;
    var d = face.dir, t1 = face.t[0], t2 = face.t[1];
    var unlit = id === ID.cloud || id === ID.lamp || id === ID.fire;
    for (ci = 0; ci < 4; ci++) {
      c = face.corners[ci];
      target.pos.push(x + c[0], y + c[1], z + c[2]);
      u0 = (ci < 2) ? 0 : 1; v0 = (ci % 2 === 0) ? 1 : 0;
      if (face.which === 'top' || face.which === 'bottom') { u0 = c[0]; v0 = c[2]; }
      target.uv.push(tu + u0 * tw, tv + v0 * th);
      /* ambient occlusion from the three blocks diagonal to this corner, in the face's plane */
      var o1 = [0, 0, 0], o2 = [0, 0, 0];
      o1[t1] = c[t1] ? 1 : -1; o2[t2] = c[t2] ? 1 : -1;
      var s1 = opaqueAt(x + d[0] + o1[0], y + d[1] + o1[1], z + d[2] + o1[2]) ? 1 : 0;
      var s2 = opaqueAt(x + d[0] + o2[0], y + d[1] + o2[1], z + d[2] + o2[2]) ? 1 : 0;
      var cr = opaqueAt(x + d[0] + o1[0] + o2[0], y + d[1] + o1[1] + o2[1], z + d[2] + o1[2] + o2[2]) ? 1 : 0;
      k = (s1 && s2) ? 0 : 3 - (s1 + s2 + cr);
      ao[ci] = k;
      sh = unlit ? 1 : face.shade * (0.55 + 0.15 * k);
      if (def && def.transparent && !unlit) sh = face.shade;
      target.col.push(sh, sh, sh);
    }
    /* pick the diagonal that keeps the occlusion smooth */
    var alt = (ao[0] + ao[3]) < (ao[1] + ao[2]);
    if (!face.flip) {
      if (alt) target.idx.push(base, base + 1, base + 3, base, base + 3, base + 2);
      else target.idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    } else {
      if (alt) target.idx.push(base, base + 3, base + 1, base, base + 2, base + 3);
      else target.idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }

  function rebuildChunk(i) {
    var cx = i % CX, cz = Math.floor(i / CX);
    var ch = chunks[i];
    if (ch.group) { group.remove(ch.group); ch.group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
    var geoms = buildChunk(cx, cz), g = new THREE.Group(), k;
    for (k in geoms) {
      var m = new THREE.Mesh(geoms[k], materials[k]);
      m.frustumCulled = true;
      if (k === 'water') m.renderOrder = 2;
      if (k === 'window') m.renderOrder = 1;
      g.add(m);
    }
    ch.group = g; ch.dirty = false;
    group.add(g);
  }

  function buildAll() {
    var i;
    for (i = 0; i < CX * CZ; i++) { chunks[i] = { group: null, dirty: false }; rebuildChunk(i); }
  }

  var dirty = {};
  function markDirty(x, z) {
    if (x < 0 || z < 0 || x >= SX || z >= SZ) return;
    dirty[Math.floor(z / CH) * CX + Math.floor(x / CH)] = true;
  }
  function setBlock(x, y, z, id) {
    if (!inside(x, y, z)) return false;
    if (grid[idx(x, y, z)] === id) return false;
    grid[idx(x, y, z)] = id;
    markDirty(x, z); markDirty(x - 1, z); markDirty(x + 1, z); markDirty(x, z - 1); markDirty(x, z + 1);
    /* keep the height map honest for things that stand on the ground */
    var h = heights[z * SX + x];
    if (id && y > h && B.byId[id].solid) heights[z * SX + x] = y;
    else if (!id && y === h) { while (h > 0 && !solidAt(x, h, z)) h--; heights[z * SX + x] = h; }
    return true;
  }
  function flush() {
    var k, n = 0;
    for (k in dirty) { rebuildChunk(Number(k)); n++; }
    dirty = {};
    return n;
  }

  /* ---------- the land beyond the map ---------- */

  function horizon() {
    var g = new THREE.Group();
    var skirt = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshLambertMaterial({ color: 0x5f9a3c }));
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.set(SX / 2, 3, SZ / 2);
    g.add(skirt);
    /* Fort Worth, far to the south */
    var mat = new THREE.MeshLambertMaterial({ color: 0x4a5560 });
    var i, w, h, x, b;
    seed = 2026;
    for (i = 0; i < 26; i++) {
      w = 6 + rnd() * 10; h = 14 + rnd() * 46; x = SX / 2 - 120 + rnd() * 240;
      b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
      b.position.set(x, 3 + h / 2, SZ + 130 + rnd() * 40);
      g.add(b);
    }
    return g;
  }

  function build(onProgress) {
    buildTerrain();
    buildTown();
    clouds();
    group.add(horizon());
    var total = CX * CZ, i;
    for (i = 0; i < total; i++) chunks[i] = { group: null, dirty: false };
    /* near chunks first, so the view fills in around the player */
    var order = [], sx = Math.floor(spawnPoint.x / CH), sz = Math.floor(spawnPoint.z / CH);
    for (i = 0; i < total; i++) order.push(i);
    order.sort(function (a, b) {
      var ax = a % CX - sx, az = Math.floor(a / CX) - sz, bx = b % CX - sx, bz = Math.floor(b / CX) - sz;
      return (ax * ax + az * az) - (bx * bx + bz * bz);
    });
    var n = 0;
    return new Promise(function (resolve) {
      function batch() {
        var t0 = performance.now(), budget = document.hidden ? 5000 : 30;   /* a hidden tab gets no frames, so just finish */
        while (n < total && performance.now() - t0 < budget) { rebuildChunk(order[n]); n++; }
        if (onProgress) onProgress(n / total);
        if (n < total) setTimeout(batch, 0); else resolve(group);
      }
      batch();
    });
  }
  var spawnPoint = { x: C - 2, z: C + 30 };

  window.WORLD = {
    SX: SX, SY: SY, SZ: SZ, GROUND: GROUND,
    C: C, ROAD_Z: ROAD_Z, LANE_X: LANE_X, RAIL_X: RAIL_X, GANTRY_Z: GANTRY_Z, TOWER: TOWER, LAKE: LAKE,
    ID: ID,
    get: get, solidAt: solidAt, surface: surface,
    setBlock: setBlock, flush: flush,
    materials: materials, texture: texture, group: group,
    places: places, doors: doors,
    build: build,
    spawn: spawnPoint,
    guestWalls: function () { return guestWalls; },
    joes: function () { return joes; },
    briefFront: function () { return briefFront; }
  };
})();
