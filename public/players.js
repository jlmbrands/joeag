/* joe.ag — everyone who is not you: other visitors, Luke and Novy, and the cows. */

(function () {
  'use strict';

  window.Players = function (scene, W, blockMat) {

    /* ---------- a blocky person ---------- */
    var skinMats = [blockMat('planks'), blockMat('blue_wall'), blockMat('red_awning'), blockMat('green'), blockMat('concrete')];
    var faceMat = blockMat('cow_face');
    var legMat = blockMat('black');

    function makeFigure(id) {
      var g = new THREE.Group(), body = skinMats[id % skinMats.length];
      var torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.3), body); torso.position.y = 1.1; g.add(torso);
      var head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), [blockMat('sand'), blockMat('sand'), blockMat('sand'), blockMat('sand'), blockMat('sand'), blockMat('sand')]); head.position.y = 1.75; g.add(head);
      var la = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), body); la.position.set(-0.42, 1.1, 0); g.add(la);
      var ra = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), body); ra.position.set(0.42, 1.1, 0); g.add(ra);
      var ll = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.24), legMat); ll.position.set(-0.15, 0.375, 0); g.add(ll);
      var rl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.24), legMat); rl.position.set(0.15, 0.375, 0); g.add(rl);
      g.userData = { la: la, ra: ra, ll: ll, rl: rl, head: head };
      return g;
    }

    function makeLabel(text) {
      var c = document.createElement('canvas'); c.width = 256; c.height = 48;
      var x = c.getContext('2d');
      x.fillStyle = 'rgba(20,20,20,0.6)'; x.fillRect(0, 0, 256, 48);
      x.fillStyle = '#f3f0e6'; x.font = '26px "Courier New", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(text, 128, 25);
      var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter;
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
      s.scale.set(2.4, 0.45, 1);
      s.position.y = 2.25;
      return s;
    }

    var people = {};   /* id -> { mesh, x,y,z, yaw, tx,ty,tz, tyaw, moving, phase, name } */
    function upsert(m) {
      var p = people[m.id];
      if (!p) {
        p = { mesh: makeFigure(m.id), x: m.x, y: m.y, z: m.z, yaw: m.yaw, tx: m.x, ty: m.y, tz: m.z, tyaw: m.yaw, phase: 0, moving: 0, name: '' };
        scene.add(p.mesh);
        people[m.id] = p;
      }
      p.tx = m.x; p.ty = m.y; p.tz = m.z; p.tyaw = m.yaw; p.tpitch = m.pitch || 0; p.moving = m.m ? 1 : 0;
      var name = m.n || '';
      if (name !== p.name) {
        p.name = name;
        if (p.label) { p.mesh.remove(p.label); p.label = null; }
        if (name) { p.label = makeLabel(name); p.mesh.add(p.label); }
      }
    }
    function remove(id) { var p = people[id]; if (p) { scene.remove(p.mesh); delete people[id]; } }
    function count() { return Object.keys(people).length; }

    /* ---------- dogs ---------- */
    var dogs = [];
    function makeDog(bodyMat, earMat) {
      var g = new THREE.Group();
      var body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.4), bodyMat); body.position.y = 0.5; g.add(body);
      var head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.38, 0.4), bodyMat); head.position.set(0.6, 0.72, 0); g.add(head);
      var snout = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.22), legMat); snout.position.set(0.86, 0.64, 0); g.add(snout);
      var e1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.12), earMat); e1.position.set(0.55, 0.85, 0.2); g.add(e1);
      var e2 = e1.clone(); e2.position.z = -0.2; g.add(e2);
      var tail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.08), bodyMat); tail.position.set(-0.55, 0.62, 0); g.add(tail);
      [[-0.3, -0.13], [-0.3, 0.13], [0.3, -0.13], [0.3, 0.13]].forEach(function (o) {
        var leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.14), bodyMat); leg.position.set(o[0], 0.15, o[1]); g.add(leg);
      });
      g.userData = { tail: tail };
      return g;
    }
    var dogDefs = [
      { name: 'Luke', body: blockMat('black'), ear: blockMat('black'), ox: W.C - 56, oz: W.C + 45 },
      { name: 'Novy', body: blockMat('red_roof'), ear: blockMat('hay'), ox: W.C - 60, oz: W.C + 46 }
    ];
    dogDefs.forEach(function (d, i) {
      var mesh = makeDog(d.body, d.ear);
      var dog = { name: d.name, mesh: mesh, x: d.ox + 0.5, z: d.oz + 0.5, y: 0, a: 0, following: false, phase: i * 2, sitT: 0 };
      dog.y = W.surface(d.ox, d.oz) + 1;
      mesh.position.set(dog.x, dog.y, dog.z);
      scene.add(mesh);
      dogs.push(dog);
    });

    function moveDog(dog, dt, player) {
      var dx = player.x - dog.x, dz = player.z - dog.z, d = Math.sqrt(dx * dx + dz * dz);
      if (!dog.following && d < 6) { dog.following = true; if (window.JoeAudio) window.JoeAudio.bark(); }
      if (dog.following && d > 40) dog.following = false;
      var want = dog.following ? 2.6 + (dog.name === 'Novy' ? 0.6 : 0) : 0;
      var speed = 0;
      if (dog.following && d > 2.4 + dog.phase * 0.3) {
        speed = Math.min(want, d) * (d > 12 ? 2 : 1);
        dog.a = Math.atan2(dz, dx);
        var nx = dog.x + Math.cos(dog.a) * speed * dt, nz = dog.z + Math.sin(dog.a) * speed * dt;
        var gy = W.surface(Math.floor(nx), Math.floor(nz)) + 1;
        if (gy - dog.y <= 1.2) { dog.x = nx; dog.z = nz; }
      }
      var ty = W.surface(Math.floor(dog.x), Math.floor(dog.z)) + 1;
      dog.y += (ty - dog.y) * Math.min(1, dt * 10);
      dog.phase += dt * (speed > 0 ? 10 : 2);
      dog.mesh.position.set(dog.x, dog.y + (speed > 0 ? Math.abs(Math.sin(dog.phase)) * 0.12 : 0), dog.z);
      dog.mesh.rotation.y = -dog.a;
      dog.mesh.userData.tail.rotation.y = Math.sin(dog.phase * 1.5) * 0.6;
    }

    /* ---------- cows ---------- */
    var cowBody = blockMat('cow'), cowFace = blockMat('cow_face');
    function makeCow() {
      var g = new THREE.Group();
      var body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.8), cowBody); body.position.y = 0.95; g.add(body);
      var head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), [cowBody, cowFace, cowBody, cowBody, cowBody, cowBody]); head.position.set(0.8, 1.2, 0); g.add(head);
      [[-0.4, -0.25], [-0.4, 0.25], [0.4, -0.25], [0.4, 0.25]].forEach(function (o) {
        var leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.22), legMat); leg.position.set(o[0], 0.25, o[1]); g.add(leg);
      });
      return g;
    }
    var cows = [];
    [[W.C - 64, W.C + 44], [W.C - 52, W.C + 50], [W.C - 60, W.C + 56], [W.C - 48, W.C + 36]].forEach(function (o) {
      var c = makeCow();
      var cow = { mesh: c, x: o[0] + 0.5, z: o[1] + 0.5, a: Math.random() * Math.PI * 2, t: 0, hop: 0 };
      c.position.set(cow.x, W.surface(o[0], o[1]) + 1, cow.z);
      scene.add(c);
      cows.push(cow);
    });
    function moveCow(cow, dt) {
      cow.t -= dt;
      if (cow.t <= 0) { cow.t = 2 + Math.random() * 4; cow.a = Math.random() * Math.PI * 2; cow.walking = Math.random() < 0.6; }
      if (cow.walking) {
        var nx = cow.x + Math.cos(cow.a) * dt * 0.8, nz = cow.z + Math.sin(cow.a) * dt * 0.8;
        if (nx > W.C - 68 && nx < W.C - 46 && nz > W.C + 32 && nz < W.C + 58 && !W.solidAt(Math.floor(nx), W.surface(Math.floor(nx), Math.floor(nz)) + 1, Math.floor(nz))) { cow.x = nx; cow.z = nz; }
        else cow.a += Math.PI;
      }
      if (cow.hop > 0) cow.hop = Math.max(0, cow.hop - dt * 3);
      cow.mesh.position.set(cow.x, W.surface(Math.floor(cow.x), Math.floor(cow.z)) + 1 + Math.sin(cow.hop * Math.PI) * 0.5, cow.z);
      cow.mesh.rotation.y = -cow.a;
    }
    function nearestCow(player, r) {
      var best = null, bd = r * r, i, dx, dz, d;
      for (i = 0; i < cows.length; i++) { dx = cows[i].x - player.x; dz = cows[i].z - player.z; d = dx * dx + dz * dz; if (d < bd) { bd = d; best = cows[i]; } }
      return best;
    }
    function pet(cow) { cow.hop = 1; cow.t = 1.5; cow.walking = false; if (window.JoeAudio) window.JoeAudio.moo(); }
    function nearestDog(player, r) {
      var best = null, bd = r * r, i, dx, dz, d;
      for (i = 0; i < dogs.length; i++) { dx = dogs[i].x - player.x; dz = dogs[i].z - player.z; d = dx * dx + dz * dz; if (d < bd) { bd = d; best = dogs[i]; } }
      return best;
    }

    /* ---------- per frame ---------- */
    function update(dt, player) {
      var k;
      for (k in people) {
        var p = people[k], u = p.mesh.userData;
        p.x += (p.tx - p.x) * Math.min(1, dt * 10); p.y += (p.ty - p.y) * Math.min(1, dt * 10); p.z += (p.tz - p.z) * Math.min(1, dt * 10);
        var dy = p.tyaw - p.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
        p.yaw += dy * Math.min(1, dt * 10);
        p.mesh.position.set(p.x, p.y, p.z);
        p.mesh.rotation.y = p.yaw + Math.PI;
        u.head.rotation.x = -(p.tpitch || 0) * 0.6;
        if (p.moving) { p.phase += dt * 9; var s = Math.sin(p.phase) * 0.7; u.ll.rotation.x = s; u.rl.rotation.x = -s; u.la.rotation.x = -s; u.ra.rotation.x = s; }
        else { u.ll.rotation.x *= 0.8; u.rl.rotation.x *= 0.8; u.la.rotation.x *= 0.8; u.ra.rotation.x *= 0.8; }
      }
      dogs.forEach(function (d) { moveDog(d, dt, player); });
      cows.forEach(function (c) { moveCow(c, dt); });
    }

    return { upsert: upsert, remove: remove, count: count, update: update, nearestCow: nearestCow, pet: pet, nearestDog: nearestDog, dogs: dogs, people: people };
  };
})();
