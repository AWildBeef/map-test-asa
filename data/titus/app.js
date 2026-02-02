// ============================================================
// RARITY TUNING (edit these whenever)
// ============================================================
const RARITY_THRESHOLDS = [
  [0.01,   "very common"],
  [0.002,   "common"],
  [0.0007,   "uncommon"],
  [0.0004,  "very uncommon"],
  [0.00006, "rare"],
  [-1,     "very rare"],
];

// Extra downshift based on how "underspawned" a manager is vs bestSharedMin.
// Tune thresholds however you like.
function downshiftStepsForMinPct(pct) {
  const p = Number(pct || 1);
  if (p >= 0.75) return 0;
  if (p >= 0.50) return 1;
  if (p >= 0.30) return 2;
  if (p >= 0.20) return 3;
  return 4;
}


const RARITY_ORDER = ["very common", "common", "uncommon", "very uncommon", "rare", "very rare"];

const MIN_GLOBAL_DOWNSHIFT = [
  [3,  6],
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

      // Prefer exporter-provided global downshift
      const globalSteps =
        (entry.minRarityDownshift != null)
          ? Number(entry.minRarityDownshift || 0)
          : downshiftStepsForMin(entry.bestSharedMin ?? 0);

      entry.rarity = downgradeRarity(base, globalSteps);
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

// ============================================================
// SOURCES (Official + Mods)
// ============================================================
const SOURCES = [
  { id: "official", name: "Official" },
  { id: "runicwyverns", name: "Runic Wyverns", file: "data/mods/RunicWyverns.json" },
  { id: "ARKOLOGYOEHapipalus", name: "ARKOLOGY: OE - Hapipalus", file: "data/mods/ARKOLOGYOEHapipalus.json" },
];

// ============================================================
// STATE
// ============================================================
let currentMapId = "";
let activeSourceId = "official";
let loadedMods = {}; // cache

let mapObj = null;
let currentCfg = null;

// Mode: "dino" or "entry"
let currentViewMode = "dino";

// entryClass -> array of { dinoKey, entry, entryIndex }
let entryIndex = {};

const jsonCache = {};

async function loadJSON(path) {
  if (jsonCache[path]) return jsonCache[path];
  const res = await fetch(path, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  const data = await res.json();
  jsonCache[path] = data;
  return data;
}
// ============================================================
// MOD STYLE STATE (used by floating panel + drawing)
// ============================================================
let modDrawColor = "#00ff00";
let modDrawOpacity = 0.8;
let modGlowEnabled = false;

// per-dino entry visibility toggles
let entryVisibility = {}; // key: `${sourceId}::${mapId}::${dinoKey}::${entryIndex}` => boolean

// ============================================================
// HELPERS
// ============================================================


function pickById(list, id) {
  return list.find(x => x.id === id) || list[0];
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

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function syncModeBtn() {
  const b = document.getElementById("modeToggle");
  if (!b) return;
  b.dataset.mode = currentViewMode;
  b.textContent = (currentViewMode === "dino") ? "Dino mode" : "Spawn mode";
}

function isEntryVisible(dinoKey, entryIndexNum) {
  const key = `${activeSourceId}::${currentMapId}::${dinoKey}::${entryIndexNum}`;
  return entryVisibility[key] ?? true;
}

function redrawSelected() {
  const sel = document.getElementById("dinoSelect");
  if (!currentCfg || !sel?.value) return;

  if (currentViewMode === "dino") {
    drawDino(currentCfg, sel.value);
    renderInfoPanelForDino(currentCfg, sel.value);
  } else {
    drawSpawnEntry(currentCfg, sel.value);
    // later: renderInfoPanelForEntry(...)
  }
}

function preloadImage(url) {
  if (!url) return;

  const img = new Image();
  img.decoding = "async";
  img.loading = "eager";           // hint: do it now
  img.referrerPolicy = "no-referrer"; // safe default
  img.src = url;
}

async function preloadMapAssets() {
  // 1) Load each map's JSON (uses your cached loadJSON)
  for (const m of MAPS) {
    try {
      const cfg = await loadJSON(m.file);

      // Preload the main map image from the JSON
      preloadImage(cfg.image);

      // Preload any alternate backgrounds defined in MAPS
      if (Array.isArray(m.backgrounds)) {
        for (const bg of m.backgrounds) preloadImage(bg.url);
      }
    } catch (e) {
      console.warn("Preload failed for", m.id, e);
    }
  }
}


// ============================================================
// Meta lines (3 lines: weight / max / chances)
// ============================================================
function buildEntryMetaLines(entry) {
  const lines = [];

  // Prefer exporter-provided display text
  const disp = entry?.display;
  if (disp) {
    if (disp.weightText) lines.push(disp.weightText);
    if (disp.limitText)  lines.push(disp.limitText);
    if (disp.chanceText) lines.push(disp.chanceText);
    return lines;
  }

  // fallback
  const gw  = entry.groupWeight ?? entry.group_weight;
  const lim = entry.spawnLimit  ?? entry.spawn_limit;

  if (gw != null) lines.push(`Weight: ${fmt(gw)}`);
  if (lim != null) lines.push(`Max spawn: ${fmt(Number(lim) * 100)}%`);

  const chances = entry.spawnChances ?? entry.spawn_chances;
  if (Array.isArray(chances) && chances.length) {
    lines.push(`Spawn chances: ${chances.map(n => `${fmt(n)}%`).join(", ")}`);
  } else if (typeof chances === "string" && chances.trim()) {
    const parts = chances.split(",").map(s => s.trim()).filter(Boolean);
    if (parts.length) lines.push(`Spawn chances: ${parts.map(p => `${p}%`).join(", ")}`);
  }

  return lines;
}

// ============================================================
// Geometry helpers (NEW managers format + fallback)
// ============================================================
function preprocessCfg(cfg) {
  const dinos = cfg?.dinos || {};
  for (const d of Object.values(dinos)) {
    for (const e of (d.entries || [])) {
      const mgrs = e?.managers && typeof e.managers === "object" ? e.managers : null;

      // entry-level flags cached once
      const isCave = (e.bIsCaveManager === true);
      const untame = (e.bForceUntameable === true);

      if (mgrs) {
        e._mgrDraw = Object.entries(mgrs).map(([mgrId, mgr]) => {
          const pct =
            (mgr?.minDesiredPct != null)
              ? Number(mgr.minDesiredPct || 1)
              : (() => {
                  // fallback if pct isn't exported
                  const best = Number(e.bestSharedMin || 0);
                  const mmin = Number(mgr?.minDesired || 0);
                  return (best > 0) ? (mmin / best) : 1;
                })();

          const extraSteps = downshiftStepsForMinPct(pct);

          return {
            mgrId,
            pct,
            rarity: downgradeRarity(e.rarity, extraSteps), // ✅ key line
            boxes: Array.isArray(mgr?.boxes) ? mgr.boxes : [],
            points: Array.isArray(mgr?.points) ? mgr.points : [],
            hasPoints: Array.isArray(mgr?.points) && mgr.points.length > 0,
            isCave,
            untame,
          };
        });

        // Optional: keep flattened caches too (handy for entry mode if you want)
        e._boxes = e._mgrDraw.flatMap(m => m.boxes);
        e._points = e._mgrDraw.flatMap(m => m.points);
        e._hasPoints = e._points.length > 0;
        e._isCave = isCave;
        e._untame = untame;

      } else {
        // no managers -> old fallback
        e._boxes = getEntryBoxes(e);
        e._points = getEntryPoints(e);
        e._hasPoints = e._points.length > 0;
        e._isCave = isCave;
        e._untame = untame;
      }
    }
  }
}

function getEntryBoxes(entry) {
  const mgrs = entry?.managers;
  if (mgrs && typeof mgrs === "object") {
    return Object.values(mgrs).flatMap(m => Array.isArray(m?.boxes) ? m.boxes : []);
  }
  return Array.isArray(entry?.boxes) ? entry.boxes : [];
}

function getEntryPoints(entry) {
  const mgrs = entry?.managers;
  if (mgrs && typeof mgrs === "object") {
    return Object.values(mgrs).flatMap(m => Array.isArray(m?.points) ? m.points : []);
  }
  return Array.isArray(entry?.points) ? entry.points : [];
}

// ============================================================
// Leaflet map init
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
    wheelPxPerZoomLevel: 120,
    zoomControl: false
  });

  L.control.zoom({ position: "bottomright" }).addTo(map);

  // Create overlay ONCE
  const overlay = L.imageOverlay(cfg.image, bounds).addTo(map);

  map.fitBounds(bounds, { padding: [20, 20], maxZoom: -1 });
  map.setMaxBounds(bounds);
  map.options.maxBoundsViscosity = 1.0;

  // Create layers ONCE
  const layer = L.layerGroup().addTo(map);
  const caveLayer = L.layerGroup().addTo(map);

  return { map, layer, caveLayer, overlay, bounds };
}

