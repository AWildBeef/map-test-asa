// ============================================================
// GROUPING MODES (toggleable)
// ============================================================

/**
 * The 5 modes:
 * 1) "soft"         = no sections; just badges + better search
 * 2) "sections"     = headers in list
 * 3) "collapsible"  = headers with expand/collapse
 * 4) "two-stage"    = Group dropdown + Mod dropdown (replaces sources dropdown)
 * 5) "path"         = show group path meta line; still flat list (optionally combine w/ sections)
 */

const GROUPING_MODES = ["soft", "sections", "collapsible", "two-stage", "path"];
let groupingMode = localStorage.getItem("groupingMode") || "sections";

// Simple metadata extraction from your SOURCES list (no manual edits required)
// You CAN override by adding fields to SOURCES entries: { group, author, series, tags:[] }
function metaForSource(src) {
  if (!src) return { group: "Other", author: "", series: "", tags: [] };

  // existing manual overrides (if you add them later)
  const group  = src.group  || "";
  const author = src.author || "";
  const series = src.series || "";
  const tags   = Array.isArray(src.tags) ? src.tags.slice() : [];

  // infer group from name if not provided
  let inferredGroup = group;

  const n = String(src.name || "").toLowerCase();

  if (!inferredGroup) {
    if (src.id === "official") inferredGroup = "Official";
    else if (n.startsWith("isle of myths:")) inferredGroup = "Isle of Myths";
    else if (n.startsWith("additional creatures:")) inferredGroup = "Additional Creatures";
    else if (n.startsWith("xyphias' creatures:") || n.startsWith("xyphias")) inferredGroup = "Xyphias";
    else if (n.startsWith("prehistoric beasts")) inferredGroup = "Prehistoric Beasts";
    else inferredGroup = "Other Mods";
  }

  // infer author/series (optional)
  let inferredAuthor = author;
  if (!inferredAuthor) {
    if (inferredGroup === "Xyphias") inferredAuthor = "Xyphias";
    else if (inferredGroup === "Isle of Myths") inferredAuthor = "Isle of Myths";
    else if (inferredGroup === "Prehistoric Beasts") inferredAuthor = "Prehistoric Beasts";
    else if (inferredGroup === "Additional Creatures") inferredAuthor = "Additional Creatures";
  }

  let inferredSeries = series;
  if (!inferredSeries) {
    if (/part\s+[ivx]+/i.test(src.name)) inferredSeries = "Parts";
  }

  // tags used for search + pills
  if (inferredGroup) tags.push(inferredGroup);
  if (inferredAuthor && inferredAuthor !== inferredGroup) tags.push(inferredAuthor);
  if (inferredSeries) tags.push(inferredSeries);

  return {
    group: inferredGroup,
    author: inferredAuthor,
    series: inferredSeries,
    tags: Array.from(new Set(tags.map(String).filter(Boolean))),
    path: `${inferredGroup}${inferredAuthor && inferredAuthor !== inferredGroup ? " > " + inferredAuthor : ""}${inferredSeries ? " > " + inferredSeries : ""}`
  };
}

function setGroupingMode(mode) {
  groupingMode = GROUPING_MODES.includes(mode) ? mode : "sections";
  localStorage.setItem("groupingMode", groupingMode);
  applyGroupingModeUI();
}

function cycleGroupingMode() {
  const i = Math.max(0, GROUPING_MODES.indexOf(groupingMode));
  const next = GROUPING_MODES[(i + 1) % GROUPING_MODES.length];
  setGroupingMode(next);
}

// ============================================================
// GROUP MODE TOGGLE UI (adds a single button near the Sources dropdown)
// ============================================================
function ensureGroupingModeToggle() {
  const topbar = document.getElementById("topbar");
  if (!topbar) return;

  if (document.getElementById("groupingModeBtn")) return;

  const btn = document.createElement("button");
  btn.id = "groupingModeBtn";
  btn.type = "button";
  btn.className = "top-btn"; // use your existing styling if you have one
  btn.title = "Change Sources grouping mode";
  btn.textContent = "Grouping: " + groupingMode;

  btn.addEventListener("click", () => {
    cycleGroupingMode();
  });

  // Try to place it next to the Sources fancy host if present
  const anchor = document.getElementById("sourceSelectFancy") || topbar;
  anchor.parentNode?.insertBefore(btn, anchor.nextSibling);

  // minimal inline style if you don't have .top-btn
  btn.style.marginLeft = "8px";
  btn.style.padding = "8px 10px";
  btn.style.borderRadius = "10px";
  btn.style.border = "1px solid rgba(255,255,255,.14)";
  btn.style.background = "rgba(0,0,0,.25)";
  btn.style.color = "inherit";
  btn.style.font = "inherit";
}

