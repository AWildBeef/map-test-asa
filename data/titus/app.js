/* ============================================================
   ASA Spawn Maps
   Atlas V5 – clean full architecture
============================================================ */

/* ============================================================
   CONFIG
============================================================ */

const ASSET_VER = "dev-2026-03-05-V5";

const PATHS = {
  spawnGlobal: "data/spawn_global.json",
  dinoGlobal: "data/dinos_global.json",
  geomDir: "data/MapGeometry",
  mapsDir: "maps"
};

const MAPS = [
  { id:"The Island", geomShort:"TheIsland", mapCode:"TheIsland", image:"theisland.webp" },
  { id:"Scorched Earth", geomShort:"ScorchedEarth", mapCode:"SE", image:"scorchedearth.webp" },
  { id:"The Center", geomShort:"TheCenter", mapCode:"center", image:"thecenter.webp" },
  { id:"Ragnarok", geomShort:"Ragnarok", mapCode:"Rag", image:"ragnarok.webp" },
  { id:"Valguero", geomShort:"Valguero", mapCode:"Val", image:"valguero.webp" },
  { id:"Aberration", geomShort:"Aberration", mapCode:"AB", image:"aberration.webp" },
  { id:"Extinction", geomShort:"Extinction", mapCode:"EXT", image:"extinction.webp" },
  { id:"Lost Colony", geomShort:"LostColony", mapCode:"LC", image:"lostcolony.webp" },
  { id:"Astraeos", geomShort:"Astraeos", mapCode:"AST", image:"astraeos.webp" }
];


const SOURCES = [
  { id:"official", label:"Official" }
];

/* ============================================================
   GLOBAL DATA
============================================================ */

const Global = {
  spawn:null,
  dinos:null,
  mapGeom:new Map()
};

const State = {
  mapId:MAPS[0].id,
  mode:"dino",
  selection:"",

  mapEntries:new Set(),
  entryToDinos:new Map(),
  dinoToEntries:new Map(),
  nameToBps:new Map(),

  names:[],
  entryList:[]
};

/* ============================================================
   UI
============================================================ */

const UI = {

  sourceSelect: document.getElementById("sourceSelect"),
  sourceFancy: document.getElementById("sourceSelectFancy"),
  
  mapSelect:document.getElementById("mapSelect"),
  mapFancy:document.getElementById("mapSelectFancy"),

  dinoSelect:document.getElementById("dinoSelect"),
  dinoFancy:document.getElementById("dinoSelectFancy"),

  modeToggle:document.getElementById("modeToggle"),
  controlsToggle:document.getElementById("controlsToggle"),
  topbar:document.getElementById("topbar")
};

/* ============================================================
   UTILS
============================================================ */

function normSearch(s){
  return String(s||"").toLowerCase().replace(/[\s_-]/g,"");
}

async function loadJSON(url){
  const r=await fetch(`${url}?v=${ASSET_VER}`);
  if(!r.ok) throw new Error(url);
  return r.json();
}

function bpClass(bp){
  return String(bp||"").split(".").pop();
}

function labelsForDinoObj(d){

  const out = new Set();

  if(!d) return [];

  if(d.n) out.add(String(d.n));
  if(d.fn) out.add(String(d.fn));
  if(d.mn) out.add(String(d.mn));

  return [...out];
}
/* ============================================================
   RARITY ENGINE
============================================================ */

const RARITY_THRESHOLDS=[
  [0.03,"very common"],
  [0.009,"common"],
  [0.005,"uncommon"],
  [0.0009,"very uncommon"],
  [0.0001,"rare"],
  [-1,"very rare"]
];

function downshiftStepsForMinPct(pct){

  const p = Number(pct || 1);

  if(p >= 0.51) return 0;

  return 1;
}

function rarityFromWeight(w){
  for(const [t,l] of RARITY_THRESHOLDS){
    if(w>=t) return l;
  }
  return "very rare";
}

const MIN_GLOBAL_DOWNSHIFT = [
  [3,6]
];