function updateMapForCfg(cfg) {
  if (!mapObj) return;

  const w = cfg.imageSize.width;
  const h = cfg.imageSize.height;
  const bounds = [[0, 0], [h, w]];

  // Clear drawn shapes
  mapObj.layer.clearLayers();
  mapObj.caveLayer.clearLayers();

  // Swap background image + its bounds
  mapObj.overlay.setUrl(cfg.image);
  mapObj.overlay.setBounds(bounds);

  // Update map constraints + view
  mapObj.map.setMaxBounds(bounds);
  mapObj.map.fitBounds(bounds, { padding: [20, 20], maxZoom: -1 });

  mapObj.bounds = bounds;
}

// ============================================================
// Background dropdown
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

// ============================================================
// Panels control button (Leaflet ☰)
// ============================================================
function addPanelsControl(map) {
  const PanelsControl = L.Control.extend({
    options: { position: "bottomright" },

    onAdd() {
      const container = L.DomUtil.create("div", "leaflet-bar leaflet-control");
      container.style.background = "rgba(30,30,30,0.85)";
      container.style.border = "1px solid rgba(255,255,255,0.15)";
      container.style.borderRadius = "6px";
      container.style.overflow = "hidden";

      const btn = L.DomUtil.create("a", "", container);
      btn.href = "#";
      btn.title = "Show panels";
      btn.innerHTML = "┇";
      btn.style.display = "block";
      btn.style.width = "30px";
      btn.style.height = "30px";
      btn.style.lineHeight = "30px";
      btn.style.textAlign = "center";
      btn.style.color = "white";
      btn.style.textDecoration = "none";

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      L.DomEvent.on(btn, "click", (e) => {
        L.DomEvent.preventDefault(e);
        showPanel("dinoInfoPanel");
        if (activeSourceId !== "official") showPanel("modStylePanel");
      });

      return container;
    }
  });

  map.addControl(new PanelsControl());
}

