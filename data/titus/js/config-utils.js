/* Split from app_embed.js lines 1-98 */

/* ============================================================
   ASA Spawn Maps
   Atlas V5 – clean full architecture
============================================================ */

/* ============================================================
   CONFIG
============================================================ */

const RUNTIME = window.ASA_RUNTIME || {};

const ASSET_VER = RUNTIME.assetVersion || "dev-2026-03-05-V6";

const PATHS = {
  spawnGlobal: "data/spawn_global.json",
  dinoGlobal: "data/dinos_global.json",
  itemGlobal: "data/items_global.json",
  lootGlobal: "data/loot_global.json",
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


const THEME_OPTIONS = [
  { id: "", label: "Default" },
  { id: "soft", label: "Soft" },
  { id: "asa", label: "ASA" },
  { id: "island", label: "Island" },
  { id: "se", label: "Scorched Earth" },
  { id: "ab", label: "Aberration" },
  { id: "ext", label: "Extinction" },
  { id: "lost", label: "Lost Colony" },
  { id: "midnight", label: "Midnight" },
  { id: "bbgum", label: "Bubblegum Princess" }
];

function setTheme(name){
  if (!name) {
    delete document.body.dataset.theme;
    return;
  }
  document.body.dataset.theme = name;
}

function getTheme(){
  return document.body.dataset.theme || "";
}

const SETTINGS_STORAGE_KEY = "asaSpawnMaps.settings";

function loadSettings(){
  try{
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  }catch{
    return {};
  }
}

function saveSettings(next){
  try{
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  }catch{
    // ignore storage failures
  }
}

function applySavedTheme(){
  const settings = loadSettings();
  setTheme(settings.theme || "");
}

function updateThemeSetting(theme){
  setTheme(theme);

  const settings = loadSettings();
  settings.theme = theme || "";
  saveSettings(settings);
}

/* Split from app_embed.js lines 99-251 */

/* ============================================================
   GLOBAL DATA
============================================================ */

const Global = {
  spawn: null,
  dinos: null,
  items: null,
  loot: null,
  baseSpawn: null,
  baseDinos: null,
  modMeta: null,
  mapGeom: new Map(),
  resolvedSupplyLegend: new Map(), // mapShort -> resolved legend rows
  crateClassToId: new Map(), // crate class string -> crate id
  setClassToId: new Map() // optional for later
};

const State = {
  mapId: MAPS[0].id,
  mode: "dino",
  selection: "",
  selections: {
    dino: "",
    entry: "",
    crate: "",
    item: ""
  },
  
  mapEntries: new Set(),
  entryToDinos: new Map(),
  dinoToEntries: new Map(),
  nameToBps: new Map(),
  
  crateNames: [],
  crateNameToRef: new Map(),
  crateOptions: [],
  
  itemNames: [],
  itemNameToIds: new Map(),
  
  mapCrateIds: new Set(),
  mapItemIds: new Set(),
  
  names: [],
  entryList: []
};

const entryVisibility = {};

let dockControl = null;
let dockState = { mapMeta: null, cfg: null };

const poiVisibility = {
  tributeTerminals: true,
  supplyCrates: false,
  artifactCrates: false,
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
const runtime = window.ASA_RUNTIME || {};
const launch = runtime.launchConfig || {};

const IS_DISCORD_ACTIVITY = !!runtime.isDiscordActivity;

const EMBED_MODE =
  IS_DISCORD_ACTIVITY ||
  urlParams.get("embed") === "1" ||
  window.self !== window.top;

const EMBED_SOURCE = launch.source || urlParams.get("source") || "";
const EMBED_GROUP = launch.group || urlParams.get("group") || "";
const EMBED_MAP = launch.map || urlParams.get("map") || "";
const EMBED_MODE_LOCK = launch.mode || urlParams.get("mode") || "";

const EMBED_ALLOW_OFFICIAL = urlParams.get("allowOfficial") === "1";
const EMBED_HIDE_SOURCE = urlParams.get("hideSource") === "1";
const EMBED_HIDE_MAP = urlParams.get("hideMap") === "1";
const EMBED_HIDE_MODE = urlParams.get("hideMode") === "1";
const EMBED_HIDE_TOPBAR = urlParams.get("hideTopbar") === "1";

const viewOptions = {
  includeOfficialInEntryPanels: false,
  includeOfficialInItemPanels: false
};

function isItemCrateVisible(itemName, crateId) {
  const key = itemCrateVisibilityKey(itemName, crateId);
  return entryVisibility[key] ?? true;
}


if (EMBED_MODE) {
  document.body.classList.add("embed-mode");
}

const MODE_OPTIONS = [
  { id: "dino",  label: "Dino View" },
  { id: "entry", label: "Spawn View" },
  { id: "crate", label: "Crate View" },
  { id: "item",  label: "Item View" }
];

function setMode(mode){
  if (!MODE_OPTIONS.some(m => m.id === mode)) return;
  if (State.mode === mode) return;

  State.selections[State.mode] = State.selection || "";
  State.mode = mode;
  syncSelectionForMode(State.mode);

  syncModeButton();
  syncModeClass();
  rebuildSelectionSelect();
  applyEmbedRestrictions();
  render();
}

function openCrateView(crateValue){
  if (!crateValue) return;

  State.selections[State.mode] = State.selection || "";
  State.mode = "crate";
  State.selection = crateValue;
  State.selections.crate = crateValue;

  syncModeButton();
  syncModeClass();
  rebuildSelectionSelect();
  applyEmbedRestrictions();
  render();
}

const crateSetOpenState = {};

function openEntryView(entryName){
  if (!entryName) return;

  State.selections[State.mode] = State.selection || "";
  State.mode = "entry";
  State.selection = entryName;
  State.selections.entry = entryName;

  syncModeButton();
  syncModeClass();
  rebuildSelectionSelect();
  render();
}

function openDinoView(name){
  if (!name) return;

  State.selections[State.mode] = State.selection || "";
  State.mode = "dino";
  State.selection = name;
  State.selections.dino = name;

  syncModeButton();
  syncModeClass();
  rebuildSelectionSelect();
  render();
}

const exportPanelState = {
  reportType: "dino",
  scope: "current_source",
  includeMaps: true,
  includeEntries: true,
  includeBlueprints: false,
  includeEntryMaps: false,
  includeNametag: false,
  includeDinos: true,
  includeMapEntries: true,

  mapDinoIncludeEntries: false,
  mapDinoIncludeBlueprints: false,
  mapDinoIncludeNametag: false,

  mapEntryIncludeDinos: false
};
/* Split from app_embed.js lines 252-721 */

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
  settingsToggle: document.getElementById("settingsToggle"),

  controlsToggle:document.getElementById("controlsToggle"),
  topbar:document.getElementById("topbar")
};



function syncModeButton() {
  if (!UI.modeToggle) return;

  const labels = {
    dino: "Dino View",
    entry: "Spawn View",
    crate: "Crate View",
    item: "Item View"
  };

  UI.modeToggle.innerHTML = `
    <span>${labels[State.mode] || "View"}</span>
    <span class="mode-toggle-caret" aria-hidden="true">▾</span>
  `;
}




/* ============================================================
   UTILS
============================================================ */




function safeFilePart(s){
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function currentSourceMeta(){
  const opt = UI?.sourceSelect?.selectedOptions?.[0];
  return {
    id: UI?.sourceSelect?.value || "",
    label: opt?.textContent || ""
  };
}

function selectedEntryName(){
  return State.mode === "entry" ? State.selection || "" : "";
}

function selectedDinoName(){
  return State.mode === "dino" ? State.selection || "" : "";
}

function selectedMapName(){
  return State.mapId || "";
}


function buildDinoReport(){
  const src = currentSourceMeta();

  let rows = [];

  if (exportPanelState.scope === "current_selection") {
    const name = selectedDinoName();
    if (name) {
      rows = getDinoRowsAllMaps().filter(r => r.name === name);
    }
  } else if (exportPanelState.scope === "current_map") {
    rows = getDinoRowsCurrentMap();
  } else {
    rows = getDinoRowsAllMaps();
  }

  return {
    type: "dino_report",
    sourceId: src.id,
    sourceLabel: src.label,
    scope: exportPanelState.scope,
    mapId: State.mapId || "",
    exportedAt: new Date().toISOString(),
    options: {
      includeMaps: exportPanelState.includeMaps,
      includeEntries: exportPanelState.includeEntries,
      includeBlueprints: exportPanelState.includeBlueprints
    },
    rows: rows.map(r => {
      const out = {
        name: r.name
      };
      
      if (exportPanelState.includeNametag) {
        const firstBp = (r.bps || [])[0] || "";
        const d = firstBp ? getDinoObjByBp(firstBp) : null;
        out.nametag = d?.t || "";
      }

      if (exportPanelState.includeMaps) {
        out.mapCount = r.mapCount || 0;
        out.mapNames = r.mapNames || [];
      }

      if (exportPanelState.includeEntries) {
        const entryNames = r.entryNames || r.currentMapEntryNames || [];

        if (exportPanelState.includeEntryMaps) {
          out.entries = entryNames.map(entryName => ({
            entryName,
            mapNames: mapNamesForEntry(entryName)
          }));
        } else {
          out.entryNames = entryNames;
        }
      }

      if (exportPanelState.includeBlueprints) {
        out.blueprints = r.bps || [];
      }

      return out;
    })
  };
}

function buildEntryReport(){
  const src = currentSourceMeta();

  let rows = [];

  if (exportPanelState.scope === "current_selection") {
    const entryName = selectedEntryName();
    if (entryName) {
      rows = getEntryRowsAllMaps().filter(r => r.entryName === entryName);
    }
  } else if (exportPanelState.scope === "current_map") {
    rows = getEntryRowsCurrentMap();
  } else {
    rows = getEntryRowsAllMaps();
  }

  return {
    type: "entry_report",
    sourceId: src.id,
    sourceLabel: src.label,
    scope: exportPanelState.scope,
    mapId: State.mapId || "",
    exportedAt: new Date().toISOString(),
    options: {
      includeMaps: exportPanelState.includeMaps,
      includeEntries: exportPanelState.includeEntries,
      includeBlueprints: exportPanelState.includeBlueprints
    },
    rows: rows.map(r => {
      const out = {
        entryName: r.entryName
      };

      if (exportPanelState.includeMaps) {
        out.mapCount = r.mapCount || 0;
        out.mapNames = r.mapNames || [];
      }

      if (exportPanelState.includeEntries) {
        out.dinoNames = r.dinoNames || [];
      }

      if (exportPanelState.includeBlueprints) {
        out.entryBlueprint = Global.spawn?.entries?.[r.entryName]?.bp || "";
      }

      return out;
    })
  };
}

function getAllMapsForSource(){
  const codes = new Set();

  for (const maps of Object.values(Global.spawn?.entryMaps || {})){
    if (!Array.isArray(maps)) continue;
    for (const c of maps) codes.add(c);
  }

  return [...codes].sort();
}


function buildMapReport(){
  const src = currentSourceMeta();

  const includeDinos = exportPanelState.includeDinos;
  const includeEntries = exportPanelState.includeMapEntries;

  const includeDinoEntries = exportPanelState.mapDinoIncludeEntries;
  const includeDinoBlueprints = exportPanelState.mapDinoIncludeBlueprints;
  const includeDinoNametag = exportPanelState.mapDinoIncludeNametag;

  const includeEntryDinos = exportPanelState.mapEntryIncludeDinos;

  function buildMapRow(mapName){
    const originalMap = State.mapId;
    State.mapId = mapName;
    rebuildMapIndices();

    const row = { mapName };

    if (includeDinos){
      const dinoRows = getDinoRowsCurrentMap();
      row.dinos = dinoRows.map(r => {
        const out = {
          name: r.name
        };

        if (includeDinoEntries) {
          out.entryNames = r.currentMapEntryNames || r.entryNames || [];
        }

        if (includeDinoBlueprints) {
          out.blueprints = r.bps || [];
        }

        if (includeDinoNametag) {
          const firstBp = (r.bps || [])[0] || "";
          const d = firstBp ? getDinoObjByBp(firstBp) : null;
          out.nametag = d?.t || "";
        }

        return out;
      });
    }

    if (includeEntries){
      const entryRows = getEntryRowsCurrentMap();
      row.entries = entryRows.map(r => {
        const out = {
          entryName: r.entryName
        };

        if (includeEntryDinos) {
          out.dinoNames = dinoNamesForEntryGlobal(r.entryName);
        }

        return out;
      });
    }

    State.mapId = originalMap;
    rebuildMapIndices();

    return row;
  }

  let rows = [];

  if (exportPanelState.scope === "current_source") {
    const mapCodes = getAllMapsForSource();

    rows = mapCodes.map(code => {
      const mapName = Global.spawn?.mapLegend?.[code] || code;
      return buildMapRow(mapName);
    });
  } else {
    rows = [buildMapRow(State.mapId || "")];
  }

  return {
    type: "map_report",
    sourceId: src.id,
    sourceLabel: src.label,
    scope: exportPanelState.scope,
    exportedAt: new Date().toISOString(),
    rows
  };
}

function buildExportReport(){
  if (exportPanelState.reportType === "dino") return buildDinoReport();
  if (exportPanelState.reportType === "entry") return buildEntryReport();
  return buildMapReport();
}

function exportCurrentReportJSON(){
  const report = buildExportReport();
  const src = currentSourceMeta();

  const fileBase = [
    "report",
    exportPanelState.reportType,
    exportPanelState.scope,
    safeFilePart(src.label || src.id || "source"),
    safeFilePart(State.mapId || "")
  ].filter(Boolean).join("_");

  downloadJSON(`${fileBase}.json`, report);
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



function bpClass(bp){
  return String(bp||"").split(".").pop();
}
