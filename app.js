// ============================================================
// RARITY TUNING (edit these whenever)
// ============================================================
const ASSET_VER = "dev-2026-02-02-G";

const RARITY_THRESHOLDS = [
  [0.03,   "very common"],
  [0.009,   "common"],
  [0.005,   "uncommon"],
  [0.0009,  "very uncommon"],
  [0.0001, "rare"],
  [-1,     "very rare"],
];

// Extra downshift based on how "underspawned" a manager is vs bestSharedMin.
// Tune thresholds however you like.
function downshiftStepsForMinPct(pct) {
  const p = Number(pct || 1);
  if (p >= 0.51) return 0;
  return 1;
}


const RARITY_ORDER = ["very common", "common", "uncommon", "very uncommon", "rare", "very rare"];

const MIN_GLOBAL_DOWNSHIFT = [
  [3,  6],
];

function fitOptionsForUI() {
  const isMobile = window.innerWidth <= 640;

  // measure real UI heights (safe if null)
  const topbarH = document.getElementById("topbar")?.offsetHeight ?? 0;

  // estimate bottom controls / toolbar area
  // (you can also measure your custom toolbar div if you add one)
  const bottomSafe = isMobile ? 70 : 40;

  // X padding (left/right)
  const padX = isMobile ? 6 : 20;

  // Y padding: less on top, more on bottom
  const padTop = isMobile ? 6 : 10;
  const padBottom = isMobile ? Math.max(bottomSafe, 60) : 20;

  return {
    maxZoom: -1,
    paddingTopLeft:    [padX, padTop + Math.min(topbarH, 120) * 0.0], // keep 0.0 unless you want topbar to influence fit
    paddingBottomRight:[padX, padBottom]
  };
}

function rarityFromWeight(w) {
  const eff = Number(w || 0);
  for (const [thr, name] of RARITY_THRESHOLDS) {
    if (eff >= thr) return name;
  }
  return "very rare";
}

function downshiftStepsForTotalMin(totalMin) {
  const m = Number(totalMin || 0);
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

function normalizePoiType(type) {
  const raw = String(type || "").toLowerCase();
  if (raw.includes("obelisk") && raw.includes("blue")) return "obelisk_blue";
  if (raw.includes("obelisk") && raw.includes("green")) return "obelisk_green";
  if (raw.includes("obelisk") && raw.includes("red")) return "obelisk_red";
  if (raw.includes("tekcave")) return "tekcave";
  return raw;
}
// ============================================================
// SUPPLY CRATE TEST

let showSupplyCrates = false;
let supplyCrateData = null;        // can be "old" summary OR compact {t,p}
let supplyCrateLayer = null;       // Leaflet layer group (still unused; you use mapObj.supplyLayer)

function clamp01(v){ return Math.max(0, Math.min(1, v)); }

// world (ARK) -> map pixel (Leaflet CRS.Simple)
function worldToMapPixel(p, world) {
  const w = world?.w ?? 0;
  const h = world?.h ?? 0;

  const lonOrigin = world?.lonOrigin;
  const lonScale  = world?.lonScale;
  const latOrigin = world?.latOrigin;
  const latScale  = world?.latScale;

  if (![w,h,lonOrigin,lonScale,latOrigin,latScale].every(Number.isFinite)) return null;

  const nx = (Number(p.x) - lonOrigin) / (lonScale * 1000);
  const ny = (Number(p.y) - latOrigin) / (latScale * 1000);

  const x = clamp01(nx) * w;
  const y = (1 - clamp01(ny)) * h;   // flip Y for Leaflet

  return { x, y };
}






// ============================================================
const BOX_TO_POINT_AREA_THRESHOLD = 1_000;
const BOX_TO_POINT_MIN_DIM = 10;

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
      { id: "hand", label: "In Game",   url: "maps/Astraeos_IngameMap.webp" },
      { id: "sat",  label: "Satellite", url: "maps/astraeos.webp" }
    ],
    defaultBg: "sat"
  }
];

// ============================================================
// SOURCES (Official + Mods)
// ============================================================
let SOURCES = [];


async function buildSources() {
  const registry = await (await fetch("mods_registry.json")).json();

  const mods = (registry.mods || []).map(m => ({
    id: String(m.id),
    name: m.name,
    file: `data/mods/${m.slug}.json`,
    ...(m.group ? { group: m.group } : {})
  }));

  mods.sort((a,b)=>a.name.localeCompare(b.name));

  return [
    { id:"official", name:"Official", order:100 },
    ...mods
  ];
}

// ============================================================
// CURRENT RENDER CACHE (for smooth toggle redraws)
// ============================================================
let currentRender = {
  mode: null,       // "dino" | "entry"
  cfg: null,        // the cfg currently being drawn
  dinoKey: null,    // "__tmp__" in grouped dino view, real key in other cases
  entryClass: null, // entry mode selection
};

// ============================================================
// STATE
// ============================================================
let currentMapId = "";
let activeSourceId = "official";
let loadedMods = {}; // cache
let currentModMeta = null; // { id, name } from mod file, or null for official

let mapObj = null;
let currentCfg = null;

// Mode: "dino" or "entry"
let currentViewMode = "dino";

// entryClass -> array of { dinoKey, entry, entryIndex }
let entryIndex = {};

const lastSelection = {
  dino: {},   // { [sourceId]: dinoKey }
  entry: {},  // { [sourceId]: entryClass }
};

let showPois = true;  // default on

let currentNameToBps = null;   // Map(displayName -> [bp...])
let currentNames = null;       // [displayName...]

// Remember drill path per dropdown instance
const drillState = {
  // nativeId -> array of labels representing the folder path, e.g. ["Sources","Mods","Xyphias"]
  pathByNativeId: {}
};

let showRarityLegend = false;

function syncRarityLegendPopColors(){
  // now targets your centered legend
  const el = document.getElementById("rarityLegend");
  if (!el) return;

  el.querySelectorAll(".sq[data-r]").forEach(sq => {
    const r = sq.getAttribute("data-r");
    sq.style.background = rarityToColor(r);
  });
}

function setLegendOpen(open){
  showRarityLegend = !!open;

  const el = document.getElementById("rarityLegend");
  if (!el) return;

  // your HTML uses inline display:none, so flip display directly
  el.style.display = showRarityLegend ? "" : "none";
}

// ============================================================
// PLAYER START TEST

let showPlayerStarts = false;
let playerStartsData = null;     // loaded JSON
// uses mapObj.playerStartLayer (created in initMap)

function drawPlayerStarts() {
  if (!mapObj?.playerStartLayer) return;

  mapObj.playerStartLayer.clearLayers();
  if (!showPlayerStarts) return;
  if (!playerStartsData) return;

  // Your converted file can be either:
  //  A) { points:[{px,py,label,...}, ...] }
  //  B) { regions:{...} } (nested)
  // We'll support both quickly.

  const pts = [];

  if (Array.isArray(playerStartsData.points)) {
    pts.push(...playerStartsData.points);
  } else if (playerStartsData.regions && typeof playerStartsData.regions === "object") {
    for (const [regionName, region] of Object.entries(playerStartsData.regions)) {
      for (const p of (region?.points || [])) {
        pts.push({ ...p, _region: regionName });
      }
    }
  }

  for (const p of pts) {
    const x = Number(p.px ?? p.x);
    const y = Number(p.py ?? p.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    const title =
      p.label ||
      p.name ||
      p.id ||
      p._region ||
      "Player Start";

    L.circleMarker([y, x], {
      radius: 3,
      weight: 1,
      opacity: 1,
      fillOpacity: 0.85
    })
      .addTo(mapObj.playerStartLayer)
      .bindTooltip(title, { direction: "top", opacity: 0.95 });
  }
}

// ============================================================
// INFO PANEL TABS (Dino panel only for now)
// ============================================================
let infoTab = "spawns"; // "info" | "spawns" | "loot" | "stats"

const INFO_TABS = [
  { id: "spawns", label: "Spawns" },
  { id: "stats",  label: "Stats" },
  { id: "loot",   label: "Loot" },
  { id: "info",   label: "Info" },
];

function setInfoTab(id){
  const order = INFO_TABS.map(t => t.id);
  const next = order.includes(id) ? id : "info";
  infoTab = next;

  const panel = document.getElementById("dinoInfoPanel");
  const body  = panel?.querySelector(".fp-body");
  if (!body) return;

  // tabs
  body.querySelectorAll(".fp-tab").forEach(b => {
    b.classList.toggle("is-on", b.dataset.tab === infoTab);
  });

  // dots
  body.querySelectorAll(".fp-dot").forEach(d => {
    d.classList.toggle("is-on", d.dataset.dot === infoTab);
  });

  // slide animation
  const track = body.querySelector(".fp-track");
  if (track) {
    const i = Math.max(0, order.indexOf(infoTab));
    track.style.transform = `translateX(${-i * 100}%)`;
  }
}

function mountInfoSwipe(el){
  if (!el) return;

  // Prevent Leaflet from eating gestures inside this region
  try {
    L?.DomEvent?.disableClickPropagation?.(el);
    L?.DomEvent?.disableScrollPropagation?.(el);
  } catch {}

  const order = INFO_TABS.map(t => t.id);

  const EDGE_GUARD_PX = 22;  // leave this for iOS "back" swipe
  const SWIPE_MIN_PX  = 40;  // distance threshold
  const SWIPE_MAX_Y   = 60;  // if vertical movement is bigger than this, bail

  let sx = 0, sy = 0;
  let tracking = false;
  let decided = false;
  let isHorizontal = false;

  function idxOf(tab){ return Math.max(0, order.indexOf(tab)); }

  el.addEventListener("touchstart", (e) => {
    if (!e.touches || e.touches.length !== 1) return;

    const t = e.touches[0];

    // If they start near the left edge, don't fight iOS back gesture
    if (t.clientX <= EDGE_GUARD_PX) {
      tracking = false;
      return;
    }

    tracking = true;
    decided = false;
    isHorizontal = false;
    sx = t.clientX;
    sy = t.clientY;
  }, { passive: true });

  el.addEventListener("touchmove", (e) => {
    if (!tracking || !e.touches || e.touches.length !== 1) return;

    const t = e.touches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;

    if (!decided) {
      // decide intent once
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        decided = true;
        isHorizontal = Math.abs(dx) > Math.abs(dy);
      }
    }

    // If horizontal swipe, prevent page from treating it as scroll/back
    if (decided && isHorizontal) {
      e.preventDefault(); // requires passive:false
    }
  }, { passive: false });

  el.addEventListener("touchend", (e) => {
    if (!tracking) return;
    tracking = false;

    // touchend has changedTouches
    const t = e.changedTouches?.[0];
    if (!t) return;

    const dx = t.clientX - sx;
    const dy = t.clientY - sy;

    if (Math.abs(dy) > SWIPE_MAX_Y) return;
    if (Math.abs(dx) < SWIPE_MIN_PX) return;

    const i = idxOf(infoTab);

    // dx < 0 => swipe left => next page
    // dx > 0 => swipe right => previous page
    const nextIndex = (dx < 0)
      ? (i + 1) % order.length
      : (i - 1 + order.length) % order.length;

    setInfoTab(order[nextIndex]);
  }, { passive: true });
}

