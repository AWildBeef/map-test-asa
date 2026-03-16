/* ============================================================
   ASA Spawn Maps
   Atlas V5 – clean full architecture
============================================================ */

/* ============================================================
   CONFIG
============================================================ */

const ASSET_VER = "dev-2026-03-05-V6";

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
  {
    id:"Astraeos",
    geomShort:"Astraeos",
    mapCode:"AST",
    image:"astraeos.webp",
    backgrounds: [
      { id:"hand", label:"In Game", url:"maps/Astraeos_IngameMap.webp" },
      { id:"sat",  label:"Satellite", url:"maps/astraeos.webp" }
    ],
    defaultBg:"sat"
  }
];
const jsonCache = {};

let SOURCES = [];

async function buildSources(){
  const registry = await loadJSON("mods_registry.json");

  const mods = (registry.mods || []).map(m => ({
    id: String(m.id),
    name: m.name,
    label: m.name,
    file: `data/mods/${m.id}.json`,
    group: m.group || "",
    order: Number.isFinite(m.order) ? m.order : 9999,
    groupOrder: Number.isFinite(m.groupOrder) ? m.groupOrder : 9999,
    kind: "mod"
  }));

  const groupMap = new Map();

  for (const m of mods){
    if (!m.group) continue;
    if (!groupMap.has(m.group)) groupMap.set(m.group, []);
    groupMap.get(m.group).push(m);
  }

  const groupSources = [...groupMap.entries()].map(([group, members]) => ({
    id: `group:${group}`,
    name: `All ${group}`,
    label: `All ${group}`,
    group,
    members: members.map(m => m.id),
    kind: "group",
    order: -1,
    groupOrder: members[0]?.groupOrder ?? 9999
  }));

  mods.sort((a,b)=>
    (a.groupOrder - b.groupOrder) ||
    String(a.group || "").localeCompare(String(b.group || "")) ||
    (a.order - b.order) ||
    a.name.localeCompare(b.name)
  );

  return [
    {
      id:"official",
      name:"Official",
      label:"Official",
      spawn: PATHS.spawnGlobal,
      dinos: PATHS.dinoGlobal,
      order: 0,
      kind: "official"
    },
    ...groupSources,
    ...mods
  ];
}

/* ============================================================
   GLOBAL DATA
============================================================ */

const Global = {
  spawn: null,
  dinos: null,
  baseSpawn: null,
  baseDinos: null,
  modMeta: null,
  mapGeom: new Map()
};

const State = {
  mapId:MAPS[0].id,
  mode:"dino",
  selection:"",
  selections: {
    dino: "",
    entry: ""
  },

  mapEntries:new Set(),
  entryToDinos:new Map(),
  dinoToEntries:new Map(),
  nameToBps:new Map(),

  names:[],
  entryList:[]
};

const entryVisibility = {};

let dockControl = null;
let dockState = { mapMeta: null, cfg: null };

const poiVisibility = {
  tributeTerminals: true,
  supplyCrates: false,
  playerStarts: false,
  explorerNotes: false,
  missions: false,
  hordeEvents: false,
  cityTerminals: false,
  beacons: false
};

let showRarityLegend = false;

const drawStyle = {
  useRarity: true,
  color: "#00ff88",
  opacity: 0.8
};

const urlParams = new URLSearchParams(window.location.search);

const EMBED_MODE = urlParams.get("embed") === "1" || window.self !== window.top;

const EMBED_SOURCE = urlParams.get("source") || "";
const EMBED_GROUP = urlParams.get("group") || "";
const EMBED_MAP = urlParams.get("map") || "";
const EMBED_MODE_LOCK = urlParams.get("mode") || "";

const EMBED_ALLOW_OFFICIAL = urlParams.get("allowOfficial") === "1";
const EMBED_HIDE_SOURCE = urlParams.get("hideSource") === "1";
const EMBED_HIDE_MAP = urlParams.get("hideMap") === "1";
const EMBED_HIDE_MODE = urlParams.get("hideMode") === "1";
const EMBED_HIDE_TOPBAR = urlParams.get("hideTopbar") === "1";

const viewOptions = {
  includeOfficialInEntryPanels: false,
  includeOfficialInItemPanels: false
};

function isBlueprintFromActiveMod(bp){
  if (activeSourceIsOfficial()) return true;

  const allowed = modBlueprintSet();
  return allowed.has(bp);
}


if (EMBED_MODE) {
  document.body.classList.add("embed-mode");
}

function filterSourcesForEmbed(allSources){
  if (!EMBED_MODE) return allSources;
  if (!EMBED_SOURCE && !EMBED_GROUP) return allSources;

  if (EMBED_SOURCE){
    const src = allSources.find(s => s.id === EMBED_SOURCE);
    if (!src) return [];

    const allowed = new Set([src.id]);

    if (src.kind === "group") {
      for (const mid of (src.members || [])) allowed.add(mid);
    }

    if (EMBED_ALLOW_OFFICIAL) {
      allowed.add("official");
    }

    return allSources.filter(s => allowed.has(s.id));
  }

  if (EMBED_GROUP){
    const groupName = EMBED_GROUP.trim().toLowerCase();

    const allowed = new Set();

    for (const s of allSources){
      if (String(s.group || "").trim().toLowerCase() === groupName) {
        allowed.add(s.id);
      }
    }

    const groupSource = allSources.find(s =>
      s.kind === "group" &&
      String(s.group || "").trim().toLowerCase() === groupName
    );

    if (groupSource) {
      allowed.add(groupSource.id);
    }

    if (EMBED_ALLOW_OFFICIAL) {
      allowed.add("official");
    }

    return allSources.filter(s => allowed.has(s.id));
  }

  return allSources;
}

function selectionListForMode(mode){
  return mode === "dino" ? State.names : State.entryList;
}

function syncSelectionForMode(mode){
  const list = selectionListForMode(mode);
  const saved = State.selections[mode] || "";

  if (saved && list.includes(saved)) {
    State.selection = saved;
  } else {
    State.selection = "";
  }
}

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

function anyPoisVisible(){
  return Object.values(poiVisibility).some(Boolean);
}

function syncModeButton(){
  if (!UI.modeToggle) return;
  UI.modeToggle.textContent = State.mode === "dino" ? "Dino View" : "Spawn View";
}

function entryVisibilityKey(dinoKey, idx){
  return `${State.mapId}::${State.mode}::${dinoKey}::${idx}`;
}

function isEntryVisible(dinoKey, idx){
  const key = entryVisibilityKey(dinoKey, idx);
  return entryVisibility[key] ?? true;
}

/* ============================================================
   UTILS
============================================================ */

function nudgeMapForTopbarToggle(prevHeight, nextHeight){
  if (!mapObj?.map) return;

  const delta = Number(nextHeight || 0) - Number(prevHeight || 0);
  if (!delta) return;

  mapObj.map.invalidateSize();

  // positive delta = controls opened taller
  // pan map upward visually by moving center downward in screen space
  mapObj.map.panBy([0, Math.round(delta * 0.5)], {
    animate: false
  });
}

function fitOptionsForUI(){
  const isMobile = window.innerWidth <= 640;

  const topbar = UI.topbar || document.getElementById("topbar");
  const expanded = topbar?.classList.contains("show-controls");
  const topbarH = expanded ? (topbar?.offsetHeight ?? 0) : 0;

  const bottomSafe = isMobile ? 70 : 40;

  const padX = isMobile ? 6 : 20;
  const padTop = isMobile ? 6 : 10;
  const padBottom = isMobile ? Math.max(bottomSafe, 60) : 20;

  return {
    paddingTopLeft: [padX, padTop + topbarH],
    paddingBottomRight: [padX, padBottom]
  };
}

function refitMapForUI(){
  if (!mapObj?.map || !mapObj?.bounds) return;

  mapObj.map.invalidateSize();
  map.fitBounds(bounds, {
    paddingTopLeft: [6, 6],
    paddingBottomRight: [6, 70]
  });
}

function mergeEntryTables(baseEntries, modEntries){
  const out = { ...baseEntries };

  for (const [entryName, modEntry] of Object.entries(modEntries || {})){
    if (!out[entryName]){
      out[entryName] = {
        bp: modEntry?.bp || "",
        d: [...(modEntry?.d || [])]
      };
      continue;
    }

    const baseRows = Array.isArray(out[entryName].d) ? out[entryName].d : [];
    const modRows = Array.isArray(modEntry?.d) ? modEntry.d : [];

    out[entryName] = {
      bp: out[entryName].bp || modEntry?.bp || "",
      d: [...baseRows, ...modRows]
    };
  }

  return out;
}

function mergeWorldReplacementTables(baseWR, modWR){
  const out = {};

  const keys = new Set([
    ...Object.keys(baseWR || {}),
    ...Object.keys(modWR || {})
  ]);

  for (const k of keys){
    out[k] = [
      ...(Array.isArray(baseWR?.[k]) ? baseWR[k] : []),
      ...(Array.isArray(modWR?.[k]) ? modWR[k] : [])
    ];
  }

  return out;
}

function activeSourceIsOfficial(){
  return !Global.modMeta;
}

function modBlueprintSet(){
  if (!Global.modMeta?.dinos) return new Set();
  return new Set(Object.keys(Global.modMeta.dinos));
}

function normSearch(s){
  return String(s||"").toLowerCase().replace(/[\s_-]/g,"");
}

