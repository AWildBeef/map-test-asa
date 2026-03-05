/* ============================================================
   app2.js — Clean rebuild (vanilla v1)
   Depends: Leaflet (L)
   Expects: your HTML has:
     #map (div)
     #mapSelect (select)
     #modeToggle (button)
     #mainSelect (select)   // dinos or entries depending on mode
     #infoPanel (div)       // panel container (you said HTML/CSS is locked in; map this id)
   ============================================================ */

const ASSET_VER = "dev-2026-03-04-A"; // bump to bust cache when needed

// ---------- Paths ----------
const PATHS = {
  spawnGlobal: `data/spawn_global.json`,
  dinoGlobal:  `data/dinos_global.json`,
  geomDir:     `data/MapGeometry`,      // adjust if your folder differs
  mapsDir:     `maps`,                  // your webp backgrounds folder
};

// ---------- Maps (must match your exports) ----------
const MAPS = [
  { id: "The Island",     short: "TheIsland",     image: "theisland.webp" },
  { id: "Scorched Earth", short: "ScorchedEarth", image: "scorchedearth.webp" },
  { id: "The Center",     short: "TheCenter",     image: "thecenter.webp" },
  { id: "Ragnarok",       short: "Ragnarok",      image: "ragnarok.webp" },
  { id: "Valguero",       short: "Valguero",      image: "valguero.webp" },
  { id: "Aberration",     short: "Aberration",    image: "aberration.webp" },
  { id: "Extinction",     short: "Extinction",    image: "extinction.webp" },
  { id: "Lost Colony",    short: "LostColony",    image: "lostcolony.webp" },
  { id: "Astraeos",       short: "Astraeos",      image: "astraeos.webp" },
];

function geomPathForMap(mapShort){
  return `${PATHS.geomDir}/${mapShort}_geom.json`;
}

function imagePathForMap(mapMeta){
  return `${PATHS.mapsDir}/${mapMeta.image}`;
}

// ---------- Rarity ----------
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

// ---------- Tiny helpers ----------
function bpClass(bp){
  return String(bp || "").split(".").pop();
}


const jsonCache = new Map();

async function loadJSON(url){
  const key = `${url}?v=${ASSET_VER}`;
  if (jsonCache.has(key)) return jsonCache.get(key);
  const res = await fetch(key);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const data = await res.json();
  jsonCache.set(key, data);
  return data;
}

function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function cleanName(s){
  const x = String(s ?? "").trim();
  return x.length ? x : "";
}

function labelsForDinoObj(d){
  // supports your compact dinos_global: { n, fn, mn } (and/or fallback)
  const fn = cleanName(d?.fn);
  const mn = cleanName(d?.mn);
  const n  = cleanName(d?.n);

  const out = [];
  if (fn) out.push(fn);
  if (mn && mn.toLowerCase() !== fn.toLowerCase()) out.push(mn);
  if (out.length) return out;

  if (n) return [n];
  return [];
}

// ============================================================
// Global data model (JS “GlobalCtx”)
// ============================================================
const Global = {
  spawn: null,     // spawn_global.json
  dinos: null,     // dinos_global.json
  mapGeom: new Map(), // mapShort -> geom json
};

// state = single source of truth
const State = {
  mapId: MAPS[0].id,
  mode: "dino", // "dino" | "entry"
  selection: "",

  // Derived indices per current map:
  mapEntrySet: new Set(),     // entries used on map
  caveEntrySet: new Set(),    // entries flagged cave in spawn map table
  entryToDinos: new Map(),    // entryName -> array of dinoBp
  dinoToEntries: new Map(),   // dinoBp -> array of entryName

  // dropdown index (label -> [bp...])
  nameToBps: new Map(),
  names: [],
  entryList: [],
};

// ============================================================
// Top Bar Toggle (Filter button)
// ============================================================

function setupTopBarToggle(){
  const btn = document.getElementById("controlsToggle");
  const topbar = document.getElementById("topbar");

  if (!btn || !topbar) return;

  btn.addEventListener("click", () => {
    topbar.classList.toggle("show-controls");
  });
}



// ============================================================
// Leaflet map
// ============================================================
let mapObj = null;

function initMap(imageUrl, size=[2048,2048]){
  const [w,h] = size;
  const bounds = [[0,0],[h,w]];

  const map = L.map("map", {
    crs: L.CRS.Simple,
    minZoom: -3,
    maxZoom: 2,
    zoomSnap: 0.25,
    zoomDelta: 0.25,
    zoomControl: true,
  });

  const overlay = L.imageOverlay(imageUrl, bounds, { crossOrigin:true }).addTo(map);

  const layer = L.layerGroup().addTo(map);
  const caveLayer = L.layerGroup().addTo(map);

  map.fitBounds(bounds);
  map.setMaxBounds(bounds);
  map.options.maxBoundsViscosity = 1.0;

  return { map, overlay, bounds, size:{w,h}, layer, caveLayer };
}