function downshiftStepsForTotalMin(totalMin){

  const m = Number(totalMin || 0);

  if(m <= 0) return 0;

  for(const [thr,steps] of MIN_GLOBAL_DOWNSHIFT){

    if(m <= thr) return steps;
  }

  return 0;
}

const RARITY_ORDER = [
  "very common",
  "common",
  "uncommon",
  "very uncommon",
  "rare",
  "very rare"
];

function rarityToColor(r){

  r=String(r||"").toLowerCase();

  if(r.includes("very rare")) return "#ff0000";
  if(r.includes("rare")) return "#ff6600";
  if(r.includes("very uncommon")) return "#ffcc00";
  if(r.includes("uncommon")) return "#ffff00";
  if(r.includes("very common")) return "#00ff00";
  if(r.includes("common")) return "#b2ff00";

  return "#888";
}

function downgradeRarity(label,steps){

  if(!steps) return label;

  let i = RARITY_ORDER.indexOf(label);

  if(i < 0) i = RARITY_ORDER.length-1;

  const j = Math.min(RARITY_ORDER.length-1,i+steps);

  return RARITY_ORDER[j];
}
/* ============================================================
   SPAWN RARITY CALCULATION
============================================================ */

function entryTotalExpected(entryName){

  const rows=Global.spawn?.entries?.[entryName]?.d||[];

  let sum=0;

  for(const r of rows){

    const gw=Number(r?.[1]||0);
    const sm=Number(r?.[2]||1);

    sum+=gw*sm;
  }

  return sum;
}

function entryRarityForBps(entryName, bpSet){

  const rows = Global.spawn?.entries?.[entryName]?.d || [];
  if (!rows.length) return 0;

  let totalExpected = 0;
  let matchedRarity = 0;

  for (const r of rows){
    const rawBp = normalizeBp(r?.[0]);
    if (!rawBp) continue;

    const gw = Number(r?.[1] || 0);
    const sm = Number(r?.[2] || 1);
    const lim = Number(r?.[3] || 1);

    const baseExpected = gw * sm;
    if (baseExpected <= 0) continue;

    const outs = worldOutputsForBp(rawBp);

    for (const out of outs){
      const finalBp = normalizeBp(out?.[0]);
      const prob = Number(out?.[1] || 0);
      if (!finalBp || prob <= 0) continue;

      const expected = baseExpected * prob;
      totalExpected += expected;

      if (bpSet.has(finalBp)){
        // same formula you were already using:
        // rarity += (expected / total) * lim
        // but total is not known until after full pass, so accumulate numerator first
        matchedRarity += expected * lim;
      }
    }
  }

  if (totalExpected <= 0) return 0;

  return matchedRarity / totalExpected;
}

function entryManagerMinStats(entryName){

  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);
  const entry = geom?.entries?.[entryName];

  if(!entry) return { best:0,total:0 };

  const mins=[];

  for(const mgr of Object.values(entry.m || {})){

    const md = Number(mgr?.md || 0);

    if(md > 0) mins.push(md);
  }

  const best = mins.length ? Math.max(...mins) : 0;
  const total = mins.reduce((a,b)=>a+b,0);

  return { best,total };
}

function finalRarityForManager(entryName,meta,score){

  const baseLabel = rarityFromWeight(score);

  const {best,total} = entryManagerMinStats(entryName);

  const globalSteps = downshiftStepsForTotalMin(total);

  const pct = best>0 ? (meta.md || best)/best : 1;

  const managerSteps = downshiftStepsForMinPct(pct);

  return downgradeRarity(baseLabel,globalSteps+managerSteps);
}

/* ============================================================
   MAP RENDERING
============================================================ */

let mapObj=null;

function initMap(img,size=[2048,2048]){

  const bounds=[[0,0],[size[1],size[0]]];

  const map=L.map("map",{crs:L.CRS.Simple,minZoom:-3,maxZoom:2});
  const overlay=L.imageOverlay(img,bounds).addTo(map);

  const layer=L.layerGroup().addTo(map);

  map.fitBounds(bounds);

  return {map,overlay,layer,bounds};
}

function clearDraw(){
  mapObj?.layer.clearLayers();
}

