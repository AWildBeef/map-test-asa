// ============================================================
// RARITY TUNING (edit these whenever)
// ============================================================
const RARITY_THRESHOLDS = [
  [0.15,   "very common"],
  [0.06,   "common"],
  [0.03,   "uncommon"],
  [0.008,  "very uncommon"],
  [0.0007, "rare"],
  [-1,     "very rare"],
];

const RARITY_ORDER = ["very common", "common", "uncommon", "very uncommon", "rare", "very rare"];

const MIN_GLOBAL_DOWNSHIFT = [
  [2,  6],
  [5,  2],
  [14, 1],
];

function rarityFromWeight(w) {
  const eff = Number(w || 0);
  for (const [thr, name] of RARITY_THRESHOLDS) {
    if (eff >= thr) return name;
  }
  return "very rare";
}

function downshiftStepsForMin(bestSharedMin) {
  const m = Number(bestSharedMin || 0);
  if (m <= 0) return 0;
  for (const [thr, steps] of MIN_GLOBAL_DOWNSHIFT) {
    if (m <= thr) return steps;
  }
  return 0;
}

function downgradeRarity(label, steps) {
  if (!steps) return label;
  let i = RARITY_ORDER.indexOf(label);
  if (i < 0) i = RARITY_ORDER.length - 1;
  const j = Math.min(RARITY_ORDER.length - 1, i + steps);
  return RARITY_ORDER[j];
}

function applyRarityToConfig(cfg) {
  const dinos = cfg?.dinos || {};
  for (const d of Object.values(dinos)) {
    for (const entry of (d.entries || [])) {
      const base = rarityFromWeight(entry.weight ?? 0);
      const steps = downshiftStepsForMin(entry.bestSharedMin ?? 0);
      entry.rarity = downgradeRarity(base, steps);
    }
  }
}


// ============================================================
// DRAWING TUNING
// ============================================================
const BOX_TO_POINT_AREA_THRESHOLD = 18_000;
const BOX_TO_POINT_MIN_DIM = 40;

// ============================================================
// MAPS
// ============================================================
const MAPS = [
  { id: "The Island", file: "data/TheIsland.json" },
  { id: "The Center", file: "data/TheCenter.json" },
  { id: "Scorched Earth", file: "data/ScorchedEarth.json" },
  { id: "Valguero", file: "data/Valguero.json" },
  { id: "Ragnarok", file: "data/Ragnarok.json" },
  { id: "Lost Colony", file: "data/LostColony.json" },
  { id: "Extinction", file: "data/Extinction.json" },
  { id: "Aberration", file: "data/Aberration.json" },
  {
    id: "Astraeos",
    file: "data/Astraeos.json",
    backgrounds: [
      { id: "hand", label: "In Game",   url: "maps/astraeos_ingame.webp" },
      { id: "sat",  label: "Satellite", url: "maps/astraeos.webp" }
    ],
    defaultBg: "sat"
  }
];

let currentMapId = "";

// ============================================================
// SOURCES (Official + Mods)
// ============================================================
const SOURCES = [
  { id: "official", name: "Official" },
  { id: "runicwyverns", name: "Runic Wyverns", file: "data/mods/runicwyverns.json" },
];

let activeSourceId = "official";
let loadedMods = {}; // cache

// ============================================================
// STATE
// ============================================================
let mapObj = null;
let currentCfg = null;

// ============================================================
// MOD STYLE STATE (used by floating panel + drawing)
// ============================================================
let modDrawColor = "#ff0000";
let modDrawOpacity = 0.8;
let modGlowEnabled = true;

function redrawSelected() {
  const dinoSel = document.getElementById("dinoSelect");
  if (currentCfg && dinoSel?.value) {
    drawDino(currentCfg, dinoSel.value);
  }
}

// ============================================================
// HELPERS
// ============================================================
async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return await res.json();
}

function pickById(list, id) {
  return list.find(x => x.id === id) || list[0];
}

