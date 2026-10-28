/* joe.ag — block types and their textures.
   Every texture is drawn here at 16x16 into one atlas. Nothing is loaded from disk. */

(function () {
  'use strict';

  var TILE = 16, COLS = 8;

  /* ---------- a tiny deterministic noise so textures are the same every load ---------- */
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

  function fillTile(ctx, base, grain, amount) {
    var i, j, c;
    for (j = 0; j < TILE; j++) for (i = 0; i < TILE; i++) {
      c = base.map(function (v, k) { return Math.max(0, Math.min(255, v + (rnd() - 0.5) * 2 * (grain[k] || grain[0]) * amount)); });
      ctx.fillStyle = 'rgb(' + c.map(Math.round).join(',') + ')';
      ctx.fillRect(i, j, 1, 1);
    }
  }
  function px(ctx, x, y, rgb) { ctx.fillStyle = 'rgb(' + rgb.join(',') + ')'; ctx.fillRect(x, y, 1, 1); }
  function rect(ctx, x, y, w, h, rgb) { ctx.fillStyle = 'rgb(' + rgb.join(',') + ')'; ctx.fillRect(x, y, w, h); }

  /* ---------- tile painters, by name ---------- */
  var painters = {
    grass_top: function (c) { fillTile(c, [96, 150, 62], [14], 1); },
    grass_side: function (c) {
      fillTile(c, [134, 96, 62], [12], 1);
      var i, d;
      for (i = 0; i < TILE; i++) { d = 2 + ((i * 7) % 3); rect(c, i, 0, 1, d, [96, 150, 62]); }
    },
    dirt: function (c) { fillTile(c, [134, 96, 62], [12], 1); },
    stone: function (c) { fillTile(c, [128, 128, 128], [10], 1); },
    sand: function (c) { fillTile(c, [214, 200, 150], [8], 1); },
    planks: function (c) {
      fillTile(c, [176, 140, 86], [8], 1);
      var y; for (y = 3; y < TILE; y += 4) rect(c, 0, y, TILE, 1, [120, 90, 52]);
      rect(c, 7, 0, 1, 3, [120, 90, 52]); rect(c, 2, 4, 1, 3, [120, 90, 52]); rect(c, 11, 8, 1, 3, [120, 90, 52]); rect(c, 5, 12, 1, 3, [120, 90, 52]);
    },
    log_side: function (c) {
      fillTile(c, [96, 72, 44], [8], 1);
      var i; for (i = 0; i < TILE; i += 3) rect(c, i, 0, 1, TILE, [72, 52, 30]);
    },
    log_top: function (c) {
      fillTile(c, [176, 140, 86], [6], 1);
      rect(c, 3, 3, 10, 10, [150, 116, 70]); rect(c, 5, 5, 6, 6, [176, 140, 86]); rect(c, 7, 7, 2, 2, [120, 90, 52]);
    },
    leaves: function (c) {
      var i, j;
      for (j = 0; j < TILE; j++) for (i = 0; i < TILE; i++) {
        if (rnd() < 0.06) continue; /* a few holes */
        px(c, i, j, [52 + rnd() * 30, 110 + rnd() * 40, 40 + rnd() * 20]);
      }
    },
    glass: function (c) {
      var i, j;
      for (j = 0; j < TILE; j++) for (i = 0; i < TILE; i++) px(c, i, j, [200, 230, 240]);
      c.clearRect(1, 1, 14, 14);
      px(c, 2, 2, [230, 245, 250]); px(c, 3, 2, [230, 245, 250]); px(c, 2, 3, [230, 245, 250]);
    },
    brick: function (c) {
      fillTile(c, [160, 78, 60], [10], 1);
      var y, x, off;
      for (y = 0; y < TILE; y += 4) {
        rect(c, 0, y + 3, TILE, 1, [214, 204, 190]);
        off = (y / 4) % 2 ? 4 : 0;
        for (x = off; x < TILE; x += 8) rect(c, x, y, 1, 3, [214, 204, 190]);
      }
    },
    white_wall: function (c) { fillTile(c, [236, 230, 214], [5], 1); var y; for (y = 2; y < TILE; y += 5) rect(c, 0, y, TILE, 1, [214, 206, 188]); },
    concrete: function (c) { fillTile(c, [170, 170, 165], [7], 1); },
    shingles: function (c) {
      fillTile(c, [70, 60, 58], [8], 1);
      var y, x, off;
      for (y = 0; y < TILE; y += 4) { rect(c, 0, y, TILE, 1, [40, 34, 32]); off = (y / 4) % 2 ? 4 : 0; for (x = off; x < TILE; x += 8) rect(c, x, y, 1, 4, [40, 34, 32]); }
    },
    red_roof: function (c) {
      fillTile(c, [150, 48, 40], [8], 1);
      var y; for (y = 0; y < TILE; y += 4) rect(c, 0, y, TILE, 1, [100, 30, 26]);
    },
    asphalt: function (c) { fillTile(c, [66, 66, 70], [6], 1); },
    asphalt_line: function (c) { fillTile(c, [66, 66, 70], [6], 1); rect(c, 7, 0, 2, TILE, [230, 200, 60]); },
    asphalt_dash: function (c) { fillTile(c, [66, 66, 70], [6], 1); rect(c, 7, 2, 2, 8, [236, 236, 230]); },
    water: function (c) {
      var i, j;
      for (j = 0; j < TILE; j++) for (i = 0; i < TILE; i++) px(c, i, j, [54 + rnd() * 20, 110 + rnd() * 20, 190 + rnd() * 20]);
    },
    rail: function (c) {
      fillTile(c, [134, 96, 62], [12], 1);
      var y; for (y = 1; y < TILE; y += 4) rect(c, 0, y, TILE, 2, [110, 80, 50]);
      rect(c, 3, 0, 2, TILE, [150, 150, 150]); rect(c, 11, 0, 2, TILE, [150, 150, 150]);
    },
    metal: function (c) { fillTile(c, [150, 155, 160], [6], 1); rect(c, 0, 0, TILE, 1, [190, 195, 200]); rect(c, 0, 15, TILE, 1, [100, 105, 110]); },
    yellow: function (c) { fillTile(c, [240, 196, 40], [6], 1); },
    black: function (c) { fillTile(c, [28, 28, 30], [3], 1); },
    door: function (c) {
      fillTile(c, [120, 90, 52], [6], 1);
      rect(c, 2, 1, 12, 14, [150, 116, 70]); rect(c, 3, 2, 10, 5, [120, 90, 52]); rect(c, 3, 9, 10, 5, [120, 90, 52]);
      rect(c, 12, 8, 1, 1, [230, 200, 60]);
    },
    door_top: function (c) {
      fillTile(c, [120, 90, 52], [6], 1);
      rect(c, 2, 1, 12, 14, [150, 116, 70]); rect(c, 3, 2, 10, 12, [200, 230, 240]); rect(c, 7, 2, 2, 12, [150, 116, 70]);
    },
    hay: function (c) { fillTile(c, [210, 180, 90], [12], 1); var y; for (y = 0; y < TILE; y += 2) rect(c, 0, y, TILE, 1, [190, 160, 70]); },
    hay_top: function (c) { fillTile(c, [210, 180, 90], [12], 1); rect(c, 4, 4, 8, 8, [190, 160, 70]); rect(c, 6, 6, 4, 4, [210, 180, 90]); },
    cow: function (c) { fillTile(c, [240, 240, 236], [4], 1); rect(c, 2, 3, 6, 5, [40, 36, 34]); rect(c, 10, 9, 5, 6, [40, 36, 34]); rect(c, 1, 12, 3, 3, [40, 36, 34]); },
    cow_face: function (c) { fillTile(c, [240, 240, 236], [4], 1); rect(c, 3, 4, 2, 2, [40, 36, 34]); rect(c, 11, 4, 2, 2, [40, 36, 34]); rect(c, 4, 10, 8, 5, [220, 160, 160]); rect(c, 5, 12, 2, 1, [120, 70, 70]); rect(c, 9, 12, 2, 1, [120, 70, 70]); },
    cloud: function (c) { fillTile(c, [250, 250, 252], [2], 1); },
    lamp: function (c) { fillTile(c, [255, 236, 170], [6], 1); rect(c, 0, 0, TILE, 1, [220, 180, 90]); rect(c, 0, 15, TILE, 1, [220, 180, 90]); },
    sign: function (c) { fillTile(c, [236, 230, 214], [5], 1); rect(c, 0, 0, TILE, 1, [40, 36, 34]); rect(c, 0, 15, TILE, 1, [40, 36, 34]); rect(c, 0, 0, 1, TILE, [40, 36, 34]); rect(c, 15, 0, 1, TILE, [40, 36, 34]); },
    red_awning: function (c) { fillTile(c, [190, 50, 44], [5], 1); var x; for (x = 0; x < TILE; x += 4) rect(c, x, 0, 2, TILE, [236, 230, 214]); },
    blue_wall: function (c) { fillTile(c, [52, 90, 150], [6], 1); },
    green: function (c) { fillTile(c, [50, 120, 70], [8], 1); },
    gold: function (c) { fillTile(c, [230, 190, 60], [10], 1); rect(c, 2, 2, 4, 1, [255, 240, 170]); rect(c, 2, 2, 1, 4, [255, 240, 170]); rect(c, 10, 11, 4, 1, [170, 130, 30]); },
    window_lit: function (c) { fillTile(c, [255, 222, 140], [8], 1); rect(c, 0, 0, TILE, 1, [120, 100, 60]); rect(c, 0, 15, TILE, 1, [120, 100, 60]); rect(c, 0, 0, 1, TILE, [120, 100, 60]); rect(c, 15, 0, 1, TILE, [120, 100, 60]); rect(c, 7, 0, 2, TILE, [120, 100, 60]); rect(c, 0, 7, TILE, 2, [120, 100, 60]); },
    stone_brick: function (c) { fillTile(c, [120, 120, 118], [8], 1); var y, x, off; for (y = 0; y < TILE; y += 8) { rect(c, 0, y + 7, TILE, 1, [80, 80, 78]); off = (y / 8) % 2 ? 8 : 0; for (x = off; x < TILE; x += 16) rect(c, x, y, 1, 7, [80, 80, 78]); } },
    fire: function (c) { var i, j; for (j = 0; j < TILE; j++) for (i = 0; i < TILE; i++) { var k = rnd(); px(c, i, j, k < 0.5 ? [255, 120, 30] : (k < 0.8 ? [255, 200, 60] : [200, 50, 20])); } },
    snow: function (c) { fillTile(c, [240, 244, 250], [4], 1); },
    screen: function (c) { fillTile(c, [20, 30, 40], [3], 1); rect(c, 2, 3, 12, 1, [80, 220, 120]); rect(c, 2, 6, 8, 1, [80, 220, 120]); rect(c, 2, 9, 10, 1, [80, 220, 120]); rect(c, 2, 12, 5, 1, [255, 220, 80]); },
    paper: function (c) { fillTile(c, [240, 236, 224], [4], 1); var y; for (y = 2; y < TILE; y += 3) rect(c, 2, y, 12, 1, [200, 196, 184]); }
  };

  var names = Object.keys(painters);
  var tileIndex = {};
  names.forEach(function (n, i) { tileIndex[n] = i; });

  /* ---------- build the atlas ---------- */
  var atlas = document.createElement('canvas');
  var rows = Math.ceil(names.length / COLS);
  atlas.width = TILE * COLS; atlas.height = TILE * rows;
  var actx = atlas.getContext('2d');
  names.forEach(function (n, i) {
    var cx = (i % COLS) * TILE, cy = Math.floor(i / COLS) * TILE;
    var t = document.createElement('canvas'); t.width = TILE; t.height = TILE;
    painters[n](t.getContext('2d'));
    actx.drawImage(t, cx, cy);
  });

  /* ---------- block types: faces are [top, bottom, sides...] by tile name ---------- */
  /* side order: +x, -x, +z, -z */
  function B(top, bottom, side, opts) {
    var o = opts || {};
    return { top: tileIndex[top], bottom: tileIndex[bottom], side: tileIndex[side], transparent: !!o.transparent, solid: o.solid !== false, cutout: !!o.cutout };
  }

  var blocks = {
    air: null,
    grass: B('grass_top', 'dirt', 'grass_side'),
    dirt: B('dirt', 'dirt', 'dirt'),
    stone: B('stone', 'stone', 'stone'),
    sand: B('sand', 'sand', 'sand'),
    planks: B('planks', 'planks', 'planks'),
    log: B('log_top', 'log_top', 'log_side'),
    leaves: B('leaves', 'leaves', 'leaves', { transparent: true, cutout: true }),
    glass: B('glass', 'glass', 'glass', { transparent: true, cutout: true }),
    brick: B('brick', 'brick', 'brick'),
    white: B('white_wall', 'white_wall', 'white_wall'),
    concrete: B('concrete', 'concrete', 'concrete'),
    shingles: B('shingles', 'shingles', 'shingles'),
    red_roof: B('red_roof', 'red_roof', 'red_roof'),
    asphalt: B('asphalt', 'asphalt', 'asphalt'),
    asphalt_line: B('asphalt_line', 'asphalt', 'asphalt'),
    asphalt_dash: B('asphalt_dash', 'asphalt', 'asphalt'),
    water: B('water', 'water', 'water', { transparent: true, solid: false }),
    rail: B('rail', 'dirt', 'dirt'),
    metal: B('metal', 'metal', 'metal'),
    yellow: B('yellow', 'yellow', 'yellow'),
    black: B('black', 'black', 'black'),
    door: B('planks', 'planks', 'door', { solid: false }),
    door_top: B('planks', 'planks', 'door_top', { solid: false }),
    hay: B('hay_top', 'hay_top', 'hay'),
    cloud: B('cloud', 'cloud', 'cloud'),
    lamp: B('lamp', 'lamp', 'lamp'),
    sign: B('sign', 'sign', 'sign'),
    red_awning: B('red_awning', 'red_awning', 'red_awning'),
    blue: B('blue_wall', 'blue_wall', 'blue_wall'),
    green: B('green', 'green', 'green'),
    gold: B('gold', 'gold', 'gold'),
    stone_brick: B('stone_brick', 'stone_brick', 'stone_brick'),
    fire: B('fire', 'fire', 'fire', { transparent: true, cutout: true, solid: false }),
    snow: B('snow', 'snow', 'snow'),
    screen: B('black', 'black', 'screen'),
    paper: B('paper', 'paper', 'paper'),
    hatch: B('planks', 'planks', 'planks', { solid: false })
  };

  var ids = Object.keys(blocks);
  var byId = ids.map(function (k) { return blocks[k]; });
  var id = {};
  ids.forEach(function (k, i) { id[k] = i; });

  window.BLOCKS = {
    atlas: atlas,
    TILE: TILE,
    COLS: COLS,
    ROWS: rows,
    tile: tileIndex,
    id: id,          /* name -> numeric id */
    byId: byId,      /* numeric id -> definition (null for air) */
    names: ids
  };
})();