function styleForEntry(meta,color){

  const style={
    color,
    weight:meta?.isCave?3:1,
    opacity:1,
    fillColor:color,
    fillOpacity:meta?.isCave?0.4:0.8
  };

  if(meta?.isUntameable) style.dashArray="3 3";

  return style;
}

/* ============================================================
   WORLD REPLACEMENTS
============================================================ */

function normalizeBp(bp){
  return String(bp || "").trim();
}

function getParentBp(bp){
  const d = Global.dinos?.dinos?.[bp];
  return normalizeBp(d?.p);
}

function ancestorDistance(childBp, ancestorBp){
  childBp = normalizeBp(childBp);
  ancestorBp = normalizeBp(ancestorBp);

  if (!childBp || !ancestorBp) return null;
  if (childBp === ancestorBp) return 0;

  let cur = childBp;
  let dist = 0;
  const seen = new Set();

  while (cur && !seen.has(cur) && dist < 200){
    seen.add(cur);
    cur = getParentBp(cur);
    dist += 1;
    if (cur === ancestorBp) return dist;
  }

  return null;
}

function worldRulesForCurrentMap(){
  const all = Global.spawn?.worldReplacements || {};
  return Array.isArray(all?.[State.mapId]) ? all[State.mapId] : [];
}

function worldOutputsForBp(bp){
  bp = normalizeBp(bp);
  if (!bp) return [[bp, 1.0]];

  const rules = worldRulesForCurrentMap();

  // 1) exact rules first
  for (const r of rules){
    if (r?.exact && normalizeBp(r?.from) === bp){
      return Array.isArray(r?.outs) && r.outs.length ? r.outs : [[bp, 1.0]];
    }
  }

  // 2) closest non-exact ancestor rule
  let bestRule = null;
  let bestDist = null;

  for (const r of rules){
    if (r?.exact) continue;

    const fromBp = normalizeBp(r?.from);
    if (!fromBp) continue;

    const dist = ancestorDistance(bp, fromBp);
    if (dist == null) continue;

    if (bestRule === null || dist < bestDist){
      bestRule = r;
      bestDist = dist;
    }
  }

  if (bestRule){
    return Array.isArray(bestRule?.outs) && bestRule.outs.length
      ? bestRule.outs
      : [[bp, 1.0]];
  }

  // 3) no rule
  return [[bp, 1.0]];
}

function getDinoObjByBp(bp){
  const dinos = Global.dinos?.dinos || {};
  if (dinos[bp]) return dinos[bp];

  const cls = bpClass(bp);
  for (const [k, v] of Object.entries(dinos)){
    if (bpClass(k) === cls) return v;
  }

  return null;
}

/* ============================================================
   DRAW ENTRY
============================================================ */

function drawEntry(entryName, rarityScore){

  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);

  const entry = geom?.entries?.[entryName];
  if (!entry) return;

  for (const mgr of Object.values(entry.m || {})) {

    const meta = {
      isCave: !!mgr?.c,
      isUntameable: !!mgr?.u,
      md: mgr?.md || 0
    };

    const rarityLabel = finalRarityForManager(entryName, meta, rarityScore);
    const color = rarityToColor(rarityLabel);
    const style = styleForEntry(meta, color);

    // boxes
    for (const box of mgr.b || []) {
      const [x, y, w, h] = box;
      if (![x, y, w, h].every(Number.isFinite)) continue;

      L.rectangle([[y, x], [y + h, x + w]], style)
        .addTo(mapObj.layer);
    }

    // points
    for (const pt of mgr.p || []) {
      const [x, y] = pt;
      if (![x, y].every(Number.isFinite)) continue;

      L.circleMarker([y, x], {
        radius: 3,
        color: style.color,
        weight: style.weight,
        opacity: style.opacity,
        fillColor: style.fillColor,
        fillOpacity: style.fillOpacity,
        dashArray: style.dashArray
      }).addTo(mapObj.layer);
    }
  }
}

/* ============================================================
   DRAW DINO
============================================================ */

