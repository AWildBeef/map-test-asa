/* ============================================================
   app2.js -- Atlas rebuild v4 (rarity + cave/untameable styles)
============================================================ */

const ASSET_VER = "dev-2026-03-04-D";

const PATHS = {
  spawnGlobal: `data/spawn_global.json`,
  dinoGlobal: `data/dinos_global.json`,
  geomDir: `data/MapGeometry`,
  mapsDir: `maps`,
};

// IMPORTANT:
// - geomShort = filename prefix for _geom.json
// - mapCode   = the code used inside spawn_global.json entryMaps/mapLegend
const MAPS = [
  { id:"The Island",     geomShort:"TheIsland",     mapCode:"TheIsland", image:"theisland.webp" },
  { id:"Scorched Earth", geomShort:"ScorchedEarth", mapCode:"SE",        image:"scorchedearth.webp" },
  { id:"The Center",     geomShort:"TheCenter",     mapCode:"center",    image:"thecenter.webp" },
  { id:"Ragnarok",       geomShort:"Ragnarok",      mapCode:"Rag",       image:"ragnarok.webp" },
  { id:"Valguero",       geomShort:"Valguero",      mapCode:"Val",       image:"valguero.webp" },
  { id:"Aberration",     geomShort:"Aberration",    mapCode:"AB",        image:"aberration.webp" },
  { id:"Extinction",     geomShort:"Extinction",    mapCode:"EXT",       image:"extinction.webp" },
  { id:"Lost Colony",    geomShort:"LostColony",    mapCode:"LC",        image:"lostcolony.webp" },
  { id:"Astraeos",       geomShort:"Astraeos",      mapCode:"AST",       image:"astraeos.webp" },
];

const Global = {
  spawn: null,
  dinos: null,
  mapGeom: new Map(), // geomShort -> geom json
};

const State = {
  mapId: MAPS[0].id,
  mode: "dino",
  selection: "",
  mapEntries: new Set(),
  entryToDinos: new Map(),
  dinoToEntries: new Map(),
  nameToBps: new Map(),
  names: [],
  entryList: [],
};

// ---------- Rarity Control ----------

const RARITY_THRESHOLDS = [
  [0.03,   "very common"],
  [0.009,  "common"],
  [0.005,  "uncommon"],
  [0.0009, "very uncommon"],
  [0.0001, "rare"],
  [-1,     "very rare"],
];

const RARITY_ORDER = [
  "very common",
  "common",
  "uncommon",
  "very uncommon",
  "rare",
  "very rare"
];

function rarityFromWeight(w){
  const x = Number(w || 0);
  for (const [thr, label] of RARITY_THRESHOLDS){
    if (x >= thr) return label;
  }
  return "very rare";
}

function rarityToColor(r){
  const s = String(r || "").toLowerCase();
  if (s.includes("very rare"))      return "#FF0000";
  if (s.includes("rare"))           return "#FF6600";
  if (s.includes("very uncommon"))  return "#FFCC00";
  if (s.includes("uncommon"))       return "#FFFF00";
  if (s.includes("very common"))    return "#00FF00";
  if (s.includes("common"))         return "#B2FF00";
  return "#888888";
}

// ---------- Downshift Rules ----------

// global rarity downshift thresholds
// [ totalMinDesiredMax, steps ]
const MIN_GLOBAL_DOWNSHIFT = [
  [3, 6],   // giga spawners etc
];

// manager rarity downshift
function downshiftStepsForMinPct(pct){
  const p = Number(pct || 1);
  if (p >= 0.51) return 0;
  return 1;
}

function downshiftStepsForTotalMin(totalMin){
  const m = Number(totalMin || 0);
  if (m <= 0) return 0;

  for (const [thr, steps] of MIN_GLOBAL_DOWNSHIFT){
    if (m <= thr) return steps;
  }
  return 0;
}

function downgradeRarity(label, steps){
  if (!steps) return label;

  let i = RARITY_ORDER.indexOf(label);
  if (i < 0) i = RARITY_ORDER.length - 1;

  const j = Math.min(RARITY_ORDER.length - 1, i + steps);
  return RARITY_ORDER[j];
}

function entryManagerMinStats(entryName){

  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);
  const entry = geom?.entries?.[entryName];

  if (!entry) return { best:0, total:0 };

  const mins = [];

  for (const mgr of Object.values(entry.m || {})){
    const md = Number(mgr?.md || 0);
    if (md > 0) mins.push(md);
  }

  const best = mins.length ? Math.max(...mins) : 0;
  const total = mins.reduce((a,b)=>a+b,0);

  return { best, total };
}

