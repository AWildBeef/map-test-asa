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

// ============================================================
// MOD STYLE PANEL (Leaflet floating)
// ============================================================
let modPanelControl = null;

// single source of truth for mod styling:
let modDrawColor = "#ff0000";
let modDrawOpacity = 0.8;
let modGlowEnabled = true;

function setModPanelVisible(isVisible) {
  const el = document.querySelector(".mod-style-panel");
  if (!el) return;
  el.style.display = isVisible ? "" : "none";
}

function redrawSelected() {
  const dinoSel = document.getElementById("dinoSelect");
  if (currentCfg && dinoSel && dinoSel.value) {
    drawDino(currentCfg, dinoSel.value);
  }
}

function syncModPanelUIValues() {
  const colorInp = document.getElementById("modColor");
  const opInp = document.getElementById("modOpacity");
  const opLab = document.getElementById("modOpacityLabel");
  const glowChk = document.getElementById("modGlow");

  if (colorInp) colorInp.value = modDrawColor;
  if (opInp) opInp.value = String(modDrawOpacity);
  if (opLab) opLab.textContent = Number(modDrawOpacity).toFixed(2);
  if (glowChk) glowChk.checked = !!modGlowEnabled;
}

function wireModPanelInputs() {
  const colorInp = document.getElementById("modColor");
  const opInp = document.getElementById("modOpacity");
  const opLab = document.getElementById("modOpacityLabel");
  const glowChk = document.getElementById("modGlow");

  if (colorInp) {
    colorInp.oninput = () => {
      modDrawColor = colorInp.value;
      redrawSelected();
    };
  }

  if (opInp) {
    opInp.oninput = () => {
      modDrawOpacity = Number(opInp.value);
      if (opLab) opLab.textContent = modDrawOpacity.toFixed(2);
      redrawSelected();
    };
  }

  if (glowChk) {
    glowChk.onchange = () => {
      modGlowEnabled = glowChk.checked;
      redrawSelected();
    };
  }
}

function ensureModStylePanel(map) {
  if (modPanelControl) return; // already created for this map instance

  const Control = L.Control.extend({
    options: { position: "topright" },

    onAdd: function () {
      const div = L.DomUtil.create("div", "mod-style-panel leaflet-bar");
      div.innerHTML = `
        <div class="panel-header">
          <span>Mod Style</span>
          <button id="modPanelToggle" type="button">▾</button>
        </div>

        <div id="modPanelBody">
          <label class="row">
            <span>Color</span>
            <input id="modColor" type="color" value="#ff0000">
          </label>

          <label class="row col">
            <div class="row between">
              <span>Opacity</span>
              <span id="modOpacityLabel">0.80</span>
            </div>
            <input id="modOpacity" type="range" min="0.1" max="1" step="0.05" value="0.8">
          </label>

          <label class="row">
            <input type="checkbox" id="modGlow" checked>
            <span>Glow</span>
          </label>
        </div>
      `;

      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    }
  });

  modPanelControl = new Control();
  modPanelControl.addTo(map);

  // collapse toggle
  const btn = document.getElementById("modPanelToggle");
  const body = document.getElementById("modPanelBody");
  if (btn && body) {
    btn.onclick = () => {
      const closed = body.style.display === "none";
      body.style.display = closed ? "" : "none";
      btn.textContent = closed ? "▾" : "▸";
      div.classList.toggle("collapsed", !closed);
    };
  }

  wireModPanelInputs();
  syncModPanelUIValues();
  setModPanelVisible(activeSourceId !== "official");
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

    // show/hide panel immediately (if it exists)
    setModPanelVisible(activeSourceId !== "official");
    syncModPanelUIValues();

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

  if (mapObj) mapObj.map.remove();
  mapObj = initMap(currentCfg);

  // new map instance => new control instance
  modPanelControl = null;
  ensureModStylePanel(mapObj.map);

  setupBackgroundDropdown(mapMeta, currentCfg);

  setupDropdown(currentCfg, (dinoKey) => drawDino(currentCfg, dinoKey));
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

  for (const entry of (dino.entries || [])) {
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

  loadMapByMeta(MAPS[0]).catch(err => {
    console.error(err);
    alert(err.message || String(err));
  });
}

boot();