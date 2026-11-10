/* Phase 2: order review with payment condition, book samples, and keep/return decisions.
   URL parameters:
     pid      participant ID
     books    comma-separated book IDs from Phase 1 (bs_items), e.g. b03,b07
     cond     payment condition from the Qualtrics Randomizer: 1 = BNPL (Pay in 4), 0 = delayed lump sum (Pay Later)
     pdate    optional purchase date YYYY-MM-DD (default: purchaseDate in config.js)
     minsecs  optional: minimum total seconds with the samples before the order can be confirmed
     ret      return URL (redirect mode only)
   Output (all strings, sent to Qualtrics on confirm):
     rd_pid, rd_cond (1 / 0 / none), rd_cond_label (BNPL / LumpSum / none), rd_books, rd_keeps, rd_returns, rd_n_books, rd_n_returned, rd_return_rate,
     rd_order_p, rd_kept_p, rd_returned_p, rd_plan ("day:pence[:paid]|..." counted from the purchase date),
     rd_paid_p (already paid), rd_refund_p (refund owed), rd_pdate,
     rd_secs ("b03:41.2,b07:12.0"), rd_seq, rd_total, rd_declog ("secs,id,K|R;..."), rd_confirm_secs
*/
window.startApp = function () {
  "use strict";
  var CFG = window.STORE_CONFIG, BY_ID = {};
  window.CATALOGUE.forEach(function (b) { BY_ID[b.id] = b; });

  var qs = new URLSearchParams(location.search);
  var PID = (qs.get("pid") || "TEST").slice(0, 64);
  var IDS = (qs.get("books") || "").split(",").map(function (s) { return s.trim(); })
    .filter(function (id, i, a) { return BY_ID[id] && a.indexOf(id) === i; });
  var MIN = parseFloat(qs.get("minsecs")) || 0;
  var COND = (function (c) {
    c = (c || "").trim();
    if (c === "1") return "BNPL";      // Qualtrics coding: cond = 1
    if (c === "0") return "LumpSum";   // Qualtrics coding: cond = 0
    c = c.toLowerCase().replace(/[^a-z]/g, "");
    if (c === "bnpl" || c === "payin4") return "BNPL";
    if (c === "lumpsum" || c === "ls" || c === "delayed" || c === "delayedlumpsum") return "LumpSum";
    return "";
  })(qs.get("cond"));
  var PLAN = COND ? CFG.paymentPlans[COND] : null;
  var IN_FRAME = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();
  var RET = (function (raw) {
    if (!raw) return null;
    try {
      var u = new URL(raw);
      return u.protocol === "https:" && CFG.allowedReturnHosts.some(function (h) { return u.hostname === h || u.hostname.slice(-(h.length + 1)) === "." + h; }) ? u : null;
    } catch (e) { return null; }
  })(qs.get("ret"));

  var $ = function (id) { return document.getElementById(id); };
  var tabs = $("tabs"), pane = $("pane"), note = $("note"), planEl = $("plan"), decideEl = $("decide");
  $("brand").textContent = CFG.storeName;
  $("intro").innerHTML = CFG.readerIntro;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function gbp(p) { return "£" + (p / 100).toFixed(2); }

  /* ---------- state (survives a reload within the session) ---------- */
  var KEY = "readingroom_p2_" + PID + "_" + IDS.join(".");
  var state = (function () { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { return null; } })() ||
    { start: Date.now(), secs: {}, seq: [], dec: {}, declog: [], done: false, payload: null };
  IDS.forEach(function (id) { if (!state.secs[id]) state.secs[id] = 0; });
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function t() { return ((Date.now() - state.start) / 1000).toFixed(1); }

  var current = null, since = 0;
  function stop() { if (current && since) { state.secs[current] += (Date.now() - since) / 1000; save(); } since = 0; }
  function start() { if (current && !document.hidden && !state.done) since = Date.now(); }
  document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });

  if (!IDS.length) {
    planEl.remove(); decideEl.remove();
    pane.innerHTML = '<p class="empty">No books were found for this participant. Please contact the research team.</p>';
    $("doneBtn").disabled = true;
    return;
  }

  /* ---------- money ---------- */
  var PDATE = (function (v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || "");
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
  })(qs.get("pdate") || CFG.purchaseDate);
  function dateOf(day) {
    var d = new Date((PDATE === null ? Date.now() : PDATE) + day * 864e5);
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  }
  function orderTotal() { return IDS.reduce(function (s, id) { return s + BY_ID[id].price; }, 0); }
  function keptTotal() { return IDS.reduce(function (s, id) { return s + (state.dec[id] === "R" ? 0 : BY_ID[id].price); }, 0); }
  // Equal split; leftover pennies go on the earliest payments.
  function split(total, n) {
    var base = Math.floor(total / n), extra = total - base * n, out = [];
    for (var i = 0; i < n; i++) out.push(base + (i < extra ? 1 : 0));
    return out;
  }
  // Payments already made are fixed (based on the original order). Returns come off the
  // payments still to be made; if the returns exceed what is still owed, the difference is refunded.
  function plan(kept) {
    if (!PLAN) return { pays: [], paid: 0, refund: 0, future: 0 };
    var n = PLAN.days.length, k = Math.min(PLAN.paid || 0, n);
    var orig = split(orderTotal(), n), paid = 0, pays = [];
    for (var i = 0; i < k; i++) { paid += orig[i]; pays.push({ day: PLAN.days[i], pence: orig[i], paid: true }); }
    var owed = kept - paid, refund = owed < 0 ? -owed : 0, rest = split(Math.max(owed, 0), n - k || 1);
    for (var j = k; j < n; j++) pays.push({ day: PLAN.days[j], pence: rest[j - k], paid: false });
    return { pays: pays, paid: paid, refund: refund, future: Math.max(owed, 0), left: n - k };
  }

  /* ---------- payment plan card ---------- */
  // Label shown under each payment (from config.js), e.g. "Paid", "Due in 2 weeks".
  function label(i, s) {
    var l = PLAN.labels && PLAN.labels[i];
    if (l) return l;
    if (s.paid) return "Paid";
    return s.day % 7 === 0 ? "Due in " + (s.day / 7) + " week" + (s.day === 7 ? "" : "s") : "Due in " + s.day + " days";
  }
  function renderPlan() {
    var order = orderTotal(), kept = keptTotal();
    var head = '<div class="plan-order"><span>Your order of ' + IDS.length + " book" + (IDS.length === 1 ? "" : "s") +
      "</span><strong>" + gbp(order) + "</strong></div>";
    if (!PLAN) {
      planEl.innerHTML = head + '<p class="note warn">Test mode: no payment condition was supplied (add &amp;cond=1 for Pay in 4 or &amp;cond=0 for Pay Later).</p>';
      return;
    }
    var P = plan(kept), orig = split(order, PLAN.days.length), headline, detail;
    var steps = P.pays.map(function (s, i) {
      return '<li class="pay' + (s.paid ? " now" : "") + '"><span class="dot" aria-hidden="true">' + (s.paid ? "✓" : "") + "</span>" +
        '<span class="amt">' + gbp(s.pence) + '</span><span class="rel">' + esc(label(i, s)) + "</span></li>";
    }).join("");
    if (PLAN.days[0] !== 0) {
      steps = '<li class="pay zero"><span class="dot" aria-hidden="true"></span><span class="amt">' + gbp(0) +
        '</span><span class="rel">Order placed</span></li>' + steps;
    }
    if (COND === "BNPL") {
      headline = "You chose " + PLAN.name + ": " + PLAN.days.length + " interest-free payments of " + gbp(orig[0]);
      detail = "You have paid the first payment of " + gbp(P.paid) + ".";
    } else {
      headline = "You agreed to pay " + gbp(order) + " in 4 weeks";
      detail = "You agreed to pay the full amount in 4 weeks. Nothing has been paid yet.";
    }
    planEl.innerHTML = head +
      '<div class="plan-name">' + esc(PLAN.name) + "</div>" +
      '<div class="plan-head">' + esc(headline) + "</div>" +
      '<ol class="timeline' + (P.pays.length === 1 ? " single" : "") + '">' + steps + "</ol>" +
      '<p class="plan-detail">' + esc(detail) + "</p>";
  }

  /* ---------- tabs and keep/return ---------- */
  function badge(id) {
    var d = state.dec[id];
    return d === "K" ? '<span class="badge keep">Keep</span>' : d === "R" ? '<span class="badge ret">Return</span>' : '<span class="badge todo">Decide</span>';
  }
  function renderTabs() {
    tabs.innerHTML = IDS.map(function (id) {
      var b = BY_ID[id];
      return '<button class="tab" role="tab" type="button" data-id="' + id + '" aria-selected="' + (id === current) + '">' +
        esc(b.title) + "<small>" + esc(b.author) + " · " + gbp(b.price) + "</small>" +
        (COND === "BNPL" ? '<small class="inst">' + PLAN.days.length + " payments of " + gbp(split(b.price, PLAN.days.length)[0]) + "</small>" : "") +
        badge(id) + "</button>";
    }).join("");
    tabs.querySelectorAll(".tab").forEach(function (el) { el.onclick = function () { show(el.getAttribute("data-id")); }; });
  }
  function renderDecide() {
    var b = BY_ID[current], d = state.dec[current];
    decideEl.innerHTML = '<span class="q">Keep or return <strong>' + esc(b.title) + "</strong> (" + gbp(b.price) + ")?</span>" +
      '<button type="button" class="choice keep" data-v="K" aria-pressed="' + (d === "K") + '">Keep</button>' +
      '<button type="button" class="choice ret" data-v="R" aria-pressed="' + (d === "R") + '">Return</button>';
    decideEl.querySelectorAll(".choice").forEach(function (el) {
      el.onclick = function () {
        var v = el.getAttribute("data-v");
        if (state.dec[current] === v) return;
        state.dec[current] = v; state.declog.push(t() + "," + current + "," + v); save();
        note.textContent = "";
        renderDecide(); renderTabs(); renderPlan();
      };
    });
  }

  function show(id) {
    stop(); current = id; state.seq.push(id); save(); start();
    renderTabs(); renderDecide();
    var b = BY_ID[id];
    if (b.sample === "google") return showGoogle(b);
    pane.innerHTML = '<article class="sample">Loading…</article>';
    fetch("samples/" + id + ".html").then(function (r) { if (!r.ok) throw 0; return r.text(); })
      .then(function (html) { if (current === id) pane.innerHTML = '<article class="sample">' + html + "</article>"; })
      .catch(function () { if (current === id) pane.innerHTML = '<article class="sample"><p>The sample for this book could not be loaded.</p></article>'; });
  }

  // Google Books Embedded Viewer: shows the publisher-authorised preview, by Google ID (or ISBN).
  // Google's own "ready" callback does not fire when the viewer is added after page load,
  // so wait until the viewer class actually exists (up to 20 seconds).
  var gReady = null;
  function loadGoogle() {
    if (gReady) return gReady;
    gReady = new Promise(function (res, rej) {
      var ready = function () { return window.google && window.google.books && window.google.books.DefaultViewer; };
      var wait = function () {
        var t0 = Date.now();
        (function poll() {
          if (ready()) return res();
          if (Date.now() - t0 > 20000) return rej(new Error("timeout"));
          setTimeout(poll, 100);
        })();
      };
      if (ready()) return res();
      var s = document.createElement("script");
      s.src = "https://www.google.com/books/jsapi.js";
      s.onload = function () { try { window.google.books.load(); } catch (e) {} wait(); };
      s.onerror = rej; document.head.appendChild(s);
    });
    return gReady;
  }
  function showGoogle(b) {
    pane.innerHTML = '<div id="gviewer"><p class="gload">Loading the preview…</p></div>';
    loadGoogle().then(function () {
      if (current !== b.id) return;
      var v = new window.google.books.DefaultViewer(document.getElementById("gviewer"));
      window.onresize = function () { try { v.resize(); } catch (e) {} };
      v.load(b.gbid || ("ISBN:" + b.isbn), function () {
        if (current === b.id) pane.innerHTML = '<article class="sample"><p>A preview of this book is not available.</p></article>';
      }, function () { var l = pane.querySelector(".gload"); if (l) l.remove(); });
    }).catch(function () { if (current === b.id) pane.innerHTML = '<article class="sample"><p>The preview could not be loaded.</p></article>'; });
  }

  /* ---------- confirm ---------- */
  function buildPayload() {
    var keeps = IDS.filter(function (id) { return state.dec[id] === "K"; });
    var rets = IDS.filter(function (id) { return state.dec[id] === "R"; });
    var order = orderTotal(), kept = keptTotal();
    var tot = IDS.reduce(function (s, id) { return s + state.secs[id]; }, 0);
    var log = state.declog.join(";"); if (log.length > 1500) log = log.slice(0, 1500) + ";TRUNC";
    return {
      rd_pid: PID, rd_cond: COND === "BNPL" ? "1" : COND === "LumpSum" ? "0" : "none",
      rd_cond_label: COND || "none", rd_books: IDS.join(","),
      rd_keeps: keeps.join(","), rd_returns: rets.join(","),
      rd_n_books: String(IDS.length), rd_n_returned: String(rets.length),
      rd_return_rate: (rets.length / IDS.length).toFixed(4),
      rd_order_p: String(order), rd_kept_p: String(kept), rd_returned_p: String(order - kept),
      rd_plan: (function (P) { return P.pays.map(function (s) { return s.day + ":" + s.pence + (s.paid ? ":paid" : ""); }).join("|"); })(plan(kept)),
      rd_paid_p: String(plan(kept).paid), rd_refund_p: String(plan(kept).refund),
      rd_pdate: PDATE === null ? "" : new Date(PDATE).toISOString().slice(0, 10),
      rd_secs: IDS.map(function (id) { return id + ":" + state.secs[id].toFixed(1); }).join(","),
      rd_seq: state.seq.join(","), rd_total: tot.toFixed(1),
      rd_declog: log, rd_confirm_secs: t()
    };
  }

  $("doneBtn").onclick = function () {
    if (state.done) return;
    stop();
    var tot = IDS.reduce(function (s, id) { return s + state.secs[id]; }, 0);
    var unopened = IDS.filter(function (id) { return state.seq.indexOf(id) < 0; });
    var undecided = IDS.filter(function (id) { return !state.dec[id]; });
    if (unopened.length) { note.textContent = "Please open every book before confirming."; start(); return; }
    if (undecided.length) { note.textContent = "Please choose Keep or Return for every book (" + undecided.length + " still to decide)."; start(); show(undecided[0]); return; }
    if (tot < MIN) { note.textContent = "Please spend a little longer looking at your books before confirming."; start(); return; }
    confirmModal();
  };

  function confirmModal() {
    var keeps = IDS.filter(function (id) { return state.dec[id] === "K"; });
    var rets = IDS.filter(function (id) { return state.dec[id] === "R"; });
    var kept = keptTotal(), P = plan(kept);
    var list = function (ids) { return ids.length ? "<ul>" + ids.map(function (id) { return "<li>" + esc(BY_ID[id].title) + " (" + gbp(BY_ID[id].price) + ")</li>"; }).join("") + "</ul>" : "<p>None</p>"; };
    var pay = !PLAN ? "<p>(No payment condition in test mode.)</p>" :
      "<p><strong>" + esc(PLAN.name) + ":</strong> " + P.pays.map(function (s, i) { return gbp(s.pence) + " " + label(i, s).toLowerCase(); }).join(", ") + "." +
      (P.refund ? " You will be refunded " + gbp(P.refund) + "." : "") + "</p>";
    var bg = document.createElement("div"); bg.className = "modal-bg";
    bg.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt"><h2 id="mt">Confirm your order</h2>' +
      "<p><strong>Keeping</strong></p>" + list(keeps) + "<p><strong>Returning</strong></p>" + list(rets) + pay +
      "<p>Once confirmed, your choices cannot be changed.</p>" +
      '<div class="actions"><button class="secondary" id="cancel" type="button">Go back</button><button class="primary" id="ok" type="button">Confirm</button></div></div>';
    document.body.appendChild(bg); $("ok").focus();
    $("cancel").onclick = function () { state.declog.push(t() + ",modal,cancel"); save(); bg.remove(); start(); };
    $("ok").onclick = function () { bg.remove(); finish(); };
  }

  function finish() {
    state.payload = buildPayload(); state.done = true; save();
    send();
  }
  function send() {
    var p = state.payload;
    $("doneBtn").disabled = true;
    tabs.innerHTML = ""; decideEl.innerHTML = ""; planEl.innerHTML = "";
    if (IN_FRAME) {
      window.parent.postMessage({ type: "readingroom-reader-complete", payload: p }, CFG.parentOrigin);
      pane.innerHTML = '<div class="done"><h1>Order confirmed</h1><p>Press the arrow button below to continue the survey.</p></div>';
    } else if (RET) {
      Object.keys(p).forEach(function (k) { RET.searchParams.set(k, p[k]); });
      location.replace(RET.toString());
    } else {
      pane.innerHTML = '<div class="done"><h1>Test mode</h1><pre class="debug">' + esc(JSON.stringify(p, null, 2)) + "</pre></div>";
    }
  }

  if (state.done) { $("intro").remove(); send(); return; }
  renderPlan();
  show(IDS[0]);
};