// ============================================================
// SETTINGS
// ============================================================
let useRarityForMods = true; // default; set to false if you want "mod style" by default

const jsonCache = {};

async function loadJSON(path) {
  const url = `${path}?v=${ASSET_VER}`;

  if (jsonCache[url]) return jsonCache[url];

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);

  const data = await res.json();
  jsonCache[url] = data;
  return data;
}
// ============================================================
// MOD STYLE STATE (used by floating panel + drawing)
// ============================================================
let modDrawColor = "#00ff55";
let modDrawOpacity = 0.8;
let modGlowEnabled = false;

// per-dino entry visibility toggles
let entryVisibility = {}; // key: `${sourceId}::${mapId}::${dinoKey}::${entryIndex}` => boolean

// ============================================================
// ATLAS DEV MODE -- Live CSS Injector
// ============================================================

(function () {

  // create style tag once
  const style = document.createElement("style");
  style.id = "atlas-dev-css";
  document.head.appendChild(style);

  // global helper
  window.devCSS = function(cssText) {
    style.textContent = cssText;
  };

})();

(function () {

  const panel = document.createElement("div");
  panel.id = "atlas-dev-panel";

  panel.innerHTML = `
    <div class="atlas-dev-header">⚙ Dev CSS</div>
    <textarea spellcheck="false"></textarea>
  `;

  document.body.appendChild(panel);

  const textarea = panel.querySelector("textarea");

  textarea.addEventListener("input", () => {
    devCSS(textarea.value);
  });

})();

(function () {

  let taps = 0;
  let timer;

  document.addEventListener("click", () => {
    taps++;

    clearTimeout(timer);
    timer = setTimeout(() => taps = 0, 400);

    if (taps === 3) {
      document
        .getElementById("atlas-dev-panel")
        .classList.toggle("open");

      taps = 0;
    }
  });

})();

// ============================================================
// HELPERS
// ============================================================

function cleanName(s){
  const x = String(s ?? "").trim();
  return x.length ? x : "";
}

function labelsForDino(d){
  const f = cleanName(d?.fName);
  const m = cleanName(d?.mName);
  const disp = cleanName(d?.displayName);

  // If we have sex names, ONLY use those (no displayName)
  const out = [];
  if (f) out.push(f);
  if (m && m.toLowerCase() !== f.toLowerCase()) out.push(m);

  if (out.length) return out;

  // fallback
  return disp ? [disp] : [cleanName(d?.nameTag) || cleanName(d?.bpPath)];
}

function otherSexNameForSelected(d, selectedLabel){
  const f = cleanName(d?.fName);
  const m = cleanName(d?.mName);
  const sel = cleanName(selectedLabel);

  // If selected matches f, return m, and vice versa
  if (!sel) return "";
  if (f && sel.toLowerCase() === f.toLowerCase()) return m;
  if (m && sel.toLowerCase() === m.toLowerCase()) return f;

  // otherwise return both collapsed or nothing
  if (f && m && f.toLowerCase() !== m.toLowerCase()) return `${f} / ${m}`;
  return "";
}


