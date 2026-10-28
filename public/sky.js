/* joe.ag — the sky: time of day on Texas time, sun and moon, stars, weather.
   Also turns the town's lights on at night. */

(function () {
  'use strict';

  window.Sky = function (scene, camera, W) {
    var sun = new THREE.DirectionalLight(0xfff2d8, 1.4);
    var ambient = new THREE.AmbientLight(0xbcd4ee, 0.9);
    var hemi = new THREE.HemisphereLight(0x8fb8e8, 0x4a6a2a, 0.35);
    scene.add(sun); scene.add(ambient); scene.add(hemi);
    scene.background = new THREE.Color(0x7fb2e5);
    scene.fog = new THREE.Fog(0x7fb2e5, 70, 190);

    /* ---------- time ---------- */
    var offsetHours = 0;            /* the T key moves time forward for a look */
    function texasHour() {
      var now = new Date();
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now);
      var h = 0, m = 0;
      parts.forEach(function (p) { if (p.type === 'hour') h = Number(p.value) % 24; if (p.type === 'minute') m = Number(p.value); });
      return (h + m / 60 + offsetHours) % 24;
    }
    function month() { return new Date().getMonth(); }

    /* ---------- sun, moon, stars ---------- */
    var sunDisc = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ color: 0xfff1b0, fog: false }));
    var moonDisc = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshBasicMaterial({ color: 0xe8ecf4, fog: false }));
    scene.add(sunDisc); scene.add(moonDisc);

    var starCount = 700, sp = new Float32Array(starCount * 3), i, th, ph;
    for (i = 0; i < starCount; i++) {
      th = Math.random() * Math.PI * 2; ph = Math.acos(Math.random() * 0.95 + 0.05);
      sp[i * 3] = Math.sin(ph) * Math.cos(th) * 900; sp[i * 3 + 1] = Math.cos(ph) * 900; sp[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 900;
    }
    var starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    var starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false });
    var stars = new THREE.Points(starGeo, starMat);
    stars.frustumCulled = false;
    scene.add(stars);

    /* the red light on the radio tower */
    var beacon = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff3030, fog: false, transparent: true }));
    beacon.scale.set(1.4, 1.4, 1);
    beacon.position.set(W.TOWER.x + 0.5, W.surface(W.TOWER.x, W.TOWER.z) + 24.2, W.TOWER.z + 0.5);
    scene.add(beacon);

    /* ---------- weather ---------- */
    var DROPS = 1400;
    var dropPos = new Float32Array(DROPS * 3);
    for (i = 0; i < DROPS; i++) { dropPos[i * 3] = (Math.random() - 0.5) * 60; dropPos[i * 3 + 1] = Math.random() * 30; dropPos[i * 3 + 2] = (Math.random() - 0.5) * 60; }
    var dropGeo = new THREE.BufferGeometry();
    dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
    var dropMat = new THREE.PointsMaterial({ color: 0xcfe0f4, size: 3, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    var drops = new THREE.Points(dropGeo, dropMat);
    drops.frustumCulled = false;
    scene.add(drops);

    var weather = { kind: 'clear', strength: 0, target: 0, snow: false, nextBolt: 0, flash: 0 };
    function pickWeather() {
      /* the same weather for everyone: seeded by the hour in Texas */
      var d = new Date();
      var key = Math.floor((d.getTime() + 0) / 3600000);
      var r = ((key * 9301 + 49297) % 233280) / 233280;
      weather.snow = month() === 11;
      if (r < 0.62) { weather.kind = 'clear'; weather.target = 0; }
      else if (r < 0.88) { weather.kind = weather.snow ? 'snow' : 'rain'; weather.target = 1; }
      else { weather.kind = 'storm'; weather.target = 1; }
      if (forced) { weather.kind = forced; weather.target = forced === 'clear' ? 0 : 1; }
    }
    var forced = null;
    pickWeather();
    setInterval(pickWeather, 60000);

    /* ---------- colours by sun height ---------- */
    function lerp(a, b, t) { return a + (b - a) * t; }
    var cDay = new THREE.Color(0x7fb2e5), cDusk = new THREE.Color(0xf0905a), cNight = new THREE.Color(0x0b1020), cOver = new THREE.Color(0x8c96a4);
    var tmp = new THREE.Color();

    var flashLeft = 0;
    function update(dt, playerPos) {
      var hour = texasHour();
      var ang = (hour - 6) / 24 * Math.PI * 2;        /* sunrise at 6, noon at 12, sunset at 18 */
      var sx = Math.cos(ang), sy = Math.sin(ang);
      var elev = sy;                                   /* -1..1 */
      var daylight = Math.max(0, Math.min(1, (elev + 0.12) / 0.35));   /* 0 at night, 1 by mid-morning */
      var dusk = Math.max(0, 1 - Math.abs(elev) / 0.18) * (daylight > 0 ? 1 : 0.4);

      if (elev > 0.02) { sun.position.set(sx, elev, 0.3); sun.color.setRGB(1, lerp(0.75, 0.95, daylight), lerp(0.55, 0.85, daylight)); }
      else { sun.position.set(-sx, Math.max(0.15, -elev), -0.3); sun.color.setRGB(0.7, 0.8, 1); }   /* moonlight */
      sun.intensity = 0.3 + 1.2 * daylight * (1 - 0.55 * weather.strength);
      ambient.intensity = 0.3 + 0.65 * daylight * (1 - 0.3 * weather.strength);
      ambient.color.setRGB(lerp(0.55, 0.74, daylight), lerp(0.62, 0.83, daylight), lerp(0.85, 0.93, daylight));
      hemi.intensity = 0.1 + 0.3 * daylight;

      tmp.copy(cNight).lerp(cDay, daylight).lerp(cDusk, dusk * 0.6).lerp(cOver, weather.strength * 0.7 * Math.max(0.2, daylight));
      if (flashLeft > 0) { tmp.lerp(new THREE.Color(0xffffff), 0.7); flashLeft -= dt; }
      scene.background.copy(tmp);
      scene.fog.color.copy(tmp);
      scene.fog.near = weather.kind === 'clear' ? 70 : lerp(70, 25, weather.strength);
      scene.fog.far = weather.kind === 'clear' ? 190 : lerp(190, 90, weather.strength);

      /* sun and moon ride across the sky around the player */
      var px = playerPos.x, pz = playerPos.z;
      sunDisc.position.set(px + sx * 400, 10 + sy * 400, pz + 120);
      sunDisc.lookAt(px, 10, pz);
      sunDisc.visible = sy > -0.08 && weather.strength < 0.8;
      moonDisc.position.set(px - sx * 400, 10 - sy * 400, pz - 120);
      moonDisc.lookAt(px, 10, pz);
      moonDisc.visible = sy < 0.08 && weather.strength < 0.8;
      stars.position.set(px, 0, pz);
      starMat.opacity = Math.max(0, 1 - daylight * 2) * (1 - weather.strength);
      stars.rotation.y = hour / 24 * Math.PI * 2;

      /* lights come on when the sun goes down */
      var night = 1 - daylight;
      W.materials.window.opacity = Math.min(0.92, night * 1.2);
      beacon.material.opacity = (Math.floor(performance.now() / 700) % 2 === 0) ? 0.3 + 0.7 * night : 0.08;

      /* weather */
      weather.strength += (weather.target - weather.strength) * Math.min(1, dt * 1.2);
      dropMat.opacity = weather.strength * (weather.snow ? 0.95 : 0.75);
      dropMat.color.setHex(weather.snow ? 0xffffff : 0xcfe0f4);
      dropMat.size = weather.snow ? 4 : 3;
      if (weather.strength > 0.02) {
        var arr = dropGeo.attributes.position.array, fall = weather.snow ? 2.5 : 24;
        for (i = 0; i < DROPS; i++) {
          arr[i * 3 + 1] -= fall * dt * (0.7 + (i % 7) / 10);
          if (weather.snow) arr[i * 3] += Math.sin(performance.now() / 900 + i) * dt * 0.6;
          if (arr[i * 3 + 1] < 0) { arr[i * 3 + 1] = 30; arr[i * 3] = (Math.random() - 0.5) * 60; arr[i * 3 + 2] = (Math.random() - 0.5) * 60; }
        }
        dropGeo.attributes.position.needsUpdate = true;
        drops.position.set(px, playerPos.y - 4, pz);
        drops.visible = true;
      } else drops.visible = false;

      /* lightning */
      if (weather.kind === 'storm' && weather.strength > 0.5) {
        weather.nextBolt -= dt;
        if (weather.nextBolt <= 0) {
          weather.nextBolt = 4 + Math.random() * 9;
          flashLeft = 0.12;
          if (window.JoeAudio) window.JoeAudio.thunder(0.6 + Math.random() * 1.6);
        }
      }
      return { hour: hour, daylight: daylight, weather: weather.kind, strength: weather.strength };
    }

    return {
      update: update,
      skip: function (h) { offsetHours = (offsetHours + h) % 24; },
      force: function (kind) { forced = kind; pickWeather(); },
      hour: texasHour
    };
  };
})();
