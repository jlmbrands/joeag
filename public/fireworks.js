/* joe.ag — the fireworks launcher.
   A rocket goes up, and when it bursts the sparks arrange themselves into a word
   that faces whoever fired it. Plain Three.js points, one buffer, no textures. */

(function () {
  'use strict';

  window.Fireworks = function (scene, camera) {
    var MAX = 6000;
    var WORD = 'JOE';
    var GRAVITY = 9.8;

    /* ---------- one Points object holds every spark ---------- */
    var positions = new Float32Array(MAX * 3);
    var colors = new Float32Array(MAX * 3);
    var sizes = new Float32Array(MAX);
    var alphas = new Float32Array(MAX);
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    geo.setDrawRange(0, 0);

    var mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 300 } },
      vertexShader: [
        'attribute float size;',
        'attribute float alpha;',
        'varying vec3 vColor;',
        'varying float vAlpha;',
        'uniform float scale;',
        'void main() {',
        '  vColor = color; vAlpha = alpha;',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  gl_PointSize = size * (scale / -mv.z);',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vColor;',
        'varying float vAlpha;',
        'void main() {',
        '  vec2 d = gl_PointCoord - 0.5;',
        '  if (dot(d, d) > 0.25) discard;',
        '  gl_FragColor = vec4(vColor, vAlpha);',
        '}'
      ].join('\n'),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    var points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);

    /* ---------- spark pool ---------- */
    var sparks = [];     /* { x,y,z, vx,vy,vz, tx,ty,tz (target or null), life, max, r,g,b, size, drag } */
    var rockets = [];    /* { x,y,z, vx,vy,vz, fuse, r,g,b } */

    function spark(s) { if (sparks.length < MAX) sparks.push(s); }

    /* ---------- the word, sampled once into unit coordinates ---------- */
    function sampleWord() {
      var c = document.createElement('canvas');
      c.width = 320; c.height = 120;
      var x = c.getContext('2d');
      x.fillStyle = '#fff';
      x.font = '500 104px "Playfair Display", Georgia, serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(WORD, c.width / 2, c.height / 2 + 4);
      var img = x.getImageData(0, 0, c.width, c.height).data;
      var out = [], i, j;
      for (j = 0; j < c.height; j += 3) for (i = 0; i < c.width; i += 3) {
        if (img[(j * c.width + i) * 4 + 3] > 128) out.push([(i / c.width) - 0.5, 0.5 - (j / c.height)]);
      }
      return out;
    }
    var letterPoints = sampleWord();
    if (document.fonts && document.fonts.load) {
      document.fonts.load('500 104px "Playfair Display"').then(function () {
        var next = sampleWord();
        if (next.length) letterPoints = next;
      }).catch(function () {});
    }

    var palettes = [
      [[1, 0.55, 0.2], [1, 0.85, 0.3]],     /* orange and gold */
      [[0.4, 0.8, 1], [0.9, 0.95, 1]],      /* ice */
      [[1, 0.3, 0.5], [1, 0.7, 0.8]],       /* pink */
      [[0.5, 1, 0.5], [0.9, 1, 0.7]],       /* green */
      [[0.8, 0.5, 1], [1, 0.8, 1]]          /* violet */
    ];
    var shot = 0;

    /* ---------- fire ---------- */
    function launch(x, y, z, dx, dy, dz, ox, oz) {
      var pal = palettes[shot++ % palettes.length];
      rockets.push({
        x: x, y: y, z: z,
        vx: dx * 22, vy: Math.max(14, dy * 22 + 16), vz: dz * 22,
        fuse: 1.5 + Math.random() * 0.3,
        pal: pal, ox: ox, oz: oz
      });
      if (window.JoeAudio) window.JoeAudio.play('thump');
    }
    function fire() {
      var dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      var right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      var p = camera.position;
      var x = p.x + dir.x * 0.8 + right.x * 0.35, y = p.y - 0.25 + dir.y * 0.8, z = p.z + dir.z * 0.8 + right.z * 0.35;
      launch(x, y, z, dir.x, dir.y, dir.z, p.x, p.z);
      return { x: x, y: y, z: z, dx: dir.x, dy: dir.y, dz: dir.z };
    }
    /* somebody else's rocket, seen from here: the word still faces them */
    function remote(m) { launch(m.x, m.y, m.z, m.dx, m.dy, m.dz, m.x, m.z); }

    function burst(r) {
      /* the word faces the spot it was fired from */
      var dx = r.ox - r.x, dz = r.oz - r.z, len = Math.sqrt(dx * dx + dz * dz) || 1;
      var fx = dx / len, fz = dz / len;                 /* toward the viewer */
      var rx = fz, rz = -fx;                            /* the viewer's right, on the ground plane */
      var W = 26, H = 10, i, lp, tx, ty, tz, k, c, n = letterPoints.length;
      for (i = 0; i < n; i++) {
        lp = letterPoints[i];
        tx = r.x + rx * lp[0] * W; ty = r.y + lp[1] * H; tz = r.z + rz * lp[0] * W;
        k = Math.random();
        c = k < 0.75 ? r.pal[0] : r.pal[1];
        spark({
          x: r.x, y: r.y, z: r.z,
          vx: (tx - r.x) * 3.2, vy: (ty - r.y) * 3.2, vz: (tz - r.z) * 3.2,
          tx: tx, ty: ty, tz: tz,
          life: 0, max: 3.2 + Math.random() * 0.8,
          r: c[0], g: c[1], b: c[2], size: 0.5 + Math.random() * 0.25, drag: 3.2, held: true
        });
      }
      /* a plain sphere of sparks around it so the burst reads as a firework */
      for (i = 0; i < 220; i++) {
        var th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), sp = 9 + Math.random() * 7;
        spark({
          x: r.x, y: r.y, z: r.z,
          vx: Math.sin(ph) * Math.cos(th) * sp, vy: Math.cos(ph) * sp, vz: Math.sin(ph) * Math.sin(th) * sp,
          tx: null, life: 0, max: 1.1 + Math.random() * 0.6,
          r: 1, g: 0.95, b: 0.8, size: 0.35, drag: 1.2
        });
      }
    }

    /* ---------- update ---------- */
    function update(dt) {
      var i, r, s, n = 0;
      for (i = rockets.length - 1; i >= 0; i--) {
        r = rockets[i];
        r.vy -= GRAVITY * dt;
        r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
        r.fuse -= dt;
        /* trail */
        spark({ x: r.x, y: r.y, z: r.z, vx: (Math.random() - 0.5) * 2, vy: -2 - Math.random() * 2, vz: (Math.random() - 0.5) * 2, tx: null, life: 0, max: 0.5, r: 1, g: 0.8, b: 0.5, size: 0.3, drag: 2 });
        spark({ x: r.x, y: r.y, z: r.z, vx: 0, vy: 0, vz: 0, tx: null, life: 0, max: 0.08, r: 1, g: 1, b: 0.9, size: 0.7, drag: 0 });
        if (r.fuse <= 0) { burst(r); rockets.splice(i, 1); }
      }
      for (i = sparks.length - 1; i >= 0; i--) {
        s = sparks[i];
        s.life += dt;
        if (s.life >= s.max) { sparks[i] = sparks[sparks.length - 1]; sparks.pop(); continue; }
        if (s.tx !== null) {
          if (s.held) {
            /* fly to the letter, then hang there and drift down slowly */
            var k = Math.exp(-s.drag * dt);
            s.vx *= k; s.vy *= k; s.vz *= k;
            s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
            if (s.life > 0.9) { s.held = false; s.vx = (Math.random() - 0.5) * 0.4; s.vy = -0.3; s.vz = (Math.random() - 0.5) * 0.4; }
          } else {
            s.vy -= 0.6 * dt;
            s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
          }
        } else {
          s.vy -= GRAVITY * 0.6 * dt;
          var d = Math.exp(-s.drag * dt);
          s.vx *= d; s.vy *= d; s.vz *= d;
          s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
        }
        var t = s.life / s.max, a = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
        var flick = s.tx !== null && s.life > 1.5 ? 0.75 + 0.25 * Math.sin(s.life * 30 + i) : 1;
        positions[n * 3] = s.x; positions[n * 3 + 1] = s.y; positions[n * 3 + 2] = s.z;
        colors[n * 3] = s.r; colors[n * 3 + 1] = s.g; colors[n * 3 + 2] = s.b;
        sizes[n] = s.size; alphas[n] = a * flick;
        n++;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.attributes.size.needsUpdate = true;
      geo.attributes.alpha.needsUpdate = true;
      geo.setDrawRange(0, n);
    }

    function resize(h) { mat.uniforms.scale.value = h * 0.45; }

    return { fire: fire, remote: remote, update: update, resize: resize, count: function () { return rockets.length + sparks.length; } };
  };
})();