async function fileExists(url) {
  try {
    const r = await fetch(`${url}?v=${ASSET_VER}`, { method: "HEAD", cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  }
}

function normBoxLite(b){
  if (!b || typeof b !== "object") return null;
  const x = Number(b.x), y = Number(b.y), w = Number(b.w), h = Number(b.h);
  if (![x,y,w,h].every(Number.isFinite)) return null;
  return { x, y, w, h };
}
function normPointLite(p){
  if (!p || typeof p !== "object") return null;
  const x = Number(p.x), y = Number(p.y);
  if (![x,y].every(Number.isFinite)) return null;
  return { x, y };
}

function ensureLeafletPanel({ id, title, position = "topright", collapsedByDefault = false }) {
  if (!mapObj?.map) return null;

  // If it already exists, reuse it
  let existing = document.getElementById(id);
  if (existing) return existing;

  const Panel = L.Control.extend({
    options: { position },
    onAdd(map) {
      const panel = L.DomUtil.create("div", "floating-panel leaflet-panel");
      panel.id = id;

      panel.innerHTML = `
        <div class="fp-header">
          <div class="fp-titles">
            <div class="fp-title">${title}</div>
          </div> 
          <div class="fp-actions"></div>
        </div>
        <div class="fp-body"></div>
      `;

      // stop map interactions when using the panel
      L.DomEvent.disableClickPropagation(panel);
      L.DomEvent.disableScrollPropagation(panel);

      // actions
      const actions = panel.querySelector(".fp-actions");
      installPanelTitleFitter(panel, {
        minPx: 11,
        maxPx: 17
      });

      const minBtn = createIconButton(CHEVRON_DOWN_ICON);
      minBtn.dataset.action = "min";
      minBtn.title = "Collapse";
      minBtn.classList.add("fp-btn-chevron");

      const hideBtn = createIconButton(CLOSE_ICON);
      hideBtn.dataset.action = "hide";
      hideBtn.title = "Hide";

      actions.appendChild(minBtn);
      actions.appendChild(hideBtn);

      // collapse behavior
      const body = panel.querySelector(".fp-body");
      function setCollapsed(collapsed) {
        panel.classList.toggle("collapsed", collapsed);
      }

      minBtn.onclick = () => setCollapsed(!panel.classList.contains("collapsed"));

      hideBtn.onclick = () => {
        panel.style.display = "none";
        panel.dataset.hidden = "1";
        updateDockToggles();
      };

      // default collapse state
      panel.dataset.hidden = "0";
      if (collapsedByDefault) setCollapsed(true);

      return panel;
    }
  });

  const ctrl = new Panel();
  mapObj.map.addControl(ctrl);

  return document.getElementById(id);
}

document.addEventListener("click", e => {

  const el = e.target.closest(".copy-on-click");
  if (!el) return;

  const text =
    el.dataset.copy ??
    el.textContent ??
    "";

  navigator.clipboard.writeText(text.trim());

  // --- SHOW COPIED BUBBLE ---
  showCopiedBubble(el);

});

function showCopiedBubble(target){

  const bubble = document.createElement("div");
  bubble.className = "copy-bubble";
  bubble.textContent = "Copied!";

  document.body.appendChild(bubble);

  const r = target.getBoundingClientRect();

  bubble.style.left = (r.right + 6) + "px";
  bubble.style.top  = (r.top + r.height/2 - 10) + "px";

  requestAnimationFrame(()=>{
    bubble.classList.add("show");
  });

  setTimeout(()=>{
    bubble.classList.remove("show");
    setTimeout(()=> bubble.remove(), 200);
  }, 900);
}

function totalMinDesired(entry){
  const mgrs = entry?.managers;
  if (!mgrs || typeof mgrs !== "object") return 0;
  let sum = 0;
  for (const m of Object.values(mgrs)) {
    sum += Number(m?.minDesired || 0);
  }
  return sum;
}

function applyRarityToConfig(cfg) {
  const dinos = cfg?.dinos || {};
  for (const d of Object.values(dinos)) {
    for (const entry of (d.entries || [])) {
      const base = rarityFromWeight(entry.weight ?? 0);

      // Prefer exporter-provided global downshift if present
      const exporterSteps =
        (entry.minRarityDownshift != null)
          ? Number(entry.minRarityDownshift || 0)
          : null;

      // Otherwise compute from total minDesired across all managers
      const totalMin = totalMinDesired(entry);
      const computedSteps = downshiftStepsForTotalMin(totalMin);

      const globalSteps = (exporterSteps != null) ? exporterSteps : computedSteps;

      // Optional debug fields
      entry._rarityBase = base;
      entry._globalSteps = globalSteps;
      entry._totalMinDesired = totalMin;

      entry.rarity = downgradeRarity(base, globalSteps);
    }
  }
}

function formatSpawnChances(chances) {
  if (chances == null) return "";

  // array of numbers (already percents)
  if (Array.isArray(chances)) {
    const parts = chances
      .map(n => Number(n))
      .filter(n => Number.isFinite(n));
    return parts.length ? `Spawn chances: ${parts.map(n => `${fmt(n)}%`).join(", ")}` : "";
  }

  // string like "10, 20, 70" or "10%,20%,70%"
  if (typeof chances === "string") {
    const parts = chances
      .split(",")
      .map(s => s.trim().replace(/%$/, ""))
      .filter(Boolean)
      .map(s => Number(s))
      .filter(n => Number.isFinite(n));

    return parts.length ? `Spawn chances: ${parts.map(n => `${fmt(n)}%`).join(", ")}` : "";
  }

  // unknown shape
  return "";
}

function drawGroupedDino(grouped, displayName) {
  if (!grouped) return;

  const dino = {
    displayName,
    fName: grouped.fName || "",
    mName: grouped.mName || "",
    bpPath: grouped.bps?.[0] || "",
    additionalBpPathsToDisplay: grouped.bps?.slice(1) || [],
    entries: grouped.entries || [],

    nameTag: grouped.nameTag || "",
    tameable: grouped.tameable,
    breedable: grouped.breedable,
    isAlpha: grouped.isAlpha,
    isBoss: grouped.isBoss,
    isBossMinion: grouped.isBossMinion,
    dragWeight: grouped.dragWeight,
    killXpBase: grouped.killXpBase
  };

  const fakeCfg = { dinos: { __tmp__: dino } };
  preprocessCfg(fakeCfg);

  // ✅ cache what is currently being drawn so toggles can redraw map-only
  currentRender.mode = "dino";
  currentRender.cfg = fakeCfg;
  currentRender.dinoKey = "__tmp__";
  currentRender.entryClass = null;

  drawDino(fakeCfg, "__tmp__");
  renderInfoPanelForDino(fakeCfg, "__tmp__");
}

function buildNameIndex(dinosByBp) {
  const nameToBps = new Map(); // label -> [bp...]
  for (const [bp, d] of Object.entries(dinosByBp)) {
    const labels = labelsForDino(d); // ✅ now can be [fName, mName]
    for (const label of labels) {
      if (!nameToBps.has(label)) nameToBps.set(label, []);
      nameToBps.get(label).push(bp);
    }
  }

  // stable sort within each label group (optional)
  for (const [label, arr] of nameToBps) arr.sort();

  // dropdown options
  const names = [...nameToBps.keys()].sort((a,b)=>a.localeCompare(b));
  return { nameToBps, names };
}

function isTrue01(v) {
  // supports 1, "1", true
  return v === 1 || v === "1" || v === true;
}

function fmtNum(v, decimals = 0) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return decimals > 0 ? n.toFixed(decimals) : String(Math.round(n));
}

function mergeManagers(targetManagers, srcManagers) {
  for (const [mgrId, m] of Object.entries(srcManagers || {})) {
    if (!targetManagers[mgrId]) {
      // deep-ish copy
      targetManagers[mgrId] = {
        minDesired: m.minDesired,
        minDesiredPct: m.minDesiredPct,
        boxes: [],
        points: []
      };
    }
    const t = targetManagers[mgrId];

    if (Array.isArray(m.boxes))  t.boxes.push(...m.boxes);
    if (Array.isArray(m.points)) t.points.push(...m.points);

    // optional: keep the max (or recompute) if these differ
    if (typeof m.minDesired === "number") t.minDesired = Math.max(t.minDesired ?? 0, m.minDesired);
    if (typeof m.minDesiredPct === "number") t.minDesiredPct = Math.max(t.minDesiredPct ?? 0, m.minDesiredPct);
  }
}

function buildGroupedSelection(mapData, bps) {
  const picked = bps.map(bp => mapData.dinos[bp]).filter(Boolean);

  function firstNonEmpty(arr, fn) {
    for (const x of arr) {
      const v = fn(x);
      if (v != null && String(v).trim() !== "") return v;
    }
    return "";
  }

  function isTrueLoose(v) {
    if (v === true || v === 1 || v === "1") return true;
    const s = String(v ?? "").trim().toLowerCase();
    return s === "true" || s === "yes" || s === "y" || s === "t";
  }

  function anyTrue(arr, fn) {
    return arr.some(x => isTrueLoose(fn(x)));
  }

  const out = {
    displayName: picked[0]?.displayName || "Unknown",
    bps: picked.map(d => d.bpPath || "").filter(Boolean),

    // ✅ identity-ish fields
    nameTag: firstNonEmpty(picked, d => d.nameTag ?? d.nametag),
    fName: firstNonEmpty(picked, d => d.fName),
    mName: firstNonEmpty(picked, d => d.mName),
    tameable: anyTrue(picked, d => d.tameable),
    breedable: anyTrue(picked, d => d.breedable),
    isAlpha: anyTrue(picked, d => d.isAlpha),
    isBoss: anyTrue(picked, d => d.isBoss),
    isBossMinion: anyTrue(picked, d => d.isBossMinion),
    dragWeight: firstNonEmpty(picked, d => d.dragWeight),
    killXpBase: firstNonEmpty(picked, d => d.killXpBase),

    perBp: picked,
    entries: []
  };

  // ---- merge entries by entryClass (your existing code, unchanged) ----
  const entryMap = new Map();
  for (const d of picked) {
    for (const e of (d.entries || [])) {
      const key = e.entryClass || e.entryName || "UNKNOWN_ENTRY";
      if (!entryMap.has(key)) {
        entryMap.set(key, {
          entryClass: key,
          managers: {},

          // ✅ NEW: keep non-manager geometry too
          boxes: [],
          points: [],

          // ✅ NEW: keep flags if they exist on entries
          bIsCaveManager: false,
          bForceUntameable: false,

          weight: 0,
          groupWeight: 0,
          spawnMultiplier: e.spawnMultiplier,
          spawnLimit: e.spawnLimit,
          spawnChances: e.spawnChances,
          byBp: {}
        });
      }

      const m = entryMap.get(key);
      m.weight += (Number(e.weight) || 0);
      m.groupWeight += (Number(e.groupWeight) || 0);

      if (e.managers && typeof e.managers === "object") {
        mergeManagers(m.managers, e.managers);
      } else {
        // ✅ Mod style: geometry lives directly on the entry
        if (Array.isArray(e.boxes))  m.boxes.push(...e.boxes.map(normBoxLite).filter(Boolean));
        if (Array.isArray(e.points)) m.points.push(...e.points.map(normPointLite).filter(Boolean));
      }

// flags: any true wins
m.bIsCaveManager = m.bIsCaveManager || (e.bIsCaveManager === true);
m.bForceUntameable = m.bForceUntameable || (e.bForceUntameable === true);

      const bpKey = d.bpPath || "UNKNOWN_BP";
      m.byBp[bpKey] ??= { weight: 0, groupWeight: 0 };
      m.byBp[bpKey].weight += (Number(e.weight) || 0);
      m.byBp[bpKey].groupWeight += (Number(e.groupWeight) || 0);
    }
  }

  out.entries = [...entryMap.values()].map(e => {
    e.weight = +e.weight.toFixed(6);
    e.groupWeight = +e.groupWeight.toFixed(6);
    const base = rarityFromWeight(e.weight);
    const totalMin = totalMinDesired(e);
    const steps = downshiftStepsForTotalMin(totalMin);
    e.rarity = downgradeRarity(base, steps);

    const chancesText = formatSpawnChances(e.spawnChances);
    e.display = {
      weightText: `Entry Weight: ${e.groupWeight}`,
      limitText: `Max % To Allow: ${(Number(e.spawnLimit)||0)*100}%`,
      chanceText: chancesText
    };
    return e;
  });

  return out;
}

function renderDinoQuickInfo(dino, badgesEl, statsEl) {
  // ✅ hard-guard so we never crash if markup changes
  if (!badgesEl || !statsEl) return;

  // Clear
  badgesEl.innerHTML = "";
  statsEl.innerHTML = "";

  if (!dino || typeof dino !== "object") return;

  // ----- Badges -----
  const badges = [];

  if (isTrue01(dino.isAlpha))       badges.push({ cls: "alpha",    label: "Alpha" });
  if (isTrue01(dino.isBoss))        badges.push({ cls: "boss",     label: "Boss" });
  if (isTrue01(dino.isBossMinion))  badges.push({ cls: "minion",   label: "Boss Minion" });

  if (!isTrue01(dino.tameable))     badges.push({ cls: "tameable",  label: "Untameable" });
  if (!isTrue01(dino.breedable))    badges.push({ cls: "breedable", label: "Unbreedable" });

  for (const b of badges) {
    const el = document.createElement("span");
    el.className = `dino-badge ${b.cls}`;
    el.textContent = b.label;
    badgesEl.appendChild(el);
  }

  // ----- Stats -----
  const drag = fmtNum(dino.dragWeight, 0);
  const xp   = fmtNum(dino.killXpBase, 0);

  const statBits = [];
  if (drag !== null) statBits.push({ key: "Drag Weight:", val: drag });
  if (xp !== null)   statBits.push({ key: "Kill XP:",     val: String(Number(xp) * 4) });

  for (const s of statBits) {
    const row = document.createElement("div");
    row.className = "dino-statrow";
    row.innerHTML = `
      <div class="dino-statkey">${escapeHtml(s.key)}</div>
      <div class="dino-statval">${escapeHtml(s.val)}</div>
    `;
    statsEl.appendChild(row);
  }

  // ✅ Hide/show each sub-block so you don't get phantom spacing
  badgesEl.style.display = badges.length ? "" : "none";
  statsEl.style.display  = statBits.length ? "" : "none";

  // ✅ Hide whole quick block only if both are empty
  const quick = badgesEl.closest(".dino-quick");
  if (quick) quick.style.display = (badges.length || statBits.length) ? "" : "none";
}

function buildSourceDrillTree() {
  const root = { label: "Sources", children: [] };

  // Official first (controlled)
  const official = SOURCES.find(s => s.id === "official");
  if (official) {
    root.children.push({ label: official.name, value: official.id });
  }

  const modsFolder = { label: "Mods", children: [] };

  const modSources = SOURCES.filter(s => s.id !== "official");

  // groupName -> folder node
  const groups = new Map();
  const loose = [];

  for (const s of modSources) {
    const leaf = { label: s.name, value: s.id, _order: Number.isFinite(s.order) ? s.order : 9999 };

    if (s.group) {
      const gname = String(s.group);
      if (!groups.has(gname)) {
        groups.set(gname, {
          label: gname,
          children: [],
          _groupOrder: Number.isFinite(s.groupOrder) ? s.groupOrder : 9999
        });
      }
      groups.get(gname).children.push(leaf);
    } else {
      loose.push(leaf);
    }
  }

  // sort leaves inside each group
  for (const g of groups.values()) {
    g.children.sort((a, b) => (a._order - b._order) || a.label.localeCompare(b.label));
  }

  // sort loose leaves
  loose.sort((a, b) => (a._order - b._order) || a.label.localeCompare(b.label));

  // sort group folders
  const groupFolders = Array.from(groups.values())
    .sort((a, b) => (a._groupOrder - b._groupOrder) || a.label.localeCompare(b.label))
    .map(g => ({ label: g.label, children: g.children.map(({ _order, ...x }) => x) }));

  // strip _order from loose too
  const looseClean = loose.map(({ _order, ...x }) => x);

  modsFolder.children.push(...groupFolders, ...looseClean);
  root.children.push(modsFolder);

  return root;
}

function asArray(x) {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

function nextFrame() {
  return new Promise(r => requestAnimationFrame(() => r()));
}

function setExportUiHidden(hidden) {
  const ids = ["topbar", "buildInfo", "dinoInfoPanel", "modStylePanel"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.dataset._exportHide = hidden ? "1" : "0";
  });

  const dock = document.querySelector(".map-dock");
  if (dock) dock.dataset._exportHide = hidden ? "1" : "0";
}


function renderCopyLine(label, value) {
  const v = String(value || "");
  return `
    <div class="info-row">
      <span class="info-label">${escapeHtml(label)}</span>
    </div>
    <div class="info-mono copy-on-click" data-copy="${escapeAttr(v)}">${escapeHtml(v || "(none)")}</div>
  `;
}


function normSearch(s){
  return String(s || "").toLowerCase().replace(/[\s_-]/g,"");
}

function dinoSummaryForFancy(cfg, displayName){
  const bps = currentNameToBps?.get(displayName) || [];
  let entryCount = 0;
  for (const bp of bps) {
    entryCount += (cfg?.dinos?.[bp]?.entries || []).length;
  }
  return { entryCount, label: displayName };
}

function rarityDotColor(rarity){
  // reuse your existing rarityToColor
  return rarity ? rarityToColor(rarity) : "#777";
}

function mountDrillSelect({
  nativeId,
  hostId,
  root,                  // tree root node: { label, children:[...] }
  placeholder = "Search...",
  getButtonSubText = null // optional (value) => string
}) {
  const native = document.getElementById(nativeId);
  const host = document.getElementById(hostId);
  if (!native || !host) return;

  // Hide native but keep it functional
  native.style.position = "absolute";
  native.style.left = "-9999px";
  native.style.width = "1px";
  native.style.height = "1px";
  native.style.opacity = "0";

  host.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "dd dd-drill";

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

  // breadcrumbs row
  const crumbs = document.createElement("div");
  crumbs.className = "dd-crumbs";

  const search = document.createElement("input");
  search.className = "dd-search";
  search.placeholder = placeholder;

  const list = document.createElement("div");
  list.className = "dd-list";

  panel.appendChild(crumbs);
  panel.appendChild(search);
  panel.appendChild(list);

  wrap.appendChild(btn);
  wrap.appendChild(panel);
  host.appendChild(wrap);

  // ----- nav state -----
  const stack = [root]; // current path
  function curNode() { return stack[stack.length - 1]; }

  function isLeaf(n) { return n && typeof n === "object" && "value" in n; }
  function childrenOf(n) { return Array.isArray(n?.children) ? n.children : []; }
  
  function pathLabels() {
    return stack.map(n => n.label).filter(Boolean);
  }
  
  function restorePath(labels) {
    // labels like ["Sources","Mods","Xyphias"]
    stack.splice(0);  // clear
    stack.push(root); // always start at root
  
    if (!Array.isArray(labels) || labels.length < 2) return;
  
    // walk down folder nodes by label (skip first since it's root)
    for (let i = 1; i < labels.length; i++) {
      const want = labels[i];
      const next = childrenOf(curNode()).find(n => !isLeaf(n) && (n.label === want));
      if (!next) break;
      stack.push(next); // ✅ this was missing
    }
  }

  function syncButton() {
    const txt = native.selectedOptions?.[0]?.textContent || "(Select)";
    label.textContent = txt;

    if (typeof getButtonSubText === "function") {
      sub.textContent = getButtonSubText(native.value) || "";
    } else {
      sub.textContent = "";
    }
  }

  function renderCrumbs() {
    crumbs.innerHTML = "";

    // Root crumb is clickable back-to-root
    stack.forEach((node, idx) => {
      const c = document.createElement("button");
      c.type = "button";
      c.className = "dd-crumb";
      c.textContent = node.label || (idx === 0 ? "All" : "…");
      c.disabled = (idx === stack.length - 1);

      c.addEventListener("click", (e) => {
        e.preventDefault();
        stack.splice(idx + 1); // pop to this
        drillState.pathByNativeId[nativeId] = pathLabels();
        renderList();
      });

      crumbs.appendChild(c);

      if (idx < stack.length - 1) {
        const sep = document.createElement("span");
        sep.className = "dd-crumb-sep";
        sep.textContent = "›";
        crumbs.appendChild(sep);
      }
    });
  }

  function renderList() {
    const q = normSearch(search.value);
    list.innerHTML = "";
    renderCrumbs();

    const kids = childrenOf(curNode());

    const isAtRoot = (curNode() === root);

    const ordered = isAtRoot
      ? kids   // preserve your intentional order
      : [...kids].sort((a, b) =>
          (a.label || "").localeCompare(b.label || "", undefined, {sensitivity: "base",numeric: true})
        );

    for (const n of ordered) {
      const row = document.createElement("div");
      row.className = "dd-item dd-drill-item";
      row.dataset.search = normSearch(n.label || "");

      if (q && !row.dataset.search.includes(q)) continue;

      const left = document.createElement("div");
      left.className = "dd-item-left";

      const main = document.createElement("div");
      main.className = "dd-item-main";

      const name = document.createElement("div");
      name.className = "dd-item-name";
      name.textContent = n.label || "(unnamed)";

      main.appendChild(name);
      left.appendChild(main);

      const right = document.createElement("div");
      right.className = "dd-drill-right";
      right.textContent = isLeaf(n) ? "" : "›";

      row.appendChild(left);
      row.appendChild(right);

      row.addEventListener("click", () => {
        if (isLeaf(n)) {
          native.value = n.value;
          native.dispatchEvent(new Event("change"));
          close();
        } else {
          stack.push(n);
          drillState.pathByNativeId[nativeId] = pathLabels(); // ✅ remember folder
          search.value = "";
          renderList();
        }
      });

      list.appendChild(row);
    }
  }

  function open() {
    wrap.classList.add("open");
    search.value = "";
  
    // ✅ restore last folder, if any
    const saved = drillState.pathByNativeId[nativeId];
    if (saved) restorePath(saved);
  
    renderList();
    search.focus();
  }

  function close() {
    wrap.classList.remove("open");
    btn.blur();
  }

  btn.addEventListener("click", () => {
    wrap.classList.contains("open") ? close() : open();
  });

  search.addEventListener("input", () => renderList());

  document.addEventListener("pointerdown", (e) => {
    if (!wrap.contains(e.target)) close();
  });

  native.addEventListener("change", syncButton);

  syncButton();
}

function mountFancySelect({
  nativeId,
  hostId,
  placeholder = "Search...",
  getButtonSubText = null,   // (value, cfg) => string
  getRowBadges = null,       // (value, cfg) => [ "pill text", ... ]
  cfg = null
}) {
  const native = document.getElementById(nativeId);
  const host = document.getElementById(hostId);
  if (!native || !host) return;

  // Hide native but keep it functional
  native.style.position = "absolute";
  native.style.left = "-9999px";
  native.style.width = "1px";
  native.style.height = "1px";
  native.style.opacity = "0";

  // Replace any previous fancy UI cleanly
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

  function rebuildItems() {
    list.innerHTML = "";

    const opts = Array.from(native.options)
      .map(o => ({ value: o.value, text: o.textContent || "" }))
      .filter(o => o.value);

    for (const o of opts) {
      const row = document.createElement("div");
      row.className = "dd-item";
      row.dataset.value = o.value;
      row.dataset.search = normSearch(o.text);

      const left = document.createElement("div");
      left.className = "dd-item-left";

      const main = document.createElement("div");
      main.className = "dd-item-main";

      const name = document.createElement("div");
      name.className = "dd-item-name";
      name.textContent = o.text;

      main.appendChild(name);
      left.appendChild(main);

      const badges = document.createElement("div");
      badges.className = "dd-badges";

      if (typeof getRowBadges === "function") {
        const pills = getRowBadges(o.value, cfg) || [];
        for (const t of pills) {
          const pill = document.createElement("span");
          pill.className = "dd-pill";
          pill.textContent = String(t);
          badges.appendChild(pill);
        }
      }

      row.appendChild(left);
      row.appendChild(badges);

      row.addEventListener("click", () => {
        native.value = o.value;
        native.dispatchEvent(new Event("change"));
        close();
      });

      list.appendChild(row);
    }
  }

  function syncButton() {
    const txt = native.selectedOptions?.[0]?.textContent || "(Select)";
    label.textContent = txt;

    if (typeof getButtonSubText === "function") {
      sub.textContent = getButtonSubText(native.value, cfg) || "";
    } else {
      sub.textContent = "";
    }
  }

  function open() {
    wrap.classList.add("open");
    search.value = "";
    list.querySelectorAll(".dd-item").forEach(el => (el.style.display = ""));
    list.scrollTop = 0;
    search.focus();
  }

  function close() {
    wrap.classList.remove("open");
    btn.blur();
  }

  btn.addEventListener("click", () => {
    wrap.classList.contains("open") ? close() : open();
  });

  // Filter + scroll reset
  let lastQ = "";
  search.addEventListener("input", () => {
    const q = normSearch(search.value);
    if (q !== lastQ) list.scrollTop = 0;
    lastQ = q;

    list.querySelectorAll(".dd-item").forEach(el => {
      el.style.display = el.dataset.search.includes(q) ? "" : "none";
    });
  });

  // Click outside closes (avoid stacking listeners: one per dropdown is fine,
  // but we guard by checking wrap.contains)
  document.addEventListener("pointerdown", (e) => {
    if (!wrap.classList.contains("open")) return;
    if (!wrap.contains(e.target)) close();
  });

  native.addEventListener("change", syncButton);

  rebuildItems();
  syncButton();
}

function mountFancyDinoSelect(cfg){
  const native = document.getElementById("dinoSelect");
  const host  = document.getElementById("dinoSelectFancy");
  if (!native || !host) return;

  // Hide native but keep it functional
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

  // (removed rarity dot)
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
  search.placeholder = (currentViewMode === "dino") ? "Search dinos..." : "Search spawn entries...";

  const list = document.createElement("div");
  list.className = "dd-list";

  panel.appendChild(search);
  panel.appendChild(list);

  wrap.appendChild(btn);
  wrap.appendChild(panel);
  host.appendChild(wrap);

  // build items from native <option>s so your existing setupMainSelect() stays the source of truth
  function rebuildItems(){
    list.innerHTML = "";

    const opts = Array.from(native.options)
      .map(o => ({ value: o.value, text: o.textContent || "" }))
      .filter(o => o.value);

    for (const o of opts){
      const row = document.createElement("div");
      row.className = "dd-item";
      row.dataset.value = o.value;
      row.dataset.search = normSearch(o.text);

      const left = document.createElement("div");
      left.className = "dd-item-left";

      const main = document.createElement("div");
      main.className = "dd-item-main";

      const name = document.createElement("div");
      name.className = "dd-item-name";
      name.textContent = o.text;

      const meta = document.createElement("div");
      meta.className = "dd-item-meta";

      const badges = document.createElement("div");
      badges.className = "dd-badges";

      if (currentViewMode === "dino"){
        const sum = dinoSummaryForFancy(cfg, o.value); // uses your existing helper (entryCount)
        

        const pill = document.createElement("span");
        pill.className = "dd-pill";
        pill.textContent = `${sum.entryCount} entries`;
        badges.appendChild(pill);

      } else {
        // Entry mode
        const rows = entryIndex?.[o.value] || [];

        const pill = document.createElement("span");
        pill.className = "dd-pill";
        pill.textContent = `${rows.length} dinos`;
        badges.appendChild(pill);
      }

      main.appendChild(name);

      // (removed row rarity dot)
      left.appendChild(main);

      row.appendChild(left);
      row.appendChild(badges);

      row.addEventListener("click", () => {
        native.value = o.value;
        native.dispatchEvent(new Event("change"));
        close();
      });

      list.appendChild(row);
    }
  }

  function syncButton(){
    const v = native.value;
    const txt = native.selectedOptions?.[0]?.textContent || "(Select)";
    label.textContent = txt;

    if (currentViewMode === "dino"){
      const sum = dinoSummaryForFancy(cfg, v);
      sub.textContent = `${sum.entryCount} entries`;
    } else {
      const rows = entryIndex?.[v] || [];
      sub.textContent = `${rows.length} dinos`;
    }
  }

  function open(){
    wrap.classList.add("open");
    search.value = "";
    // show all items
    list.querySelectorAll(".dd-item").forEach(el => el.style.display = "");
    list.scrollTop = 0;
    search.focus(); // note: iOS zoom fix is CSS: .dd-search{font-size:16px;}
  }

  function close(){
    wrap.classList.remove("open");
    btn.blur();
  }

  btn.addEventListener("click", () => {
    wrap.classList.contains("open") ? close() : open();
  });

  // Filter
  let lastQ = "";

  search.addEventListener("input", () => {
    const q = normSearch(search.value);
  
    if (q !== lastQ) list.scrollTop = 0;  // ✅
    lastQ = q;
  
    list.querySelectorAll(".dd-item").forEach(el => {
      el.style.display = el.dataset.search.includes(q) ? "" : "none";
    });
  });

  // Click outside to close
  document.addEventListener("pointerdown", (e) => {
    if (!wrap.classList.contains("open")) return;
    if (!wrap.contains(e.target)) close();
  });

  // Keep fancy button synced whenever native changes (your code changes it a lot)
  native.addEventListener("change", syncButton);

  rebuildItems();
  syncButton();
}

function createIconButton(svgPath, viewBox = "0 0 24 24") {
  const btn = document.createElement("button");
  btn.className = "fp-btn";
  btn.type = "button";

  btn.innerHTML = `
    <svg viewBox="${viewBox}" width="16" height="16" aria-hidden="true">
      ${svgPath}
    </svg>
  `;

  return btn;
}
const CLOSE_ICON = `
  <path d="M6 6L18 18M18 6L6 18"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"/>
`;

const CHEVRON_DOWN_ICON = `
  <path d="M6 9l6 6 6-6"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"/>
`;

// ============================================================
// POIs
// ============================================================
function cssEscape(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_");
}

// Decide which icon shape to use (triangle for obelisks, square for terminals)
function poiShapeForType(type) {
  const t = String(type || "").toLowerCase();
  if (t.startsWith("obelisk")) return "obelisk";
  return "terminal";
}

function makeObeliskIcon(type) {
  const t = cssEscape(type || "unknown");

  return L.divIcon({
    className: `poi-icon poi-${t}`,
    html: `
      <svg width="22" height="22" viewBox="0 0 24 24">
        <!-- white border -->
        <circle cx="12" cy="12" r="7.7" fill="white" opacity="0.95"/>

        <!-- colored fill -->
        <circle cx="12" cy="12" r="7.5"
                fill="currentColor"
                class="poi-fill"
                stroke="Black"
                stroke-width="1.2"
                opacity="0.9"/>
      </svg>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11], // IMPORTANT: center it now
  });
}

function makeTerminalIcon(type) {
  const cls = cssEscape(type);
  return L.divIcon({
    className: `poi-icon poi-${cls}`,
    html: `
      <svg width="26" height="34" viewBox="-10 -12 20 26">
        
        <!-- white frame -->
        <path d="M -3 0 L 0 -8 L 3 0 L 0 5 Z"
              fill="white"
              opacity="0.95"/>

        <!-- inner core -->
        <path class="poi-fill"
              d="M -2 0 L 0 -6 L 2 0 L 0 3.5 Z"
              fill="currentColor"
              opacity="0.9"/>

      </svg>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 20],
  });
}