function drawDino(name){

  clearDraw();

  const bps=State.nameToBps.get(name)||[];

  const bpSet=new Set(bps);

  const entries=new Set();

  for(const bp of bps){
    for(const e of State.dinoToEntries.get(bp)||[]){
      entries.add(e);
    }
  }

  for(const entry of entries){

    const rarity=entryRarityForBps(entry,bpSet);

    drawEntry(entry,rarity);
  }
}

/* ============================================================
   INDEX BUILDER
============================================================ */

function rebuildMapIndices(){

  const spawn = Global.spawn || {};

  State.mapEntries.clear();
  State.entryToDinos.clear();
  State.dinoToEntries.clear();
  State.nameToBps.clear();

  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const mapCode = mapMeta?.mapCode;

  // 1) which entries are on this map?
  for (const [entryName, maps] of Object.entries(spawn.entryMaps || {})){
    if (Array.isArray(maps) && maps.includes(mapCode)){
      State.mapEntries.add(entryName);
    }
  }

  // 2) build entry -> dinos and dino -> entries USING WORLD REPLACEMENTS
  for (const entryName of State.mapEntries){

    const rows = spawn.entries?.[entryName]?.d || [];
    const finalBpsForEntry = new Set();

    for (const r of rows){
      const rawBp = normalizeBp(r?.[0]);
      if (!rawBp) continue;

      const outs = worldOutputsForBp(rawBp);

      for (const out of outs){
        const finalBp = normalizeBp(out?.[0]);
        const prob = Number(out?.[1] || 0);

        if (!finalBp || prob <= 0) continue;

        finalBpsForEntry.add(finalBp);

        if (!State.dinoToEntries.has(finalBp)){
          State.dinoToEntries.set(finalBp, []);
        }
        State.dinoToEntries.get(finalBp).push(entryName);
      }
    }

    State.entryToDinos.set(entryName, [...finalBpsForEntry]);
  }

  // 3) build name -> bp index from FINAL OUTPUT dinos
  for (const bp of State.dinoToEntries.keys()){
    const d = getDinoObjByBp(bp);
    if (!d) continue;

    const labels = labelsForDinoObj(d);
    for (const name of labels){
      if (!State.nameToBps.has(name)){
        State.nameToBps.set(name, []);
      }
      State.nameToBps.get(name).push(bp);
    }
  }

  // 4) sort / dedupe
  for (const [bp, entries] of State.dinoToEntries.entries()){
    State.dinoToEntries.set(bp, [...new Set(entries)].sort());
  }

  for (const [entry, bps] of State.entryToDinos.entries()){
    State.entryToDinos.set(entry, [...new Set(bps)].sort());
  }

  for (const [name, bps] of State.nameToBps.entries()){
    State.nameToBps.set(name, [...new Set(bps)].sort());
  }

  State.names = [...State.nameToBps.keys()].sort((a,b)=>a.localeCompare(b));
  State.entryList = [...State.mapEntries].sort((a,b)=>a.localeCompare(b));
}

/* ============================================================
   DROPDOWN
============================================================ */

function mountFancyDropdown(native,host,placeholder){

  native.style.display="none";
  host.innerHTML="";

  const wrap=document.createElement("div");
  wrap.className="dd";

  const btn=document.createElement("button");
  btn.className="dd-btn";

  const label=document.createElement("div");
  label.className="dd-label";

  const caret=document.createElement("div");
  caret.className="dd-caret";
  caret.textContent="▾";

  btn.append(label,caret);

  const panel=document.createElement("div");
  panel.className="dd-panel";

  const search=document.createElement("input");
  search.className="dd-search";
  search.placeholder=placeholder;

  const list=document.createElement("div");
  list.className="dd-list";

  panel.append(search,list);
  wrap.append(btn,panel);
  host.appendChild(wrap);

  function rebuild(){

    list.innerHTML="";

    for(const o of native.options){

      if(!o.value) continue;

      const row=document.createElement("div");

      row.className="dd-item";
      row.textContent=o.textContent;
      row.dataset.search=normSearch(o.textContent);

      row.onclick=()=>{
        native.value=o.value;
        native.dispatchEvent(new Event("change"));
        close();
      };

      list.appendChild(row);
    }
  }

  function sync(){
    label.textContent=native.selectedOptions?.[0]?.textContent||"(Select)";
  }

  function open(){
    wrap.classList.add("open");
    search.focus();
  }

  function close(){
    wrap.classList.remove("open");
  }

  btn.onclick=()=>{
    wrap.classList.contains("open")?close():open();
  };

  search.oninput=()=>{
    const q=normSearch(search.value);

    list.querySelectorAll(".dd-item").forEach(el=>{
      el.style.display=el.dataset.search.includes(q)?"":"none";
    });
  };

  document.addEventListener("pointerdown",e=>{
    if(!wrap.contains(e.target)) close();
  });

  native.addEventListener("change",sync);

  rebuild();
  sync();
}