async function loadJSON(path){
  const url = `${path}?v=${ASSET_VER}`;

  if (jsonCache[url]) return jsonCache[url];

  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to load ${path}`);

  const data = await r.json();
  jsonCache[url] = data;
  return data;
}

function bpClass(bp){
  return String(bp||"").split(".").pop();
}

function buildSourceDrillTree() {
  const root = { label: "Sources", children: [] };

  const official = SOURCES.find(s => s.id === "official");
  if (official) {
    root.children.push({ label: official.name, value: official.id });
  }

  const modsFolder = { label: "Mods", children: [] };
  const modSources = SOURCES.filter(s => s.id !== "official");

  const groups = new Map();
  const loose = [];

  for (const s of modSources) {
    if (s.kind === "group") {
      const gname = String(s.group || "");

      if (!groups.has(gname)) {
        groups.set(gname, {
          label: gname,
          children: [],
          _groupOrder: Number.isFinite(s.groupOrder) ? s.groupOrder : 9999
        });
      }

      groups.get(gname).children.push({
        label: s.name,
        value: s.id,
        _order: -1
      });

      continue;
    }

    const leaf = {
      label: s.name,
      value: s.id,
      _order: Number.isFinite(s.order) ? s.order : 9999
    };

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
  
  for (const g of groups.values()) {
    g.children.sort((a, b) =>
      (a._order - b._order) || a.label.localeCompare(b.label)
    );
  }

  loose.sort((a, b) =>
    (a._order - b._order) || a.label.localeCompare(b.label)
  );

  const groupFolders = Array.from(groups.values())
    .sort((a, b) =>
      (a._groupOrder - b._groupOrder) || a.label.localeCompare(b.label)
    )
    .map(g => ({
      label: g.label,
      children: g.children.map(({ _order, ...x }) => x)
    }));

  const looseClean = loose.map(({ _order, ...x }) => x);

  modsFolder.children.push(...groupFolders, ...looseClean);
  root.children.push(modsFolder);

  return root;
}

async function buildMergedGroupSource(src){
  const mods = [];

  for (const modId of src.members || []){
    const modSrc = SOURCES.find(s => s.id === modId);
    if (!modSrc?.file) continue;
    mods.push(await loadJSON(modSrc.file));
  }

  let mergedSpawn = {
    mapLegend: { ...(Global.baseSpawn?.mapLegend || {}) },
    entryMaps: { ...(Global.baseSpawn?.entryMaps || {}) },
    entries: { ...(Global.baseSpawn?.entries || {}) },
    maps: { ...(Global.baseSpawn?.maps || {}) },
    dinos: { ...(Global.baseSpawn?.dinos || {}) },
    worldReplacements: { ...(Global.baseSpawn?.worldReplacements || {}) }
  };

  let mergedDinos = {
    dinos: { ...(Global.baseDinos?.dinos || {}) }
  };

  let modOnlyDinos = {};

  for (const mod of mods){
    mergedSpawn = {
      mapLegend: {
        ...(mergedSpawn.mapLegend || {}),
        ...(mod.mapLegend || {})
      },
      entryMaps: {
        ...(mergedSpawn.entryMaps || {}),
        ...(mod.entryMaps || {})
      },
      entries: mergeEntryTables(
        mergedSpawn.entries || {},
        mod.entries || {}
      ),
      maps: {
        ...(mergedSpawn.maps || {}),
        ...(mod.maps || {})
      },
      dinos: {
        ...(mergedSpawn.dinos || {}),
        ...(mod.spawnDinos || {})
      },
      worldReplacements: mergeWorldReplacementTables(
        mergedSpawn.worldReplacements || {},
        mod.worldReplacements || {}
      )
    };

    mergedDinos = {
      dinos: {
        ...(mergedDinos.dinos || {}),
        ...(mod.dinos || {})
      }
    };

    modOnlyDinos = {
      ...modOnlyDinos,
      ...(mod.dinos || {})
    };
  }

  return {
    spawn: mergedSpawn,
    dinos: mergedDinos,
    modOnlyDinos
  };
}

function mountSourceDrillDropdown(native, host){
  native.style.display = "none";
  host.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "dd";

  const btn = document.createElement("button");
  btn.className = "dd-btn";

  const label = document.createElement("div");
  label.className = "dd-label";

  const caret = document.createElement("div");
  caret.className = "dd-caret";
  caret.textContent = "▾";

  btn.append(label, caret);

  const panel = document.createElement("div");
  panel.className = "dd-panel";

  const crumb = document.createElement("div");
  crumb.className = "dd-crumb";

  const list = document.createElement("div");
  list.className = "dd-list";

  panel.append(crumb, list);
  wrap.append(btn, panel);
  host.appendChild(wrap);

  const root = buildSourceDrillTree();
  const stack = [root];
  let lastPath = []; // folder labels only, like ["Mods", "My Group"]

  function currentNode(){
    return stack[stack.length - 1];
  }

  function syncLabel(){
    label.textContent = native.selectedOptions?.[0]?.textContent || "(Select)";
  }
  
  function rebuildStackFromPath(){
    stack.length = 0;
    stack.push(root);

    let node = root;

    for (const label of lastPath){
      const next = (node.children || []).find(child =>
        Array.isArray(child.children) && child.label === label
      );

      if (!next) break;

      stack.push(next);
      node = next;
    }
  }

  function renderLevel(){
    const node = currentNode();
    list.innerHTML = "";
    crumb.innerHTML = "";

    if (stack.length > 1) {
      const back = document.createElement("button");
      back.type = "button";
      back.className = "dd-back";
      back.textContent = "‹ Back";
      back.onclick = () => {
        stack.pop();
        lastPath = stack.slice(1).map(n => n.label);
        renderLevel();
      };
      crumb.appendChild(back);
    }

    for (const item of node.children || []) {
      const row = document.createElement("div");
      row.className = "dd-item";

      const isFolder = Array.isArray(item.children);

      row.textContent = isFolder ? `▸ ${item.label}` : item.label;

      row.onclick = () => {
        if (isFolder) {
          stack.push(item);
          lastPath = stack.slice(1).map(n => n.label);
          renderLevel();
          return;
        }

        native.value = item.value;
        native.dispatchEvent(new Event("change"));
        close();
      };

      list.appendChild(row);
    }
  }

  function open(){
    rebuildStackFromPath();
    renderLevel();
    wrap.classList.add("open");
  }

  function close(){
    wrap.classList.remove("open");
  }

  btn.onclick = () => {
    wrap.classList.contains("open") ? close() : open();
  };

  document.addEventListener("pointerdown", e => {
    if (!wrap.contains(e.target)) close();
  });

  native.addEventListener("change", syncLabel);
  syncLabel();
}

function preloadImage(url){
  if (!url) return;

  const img = new Image();
  img.decoding = "async";
  img.loading = "eager";
  img.src = url;
}

async function preloadAllMapImages(){
  for (const mapMeta of MAPS){
    try{
      const geom = await loadJSON(`${PATHS.geomDir}/${mapMeta.geomShort}_geom.json`);
      const img = geom.image || `${PATHS.mapsDir}/${mapMeta.image}`;

      preloadImage(img);

      if (Array.isArray(mapMeta.backgrounds)){
        for (const bg of mapMeta.backgrounds){
          preloadImage(bg.url);
        }
      }
    }catch(err){
      console.warn("Image preload failed for", mapMeta.id, err);
    }
  }
}

/* ============================================================
   ~~STYLE PANEL
============================================================ */

function ensureDrawStylePanel(){
  let panel = document.getElementById("drawStylePanel");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = "drawStylePanel";
  panel.className = "floating-panel floating-panel--small";

  panel.innerHTML = `
    <div class="fp-header">
      <div class="fp-title">Draw Style</div>
      <div class="fp-actions"></div>
    </div>
    <div class="fp-body"></div>
  `;

  const actions = panel.querySelector(".fp-actions");

  const hideBtn = createIconButton(CLOSE_ICON);
  hideBtn.dataset.action = "hide";
  hideBtn.title = "Hide";
  actions.appendChild(hideBtn);

  const mapWrap = document.getElementById("mapWrap") || document.body;
  mapWrap.appendChild(panel);

  panel.style.position = "absolute";
  panel.style.right = "2px";
  panel.style.bottom = "90px";
  panel.style.zIndex = "800";
  panel.style.display = "none";
  panel.dataset.hidden = "1";

  panel.querySelector('[data-action="hide"]').onclick = () => {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
    updateDockToggles();
  };

  return panel;
}

function renderDrawStylePanel(){
  const panel = ensureDrawStylePanel();
  const body = panel.querySelector(".fp-body");
  if (!body) return;

  body.innerHTML = `
    <label class="fp-row">
      <input id="drawUseRarity" type="checkbox" ${drawStyle.useRarity ? "checked" : ""}>
      <span>Use rarity colors</span>
    </label>

    <label class="fp-row">
      <span>Color</span>
      <input id="drawColor" type="color" value="${drawStyle.color}">
    </label>

    <label class="fp-row fp-col">
      <div class="fp-row fp-between">
        <span>Opacity</span>
        <span id="drawOpacityLabel">${drawStyle.opacity.toFixed(2)}</span>
      </div>
      <input
        id="drawOpacity"
        type="range"
        min="0.05"
        max="1"
        step="0.05"
        value="${drawStyle.opacity}"
      >
    </label>
  `;

  const rarity = body.querySelector("#drawUseRarity");
  const color = body.querySelector("#drawColor");
  const opacity = body.querySelector("#drawOpacity");
  const opacityLabel = body.querySelector("#drawOpacityLabel");

  if (rarity){
    rarity.onchange = () => {
      drawStyle.useRarity = rarity.checked;
      renderDrawStylePanel();
      render();
    };
  }

  if (color){
    color.disabled = drawStyle.useRarity;
    color.style.opacity = drawStyle.useRarity ? "0.5" : "1";

    color.oninput = () => {
      drawStyle.color = color.value;
      render();
    };
  }

  if (opacity){
    opacity.oninput = () => {
      drawStyle.opacity = Number(opacity.value);
      if (opacityLabel) opacityLabel.textContent = drawStyle.opacity.toFixed(2);
      render();
    };
  }
}

function toggleDrawStylePanel(){
  const panel = ensureDrawStylePanel();
  const show = panel.style.display === "none";

  if (show){
    renderDrawStylePanel();
    panel.style.display = "";
    panel.dataset.hidden = "0";
  } else {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
  }

  updateDockToggles();
}


/* ============================================================
   ~~MAP PANEL
============================================================ */

function mapsForEntry(entryName){
  const codes = Global.spawn?.entryMaps?.[entryName] || [];
  return Array.isArray(codes) ? codes : [];
}

function isEntryUniqueToCurrentMap(entryName){
  const codes = mapsForEntry(entryName);
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const curCode = mapMeta?.mapCode;
  return codes.length === 1 && codes[0] === curCode;
}

function isEntryShared(entryName){
  return mapsForEntry(entryName).length > 1;
}

function buildMapEntryBrowserRows(){
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const curCode = mapMeta?.mapCode;

  return [...State.mapEntries]
    .sort((a, b) => a.localeCompare(b))
    .map(entryName => {
      const codes = Array.isArray(Global.spawn?.entryMaps?.[entryName])
        ? Global.spawn.entryMaps[entryName]
        : [];

      const mapNames = codes.map(code => Global.spawn?.mapLegend?.[code] || code);
      const uniqueHere = (codes.length === 1 && codes[0] === curCode);

      return {
        entryName,
        codes,
        mapNames,
        mapCount: codes.length,
        uniqueHere,
        shared: codes.length > 1
      };
    });
}

const entryBrowserState = {
  filter: "all",   // "all" | "unique" | "shared"
  search: ""
};

function getFilteredMapEntryRows(){
  const q = normSearch(entryBrowserState.search);
  let rows = buildMapEntryBrowserRows();

  if (entryBrowserState.filter === "unique"){
    rows = rows.filter(r => r.uniqueHere);
  } else if (entryBrowserState.filter === "shared"){
    rows = rows.filter(r => r.shared);
  }

  if (q){
    rows = rows.filter(r =>
      normSearch(r.entryName).includes(q) ||
      r.mapNames.some(m => normSearch(m).includes(q))
    );
  }

  return rows;
}

/* ============================================================
   MAP ENTRIES PANEL
============================================================ */

function ensureMapEntriesPanel(){
  let panel = document.getElementById("mapEntriesPanel");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = "mapEntriesPanel";
  panel.className = "floating-panel floating-panel--small";

  panel.innerHTML = `
    <div class="fp-header">
      <div class="fp-title">Map Entries</div>
      <div class="fp-actions">
        <button type="button" class="fp-btn fp-btn-chevron" data-action="min" title="Collapse">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M6 9l6 6 6-6"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"/>
          </svg>
        </button>
        <button type="button" class="fp-btn" data-action="hide" title="Hide">✕</button>
      </div>
    </div>
    <div class="fp-body"></div>
  `;

  const mapWrap = document.getElementById("mapWrap") || document.body;
  mapWrap.appendChild(panel);

  panel.style.position = "absolute";
  panel.style.right = "2px";
  panel.style.bottom = "90px";
  panel.style.zIndex = "800";
  panel.style.display = "none";
  panel.dataset.hidden = "1";

  const body = panel.querySelector(".fp-body");

  panel.querySelector('[data-action="min"]').onclick = () => {
    const closed = body.style.display === "none";
    body.style.display = closed ? "" : "none";
    panel.classList.toggle("collapsed", !closed);
  };

  panel.querySelector('[data-action="hide"]').onclick = () => {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
    updateDockToggles();
  };

  return panel;
}

function renderMapEntriesList(){
  const panel = ensureMapEntriesPanel();
  const body = panel.querySelector(".fp-body");
  const list = body.querySelector(".mapEntriesList");
  if (!list) return;

  const rows = getFilteredMapEntryRows();

  list.innerHTML = rows.length
    ? rows.map(r => `
        <div class="dd-item" data-entry-jump="${escapeAttr(r.entryName)}">
          <div class="dd-item-left" style="display:block; min-width:0;">
            <div class="dd-item-name">${escapeHtml(r.entryName)}</div>
            <div class="dd-item-meta">
              ${
                r.uniqueHere
                  ? `<div class="entry-meta-line">Unique to this map</div>`
                  : `<div class="entry-meta-line">Used on ${r.mapCount} maps</div>`
              }
              <div class="entry-meta-line">${escapeHtml(r.mapNames.join(", "))}</div>
            </div>
          </div>
        </div>
      `).join("")
    : `<div style="color:var(--muted)">No matching spawn entries.</div>`;

  list.querySelectorAll("[data-entry-jump]").forEach(row => {
    row.onclick = () => {
      const entryName = row.dataset.entryJump;
      if (!entryName) return;

      State.mode = "entry";
      syncModeButton();
      rebuildDinoSelect();

      State.selection = entryName;
      UI.dinoSelect.value = entryName;

      render();
    };
  });
}

function renderMapEntriesPanel(){
  const panel = ensureMapEntriesPanel();
  const body = panel.querySelector(".fp-body");
  if (!body) return;

  body.innerHTML = `
    <div class="fp-row" style="gap:6px; flex-wrap:wrap;">
      <button type="button" class="fp-tab ${entryBrowserState.filter === "all" ? "is-on" : ""}" data-entry-filter="all">All</button>
      <button type="button" class="fp-tab ${entryBrowserState.filter === "unique" ? "is-on" : ""}" data-entry-filter="unique">Unique</button>
      <button type="button" class="fp-tab ${entryBrowserState.filter === "shared" ? "is-on" : ""}" data-entry-filter="shared">Shared</button>
    </div>

    <input
      id="mapEntriesSearch"
      class="dd-search"
      type="text"
      placeholder="Search spawn entries..."
      value="${escapeAttr(entryBrowserState.search)}"
      style="margin-bottom:8px;"
    >

    <div class="dd-list mapEntriesList"></div>
  `;

  body.querySelectorAll("[data-entry-filter]").forEach(btn => {
    btn.onclick = () => {
      entryBrowserState.filter = btn.dataset.entryFilter;

      body.querySelectorAll("[data-entry-filter]").forEach(b => {
        b.classList.toggle("is-on", b.dataset.entryFilter === entryBrowserState.filter);
      });

      renderMapEntriesList();
    };
  });

  const search = body.querySelector("#mapEntriesSearch");
  if (search){
    search.oninput = () => {
      entryBrowserState.search = search.value || "";
      renderMapEntriesList();
    };
  }

  renderMapEntriesList();
}

function toggleMapEntriesPanel(){
  const panel = ensureMapEntriesPanel();
  const show = panel.style.display === "none";

  if (show){
    renderMapEntriesPanel();
    panel.style.display = "";
    panel.dataset.hidden = "0";
  } else {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
  }

  updateDockToggles();
}

/* ============================================================
   INFO PANEL SYSTEM
============================================================ */

function syncActivePageHeight(pagesEl, activeId, opts = {}) {
  if (!pagesEl || !activeId) return;

  const {
    maxHeight = Math.floor(window.innerHeight * 0.42)
  } = opts;

  const activePage = pagesEl.querySelector(`.fp-page[data-page="${CSS.escape(activeId)}"]`);
  if (!activePage) return;

  // clear old scrolling first
  pagesEl.querySelectorAll(".fp-page").forEach(p => {
    p.style.overflowY = "";
    p.style.maxHeight = "";
  });

  // temporarily let wrapper size naturally so measurement is real
  pagesEl.style.height = "auto";

  const naturalHeight = activePage.scrollHeight;
  const finalHeight = Number.isFinite(maxHeight)
    ? Math.min(naturalHeight, maxHeight)
    : naturalHeight;

  pagesEl.style.height = `${finalHeight}px`;

  if (naturalHeight > finalHeight) {
    activePage.style.overflowY = "auto";
    activePage.style.maxHeight = `${finalHeight}px`;
    activePage.style.webkitOverflowScrolling = "touch";
  }
}
function refreshInfoPanelPageHeight() {
  const panel = document.getElementById("dinoInfoPanel");
  if (!panel || panel.classList.contains("collapsed")) return;

  const body = panel.querySelector(".fp-body");
  const pagesEl = body?.querySelector(".fp-pages");
  if (!pagesEl) return;

  const activeId = State.mode === "dino"
    ? infoPanelState.dinoTab
    : infoPanelState.entryTab;

  requestAnimationFrame(() => {
    syncActivePageHeight(pagesEl, activeId);
  });
}

function fmt(v){
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  let s = n.toFixed(6);
  s = s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  if (s === "-0") s = "0";
  return s;
}

function formatSpawnChances(chances) {
  if (chances == null) return "";

  if (Array.isArray(chances)) {
    const parts = chances
      .map(n => Number(n))
      .filter(n => Number.isFinite(n));
    return parts.length
      ? `Spawn chances: ${parts.map(n => `${fmt(n)}%`).join(", ")}`
      : "";
  }

  if (typeof chances === "string") {
    const parts = chances
      .split(",")
      .map(s => s.trim().replace(/%$/, ""))
      .filter(Boolean)
      .map(s => Number(s))
      .filter(n => Number.isFinite(n));

    return parts.length
      ? `Spawn chances: ${parts.map(n => `${fmt(n)}%`).join(", ")}`
      : "";
  }

  return "";
}

function showCopiedBubble(target){
  const bubble = document.createElement("div");
  bubble.className = "copy-bubble";
  bubble.textContent = "Copied!";

  document.body.appendChild(bubble);

  const r = target.getBoundingClientRect();
  bubble.style.left = `${r.right + 6}px`;
  bubble.style.top = `${r.top + r.height / 2 - 10}px`;

  requestAnimationFrame(() => {
    bubble.classList.add("show");
  });

  setTimeout(() => {
    bubble.classList.remove("show");
    setTimeout(() => bubble.remove(), 200);
  }, 900);
}

let infoPanelState = {
  dinoTab: "spawns",
  entryTab: "dinos"
};

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[c]));
}

function escapeAttr(s){
  return escapeHtml(s).replace(/"/g, "&quot;");
}

async function copyText(text){
  try{
    await navigator.clipboard.writeText(text);
  }catch{
    const ta = document.createElement("textarea");
    ta.value = String(text || "");
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

function installCopyDelegation(){
  document.addEventListener("click", async (e) => {
    const el = e.target.closest(".copy-on-click");
    if (!el) return;

    const text = el.dataset.copy ?? el.textContent ?? "";
    await copyText(String(text).trim());
    showCopiedBubble(el);
  });
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

function createIconButton(svgPath, viewBox = "0 0 24 24"){
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


function ensureInfoPanel(){
  let panel = document.getElementById("dinoInfoPanel");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = "dinoInfoPanel";
  panel.className = "floating-panel";

  panel.innerHTML = `
    <div class="fp-header">
      <div class="fp-title">Info</div>
      <div class="fp-actions"></div>
    </div>
    <div class="fp-body"></div>
  `;
  
  const actions = panel.querySelector(".fp-actions");

  const minBtn = createIconButton(CHEVRON_DOWN_ICON);
  minBtn.dataset.action = "min";
  minBtn.title = "Collapse";
  minBtn.classList.add("fp-btn-chevron");

  const hideBtn = createIconButton(CLOSE_ICON);
  hideBtn.dataset.action = "hide";
  hideBtn.title = "Hide";

  actions.appendChild(minBtn);
  actions.appendChild(hideBtn);

  const mapWrap = document.getElementById("mapWrap") || document.body;
  mapWrap.appendChild(panel);

  installPanelTitleFitter(panel, {
    minPx: 11,
    maxPx: 20
  });
  
  panel.style.display = "";
  panel.dataset.hidden = "0";

  const body = panel.querySelector(".fp-body");

  // start collapsed
  body.style.display = "none";
  panel.classList.add("collapsed");

  panel.querySelector('[data-action="min"]').onclick = () => {
    const closed = body.style.display === "none";
    body.style.display = closed ? "" : "none";
    panel.classList.toggle("collapsed", !closed);

    if (closed) {
      refreshInfoPanelPageHeight();
    }
  };

  panel.querySelector('[data-action="hide"]').onclick = () => {
    panel.style.display = "none";
  };

  panel.style.position = "absolute";
  panel.style.left = "2px";
  panel.style.top = "2px";
  panel.style.zIndex = "800";

  return panel;
}

function setInfoPanelTitle(text){
  const panel = ensureInfoPanel();
  const t = panel.querySelector(".fp-title");
  if (t) t.textContent = text || "Info";
}

function setInfoPanelHTML(html){
  const panel = ensureInfoPanel();
  const body = panel.querySelector(".fp-body");
  if (!body) return;
  body.innerHTML = html || `<div style="color:var(--muted)">No data.</div>`;
  panel.style.display = "";
}

function renderInfoPanelBodyEmpty(){
  setInfoPanelTitle("Info");
  setInfoPanelHTML(`<div style="color:var(--muted)">Select something to see details.</div>`);
}

function renderCopyField(label, value){
  const v = String(value || "");
  return `
    <div class="info-subtitle">${escapeHtml(label)}</div>
    <div class="info-mono copy-on-click" data-copy="${escapeAttr(v)}">
      ${escapeHtml(v || "(none)")}
    </div>
  `;
}

function renderSection(title, innerHtml){
  return `
    <div class="info-section">
      <div class="info-subtitle">${escapeHtml(title)}</div>
      ${innerHtml || ""}
    </div>
  `;
}

function renderTabs({ tabs, activeId, dataAttr }){
  return `
    <div class="fp-tabs">
      ${tabs.map(t => `
        <button type="button"
                class="fp-tab ${activeId === t.id ? "is-on" : ""}"
                ${dataAttr}="${escapeAttr(t.id)}">
          ${escapeHtml(t.label)}
        </button>
      `).join("")}
    </div>
  `;
}

function renderPages({ tabs, activeId, renderPage, pageClass = "" }){
  const idx = Math.max(0, tabs.findIndex(t => t.id === activeId));
  return `
    <div class="fp-pages ${pageClass}">
      <div class="fp-track" style="transform:translateX(${-idx * 100}%);">
        ${tabs.map(t => `
          <div class="fp-page" data-page="${escapeAttr(t.id)}">
            ${renderPage(t.id)}
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function wireTabs(container, { tabs, activeId, dataAttr, onChange }){
  container.querySelectorAll(`[${dataAttr}]`).forEach(btn => {
    btn.onclick = () => {
      const id = btn.getAttribute(dataAttr);
      if (!tabs.some(t => t.id === id)) return;
      onChange(id);
    };
  });
}

function labelsForDinoObj(d){
  const out = new Set();
  if (!d) return [];

  if (d.n) out.add(String(d.n));
  if (d.fn) out.add(String(d.fn));
  if (d.mn) out.add(String(d.mn));

  return [...out];
}

function cleanName(s){
  const x = String(s ?? "").trim();
  return x.length ? x : "";
}

function otherSexNameForSelected(d, selectedLabel){
  const f = cleanName(d?.fn);
  const m = cleanName(d?.mn);
  const sel = cleanName(selectedLabel);

  if (!sel) return "";
  if (f && sel.toLowerCase() === f.toLowerCase()) return m;
  if (m && sel.toLowerCase() === m.toLowerCase()) return f;

  if (f && m && f.toLowerCase() !== m.toLowerCase()) return `${f} / ${m}`;
  return "";
}

function isTrue01(v){
  return v === 1 || v === "1" || v === true;
}

function fmtNum(v, decimals = 0){
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return decimals > 0 ? n.toFixed(decimals) : String(Math.round(n));
}


/* ============================================================
   DOCK / TOOLBAR
============================================================ */

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
}

function togglePanel(id){
  setPanelVisible(id, !isPanelVisible(id));
  updateDockToggles();
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

function setLegendOpen(open){
  showRarityLegend = !!open;

  const el = document.getElementById("rarityLegend");
  if (!el) return;

  el.style.display = showRarityLegend ? "" : "none";
}

function setMapBackgroundFromDock(btn){
  const mapMeta = dockState.mapMeta;
  if (!mapMeta?.backgrounds?.length || !mapObj?.overlay) return;

  const bgs = mapMeta.backgrounds;
  const cur = btn.dataset.bgIndex ? Number(btn.dataset.bgIndex) : 0;
  const next = (cur + 1) % bgs.length;

  btn.dataset.bgIndex = String(next);
  mapObj.overlay.setUrl(bgs[next].url);
  btn.title = `Background: ${bgs[next].label || bgs[next].id || (next + 1)} (tap to cycle)`;
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
  const cfg = dockState.cfg || {};
  const isAstraeos = !!(mapMeta?.backgrounds?.length);

  container.innerHTML = "";
  container.style.display = "flex";
  container.style.overflow = "hidden";

  const mkBtn = ({ title, icon, onClick, togglePanelId = null, extraClass = "" }) => {
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

  // Astraeos background swap
  if (isAstraeos) {
    const bgs = mapMeta.backgrounds;
    const def = bgs.find(x => x.id === mapMeta.defaultBg) || bgs[0];
    const idx = Math.max(0, bgs.indexOf(def));

    if (mapObj?.overlay) {
      mapObj.overlay.setUrl(bgs[idx].url);
    }

    const bgBtn = mkBtn({
      title: `Background: ${def.label || def.id || (idx + 1)} (tap to cycle)`,
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
    if (cfg?.image && mapObj?.overlay) {
      mapObj.overlay.setUrl(cfg.image);
    }
  }

  // Dino info panel toggle
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
  mkBtn({
    title: "Toggle Draw Style",
    icon: `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M7 21c2.5 0 4-1.5 4-4 0-1.1-.9-2-2-2H7.5C6.1 15 5 16.1 5 17.5V18c0 1.7.3 3 2 3Z"
              fill="currentColor" opacity=".9"/>
        <path d="M20.7 4.3a1 1 0 0 0-1.4 0l-9.7 9.7c.8.3 1.4 1 1.7 1.8l9.4-9.5a1 1 0 0 0 0-1.4Z"
              fill="currentColor"/>
      </svg>
    `,
    togglePanelId: "drawStylePanel",
    onClick: () => toggleDrawStylePanel()
  });

  // POI toggle
  mkBtn({
    title: "Toggle markers menu",
    icon: `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z"
              fill="none" stroke="currentColor" stroke-width="2"/>
        <circle cx="12" cy="10" r="2.5" fill="currentColor"/>
      </svg>
    `,
    togglePanelId: "poiPanel",
    onClick: () => togglePoiPanel()
  });

  // Rarity legend toggle
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
  mkBtn({
    title: "Toggle map entries browser",
    icon: `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M5 6h14M5 12h14M5 18h14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"/>
      </svg>
    `,
    togglePanelId: "mapEntriesPanel",
    onClick: () => toggleMapEntriesPanel()
  });

  updateDockToggles();
}

function ensurePoiPanel(){
  let panel = document.getElementById("poiPanel");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = "poiPanel";
  panel.className = "floating-panel floating-panel--small";

  panel.innerHTML = `
    <div class="fp-header">
      <div class="fp-title">Markers</div>
      <div class="fp-actions"></div>
    </div>
    <div class="fp-body"></div>
  `;
  
  const actions = panel.querySelector(".fp-actions");

  const hideBtn = createIconButton(CLOSE_ICON);
  hideBtn.dataset.action = "hide";
  hideBtn.title = "Hide";

  actions.appendChild(hideBtn);

  const mapWrap = document.getElementById("mapWrap") || document.body;
  mapWrap.appendChild(panel);

  panel.style.position = "absolute";
  panel.style.left = "2px";
  panel.style.bottom = "90px";
  panel.style.zIndex = "800";
  panel.style.display = "none";
  panel.dataset.hidden = "1";

  panel.querySelector('[data-action="hide"]').onclick = () => {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
    updateDockToggles();
  };

  return panel;
}

function renderPoiPanel(){
  const panel = ensurePoiPanel();
  const body = panel.querySelector(".fp-body");
  if (!body) return;

  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);
  const pois = geom?.pois || {};

  const rows = [
    { key: "tributeTerminals", label: "Tribute Terminals", count: (pois.tributeTerminals || []).length },
    { key: "supplyCrates", label: "Supply Crates", count: (pois.supplyCrates || []).length },
    { key: "playerStarts", label: "Player Start Points", count: poiCount(pois.playerStarts) },
    { key: "explorerNotes", label: "Explorer Notes", count: (pois.explorerNotes || []).length },
    { key: "missions", label: "Missions", count: (pois.missions || []).length },
    { key: "hordeEvents", label: "Horde Events", count: (pois.hordeEvents || []).length },
    { key: "cityTerminals", label: "City Terminals", count: (pois.cityTerminals || []).length },
    { key: "beacons", label: "Border Beacons", count: (pois.beacons || []).length }
  ].filter(r => r.count > 0);

  body.innerHTML = rows.length ? rows.map(r => `
    <label class="fp-row">
      <input type="checkbox" data-poi-toggle="${escapeAttr(r.key)}" ${poiVisibility[r.key] ? "checked" : ""}>
      <span>${escapeHtml(r.label)} (${r.count})</span>
    </label>
  `).join("") : `
    <div style="color:var(--muted)">No markers on this map.</div>
  `;

  body.querySelectorAll("[data-poi-toggle]").forEach(chk => {
    chk.onchange = () => {
      const key = chk.dataset.poiToggle;
      poiVisibility[key] = chk.checked;
      drawPois();
    };
  });
}

function togglePoiPanel(){
  const panel = ensurePoiPanel();

  const show = panel.style.display === "none";

  if (show){
    renderPoiPanel();
    panel.style.display = "";
    panel.dataset.hidden = "0";
  } else {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
  }

  updateDockToggles();
}
/* ============================================================
   STATS TABLE
============================================================ */
const ARK_DEFAULT_MULT = {
  Health:  { iw: 1, it: 0.2, ta: 0.14, tm: 0.44 },
  Stamina: { iw: 1, it: 1,   ta: 1,    tm: 1 },
  Oxygen:  { iw: 1, it: 1,   ta: 1,    tm: 1 },
  Food:    { iw: 1, it: 1,   ta: 1,    tm: 1 },
  Water:   { iw: 1, it: 1,   ta: 1,    tm: 1 },
  Weight:  { iw: 1, it: 1,   ta: 1,    tm: 1 },
  MeleeDamageMultiplier:   { iw: 1, it: 0.17, ta: 0.14, tm: 0.44 },
  SpeedMultiplier:         { iw: 1, it: 1,    ta: 1,    tm: 1 },
  CraftingSpeedMultiplier: { iw: 1, it: 1,    ta: 1,    tm: 1 },
};


const STAT_COLS = [
  { key: "base", label: "Base" },
  { key: "iw",   label: "Wild" },
  { key: "it",   label: "Tamed" },
  { key: "ta",   label: "Add" },
  { key: "tm",   label: "Mult" },
];

const STAT_ORDER = [
  "Health",
  "Stamina",
  "Oxygen",
  "Food",
  "Water",
  "Weight",
  "MeleeDamageMultiplier",
  "SpeedMultiplier",
  "CraftingSpeedMultiplier",
];

const STAT_LABEL = {
  Health: "Health",
  Stamina: "Stamina",
  Oxygen: "Oxygen",
  Food: "Food",
  Water: "Water",
  Weight: "Weight",
  MeleeDamageMultiplier: "Melee",
  SpeedMultiplier: "Speed",
  CraftingSpeedMultiplier: "Craft",
};

function applyServerMultiplier(statKey, colKey, value) {
  if (value == null) return value;

  const mult = ARK_DEFAULT_MULT?.[statKey]?.[colKey] ?? 1;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;

  return n * mult;
}

function computeDisplayValue(statKey, colKey, data, statsObj) {
  const raw = data[colKey];

  if (raw == null || raw === "") return null;

  const v = Number(raw);
  if (!Number.isFinite(v)) return null;

  if (v < 0) {
    return v;
  }

  const base = Number(data.base);
  const mult = ARK_DEFAULT_MULT?.[statKey]?.[colKey] ?? 1;
  const effectiveMult = (v < 0) ? 1 : mult;

  if (colKey === "iw") {
    if (!Number.isFinite(base)) return null;
    return base * (v * effectiveMult);
  }

  if (colKey === "it") {
    return v * effectiveMult;
  }

  if (colKey === "ta") {
    return v * effectiveMult;
  }

  if (colKey === "tm") {
    return v * effectiveMult;
  }

  return v;
}

function unpackStat(arr){
  const a = Array.isArray(arr) ? arr : [];
  return {
    base: a.length > 0 ? a[0] : null,
    iw:   a.length > 1 ? a[1] : null,
    it:   a.length > 2 ? a[2] : null,
    ta:   a.length > 3 ? a[3] : null,
    tm:   a.length > 4 ? a[4] : null,
  };
}

function fmtStatNum(v){
  if (v == null || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";

  const abs = Math.abs(n);
  if (abs > 0 && abs < 0.001) return n.toPrecision(3);

  let s = n.toFixed(6);
  s = s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  if (s === "-0") s = "0";
  return s;
}

function isMultiplierStat(statKey){
  return statKey === "MeleeDamageMultiplier"
      || statKey === "SpeedMultiplier"
      || statKey === "CraftingSpeedMultiplier";
}

function fmtBaseCell(statKey, v){
  if (isMultiplierStat(statKey)) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    return `${fmtStatNum(n * 100)}%`;
  }
  return fmtStatNum(v);
}

function renderStatsTable(statsObj) {
  if (!statsObj || typeof statsObj !== "object") {
    return `<div style="color:var(--muted)">No stats found.</div>`;
  }

  const keys = [];
  for (const k of STAT_ORDER) if (k in statsObj) keys.push(k);
  for (const k of Object.keys(statsObj)) {
    if (k.endsWith("_TBM")) continue;
    if (!keys.includes(k)) keys.push(k);
  }

  if (!keys.length) {
    return `<div style="color:var(--muted)">No stats found.</div>`;
  }

  const header = `
    <div class="statgrid">
      <div class="statgrid-head">
        <div class="statgrid-th">Stat</div>
        ${STAT_COLS.map(c => `<div class="statgrid-th num">${escapeHtml(c.label)}</div>`).join("")}
      </div>
  `;

  const rows = keys.map(statKey => {
    const label = STAT_LABEL[statKey] || statKey;
    const data = unpackStat(statsObj[statKey]);

    const cells = STAT_COLS.map(c => {
      let txt = "";

      if (c.key === "base") {
        txt = fmtBaseCell(statKey, data.base);
      }
      else if (c.key === "tm" && statKey === "Health" && statsObj.Health_TBM != null) {
        const pct = fmtStatNum(Number(statsObj.Health_TBM) * 100);
        txt = `TBHM: ${pct}%`;
      }
      else {
        const eff = computeDisplayValue(statKey, c.key, data, statsObj);

        if (eff == null) {
          txt = "";
        }
        else if (c.key === "iw") {
          txt = fmtStatNum(eff);
        }
        else if (c.key === "ta") {
          if (isMultiplierStat(statKey)) {
            txt = `${fmtStatNum(eff * 100)}%`;
          } else {
            txt = fmtStatNum(eff);
          }
        }
        else {
          txt = `${fmtStatNum(eff * 100)}%`;
        }
      }

      const muted = txt ? "" : " muted";
      return `<div class="statgrid-td num${muted}">${escapeHtml(txt || "--")}</div>`;
    }).join("");

    return `
      <div class="statgrid-row">
        <div class="statgrid-td statname">${escapeHtml(label)}</div>
        ${cells}
      </div>
    `;
  }).join("");

  return header + rows + `</div>`;
}

/* ============================================================
   ATTACKS
============================================================ */

function cleanAttackName(name){
  return String(name || "").trim();
}

function attackNameBase(name){
  return cleanAttackName(name)
    .replace(/\s*\((ai|ai only)\)\s*$/i, "")
    .trim();
}

function attackKeyForCompare(a){
  const base = attackNameBase(a?.n);
  const dmg = Number(a?.d);
  const dmgKey = Number.isFinite(dmg) ? dmg : "__nodmg__";
  return `${base.toLowerCase()}::${dmgKey}`;
}

function isMeaninglessAttack(a){
  const name = cleanAttackName(a?.n);
  const dmg = Number(a?.d);

  const noName = !name || name.toLowerCase() === "none";
  const noDamage = !Number.isFinite(dmg) || dmg === 0;

  return noName && noDamage;
}

function normalizeAttackRow(a){
  if (!a || typeof a !== "object") return null;

  const out = {
    n: cleanAttackName(a.n),
    i: Number(a.i),
    s: Number(a.s),
    ri: Number(a.ri),
    d: Number(a.d),
    pr: a.pr === 1 || a.pr === "1" || a.pr === true ? 1 : 0
  };

  if (!Number.isFinite(out.i)) out.i = null;
  if (!Number.isFinite(out.s)) out.s = null;
  if (!Number.isFinite(out.ri)) out.ri = null;
  if (!Number.isFinite(out.d)) out.d = null;

  if (isMeaninglessAttack(out)) return null;

  return out;
}

function dedupeDisplayAttacks(attacks){
  const rows = (Array.isArray(attacks) ? attacks : [])
    .map(normalizeAttackRow)
    .filter(Boolean);

  if (!rows.length) return [];

  // If an AI-only version exists and a rider-usable version exists
  // with same base name + same damage, hide the AI-only one.
  const hasNonAiTwin = new Set();

  for (const a of rows){
    if (a.pr === 0){
      hasNonAiTwin.add(attackKeyForCompare(a));
    }
  }

  const filtered = rows.filter(a => {
    if (a.pr !== 1) return true;
    return !hasNonAiTwin.has(attackKeyForCompare(a));
  });

  // Final light dedupe in case exact duplicates still exist
  const seen = new Set();
  const out = [];

  for (const a of filtered){
    const key = [
      attackNameBase(a.n).toLowerCase(),
      a.i ?? "",
      a.s ?? "",
      a.ri ?? "",
      a.d ?? "",
      a.pr
    ].join("::");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }

  return out;
}

function renderAttacksTable(attacks){
  const rows = dedupeDisplayAttacks(attacks);

  if (!rows.length){
    return `<div style="color:var(--muted)"></div>`;
  }

  return `
    <div class="info-section" id="attackTable">
      <div class="info-subtitle">Attacks</div>
      <div class="info-subtitle-sub">(work in progress)</div>

      <div class="atkgrid">
        <div class="atkgrid-head">
          <div class="atkgrid-th">Name</div>
          <div class="atkgrid-th num">Damage</div>
          <div class="atkgrid-th num">Interval</div>
          <div class="atkgrid-th num">Stamina Cost</div>
        </div>

        ${rows.map(a => `
          <div class="atkgrid-row">
            <div class="atkgrid-td name">
              <div class="atkgrid-td atkname">${escapeHtml(a.n || "(Unnamed)")}</div>
              <div class="atkgrid-td wildonly">${a.pr ? "Wild Only" : ""}</div>
            </div>
            <div class="atkgrid-td num">${escapeHtml(a.d != null ? fmtStatNum(a.d) : "--")}</div>
            <div class="atkgrid-td num">${escapeHtml(a.i != null ? fmtStatNum(a.i) : "--")}</div>
            <div class="atkgrid-td num">${escapeHtml(a.s != null ? fmtStatNum(a.s) : "--")}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

/* ============================================================
   ENTRY META / ROWS
============================================================ */

function buildEntryMetaLines(entry){
  const lines = [];

  const gw  = entry?.groupWeight ?? entry?.group_weight;
  const lim = entry?.spawnLimit ?? entry?.spawn_limit;
  const chances = entry?.spawnChances ?? entry?.spawn_chances;

  if (gw != null) lines.push(`Entry Weight: ${fmt(gw)}`);

  const chancesLine = formatSpawnChances(chances);
  if (chancesLine) lines.push(chancesLine);

  if (lim != null) lines.push(`Max % To Allow: ${fmt(Number(lim) * 100)}%`);

  return lines;
}

function renderEntryRow(entry, dinoKey, idx){
  const key = entryVisibilityKey(dinoKey, idx);
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

function renderEntryDinoBlock(dinoBp, dinoObj, rowsForThisDino){
  const displayName = dinoObj?.n || "(Unknown)";
  const bp = dinoBp || "";
  const nameTag = dinoObj?.t || "";

  const entryLinesHtml = rowsForThisDino.map((r) => {
    const e = r.entry;
    const metaLines = buildEntryMetaLines(e);

    return `
      <div class="entry-meta">
        ${metaLines.map(line => `<div class="entry-meta-line">${escapeHtml(line)}</div>`).join("")}
      </div>
    `;
  }).join("");

  return `
    <div class="info-section">
      <div class="info-row">
        <span class="info-label">${escapeHtml(displayName)}</span>
      </div>

      ${bp ? `
        <div class="info-mono copy-on-click" data-copy="${escapeAttr(bp)}">
          ${escapeHtml(bp)}
        </div>
      ` : ""}

      ${nameTag ? `
        <div class="info-mono copy-on-click" data-copy="${escapeAttr(nameTag)}">
          ${escapeHtml(nameTag)}
        </div>
      ` : ""}

      ${entryLinesHtml}
    </div>
  `;
}

/* ============================================================
   PANEL DATA HELPERS
============================================================ */

function mountPanelSwipe(container, tabs, getActive, setActive){
  if (!container) return;

  const order = tabs.map(t => t.id);

  let sx = 0;
  let sy = 0;
  let tracking = false;
  let decided = false;
  let isHorizontal = false;

  const EDGE_GUARD_PX = 22;
  const SWIPE_MIN_PX = 40;
  const SWIPE_MAX_Y = 60;

  container.addEventListener("touchstart", (e) => {
    if (!e.touches || e.touches.length !== 1) return;

    const t = e.touches[0];
    if (t.clientX <= EDGE_GUARD_PX){
      tracking = false;
      return;
    }

    tracking = true;
    decided = false;
    isHorizontal = false;
    sx = t.clientX;
    sy = t.clientY;
  }, { passive: true });

  container.addEventListener("touchmove", (e) => {
    if (!tracking || !e.touches || e.touches.length !== 1) return;

    const t = e.touches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;

    if (!decided){
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10){
        decided = true;
        isHorizontal = Math.abs(dx) > Math.abs(dy);
      }
    }

    if (decided && isHorizontal){
      e.preventDefault();
    }
  }, { passive: false });

  container.addEventListener("touchend", (e) => {
    if (!tracking) return;
    tracking = false;

    const t = e.changedTouches?.[0];
    if (!t) return;

    const dx = t.clientX - sx;
    const dy = t.clientY - sy;

    if (Math.abs(dy) > SWIPE_MAX_Y) return;
    if (Math.abs(dx) < SWIPE_MIN_PX) return;

    const active = getActive();
    const i = Math.max(0, order.indexOf(active));

    const nextIndex = (dx < 0)
      ? Math.min(order.length - 1, i + 1)
      : Math.max(0, i - 1);

    if (nextIndex !== i){
      setActive(order[nextIndex]);
    }
  }, { passive: true });
}

function buildEntryIndexForCurrentMap(){
  const idx = {};

  for (const entryName of State.mapEntries){
    const rows = Global.spawn?.entries?.[entryName]?.d || [];

    for (const r of rows){
      const rawBp = normalizeBp(r?.[0]);
      if (!rawBp) continue;

      const outs = worldOutputsForBp(rawBp);

      for (const out of outs){
        const finalBp = normalizeBp(out?.[0]);
        const prob = Number(out?.[1] || 0);
        if (!finalBp || prob <= 0) continue;

        (idx[entryName] ||= []).push({
          dinoKey: finalBp,
          entry: {
            entryClass: entryName,
            sourceBp: rawBp,
            outputBp: finalBp,
            outputChance: prob,
            groupWeight: Number(r?.[1] || 0) * prob,
            spawnMultiplier: Number(r?.[2] || 1),
            spawnLimit: Number(r?.[3] || 1),
            spawnChances: r?.[4] || ""
          }
        });
      }
    }
  }

  return idx;
}

function getSelectedDinoGroup(name){
  const bps = State.nameToBps.get(name) || [];
  if (!bps.length) return null;

  const first = getDinoObjByBp(bps[0]);
  const bpSet = new Set(bps);

  const entryList = [...new Set(
    bps.flatMap(bp => State.dinoToEntries.get(bp) || [])
  )].sort((a,b)=>a.localeCompare(b));

  const entries = entryList.map(entryName => {
    const rows = Global.spawn?.entries?.[entryName]?.d || [];

    let groupWeight = 0;
    let spawnMultiplier = 1;
    let spawnLimit = 1;
    let spawnChances = "";

    for (const r of rows){
      const rawBp = normalizeBp(r?.[0]);
      if (!rawBp) continue;

      const outs = worldOutputsForBp(rawBp);
      let matched = false;

      for (const out of outs){
        const finalBp = normalizeBp(out?.[0]);
        const prob = Number(out?.[1] || 0);
        if (!finalBp || prob <= 0) continue;

        if (bpSet.has(finalBp)){
          groupWeight += Number(r?.[1] || 0) * prob;
          spawnMultiplier = Number(r?.[2] || 1);
          spawnLimit = Number(r?.[3] || 1);
          spawnChances = r?.[4] || "";
          matched = true;
        }
      }

      if (matched) {
        // keep scanning in case multiple rows contribute
      }
    }

    return {
      entryClass: entryName,
      groupWeight,
      spawnMultiplier,
      spawnLimit,
      spawnChances
    };
  }).filter(e => e.groupWeight > 0);

  return {
    displayName: name,
    bpPath: bps[0],
    additionalBpPathsToDisplay: bps.slice(1),
    nameTag: first?.t || "",
    fName: first?.fn || "",
    mName: first?.mn || "",
    tameable: first?.flags?.tameable,
    breedable: first?.flags?.breedable,
    isAlpha: first?.flags?.isAlpha,
    isBoss: first?.flags?.isBoss,
    isBossMinion: first?.flags?.isBossMinion,
    dragWeight: first?.flags?.dragWeight || 35,
    killXpBase: first?.flags?.killXpBase || 2,
    stats: first?.stats || null,
    attacks: first?.attacks || null,
    entries
  };
}

/* ============================================================
   DINO PANEL
============================================================ */

const DINO_PANEL_TABS = [
  { id: "spawns", label: "Spawns" },
  { id: "stats",  label: "Stats" }
];

function fitTitleToSpace(titleEl, opts = {}) {
  if (!titleEl) return;

  const {
    minPx = 10,
    maxPx = 20,
    stepPx = 0.25
  } = opts;

  titleEl.style.fontSize = maxPx + "px";

  if (titleEl.scrollWidth <= titleEl.clientWidth) return;

  let lo = minPx;
  let hi = maxPx;

  for (let i = 0; i < 16; i++) {
    const mid = Math.floor(((lo + hi) / 2) / stepPx) * stepPx;
    titleEl.style.fontSize = mid + "px";

    const fits = titleEl.scrollWidth <= titleEl.clientWidth;
    if (fits) lo = mid;
    else hi = mid - stepPx;

    if (hi < lo) break;
  }

  titleEl.style.fontSize = Math.max(minPx, lo) + "px";
}

function installPanelTitleFitter(panelEl, opts = {}) {
  const titleEl = panelEl?.querySelector(".fp-title");
  const titleWrap = titleEl?.parentElement;

  if (!panelEl || !titleEl) return;

  requestAnimationFrame(() => fitTitleToSpace(titleEl, opts));

  if (panelEl._titleFitCleanup) {
    panelEl._titleFitCleanup();
    panelEl._titleFitCleanup = null;
  }

  const ro = new ResizeObserver(() => fitTitleToSpace(titleEl, opts));
  ro.observe(titleWrap || panelEl);

  const mo = new MutationObserver(() => fitTitleToSpace(titleEl, opts));
  mo.observe(titleEl, { childList: true, characterData: true, subtree: true });

  panelEl._titleFitCleanup = () => {
    ro.disconnect();
    mo.disconnect();
  };
}

function renderDinoHero(d, selectedName){
  const bp = d.bpPath || "";
  const extraBps = Array.isArray(d.additionalBpPathsToDisplay)
    ? d.additionalBpPathsToDisplay
    : [];

  const allBps = [bp, ...extraBps].filter(Boolean);
  const nameTag = d.nameTag || "";
  const displayName = d.displayName || "(Unknown)";
  const otherName = otherSexNameForSelected(d, selectedName);
  const modId = Global.modMeta?.modId || "";
  /*const modName = Global.modMeta?.modName || "";*/
  /*
      ${modName ? `<div class="info-submeta">${escapeHtml(modName)}</div>` : ""}
      */

  return `
    <div class="dino-hero">
      <div class="dino-hero-title">${escapeHtml(displayName)}</div>
      ${otherName ? `<div class="info-submeta">Also: ${escapeHtml(otherName)}</div>` : ""}
      ${modId ? `<div class="info-submeta">Mod ID: ${escapeHtml(modId)}</div>` : ""}

      ${d.tameable === false || d.tameable === 0 ? `<span class="dino-badge tameable">Untameable</span>` : ""}
      ${d.breedable === false || d.breedable === 0 ? `<span class="dino-badge breedable">Unbreedable</span>` : ""}

      <div class="info-subtitle">Blueprint</div>
      ${allBps.length
        ? allBps.map(v => `
            <div class="info-mono copy-on-click" data-copy="${escapeAttr(v)}">
              ${escapeHtml(v)}
            </div>
          `).join("")
        : `
            <div class="info-mono copy-on-click" data-copy="">
              (none)
            </div>
          `
      }

      ${renderCopyField("Nametag", nameTag || "")}
    </div>
  `;
}

function renderDinoTabSpawns(d, selectedName){
  const entries = d.entries || [];
  return `
    <div class="info-section">
      <div class="info-subtitle">Spawn Entries (${entries.length})</div>
      <div class="entries">
        ${entries.map((e, i) => renderEntryRow(e, selectedName, i)).join("")}
      </div>
    </div>
  `;
}

function renderDinoTabStats(d){
  const drag = fmtNum(d?.dragWeight, 0);
  const xp = fmtNum(d?.killXpBase, 0);

  return `
    <div class="info-section">
      <div class="info-subtitle">Stats</div>
      <div class="entry-meta">
        ${drag !== null ? `<div class="entry-meta-line">Drag Weight: ${escapeHtml(drag)}</div>` : ``}
        ${xp !== null ? `<div class="entry-meta-line">Kill XP: ${escapeHtml(String(Number(xp) * 4))}</div>` : ``}
      </div>
      ${renderStatsTable(d?.stats)}
    </div>
    
    ${renderAttacksTable(d?.attacks)}
  `;
}

function renderDinoPanel(name){
  const d = getSelectedDinoGroup(name);
  if (!d){
    renderInfoPanelBodyEmpty();
    return;
  }

  const panel = ensureInfoPanel();
  const activeTab = DINO_PANEL_TABS.some(t => t.id === infoPanelState.dinoTab)
    ? infoPanelState.dinoTab
    : "spawns";

  setInfoPanelTitle(name);

  const html = `
    ${renderDinoHero(d, name)}
    ${renderTabs({
      tabs: DINO_PANEL_TABS,
      activeId: activeTab,
      dataAttr: 'data-dino-tab'
    })}
    ${renderPages({
      tabs: DINO_PANEL_TABS,
      activeId: activeTab,
      renderPage: (id) => {
        if (id === "spawns") return renderDinoTabSpawns(d, name);
        if (id === "stats") return renderDinoTabStats(d);
        return "";
      }
    })}
  `;

  setInfoPanelHTML(html);

  const body = panel.querySelector(".fp-body");
  wireTabs(body, {
    tabs: DINO_PANEL_TABS,
    activeId: activeTab,
    dataAttr: "data-dino-tab",
    onChange: (id) => {
      infoPanelState.dinoTab = id;
      renderDinoPanel(name);
    }
  });
  body.querySelectorAll('input[data-entry-toggle="1"]').forEach(chk => {
    chk.onchange = () => {
      const key = chk.dataset.key;
      entryVisibility[key] = chk.checked;
      drawDino(name);
    };
  });
  mountPanelSwipe(
    body.querySelector(".fp-pages"),
    DINO_PANEL_TABS,
    () => infoPanelState.dinoTab,
    (id) => {
      infoPanelState.dinoTab = id;
      renderDinoPanel(name);
    }
  );
  refreshInfoPanelPageHeight();
  const pagesEl = body.querySelector(".fp-pages");
  syncActivePageHeight(pagesEl, activeTab);
}

function cleanName(s){
  const x = String(s ?? "").trim();
  return x.length ? x : "";
}

function otherSexNameForSelected(d, selectedLabel){
  const f = cleanName(d?.fName);
  const m = cleanName(d?.mName);
  const sel = cleanName(selectedLabel);

  if (!sel) return "";

  if (f && sel.toLowerCase() === f.toLowerCase()) return m;
  if (m && sel.toLowerCase() === m.toLowerCase()) return f;

  if (f && m && f.toLowerCase() !== m.toLowerCase()) return `${f} / ${m}`;
  return "";
}

/* ============================================================
   ENTRY PANEL
============================================================ */

const ENTRY_PANEL_TABS = [
  { id: "dinos", label: "Dinos" },
  { id: "info",  label: "Info" }
];

function mapsForEntry(entryName){
  const codes = Global.spawn?.entryMaps?.[entryName] || [];
  if (!Array.isArray(codes)) return [];

  return codes.map(code => {
    return Global.spawn?.mapLegend?.[code] || code;
  });
}

function renderEntryHero(entryName){
  const entryBp = Global.spawn?.entries?.[entryName]?.bp || "";

  return `
    <div class="entry-hero">
      <div class="entry-hero-title">${escapeHtml(entryName)}</div>
      <div class="info-submeta">Spawn Entry</div>
      ${renderCopyField("Entry Blueprint", entryBp)}
      ${renderCopyField("Entry Class", entryName)}
    </div>
  `;
}

function renderEntryTabDinos(entryName){
  const entryIndex = buildEntryIndexForCurrentMap();
  const rows = entryIndex?.[entryName] || [];
  if (!rows.length){
    return `<div style="color:var(--muted)">No dinos found for this spawn entry.</div>`;
  }

  const byDino = new Map();
  for (const r of rows){
    if (!byDino.has(r.dinoKey)) byDino.set(r.dinoKey, []);
    byDino.get(r.dinoKey).push(r);
  }

  const rawDinoKeys = [...byDino.keys()];

  const filteredDinoKeys = rawDinoKeys.filter(bp => {
    if (activeSourceIsOfficial()) return true;
    if (viewOptions.includeOfficialInEntryPanels) return true;
    return isBlueprintFromActiveMod(bp);
  });

  const dinoKeys = filteredDinoKeys.sort((a, b) => {
    const da = getDinoObjByBp(a);
    const db = getDinoObjByBp(b);
    const an = da?.n || a;
    const bn = db?.n || b;
    return an.localeCompare(bn);
  });

  return `
    <div class="info-section">
      <div class="info-subtitle">Dinos (${dinoKeys.length})</div>
      
      ${
        activeSourceIsOfficial()
          ? ""
          : `
            <label class="fp-row" style="margin-bottom:8px;">
              <input
                type="checkbox"
                id="entryIncludeOfficialToggle"
                ${viewOptions.includeOfficialInEntryPanels ? "checked" : ""}
              >
              <span>Show official dinos</span>
            </label>
          `
      }

      <div class="entries">
        ${dinoKeys.map(dinoKey => renderEntryDinoBlock(dinoKey, getDinoObjByBp(dinoKey), byDino.get(dinoKey))).join("")}
      </div>
    </div>
  `;
}

function renderEntryTabInfo(entryName){
  const maps = mapsForEntry(entryName);

  return `
    <div class="info-section">
      <div class="info-subtitle">Used On Maps (${maps.length})</div>
      ${
        maps.length
          ? `<div class="entry-meta">
              ${maps.map(m => `<div class="entry-meta-line">${escapeHtml(m)}</div>`).join("")}
             </div>`
          : `<div style="color:var(--muted)">No map list found.</div>`
      }
    </div>
  `;
}

function renderEntryPanel(entryName){
  const panel = ensureInfoPanel();
  const activeTab = ENTRY_PANEL_TABS.some(t => t.id === infoPanelState.entryTab)
    ? infoPanelState.entryTab
    : "dinos";

  setInfoPanelTitle(entryName);

  const html = `
    ${renderEntryHero(entryName)}
    ${renderTabs({
      tabs: ENTRY_PANEL_TABS,
      activeId: activeTab,
      dataAttr: 'data-entry-tab'
    })}
    ${renderPages({
      tabs: ENTRY_PANEL_TABS,
      activeId: activeTab,
      renderPage: (id) => {
        if (id === "dinos") return renderEntryTabDinos(entryName);
        if (id === "info") return renderEntryTabInfo(entryName);
        return "";
      },
      pageClass: "fp-pages--entry"
    })}
  `;

  setInfoPanelHTML(html);

  const body = panel.querySelector(".fp-body");
  wireTabs(body, {
    tabs: ENTRY_PANEL_TABS,
    activeId: activeTab,
    dataAttr: "data-entry-tab",
    onChange: (id) => {
      infoPanelState.entryTab = id;
      renderEntryPanel(entryName);
    }
  });
  const officialToggle =  body.querySelector("#entryIncludeOfficialToggle");
  if (officialToggle){
    officialToggle.onchange = () => {
      viewOptions.includeOfficialInEntryPanels = officialToggle.checked;
      renderEntryPanel(entryName);
    };
  }
  mountPanelSwipe(
    body.querySelector(".fp-pages"),
    ENTRY_PANEL_TABS,
    () => infoPanelState.entryTab,
    (id) => {
      infoPanelState.entryTab = id;
      renderEntryPanel(entryName);
    }
  );
  refreshInfoPanelPageHeight();
  const pagesEl = body.querySelector(".fp-pages");
  syncActivePageHeight(pagesEl, activeTab);
}

/* ============================================================
   UNIFIED PANEL RENDER
============================================================ */

function renderInfoPanel(){
  if (!State.selection){
    renderInfoPanelBodyEmpty();
    return;
  }

  if (State.mode === "dino"){
    renderDinoPanel(State.selection);
  } else {
    renderEntryPanel(State.selection);
  }
}

/* ============================================================
   ~~POIS
============================================================ */

function supplyLegendForCurrentMap(){
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);
  return Array.isArray(geom?.supplyLegend) ? geom.supplyLegend : [];
}

function hordeLegendForCurrentMap(){
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);
  return Array.isArray(geom?.hordeLegend) ? geom.hordeLegend : [];
}

function hordeDifficultyLabel(d){
  const n = Number(d);

  if (n === 1) return "Gamma";
  if (n === 2) return "Beta";
  if (n === 3) return "Alpha";
  if (n === 4) return "Legendary";

  return `Difficulty ${d}`;
}

function hordeTypeLabel(t){
  const s = String(t || "");

  if (s.includes("NewEnumerator0")) return "OSD";
  if (s.includes("NewEnumerator1")) return "Element Node";
  if (s.includes("NewEnumerator2")) return "OSD / Element Node";

  return "Horde Event";
}

function buildHordeGroups(point, legend){
  const rows = Array.isArray(point?.h) ? point.h : [];
  const grouped = new Map();

  for (const rawIdx of rows){
    const idx = Number(rawIdx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= legend.length) continue;

    const meta = legend[idx];
    if (!meta) continue;

    const name = String(meta.n || "Horde Event").trim() || "Horde Event";
    const diffLabel = hordeDifficultyLabel(meta.d);
    const typeLabel = hordeTypeLabel(meta.t);

    const key = `${name}::${diffLabel}`;

    if (!grouped.has(key)){
      grouped.set(key, {
        name,
        difficulty: diffLabel,
        type: typeLabel,
        bp: meta.bp || ""
      });
    }
  }

  return [...grouped.values()];
}

function hordeTooltipHtml(point, legend){
  const groups = buildHordeGroups(point, legend);

  const pointType = hordeTypeLabel(point?.t);
  const pointDiff = point?.d != null ? hordeDifficultyLabel(point.d) : "";

  if (!groups.length){
    return `
      <div class="poi-tip-block">
        <div class="poi-tip-title">${escapeHtml(pointType)}</div>
        ${pointDiff ? `<div class="poi-tip-line">${escapeHtml(`Max: ${pointDiff}`)}</div>` : ""}
      </div>
    `;
  }

  return `
    <div class="poi-tip-block">
      <div class="poi-tip-title">${escapeHtml(pointType)}</div>
      ${pointDiff ? `<div class="poi-tip-line">${escapeHtml(`Max Difficulty: ${pointDiff}`)}</div>` : ""}
      <div class="poi-tip-lines">
        ${groups.map(g => `
          <div class="poi-tip-line">${escapeHtml(`${g.name} • ${g.difficulty}`)}</div>
        `).join("")}
      </div>
    </div>
  `;
}

function hordeMarkerColor(point){
  const t = String(point?.t || "");

  if (t.includes("NewEnumerator1")) return "#7dff7a"; // nodes
  if (t.includes("NewEnumerator2")) return "#ff66cc"; // both
  return "#ffd54a"; // osd
}

function drawHordePois(points){
  if (!mapObj?.poiLayer || !Array.isArray(points)) return;
  if (!poiVisibility.hordeEvents) return;

  const legend = hordeLegendForCurrentMap();

  for (const p of points){
    const x = Number(p?.x);
    const y = Number(p?.y);
    if (![x, y].every(Number.isFinite)) continue;

    const fillColor = hordeMarkerColor(p);

    L.circleMarker([y, x], {
      radius: 6,
      color: "#111",
      weight: 2.2,
      fillColor,
      fillOpacity: 0.95,
      pane: "poiPane",
      className:"poi-horde"
    })
      .addTo(mapObj.poiLayer)
      .bindTooltip(hordeTooltipHtml(p, legend), {
        direction: "auto",
        sticky: true,
        opacity: 0.97,
        className: "horde-tooltip",
        autoPan: true
      });
  }
}


function playerStartColorByRegionIndex(regionName, allRegionNames){
  const names = [...new Set(allRegionNames || [])].sort((a, b) => a.localeCompare(b));
  const idx = Math.max(0, names.indexOf(regionName));

  const hue = Math.round((idx * 137.508) % 360);
  return `hsl(${hue}, 72%, 52%)`;
}

function poiCount(v){
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === "object") return Object.keys(v).length;
  return 0;
}

function drawPlayerStarts(groups){
  if (!mapObj?.poiLayer) return;
  if (!poiVisibility.playerStarts) return;
  if (!groups || typeof groups !== "object") return;

  const regionNames = Object.keys(groups);

  for (const [regionName, block] of Object.entries(groups)) {
    const difficulty = block?.difficulty;
    const points = Array.isArray(block?.points) ? block.points : [];
    const fill = playerStartColorByRegionIndex(regionName, regionNames);

    for (const pt of points) {
      if (!Array.isArray(pt) || pt.length < 2) continue;

      const x = Number(pt[0]);
      const y = Number(pt[1]);
      if (![x, y].every(Number.isFinite)) continue;

      const tip = [
        regionName,
        difficulty != null ? `Difficulty ${difficulty}` : null
      ].filter(Boolean).join(" • ");

      L.circleMarker([y, x], {
        radius: 5,
        color: "#111",
        weight: 1.5,
        fillColor: fill,
        fillOpacity: 0.95,
        pane: "poiPane",
        className:"poi-pstart"
      })
        .addTo(mapObj.poiLayer)
        .bindTooltip(tip || "Player Start"), {
          direction: "auto",
          sticky: true,
          opacity: 0.97,
          className: "pstart-tooltip",
          autoPan: true
        };
    }
  }
}

function crateShortName(bp){
  const s = String(bp || "");
  const cls = s.split(".").pop() || s;
  return cls.replace(/_C$/, "");
}

function shortBpName(bp){
  const s = String(bp || "").trim();
  if (!s) return "";

  const last = s.split("/").pop() || s;
  return last.split(".")[0] || last;
}

function supplyCrateTooltipHtml(p, legend){
  const crateRows = Array.isArray(p?.c) ? p.c : [];
  const sourceIds = Array.isArray(p?.s) ? p.s : [];

  const crateLines = crateRows.length
    ? crateRows.map(row => {
        if (!Array.isArray(row) || row.length < 1) return "";

        const idx = Number(row[0]);
        const weight = row[1];

        const meta = Number.isInteger(idx) && idx >= 0 && idx < legend.length
          ? legend[idx]
          : null;

        const bp = meta?.bp || "";
        const name = meta?.n || shortBpName(bp) || "Supply Crate";

        const w = Number(weight);
        const suffix = Number.isFinite(w) ? ` (${fmt(w)})` : "";

        return `<div class="poi-tip-line">${escapeHtml(name + suffix)}</div>`;
      }).filter(Boolean).join("")
    : `<div class="poi-tip-line">No crates listed</div>`;

  const sourceBlock = sourceIds.length
    ? `
      <div class="poi-tip-subtitle">Sources</div>
      ${sourceIds.map(rawIdx => {
        const idx = Number(rawIdx);
        const meta = Number.isInteger(idx) && idx >= 0 && idx < legend.length
          ? legend[idx]
          : null;

        const name = meta?.n || meta?.bp || `Source ${idx}`;
        return `<div class="poi-tip-line poi-tip-bp">${escapeHtml(name)}</div>`;
      }).join("")}
    `
    : "";

  return `
    <div class="poi-tip-block">
      <div class="poi-tip-title">Supply Drops</div>
      ${crateLines}
    </div>
  `;
}

function drawSupplyCratePois(points){
  if (!mapObj?.poiLayer || !Array.isArray(points)) return;
  if (!poiVisibility.supplyCrates) return;

  const legend = supplyLegendForCurrentMap();

  for (const p of points){
    const x = Number(p?.x);
    const y = Number(p?.y);
    if (![x, y].every(Number.isFinite)) continue;

    L.circleMarker([y, x], {
      radius: 6,
      color: "#111",
      weight: 2.2,
      fillColor: "#ffd54a",
      fillOpacity: 0.95,
      pane: "poiPane",
      className:"poi-supply"
    })
      .addTo(mapObj.poiLayer)
      .bindTooltip(supplyCrateTooltipHtml(p, legend), {
        direction: "auto",
        sticky: true,
        offset: [0, -14],
        opacity: 0.97,
        className: "supply-tooltip",
        autoPan: true
      });
  }
}

function missionLegendForMap(){
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);
  return Array.isArray(geom?.missionLegend) ? geom.missionLegend : [];
}

function missionTooltipHtml(point, legend){
  const groups = buildMissionGroups(point, legend);

  if (!groups.length){
    return `<div class="poi-tip-title">Mission</div>`;
  }

  return groups.map(g => `
    <div class="poi-tip-block">
      <div class="poi-tip-title">${escapeHtml(g.name)}</div>
      <div class="poi-tip-lines">
        ${g.variants.map(v => `
          <div class="poi-tip-line">${escapeHtml(missionVariantLine(v, v.w))}</div>
        `).join("")}
      </div>
    </div>
  `).join("");
}

function missionLegendForCurrentMap(){
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);
  return Array.isArray(geom?.missionLegend) ? geom.missionLegend : [];
}

function fmtWeightShort(v){
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return fmt(n);
}

function missionVariantLine(meta, weight){
  const parts = [];

  if (meta?.k) parts.push(meta.k);
  if (meta?.s) parts.push(meta.s);
  if (meta?.d) parts.push(meta.d);

  let line = parts.join(" • ");
  if (!line) line = "Mission Variant";

  const w = fmtWeightShort(weight);
  if (w) line += ` (${w})`;

  return line;
}

function buildMissionGroups(point, legend){
  const rows = Array.isArray(point?.m) ? point.m : [];
  const grouped = new Map();

  for (const row of rows){
    if (!Array.isArray(row) || !row.length) continue;

    const idx = Number(row[0]);
    const weight = row.length > 1 ? row[1] : null;

    if (!Number.isInteger(idx) || idx < 0 || idx >= legend.length) continue;

    const meta = legend[idx];
    if (!meta) continue;

    const groupName = String(meta.n || "Mission").trim() || "Mission";

    if (!grouped.has(groupName)){
      grouped.set(groupName, {
        name: groupName,
        bp: meta.bp || "",
        variants: []
      });
    }

    grouped.get(groupName).variants.push({
      bp: meta.bp || "",
      k: meta.k || "",
      d: meta.d || "",
      s: meta.s || "",
      w: weight
    });
  }

  return [...grouped.values()];
}

function missionMarkerColor(point, legend){
  const groups = buildMissionGroups(point, legend);
  const first = groups[0]?.variants?.[0];

  const kind = String(first?.k || "").toLowerCase();

  if (kind.includes("attack")) return "#ff8a3d";
  if (kind.includes("defense")) return "#4db6ff";
  if (kind.includes("resource")) return "#7dff7a";

  return "#ff66cc";
}



function drawMissionPois(points){
  if (!mapObj?.poiLayer || !Array.isArray(points)) return;
  if (!poiVisibility.missions) return;

  const legend = missionLegendForCurrentMap();

  for (const p of points){
    const x = Number(p?.x);
    const y = Number(p?.y);
    if (![x, y].every(Number.isFinite)) continue;

    const fillColor = missionMarkerColor(p, legend);

    L.circleMarker([y, x], {
      radius: 6,
      color: "#111",
      weight: 2.2,
      fillColor,
      fillOpacity: 0.95,
      pane: "poiPane",
      className:"poi-mission"
    })
      .addTo(mapObj.poiLayer)
      .bindTooltip(missionTooltipHtml(p, legend), {
        direction: "auto",
        sticky: true,
        opacity: 0.97,
        className: "mission-tooltip",
        autoPan: true
      });
  }
}


function cssEscape(s){
  return String(s || "").toLowerCase().replace(/[^a-z0-9_-]/g,"");
}

function makeTerminalIcon(type){
  const cls = cssEscape(type);

  const size = 45;

  return L.divIcon({
    className: `poi-icon poi-${cls}`,
    html: `
      <svg width="${size}" height="${size}" viewBox="-10 -12 20 26">

        <!-- white frame -->
        <path d="M -3 0 L 0 -8 L 3 0 L 0 5 Z"
              fill="black"
              stroke="white"
              stroke-width="0.5"
              opacity="0.95"/>

        <!-- inner core -->
        <path class="poi-fill"
              d="M -2 0 L 0 -6 L 2 0 L 0 3.5 Z"
              fill="currentColor"
              opacity="0.9"/>
      </svg>
    `,
    iconSize:[size,size],
    iconAnchor:[size/2,size*0.58333]
  });
}


function poiRadius(type){
  const t = String(type || "").toLowerCase();

  if (t.includes("cityterminal")) return 4;
  if (t.includes("beacon")) return 3;

  if (t.includes("blue")) return 7;
  if (t.includes("green")) return 7;
  if (t.includes("red")) return 7;

  if (t.includes("tek") || t.includes("titan")) return 15;

  return 6;
}

function poiColor(type){
  const t = String(type || "").toLowerCase();
  
  if (t.includes("cityterminal")) return "#4db6ff";
  if (t.includes("beacon")) return "#ff8a3d";

  if (t.includes("blue")) return "#4da3ff";
  if (t.includes("green")) return "#5cff6b";
  if (t.includes("red")) return "#ff4d4d";
  if (t.includes("corrupt")) return "#555bcf";
  if (t.includes("tek") || t.includes("titan")) return "#b388ff";

  return "#ffffff";
}

function clearPois(){
  mapObj?.poiLayer?.clearLayers();
}

function drawPoiGroup(points, groupName){
  if (!mapObj?.poiLayer || !Array.isArray(points)) return;
  if (!poiVisibility[groupName]) return;

  for (const p of points){
    const x = Number(p?.x);
    const y = Number(p?.y);
    if (![x, y].every(Number.isFinite)) continue;

    const color = poiColor(p.type);
    const type = String(p.type || "").toLowerCase();
    const tooltipHtml =
      groupName === "supplyCrates"
        ? supplyCrateTooltipHtml(p)
        : (p.label || p.type || "POI");

    // TEK terminals get the special icon
    if (type.includes("tek") || type.includes("titan")) {

      const icon = makeTerminalIcon(type);

      const marker = L.marker([y, x], { 
        icon,
        pane: "poiPane"
      })
        .addTo(mapObj.poiLayer)
        .bindTooltip(tooltipHtml, {
          direction: "auto",
          sticky: true,
          opacity: 0.97,
          className: "basic-tooltip",
          autoPan: true
        });

      marker.getElement()?.style.setProperty("color", color);
      continue;
    }

    // Everything else = circle markers (red/blue/green obelisks)
    L.circleMarker([y, x], {
      radius: poiRadius(type),
      color: "#111",
      weight: 1,
      fillColor: color,
      fillOpacity: 0.95,
      pane: "poiPane",
      className:"poi-basic"
    })
      .addTo(mapObj.poiLayer)
      .bindTooltip(p.label || p.type || "POI");
  }
}

function drawPois(){
  clearPois();

  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);
  if (!geom?.pois) return;

  drawPoiGroup(geom.pois.tributeTerminals, "tributeTerminals");
  drawSupplyCratePois(geom.pois.supplyCrates || []);
  drawPlayerStarts(geom.pois.playerStarts);
  drawPoiGroup(geom.pois.explorerNotes, "explorerNotes");
  drawMissionPois(geom.pois.missions || []);
  drawHordePois(geom.pois.hordeEvents || []);
  drawPoiGroup(geom.pois.cityTerminals, "cityTerminals");
  drawPoiGroup(geom.pois.beacons, "beacons");
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
  [4,6]
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

    const baseExpected = gw;
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

  if (!entry) return { best:0, total:0 };

  const rawMins = [];
  let total = 0;

  for (const mgr of Object.values(entry.m || {})) {

    const md = Number(mgr?.md || 0);
    if (md <= 0) continue;

    const boxCount = Array.isArray(mgr?.b) ? mgr.b.length : 0;
    const pointCount = Array.isArray(mgr?.p) ? mgr.p.length : 0;
    const nodeCount = boxCount + pointCount;

    // keep raw manager min for manager-vs-best downshift
    rawMins.push(md);

    // global downshift uses shared min across nodes
    if (nodeCount > 0) {
      total += (md / nodeCount);
    } else {
      total += md;
    }
  }

  const best = rawMins.length ? Math.max(...rawMins) : 0;

  return {
    best,
    total
  };
}

function finalRarityForManager(entryName,meta,score){

  const baseLabel = rarityFromWeight(score);

  const {best,total} = entryManagerMinStats(entryName);

  const globalSteps = downshiftStepsForTotalMin(total);

  const pct = best>0 ? (meta.md || best)/best : 1;

  const managerSteps = downshiftStepsForMinPct(pct);

  return downgradeRarity(baseLabel,globalSteps+managerSteps);
}


function entryRarityForEntry(entryName){

  const rows = Global.spawn?.entries?.[entryName]?.d || [];
  if (!rows.length) return 0;

  let totalExpected = 0;
  let rarity = 0;

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
      rarity += expected * lim;
    }
  }

  if (totalExpected <= 0) return 0;

  return rarity / totalExpected;
}
/* ============================================================
   MAP RENDERING
============================================================ */

let mapObj = null;

function initMap(img,size=[2048,2048]){

  const bounds = [[0,0],[size[1],size[0]]];
  const paddedBounds = L.latLngBounds(bounds).pad(0.1);


  const map = L.map("map", {
    crs: L.CRS.Simple,
    minZoom: -3,
    maxZoom: 2,
    zoomSnap: 0.25,
    zoomDelta: 0.25,
    wheelPxPerZoomLevel: 120,
    zoomControl: false,
    maxBounds: paddedBounds,
    maxBoundsViscosity: 0.6,
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false
  });
  
  L.control.zoom({ position: "bottomleft" }).addTo(map);

  setTimeout(() => {
    document.querySelector(".leaflet-control-zoom")?.classList.add("zoom-horizontal");
  }, 0);

  // panes
  map.createPane("spawnPane");
  map.createPane("poiPane");

  map.getPane("spawnPane").style.zIndex = 410;
  map.getPane("poiPane").style.zIndex = 620;
  map.getPane("tooltipPane").style.zIndex = 900;

  const overlay = L.imageOverlay(img, bounds).addTo(map);

  const layer = L.layerGroup().addTo(map);
  const poiLayer = L.layerGroup().addTo(map);

  map.fitBounds(bounds, {
    paddingTopLeft: [6, 6],
    paddingBottomRight: [6, 20]
  });

  return { map, overlay, layer, poiLayer, bounds };
}

function clearDraw(){
  mapObj?.layer.clearLayers();
}

function styleForEntry(meta, color){
  const finalColor = drawStyle.useRarity ? color : drawStyle.color;
  const finalOpacity = Number.isFinite(drawStyle.opacity) ? drawStyle.opacity : 0.8;

  const style = {
    color: finalColor,
    weight: meta?.isCave ? 3 : 1,
    opacity: 1,
    fillColor: finalColor,
    fillOpacity: meta?.isCave ? Math.min(finalOpacity * 0.4, 0.8) : finalOpacity
  };

  if (meta?.isUntameable) style.dashArray = "3 3";

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

  const mapRules = Array.isArray(all?.[State.mapId]) ? all[State.mapId] : [];
  const globalRules = Array.isArray(all?.__global__) ? all.__global__ : [];

  return [...mapRules, ...globalRules];
}

function buildWorldRuleIndex(rules){
  const exact = new Map();
  const ancestor = [];

  for (const r of rules || []){
    const fromBp = normalizeBp(r?.from);
    if (!fromBp) continue;

    if (r?.exact){
      exact.set(fromBp, r);
    } else {
      ancestor.push(r);
    }
  }

  return { exact, ancestor };
}

function worldRuleIndexForCurrentMap(){
  const rules = worldRulesForCurrentMap();
  return buildWorldRuleIndex(rules);
}

function combineOutputWeights(rows){
  const m = new Map();

  for (const [bp, prob] of rows || []) {
    const key = normalizeBp(bp);
    const p = Number(prob || 0);
    if (!key || p <= 0) continue;

    m.set(key, (m.get(key) || 0) + p);
  }

  return [...m.entries()];
}

function worldOutputsForBp(bp){
  bp = normalizeBp(bp);
  if (!bp) return [[bp, 1]];

  const { exact, ancestor } = worldRuleIndexForCurrentMap();

  function resolveOne(curBp, seen = new Set()){
    curBp = normalizeBp(curBp);
    if (!curBp) return [];

    if (seen.has(curBp)) {
      return [[curBp, 1]];
    }

    const nextSeen = new Set(seen);
    nextSeen.add(curBp);

    const exactRule = exact.get(curBp);
    if (exactRule) {
      const outs = Array.isArray(exactRule.outs) && exactRule.outs.length
        ? exactRule.outs
        : [[curBp, 1]];

      let finalOuts = [];
      for (const o of outs) {
        const nextBp = normalizeBp(o?.[0]);
        const nextProb = Number(o?.[1] || 0);
        if (!nextBp || nextProb <= 0) continue;

        const resolved = resolveOne(nextBp, nextSeen);
        for (const [rbp, rprob] of resolved) {
          finalOuts.push([rbp, nextProb * rprob]);
        }
      }

      return combineOutputWeights(finalOuts);
    }

    let bestRule = null;
    let bestDist = null;

    for (const r of ancestor) {
      const fromBp = normalizeBp(r?.from);
      if (!fromBp) continue;

      const dist = ancestorDistance(curBp, fromBp);
      if (dist == null) continue;

      if (bestRule === null || dist < bestDist) {
        bestRule = r;
        bestDist = dist;
      }
    }

    if (bestRule) {
      const outs = Array.isArray(bestRule.outs) && bestRule.outs.length
        ? bestRule.outs
        : [[curBp, 1]];

      let finalOuts = [];
      for (const o of outs) {
        const nextBp = normalizeBp(o?.[0]);
        const nextProb = Number(o?.[1] || 0);
        if (!nextBp || nextProb <= 0) continue;

        const resolved = resolveOne(nextBp, nextSeen);
        for (const [rbp, rprob] of resolved) {
          finalOuts.push([rbp, nextProb * rprob]);
        }
      }

      return combineOutputWeights(finalOuts);
    }

    return [[curBp, 1]];
  }

  return resolveOne(bp);
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

      L.rectangle([[y, x], [y + h, x + w]], {
        ...style,
        pane: "spawnPane"
      }).addTo(mapObj.layer);
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
        dashArray: style.dashArray,
        pane: "spawnPane"
      }).addTo(mapObj.layer);
    }
  }
}

/* ============================================================
   DRAW DINO
============================================================ */

function drawDino(name){
  clearDraw();

  const grouped = getSelectedDinoGroup(name);
  if (!grouped) return;

  for (let i = 0; i < grouped.entries.length; i++){
    const entry = grouped.entries[i];
    if (!isEntryVisible(name, i)) continue;

    const bpSet = new Set(State.nameToBps.get(name) || []);
    const rarity = entryRarityForBps(entry.entryClass, bpSet);
    drawEntry(entry.entryClass, rarity);
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
  const allowedModBps = modBlueprintSet();

    for (const bp of State.dinoToEntries.keys()){
      if (!activeSourceIsOfficial() && !allowedModBps.has(bp)) {
        continue;
      }

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

function sourceById(id){
  return SOURCES.find(s => s.id === id) || null;
}

function normalizeMapId(raw){
  const s = String(raw || "").trim().toLowerCase();
  const hit = MAPS.find(m => m.id.toLowerCase() === s);
  return hit ? hit.id : "";
}

function allowedSourceIdsForEmbed(){
  if (!EMBED_MODE) return null;

  const allowed = new Set();

  if (EMBED_SOURCE) {
    const src = sourceById(EMBED_SOURCE);
    if (src) {
      allowed.add(src.id);

      if (src.kind === "group") {
        for (const mid of (src.members || [])) allowed.add(mid);
      }
    }
  } else if (EMBED_GROUP) {
    const groupName = EMBED_GROUP.trim().toLowerCase();

    for (const s of SOURCES){
      if (String(s.group || "").trim().toLowerCase() === groupName) {
        allowed.add(s.id);
      }
    }

    const groupSource = SOURCES.find(s =>
      s.kind === "group" &&
      String(s.group || "").trim().toLowerCase() === groupName
    );

    if (groupSource) allowed.add(groupSource.id);
  } else {
    return null;
  }

  if (EMBED_ALLOW_OFFICIAL) {
    allowed.add("official");
  }

  return allowed;
}

function allowedMapsForEmbed(){
  if (!EMBED_MODE || !EMBED_MAP) return null;

  const allowed = new Set();

  for (const raw of EMBED_MAP.split(",")) {
    const mapId = normalizeMapId(raw);
    if (mapId) allowed.add(mapId);
  }

  return allowed.size ? allowed : null;
}

function applyEmbedRestrictions(){
  if (!EMBED_MODE) return;

  if (EMBED_HIDE_TOPBAR && UI.topbar) {
    UI.topbar.style.display = "none";
  }

  const allowedSources = allowedSourceIdsForEmbed();
  if (allowedSources) {
    [...UI.sourceSelect.options].forEach(opt => {
      opt.hidden = !allowedSources.has(opt.value);
    });

    if (!allowedSources.has(UI.sourceSelect.value)) {
      const firstAllowed = [...allowedSources][0];
      if (firstAllowed) UI.sourceSelect.value = firstAllowed;
    }

    if (EMBED_SOURCE || EMBED_HIDE_SOURCE) {
      UI.sourceSelect.disabled = true;
      if (UI.sourceFancy) UI.sourceFancy.style.display = "none";
      if (UI.sourceSelect.parentElement && !EMBED_HIDE_SOURCE) {
        UI.sourceSelect.style.display = "";
      }
    }
  }

  const allowedMaps = allowedMapsForEmbed();
  if (allowedMaps) {
    [...UI.mapSelect.options].forEach(opt => {
      opt.hidden = !allowedMaps.has(opt.value);
    });

    if (!allowedMaps.has(UI.mapSelect.value)) {
      const firstAllowed = [...allowedMaps][0];
      if (firstAllowed) {
        UI.mapSelect.value = firstAllowed;
        State.mapId = firstAllowed;
      }
    }

    if (EMBED_MAP || EMBED_HIDE_MAP) {
      UI.mapSelect.disabled = true;
      if (UI.mapFancy) UI.mapFancy.style.display = "none";
      if (UI.mapSelect.parentElement && !EMBED_HIDE_MAP) {
        UI.mapSelect.style.display = "";
      }
    }
  }

  if (EMBED_MODE_LOCK) {
    const validModes = new Set(["dino", "entry"]);
    if (validModes.has(EMBED_MODE_LOCK)) {
      State.mode = EMBED_MODE_LOCK;
      syncModeButton();
    }
  }

  if (EMBED_MODE_LOCK || EMBED_HIDE_MODE) {
    if (UI.modeToggle) UI.modeToggle.disabled = true;
    if (EMBED_HIDE_MODE && UI.modeToggle) UI.modeToggle.style.display = "none";
  }
}

/* ============================================================
   UI SETUP
============================================================ */
async function loadSelectedSource() {
  const srcId = UI.sourceSelect.value;
  const src = SOURCES.find(s => s.id === srcId);
  if (!src) return;

  if (src.kind === "official") {

    Global.modMeta = null;
    Global.spawn = Global.baseSpawn;
    Global.dinos = Global.baseDinos;

  }
  else if (src.kind === "group") {

    const merged = await buildMergedGroupSource(src);

    Global.modMeta = {
      modId: src.id,
      modName: src.name,
      isGroup: true,
      members: src.members || [],
      dinos: merged.modOnlyDinos || {}
    };

    Global.spawn = merged.spawn;
    Global.dinos = merged.dinos;

  }
  else {

    const mod = await loadJSON(src.file);

    Global.modMeta = mod;

    Global.spawn = {
      mapLegend: {
        ...(Global.baseSpawn?.mapLegend || {}),
        ...(mod.mapLegend || {})
      },
      entryMaps: {
        ...(Global.baseSpawn?.entryMaps || {}),
        ...(mod.entryMaps || {})
      },
      entries: mergeEntryTables(
        Global.baseSpawn?.entries || {},
        mod.entries || {}
      ),
      maps: {
        ...(Global.baseSpawn?.maps || {}),
        ...(mod.maps || {})
      },
      dinos: {
        ...(Global.baseSpawn?.dinos || {}),
        ...(mod.spawnDinos || {})
      },
      worldReplacements: mergeWorldReplacementTables(
        Global.baseSpawn?.worldReplacements || {},
        mod.worldReplacements || {}
      )
    };

    Global.dinos = {
      dinos: {
        ...(Global.baseDinos?.dinos || {}),
        ...(mod.dinos || {})
      }
    };

  }

  rebuildMapIndices();
  rebuildDinoSelect();
  applyEmbedRestrictions();
  renderDock();
  render();
}


function setupUI(){

  /* SOURCE SELECT */

  UI.sourceSelect.innerHTML = "";

  for(const s of SOURCES){

    const o = document.createElement("option");

    o.value = s.id;
    o.textContent = s.label;

    UI.sourceSelect.appendChild(o);
  }

  UI.sourceSelect.value = UI.sourceSelect.options[0]?.value || "";

  UI.sourceSelect.onchange = async () => {
    await loadSelectedSource();
  };

  mountSourceDrillDropdown(
    UI.sourceSelect,
    UI.sourceFancy
  );
  applyEmbedRestrictions();

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

  syncModeButton();
  rebuildDinoSelect();

  UI.modeToggle.onclick = () => {
    // save current selection into the mode we're leaving
    State.selections[State.mode] = State.selection || "";

    // switch mode
    State.mode = State.mode === "dino" ? "entry" : "dino";

    // restore remembered selection for new mode
    syncSelectionForMode(State.mode);

    syncModeButton();
    rebuildDinoSelect();
    applyEmbedRestrictions();
    render();
  };

  UI.controlsToggle.onclick = () => {
    const before = UI.topbar?.offsetHeight ?? 0;

    UI.topbar.classList.toggle("show-controls");

    requestAnimationFrame(() => {
      const after = UI.topbar?.offsetHeight ?? 0;
      nudgeMapForTopbarToggle(before, after);
    });
  };
}

function initRarityLegend(){

  const legend = document.getElementById("rarityLegend");
  if (!legend) return;

  legend.querySelectorAll(".rl-sq").forEach(el => {

    const rarity = el.dataset.r;
    const color = rarityToColor(rarity);

    el.style.background = color;
  });

}

function rebuildDinoSelect(){

  const list = State.mode === "dino" ? State.names : State.entryList;
  const placeholder = State.mode === "dino"
    ? "(Select a Dino)"
    : "(Select a Spawn Entry)";

  // restore valid remembered selection for current mode
  const saved = State.selections[State.mode] || "";
  State.selection = (saved && list.includes(saved)) ? saved : "";

  UI.dinoSelect.innerHTML = "";

  const emptyOpt = document.createElement("option");
  emptyOpt.value = "";
  emptyOpt.textContent = placeholder;
  UI.dinoSelect.appendChild(emptyOpt);

  for (const v of list){
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    UI.dinoSelect.appendChild(o);
  }

  UI.dinoSelect.value = State.selection;

  UI.dinoSelect.onchange = () => {
    State.selection = UI.dinoSelect.value || "";
    State.selections[State.mode] = State.selection;
    render();
  };

  mountFancyDropdown(
    UI.dinoSelect,
    UI.dinoFancy,
    State.mode === "dino" ? "Search dinos..." : "Search spawn entries..."
  );
}

/* ============================================================
   RENDER
============================================================ */

function render(){
  if (!State.selection) {
    clearDraw();
    drawPois();
    renderInfoPanelBodyEmpty();
    return;
  }

  if (State.mode === "dino"){
    drawDino(State.selection);
  } else {
    clearDraw();
    const score = entryRarityForEntry(State.selection);
    drawEntry(State.selection, score);
  }

  drawPois();
  renderInfoPanel();
}

/* ============================================================
   MAP CHANGE
============================================================ */

async function onMapChanged(){

  const mapMeta = MAPS.find(m => m.id === State.mapId);

  const geom = await loadJSON(`${PATHS.geomDir}/${mapMeta.geomShort}_geom.json`);
  Global.mapGeom.set(mapMeta.geomShort, geom);

  const img = geom.image || `${PATHS.mapsDir}/${mapMeta.image}`;

  const size = geom.size || [2048,2048];
  const bounds = [[0,0],[size[1],size[0]]];

  if (!mapObj){
    mapObj = initMap(img, geom.size || [2048,2048]);
    ensureDockControl(mapObj.map);
  } else {
    mapObj.overlay.setUrl(img);
  }

  dockState.mapMeta = mapMeta;
  dockState.cfg = {
    image: img
  };

  rebuildMapIndices();
  rebuildDinoSelect();
  applyEmbedRestrictions();
  renderDock();
  if (isPanelVisible("mapEntriesPanel")) {
    renderMapEntriesPanel();
  }

  render();
}

/* ============================================================
   BOOT
============================================================ */

async function boot(){

  const allSources = await buildSources();
  SOURCES = filterSourcesForEmbed(allSources);

  const official = allSources.find(s => s.id === "official");

  Global.baseSpawn = await loadJSON(official.spawn);
  Global.baseDinos = await loadJSON(official.dinos);

  Global.spawn = Global.baseSpawn;
  Global.dinos = Global.baseDinos;
  Global.modMeta = null;

  installCopyDelegation();
  ensureInfoPanel();
  ensurePoiPanel();
  ensureMapEntriesPanel();
  ensureDrawStylePanel();
  renderInfoPanelBodyEmpty();
  setLegendOpen(false);

  setupUI();
  applyEmbedRestrictions();

  await loadSelectedSource();

  initRarityLegend();

  await onMapChanged();
  setTimeout(() => {
    preloadAllMapImages();
  }, 300);
}

boot().catch(e=>{
  console.error(e);
  alert(e.message||e);
});