const poiIconCache = new Map();

function iconForPoiType(type) {
  const key = String(type || "");
  if (poiIconCache.has(key)) return poiIconCache.get(key);

  const shape = poiShapeForType(key);
  const icon = (shape === "obelisk") ? makeObeliskIcon(key) : makeTerminalIcon(key);

  poiIconCache.set(key, icon);
  return icon;
}

function drawSupplyCrates() {
  if (!mapObj?.supplyLayer) return;

  mapObj.supplyLayer.clearLayers();
  if (!showSupplyCrates) return;
  if (!supplyCrateData || typeof supplyCrateData !== "object") return;

  // ✅ Astraeos world settings (from PrimalWorldSettings)
  const world = {
    w: currentCfg?.imageSize?.width,
    h: currentCfg?.imageSize?.height,
    lonOrigin: -800000.0,
    lonScale:  1625.8,
    latOrigin: -800000.0,
    latScale:  1625.8
  };

  // ---- COMPACT FORMAT: { t:[bp...], p:[{x,y,z,c:[[ti,w]...]}...] } ----
  const isCompact =
    Array.isArray(supplyCrateData.t) &&
    Array.isArray(supplyCrateData.p);

  if (isCompact) {
    const types = supplyCrateData.t;

    for (const pt of supplyCrateData.p) {
      const px = worldToMapPixel(pt, world);
      if (!px) continue;

      // Build a helpful tooltip from the top few crate types at this point
      const combos = Array.isArray(pt.c) ? pt.c : [];

      const top = combos
        .map(pair => ({ ti: Number(pair?.[0]), w: Number(pair?.[1] ?? 0) }))
        .filter(x => Number.isFinite(x.ti) && x.ti >= 0 && x.ti < types.length)
        .sort((a, b) => (b.w - a.w))
        .slice(0, 4);

      const pretty = (bp) => {
        const last = String(bp || "").split("/").pop() || String(bp || "");
        return last.replace(/_C$/i, "");
      };

      const title = top.length
        ? top.map(x => `${pretty(types[x.ti])}${Number.isFinite(x.w) ? ` (${fmt(x.w)})` : ""}`).join(", ")
        : "Supply Crate";

      L.circleMarker([px.y, px.x], {
        radius: 4,
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8
      })
        .addTo(mapObj.supplyLayer)
        .bindTooltip(title, { direction: "top", opacity: 0.95 });
    }

    return;
  }

  // ---- OLD FORMAT (your previous summary map): { [crateBp]: {points:[{x,y,z}...]} } ----
  for (const [crateBp, info] of Object.entries(supplyCrateData)) {
    for (const p of (info?.points || [])) {
      const px = worldToMapPixel(p, world);
      if (!px) continue;

      const title = crateBp.split("/").pop() || crateBp;

      L.circleMarker([px.y, px.x], {
        radius: 4,
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8
      })
        .addTo(mapObj.supplyLayer)
        .bindTooltip(title, { direction: "top", opacity: 0.95 });
    }
  }
}