function applyGroupingModeUI() {
  const btn = document.getElementById("groupingModeBtn");
  if (btn) btn.textContent = "Grouping: " + groupingMode;

  // If we are in two-stage mode, we render a different UI:
  if (groupingMode === "two-stage") {
    ensureGroupAndSourceSelectors();
    hideSourcesFancy(true);
    rebuildGroupDropdown();     // builds groups based on SOURCES
    rebuildSourcesForGroup();   // repopulates sourceSelect based on chosen group
  } else {
    ensureGroupAndSourceSelectors(); // ensures it exists; we'll hide it
    hideSourcesFancy(false);
    showGroupSelect(false);
    // rebuild normal sources dropdown fancy, but with current mode behavior
    setupSourceDropdown(); // reuses your existing function; but uses updated mountFancySelect below
  }
}

// show/hide the original sourceSelectFancy host
function hideSourcesFancy(hide) {
  const host = document.getElementById("sourceSelectFancy");
  if (host) host.style.display = hide ? "none" : "";
  const native = document.getElementById("sourceSelect");
  if (native) native.style.display = hide ? "none" : ""; // native already hidden; ok
}

// ============================================================
// TWO-STAGE MODE: Group dropdown + Mod dropdown
// ============================================================
function ensureGroupAndSourceSelectors() {
  // Add an extra select + host if not present
  const topbar = document.getElementById("topbar");
  if (!topbar) return;

  if (document.getElementById("groupSelect")) return;

  const native = document.createElement("select");
  native.id = "groupSelect";

  const host = document.createElement("div");
  host.id = "groupSelectFancy";
  host.style.minWidth = "220px";
  host.style.marginLeft = "8px";

  // Put it near source select fancy
  const sourceHost = document.getElementById("sourceSelectFancy") || topbar;
  sourceHost.parentNode?.insertBefore(host, sourceHost);

  // Keep native in DOM too
  topbar.appendChild(native);

  // hide by default
  showGroupSelect(false);
}

function showGroupSelect(show) {
  const h = document.getElementById("groupSelectFancy");
  const n = document.getElementById("groupSelect");
  if (h) h.style.display = show ? "" : "none";
  if (n) n.style.display = show ? "" : "none";
}

function rebuildGroupDropdown() {
  const sel = document.getElementById("groupSelect");
  if (!sel) return;

  // collect groups
  const groups = new Set();
  for (const s of SOURCES) {
    const m = metaForSource(s);
    groups.add(m.group || "Other");
  }

  const arr = Array.from(groups).sort((a,b) => a.localeCompare(b));

  sel.innerHTML = "";
  for (const g of arr) {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = g;
    sel.appendChild(opt);
  }

  // default: current activeSource's group
  const activeSrc = SOURCES.find(x => x.id === activeSourceId) || SOURCES[0];
  const activeGroup = metaForSource(activeSrc).group;
  sel.value = arr.includes(activeGroup) ? activeGroup : (arr[0] || "Other");

  sel.onchange = () => {
    rebuildSourcesForGroup();
  };

  showGroupSelect(true);

  mountFancySelect({
    nativeId: "groupSelect",
    hostId: "groupSelectFancy",
    placeholder: "Search groups...",
    getButtonSubText: (v) => "",
    getRowBadges: (v) => [],
    cfg: null
  });
}

