(function () {
  "use strict";

  var DATA = window.METHODS || [];
  var LAST_UPDATED = window.LAST_UPDATED || "";

  var MODALITIES = ["camera", "lidar", "radar", "language"];
  var MODALITY_LABEL = { camera: "Camera", lidar: "LiDAR", radar: "Radar", language: "Language" };

  var EXPERT_KEYS = ["think2drive", "pdmlite", "lead", "other", "unknown"];
  var EXPERT_LABEL = {
    think2drive: "Think2Drive",
    pdmlite: "PDM-Lite",
    lead: "LEAD",
    other: "Other",
    unknown: "Unknown",
  };

  function classifyExpert(raw) {
    if (!raw) return "unknown";
    var s = raw.toLowerCase();
    if (s.indexOf("think2drive") !== -1) return "think2drive";
    if (s.indexOf("pdm-lite") !== -1 || s.indexOf("pdm lite") !== -1) return "pdmlite";
    if (s.indexOf("lead") !== -1) return "lead";
    return "other";
  }

  function modalitySet(m) {
    var set = {};
    (m || []).forEach(function (x) { set[x.type] = x.amount; });
    return set;
  }

  // ---------- state ----------
  var state = {
    search: "",
    modalities: new Set(),
    matchAll: false,
    expert: "",
    output: "",
    venue: "",
    showPrivileged: true,
    sortKey: "ds",
    sortDir: "desc",
  };

  // ---------- derived rows ----------
  function withRank(rows) {
    return rows.map(function (r, i) { return Object.assign({}, r, { rank: i + 1 }); });
  }

  function sortRows(rows) {
    var key = state.sortKey, dir = state.sortDir === "asc" ? 1 : -1;
    return rows.slice().sort(function (a, b) {
      var av = a[key], bv = b[key];
      if (av === null || av === undefined) av = key === "name" || key === "venue" || key === "expert" ? "" : -Infinity;
      if (bv === null || bv === undefined) bv = key === "name" || key === "venue" || key === "expert" ? "" : -Infinity;
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return a.name.localeCompare(b.name);
    });
  }

  function matchesFilters(r) {
    if (state.search) {
      if (r.name.toLowerCase().indexOf(state.search.toLowerCase()) === -1) return false;
    }
    if (state.modalities.size > 0) {
      var have = modalitySet(r.modalities);
      var sel = Array.from(state.modalities);
      if (state.matchAll) {
        if (!sel.every(function (m) { return have.hasOwnProperty(m); })) return false;
      } else {
        if (!sel.some(function (m) { return have.hasOwnProperty(m); })) return false;
      }
    }
    if (state.expert) {
      if (classifyExpert(r.expert) !== state.expert) return false;
    }
    if (state.output) {
      var ot = r.output_type || "unknown";
      if (ot !== state.output) return false;
    }
    if (state.venue) {
      var isPublished = !!r.venue;
      if (state.venue === "published" && !isPublished) return false;
      if (state.venue === "unpublished" && isPublished) return false;
    }
    return true;
  }

  function getFiltered() {
    var pool = DATA.filter(function (r) { return state.showPrivileged || !r.privileged; });
    var nonPriv = pool.filter(function (r) { return !r.privileged && matchesFilters(r); });
    var priv = pool.filter(function (r) { return r.privileged && matchesFilters(r); });
    return { nonPriv: withRank(sortRows(nonPriv)), priv: sortRows(priv) };
  }

  // ---------- rendering helpers ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function expertPill(raw) {
    var key = classifyExpert(raw);
    if (key === "unknown") return '<span class="pill pill-unknown">unknown</span>';
    var cls = "pill pill-exp-" + key;
    var label = key === "other" ? esc(raw) : EXPERT_LABEL[key];
    return '<span class="' + cls + '" title="' + esc(raw) + '">' + esc(label) + "</span>";
  }

  function modalityBadges(r) {
    if (!r.researched) return '<span class="pill pill-unknown">unknown</span>';
    var m = r.modalities || [];
    if (m.length === 0) {
      return '<span class="pill" title="' + esc(r.justification || "") + '">none (sensor-free)</span>';
    }
    return (
      '<div class="badge-row">' +
      m
        .map(function (x) {
          var title = (MODALITY_LABEL[x.type] || x.type) + ": " + (x.amount || "");
          return (
            '<span class="badge badge-' + x.type + '" title="' + esc(title) + '">' +
            esc(MODALITY_LABEL[x.type] || x.type) +
            "</span>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function outputPill(r) {
    var ot = r.output_type;
    if (!ot) return '<span class="pill pill-unknown">unknown</span>';
    var label = ot === "spatiotemporal" ? "Spatiotemporal" : "Spatial";
    var title = (r.justification ? r.justification : "") + (r.source_url ? " Source: " + r.source_url : "");
    return (
      '<span class="output-pill ' + ot + '" title="' + esc(title) + '">' +
      '<span class="shape"></span>' + label +
      "</span>"
    );
  }

  function fmtNum(v) {
    if (v === null || v === undefined) return "–";
    return v.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  }

  function renderRow(r, isPriv) {
    var cls = isPriv ? "is-privileged" : "";
    var rankCell = isPriv ? "GT" : r.rank;
    return (
      '<tr class="' + cls + '">' +
      '<td class="col-rank">' + rankCell + "</td>" +
      '<td class="col-name"><a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.name) + "</a></td>" +
      '<td class="col-num">' + fmtNum(r.ds) + "</td>" +
      '<td class="col-num">' + fmtNum(r.sr) + "</td>" +
      '<td class="col-num">' + (r.year || "–") + "</td>" +
      '<td class="col-venue">' + esc(r.venue || "–") + "</td>" +
      '<td class="col-expert">' + expertPill(r.expert) + "</td>" +
      '<td class="col-modalities">' + modalityBadges(r) + "</td>" +
      '<td class="col-output">' + outputPill(r) + "</td>" +
      "</tr>"
    );
  }

  function renderTable() {
    var f = getFiltered();
    var rowsEl = document.getElementById("rows");
    var html = f.nonPriv.map(function (r) { return renderRow(r, false); }).join("");
    if (f.priv.length) {
      html +=
        '<tr class="is-divider"><td colspan="9" style="text-align:center;color:var(--text-muted);font-size:0.78rem;padding:6px;">' +
        "privileged / ground-truth experts" +
        "</td></tr>" +
        f.priv.map(function (r) { return renderRow(r, true); }).join("");
    }
    rowsEl.innerHTML = html;

    var total = f.nonPriv.length + f.priv.length;
    document.getElementById("result-count").textContent = total + " of " + DATA.length + " methods shown";
    document.getElementById("empty-state").hidden = total !== 0;

    document.querySelectorAll("thead th[data-sort]").forEach(function (th) {
      th.classList.remove("is-sorted-asc", "is-sorted-desc");
      if (th.getAttribute("data-sort") === state.sortKey) {
        th.classList.add(state.sortDir === "asc" ? "is-sorted-asc" : "is-sorted-desc");
      }
    });
  }

  // ---------- stats panel ----------
  function renderStats() {
    var researched = DATA.filter(function (r) { return r.researched; });
    var el = document.getElementById("stats");

    function barList(counts, colorMap, labelMap) {
      var max = Math.max.apply(null, Object.keys(counts).map(function (k) { return counts[k]; }).concat([1]));
      return Object.keys(counts)
        .filter(function (k) { return counts[k] > 0; })
        .sort(function (a, b) { return counts[b] - counts[a]; })
        .map(function (k) {
          var pct = Math.round((counts[k] / max) * 100);
          var color = colorMap ? colorMap[k] : "var(--accent)";
          return (
            '<div class="bar-row"><span class="bar-label">' + esc(labelMap ? labelMap[k] : k) + "</span>" +
            '<span class="bar-track"><span class="bar-fill" style="width:' + pct + "%;background:" + color + ';"></span></span>' +
            '<span class="bar-value">' + counts[k] + "</span></div>"
          );
        })
        .join("");
    }

    var modCounts = { camera: 0, lidar: 0, radar: 0, language: 0 };
    researched.forEach(function (r) {
      (r.modalities || []).forEach(function (m) { if (modCounts.hasOwnProperty(m.type)) modCounts[m.type]++; });
    });
    var modColors = {
      camera: "var(--mod-camera)", lidar: "var(--mod-lidar)", radar: "var(--mod-radar)", language: "var(--mod-language)",
    };

    var expCounts = {};
    researched.forEach(function (r) {
      var k = classifyExpert(r.expert);
      expCounts[k] = (expCounts[k] || 0) + 1;
    });
    var expColors = {
      think2drive: "var(--exp-think2drive)", pdmlite: "var(--exp-pdmlite)", lead: "var(--exp-lead)",
      other: "var(--exp-other)", unknown: "var(--text-muted)",
    };

    var outCounts = { spatial: 0, spatiotemporal: 0 };
    researched.forEach(function (r) { if (r.output_type) outCounts[r.output_type] = (outCounts[r.output_type] || 0) + 1; });
    var outColors = { spatial: "var(--accent)", spatiotemporal: "var(--mod-lidar)" };
    var outLabels = { spatial: "Spatial", spatiotemporal: "Spatiotemporal" };

    el.innerHTML =
      '<div class="stat-card"><h3>Coverage</h3>' +
      '<p class="stat-headline">' + researched.length + " / " + DATA.length + "</p>" +
      '<p style="color:var(--text-muted);font-size:0.82rem;margin:0;">methods with verified expert / modality / output data — rest marked unknown</p>' +
      "</div>" +
      '<div class="stat-card"><h3>By modality</h3>' + (barList(modCounts, modColors, MODALITY_LABEL) || emptyNote()) + "</div>" +
      '<div class="stat-card"><h3>By expert</h3>' + (barList(expCounts, expColors, EXPERT_LABEL) || emptyNote()) + "</div>" +
      '<div class="stat-card"><h3>By output type</h3>' + (barList(outCounts, outColors, outLabels) || emptyNote()) + "</div>";
  }

  function emptyNote() {
    return '<p style="color:var(--text-muted);font-size:0.8rem;margin:0;">no data yet</p>';
  }

  // ---------- controls wiring ----------
  function buildModalityChips() {
    var wrap = document.getElementById("modality-filters");
    MODALITIES.forEach(function (m) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.setAttribute("aria-pressed", "false");
      chip.style.setProperty("--chip-color", "var(--mod-" + m + ")");
      chip.innerHTML = '<span class="dot" style="background:var(--mod-' + m + ')"></span>' + MODALITY_LABEL[m];
      chip.addEventListener("click", function () {
        var pressed = chip.getAttribute("aria-pressed") === "true";
        chip.setAttribute("aria-pressed", String(!pressed));
        if (pressed) state.modalities.delete(m); else state.modalities.add(m);
        renderTable();
      });
      wrap.appendChild(chip);
    });
  }

  function buildExpertFilter() {
    var sel = document.getElementById("expert-filter");
    var opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "All";
    sel.appendChild(opt);
    EXPERT_KEYS.forEach(function (k) {
      var o = document.createElement("option");
      o.value = k;
      o.textContent = EXPERT_LABEL[k];
      sel.appendChild(o);
    });
    sel.addEventListener("change", function () { state.expert = sel.value; renderTable(); });
  }

  function wireControls() {
    document.getElementById("search").addEventListener("input", function (e) {
      state.search = e.target.value;
      renderTable();
    });
    document.getElementById("output-filter").addEventListener("change", function (e) {
      state.output = e.target.value;
      renderTable();
    });
    document.getElementById("venue-filter").addEventListener("change", function (e) {
      state.venue = e.target.value;
      renderTable();
    });
    document.getElementById("show-privileged").addEventListener("change", function (e) {
      state.showPrivileged = e.target.checked;
      renderTable();
    });
    document.getElementById("match-all-modalities").addEventListener("change", function (e) {
      state.matchAll = e.target.checked;
      renderTable();
    });
    document.getElementById("reset-filters").addEventListener("click", function () {
      state.search = "";
      state.modalities = new Set();
      state.matchAll = false;
      state.expert = "";
      state.output = "";
      state.venue = "";
      state.showPrivileged = true;
      document.getElementById("search").value = "";
      document.getElementById("expert-filter").value = "";
      document.getElementById("output-filter").value = "";
      document.getElementById("venue-filter").value = "";
      document.getElementById("show-privileged").checked = true;
      document.getElementById("match-all-modalities").checked = false;
      document.querySelectorAll("#modality-filters .chip").forEach(function (c) { c.setAttribute("aria-pressed", "false"); });
      renderTable();
    });

    document.querySelectorAll("thead th[data-sort]").forEach(function (th) {
      th.addEventListener("click", function () {
        var key = th.getAttribute("data-sort");
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortKey = key;
          state.sortDir = key === "name" || key === "venue" || key === "expert" ? "asc" : "desc";
        }
        renderTable();
      });
    });
  }

  function wireTheme() {
    var btn = document.getElementById("theme-toggle");
    var stored = null;
    try { stored = localStorage.getItem("b2d-theme"); } catch (e) {}
    // Light is the standard theme; dark only applies if the viewer explicitly chose it before.
    if (stored === "dark") document.documentElement.setAttribute("data-theme", "dark");
    btn.addEventListener("click", function () {
      var isDark = document.documentElement.getAttribute("data-theme") === "dark";
      if (isDark) document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", "dark");
      try { localStorage.setItem("b2d-theme", isDark ? "light" : "dark"); } catch (e) {}
    });
  }

  function init() {
    document.getElementById("last-updated").textContent = LAST_UPDATED ? "Data compiled " + LAST_UPDATED : "";
    buildModalityChips();
    buildExpertFilter();
    wireControls();
    wireTheme();
    renderStats();
    renderTable();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
