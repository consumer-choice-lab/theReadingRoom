/* The Reading Room — Phase 1 store.
   URL parameters:
     pid     participant ID (e.g. Prolific PID)           required in the live study
     rid     Qualtrics ResponseID                          optional, echoed back
     ret     return URL (redirect mode only)               optional
     budget  endowment in pence                            optional, default from config.js
   Output (sent to Qualtrics, all strings):
     bs_pid, bs_rid, bs_items, bs_n, bs_total_p, bs_left_p, bs_budget_p,
     bs_order, bs_views, bs_secs, bs_log
*/
window.startApp = function () {
  "use strict";
  var CFG = window.STORE_CONFIG, BOOKS = window.CATALOGUE;
  var BY_ID = {}; BOOKS.forEach(function (b) { BY_ID[b.id] = b; });

  var qs = new URLSearchParams(location.search);
  var PID = (qs.get("pid") || "").slice(0, 64) || "TEST";
  var RID = (qs.get("rid") || "").slice(0, 64);
  var RET = safeReturn(qs.get("ret"));
  var BUDGET = parseInt(qs.get("budget"), 10);
  if (!(BUDGET > 0)) BUDGET = CFG.budgetPence;
  var IN_FRAME = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();
  var KEY = "readingroom_" + PID;

  document.title = CFG.storeName;
  document.getElementById("brand").textContent = CFG.storeName;

  /* ---------- state (survives reloads within the session) ---------- */
  var state = load() || { basket: [], events: [], views: {}, start: Date.now(), done: false, payload: null };
  var ORDER = gridOrder();
  var genre = "All";
  var openBook = null, openedAt = 0;

  function load() { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { return null; } }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  function secs() { return ((Date.now() - state.start) / 1000).toFixed(1); }
  function log(code, id) { state.events.push(secs() + "," + code + (id ? "," + id : "")); save(); }

  /* ---------- helpers ---------- */
  function gbp(p) { return "£" + (p / 100).toFixed(2); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function total() { return state.basket.reduce(function (s, id) { return s + BY_ID[id].price; }, 0); }
  function left() { return BUDGET - total(); }
  function inBasket(id) { return state.basket.indexOf(id) > -1; }

  function safeReturn(raw) {
    if (!raw) return null;
    try {
      var u = new URL(raw);
      var ok = u.protocol === "https:" && CFG.allowedReturnHosts.some(function (h) {
        return u.hostname === h || u.hostname.slice(-(h.length + 1)) === "." + h;
      });
      return ok ? u : null;
    } catch (e) { return null; }
  }

  // Deterministic shuffle seeded by participant ID, so order is stable on reload and recoverable.
  // Each participant gets their own shuffled order, seeded by their participant ID (or ResponseID),
  // so it is the same if they reload and can be reconstructed from the data. Without either ID,
  // a random seed is drawn once and kept for the browser session. The order shown is saved in bs_order.
  function orderSeed() {
    if (qs.get("pid")) return "p:" + PID;
    if (RID) return "r:" + RID;
    var k = "readingroom_seed", s = null;
    try { s = sessionStorage.getItem(k); } catch (e) {}
    if (!s) { s = "x:" + Math.random().toString(36).slice(2) + Date.now().toString(36); try { sessionStorage.setItem(k, s); } catch (e) {} }
    return s;
  }

  function gridOrder() {
    var ids = BOOKS.map(function (b) { return b.id; });
    if (CFG.gridOrder !== "random") return ids;
    var seed = orderSeed();
    var h = 2166136261;
    for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    var rnd = function () { h += 0x6D2B79F5; var t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (var j = ids.length - 1; j > 0; j--) { var k = Math.floor(rnd() * (j + 1)); var tmp = ids[j]; ids[j] = ids[k]; ids[k] = tmp; }
    return ids;
  }

  // Uses the cover image if books.csv gives one; falls back to the typographic cover if it fails to load.
  function cover(b, big) {
    var img = b.cover ? '<img src="' + esc(b.cover) + '" alt="" loading="lazy" onerror="this.parentNode.classList.remove(\'has-img\');this.remove()">' : "";
    return '<div class="cover' + (big ? " big" : "") + (img ? " has-img" : "") + '" style="background:' + esc(b.colour) + '" aria-hidden="true">' + img +
      '<span class="ct">' + esc(b.title) + '</span><span class="ca">' + esc(b.author) + "</span></div>";
  }

  /* ---------- product dwell time ---------- */
  function closeProduct() {
    if (!openBook) return;
    var v = state.views[openBook] || [0, 0];
    v[1] = Math.round((v[1] + (Date.now() - openedAt) / 1000) * 10) / 10;
    state.views[openBook] = v; openBook = null; save();
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) closeProduct();
    else if (/^#\/book\//.test(location.hash) && !state.done) { openBook = location.hash.split("/")[2]; openedAt = Date.now(); }
  });

  /* ---------- views ---------- */
  var app = document.getElementById("app");

  function header() {
    document.getElementById("left").textContent = gbp(left());
    document.getElementById("count").textContent = state.basket.length;
  }

  function viewGrid() {
    var genres = ["All"].concat(BOOKS.map(function (b) { return b.genre; }).filter(function (g, i, a) { return a.indexOf(g) === i; }));
    var html = '<div class="intro">' + CFG.instructions.replace("£10.00", gbp(BUDGET)) + "</div>";
    if (genres.length > 2) html += '<div class="filters" role="group" aria-label="Filter by genre">' + genres.map(function (g) {
      return '<button class="chip" type="button" data-genre="' + esc(g) + '" aria-pressed="' + (g === genre) + '">' + esc(g) + "</button>";
    }).join("") + "</div>";
    html += '<div class="grid">' + ORDER.map(function (id) { return BY_ID[id]; })
      .filter(function (b) { return genre === "All" || b.genre === genre; })
      .map(function (b) {
        return '<button class="card" type="button" data-book="' + b.id + '">' + cover(b) +
          '<span class="title">' + esc(b.title) + '</span><span class="author">' + esc(b.author) + "</span>" +
          '<span class="price">' + gbp(b.price) + "</span>" +
          (inBasket(b.id) ? '<span class="in-basket">✓ In basket</span>' : "") + "</button>";
      }).join("") + "</div>";
    app.innerHTML = html;
    app.querySelectorAll("[data-genre]").forEach(function (el) {
      el.onclick = function () { genre = el.getAttribute("data-genre"); log("F", genre.replace(/[,;]/g, "")); viewGrid(); };
    });
    app.querySelectorAll("[data-book]").forEach(function (el) {
      el.onclick = function () { location.hash = "#/book/" + el.getAttribute("data-book"); };
    });
  }

  function viewBook(id, rerender) {
    var b = BY_ID[id]; if (!b) { location.hash = "#/"; return; }
    if (!rerender) {
      var v = state.views[id] || [0, 0]; v[0] += 1; state.views[id] = v;
      openBook = id; openedAt = Date.now(); log("V", id);
    }

    var has = inBasket(id), canAfford = b.price <= left(), full = state.basket.length >= CFG.maxItems;
    var btn, note = "";
    if (has) btn = '<button class="secondary" id="toggle" type="button">Remove from basket</button>';
    else {
      btn = '<button class="primary" id="toggle" type="button"' + (canAfford && !full ? "" : " disabled") + ">Add to basket</button>";
      if (!canAfford) note = "This book costs more than you have left (" + gbp(left()) + ").";
      else if (full) note = "Your basket is full.";
    }
    app.innerHTML = '<button class="back" id="back" type="button">← All books</button>' +
      '<div class="product">' + cover(b, true) + "<div>" +
      "<h1>" + esc(b.title) + '</h1><p class="by">by ' + esc(b.author) + "</p>" +
      '<ul class="meta"><li>' + esc(b.genre) + "</li>" + (b.pages ? "<li>" + b.pages + " pages</li>" : "") + "<li>" + esc(b.format || CFG.format || "Paperback") + "</li></ul>" +
      b.blurb.split(/\n\s*\n/).map(function (para) { return "<p>" + esc(para.trim()).replace(/\n/g, "<br>") + "</p>"; }).join("") +
      '<p class="p-price">' + gbp(b.price) + "</p>" + btn +
      ' <button class="secondary" id="toBasket" type="button">View basket</button>' +
      '<p class="note' + (note ? " warn" : "") + '" id="note">' + note + "</p></div></div>";

    document.getElementById("back").onclick = function () { location.hash = "#/"; };
    document.getElementById("toBasket").onclick = function () { location.hash = "#/basket"; };
    document.getElementById("toggle").onclick = function () {
      if (inBasket(id)) { remove(id); }
      else { add(id); }
      viewBook(id, true); // re-render without counting a new view
      document.getElementById("note").textContent = inBasket(id) ? "Added to your basket." : "Removed from your basket.";
      document.getElementById("note").className = "note";
    };
    header();
  }

  function viewBasket() {
    log("B");
    var lines = state.basket.map(function (id) {
      var b = BY_ID[id];
      return '<div class="line">' + cover(b) + '<div><div class="lt">' + esc(b.title) + '</div><div class="la">' + esc(b.author) + "</div></div>" +
        '<div class="lp">' + gbp(b.price) + '</div><button class="remove" type="button" data-remove="' + id + '">Remove</button></div>';
    }).join("");
    app.innerHTML = '<div class="basket"><button class="back" id="back" type="button">← Keep browsing</button><h1>Your basket</h1>' +
      (lines || '<p class="empty">Your basket is empty.</p>') +
      '<div class="totals"><div><span>Endowment</span><span>' + gbp(BUDGET) + "</span></div>" +
      "<div><span>Books (" + state.basket.length + ")</span><span>−" + gbp(total()) + "</span></div>" +
      '<div class="grand"><span>' + (CFG.requireFullSpend ? "Left to spend" : "You keep") + '</span><span>' + gbp(left()) + "</span></div></div>" +
      '<div class="actions"><button class="secondary" id="more" type="button">Keep browsing</button>' +
      '<button class="primary" id="checkout" type="button">Checkout</button></div>' +
      '<p class="note warn" id="note" style="text-align:right"></p></div>';
    document.getElementById("back").onclick = document.getElementById("more").onclick = function () { location.hash = "#/"; };
    app.querySelectorAll("[data-remove]").forEach(function (el) {
      el.onclick = function () { remove(el.getAttribute("data-remove")); viewBasket(); };
    });
    document.getElementById("checkout").onclick = function () {
      log("X");
      if (state.basket.length < CFG.minItems) {
        document.getElementById("note").textContent = "Please choose at least " + CFG.minItems + " book" + (CFG.minItems > 1 ? "s" : "") + " before checking out.";
        return;
      }
      if (CFG.requireFullSpend && left() > 0) {
        document.getElementById("note").textContent = "Please spend the full " + gbp(BUDGET).replace(".00", "") + " before checking out. You have " + gbp(left()) + " left to spend.";
        return;
      }
      confirmModal();
    };
    header();
  }

  function confirmModal() {
    var bg = document.createElement("div"); bg.className = "modal-bg";
    bg.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt"><h2 id="mt">Confirm your order</h2>' +
      "<p>You are choosing " + state.basket.length + " book" + (state.basket.length === 1 ? "" : "s") + " for " + gbp(total()) + ":</p><ul>" +
      state.basket.map(function (id) { return "<li>" + esc(BY_ID[id].title) + "</li>"; }).join("") + "</ul>" +
      "<p>" + (CFG.requireFullSpend ? "" : "You will keep <strong>" + gbp(left()) + "</strong>. ") + "Once confirmed, your order cannot be changed.</p>" +
      '<div class="actions"><button class="secondary" id="cancel" type="button">Go back</button><button class="primary" id="ok" type="button">Confirm order</button></div></div>';
    document.body.appendChild(bg);
    document.getElementById("ok").focus();
    document.getElementById("cancel").onclick = function () { log("K"); bg.remove(); };
    document.getElementById("ok").onclick = function () { bg.remove(); finish(); };
  }

  function add(id) {
    if (inBasket(id) || BY_ID[id].price > left() || state.basket.length >= CFG.maxItems) return;
    state.basket.push(id); log("A", id); header();
  }
  function remove(id) {
    state.basket = state.basket.filter(function (x) { return x !== id; }); log("R", id); header();
  }

  /* ---------- hand-off to Qualtrics ---------- */
  function buildPayload() {
    var views = Object.keys(state.views).map(function (id) { return id + ":" + state.views[id][0] + ":" + state.views[id][1]; }).join(",");
    var logStr = state.events.join(";");
    if (logStr.length > 1800) logStr = logStr.slice(0, 1800) + ";TRUNC";
    return {
      bs_pid: PID, bs_rid: RID,
      bs_items: state.basket.join(","),
      bs_n: String(state.basket.length),
      bs_total_p: String(total()),
      bs_left_p: String(left()),
      bs_budget_p: String(BUDGET),
      bs_order: ORDER.join(","),
      bs_views: views,
      bs_secs: secs(),
      bs_log: logStr
    };
  }

  function finish() {
    closeProduct(); log("C");
    state.payload = buildPayload(); state.done = true; save();
    send();
  }

  function send() {
    var p = state.payload;
    viewDone();
    if (IN_FRAME) {
      window.parent.postMessage({ type: "readingroom-complete", payload: p }, CFG.parentOrigin);
    } else if (RET) {
      Object.keys(p).forEach(function (k) { RET.searchParams.set(k, p[k]); });
      setTimeout(function () { location.replace(RET.toString()); }, 800);
    }
  }

  function viewDone() {
    var p = state.payload;
    var msg = IN_FRAME ? "Press the arrow button below to continue the survey." :
      RET ? "Taking you back to the survey…" : "Test mode: no survey to return to. This is what would be sent:";
    app.innerHTML = '<div class="done"><h1>Order confirmed</h1><p>' + msg + "</p>" +
      (!IN_FRAME && !RET ? '<pre class="debug">' + esc(JSON.stringify(p, null, 2)) + "</pre>" : "") + "</div>";
    document.getElementById("basketBtn").disabled = true;
    header();
  }

  /* ---------- router ---------- */
  function route() {
    closeProduct();
    if (state.done) { viewDone(); if (IN_FRAME) send(); return; }
    var h = location.hash || "#/";
    var m = h.match(/^#\/book\/(\w+)/);
    if (m) viewBook(m[1]);
    else if (h === "#/basket") viewBasket();
    else { log("G"); viewGrid(); }
    window.scrollTo(0, 0);
    header();
  }
  document.getElementById("brand").onclick = function () { location.hash = "#/"; };
  document.getElementById("basketBtn").onclick = function () { location.hash = "#/basket"; };
  window.addEventListener("hashchange", route);
  route();
};