function rebuildSourcesForGroup() {
  const groupSel = document.getElementById("groupSelect");
  const selectedGroup = groupSel?.value || "Other";

  const sourceSel = document.getElementById("sourceSelect");
  if (!sourceSel) return;

  // rebuild native sourceSelect with only items in group
  sourceSel.innerHTML = "";

  const filtered = SOURCES.filter(s => metaForSource(s).group === selectedGroup);

  for (const s of filtered) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    sourceSel.appendChild(opt);
  }

  // preserve activeSourceId if still present
  const still = filtered.some(s => s.id === activeSourceId);
  activeSourceId = still ? activeSourceId : (filtered[0]?.id || "official");
  sourceSel.value = activeSourceId;

  // IMPORTANT: ensure change handler still exists
  // (setupSourceDropdown originally attaches it; we replicate minimal handler here)
  sourceSel.onchange = null;
  sourceSel.addEventListener("change", async () => {
    activeSourceId = sourceSel.value;
    setModStylePanelVisible(activeSourceId !== "official");
    renderModStylePanelBody();

    const mapSel = document.getElementById("mapSelect");
    const mapMeta = pickById(MAPS, mapSel?.value);
    await loadMapByMeta(mapMeta);
  });

  // show fancy source dropdown again, but still hidden by hideSourcesFancy(true).
  // In two-stage mode we will mount the fancy into a dedicated host.
  // We'll reuse existing host if you want it visible; easiest is to re-use sourceSelectFancy but show it in two-stage.
  // We'll show it as the second dropdown by overriding hideSourcesFancy for two-stage:
  const srcHost = document.getElementById("sourceSelectFancy");
  if (srcHost) srcHost.style.display = ""; // show the second dropdown

  mountFancySelect({
    nativeId: "sourceSelect",
    hostId: "sourceSelectFancy",
    placeholder: "Search sources...",
    getButtonSubText: (v) => {
      const s = SOURCES.find(x => x.id === v);
      const m = metaForSource(s);
      return m.path;
    },
    getRowBadges: (v) => {
      const s = SOURCES.find(x => x.id === v);
      const m = metaForSource(s);
      return m.tags.slice(0, 2);
    },
    cfg: null
  });
}