// ============================================================
// LEAFLET MAP INIT
// ============================================================
function initMap(cfg) {
  const w = cfg.imageSize.width;
  const h = cfg.imageSize.height;
  const bounds = [[0, 0], [h, w]];

  const map = L.map("map", {
    crs: L.CRS.Simple,
    minZoom: -3,
    maxZoom: 2,
    zoomSnap: 0.25,
    zoomDelta: 0.25,
    wheelPxPerZoomLevel: 120
  });

  const overlay = L.imageOverlay(cfg.image, bounds).addTo(map);

  map.fitBounds(bounds, { padding: [20, 20], maxZoom: -1 });
  map.setMaxBounds(bounds);
  map.options.maxBoundsViscosity = 1.0;

  const layer = L.layerGroup().addTo(map);
  const caveLayer = L.layerGroup().addTo(map);

  return { map, layer, caveLayer, overlay, bounds };
}


// ============================================================
// BACKGROUND DROPDOWN (if you still use it)
// ============================================================
function setupBackgroundDropdown(mapMeta, cfg) {
  const wrap = document.getElementById("bgSelectWrap");
  const sel = document.getElementById("bgSelect");
  if (!wrap || !sel || !mapObj) return;

  const bgs = mapMeta?.backgrounds;

  if (!bgs || !bgs.length) {
    wrap.style.display = "none";
    sel.innerHTML = "";
    mapObj.overlay.setUrl(cfg.image);
    return;
  }

  wrap.style.display = "";
  sel.innerHTML = "";

  for (const bg of bgs) {
    const opt = document.createElement("option");
    opt.value = bg.url;
    opt.textContent = bg.label;
    sel.appendChild(opt);
  }

  const defaultBg = bgs.find(x => x.id === mapMeta.defaultBg) || bgs[0];
  sel.value = defaultBg.url;
  mapObj.overlay.setUrl(sel.value);

  sel.onchange = () => mapObj.overlay.setUrl(sel.value);
}

function createFloatingPanel({ id, title, defaultPos = { right: 12, top: 12 } }) {
  const mapEl = document.getElementById("mapWrap");
  if (!mapEl) return null;

  // If it already exists, return it
  let panel = document.getElementById(id);
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = id;
  panel.className = "floating-panel";

  panel.innerHTML = `
    <div class="fp-header" data-drag-handle>
      <div class="fp-title">${title}</div>
      <div class="fp-actions">
        <button class="fp-btn" data-action="min" title="Collapse">▾</button>
        <button class="fp-btn" data-action="hide" title="Hide">✕</button>
      </div>
    </div>
    <div class="fp-body"></div>
  `;

  mapEl.appendChild(panel);

  // Initial position (top-right)
  panel.style.top = `${defaultPos.top}px`;
  panel.style.right = `${defaultPos.right}px`;

  // Prevent map dragging/zoom while interacting
  panel.addEventListener("pointerdown", (e) => e.stopPropagation());
  panel.addEventListener("wheel", (e) => e.stopPropagation(), { passive: false });

  // Hook buttons
  const body = panel.querySelector(".fp-body");
  panel.querySelector('[data-action="min"]').onclick = () => {
    const closed = body.style.display === "none";
    body.style.display = closed ? "" : "none";
    panel.classList.toggle("collapsed", !closed);
  };
  panel.querySelector('[data-action="hide"]').onclick = () => {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
  };

  makePanelDraggable(panel);

  return panel;
}

function showPanel(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = "";
  el.dataset.hidden = "0";
}