function updateMapBase(imageUrl, size=[2048,2048]){
  if (!mapObj) return;
  const [w,h] = size;
  const bounds = [[0,0],[h,w]];
  mapObj.overlay.setUrl(imageUrl);
  mapObj.overlay.setBounds(bounds);
  mapObj.map.setMaxBounds(bounds);
  mapObj.map.fitBounds(bounds);
  mapObj.bounds = bounds;
  mapObj.size = { w,h };
}

// ============================================================
// Build indices for the selected map (fast, reusable)
// ============================================================
function rebuildMapIndices(){
  const spawn = Global.spawn;
  const dinos = Global.dinos;
  console.log("Spawn keys:", Object.keys(spawn || {}));
  console.log("EntryMaps keys:", Object.keys(spawn?.entryMaps || {}));
  console.log("Entries keys:", Object.keys(spawn?.entries || {}));

  State.mapEntrySet = new Set();
  console.log("Entries on this map:", State.mapEntrySet.size);
  State.caveEntrySet = new Set();
  State.entryToDinos = new Map();
  console.log("Entry→Dinos count:", State.entryToDinos.size);
  State.dinoToEntries = new Map();
  console.log("Dino→Entries count:", State.dinoToEntries.size);


  // 1) which entries are used on this map?
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const mapShort = mapMeta.short;

  for (const [entryName, maps] of Object.entries(spawn?.entryMaps || {})){

    if (!Array.isArray(maps)) continue;

    if (maps.includes(mapShort)){
      State.mapEntrySet.add(entryName);
    }

  }

  // 2) entry -> dinos, and reverse (only for entries on this map)
  // spawn.entries[entryName] = { bp, d: [ [dinoBp, gw, sm, lim, chances], ... ] }
  for (const entryName of State.mapEntrySet){
    const e = spawn?.entries?.[entryName];
    const rows = Array.isArray(e?.d) ? e.d : [];
    const list = [];

    for (const r of rows){
      const dinoBp = r?.[0];
      if (!dinoBp) continue;
      list.push(dinoBp);

      if (!State.dinoToEntries.has(dinoBp)) State.dinoToEntries.set(dinoBp, []);
      State.dinoToEntries.get(dinoBp).push(entryName);
    }

    State.entryToDinos.set(entryName, list);
  }

  // 3) build dropdown names for dinos-on-this-map only
  State.nameToBps = new Map();
  for (const [bp, entryList] of State.dinoToEntries.entries()){
    const d = dinos?.dinos?.[bp];
    if (!d) continue;

    const labels = labelsForDinoObj(d);
    for (const label of labels){
      if (!State.nameToBps.has(label)) State.nameToBps.set(label, []);
      State.nameToBps.get(label).push(bp);
    }
  }

  // stable sort bp lists + names
  for (const [label, arr] of State.nameToBps.entries()){
    arr.sort();
  }

  State.names = [...State.nameToBps.keys()].sort((a,b)=>a.localeCompare(b));
  State.entryList = [...State.mapEntrySet].sort((a,b)=>a.localeCompare(b));
}

// ============================================================
// Geometry access
// ============================================================
function getGeomForEntry(entryName){
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta.short);
  const entry = geom?.entries?.[entryName];
  return entry || null;
}

function iterEntryGeometry(entryName){
  // yields { mgrId, boxes:[[x,y,w,h]...], points:[[x,y]...]} across managers
  const entry = getGeomForEntry(entryName);
  const mgrs = entry?.m;
  if (!mgrs || typeof mgrs !== "object") return [];

  const out = [];
  for (const [mgrId, node] of Object.entries(mgrs)){
    const b = Array.isArray(node?.b) ? node.b : [];
    const p = Array.isArray(node?.p) ? node.p : [];
    out.push({ mgrId, boxes:b, points:p });
  }
  return out;
}

// ============================================================
// Drawing
// ============================================================
function clearDraw(){
  if (!mapObj) return;
  mapObj.layer.clearLayers();
  mapObj.caveLayer.clearLayers();
}