function drawPois(cfg) {
  if (!mapObj?.poiLayer) return;

  mapObj.poiLayer.clearLayers();
  
  if (!showPois) return;

  // your current JSON location:
  const pts = cfg?.pois?.tributeTerminals || [];

  for (const p of pts) {
    const x = Number(p.x);
    const y = Number(p.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    const type  = p.type || "unknown";
    const title = p.label || p.id || "POI";

    L.marker([y, x], {
      icon: iconForPoiType(type),
      title,
      interactive: true
    })
      .addTo(mapObj.poiLayer)
      .bindTooltip(title, { direction: "top", opacity: 0.95 });
  }
}

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
  b.textContent = (currentViewMode === "dino") ? "Dino View" : "Spawn View";
}

function setPoisVisible(show){
  showPois = !!show;

  if (!mapObj?.map || !mapObj?.poiLayer) return;

  const has = mapObj.map.hasLayer(mapObj.poiLayer);

  if (showPois && !has) mapObj.poiLayer.addTo(mapObj.map);
  if (!showPois && has) mapObj.map.removeLayer(mapObj.poiLayer);

  updateDockToggles(); // keep dock button highlight in sync
}

function isEntryVisible(dinoKey, entryIndexNum) {
  const key = `${activeSourceId}::${currentMapId}::${dinoKey}::${entryIndexNum}`;
  return entryVisibility[key] ?? true;
}

function redrawSelected() {
  const sel = document.getElementById("dinoSelect");
  if (!currentCfg || !sel?.value) return;

  if (currentViewMode === "dino") {
    // ✅ selection is displayName now
    const displayName = sel.value;
    const bps = currentNameToBps?.get(displayName) || [];
    const grouped = buildGroupedSelection(currentCfg, bps);
    drawGroupedDino(grouped, displayName);
  } else {
    drawSpawnEntry(currentCfg, sel.value);
    renderInfoPanelForEntry(currentCfg, sel.value);
  }
}

function redrawMapOnly() {
  if (!mapObj) return;

  if (currentViewMode === "dino") {
    // Prefer cached grouped cfg if we have it
    if (currentRender.mode === "dino" && currentRender.cfg && currentRender.dinoKey) {
      drawDino(currentRender.cfg, currentRender.dinoKey);
      return;
    }

    // fallback: do the grouped build without re-rendering the panel
    const sel = document.getElementById("dinoSelect");
    if (!currentCfg || !sel?.value) return;

    const displayName = sel.value;
    const bps = currentNameToBps?.get(displayName) || [];
    const grouped = buildGroupedSelection(currentCfg, bps);

    const dino = {
      displayName,
      fName: grouped.fName || "",
      mName: grouped.mName || "",
      bpPath: grouped.bps?.[0] || "",
      additionalBpPathsToDisplay: grouped.bps?.slice(1) || [],
      entries: grouped.entries || [],
      nameTag: grouped.nameTag || "",
      tameable: grouped.tameable,
      breedable: grouped.breedable,
      isAlpha: grouped.isAlpha,
      isBoss: grouped.isBoss,
      isBossMinion: grouped.isBossMinion,
      dragWeight: grouped.dragWeight,
      killXpBase: grouped.killXpBase
    };

    const fakeCfg = { dinos: { __tmp__: dino } };
    preprocessCfg(fakeCfg);

    currentRender.mode = "dino";
    currentRender.cfg = fakeCfg;
    currentRender.dinoKey = "__tmp__";
    currentRender.entryClass = null;

    drawDino(fakeCfg, "__tmp__");
    return;
  }

  // entry mode: just redraw the entry shapes (panel stays as-is)
  const sel = document.getElementById("dinoSelect");
  if (!currentCfg || !sel?.value) return;

  currentRender.mode = "entry";
  currentRender.cfg = currentCfg;
  currentRender.dinoKey = null;
  currentRender.entryClass = sel.value;

  drawSpawnEntry(currentCfg, sel.value);
}