// ============================================================
// Build entry index
// ============================================================
function buildEntryIndex(cfg) {
  const idx = {};
  const dinos = cfg?.dinos || {};

  for (const [dinoKey, d] of Object.entries(dinos)) {
    const entries = d.entries || [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const entryClass = e.entryClass || e.entry;
      if (!entryClass) continue;
      (idx[entryClass] ||= []).push({ dinoKey, entry: e, entryIndex: i });
    }
  }
  return idx;
}

// ============================================================
// One dropdown slot: Dinos or Entries
// ============================================================
function setupMainSelect(cfg) {
  const sel = document.getElementById("dinoSelect");
  if (!sel) return;

  sel.innerHTML = "";

  if (currentViewMode === "dino") {
    const keys = Object.keys(cfg.dinos || {}).sort((a, b) => a.localeCompare(b));
    if (!keys.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "(No dinos)";
      sel.appendChild(opt);
      renderInfoPanelBodyEmpty();
      return;
    }

    for (const k of keys) {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = k;
      sel.appendChild(opt);
    }

    sel.onchange = () => {
      drawDino(cfg, sel.value);
      renderInfoPanelForDino(cfg, sel.value);
    };

    sel.value = keys[0];
    sel.onchange();

  } else {
    const keys = Object.keys(entryIndex || {}).sort((a, b) => a.localeCompare(b));
    if (!keys.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "(No spawn entries)";
      sel.appendChild(opt);
      return;
    }

    for (const k of keys) {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = k;
      sel.appendChild(opt);
    }

    // ---- ENTRY LIST ----
    sel.onchange = () => {
      drawSpawnEntry(cfg, sel.value);
      renderInfoPanelForEntry(cfg, sel.value);
    };

    sel.value = keys[0];
    sel.onchange();
  }
}