function makePanelDraggable(panel) {
  const handle = panel.querySelector("[data-drag-handle]");
  if (!handle) return;

  let dragging = false;
  let startX = 0, startY = 0;
  let startLeft = 0, startTop = 0;

  const mapEl = document.getElementById("mapWrap") || document.getElementById("map");

  const ensureLeftTop = () => {
    // If we're still positioned by right/top, convert once
    if (panel.style.right && panel.style.right !== "auto") {
      const rect = panel.getBoundingClientRect();
      const mapRect = mapEl.getBoundingClientRect();
      panel.style.left = `${rect.left - mapRect.left}px`;
      panel.style.top  = `${rect.top  - mapRect.top}px`;
      panel.style.right = "auto";
    }
  };

  const onMove = (e) => {
    if (!dragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    const newLeft = startLeft + dx;
    const newTop  = startTop + dy;

    const map = mapEl.getBoundingClientRect();
    const p = panel.getBoundingClientRect();

    const maxLeft = map.width - p.width;
    const maxTop  = map.height - 40;

    panel.style.left = `${Math.max(0, Math.min(newLeft, maxLeft))}px`;
    panel.style.top  = `${Math.max(0, Math.min(newTop, maxTop))}px`;
  };

  const onUp = () => {
    dragging = false;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
  };

  handle.addEventListener("pointerdown", (e) => {
    ensureLeftTop();

    dragging = true;
    startX = e.clientX;
    startY = e.clientY;

    startLeft = parseFloat(panel.style.left || "0");
    startTop  = parseFloat(panel.style.top  || "0");

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  });
}
//===============DinoInfoPanel===============


let infoPanel = null;
let stylePanel = null;

// per-dino entry visibility toggles
let entryVisibility = {}; // key: `${dinoKey}::${entryIndex}` => boolean

function ensurePanels() {
  if (!stylePanel) {
    stylePanel = createFloatingPanel({ id: "modStylePanel", title: "Mod Style", defaultPos: { right: 12, top: 12 } });
    renderModStylePanelBody();
  }

  if (!infoPanel) {
    infoPanel  = createFloatingPanel({ id: "dinoInfoPanel", title: "Dino Info", defaultPos: { right: 12, top: 250 } });
    renderInfoPanelBodyEmpty();
  }

  setModStylePanelVisible(activeSourceId !== "official");
}

function setModStylePanelVisible(show) {
  const el = document.getElementById("modStylePanel");
  if (!el) return;
  el.style.display = show ? "" : "none";
}

function renderModStylePanelBody() {
  const panel = document.getElementById("modStylePanel");
  if (!panel) return;
  const body = panel.querySelector(".fp-body");

  body.innerHTML = `
    <label class="fp-row">
      <span>Color</span>
      <input id="modColor2" type="color" value="${modDrawColor}">
    </label>

    <label class="fp-row fp-col">
      <div class="fp-row fp-between">
        <span>Opacity</span>
        <span id="modOpacityLabel2">${modDrawOpacity.toFixed(2)}</span>
      </div>
      <input id="modOpacity2" type="range" min="0.1" max="1" step="0.05" value="${modDrawOpacity}">
    </label>

    <label class="fp-row">
      <input id="modGlow2" type="checkbox" ${modGlowEnabled ? "checked" : ""}>
      <span>Glow</span>
    </label>
  `;

  const c = document.getElementById("modColor2");
  const o = document.getElementById("modOpacity2");
  const ol = document.getElementById("modOpacityLabel2");
  const g = document.getElementById("modGlow2");

  if (c) c.oninput = () => { modDrawColor = c.value; redrawSelected(); };
  if (o) o.oninput = () => { modDrawOpacity = Number(o.value); if (ol) ol.textContent = modDrawOpacity.toFixed(2); redrawSelected(); };
  if (g) g.onchange = () => { modGlowEnabled = g.checked; redrawSelected(); };
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

function renderInfoPanelForDino(cfg, dinoKey) {
  const panel = document.getElementById("dinoInfoPanel");
  if (!panel) return;
  const body = panel.querySelector(".fp-body");

  const d = cfg?.dinos?.[dinoKey];
  if (!d) {
    renderInfoPanelBodyEmpty();
    return;
  }

  const displayName = d.displayName || dinoKey;
  const bp = d.bpPath || "";
  const nameTag = d.nametag || d.nameTag || ""; // if you add it later

  const entries = d.entries || [];

  body.innerHTML = `
    <div class="info-section">
      <div class="info-title">${escapeHtml(displayName)}</div>

      <div class="info-row">
        <span class="info-label">Blueprint</span>
        <button class="info-copy" data-copy="${escapeAttr(bp)}">Copy</button>
      </div>
      <div class="info-mono">${escapeHtml(bp || "(none)")}</div>

      <div class="info-row">
        <span class="info-label">Nametag</span>
        <button class="info-copy" data-copy="${escapeAttr(nameTag)}">Copy</button>
      </div>
      <div class="info-mono">${escapeHtml(nameTag || "(none)")}</div>
    </div>

    <div class="info-section">
      <div class="info-subtitle">Spawn entries (${entries.length})</div>
      <div class="entries">
        ${entries.map((e, i) => renderEntryRow(e, dinoKey, i)).join("")}
      </div>
    </div>
  `;

  // hook copy buttons
  body.querySelectorAll(".info-copy").forEach(btn => {
    btn.onclick = () => copyText(btn.dataset.copy || "");
  });

  // hook entry toggles
  body.querySelectorAll('input[data-entry-toggle="1"]').forEach(chk => {
    chk.onchange = () => {
      const key = chk.dataset.key;
      entryVisibility[key] = chk.checked;
      redrawSelected();
    };
  });
}

function renderEntryRow(entry, dinoKey, idx) {
  const key = `${activeSourceId}::${currentMapId}::${dinoKey}::${idx}`;
  const visible = entryVisibility[key] ?? true;

  const entryClass = entry.entryClass || entry.entry || `Entry ${idx + 1}`;
  const groupWeight = entry.groupWeight ?? entry.group_weight ?? entry.weight ?? 0;
  const spawnLimit  = entry.spawnLimit  ?? entry.spawn_limit  ?? 0;

  const pct = (entry.percentChance != null) ? `${entry.percentChance.toFixed(2)}%` : "";

  return `
    <label class="entry-row">
      <input type="checkbox" data-entry-toggle="1" data-key="${escapeAttr(key)}" ${visible ? "checked" : ""}>
      <div class="entry-main">
        <div class="entry-name">${escapeHtml(entryClass)}</div>
        <div class="entry-meta">
          w=${fmt(groupWeight)} ${pct ? `• ${pct}` : ""} • limit=${fmt(spawnLimit)}
        </div>
      </div>
    </label>
  `;
}

function renderInfoPanelBodyEmpty() {
  const panel = document.getElementById("dinoInfoPanel");
  if (!panel) return;
  panel.querySelector(".fp-body").innerHTML = `<div style="color:var(--muted)">Select a dino to see details.</div>`;
}

function fmt(n) {
  const x = Number(n || 0);
  return (Math.round(x * 10000) / 10000).toString();
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, "&quot;"); }

function isEntryVisible(dinoKey, entryIndex) {
  const key = `${dinoKey}::${entryIndex}`;
  return entryVisibility[key] ?? true;
}


// ============================================================
// SOURCE DROPDOWN (top bar)
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

  sel.addEventListener("change", async () => {
    activeSourceId = sel.value;

    // Show/hide mod style panel immediately
    setModStylePanelVisible(activeSourceId !== "official");
    renderModStylePanelBody(); // keeps UI synced to current values

    // Reload map data for this source
    const mapSel = document.getElementById("mapSelect");
    const mapMeta = pickById(MAPS, mapSel?.value);
    await loadMapByMeta(mapMeta);
  });
}