function drawEntry(entryName){
  clearDraw();

  const spawn = Global.spawn;
  const e = spawn?.entries?.[entryName];
  if (!e) return;

  // Pick one “representative” weight for the entry (v1)
  // Later we can show per-dino weight; for now, entry rarity is based on sum groupWeight
  const rows = Array.isArray(e.d) ? e.d : [];
  const sumGw = rows.reduce((acc,r)=>acc + Number(r?.[1] || 0), 0);
  const rarity = rarityFromWeight(sumGw);
  const color = rarityToColor(rarity);

  const isCave = State.caveEntrySet.has(entryName);
  const target = isCave ? mapObj.caveLayer : mapObj.layer;

  const geo = iterEntryGeometry(entryName);
  for (const g of geo){
    for (const b of g.boxes){
      const [x,y,w,h] = b;
      if (![x,y,w,h].every(Number.isFinite)) continue;
      L.rectangle([[y,x],[y+h,x+w]], {
        color,
        weight: isCave ? 3 : 1,
        opacity: 1,
        fillColor: color,
        fillOpacity: isCave ? 0.45 : 0.75,
      }).addTo(target);
    }

    for (const p of g.points){
      const [x,y] = p;
      if (![x,y].every(Number.isFinite)) continue;
      L.circleMarker([y,x], {
        radius: 4,
        color,
        weight: isCave ? 2 : 1,
        opacity: 1,
        fillColor: color,
        fillOpacity: 0.85,
      }).addTo(target);
    }
  }

  renderInfoForEntry(entryName, { sumGw, rarity, isCave });
}

function drawDinoByName(displayName){
  clearDraw();

  const bps = State.nameToBps.get(displayName) || [];
  if (!bps.length) return;

  const spawn = Global.spawn;

  // gather all entries for those bps
  const entries = new Map(); // entryName -> { sumGw, rows:[] }
  for (const bp of bps){
    const eList = State.dinoToEntries.get(bp) || [];
    for (const entryName of eList){
      const entry = spawn?.entries?.[entryName];
      const rows = Array.isArray(entry?.d) ? entry.d : [];

      // find row for this dino bp inside this entry
      for (const r of rows){
        const dinoBp = r?.[0];
        if (dinoBp !== bp) continue;

        const gw = Number(r?.[1] || 0);
        if (!entries.has(entryName)) entries.set(entryName, { sumGw:0, rows:[] });
        entries.get(entryName).sumGw += gw;
        entries.get(entryName).rows.push({ bp, gw, sm:r?.[2], lim:r?.[3], chances:r?.[4] });
      }
    }
  }

  // draw each entry geometry tinted by rarity (based on this dino’s gw sum within entry)
  for (const [entryName, info] of entries.entries()){
    const rarity = rarityFromWeight(info.sumGw);
    const color = rarityToColor(rarity);

    const isCave = State.caveEntrySet.has(entryName);
    const target = isCave ? mapObj.caveLayer : mapObj.layer;

    const geo = iterEntryGeometry(entryName);
    for (const g of geo){
      for (const b of g.boxes){
        const [x,y,w,h] = b;
        if (![x,y,w,h].every(Number.isFinite)) continue;
        L.rectangle([[y,x],[y+h,x+w]], {
          color,
          weight: isCave ? 3 : 1,
          opacity: 1,
          fillColor: color,
          fillOpacity: isCave ? 0.45 : 0.75,
        }).addTo(target);
      }
      for (const p of g.points){
        const [x,y] = p;
        if (![x,y].every(Number.isFinite)) continue;
        L.circleMarker([y,x], {
          radius: 4,
          color,
          weight: isCave ? 2 : 1,
          opacity: 1,
          fillColor: color,
          fillOpacity: 0.85,
        }).addTo(target);
      }
    }
  }

  renderInfoForDino(displayName, bps, entries);
}

// ============================================================
// Info Panel (simple v1)
// ============================================================
function setInfo(html){
  const el = document.getElementById("infoPanel");
  if (!el) return;
  el.innerHTML = html;
}

function copyLine(label, value){
  const v = String(value ?? "");
  return `
    <div class="info-subtitle">${esc(label)}</div>
    <div class="info-mono copy-on-click" data-copy="${esc(v)}">${esc(v || "(none)")}</div>
  `;
}

document.addEventListener("click", (e) => {
  const el = e.target.closest(".copy-on-click");
  if (!el) return;
  const text = el.getAttribute("data-copy") || el.textContent || "";
  navigator.clipboard?.writeText(text.trim());
});

function renderInfoForEntry(entryName, meta){
  const spawn = Global.spawn;
  const entryBp = spawn?.entries?.[entryName]?.bp || "";

  setInfo(`
    <div class="panel-title">${esc(entryName)}</div>
    <div class="info-submeta">Spawn Entry</div>

    ${copyLine("Entry Blueprint", entryBp)}
    <div class="info-subtitle">Rarity</div>
    <div class="info-row">
      <span class="badge" style="background:${rarityToColor(meta.rarity)}">${esc(meta.rarity)}</span>
      ${meta.isCave ? `<span class="badge badge-cave">Cave</span>` : ``}
    </div>

    <div class="info-subtitle">Entry Weight (sum)</div>
    <div class="info-mono">${esc(meta.sumGw.toFixed(6))}</div>
  `);
}