function setInfoPanelTitle(text) {
  const panel = document.getElementById("dinoInfoPanel");
  if (!panel) return;
  const t = panel.querySelector(".fp-title");
  if (t) t.textContent = text;
}

function setViewMode(mode) {
  currentViewMode = mode;
  syncModeBtn();

  setInfoPanelTitle(mode === "dino" ? "Dino Info" : "Spawn Entry Info");

  if (currentCfg) setupMainSelect(currentCfg);
}

function switchMode(nextMode) {
  setViewMode(nextMode);

  // After dropdown rebuild, redraw whatever is selected
  const sel = document.getElementById("dinoSelect");
  if (!sel?.value || !currentCfg) return;

  if (currentViewMode === "dino") {
    drawDino(currentCfg, sel.value);
    renderInfoPanelForDino(currentCfg, sel.value);
  } else {
    drawSpawnEntry(currentCfg, sel.value);
    renderInfoPanelForEntry(currentCfg, sel.value);
  }
}

// ============================================================
// SOURCES dropdown
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
    setModStylePanelVisible(activeSourceId !== "official");
    renderModStylePanelBody();

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
// MAP dropdown
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

  // 1) Load base map JSON (cached if you kept the cached loadJSON)
  const vanillaCfg = await loadJSON(mapMeta.file);
  let effectiveCfg = vanillaCfg;

  // 2) If mod source, swap dinos from mod map
  if (activeSourceId !== "official") {
    const modCfg = await loadModSource(activeSourceId);
    const modMap = modCfg?.maps?.[mapMeta.id];
    effectiveCfg = { ...vanillaCfg, dinos: modMap?.dinos || {} };
  }

  // 3) Post-process config
  applyRarityToConfig(effectiveCfg);
  currentCfg = effectiveCfg;

  // Cache flattened geometry + flags once
  preprocessCfg(currentCfg);

  // Build entry index (needed for Entry mode)
  entryIndex = buildEntryIndex(currentCfg);

  // 4) Create map ONCE; otherwise update it
  if (!mapObj) {
    mapObj = initMap(currentCfg);
    addPanelsControl(mapObj.map);     // add once
  } else {
    updateMapForCfg(currentCfg);      // fast path
  }

  // 5) Panels + background dropdown
  ensurePanels();
  setModStylePanelVisible(activeSourceId !== "official");
  renderModStylePanelBody();

  // If Astraeos has alternate bgs, keep your dropdown behavior:
  setupBackgroundDropdown(mapMeta, currentCfg);

  // 6) Populate the ONE dropdown slot based on mode (dino/entry)
  setupMainSelect(currentCfg);

  // 7) Keep mode button label correct
  syncModeBtn();
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
  if (s.includes("very uncommon")) return "#FFAA00";
  if (s.includes("uncommon")) return "#FFFF00";
  if (s.includes("common")) return "#CCFF00";
  if (s.includes("very common")) return "#00FF00";
  return "#000000";
}