// ============================================================
// UPGRADED mountFancySelect: supports all 5 modes
// ============================================================
function mountFancySelect({
  nativeId,
  hostId,
  placeholder = "Search...",
  getButtonSubText = null,   // (value, cfg) => string
  getRowBadges = null,       // (value, cfg) => [ "pill text", ... ]
  cfg = null,

  // NEW (optional):
  getGroup = null,           // (value, cfg) => string
  groupMode = null           // force mode; default uses global groupingMode
}) {
  const native = document.getElementById(nativeId);
  const host = document.getElementById(hostId);
  if (!native || !host) return;

  native.style.position = "absolute";
  native.style.left = "-9999px";
  native.style.width = "1px";
  native.style.height = "1px";
  native.style.opacity = "0";

  host.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "dd";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "dd-btn";

  const btnLeft = document.createElement("div");
  btnLeft.className = "dd-btn-left";

  const textWrap = document.createElement("div");
  textWrap.className = "dd-btn-text";
  textWrap.style.minWidth = "0";

  const label = document.createElement("div");
  label.className = "dd-label";

  const sub = document.createElement("div");
  sub.className = "dd-sub";

  textWrap.appendChild(label);
  textWrap.appendChild(sub);
  btnLeft.appendChild(textWrap);

  const caret = document.createElement("div");
  caret.className = "dd-caret";
  caret.textContent = "▾";

  btn.appendChild(btnLeft);
  btn.appendChild(caret);

  const panel = document.createElement("div");
  panel.className = "dd-panel";

  const search = document.createElement("input");
  search.className = "dd-search";
  search.placeholder = placeholder;

  const list = document.createElement("div");
  list.className = "dd-list";

  panel.appendChild(search);
  panel.appendChild(list);

  wrap.appendChild(btn);
  wrap.appendChild(panel);
  host.appendChild(wrap);

  const mode = groupMode || groupingMode;

  function makeItemRow({ value, text, metaText = "" , pills = [] }) {
    const row = document.createElement("div");
    row.className = "dd-item";
    row.dataset.value = value;

    // search index includes name + meta + pills
    row.dataset.search = normSearch([text, metaText, ...pills].join(" "));

    const left = document.createElement("div");
    left.className = "dd-item-left";

    const main = document.createElement("div");
    main.className = "dd-item-main";

    const name = document.createElement("div");
    name.className = "dd-item-name";
    name.textContent = text;

    main.appendChild(name);

    // optional meta line (used for "path" mode)
    if (metaText) {
      const meta = document.createElement("div");
      meta.className = "dd-item-meta";
      meta.textContent = metaText;
      main.appendChild(meta);
    }

    left.appendChild(main);

    const badges = document.createElement("div");
    badges.className = "dd-badges";
    for (const t of pills) {
      const pill = document.createElement("span");
      pill.className = "dd-pill";
      pill.textContent = String(t);
      badges.appendChild(pill);
    }

    row.appendChild(left);
    row.appendChild(badges);

    row.addEventListener("click", () => {
      native.value = value;
      native.dispatchEvent(new Event("change"));
      close();
    });

    return row;
  }

  function makeGroupHeader(groupName, collapsible) {
    const h = document.createElement("div");
    h.className = "dd-group";
    h.dataset.group = groupName;
    h.textContent = groupName;

    if (collapsible) {
      h.classList.add("dd-group-collapsible");
      h.dataset.open = "1";
      h.addEventListener("click", () => {
        const open = h.dataset.open === "1";
        h.dataset.open = open ? "0" : "1";
        h.classList.toggle("is-closed", open);

        // toggle until next group header
        let n = h.nextSibling;
        while (n && !(n.classList && n.classList.contains("dd-group"))) {
          if (n.classList && n.classList.contains("dd-item")) {
            n.style.display = open ? "none" : "";
          }
          n = n.nextSibling;
        }
      });
    }

    return h;
  }

  function rebuildItems() {
    list.innerHTML = "";

    const opts = Array.from(native.options)
      .map(o => ({ value: o.value, text: o.textContent || "" }))
      .filter(o => o.value);

    // ------------- Build rows with meta -------------
    const rows = opts.map(o => {
      let metaText = "";
      let pills = [];

      if (typeof getRowBadges === "function") pills = (getRowBadges(o.value, cfg) || []).map(String);

      // In "path" mode, show path/meta (for sources only we can infer)
      if (mode === "path" && nativeId === "sourceSelect") {
        const src = SOURCES.find(s => s.id === o.value);
        const m = metaForSource(src);
        metaText = m.path;
        pills = pills.length ? pills : m.tags.slice(0, 2);
      }

      // In "soft" mode for sources, show tags as pills by default
      if (mode === "soft" && nativeId === "sourceSelect") {
        const src = SOURCES.find(s => s.id === o.value);
        const m = metaForSource(src);
        pills = Array.from(new Set([...(pills || []), ...m.tags])).slice(0, 3);
      }

      return { ...o, metaText, pills };
    });

    // ------------- Render per mode -------------
    if (mode === "sections" || mode === "collapsible") {
      const collapsible = (mode === "collapsible");

      // group function: prefer passed getGroup; otherwise infer for sources
      const groupFn = (value) => {
        if (typeof getGroup === "function") return getGroup(value, cfg);
        if (nativeId === "sourceSelect") {
          const src = SOURCES.find(s => s.id === value);
          return metaForSource(src).group || "Other";
        }
        return "All";
      };

      // group items
      const map = new Map();
      for (const r of rows) {
        const g = groupFn(r.value) || "Other";
        (map.get(g) || (map.set(g, []), map.get(g))).push(r);
      }

      const groupNames = Array.from(map.keys()).sort((a,b) => a.localeCompare(b));
      for (const g of groupNames) {
        list.appendChild(makeGroupHeader(g, collapsible));
        const items = map.get(g) || [];
        // keep stable order by text
        items.sort((a,b) => a.text.localeCompare(b.text));

        for (const r of items) {
          list.appendChild(makeItemRow({ value: r.value, text: r.text, metaText: r.metaText, pills: r.pills }));
        }
      }
    } else {
      // "soft" or "path" default: flat list
      rows.sort((a,b) => a.text.localeCompare(b.text));
      for (const r of rows) {
        list.appendChild(makeItemRow({ value: r.value, text: r.text, metaText: r.metaText, pills: r.pills }));
      }
    }
  }

  function syncButton() {
    const txt = native.selectedOptions?.[0]?.textContent || "(Select)";
    label.textContent = txt;

    if (typeof getButtonSubText === "function") {
      sub.textContent = getButtonSubText(native.value, cfg) || "";
    } else {
      // default for sources in path mode: show inferred path
      if (mode === "path" && nativeId === "sourceSelect") {
        const src = SOURCES.find(s => s.id === native.value);
        sub.textContent = metaForSource(src).path || "";
      } else {
        sub.textContent = "";
      }
    }
  }

  function open() {
    wrap.classList.add("open");
    search.value = "";

    // show everything
    list.querySelectorAll(".dd-item").forEach(el => (el.style.display = ""));
    list.querySelectorAll(".dd-group").forEach(el => (el.style.display = ""));

    list.scrollTop = 0;
    search.focus();
  }

  function close() {
    wrap.classList.remove("open");
    btn.focus();
  }

  btn.addEventListener("click", () => {
    wrap.classList.contains("open") ? close() : open();
  });

  // Filter: hide items; hide group headers with 0 visible children
  let lastQ = "";
  search.addEventListener("input", () => {
    const q = normSearch(search.value);
    if (q !== lastQ) list.scrollTop = 0;
    lastQ = q;

    // filter items
    list.querySelectorAll(".dd-item").forEach(el => {
      el.style.display = el.dataset.search.includes(q) ? "" : "none";
    });

    // headers: hide if no visible items until next header
    list.querySelectorAll(".dd-group").forEach(h => {
      let n = h.nextSibling;
      let any = false;
      while (n && !(n.classList && n.classList.contains("dd-group"))) {
        if (n.classList && n.classList.contains("dd-item") && n.style.display !== "none") {
          any = true;
          break;
        }
        n = n.nextSibling;
      }
      h.style.display = any ? "" : "none";
    });
  });

  document.addEventListener("pointerdown", (e) => {
    if (!wrap.contains(e.target)) close();
  });

  native.addEventListener("change", syncButton);

  rebuildItems();
  syncButton();
}