/* ============================================================
   UI SETUP
============================================================ */

function setupUI(){

  /* SOURCE SELECT */

  UI.sourceSelect.innerHTML = "";

  for(const s of SOURCES){

    const o = document.createElement("option");

    o.value = s.id;
    o.textContent = s.label;

    UI.sourceSelect.appendChild(o);
  }

  UI.sourceSelect.value = "official";

  UI.sourceSelect.onchange = async ()=>{

    // later this will swap data packs
    console.log("Source changed:", UI.sourceSelect.value);

    await onMapChanged();
  };

  mountFancyDropdown(
    UI.sourceSelect,
    UI.sourceFancy,
    "Search sources..."
  );

  UI.mapSelect.innerHTML="";

  for(const m of MAPS){

    const o=document.createElement("option");

    o.value=m.id;
    o.textContent=m.id;

    UI.mapSelect.appendChild(o);
  }

  UI.mapSelect.value=State.mapId;

  UI.mapSelect.onchange=async()=>{
    State.mapId=UI.mapSelect.value;
    await onMapChanged();
  };

  mountFancyDropdown(UI.mapSelect,UI.mapFancy,"Search maps...");

  rebuildDinoSelect();

  UI.modeToggle.onclick=()=>{
    State.mode=State.mode==="dino"?"entry":"dino";
    rebuildDinoSelect();
    render();
  };

  UI.controlsToggle.onclick=()=>{
    UI.topbar.classList.toggle("show-controls");
  };
}

function rebuildDinoSelect(){

  const list=State.mode==="dino"?State.names:State.entryList;

  UI.dinoSelect.innerHTML="";

  for(const v of list){

    const o=document.createElement("option");

    o.value=v;
    o.textContent=v;

    UI.dinoSelect.appendChild(o);
  }

  State.selection=list[0]||"";

  UI.dinoSelect.value=State.selection;

  UI.dinoSelect.onchange=()=>{
    State.selection=UI.dinoSelect.value;
    render();
  };

  mountFancyDropdown(
    UI.dinoSelect,
    UI.dinoFancy,
    State.mode==="dino"?"Search dinos...":"Search spawn entries..."
  );
}

/* ============================================================
   RENDER
============================================================ */

function render(){

  if(!State.selection) return;

  if(State.mode==="dino")
    drawDino(State.selection);
}

/* ============================================================
   MAP CHANGE
============================================================ */

async function onMapChanged(){

  const mapMeta=MAPS.find(m=>m.id===State.mapId);

  const geom=await loadJSON(`${PATHS.geomDir}/${mapMeta.geomShort}_geom.json`);

  Global.mapGeom.set(mapMeta.geomShort,geom);

  const img=geom.image||`${PATHS.mapsDir}/${mapMeta.image}`;

  if(!mapObj)
    mapObj=initMap(img,geom.size||[2048,2048]);
  else
    mapObj.overlay.setUrl(img);

  rebuildMapIndices();
  rebuildDinoSelect();

  render();
}

/* ============================================================
   BOOT
============================================================ */

async function boot(){

  Global.spawn=await loadJSON(PATHS.spawnGlobal);
  Global.dinos=await loadJSON(PATHS.dinoGlobal);

  setupUI();

  await onMapChanged();
}

boot().catch(e=>{
  console.error(e);
  alert(e.message||e);
});