function managerMinPct(managerMd, bestMd){
  const md = Number(managerMd || 0);
  const best = Number(bestMd || 0);

  if (best <= 0) return 1;
  if (md <= 0) return 1;

  return md / best;
}

function finalRarityForManager(entryName, managerMeta, rarityScore){

  const baseLabel = rarityFromWeight(rarityScore);

  const { best, total } = entryManagerMinStats(entryName);

  const globalSteps = downshiftStepsForTotalMin(total);

  const pct = managerMinPct(managerMeta?.md, best);
  const managerSteps = downshiftStepsForMinPct(pct);

  const finalLabel = downgradeRarity(baseLabel, globalSteps + managerSteps);

  return {
    baseLabel,
    finalLabel,
    baseScore: rarityScore,
    bestManagerMin: best,
    totalMin: total,
    managerMin: Number(managerMeta?.md || 0),
    managerPct: pct,
    globalSteps,
    managerSteps,
  };
}

function buildTooltip(entryName, managerMeta, rarityInfo){

  const lines = [
    `<b>${entryName}</b>`,
    `Manager: ${managerMeta.manager}`,
  ];

  if (managerMeta.md != null)
    lines.push(`MinDesired: ${managerMeta.md}`);

  if (managerMeta.ii != null)
    lines.push(`IncreaseInterval: ${managerMeta.ii}`);

  lines.push(`Score: ${Number(rarityInfo.baseScore).toFixed(5)}`);
  lines.push(`Base Rarity: ${rarityInfo.baseLabel}`);
  lines.push(`Final Rarity: ${rarityInfo.finalLabel}`);

  lines.push(`Entry Total Min: ${rarityInfo.totalMin}`);
  lines.push(`Manager Share: ${(rarityInfo.managerPct*100).toFixed(1)}%`);

  if (rarityInfo.globalSteps)
    lines.push(`Global Downshift: +${rarityInfo.globalSteps}`);

  if (rarityInfo.managerSteps)
    lines.push(`Manager Downshift: +${rarityInfo.managerSteps}`);

  if (managerMeta.isCave) lines.push(`Cave Spawn`);
  if (managerMeta.isUntameable) lines.push(`Untameable`);

  return lines.join("<br>");
}

function dinoIsUntameable(bp){
  const d = Global.dinos?.dinos?.[bp];
  const tame = d?.flags?.tameable;

  // your schema uses 0/1 a lot; tolerate booleans too
  if (tame === 0 || tame === false) return true;
  return false;
}

function nameIsUntameable(name){
  const bps = State.nameToBps.get(name) || [];
  return bps.some(dinoIsUntameable);
}

function entryHasUntameableSelectedBp(entryName, bpSet){
  const rows = Global.spawn?.entries?.[entryName]?.d || [];
  for (const r of rows){
    const bp = r?.[0];
    if (!bp || !bpSet.has(bp)) continue;
    if (dinoIsUntameable(bp)) return true;
  }
  return false;
}

// Leaflet style object for this entry on this map
function styleForEntry(meta, color){
  const isCave = !!meta?.isCave;
  const isUntameable = !!meta?.isUntameable;

  const style = {
    color,
    weight: isCave ? 3 : 1,
    opacity: 1,
    fillColor: color,
    fillOpacity: isCave ? 0.40 : 0.80,
  };

  // Leaflet likes dashArray as a string; omit it entirely if not used
  if (isUntameable) style.dashArray = "3 3";

  return style;
}

