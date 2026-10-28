/* joe.ag — talking to the server. If there is no server (a static copy, a preview),
   everything here quietly does nothing and the town is yours alone. */

(function () {
  'use strict';

  window.Net = function (handlers) {
    var ws = null, open = false, myId = 0, retry = 2000, tries = 0;
    var canConnect = /^https?:$/.test(location.protocol);

    function connect() {
      if (!canConnect || tries > 8) return;
      tries++;
      var url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
      try { ws = new WebSocket(url); } catch (e) { return; }
      ws.onopen = function () { open = true; retry = 2000; };
      ws.onclose = function () { open = false; if (handlers.offline) handlers.offline(); setTimeout(connect, retry); retry = Math.min(20000, retry * 1.6); };
      ws.onerror = function () { /* onclose follows */ };
      ws.onmessage = function (e) {
        var m;
        try { m = JSON.parse(e.data); } catch (err) { return; }
        if (!m || !m.t) return;
        if (m.t === 'hello') { myId = m.id; if (handlers.hello) handlers.hello(m); return; }
        var h = handlers[m.t];
        if (h) h(m);
      };
    }

    function send(obj) {
      if (!open) return;
      try { ws.send(JSON.stringify(obj)); } catch (e) { /* dropped */ }
    }

    /* the edits other people made before we arrived */
    function loadEdits(cb) {
      if (!canConnect) return cb({});
      fetch('/api/edits', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(cb).catch(function () { cb({}); });
    }
    function loadBook(cb) {
      if (!canConnect) return cb([]);
      fetch('/api/guestbook', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(cb).catch(function () { cb([]); });
    }
    function postNote(name, text, cb) {
      if (!canConnect) return cb(null, 'offline');
      fetch('/api/guestbook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, text: text }) })
        .then(function (r) { if (!r.ok) return r.text().then(function (t) { cb(null, t); }); return r.json().then(function (n) { cb(n); }); })
        .catch(function () { cb(null, 'offline'); });
    }
    function loadStats(cb) {
      if (!canConnect) return cb(null);
      fetch('/api/stats', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(cb).catch(function () { cb(null); });
    }
    function loadBrief(cb) {
      if (!canConnect) return cb(null);
      fetch('/api/brief').then(function (r) { return r.json(); }).then(cb).catch(function () { cb(null); });
    }

    connect();
    return { send: send, loadEdits: loadEdits, loadBrief: loadBrief, loadBook: loadBook, postNote: postNote, loadStats: loadStats, isOpen: function () { return open; }, id: function () { return myId; } };
  };
})();
