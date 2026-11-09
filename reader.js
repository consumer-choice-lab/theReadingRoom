/* Phase 2 sample reader.
   URL parameters:
     pid      participant ID
     books    comma-separated book IDs from Phase 1 (bs_items), e.g. b03,b07
     ret      return URL (redirect mode only)
     minsecs  optional: seconds a participant must spend in total before "finished" unlocks
   Output (all strings): rd_pid, rd_books, rd_secs ("b03:41.2,b07:12.0"), rd_seq, rd_total
*/
window.startApp = function () {
  "use strict";
  var CFG = window.STORE_CONFIG, BY_ID = {};
  window.CATALOGUE.forEach(function (b) { BY_ID[b.id] = b; });

  var qs = new URLSearchParams(location.search);
  var PID = (qs.get("pid") || "TEST").slice(0, 64);
  var IDS = (qs.get("books") || "").split(",").map(function (s) { return s.trim(); }).filter(function (id) { return BY_ID[id]; });
  var MIN = parseFloat(qs.get("minsecs")) || 0;
  var IN_FRAME = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();
  var RET = (function (raw) {
    if (!raw) return null;
    try {
      var u = new URL(raw);
      return u.protocol === "https:" && CFG.allowedReturnHosts.some(function (h) { return u.hostname === h || u.hostname.slice(-(h.length + 1)) === "." + h; }) ? u : null;
    } catch (e) { return null; }
  })(qs.get("ret"));

  document.getElementById("brand").textContent = CFG.storeName;
  var tabs = document.getElementById("tabs"), pane = document.getElementById("pane"), note = document.getElementById("note");
  var secs = {}, seq = [], current = null, since = 0, done = false;
  IDS.forEach(function (id) { secs[id] = 0; });

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function stop() { if (current && since) { secs[current] += (Date.now() - since) / 1000; } since = 0; }
  function start() { if (current && !document.hidden && !done) since = Date.now(); }
  document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });

  if (!IDS.length) {
    pane.innerHTML = '<p class="empty">No books were found for this participant. Please contact the research team.</p>';
    return;
  }

  tabs.innerHTML = IDS.map(function (id) {
    var b = BY_ID[id];
    return '<button class="tab" role="tab" type="button" data-id="' + id + '" aria-selected="false">' + esc(b.title) + "<small>" + esc(b.author) + "</small></button>";
  }).join("");
  tabs.querySelectorAll(".tab").forEach(function (t) { t.onclick = function () { show(t.getAttribute("data-id")); }; });

  function show(id) {
    stop(); current = id; seq.push(id); start();
    tabs.querySelectorAll(".tab").forEach(function (t) { t.setAttribute("aria-selected", t.getAttribute("data-id") === id); });
    var b = BY_ID[id];
    if (b.sample === "google") return showGoogle(b);
    pane.innerHTML = '<article class="sample">Loading…</article>';
    fetch("samples/" + id + ".html").then(function (r) { if (!r.ok) throw 0; return r.text(); })
      .then(function (html) { if (current === id) pane.innerHTML = '<article class="sample">' + html + "</article>"; })
      .catch(function () { if (current === id) pane.innerHTML = '<article class="sample"><p>The sample for this book could not be loaded.</p></article>'; });
  }

  // Google Books Embedded Viewer: shows the publisher-authorised preview for an ISBN, where one exists.
  var gReady = null;
  function loadGoogle() {
    if (gReady) return gReady;
    gReady = new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = "https://www.google.com/books/jsapi.js";
      s.onload = function () { window.google.books.load(); window.google.books.setOnLoadCallback(res); };
      s.onerror = rej; document.head.appendChild(s);
    });
    return gReady;
  }
  function showGoogle(b) {
    pane.innerHTML = '<div id="gviewer"></div>';
    loadGoogle().then(function () {
      if (current !== b.id) return;
      var v = new window.google.books.DefaultViewer(document.getElementById("gviewer"));
      v.load(b.gbid || ("ISBN:" + b.isbn), function () {
        pane.innerHTML = '<article class="sample"><p>A preview of this book is not available.</p></article>';
      });
    }).catch(function () { pane.innerHTML = '<article class="sample"><p>The preview could not be loaded.</p></article>'; });
  }

  document.getElementById("doneBtn").onclick = function () {
    stop();
    var tot = IDS.reduce(function (s, id) { return s + secs[id]; }, 0);
    var unopened = IDS.filter(function (id) { return seq.indexOf(id) < 0; });
    if (tot < MIN || unopened.length) {
      note.textContent = unopened.length ? "Please open every book before continuing." : "Please spend a little longer with your books before continuing.";
      start(); return;
    }
    done = true; note.textContent = "";
    var p = {
      rd_pid: PID, rd_books: IDS.join(","),
      rd_secs: IDS.map(function (id) { return id + ":" + secs[id].toFixed(1); }).join(","),
      rd_seq: seq.join(","), rd_total: tot.toFixed(1)
    };
    document.getElementById("doneBtn").disabled = true;
    if (IN_FRAME) {
      window.parent.postMessage({ type: "readingroom-reader-complete", payload: p }, CFG.parentOrigin);
      pane.innerHTML = '<div class="done"><h1>Thank you</h1><p>Press the arrow button below to continue the survey.</p></div>';
    } else if (RET) {
      Object.keys(p).forEach(function (k) { RET.searchParams.set(k, p[k]); });
      location.replace(RET.toString());
    } else {
      pane.innerHTML = '<div class="done"><h1>Test mode</h1><pre class="debug">' + esc(JSON.stringify(p, null, 2)) + "</pre></div>";
    }
    tabs.innerHTML = "";
  };

  show(IDS[0]);
};
