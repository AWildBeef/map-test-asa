/* ============================================================
   app2.js -- Atlas rebuild v3 (robust DOM + correct geo drawing)
============================================================ */

const ASSET_VER = "dev-2026-03-04-C";

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
  entryMeta:new Map(),
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

function styleForEntry(meta, color){
  const isCave = !!meta?.isCave;
  const isUntameable = !!meta?.isUntameable;

  return {
    color,
    weight: isCave ? 3 : 1,
    opacity: 1,
    fillColor: color,
    fillOpacity: isCave ? 0.35 : 0.65,
    dashArray: isUntameable ? "6 6" : null,
  };
}


// ---------- DOM helpers (prevents "sel is null" crashes) ----------
function byIdAny(...ids){
  for (const id of ids){
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

function getMainSelect(){
  // try the expected id first, then common alternates
  return byIdAny("mainSelect", "dinoSelect", "entrySelect", "spawnSelect", "selectMain");
}
function getMapSelect(){
  return byIdAny("mapSelect", "mapDropdown", "selectMap");
}
function getModeToggle(){
  return byIdAny("modeToggle", "viewToggle", "toggleMode");
}
function getControlsToggle(){
  return byIdAny("controlsToggle", "filterToggle", "toggleFilters");
}
function getTopbar(){
  return byIdAny("topbar", "controls", "filters");
}

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

  // 1) map -> entries via spawn.entryMaps: entryName -> [mapCodes]
  for (const [entryName, mapList] of Object.entries(spawn.entryMaps || {})){
    if (Array.isArray(mapList) && mapCode && mapList.includes(mapCode)){
      State.mapEntries.add(entryName);
    }
  }

  // 2) entries -> dinos + reverse
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

  // 3) build name index (label -> [bps])
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
  for (const mgr of Object.values(managers)){
    if (Array.isArray(mgr.b)){
      for (const box of mgr.b) result.push({ type:"box", data: box });
    }
    if (Array.isArray(mgr.p)){
      for (const pt of mgr.p) result.push({ type:"point", data: pt });
    }
  }
  return result;
}

function drawEntry(entryName, clearFirst = true){
  if (clearFirst) clearDraw();

  const geo = iterEntryGeometry(entryName);

  for (const g of geo){
    if (g.type === "box"){
      const [x,y,w,h] = g.data;
      if (![x,y,w,h].every(Number.isFinite)) continue;
      L.rectangle([[y,x],[y+h,x+w]], { color:"#00FF00", weight:1 }).addTo(mapObj.layer);
    }
    if (g.type === "point"){
      const [x,y] = g.data;
      if (![x,y].every(Number.isFinite)) continue;
      L.circleMarker([y,x], { radius:3 }).addTo(mapObj.layer);
    }
  }
}

function drawDino(name){
  clearDraw();

  const bps = State.nameToBps.get(name) || [];
  const entries = new Set();

  for (const bp of bps){
    for (const e of (State.dinoToEntries.get(bp) || [])){
      entries.add(e);
    }
  }

  for (const entry of entries){
    drawEntry(entry, false); // <-- don't clear between entries
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