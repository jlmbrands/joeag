/* joe.ag — the pickup on 287 and the train on the Santa Fe. Both can be ridden. */

(function () {
  'use strict';

  window.Vehicles = function (scene, W, blockMat) {
    var legMat = blockMat('black');

    /* ---------- the pickup ---------- */
    var truck = { mesh: new THREE.Group(), x: W.SX + 10, z: W.ROAD_Z + 1.5, speed: 9, dir: -1, rider: false, name: 'the pickup' };
    (function () {
      var m = blockMat('blue_wall');
      var bed = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.9, 2), m); bed.position.set(0, 0.9, 0); truck.mesh.add(bed);
      var cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1, 1.9), m); cab.position.set(1, 1.85, 0); truck.mesh.add(cab);
      var glass = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 1.6), blockMat('glass')); glass.position.set(1.95, 1.9, 0); truck.mesh.add(glass);
      [[-1.5, -1], [-1.5, 1], [1.5, -1], [1.5, 1]].forEach(function (o) { var w = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.3), legMat); w.position.set(o[0], 0.35, o[1]); truck.mesh.add(w); });
      truck.mesh.position.set(truck.x, W.GROUND + 1, truck.z);
      scene.add(truck.mesh);
    })();

    /* ---------- the train ---------- */
    var train = { mesh: new THREE.Group(), z: -60, speed: 7, rider: false, name: 'the Santa Fe' };
    (function () {
      var trainMat = blockMat('metal'), cabMat = blockMat('black'), boxMat = blockMat('red_roof');
      var engine = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 6), trainMat); engine.position.set(0, 1.6, 0); train.mesh.add(engine);
      var cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 2), cabMat); cab.position.set(0, 3.4, -2); train.mesh.add(cab);
      var stack = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1, 0.6), cabMat); stack.position.set(0, 3.2, 2); train.mesh.add(stack);
      var i, car;
      for (i = 1; i <= 4; i++) { car = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 6.5), i % 2 ? boxMat : trainMat); car.position.set(0, 1.7, -7.5 * i); train.mesh.add(car); }
      /* a flat car at the back you can stand on */
      var flat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 6.5), blockMat('planks')); flat.position.set(0, 0.8, -7.5 * 5); train.mesh.add(flat);
      train.mesh.position.set(W.RAIL_X + 0.5, W.GROUND + 1, train.z);
      scene.add(train.mesh);
    })();

    var riding = null;   /* truck or train */

    function nearest(player) {
      var dx = truck.x - player.x, dz = truck.z - player.z;
      if (dx * dx + dz * dz < 9) return truck;
      var tz = train.z - 7.5 * 5, tx = W.RAIL_X + 0.5;
      dx = tx - player.x; dz = tz - player.z;
      if (dx * dx + dz * dz < 20) return train;
      return null;
    }
    function board(v) { riding = v; v.rider = true; }
    function leave() { if (riding) riding.rider = false; riding = null; }

    function update(dt, keys, player) {
      /* the pickup: driven when ridden, otherwise it just goes */
      if (riding === truck) {
        var want = 0;
        if (keys.KeyW || keys.ArrowUp) want += 1;
        if (keys.KeyS || keys.ArrowDown) want -= 1;
        truck.speed += ((want * 16) - truck.speed) * Math.min(1, dt * 1.5);
        if (keys.KeyA || keys.ArrowLeft) truck.z = Math.max(W.ROAD_Z - 1.5, truck.z - 3 * dt);
        if (keys.KeyD || keys.ArrowRight) truck.z = Math.min(W.ROAD_Z + 1.5, truck.z + 3 * dt);
        truck.x += truck.speed * dt;
        if (truck.x > W.SX - 2) { truck.x = W.SX - 2; truck.speed = 0; }
        if (truck.x < 2) { truck.x = 2; truck.speed = 0; }
        truck.mesh.rotation.y = 0;
      } else {
        truck.x += truck.dir * 9 * dt;
        if (truck.x < -10) truck.x = W.SX + 10;
        truck.mesh.rotation.y = 0;
      }
      truck.mesh.position.set(truck.x, W.GROUND + 1, truck.z);
      truck.mesh.rotation.y = truck.dir < 0 ? Math.PI : 0;
      if (riding === truck) truck.mesh.rotation.y = truck.speed < 0 ? Math.PI : 0;

      train.z += train.speed * dt;
      if (train.z > W.SZ + 48) train.z = -60;
      train.mesh.position.z = train.z;

      if (riding === truck) { player.x = truck.x; player.z = truck.z; player.y = W.GROUND + 2.4; player.vy = 0; }
      if (riding === train) { player.x = W.RAIL_X + 0.5; player.z = train.z - 7.5 * 5; player.y = W.GROUND + 2.1; player.vy = 0; if (player.z > W.SZ - 3) leave(); }
    }

    return { update: update, nearest: nearest, board: board, leave: leave, riding: function () { return riding; }, truck: truck, train: train };
  };
})();