function drawSpawnEntry(cfg, entryClass) {
  if (!mapObj) return;

  mapObj.layer.clearLayers();
  mapObj.caveLayer.clearLayers();

  const rows = entryIndex?.[entryClass] || [];
  if (!rows.length) return;

  const sample = rows[0].entry;

  // drawSpawnEntry(...)
  const boxes = sample._boxes ?? getEntryBoxes(sample);
  const points = sample._points ?? getEntryPoints(sample);
  const hasPoints = sample._hasPoints ?? (points.length > 0);

  const isOfficial = (activeSourceId === "official");

  const isCave = sample._isCave ?? (sample.bIsCaveManager === true);
  const untame = sample._untame ?? (sample.bForceUntameable === true);
  const targetLayer = isCave ? mapObj.caveLayer : mapObj.layer;

  // You can make this smarter later (multi-colored, etc). For now:
  const color = isOfficial ? "#00FF00" : modDrawColor;

  const baseWeight = isCave ? 3 : 1;
  const weight = (!isOfficial && modGlowEnabled) ? (baseWeight + 2) : baseWeight;

  const opacity = isOfficial ? (untame ? 0.80 : 1.0) : modDrawOpacity;
  const fillOpacity = isOfficial ? (untame ? 0.50 : (isCave ? 0.50 : 0.80)) : opacity;

  for (const box of boxes) {
    if (hasPoints && isTinyBox(box)) {
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      L.circleMarker([cy, cx], { color, weight, opacity, fillColor: color, radius: 4, fillOpacity })
        .addTo(targetLayer);
    } else {
      const y1 = box.y, x1 = box.x, y2 = box.y + box.h, x2 = box.x + box.w;
      L.rectangle([[y1, x1], [y2, x2]], {
        color, weight, opacity,
        dashArray: (isOfficial && untame) ? "3 3" : null,
        fillColor: color,
        fillOpacity
      }).addTo(targetLayer);
    }
  }

  for (const pt of points) {
    L.circleMarker([pt.y, pt.x], { color, weight, opacity, fillColor: color, radius: 4, fillOpacity })
      .addTo(targetLayer);
  }
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

    // ✅ If managers exist, draw each manager with its own rarity
    if (Array.isArray(entry._mgrDraw) && entry._mgrDraw.length) {
      for (const m of entry._mgrDraw) {
        const targetLayer = m.isCave ? mapObj.caveLayer : mapObj.layer;

        const color = isOfficial ? rarityToColor(m.rarity) : modDrawColor;

        const baseWeight = m.isCave ? 3 : 1;
        const weight = (!isOfficial && modGlowEnabled) ? (baseWeight + 2) : baseWeight;

        const opacity = isOfficial ? (m.untame ? 0.80 : 1.0) : modDrawOpacity;
        const fillOpacity = isOfficial ? (m.untame ? 0.50 : (m.isCave ? 0.50 : 0.80)) : opacity;

        const boxes = m.boxes || [];
        const points = m.points || [];
        const hasPoints = m.hasPoints || (points.length > 0);

        for (const box of boxes) {
          if (hasPoints && isTinyBox(box)) {
            const cx = box.x + box.w / 2;
            const cy = box.y + box.h / 2;
            L.circleMarker([cy, cx], { color, weight, opacity, fillColor: color, radius: 4, fillOpacity })
              .addTo(targetLayer);
          } else {
            const y1 = box.y, x1 = box.x, y2 = box.y + box.h, x2 = box.x + box.w;
            L.rectangle([[y1, x1], [y2, x2]], {
              color, weight, opacity,
              dashArray: (isOfficial && m.untame) ? "3 3" : null,
              fillColor: color,
              fillOpacity
            }).addTo(targetLayer);
          }
        }

        for (const pt of points) {
          L.circleMarker([pt.y, pt.x], { color, weight, opacity, fillColor: color, radius: 4, fillOpacity })
            .addTo(targetLayer);
        }
      }

      continue; // ✅ done with this entry
    }

    // ----- Fallback: no managers -----
    const boxes = entry._boxes ?? getEntryBoxes(entry);
    const points = entry._points ?? getEntryPoints(entry);
    const hasPoints = entry._hasPoints ?? (points.length > 0);

    const isCave = entry._isCave ?? (entry.bIsCaveManager === true);
    const untame = entry._untame ?? (entry.bForceUntameable === true);
    const targetLayer = isCave ? mapObj.caveLayer : mapObj.layer;

    const color = isOfficial ? rarityToColor(entry.rarity) : modDrawColor;

    const baseWeight = isCave ? 3 : 1;
    const weight = (!isOfficial && modGlowEnabled) ? (baseWeight + 2) : baseWeight;

    const opacity = isOfficial ? (untame ? 0.80 : 1.0) : modDrawOpacity;
    const fillOpacity = isOfficial ? (untame ? 0.50 : (isCave ? 0.50 : 0.80)) : opacity;

    for (const box of boxes) {
      if (hasPoints && isTinyBox(box)) {
        const cx = box.x + box.w / 2;
        const cy = box.y + box.h / 2;
        L.circleMarker([cy, cx], { color, weight, opacity, fillColor: color, radius: 4, fillOpacity })
          .addTo(targetLayer);
      } else {
        const y1 = box.y, x1 = box.x, y2 = box.y + box.h, x2 = box.x + box.w;
        L.rectangle([[y1, x1], [y2, x2]], {
          color, weight, opacity,
          dashArray: (isOfficial && untame) ? "3 3" : null,
          fillColor: color,
          fillOpacity
        }).addTo(targetLayer);
      }
    }

    for (const pt of points) {
      L.circleMarker([pt.y, pt.x], { color, weight, opacity, fillColor: color, radius: 4, fillOpacity })
        .addTo(targetLayer);
    }
  }
}