function preloadImage(url) {
  if (!url) return;

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.decoding = "async";
  img.loading = "eager";
  img.referrerPolicy = "no-referrer";
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

let dockControl = null;
let dockState = { mapMeta: null, cfg: null };

function isPanelVisible(id){
  const el = document.getElementById(id);
  if (!el) return false;
  return el.style.display !== "none";
}

function setPanelVisible(id, show){
  const el = document.getElementById(id);
  if (!el) return;

  el.style.display = show ? "" : "none";
  el.dataset.hidden = show ? "0" : "1";

  // keep your mod FAB off (optional)
  if (id === "modStylePanel") {
    const fab = ensureModStyleFab?.();
    if (fab) fab.style.display = "none";
  }
}

function togglePanel(id){
  setPanelVisible(id, !isPanelVisible(id));
  updateDockToggles(); // keep pressed state in sync
}

function updateDockToggles(){
  const dockEl = document.querySelector(".map-dock");
  if (!dockEl) return;

  dockEl.querySelectorAll("[data-toggle-panel]").forEach(btn => {
    const id = btn.getAttribute("data-toggle-panel");
    const on = isPanelVisible(id);
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function setMapBackgroundFromDock(btn){
  const mapMeta = dockState.mapMeta;
  if (!mapMeta?.backgrounds?.length || !mapObj?.overlay) return;

  const bgs = mapMeta.backgrounds;
  const cur = btn.dataset.bgIndex ? Number(btn.dataset.bgIndex) : 0;
  const next = (cur + 1) % bgs.length;

  btn.dataset.bgIndex = String(next);
  mapObj.overlay.setUrl(bgs[next].url);
  btn.title = `Background: ${bgs[next].label || bgs[next].id || (next+1)} (tap to cycle)`;
}

function ensureDockControl(map){
  if (dockControl) return;

  const Dock = L.Control.extend({
    options: { position: "bottomleft" },

    onAdd() {
      const container = L.DomUtil.create("div", "leaflet-control leaflet-bar map-dock");
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      return container;
    }
  });

  dockControl = new Dock();
  map.addControl(dockControl);
}

function renderDock(){
  const container = document.querySelector(".map-dock");
  if (!container) return;

  const mapMeta = dockState.mapMeta;
  const isAstraeos = !!(mapMeta?.backgrounds?.length);
  const isMod = (activeSourceId !== "official");

  container.innerHTML = "";
  container.style.display = "flex";
  container.style.overflow = "hidden";

  const mkBtn = ({ title, icon, onClick, togglePanelId=null, extraClass="" }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `dock-btn ${extraClass}`.trim();
    btn.title = title;
    btn.setAttribute("aria-label", title);

    if (togglePanelId) {
      btn.setAttribute("data-toggle-panel", togglePanelId);
      btn.setAttribute("aria-pressed", "false");
    }

    btn.innerHTML = icon;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick?.(btn);
      if (document.activeElement?.blur) document.activeElement.blur();
    });

    container.appendChild(btn);
    return btn;
  };

  // 1) BG button -- only on Astraeos
  if (isAstraeos) {
    const bgs = mapMeta.backgrounds;
    const def = bgs.find(x => x.id === mapMeta.defaultBg) || bgs[0];
    let idx = Math.max(0, bgs.indexOf(def));

    // Ensure overlay is set to default bg when dock appears
    mapObj?.overlay?.setUrl(bgs[idx].url);

    const bgBtn = mkBtn({
      title: `Background: ${def.label || def.id || (idx+1)} (tap to cycle)`,
      icon: `
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M12 3 2 8l10 5 10-5-10-5Zm0 7L2 15l10 5 10-5-10-5Z"
                fill="none" stroke="currentColor" stroke-width="2"
                stroke-linejoin="round"/>
        </svg>
      `,
      onClick: (btn) => setMapBackgroundFromDock(btn)
    });

    bgBtn.dataset.bgIndex = String(idx);
  } else {
    // non-Astraeos: default background from cfg.image
    if (dockState.cfg?.image && mapObj?.overlay) {
      mapObj.overlay.setUrl(dockState.cfg.image);
    }
  }

  // 2) Dino Info toggle -- always available
  mkBtn({
    title: "Toggle Dino Info",
    icon: `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M4 6h16v12H4z" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M7 9h10M7 12h10M7 15h6" stroke="currentColor" stroke-width="2"/>
      </svg>
    `,
    togglePanelId: "dinoInfoPanel",
    onClick: () => togglePanel("dinoInfoPanel")
  });

    // 3) Mod Style toggle -- only on mods
  if (isMod) {
    mkBtn({
      title: "Toggle Mod Style",
      icon: `
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M7 21c2.5 0 4-1.5 4-4 0-1.1-.9-2-2-2H7.5C6.1 15 5 16.1 5 17.5V18c0 1.7.3 3 2 3Z"
                  fill="currentColor" opacity=".9"/>
            <path d="M20.7 4.3a1 1 0 0 0-1.4 0l-9.7 9.7c.8.3 1.4 1 1.7 1.8l9.4-9.5a1 1 0 0 0 0-1.4Z"
                  fill="currentColor"/>
          </svg>
        `,
      togglePanelId: "modStylePanel",
      onClick: () => togglePanel("modStylePanel")
    });
  }

  // 4) POI toggle -- only if this map has POIs (works for official + mods)
  const hasPois = !!(dockState.cfg?.pois?.tributeTerminals?.length);
  if (hasPois) {
    const poiBtn = mkBtn({
      title: showPois ? "Hide markers" : "Show markers",
      icon: `
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z"
                fill="none" stroke="currentColor" stroke-width="2"/>
          <circle cx="12" cy="10" r="2.5" fill="currentColor"/>
        </svg>
      `,
      onClick: (btn) => {
        setPoisVisible(!showPois);
        btn.title = showPois ? "Hide markers" : "Show markers";
        btn.classList.toggle("is-on", showPois);
      }
    });

    poiBtn.classList.toggle("is-on", showPois);
  }
  const hasSupply = !!(
    supplyCrateData &&
    (
      (Array.isArray(supplyCrateData.p) && supplyCrateData.p.length) ||   // compact
      Object.keys(supplyCrateData).length                                  // old
    )
  );
  if (hasSupply) {
    const scBtn = mkBtn({
      title: showSupplyCrates ? "Hide supply crate points" : "Show supply crate points",
      icon: `
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M12 2l3 6-3 3-3-3 3-6Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M9 8l3 3 3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M7 12c0 5 5 10 5 10s5-5 5-10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `,
      onClick: (btn) => {
        showSupplyCrates = !showSupplyCrates;
        drawSupplyCrates();
        btn.title = showSupplyCrates ? "Hide supply crate points" : "Show supply crate points";
        btn.classList.toggle("is-on", showSupplyCrates);
      }
    });

    scBtn.classList.toggle("is-on", showSupplyCrates);
  }
  
  const hasPlayerStarts =
    !!(playerStartsData && (
      Array.isArray(playerStartsData.points) ||
      (playerStartsData.regions && Object.keys(playerStartsData.regions).length)
    ));

  if (hasPlayerStarts) {
    const psBtn = mkBtn({
      title: showPlayerStarts ? "Hide player starts" : "Show player starts",
      icon: `
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z"
                fill="none" stroke="currentColor" stroke-width="2"/>
          <path d="M12 7v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M9.5 10.5 12 13l2.5-2.5" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `,
      onClick: (btn) => {
        showPlayerStarts = !showPlayerStarts;
        drawPlayerStarts();
        btn.title = showPlayerStarts ? "Hide player starts" : "Show player starts";
        btn.classList.toggle("is-on", showPlayerStarts);
      }
    });

    psBtn.classList.toggle("is-on", showPlayerStarts);
  }
  // 5) Rarity legend button -- only makes sense when showing rarity colors
  mkBtn({
    title: showRarityLegend ? "Hide rarity legend" : "Show rarity legend",
    icon: `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M12 10v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <circle cx="12" cy="7.5" r="1.2" fill="currentColor"/>
      </svg>
    `,
    onClick: (btn) => {
      setLegendOpen(!showRarityLegend);
      btn.title = showRarityLegend ? "Hide rarity legend" : "Show rarity legend";
      btn.classList.toggle("is-on", showRarityLegend);
    },
    extraClass: showRarityLegend ? "is-on" : ""
  });

  updateDockToggles();
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
    if (disp.chanceText) lines.push(disp.chanceText);
    if (disp.limitText)  lines.push(disp.limitText);
    return lines;
  }

  // fallback
  const gw  = entry.groupWeight ?? entry.group_weight;
  const lim = entry.spawnLimit  ?? entry.spawn_limit;

  if (gw != null) lines.push(`Entry Weight: ${fmt(gw)}`);
  
  const chances = entry.spawnChances ?? entry.spawn_chances;
  if (Array.isArray(chances) && chances.length) {
    lines.push(`Spawn chances: ${chances.map(n => `${fmt(n)}%`).join(", ")}`);
  } else if (typeof chances === "string" && chances.trim()) {
    const parts = chances.split(",").map(s => s.trim()).filter(Boolean);
    if (parts.length) lines.push(`Spawn Chances: ${parts.map(p => `${p}%`).join(", ")}`);
  }
  
  if (lim != null) lines.push(`Max % To Spawn: ${fmt(Number(lim) * 100)}%`);

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

      // include dino blueprint untame flag too
      const dinoUntameable =
        d?.tameable === 0 ||
        d?.tameable === false ||
        d?.tameable === "0";

      const untame =
        (e.bForceUntameable === true) ||
        dinoUntameable;

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

  L.control.zoom({ position: "bottomleft" }).addTo(map);

  // after it’s added, tag it
  setTimeout(() => {
    document.querySelector(".leaflet-control-zoom")?.classList.add("zoom-horizontal");
  }, 0);

  // Create overlay ONCE
  const overlay = L.imageOverlay(cfg.image, bounds, { crossOrigin: true }).addTo(map);

  map.fitBounds(bounds, fitOptionsForUI());
  map.setMaxBounds(bounds);
  map.options.maxBoundsViscosity = 1.0;

  // Create layers ONCE
  const layer = L.layerGroup().addTo(map);
  const caveLayer = L.layerGroup().addTo(map);

  // NEW: POIs always-on-top layer
  const poiLayer = L.layerGroup().addTo(map);
  const supplyLayer = L.layerGroup().addTo(map);
  const playerStartLayer = L.layerGroup().addTo(map);
  
  window.addEventListener("resize", () => {
    if (!mapObj?.map || !mapObj?.bounds) return;
    mapObj.map.fitBounds(mapObj.bounds, fitOptionsForUI());
  });

  return { map, layer, caveLayer, poiLayer, supplyLayer, playerStartLayer, overlay, bounds };
}
function updateMapForCfg(cfg) {
  if (!mapObj) return;

  const w = cfg.imageSize.width;
  const h = cfg.imageSize.height;
  const bounds = [[0, 0], [h, w]];

  // Clear drawn shapes
  mapObj.layer.clearLayers();
  mapObj.caveLayer.clearLayers();
  mapObj.poiLayer?.clearLayers();
  mapObj.supplyLayer?.clearLayers();
  mapObj.playerStartLayer?.clearLayers();
  // Swap background image + its bounds
  mapObj.overlay.setUrl(cfg.image);
  mapObj.overlay.setBounds(bounds);

  // Update map constraints + view
  mapObj.map.setMaxBounds(bounds);
  mapObj.map.fitBounds(bounds, fitOptionsForUI());

  mapObj.bounds = bounds;
}

// ============================================================
// Background toggle (Leaflet button) -- replaces BG dropdown
// ============================================================

let bgToggleControl = null;

function refitMapForUI() {
  if (!mapObj?.map || !mapObj?.bounds) return;

  // if the topbar expands/collapses, map container size changes
  mapObj.map.invalidateSize();

  // re-fit with your asymmetric padding
  mapObj.map.fitBounds(mapObj.bounds, fitOptionsForUI());
}

// ============================================================

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

  // reset everything
  sel.innerHTML = "";
  sel.onchange = null;

  const addPlaceholder = (text) => {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = text;
    sel.appendChild(opt);
    sel.value = "";
  };

  if (currentViewMode === "dino") {
  // Build displayName -> [bp] index
    const { nameToBps, names } = buildNameIndex(cfg.dinos || {});
    currentNameToBps = nameToBps;
    currentNames = names;

    if (!names.length) {
      addPlaceholder("(No dinos)");
      renderInfoPanelBodyEmpty();
      mountFancyDinoSelect(cfg);
      return;
    }

    // populate dropdown with UNIQUE display names
    for (const name of names) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    }

    // when user selects a name
    sel.onchange = () => {
      const displayName = sel.value;
      lastSelection.dino[activeSourceId] = displayName; // ✅ remember per source

      const bps = nameToBps.get(displayName) || [];
      const grouped = buildGroupedSelection(cfg, bps);
      drawGroupedDino(grouped, displayName);
    };

    const preferred = lastSelection.dino[activeSourceId];
    sel.value = (preferred && names.includes(preferred)) ? preferred : names[0];
    sel.onchange();

  } else {
    const keys = Object.keys(entryIndex || {}).sort((a, b) => a.localeCompare(b));

    if (!keys.length) {
      addPlaceholder("(No spawn entries)");
      // ✅ IMPORTANT: still rebuild fancy UI
      mountFancyDinoSelect(cfg);
      return;
    }

    for (const k of keys) {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = k;
      sel.appendChild(opt);
    }

    sel.onchange = () => {
      lastSelection.entry[activeSourceId] = sel.value; // ✅ remember per source
      drawSpawnEntry(cfg, sel.value);
      renderInfoPanelForEntry(cfg, sel.value);
    };

    const preferred = lastSelection.entry[activeSourceId];
    sel.value = (preferred && keys.includes(preferred)) ? preferred : keys[0];
    sel.onchange();
  }

  // ✅ Always rebuild fancy UI after native options change
  mountFancyDinoSelect(cfg);
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

  useRarityForMods = (mode === "dino");
  
  renderModStylePanelBody();
  redrawSelected();

  if (currentCfg) setupMainSelect(currentCfg);
}

