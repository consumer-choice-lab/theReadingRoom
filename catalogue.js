/* Loads books.csv, checks it, and starts the store / reader.
   You should not need to edit this file — edit books.csv instead.

   books.csv columns (header row required, order does not matter):
     id       unique code, e.g. b01. NEVER reuse or renumber once data collection starts.
     title, author, genre
     price    in pounds, e.g. 6.99 (a £ sign is fine)
     pages    optional
     format   optional, e.g. Kindle ebook (falls back to config.js)
     colour   optional cover colour, e.g. #23325e (auto-picked if blank)
     isbn     used for the Google preview if google_id is blank
     google_id the Google Books edition id (e.g. ISxGEAAAQBAJ); preferred over isbn
     sample   file (uses samples/<id>.html) or google (Google Books preview)
     blurb    short description
*/
(function () {
  "use strict";
  var PALETTE = ["#7a3b2e", "#2f4a3a", "#1f3b5c", "#4a3f2a", "#23325e", "#c58a3a", "#3d3d3d", "#8c2f2f", "#5b3a6e", "#1d5c63", "#a5652a", "#2c5e4f"];

  // RFC 4180 CSV parser: handles quoted fields, commas and line breaks inside quotes, "" escapes, CRLF, BOM.
  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    var rows = [], row = [], field = "", inQ = false, i, c;
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += c;
      } else if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = ""; rows.push(row); row = [];
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (v) { return v.trim() !== ""; }); });
  }

  // cover: a file name in covers/ (e.g. b05.jpg) or a full https:// address. Blank = typographic cover.
  function coverPath(v, line, errors) {
    v = (v || "").trim();
    if (!v) return "";
    if (/^https:\/\//i.test(v)) return v;
    v = v.replace(/^\.?\/?(covers\/)?/i, "");
    if (!/^[\w.\- ]+\.(jpe?g|png|webp|gif)$/i.test(v)) { errors.push("Row " + line + ': cover "' + v + '" should be an image file name like b05.jpg.'); return ""; }
    var dir = window.STORE_CONFIG && typeof window.STORE_CONFIG.coversFolder === "string" ? window.STORE_CONFIG.coversFolder : "covers/";
    if (dir && dir.slice(-1) !== "/") dir += "/";
    return dir + v;
  }

  function toBooks(rows) {
    var errors = [];
    var head = rows.shift().map(function (h) { return h.trim().toLowerCase(); });
    ["id", "title", "author", "price"].forEach(function (k) {
      if (head.indexOf(k) < 0) errors.push('Missing column "' + k + '".');
    });
    if (errors.length) return { errors: errors };
    var seen = {};
    var books = rows.map(function (r, n) {
      var line = n + 2, b = {};
      head.forEach(function (h, j) { b[h] = (r[j] || "").trim(); });
      var pounds = parseFloat(b.price.replace(/[£,\s]/g, ""));
      if (!b.id) errors.push("Row " + line + ": id is empty.");
      else if (!/^\w+$/.test(b.id)) errors.push("Row " + line + ': id "' + b.id + '" may only use letters, numbers and _.');
      else if (seen[b.id]) errors.push("Row " + line + ': id "' + b.id + '" is used twice.');
      seen[b.id] = true;
      if (!b.title) errors.push("Row " + line + ": title is empty.");
      if (!(pounds >= 0)) errors.push("Row " + line + ': price "' + b.price + '" is not a number.');
      if (/e\+/i.test(b.isbn)) {
        if (b.sample === "google" && !b.google_id) errors.push("Row " + line + ": ISBN was turned into a number by Excel (" + b.isbn + "). Format that column as Text and retype it.");
        else b.isbn = ""; // not needed unless sample = google
      }
      if (b.sample === "google" && !b.isbn && !b.google_id) errors.push("Row " + line + ': sample is "google" but isbn and google_id are both empty.');
      return {
        id: b.id, title: b.title, author: b.author, genre: b.genre || "Other",
        price: Math.round(pounds * 100),
        pages: parseInt(b.pages, 10) || null,
        format: b.format || "",
        colour: /^#[0-9a-f]{3,6}$/i.test(b.colour) ? b.colour : PALETTE[n % PALETTE.length],
        isbn: (b.isbn || "").replace(/[^0-9X]/gi, ""),
        gbid: (b.google_id || "").replace(/[^\w-]/g, ""),
        sample: b.sample === "google" ? "google" : "file",
        blurb: b.blurb || "",
        cover: coverPath(b.cover, line, errors)
      };
    });
    if (!books.length) errors.push("books.csv has no books in it.");
    return { books: books, errors: errors };
  }

  function fail(msgs) {
    var el = document.getElementById("app") || document.querySelector("main");
    el.innerHTML = '<div class="intro"><strong>The book list could not be loaded.</strong><ul>' +
      msgs.map(function (m) { return "<li>" + String(m).replace(/</g, "&lt;") + "</li>"; }).join("") + "</ul></div>";
  }

  function start(fn) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn); else fn(); }

  // Excel often saves CSV as Windows-1252 rather than UTF-8; accept either so £ and curly quotes survive.
  function decode(buf) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder("windows-1252").decode(buf); }
  }

  fetch("books.csv", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error("books.csv not found (" + r.status + ")."); return r.arrayBuffer(); })
    .then(decode)
    .then(function (text) {
      var res = toBooks(parseCSV(text));
      start(function () {
        if (res.errors.length) return fail(res.errors);
        window.CATALOGUE = res.books;
        window.startApp();
      });
    })
    .catch(function (e) {
      start(function () {
        fail([e.message, location.protocol === "file:" ? "Opening the file directly from your computer blocks this. Use the GitHub Pages link, or a local server." : ""].filter(Boolean));
      });
    });
})();