async function loadModSource(sourceId) {
  const src = SOURCES.find(s => s.id === sourceId);
  if (!src || !src.file) return null;

  if (!loadedMods[sourceId]) {
    loadedMods[sourceId] = await loadJSON(src.file);
  }
  return loadedMods[sourceId];
}

// ============================================================
// MAP DROPDOWN (top bar)
// ============================================================
function setupMapDropdown() {
  const sel = document.getElementById("mapSelect");
  if (!sel) return;

  sel.innerHTML = "";
  for (const m of MAPS) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.id;
    sel.appendChild(opt);
  }

  sel.addEventListener("change", async () => {
    const mapMeta = pickById(MAPS, sel.value);
    await loadMapByMeta(mapMeta);
  });

  sel.value = MAPS[0].id;
}

// ============================================================
// MAIN LOAD
// ============================================================
async function loadMapByMeta(mapMeta) {
	currentMapId = mapMeta.id;
  const vanillaCfg = await loadJSON(mapMeta.file);

  let effectiveCfg = vanillaCfg;

  if (activeSourceId !== "official") {
    const modCfg = await loadModSource(activeSourceId);
    const modMap = modCfg?.maps?.[mapMeta.id];

    effectiveCfg = {
      ...vanillaCfg,
      dinos: modMap?.dinos || {}
    };
  }

  applyRarityToConfig(effectiveCfg);
  currentCfg = effectiveCfg;

  // Recreate Leaflet map
  if (mapObj) mapObj.map.remove();
  mapObj = initMap(currentCfg);

  // Panels need the map container to exist (and ideally map to be present)
  ensurePanels();
  setModStylePanelVisible(activeSourceId !== "official");
  renderModStylePanelBody(); // re-render so sliders match stored values

  setupBackgroundDropdown(mapMeta, currentCfg);

  setupDropdown(currentCfg, (dinoKey) => {
    drawDino(currentCfg, dinoKey);
    renderInfoPanelForDino(currentCfg, dinoKey);
  });
}