function switchMode(nextMode) {
  setViewMode(nextMode);

  // After dropdown rebuild, redraw whatever is selected
  const sel = document.getElementById("dinoSelect");
  if (!sel?.value || !currentCfg) return;

  requestRedraw();
  if (currentViewMode === "entry") {
    useRarityForMods = false;
  }
  renderModStylePanelBody();
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
    opt.textContent = s.name + (s.hasFile === false ? " (missing)" : "");
    if (s.hasFile === false) opt.disabled = true;
    sel.appendChild(opt);
  }

  // if current selection became invalid, force back to official
  if (SOURCES.find(s => s.id === activeSourceId)?.hasFile === false) {
    activeSourceId = "official";
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

  mountDrillSelect({
    nativeId: "sourceSelect",
    hostId: "sourceSelectFancy",
    placeholder: "Search this level...",
    root: buildSourceDrillTree(),
    getButtonSubText: (v) => (v === "official" ? "Official" : "Mod"),
  });
}

async function loadModSource(sourceId) {
  const src = SOURCES.find(s => s.id === sourceId);
  if (!src?.file) return null;

  // cache hit (including cached null)
  if (Object.prototype.hasOwnProperty.call(loadedMods, sourceId)) {
    return loadedMods[sourceId];
  }

  try {
    const data = await loadJSON(src.file);
    loadedMods[sourceId] = data;
    return data;
  } catch (err) {
    console.warn("Mod source failed to load:", sourceId, src.file, err);
    loadedMods[sourceId] = null;   // cache failure
    src.hasFile = false;           // keep state consistent
    return null;
  }
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
  mountFancySelect({
    nativeId: "mapSelect",
    hostId: "mapSelectFancy",
    placeholder: "Search maps...",
    getButtonSubText: (v) => "",
    getRowBadges: (v) => [], // or ["map"]
  });
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
  
    // ✅ capture mod metadata for UI
    currentModMeta = modCfg?.mod || null;
  
    const modMap = modCfg?.maps?.[mapMeta.id];
    effectiveCfg = { ...vanillaCfg, dinos: modMap?.dinos || {} };
  } else {
    currentModMeta = null;
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
    ensureDockControl(mapObj.map);   // ✅ add once (THIS is what was missing)
  } else {
    updateMapForCfg(currentCfg);
  }
  // Load supply crate points only for Astraeos (adjust if you want it for other maps too)
  if (mapMeta.id === "Astraeos") {
    try {
      supplyCrateData = await loadJSON("data/astraeos_supply_poi_compact.json");
    } catch (e) {
      console.warn("No supply crate summary JSON found:", e);
      supplyCrateSummary = null;
    }

    // ✅ Player starts (pixel points file)
    try {
      playerStartsData = await loadJSON("data/astraeos_player_starts.json");
    } catch (e) {
      console.warn("No player starts JSON found:", e);
      playerStartsData = null;
    }

  } else {
    supplyCrateData = null;
    playerStartsData = null; // ✅
  }
  
  // keep latest for dock rendering
  dockState.mapMeta = mapMeta;
  dockState.cfg = currentCfg;
  
  // 5) Panels + background dropdown
  ensurePanels();
  setModStylePanelVisible(activeSourceId !== "official");
  renderModStylePanelBody();
  
  // rebuild dock buttons based on map + source
  renderDock();
  updateDockToggles();
  syncRarityLegendPopColors();
  setLegendOpen(false); // optional: auto-close on map/source change
  
  setPoisVisible(showPois); // ✅ re-apply on map changes
  drawPois(currentCfg);
  drawSupplyCrates();
  drawPlayerStarts();

  // If Astraeos has alternate bgs, keep your dropdown behavior:

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

  if (s.includes("very rare"))      return "#FF0000";
  if (s.includes("rare"))           return "#FF6600";

  if (s.includes("very uncommon"))  return "#FFCC00";
  if (s.includes("uncommon"))       return "#FFFF00";

  if (s.includes("very common"))    return "#00FF00"; // ✅ moved above "common"
  if (s.includes("common"))         return "#B2FF00";

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
        dashArray: (untame) ? "3 3" : null,
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

        const useRarity = isOfficial || useRarityForMods;

        const color = useRarity
          ? rarityToColor(m.rarity)
          : modDrawColor;

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
              dashArray: (m.untame) ? "3 3" : null,
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

    const useRarity = isOfficial || useRarityForMods;
    const color = useRarity ? rarityToColor(entry.rarity) : modDrawColor;

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
          dashArray: (untame) ? "3 3" : null,
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

let modFab = null;

function ensureModStyleFab(){
  if (modFab) return modFab;

  const mapEl = document.getElementById("mapWrap");
  if (!mapEl) return null;

  const btn = document.createElement("button");
  btn.id = "modStyleFab";
  btn.type = "button";
  btn.title = "Mod Style";
  btn.setAttribute("aria-label", "Show Mod Style panel");

  btn.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 21c2.5 0 4-1.5 4-4 0-1.1-.9-2-2-2H7.5C6.1 15 5 16.1 5 17.5V18c0 1.7.3 3 2 3Z"
            fill="currentColor" opacity=".9"/>
      <path d="M20.7 4.3a1 1 0 0 0-1.4 0l-9.7 9.7c.8.3 1.4 1 1.7 1.8l9.4-9.5a1 1 0 0 0 0-1.4Z"
            fill="currentColor"/>
    </svg>
  `;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    showPanel("modStylePanel");
    btn.style.display = "none";
  });

  mapEl.appendChild(btn);
  modFab = btn;
  return btn;
}

// Fit .fp-title text into its available width by shrinking font-size only if needed.
function fitTitleToSpace(titleEl, opts = {}) {
  if (!titleEl) return;

  const {
    minPx = 10,
    maxPx = 17,   // your "nice" size
    stepPx = 0.25 // precision; can be 0.5 for even less work
  } = opts;

  // Reset to max first (so "Achatina" stays big)
  titleEl.style.fontSize = maxPx + "px";

  // If it already fits, we're done.
  // (scrollWidth includes the full text width; clientWidth is available space)
  if (titleEl.scrollWidth <= titleEl.clientWidth) return;

  // Binary search between minPx and maxPx
  let lo = minPx;
  let hi = maxPx;

  // guard: avoid infinite loops with tiny step sizes
  for (let i = 0; i < 16; i++) {
    const mid = Math.floor(((lo + hi) / 2) / stepPx) * stepPx;
    titleEl.style.fontSize = mid + "px";

    const fits = titleEl.scrollWidth <= titleEl.clientWidth;
    if (fits) lo = mid; else hi = mid - stepPx;

    if (hi < lo) break;
  }

  // lo is the largest size that fit (best-looking)
  titleEl.style.fontSize = Math.max(minPx, lo) + "px";
}

function installPanelTitleFitter(panelEl, opts) {
  const titleEl = panelEl?.querySelector(".fp-title");
  const titlesWrap = panelEl?.querySelector(".fp-titles") || titleEl?.parentElement;

  if (!panelEl || !titleEl) return;

  // Run once after paint (ensures widths are real)
  requestAnimationFrame(() => fitTitleToSpace(titleEl, opts));

  // Refit on resize of the title container (or panel)
  const ro = new ResizeObserver(() => fitTitleToSpace(titleEl, opts));
  ro.observe(titlesWrap || panelEl);

  // Refit when the title text changes
  const mo = new MutationObserver(() => fitTitleToSpace(titleEl, opts));
  mo.observe(titleEl, { childList: true, characterData: true, subtree: true });

  // Optional: expose cleanup so you can destroy panels cleanly
  panelEl._titleFitCleanup = () => { ro.disconnect(); mo.disconnect(); };
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
    <div class="fp-header">
      <div class="fp-titles">
        <div class="fp-title">${title}</div>
      </div> 
      <div class="fp-actions"></div>
    </div>
    <div class="fp-body"></div>
  `;
  const actions = panel.querySelector(".fp-actions");

  // make SVG icon buttons
  const minBtn = createIconButton(CHEVRON_DOWN_ICON);
  minBtn.dataset.action = "min";
  minBtn.title = "Collapse";
  minBtn.classList.add("fp-btn-chevron"); // optional (if you want rotation later)
  
  const hideBtn = createIconButton(CLOSE_ICON);
  hideBtn.dataset.action = "hide";
  hideBtn.title = "Hide";
  
  // add them
  actions.appendChild(minBtn);
  actions.appendChild(hideBtn);

  mapEl.appendChild(panel);

  if (collapsedByDefault) {
    panel.classList.add("collapsed");
    const body = panel.querySelector(".fp-body");
    if (body) body.style.display = "none";
  }

  panel.style.top = `${defaultPos.top ?? 12}px`;

  if (defaultPos.left != null) {
    panel.style.left = `${defaultPos.left}px`;
    panel.style.right = "auto";
  } else {
    panel.style.right = `${defaultPos.right ?? 12}px`;
    panel.style.left = "auto";
  }
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
    updateDockToggles();
    panel.dataset.hidden = "1";

    // If it's the mod panel, show the floating "paintbrush" button
    if (panel.id === "modStylePanel") {
      const fab = ensureModStyleFab();
      if (fab) fab.style.display = "none";
    }
  };

  makePanelDraggable(panel);
  return panel;
}

function showPanel(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = "";
  el.dataset.hidden = "0";

  // If this is the mod panel, hide the FAB
  if (id === "modStylePanel") {
    const fab = ensureModStyleFab();
    if (fab) fab.style.display = "none";
  }
  updateDockToggles();
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
  if (!mapObj?.map) return;

  if (!stylePanel) {
    stylePanel = ensureLeafletPanel({
      id: "modStylePanel",
      title: "Style",
      position: "topright",
      collapsedByDefault: true
    });
    renderModStylePanelBody();
  }

  if (!infoPanel) {
    infoPanel = ensureLeafletPanel({
      id: "dinoInfoPanel",
      title: "Dino Info",
      position: "topleft",
      collapsedByDefault: true
    });
    renderInfoPanelBodyEmpty();
  }

  setModStylePanelVisible(activeSourceId !== "official");
}


