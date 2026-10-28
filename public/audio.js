/* joe.ag — sound. Off until someone turns it on; the page never needs it.
   The ambient bed, the narration and the thump are files. Footsteps, splashes,
   thunder and the toll are made on the spot with the Web Audio API. */

(function () {
  'use strict';

  var FILES = {
    ambient:   { src: 'audio/ambient.mp3',   volume: 0.5, loop: true },
    thump:     { src: 'audio/thump.mp3',     volume: 0.7 },
    chime:     { src: 'audio/word.mp3',      volume: 0.45 },
    door:      { src: 'audio/scene.mp3',     volume: 0.35 },
    narration: { src: 'audio/narration.mp3', volume: 0.9 }
  };

  var enabled = false, elements = {}, ctx = null, master = null;

  function load() {
    if (Object.keys(elements).length) return;
    Object.keys(FILES).forEach(function (name) {
      var el = new Audio(FILES[name].src);
      el.preload = 'auto'; el.volume = FILES[name].volume; el.loop = !!FILES[name].loop;
      elements[name] = el;
    });
  }
  function audioContext() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    return ctx;
  }

  function play(name) {
    if (!enabled || !elements[name]) return;
    var el = elements[name];
    if (!el.loop) { try { el.currentTime = 0; } catch (e) {} }
    var p = el.play(); if (p && p.catch) p.catch(function () {});
  }

  /* ---------- synthesized one-shots ---------- */
  function noiseBuffer(seconds) {
    var c = audioContext(), n = Math.floor(c.sampleRate * seconds), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0), i;
    for (i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  var noise = null;
  function burst(opts) {
    if (!enabled) return;
    var c = audioContext(); if (!c) return;
    if (!noise) noise = noiseBuffer(1);
    var src = c.createBufferSource(); src.buffer = noise;
    var filt = c.createBiquadFilter(); filt.type = opts.type || 'bandpass'; filt.frequency.value = opts.freq; filt.Q.value = opts.q || 1;
    var g = c.createGain();
    var t = c.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain, t + (opts.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.length);
    src.connect(filt); filt.connect(g); g.connect(master);
    src.start(t); src.stop(t + opts.length + 0.05);
  }
  function tone(freq, length, gain, type) {
    if (!enabled) return;
    var c = audioContext(); if (!c) return;
    var o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = type || 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + length);
  }

  var surfaces = {
    grass:  { freq: 900,  q: 0.7, gain: 0.12, length: 0.09 },
    dirt:   { freq: 500,  q: 0.8, gain: 0.14, length: 0.1 },
    road:   { freq: 1800, q: 1.2, gain: 0.08, length: 0.06 },
    wood:   { freq: 320,  q: 2,   gain: 0.2,  length: 0.12 },
    stone:  { freq: 2400, q: 1.5, gain: 0.09, length: 0.07 },
    metal:  { freq: 3200, q: 4,   gain: 0.1,  length: 0.1 },
    sand:   { freq: 700,  q: 0.5, gain: 0.1,  length: 0.11 },
    water:  { freq: 600,  q: 0.4, gain: 0.18, length: 0.18 }
  };
  function step(surface) { burst(surfaces[surface] || surfaces.grass); }
  function splash() { burst({ freq: 500, q: 0.3, gain: 0.35, length: 0.35, attack: 0.02 }); }
  function thunder(delay) {
    if (!enabled) return;
    setTimeout(function () { burst({ type: 'lowpass', freq: 160, q: 0.5, gain: 0.6, length: 2.2, attack: 0.08 }); }, delay * 1000);
  }
  function toll() { tone(1200, 0.08, 0.12); setTimeout(function () { tone(900, 0.14, 0.12); }, 90); }
  function place() { burst({ freq: 400, q: 1.5, gain: 0.18, length: 0.08 }); }
  function breakBlock() { burst({ freq: 250, q: 0.8, gain: 0.25, length: 0.14 }); }
  function moo() { tone(180, 0.35, 0.15, 'sawtooth'); setTimeout(function () { tone(150, 0.3, 0.12, 'sawtooth'); }, 150); }
  function bark() { burst({ freq: 700, q: 2, gain: 0.25, length: 0.08 }); setTimeout(function () { burst({ freq: 900, q: 2, gain: 0.2, length: 0.07 }); }, 120); }
  function shutter() { burst({ freq: 3000, q: 3, gain: 0.15, length: 0.04 }); setTimeout(function () { burst({ freq: 2000, q: 3, gain: 0.12, length: 0.05 }); }, 60); }

  function fadeIn(el, target, ms) {
    el.volume = 0;
    var start = performance.now();
    (function s() {
      var k = Math.max(0, Math.min(1, (performance.now() - start) / ms));
      el.volume = Math.max(0, Math.min(1, target * k));
      if (k < 1 && enabled) requestAnimationFrame(s);
    })();
  }

  var narrated = false;
  function enable() {
    load(); audioContext();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    enabled = true;
    var amb = elements.ambient;
    var p = amb.play(); if (p && p.catch) p.catch(function () {});
    fadeIn(amb, FILES.ambient.volume, 2500);
  }
  function disable() { enabled = false; Object.keys(elements).forEach(function (k) { elements[k].pause(); }); }
  function toggle() { if (enabled) disable(); else enable(); return enabled; }
  function narrate() {
    if (narrated) return;
    narrated = true;
    play('narration');
  }

  window.JoeAudio = {
    toggle: toggle, isOn: function () { return enabled; }, play: play,
    step: step, splash: splash, thunder: thunder, toll: toll, place: place, breakBlock: breakBlock,
    moo: moo, bark: bark, shutter: shutter, narrate: narrate
  };
})();