function renderInfoForDino(displayName, bps, entriesMap){
  const dinos = Global.dinos?.dinos || {};
  const first = dinos[bps[0]] || {};
  const allBps = bps.filter(Boolean);

  // build “also known as” line if sex names exist
  const labels = labelsForDinoObj(first);
  const sexLine = (labels.length > 1)
    ? `<div class="info-submeta">Also: ${esc(labels.join(" / "))}</div>`
    : ``;

  const entryBlocks = [...entriesMap.entries()]
    .sort((a,b)=>a[0].localeCompare(b[0]))
    .map(([entryName, info]) => {
      const rarity = rarityFromWeight(info.sumGw);
      const color = rarityToColor(rarity);
      const isCave = State.caveEntrySet.has(entryName);

      // show a compact meta line using the first row (good enough for v1)
      const r0 = info.rows[0] || {};
      const gw = Number(r0.gw || 0).toFixed(6);
      const lim = (r0.lim != null) ? `${(Number(r0.lim)*100).toFixed(2)}%` : "";
      const chances = (r0.chances != null && String(r0.chances).trim())
        ? String(r0.chances)
        : "";

      return `
        <div class="entry-row">
          <div class="entry-name">
            <span class="dot" style="background:${color}"></span>
            ${esc(entryName)}
            ${isCave ? `<span class="badge badge-cave">Cave</span>` : ``}
          </div>
          <div class="entry-meta">
            <div class="entry-meta-line">Weight: ${esc(gw)}</div>
            ${chances ? `<div class="entry-meta-line">Chances: ${esc(chances)}</div>` : ``}
            ${lim ? `<div class="entry-meta-line">Max: ${esc(lim)}</div>` : ``}
          </div>
        </div>
      `;
    }).join("");

  setInfo(`
    <div class="panel-title">${esc(displayName)}</div>
    ${sexLine}

    ${copyLine("Blueprint(s)", allBps.join("\n"))}

    <div class="info-subtitle">Spawn entries (${entriesMap.size})</div>
    <div class="entries">${entryBlocks || `<div class="muted">No entries.</div>`}</div>
  `);
}

// ============================================================
// Dropdown wiring
// ============================================================
function fillMapSelect(){
  const sel = document.getElementById("mapSelect");
  if (!sel) return;

  sel.innerHTML = "";
  for (const m of MAPS){
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.id;
    sel.appendChild(opt);
  }

  sel.value = State.mapId;
  sel.addEventListener("change", async () => {
    State.mapId = sel.value;
    await onMapChanged();
  });
}

function syncModeButton(){
  const btn = document.getElementById("modeToggle");
  if (!btn) return;
  btn.textContent = (State.mode === "dino") ? "Dino View" : "Spawn View";
}

function fillMainSelect(){
  const sel = document.getElementById("mainSelect");
  if (!sel) return;

  sel.innerHTML = "";

  if (State.mode === "dino"){
    for (const name of State.names){
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    }
    State.selection = State.names[0] || "";
  } else {
    for (const entryName of State.entryList){
      const opt = document.createElement("option");
      opt.value = entryName;
      opt.textContent = entryName;
      sel.appendChild(opt);
    }
    State.selection = State.entryList[0] || "";
  }

  sel.value = State.selection;

  sel.onchange = () => {
    State.selection = sel.value;
    render();
  };
}

async function onMapChanged(){
  // load geometry for this map
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = await loadJSON(geomPathForMap(mapMeta.short));
  Global.mapGeom.set(mapMeta.short, geom);

  // swap background
  const imgUrl = geom?.image ? geom.image : imagePathForMap(mapMeta);
  const size = Array.isArray(geom?.size) ? geom.size : [2048,2048];

  if (!mapObj){
    mapObj = initMap(imgUrl, size);
  } else {
    updateMapBase(imgUrl, size);
  }

  rebuildMapIndices();
  fillMainSelect();
  render();
}

function render(){
  if (!State.selection){
    clearDraw();
    setInfo(`<div class="muted">Nothing selected.</div>`);
    return;
  }

  if (State.mode === "dino"){
    drawDinoByName(State.selection);
  } else {
    drawEntry(State.selection);
  }
}

// ============================================================
// Boot
// ============================================================
async function boot(){
  // load globals once
  setupTopBarToggle();
  Global.spawn = await loadJSON(PATHS.spawnGlobal);
  Global.dinos = await loadJSON(PATHS.dinoGlobal);

  fillMapSelect();

  const modeBtn = document.getElementById("modeToggle");
  if (modeBtn){
    modeBtn.addEventListener("click", () => {
      State.mode = (State.mode === "dino") ? "entry" : "dino";
      syncModeButton();
      fillMainSelect();
      render();
    });
  }
  syncModeButton();

  await onMapChanged();
}

boot().catch(err => {
  console.error("BOOT FAILED:", err);
  alert(err.message || String(err));
});