function setModStylePanelVisible(show) {
  const el = document.getElementById("modStylePanel");
  if (!el) return;

  // If we're switching away from a mod source, hide both the panel and the FAB.
  if (!show) {
    el.style.display = "none";
    el.dataset.hidden = "0";
    const fab = ensureModStyleFab();
    if (fab) fab.style.display = "none";
    return;
  }

  // show=true: respect whether the user hid it (dataset.hidden)
  const hidden = (el.dataset.hidden === "1");
  el.style.display = hidden ? "none" : "";

  const fab = ensureModStyleFab();
  if (fab) fab.style.display = hidden ? "" : "none";
}

function renderModStylePanelBody() {
  const panel = document.getElementById("modStylePanel");
  if (!panel) return;
  const body = panel.querySelector(".fp-body");

  const isSpawnMode = (currentViewMode === "entry");


  body.innerHTML = `
    ${!isSpawnMode ? `
      <label class="fp-row">
        <input id="modUseRarity" type="checkbox" ${useRarityForMods ? "checked" : ""}>
        <span>Use rarity colors</span>
      </label>
    ` : ``}

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

  const r  = document.getElementById("modUseRarity");
  const c  = document.getElementById("modColor2");
  const o  = document.getElementById("modOpacity2");
  const ol = document.getElementById("modOpacityLabel2");
  const g  = document.getElementById("modGlow2");

  if (r) r.onchange = () => {
    useRarityForMods = r.checked;
    redrawSelected();
    // optional: if you want color control to instantly disable/enable:
    renderModStylePanelBody();
  };

  // ✅ disable mod color picker when rarity is being used
  if (c) {
    c.disabled = (useRarityForMods && !isSpawnMode);
    c.style.opacity = c.disabled ? "0.5" : "1";
    c.oninput = () => { modDrawColor = c.value; redrawSelected(); };
  }

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
        <div class="dino-quick">
            <div class="dino-badges" data-dino-badges></div>
            <div class="dino-statsline" data-dino-stats></div>
      </div>

      <div class="info-row">
        <span class="info-label">Entry class</span>
      </div>
      <div class="info-mono copy-on-click" data-copy="${escapeAttr(entryClass)}">${escapeHtml(entryClass)}</div>
    </div>

    <div class="info-section">
      <div class="info-subtitle">Dinos (${dinoKeys.length})</div>
      <div class="entries">
        ${dinoKeys.map(dinoKey => renderEntryDinoBlock(cfg, dinoKey, byDino.get(dinoKey))).join("")}
      </div>
    </div>
  `;

  // hook copy buttons
  
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
      <div class="entry-meta">
        ${metaLines.map(line => {
          const isChances = String(line).toLowerCase().startsWith("spawn chances");
          const cls = isChances
            ? "entry-meta-line entry-meta-chances"
            : "entry-meta-line";
          return `<div class="${cls}">${escapeHtml(line)}</div>`;
        }).join("")}
      </div>
    `;
  }).join("");

  return `
    <div class="info-section">
      <div class="info-row">
        <span class="info-label">${escapeHtml(displayName)}</span>
      </div>
      ${bp ? `<div class="info-mono copy-on-click" data-copy="${escapeAttr(bp)}">${escapeHtml(bp)}</div>` : ``}
      ${nameTag ? `<div class="info-mono copy-on-click" data-copy="${escapeAttr(nameTag)}">${escapeHtml(nameTag)}</div>` : ``}
      ${entryLinesHtml}
    </div>
  `;
}

function renderDinoHero({ displayName, sexLine = "", allBps, nameTag, d }) {
  const modLine = currentModMeta?.id
    ? `<div class="info-submeta">Mod ID: ${escapeHtml(currentModMeta.id)}</div>`
    : ``;

  const bpBlock = `
    <div class="info-subtitle">Blueprint</div>
    ${(allBps.length ? allBps : ["(none)"]).map((p) => `
      <div class="info-mono copy-on-click" data-copy="${escapeAttr(p)}">${escapeHtml(p)}</div>
    `).join("")}
  `;

  const tagBlock = `
    <div class="info-subtitle">Nametag</div>
    <div class="info-mono copy-on-click" data-copy="${escapeAttr(nameTag)}">
      ${escapeHtml(nameTag || "(none)")}
    </div>
  `;

  return `
    <div class="dino-hero">
      <div class="dino-hero-title">${escapeHtml(displayName)}</div>
      ${sexLine || ""}   <!-- ✅ now it actually shows -->
      ${modLine}

      <div class="dino-quick">
        <div class="dino-badges" data-dino-badges></div>
        <div class="dino-statsline" data-dino-stats></div>
      </div>

      ${bpBlock}
      ${tagBlock}
    </div>
  `;
}

// INFO tab becomes "extra info" now, since identity moved into hero
function renderDinoTab_Info({ d }) {
  // Put anything you want that is NOT identity:
  // traits, flavor text, toggles, etc.
  const tame = (d?.tameable == null) ? null : (!!d.tameable);
  const breed = (d?.breedable == null) ? null : (!!d.breedable);

  return `
    <div class="info-section">
      <div class="info-subtitle">Details</div>
      <div class="entry-meta">
        ${tame === null ? `` : `<div class="entry-meta-line">Tameable: ${tame ? "Yes" : "No"}</div>`}
        ${breed === null ? `` : `<div class="entry-meta-line">Breedable: ${breed ? "Yes" : "No"}</div>`}
      </div>
      

      <div style="color:var(--muted);">
        (Add whatever "Info" content you want here now.)
      </div>
    </div>
  `;
}



function renderDinoTab_Spawns({ entries, dinoKey }) {
  return `
    <div class="info-section">
      <div class="info-subtitle">Spawn entries (${entries.length})</div>
      <div class="entries">
        ${entries.map((e, i) => renderEntryRow(e, dinoKey, i)).join("")}
      </div>
    </div>
  `;
}

function renderDinoTab_Stats(d) {
  // You already show drag + XP in quick info; this can be expanded later
  const drag = fmtNum(d?.dragWeight, 0);
  const xp   = fmtNum(d?.killXpBase, 0);
  return `
    <div class="info-section">
      <div class="info-subtitle">Stats</div>

      <div class="entry-meta">
        ${drag !== null ? `<div class="entry-meta-line">Drag Weight: ${escapeHtml(drag)}</div>` : ``}
        ${xp   !== null ? `<div class="entry-meta-line">Kill XP: ${escapeHtml(String(Number(xp)*4))}</div>` : ``}
      </div>

      <div class="entry-meta" color:var(--muted);">
        (More stat breakdown here later if you want.)
      </div>
    </div>
  `;
}

function renderDinoTab_Loot() {
  return `
    <div class="info-section">
      <div class="info-subtitle">Loot</div>
      <div style="color:var(--muted)">Loot tab (coming soon)</div>
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

  const pickedLabel = document.getElementById("dinoSelect")?.value || "";
  const f = cleanName(d.fName);
  const m = cleanName(d.mName);

  const displayName = (f || m)
    ? [f, m].filter(Boolean).join(" / ")
    : (d.displayName || dinoKey);

  // keep panel title matching the selected dropdown label (feels best)
  setInfoPanelTitle(pickedLabel || displayName);

  const bp = d.bpPath || "";
  const nameTag = d.nameTag || d.nametag || "";
  const extraBps = asArray(d.additionalBpPathsToDisplay);
  const allBps = [bp, ...extraBps].filter(Boolean);

  const entries = d.entries || [];
  const other = otherSexNameForSelected(d, pickedLabel);

  const sexLine = other
    ? `<div class="info-submeta">${escapeHtml(other)}</div>`
    : ``;

  if (!INFO_TABS.some(t => t.id === infoTab)) infoTab = "info";

  body.innerHTML = `
    ${renderDinoHero({ sexLine, displayName, allBps, nameTag, d })}

    <div class="fp-tabs">
      ${INFO_TABS.map(t => `
        <button type="button"
                class="fp-tab ${infoTab===t.id ? "is-on" : ""}"
                data-tab="${t.id}">
          ${escapeHtml(t.label)}
        </button>
      `).join("")}
    </div>

    <div class="fp-pages" id="infoPages">
      <div class="fp-track">

        <div class="fp-page" data-page="spawns">
          ${renderDinoTab_Spawns({ entries, dinoKey })}
        </div> 

        <div class="fp-page" data-page="stats">
          ${renderDinoTab_Stats(d)}
        </div>

        <div class="fp-page" data-page="loot">
          ${renderDinoTab_Loot()}
        </div>
        
        <div class="fp-page" data-page="info">
          ${renderDinoTab_Info({ d })}
        </div>
      </div>

      <div class="fp-dots" aria-label="Pages">
        ${INFO_TABS.map(t => `
          <div class="fp-dot ${infoTab===t.id ? "is-on" : ""}" data-dot="${t.id}"></div>
        `).join("")}
      </div>
    </div>
  `;

  // ✅ set correct slide position immediately
  setInfoTab(infoTab);

  // ✅ swipe mount (still targets #infoPages)
  mountInfoSwipe(body.querySelector("#infoPages"));

  // ✅ tab clicks
  body.querySelectorAll(".fp-tab").forEach(btn => {
    btn.onclick = () => setInfoTab(btn.dataset.tab);
  });

  // ✅ populate quick info inside the hero (not inside the Info page anymore)
  const badgesEl = body.querySelector(".dino-hero [data-dino-badges]");
  const statsEl  = body.querySelector(".dino-hero [data-dino-stats]");
  renderDinoQuickInfo(d, badgesEl, statsEl);

  // ✅ entry toggle wiring (Spawns tab)
  body.querySelectorAll('input[data-entry-toggle="1"]').forEach(chk => {
    chk.onchange = () => {
      const key = chk.dataset.key;
      entryVisibility[key] = chk.checked;
      requestAnimationFrame(redrawMapOnly);
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
          ${metaLines.map(line => {
            const isChances = String(line).toLowerCase().startsWith("spawn chances");
            const cls = isChances
              ? "entry-meta-line entry-meta-chances"
              : "entry-meta-line";
            return `<div class="${cls}">${escapeHtml(line)}</div>`;
          }).join("")}
        </div>
      </div>
    </label>
  `;
}

// ============================================================
// BOOT
// ============================================================
async function boot() {
  // ✅ build sources FIRST
  SOURCES = await buildSources();

  setupSourceDropdown();
  setupMapDropdown();

  // kick off preloading
  

  document.getElementById("controlsToggle")?.addEventListener("click", () => {
    document.getElementById("topbar")?.classList.toggle("show-controls");
    requestAnimationFrame(() => refitMapForUI());
  });

  document.getElementById("modeToggle")?.addEventListener("click", () => {
    const next = (currentViewMode === "dino") ? "entry" : "dino";
    switchMode(next);
  });

  syncModeBtn();

  window.addEventListener("resize", () => refitMapForUI());

  loadMapByMeta(MAPS[0]).catch(err => {
    console.error(err);
    alert(err.message || String(err));
  });

  document.querySelectorAll('#rarityLegend [data-r]').forEach(el=>{
    el.style.background = rarityToColor(el.dataset.r);
  });
}

// ✅ call it without breaking top-level
boot().catch(err => {
  console.error("BOOT FAILED:", err);
  alert(err.message || String(err));
});