// ============================================================
// FLOATING PANELS (Dino Info + Mod Style)
// ============================================================
let infoPanel = null;
let stylePanel = null;

function createFloatingPanel({ id, title, defaultPos = { right: 12, top: 12 }, collapsedByDefault = false }) {
  const mapEl = document.getElementById("mapWrap");
  if (!mapEl) return null;

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

  if (collapsedByDefault) {
    panel.classList.add("collapsed");
    const body = panel.querySelector(".fp-body");
    if (body) body.style.display = "none";
  }

  panel.style.top = `${defaultPos.top}px`;
  panel.style.right = `${defaultPos.right}px`;

  // prevent map interactions while interacting with panel
  panel.addEventListener("pointerdown", (e) => e.stopPropagation());
  panel.addEventListener("wheel", (e) => e.stopPropagation(), { passive: false });

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

let redrawQueued = false;
function requestRedraw() {
  if (redrawQueued) return;
  redrawQueued = true;
  requestAnimationFrame(() => {
    redrawQueued = false;
    redrawSelected();
  });
}


function ensurePanels() {
  if (!stylePanel) {
    stylePanel = createFloatingPanel({
      id: "modStylePanel",
      title: "Mod Style",
      defaultPos: { right: 2, top: 2 },
      collapsedByDefault: true
    });
    renderModStylePanelBody();
  }

  if (!infoPanel) {
    infoPanel = createFloatingPanel({
      id: "dinoInfoPanel",
      title: "Dino Info",
      defaultPos: { right: 218, top: 2 },
      collapsedByDefault: true
    });
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
  if (o) o.oninput = () => {
    modDrawOpacity = Number(o.value);
    if (ol) ol.textContent = modDrawOpacity.toFixed(2);
    requestRedraw();
  };
  if (g) g.onchange = () => { modGlowEnabled = g.checked; redrawSelected(); };
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

function renderInfoPanelBodyEmpty() {
  const panel = document.getElementById("dinoInfoPanel");
  if (!panel) return;
  panel.querySelector(".fp-body").innerHTML =
    `<div style="color:var(--muted)">Select a dino to see details.</div>`;
}

function renderInfoPanelForEntry(cfg, entryClass) {
  const panel = document.getElementById("dinoInfoPanel"); // keep same panel
  if (!panel) return;
  const body = panel.querySelector(".fp-body");

  const rows = entryIndex?.[entryClass] || [];
  if (!rows.length) {
    body.innerHTML = `<div style="color:var(--muted)">No data for this spawn entry.</div>`;
    return;
  }

  // Group by dinoKey so if the same dino appears multiple times (rare), we can show multiple rows
  const byDino = new Map();
  for (const r of rows) {
    if (!byDino.has(r.dinoKey)) byDino.set(r.dinoKey, []);
    byDino.get(r.dinoKey).push(r);
  }

  // Optional: sort dinos by display name (or by total weight)
  const dinoKeys = Array.from(byDino.keys()).sort((a, b) => {
    const an = cfg?.dinos?.[a]?.displayName || a;
    const bn = cfg?.dinos?.[b]?.displayName || b;
    return an.localeCompare(bn);
  });

  body.innerHTML = `
    <div class="info-section">
      <div class="info-title">${escapeHtml(entryClass)}</div>

      <div class="info-row">
        <span class="info-label">Entry class</span>
        <button class="info-copy" data-copy="${escapeAttr(entryClass)}"aria-label="Copy"></button>
      </div>
      <div class="info-mono">${escapeHtml(entryClass)}</div>
    </div>

    <div class="info-section">
      <div class="info-subtitle">Dinos (${dinoKeys.length})</div>
      <div class="entries">
        ${dinoKeys.map(dinoKey => renderEntryDinoBlock(cfg, dinoKey, byDino.get(dinoKey))).join("")}
      </div>
    </div>
  `;

  // hook copy buttons
  body.querySelectorAll(".info-copy").forEach(btn => {
    btn.onclick = () => copyText(btn.dataset.copy || "");
  });
}

function renderEntryDinoBlock(cfg, dinoKey, rowsForThisDino) {
  const d = cfg?.dinos?.[dinoKey];
  const displayName = d?.displayName || dinoKey;
  const bp = d?.bpPath || "";
  const nameTag = d?.nameTag || d?.nametag || "";

  // If the same dino has multiple entry objects for this entryClass, list them all
  const entryLinesHtml = rowsForThisDino.map((r) => {
    const e = r.entry;
    const metaLines = buildEntryMetaLines(e);

    return `
      <div class="entry-meta" style="margin-top:4px;">
        ${metaLines.map(line => `<div class="entry-meta-line">${escapeHtml(line)}</div>`).join("")}
      </div>
    `;
  }).join("");

  return `
    <div class="info-section" style="padding-bottom:8px;">
      <div class="info-row">
        <span class="info-label">${escapeHtml(displayName)}</span>
        <button class="info-copy" data-copy="${escapeAttr(bp || nameTag || displayName)}"aria-label="Copy"></button>
      </div>
      ${bp ? `<div class="info-mono">${escapeHtml(bp)}</div>` : ``}
      ${nameTag ? `<div class="info-mono" style="margin-top:4px;">${escapeHtml(nameTag)}</div>` : ``}
      ${entryLinesHtml}
    </div>
  `;
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
  const nameTag = d.nameTag || d.nametag || "";

  const entries = d.entries || [];

  body.innerHTML = `
    <div class="info-section">
      <div class="info-title">${escapeHtml(displayName)}</div>

      <div class="info-row">
        <span class="info-label">Blueprint</span>
        <button class="info-copy" data-copy="${escapeAttr(bp)}"aria-label="Copy"></button>
      </div>
      <div class="info-mono">${escapeHtml(bp || "(none)")}</div>

      <div class="info-row">
        <span class="info-label">Nametag</span>
        <button class="info-copy" data-copy="${escapeAttr(nameTag)}"aria-label="Copy"></button>
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

  body.querySelectorAll(".info-copy").forEach(btn => {
    btn.onclick = () => copyText(btn.dataset.copy || "");
  });

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
  const metaLines = buildEntryMetaLines(entry);

  return `
    <label class="entry-row">
      <input
        type="checkbox"
        data-entry-toggle="1"
        data-key="${escapeAttr(key)}"
        ${visible ? "checked" : ""}
      >
      <div class="entry-main">
        <div class="entry-name">${escapeHtml(entryClass)}</div>
        <div class="entry-meta">
          ${metaLines.map(line => `<div class="entry-meta-line">${escapeHtml(line)}</div>`).join("")}
        </div>
      </div>
    </label>
  `;
}

// ============================================================
// BOOT
// ============================================================
function boot() {
  setupSourceDropdown();
  setupMapDropdown();

  // kick off preloading (don’t await — it runs in background)
  preloadMapAssets();

  document.getElementById("controlsToggle")?.addEventListener("click", () => {
    document.getElementById("topbar")?.classList.toggle("show-controls");
  });

  document.getElementById("modeToggle")?.addEventListener("click", () => {
    const next = (currentViewMode === "dino") ? "entry" : "dino";
    switchMode(next);
  });

  syncModeBtn();
  loadMapByMeta(MAPS[0]).catch(err => {
    console.error(err);
    alert(err.message || String(err));
  });
}

boot();