// ============================================================
// DRAWING
// ============================================================
function isTinyBox(box) {
  const area = (box.w || 0) * (box.h || 0);
  if (area > 0 && area <= BOX_TO_POINT_AREA_THRESHOLD) return true;

  if (
    BOX_TO_POINT_MIN_DIM > 0 &&
    ((box.w || 0) <= BOX_TO_POINT_MIN_DIM ||
     (box.h || 0) <= BOX_TO_POINT_MIN_DIM)
  ) return true;

  return false;
}

function rarityToColor(r) {
  const s = String(r || "").toLowerCase();
  if (s.includes("very rare")) return "#FF0000";
  if (s.includes("rare")) return "#FF6600";
  if (s.includes("very uncommon")) return "#FFCC00";
  if (s.includes("uncommon")) return "#FFFF00";
  if (s.includes("common")) return "#B2FF00";
  if (s.includes("very common")) return "#00FF00";
  return "#000000";
}

function drawDino(cfg, dinoKey) {
  if (!mapObj) return;

  mapObj.layer.clearLayers();
  mapObj.caveLayer.clearLayers();

  const dino = cfg.dinos?.[dinoKey];
  if (!dino) return;

  const isOfficial = (activeSourceId === "official");
  const entries = dino.entries || [];

  for (let i = 0; i < entries.length; i++) {
    if (!isEntryVisible(dinoKey, i)) continue;
    const entry = entries[i];

    const hasPoints = (entry.points && entry.points.length > 0);

    const isCave = entry.bIsCaveManager === true;
    const untame = entry.bForceUntameable === true;
    const targetLayer = isCave ? mapObj.caveLayer : mapObj.layer;

    const color = isOfficial ? rarityToColor(entry.rarity) : modDrawColor;

    // line thickness
    const baseWeight = isCave ? 3 : 1;
    const weight = (!isOfficial && modGlowEnabled) ? (baseWeight + 2) : baseWeight;

    // opacities
    const opacity = isOfficial
      ? (untame ? 0.80 : 1.0)
      : modDrawOpacity;

    const fillOpacity = isOfficial
      ? (untame ? 0.50 : (isCave ? 0.50 : 0.80))
      : opacity;

    // Boxes
    for (const box of (entry.boxes || [])) {
      if (hasPoints && isTinyBox(box)) {
        const cx = box.x + box.w / 2;
        const cy = box.y + box.h / 2;

        L.circleMarker([cy, cx], {
          color,
          weight,
          opacity,
          fillColor: color,
          radius: 4,
          fillOpacity
        }).addTo(targetLayer);

      } else {
        const y1 = box.y;
        const x1 = box.x;
        const y2 = box.y + box.h;
        const x2 = box.x + box.w;

        L.rectangle([[y1, x1], [y2, x2]], {
          color,
          weight,
          opacity,
          dashArray: (isOfficial && untame) ? "3 3" : null,
          fillColor: color,
          fillOpacity
        }).addTo(targetLayer);
      }
    }

    // Points
    for (const pt of (entry.points || [])) {
      L.circleMarker([pt.y, pt.x], {
        color,
        weight,
        opacity,
        fillColor: color,
        radius: 4,
        fillOpacity
      }).addTo(targetLayer);
    }
  }
}

// ============================================================
// DINO DROPDOWN
// ============================================================
function setupDropdown(cfg, onChange) {
  const sel = document.getElementById("dinoSelect");
  if (!sel) return null;

  const keys = Object.keys(cfg.dinos || {}).sort((a, b) => a.localeCompare(b));
  sel.innerHTML = "";

  if (!keys.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(No dinos for this selection)";
    sel.appendChild(opt);
	renderInfoPanelBodyEmpty();
    return sel;
  }

  for (const k of keys) {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = k;
    sel.appendChild(opt);
  }

  sel.onchange = () => onChange(sel.value);

  sel.value = keys[0];
  onChange(keys[0]);

  return sel;
}

// ============================================================
// BOOT
// ============================================================
function boot() {
  setupSourceDropdown();
  setupMapDropdown();
  document.getElementById("controlsToggle")?.addEventListener("click", () => {
  document.getElementById("topbar")?.classList.toggle("show-controls");
  });

  document.getElementById("showPanelsBtn")?.addEventListener("click", () => {
    showPanel("modStylePanel");
    showPanel("dinoInfoPanel");
  });

  loadMapByMeta(MAPS[0]).catch(err => {
    console.error(err);
    alert(err.message || String(err));
  });
}

boot();