// ============================================================
// Patch your existing setupSourceDropdown() to leverage modes
// (drop this over your current setupSourceDropdown())
// ============================================================
function setupSourceDropdown() {
  const sel = document.getElementById("sourceSelect");
  if (!sel) return;

  sel.innerHTML = "";
  for (const s of SOURCES) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    sel.appendChild(opt);
  }
  sel.value = activeSourceId;

  sel.onchange = null;
  sel.addEventListener("change", async () => {
    activeSourceId = sel.value;
    setModStylePanelVisible(activeSourceId !== "official");
    renderModStylePanelBody();

    const mapSel = document.getElementById("mapSelect");
    const mapMeta = pickById(MAPS, mapSel?.value);
    await loadMapByMeta(mapMeta);
  });

  // If two-stage mode is active, we render groupSelect + filtered sourceSelect
  if (groupingMode === "two-stage") {
    ensureGroupingModeToggle();
    ensureGroupAndSourceSelectors();
    rebuildGroupDropdown();     // includes mountFancySelect for groupSelect
    rebuildSourcesForGroup();   // mounts sourceSelect fancy as 2nd dropdown
    return;
  }

  // normal single dropdown modes:
  hideSourcesFancy(false);
  showGroupSelect(false);

  mountFancySelect({
    nativeId: "sourceSelect",
    hostId: "sourceSelectFancy",
    placeholder: "Search sources...",
    getButtonSubText: (v) => {
      if (v === "official") return "Official";
      const src = SOURCES.find(s => s.id === v);
      if (groupingMode === "path") return metaForSource(src).path;
      return "Mod";
    },
    getRowBadges: (v) => {
      const src = SOURCES.find(s => s.id === v);
      if (!src) return [];
      if (v === "official") return ["official"];
      const m = metaForSource(src);
      if (groupingMode === "soft") return m.tags.slice(0, 3);
      if (groupingMode === "path") return m.tags.slice(0, 2);
      // default: a small hint badge
      return [m.group || "mod"];
    },
    // group headers only apply in sections/collapsible modes:
    getGroup: (v) => {
      if (v === "official") return "Official";
      const src = SOURCES.find(s => s.id === v);
      return metaForSource(src).group || "Other";
    }
  });
}

// ============================================================
// Boot integration: call these once in boot()
// ============================================================

// In your boot() function, add:
//   ensureGroupingModeToggle();
//   applyGroupingModeUI();
//
// Example:
function boot() {
  setupSourceDropdown();
  setupMapDropdown();

  preloadMapAssets();

  document.getElementById("controlsToggle")?.addEventListener("click", () => {
    document.getElementById("topbar")?.classList.toggle("show-controls");
    requestAnimationFrame(() => { refitMapForUI(); });
  });

  document.getElementById("modeToggle")?.addEventListener("click", () => {
    const next = (currentViewMode === "dino") ? "entry" : "dino";
    switchMode(next);
  });

  syncModeBtn();

  window.addEventListener("resize", () => { refitMapForUI(); });

  // ✅ NEW:
  ensureGroupingModeToggle();
  applyGroupingModeUI();

  loadMapByMeta(MAPS[0]).catch(err => {
    console.error(err);
    alert(err.message || String(err));
  });
}