// ---------- DOM helpers (prevents "sel is null" crashes) ----------
function byIdAny(...ids){
  for (const id of ids){
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}
function getMainSelect(){ return byIdAny("mainSelect", "dinoSelect", "entrySelect", "spawnSelect", "selectMain"); }
function getMapSelect(){ return byIdAny("mapSelect", "mapDropdown", "selectMap"); }
function getModeToggle(){ return byIdAny("modeToggle", "viewToggle", "toggleMode"); }
function getControlsToggle(){ return byIdAny("controlsToggle", "filterToggle", "toggleFilters"); }
function getTopbar(){ return byIdAny("topbar", "controls", "filters"); }

// ---------- misc helpers ----------
function bpClass(bp){
  return String(bp || "").split(".").pop();
}

async function loadJSON(url){
  const res = await fetch(`${url}?v=${ASSET_VER}`);
  if (!res.ok) throw new Error(`Failed ${url} (${res.status})`);
  return res.json();
}

function labelsForDinoObj(d){
  // your compact schema uses "n" often; fn/mn optional
  const out = [];
  if (d?.fn) out.push(d.fn);
  if (d?.mn && d.mn !== d.fn) out.push(d.mn);
  if (out.length) return out;
  if (d?.n) return [d.n];
  return [];
}

/* ============================================================
   INDEX BUILDER
============================================================ */
function rebuildMapIndices(){
  const spawn = Global.spawn || {};
  const dinos = Global.dinos?.dinos || {};

  State.mapEntries.clear();
  State.entryToDinos.clear();
  State.dinoToEntries.clear();
  State.nameToBps.clear();

  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const mapCode = mapMeta?.mapCode;

  // map -> entries via spawn.entryMaps: entryName -> [mapCodes]
  for (const [entryName, mapList] of Object.entries(spawn.entryMaps || {})){
    if (Array.isArray(mapList) && mapCode && mapList.includes(mapCode)){
      State.mapEntries.add(entryName);
    }
  }

  // entries -> dinos + reverse
  for (const entryName of State.mapEntries){
    const entry = spawn.entries?.[entryName];
    if (!entry) continue;

    const rows = Array.isArray(entry.d) ? entry.d : [];
    for (const r of rows){
      const bp = r?.[0];
      if (!bp) continue;

      if (!State.entryToDinos.has(entryName)) State.entryToDinos.set(entryName, []);
      State.entryToDinos.get(entryName).push(bp);

      if (!State.dinoToEntries.has(bp)) State.dinoToEntries.set(bp, []);
      State.dinoToEntries.get(bp).push(entryName);
    }
  }

  // build name index (label -> [bps])
  for (const bp of State.dinoToEntries.keys()){
    const cls = bpClass(bp);

    let d = dinos[bp];

    // fallback: match by class-name
    if (!d){
      for (const [k, v] of Object.entries(dinos)){
        if (bpClass(k) === cls){
          d = v;
          break;
        }
      }
    }

    if (!d) continue;

    for (const name of labelsForDinoObj(d)){
      if (!State.nameToBps.has(name)) State.nameToBps.set(name, []);
      State.nameToBps.get(name).push(bp);
    }
  }

  // sort
  for (const arr of State.nameToBps.values()) arr.sort();
  State.names = [...State.nameToBps.keys()].sort((a,b)=>a.localeCompare(b));
  State.entryList = [...State.mapEntries].sort((a,b)=>a.localeCompare(b));

  console.log("Map entries:", State.mapEntries.size);
  console.log("Dinos:", State.names.length);
}

/* ============================================================
   TOP BAR TOGGLE
============================================================ */
function setupTopBarToggle(){
  const btn = getControlsToggle();
  const topbar = getTopbar();
  if (!btn || !topbar) return;
  btn.onclick = () => topbar.classList.toggle("show-controls");
}

/* ============================================================
   LEAFLET
============================================================ */
let mapObj = null;

function initMap(image, size=[2048,2048]){
  const bounds = [[0,0],[size[1], size[0]]];
  const map = L.map("map", { crs: L.CRS.Simple, minZoom: -3, maxZoom: 2 });
  const overlay = L.imageOverlay(image, bounds).addTo(map);
  const layer = L.layerGroup().addTo(map);
  map.fitBounds(bounds);
  return { map, overlay, layer, bounds };
}

function clearDraw(){
  if (mapObj) mapObj.layer.clearLayers();
}

/* ============================================================
   DRAW
============================================================ */
function iterEntryGeometry(entryName){
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);
  const entry = geom?.entries?.[entryName];
  if (!entry) return [];

  const result = [];

  const managers = entry.m || {};
  for (const [mgrName, mgr] of Object.entries(managers)){

    // schema2 manager flags (c/u) + params (md/ii)
    const meta = {
      manager: mgrName,
      isCave: !!mgr?.c,
      isUntameable: !!mgr?.u,
      md: mgr?.md ?? null,
      ii: mgr?.ii ?? null,
    };

    if (Array.isArray(mgr.b)){
      for (const box of mgr.b){
        result.push({ type:"box", data: box, meta });
      }
    }

    if (Array.isArray(mgr.p)){
      for (const pt of mgr.p){
        result.push({ type:"point", data: pt, meta });
      }
    }
  }

  return result;
}

function entryTotalExpected(entryName){
  const rows = Global.spawn?.entries?.[entryName]?.d || [];
  let sum = 0;
  for (const r of rows){
    const gw = Number(r?.[1] || 0);
    const sm = Number(r?.[2] || 1);
    sum += gw * sm;
  }
  return sum;
}

function entryRarityForBps(entryName, bpSet){
  const rows = Global.spawn?.entries?.[entryName]?.d || [];
  const total = entryTotalExpected(entryName);
  if (total <= 0) return 0;

  let rarity = 0;

  for (const r of rows){
    const bp  = r?.[0];
    if (!bp || !bpSet.has(bp)) continue;

    const gw  = Number(r?.[1] || 0);
    const sm  = Number(r?.[2] || 1);
    const lim = Number(r?.[3] || 1);

    const expected = gw * sm;          // E
    const share = expected / total;    // S
    rarity += share * lim;             // R
  }

  return rarity; // typically small decimals
}

function drawEntry(entryName, clearFirst = true, scoreOverride = null, dinoUntameable = false){

  if (clearFirst) clearDraw();

  const score = Number(scoreOverride ?? 0);

  const geo = iterEntryGeometry(entryName);

  for (const g of geo){

    const meta = {
      ...g.meta,
      isUntameable: !!g.meta?.isUntameable || !!dinoUntameable
    };

    const rarityInfo = finalRarityForManager(entryName, meta, score);

    const color = rarityToColor(rarityInfo.finalLabel);

    const style = styleForEntry(meta, color);

    if (g.type === "box"){
      const [x,y,w,h] = g.data;
      if (![x,y,w,h].every(Number.isFinite)) continue;

      const rect = L.rectangle([[y,x],[y+h,x+w]], style).addTo(mapObj.layer);
      rect.bindTooltip(buildTooltip(entryName, meta, rarityInfo));
    }

    if (g.type === "point"){
      const [x,y] = g.data;
      if (![x,y].every(Number.isFinite)) continue;

      const pt = L.circleMarker([y,x], { radius:3, ...style }).addTo(mapObj.layer);
      pt.bindTooltip(buildTooltip(entryName, meta, rarityInfo));
    }
  }
}

function drawDino(name){
  clearDraw();

  const bps = State.nameToBps.get(name) || [];
  if (!bps.length) return;

  const bpSet = new Set(bps);

  // gather all entries for these bp(s)
  const entries = new Set();
  for (const bp of bps){
    for (const e of (State.dinoToEntries.get(bp) || [])){
      entries.add(e);
    }
  }

  for (const entryName of entries){
    const rarity = entryRarityForBps(entryName, bpSet);

    // only mark untameable if THIS entry contains an untameable BP among the selected ones
    const entryDinoUntameable = entryHasUntameableSelectedBp(entryName, bpSet);

    drawEntry(entryName, false, rarity, entryDinoUntameable);
  }
}

/* ============================================================
   UI
============================================================ */
function fillMapSelect(){
  const sel = getMapSelect();
  if (!sel){
    console.error("Map select element not found. Expected id='mapSelect' (or fallback ids).");
    return;
  }

  sel.innerHTML = "";
  for (const m of MAPS){
    const o = document.createElement("option");
    o.value = m.id;
    o.textContent = m.id;
    sel.appendChild(o);
  }

  sel.value = State.mapId;
  sel.onchange = async () => {
    State.mapId = sel.value;
    await onMapChanged();
  };
}

function fillMainSelect(){
  const sel = getMainSelect();
  if (!sel){
    console.error("Main select element not found. Expected id='mainSelect' (or fallback ids).");
    return;
  }

  sel.innerHTML = "";
  const list = (State.mode === "dino") ? State.names : State.entryList;

  for (const v of list){
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    sel.appendChild(o);
  }

  State.selection = list[0] || "";
  sel.value = State.selection;

  sel.onchange = () => {
    State.selection = sel.value;
    render();
  };
}

function render(){
  if (!State.selection) return;
  if (State.mode === "dino") drawDino(State.selection);
  else drawEntry(State.selection);
}

/* ============================================================
   MAP CHANGE
============================================================ */
async function onMapChanged(){
  const mapMeta = MAPS.find(m => m.id === State.mapId);

  // load geometry file using geomShort (filename prefix)
  const geom = await loadJSON(`${PATHS.geomDir}/${mapMeta.geomShort}_geom.json`);
  Global.mapGeom.set(mapMeta.geomShort, geom);

  const img = geom.image || `${PATHS.mapsDir}/${mapMeta.image}`;

  if (!mapObj) mapObj = initMap(img, geom.size || [2048,2048]);
  else mapObj.overlay.setUrl(img);

  rebuildMapIndices();
  fillMainSelect();
  render();
}

/* ============================================================
   BOOT
============================================================ */
async function boot(){
  Global.spawn = await loadJSON(PATHS.spawnGlobal);
  Global.dinos = await loadJSON(PATHS.dinoGlobal);

  setupTopBarToggle();
  fillMapSelect();

  const modeBtn = getModeToggle();
  if (modeBtn){
    modeBtn.onclick = () => {
      State.mode = (State.mode === "dino") ? "entry" : "dino";
      fillMainSelect();
      render();
    };
  } else {
    console.warn("Mode toggle button not found (expected id='modeToggle' or fallback).");
  }

  await onMapChanged();
}

boot().catch(err => {
  console.error("BOOT FAILED:", err);
  alert(err.message || String(err));
});