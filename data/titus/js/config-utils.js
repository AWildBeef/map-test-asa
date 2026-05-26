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
  baseLoot: null,
  baseItems: null,
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
    item: "",
    note: ""
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
  caveCrates: false,
  oceanCrates: false,
  beaverDams: false,
  lcNormalCrates: false,
  lcCaveCrates: false,
  abNormalCrates: false,
  abDungeonCrates: false,
  abSurfaceCrates: false,
  artifactCrates: false,
  playerStarts: false,
  explorerNotes: false,
  dinoDossiers: false,
  missions: false,
  hordeEvents: false,
  cityTerminals: false,
  beacons: false,
  waterVeins: false,
  oilVeins: false,
  gasVeins: false,
  chargeNodes: false,
  hyperChargeNodes: false,
  plantZ: false,
  plantR: false,
  wyvernNests: false,
  iceWyvernNests: false,
  rockDrakeNests: false,
  deinonychusNests: false,
  beachChests: false,
  memorial: false,
  teleporters: false
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

if (EMBED_MODE) {
  document.body.classList.add("embed-mode");
}

const MODE_OPTIONS = [
  { id: "dino",  label: "Dino View" },
  { id: "entry", label: "Spawn View" },
  { id: "crate", label: "Crate View" },
  { id: "item",  label: "Item View" },
  { id: "note",  label: "Note View" }
];

// Note view state
const noteViewState = {
  noteTab:    "notes",  // "notes" | "dossiers"
  searchMode: "name",   // "name" | "index"
  query:      "",
  selected:   null      // selected note: [index, name, ue_x, ue_y, ue_z]
};

function setMode(mode){
  if (!MODE_OPTIONS.some(m => m.id === mode)) return;
  if (State.mode === mode) return;

  // Close note panel when leaving note mode
  if (State.mode === "note" && mode !== "note") {
    const notePanel = document.getElementById("noteViewPanel");
    if (notePanel) { notePanel.style.display = "none"; notePanel.dataset.hidden = "1"; }
  }

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

function openItemView(itemName){
  if (!itemName) return;

  State.selections[State.mode] = State.selection || "";
  State.mode = "item";
  State.selection = itemName;
  State.selections.item = itemName;

  syncModeButton();
  syncModeClass();
  rebuildSelectionSelect();
  applyEmbedRestrictions();
  render();
}

const crateSetOpenState = {};
const entryDinoOpenState = {}; // key: "entryName::dinoBp" -> bool
const itemCrateOpenState = {}; // key: "itemName::crateValue" -> bool
const dinoSpawnCardOpenState = {}; // key: entryVisibilityKey -> bool

const dinoLootSetOpenState = {};

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

  dino: {
    includeMaps: true,
    includeEntries: true,
    includeEntryMaps: false,
    includeBlueprints: false,
    includeNametag: false
  },

  entry: {
    includeMaps: true,
    includeDinos: true,
    includeBlueprint: false
  },

  map: {
    includeDinos: true,
    includeEntries: true,
    includeCrates: false,
    includeItems: false,
    includeMissions: false,
    crateUseDisplayName: false,

    dino: {
      includeEntries: false,
      includeEntryMaps: false,
      includeBlueprints: false,
      includeNametag: false
    },

    entry: {
      includeDinos: false,
      includeMaps: false
    }
  },

  crate: {
    includeSets: true,
    includeItems: true,
    includeWeights: true,
    includeQuality: true,
    includeBpChance: true,
    includeMaps: false,
    includeMissions: true
  },

  item: {
    includeCrates: true,
    includeSetName: true,
    includeWeights: true,
    includeQuality: true,
    includeBpChance: true,
    includeQuantity: true,
    includeMaps: false,
    includeCrateMaps: false,
    includeMissions: true
  }
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
    dino:  "Dino View",
    entry: "Spawn View",
    crate: "Crate View",
    item:  "Item View",
    note:  "Note View"
  };

  UI.modeToggle.innerHTML = `
    <span>${labels[State.mode] || "View"}</span>
    <span class="mode-toggle-caret" aria-hidden="true">▾</span>
  `;
}




/* ============================================================
   UTILS
============================================================ */

function getExportOpts(){
  return exportPanelState[exportPanelState.reportType] || {};
}

function isSimpleDinoExport(opts = {}){
  return !opts.includeMaps &&
         !opts.includeEntries &&
         !opts.includeBlueprints &&
         !opts.includeNametag;
}

function isSimpleEntryExport(opts = {}){
  return !opts.includeMaps &&
         !opts.includeDinos &&
         !opts.includeBlueprint;
}

function buildEntryExportItem(entryName, opts = {}){
  const {
    simple = false,
    includeMaps = false,
    includeDinos = false,
    includeBlueprint = false
  } = opts;

  if (simple && !includeMaps && !includeDinos && !includeBlueprint) {
    return entryName;
  }

  const out = { entryName };

  if (includeBlueprint) {
    out.entryBlueprint = Global.spawn?.entries?.[entryName]?.bp || "";
  }

  if (includeMaps) {
    out.maps = mapNamesForEntry(entryName);
  }

  if (includeDinos) {
    out.dinoNames = dinoNamesForEntryGlobal(entryName);
  }

  return out;
}

function buildDinoExportItem(name, opts = {}){
  const {
    simple = false,
    includeMaps = false,
    includeEntries = false,
    includeEntryMaps = false,
    includeBlueprints = false,
    includeNametag = false,
    row = null
  } = opts;

  const resolvedRow =
    row ||
    getDinoRowsAllMaps().find(r => r.name === name) ||
    getDinoRowsCurrentMap().find(r => r.name === name) ||
    null;

  const bps = resolvedRow?.bps || [];

  if (simple && !includeMaps && !includeEntries && !includeBlueprints && !includeNametag) {
    return name;
  }

  const out = { name };

  if (includeBlueprints) {
    out.blueprints = bps;
  }

  if (includeNametag) {
    const firstBp = bps[0] || "";
    const d = firstBp ? getDinoObjByBp(firstBp) : null;
    out.nametag = d?.t || "";
  }

  if (includeMaps) {
    out.maps = [...(resolvedRow?.mapNames || [])];
  }

  if (includeEntries) {
    const entryNames = resolvedRow?.currentMapEntryNames || resolvedRow?.entryNames || [];

    if (includeEntryMaps) {
      out.entries = entryNames.map(entryName =>
        buildEntryExportItem(entryName, {
          simple: false,
          includeMaps: true,
          includeDinos: false,
          includeBlueprint: false
        })
      );
    } else {
      out.entryNames = entryNames;
    }
  }

  return out;
}


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
  const opts = exportPanelState.dino;

  let rows = [];

  if (exportPanelState.scope === "current_selection") {
    const name = selectedDinoName();
    if (name) rows = getDinoRowsAllMaps().filter(r => r.name === name);
  } else if (exportPanelState.scope === "current_map") {
    rows = getDinoRowsCurrentMap();
  } else {
    rows = getDinoRowsAllMaps();
  }

  return {
    type: "dino_report",
    source: src.label || src.id,
    scope: exportPanelState.scope,
    map: State.mapId || "",
    exportedAt: new Date().toISOString(),
    dinoCount: rows.length,
    dinos: rows.map(r => buildDinoExportItem(r.name, {
      simple: isSimpleDinoExport(opts),
      includeMaps: opts.includeMaps,
      includeEntries: opts.includeEntries,
      includeEntryMaps: opts.includeEntryMaps,
      includeBlueprints: opts.includeBlueprints,
      includeNametag: opts.includeNametag,
      row: r
    }))
  };
}

function buildEntryReport(){
  const src = currentSourceMeta();
  const opts = exportPanelState.entry;

  let rows = [];

  if (exportPanelState.scope === "current_selection") {
    const entryName = selectedEntryName();
    if (entryName) rows = getEntryRowsAllMaps().filter(r => r.entryName === entryName);
  } else if (exportPanelState.scope === "current_map") {
    rows = getEntryRowsCurrentMap();
  } else {
    rows = getEntryRowsAllMaps();
  }

  return {
    type: "entry_report",
    source: src.label || src.id,
    scope: exportPanelState.scope,
    map: State.mapId || "",
    exportedAt: new Date().toISOString(),
    entryCount: rows.length,
    entries: rows.map(r => buildEntryExportItem(r.entryName, {
      simple: isSimpleEntryExport(opts),
      includeMaps: opts.includeMaps,
      includeDinos: opts.includeDinos,
      includeBlueprint: opts.includeBlueprint
    }))
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
  const opts = exportPanelState.map;
  const originalMap = State.mapId;

  function buildMapRow(mapName){
    State.mapId = mapName;
    rebuildMapIndices();

    const row = { mapName };

    if (opts.includeDinos) {
      const dinoRows = getDinoRowsCurrentMap();
      row.dinos = dinoRows.map(r => buildDinoExportItem(r.name, {
        simple: isSimpleDinoExport({
          includeMaps: false,
          includeEntries: opts.dino.includeEntries,
          includeBlueprints: opts.dino.includeBlueprints,
          includeNametag: opts.dino.includeNametag
        }),
        includeMaps: false,
        includeEntries: opts.dino.includeEntries,
        includeEntryMaps: opts.dino.includeEntryMaps,
        includeBlueprints: opts.dino.includeBlueprints,
        includeNametag: opts.dino.includeNametag,
        row: r
      }));
    }

    if (opts.includeEntries) {
      const entryRows = getEntryRowsCurrentMap();
      row.entries = entryRows.map(r => buildEntryExportItem(r.entryName, {
        simple: isSimpleEntryExport({
          includeMaps: opts.entry.includeMaps,
          includeDinos: opts.entry.includeDinos,
          includeBlueprint: false
        }),
        includeMaps: opts.entry.includeMaps,
        includeDinos: opts.entry.includeDinos,
        includeBlueprint: false
      }));
    }

    if (opts.includeCrates) {
      // cm is now {mapIdx: [crateIdx,...]} with mp[] for names and ci[] for classes
      const loot = lootData();
      const cm = loot.cm || {};
      const mp = loot.mp || [];
      const ci = loot.ci || [];
      const mapIdx = mp.indexOf(mapName);
      const mapCrateClasses = mapIdx === -1 ? [] :
        (cm[String(mapIdx)] || []).map(idx => ci[idx]).filter(Boolean).sort();
      row.crates = mapCrateClasses.map(cls => {
        if (opts.crateUseDisplayName) {
          const crate = lootData().c?.[cls];
          const displayName = crate ? crateDisplayNameByClass(cls) : cls;
          return { class: cls, name: displayName };
        }
        return cls;
      });
    }

    if (opts.includeItems) {
      row.items = [...State.itemNameToIds.keys()].sort();
    }

    if (opts.includeMissions) {
      row.missions = [...missionClassesUsedOnCurrentMap()]
        .sort()
        .map(cls => opts.crateUseDisplayName
          ? { class: cls, name: missionLootDisplayName(cls) }
          : cls
        );
    }

    return row;
  }

  try {
    let rows = [];

    if (exportPanelState.scope === "current_source") {
      rows = getAllMapsForSource().map(code => {
        const mapName = Global.spawn?.mapLegend?.[code] || code;
        return buildMapRow(mapName);
      });
    } else {
      rows = [buildMapRow(State.mapId || "")];
    }

    return {
      type: "map_report",
      source: src.label || src.id,
      scope: exportPanelState.scope,
      exportedAt: new Date().toISOString(),
      mapCount: rows.length,
      maps: rows
    };
  } finally {
    State.mapId = originalMap;
    rebuildMapIndices();
  }
}


function mapNamesForCrateClass(crateClass){
  const loot = Global.loot;
  if (!loot?.cm || !loot?.ci || !loot?.mp) return [];
  const crateIdx = loot.ci.indexOf(crateClass);
  if (crateIdx === -1) return [];
  const out = [];
  for (const [mapIdxStr, crateIndices] of Object.entries(loot.cm)){
    if (crateIndices.includes(crateIdx)){
      const mapName = loot.mp[Number(mapIdxStr)];
      if (mapName) out.push(mapName);
    }
  }
  return out;
}


function buildCrateExportItem(crateClass, crate, opts){
  const displayName = crateDisplayNameByClass(crateClass);

  const entry = {
    name: displayName,
    class: crateClass,
    requiredLevel: crate.l ?? null
  };

  if (opts.includeSets) {
    entry.lootSets = (crate.s || []).map((set, si) => {
      const setName = lootSetNameFromRow(set, `Set ${si + 1}`);
      const setOut = { name: setName };

      if (opts.includeWeights) setOut.weight = set.w ?? null;

      const { allEntries } = lootSetEntriesFromRow(set);

      if (opts.includeItems) {
        setOut.entries = allEntries.map(e => {
          const entryOut = { name: e.n || "" };
          if (opts.includeWeights)   entryOut.entryWeight = e.w ?? null;
          if (opts.includeWeights)   entryOut.quantity    = e.mn != null ? `${fmt(e.mn)} - ${fmt(e.mx)}` : null;
          if (opts.includeQuality)   entryOut.quality     = e.q1 != null ? `${fmt(e.q1)} - ${fmt(e.q2)}` : null;
          if (opts.includeBpChance)  entryOut.bpChance    = isTrue01(e.fb) ? "Force BP" : (e.b != null ? `${fmt(e.b * 100)}%` : null);

          if (opts.includeItems) {
            entryOut.items = (e.i || []).map(itemId => {
              const row = itemData().i?.[String(itemId)];
              return row?.n || `item_${itemId}`;
            });
          }
          return entryOut;
        });
      }

      return setOut;
    });
  }

  return entry;
}


function buildMissionExportItem(missionClass, opts = {}){
  const m = lootData().m?.[missionClass];
  if (!m) return null;

  const entry = {
    name: missionClass,
    displayName: missionLootDisplayName(missionClass),
    type: m.t || null,
    difficulty: missionDiffLabelFromClass(missionClass)
  };

  if (opts.includeSets) {
    const allSets = [];

    // Direct reward items (ri)
    if (Array.isArray(m.ri) && m.ri.length) {
      allSets.push({
        name: "Reward Items",
        items: m.ri.map(iid => {
          const row = itemData().i?.[String(iid)];
          return row?.n || `item_${iid}`;
        })
      });
    }

    // Loot structure sets (ls)
    for (const structClass of (m.ls || [])) {
      const ls = lootData().ls?.[structClass];
      if (!ls) continue;

      for (const setRow of (ls.s || [])) {
        const setOut = { name: setRow.n || structClass };
        if (opts.includeWeights) setOut.weight = setRow.w ?? null;

        if (opts.includeItems) {
          setOut.entries = (setRow.e || []).map(e => {
            const entryOut = { name: e.n || "" };
            if (opts.includeWeights)  entryOut.entryWeight = e.w ?? null;
            if (opts.includeWeights)  entryOut.quantity    = e.mn != null ? `${fmt(e.mn)} - ${fmt(e.mx)}` : null;
            if (opts.includeQuality)  entryOut.quality     = e.q1 != null ? `${fmt(e.q1)} - ${fmt(e.q2)}` : null;
            if (opts.includeBpChance) entryOut.bpChance    = isTrue01(e.fb) ? "Force BP" : (e.b != null ? `${fmt(e.b * 100)}%` : null);
            entryOut.items = (e.i || []).map(iid => {
              const row = itemData().i?.[String(iid)];
              return row?.n || `item_${iid}`;
            });
            return entryOut;
          });
        }

        allSets.push(setOut);
      }
    }

    entry.lootSets = allSets;
  }

  return entry;
}



function buildCrateReport(){
  const src = currentSourceMeta();
  const opts = exportPanelState.crate;
  const scope = exportPanelState.scope;
  const allLoot = lootData();

  let crateClasses = [];

  if (scope === "current_selection") {
    const crateVal = State.selections?.crate || "";
    const crateId = parseInt(crateVal.replace("crate:", ""), 10);
    const cls = isNaN(crateId) ? null : crateIdToClass(crateId);
    if (cls) crateClasses = [cls];
  } else if (scope === "current_source") {
    crateClasses = Object.values(allLoot.cm || {}).flat().map(idx => (allLoot.ci || [])[idx]).filter(Boolean).sort();
  } else {
    crateClasses = [...crateClassesUsedOnCurrentMap()].sort();
  }

  const crateItems = crateClasses
    .map(cls => {
      const crate = allLoot.c?.[cls];
      if (!crate) return null;
      const item = buildCrateExportItem(cls, crate, opts);
      if (opts.includeMaps && scope !== "current_selection") {
        item.maps = mapNamesForCrateClass(cls);
      }
      return item;
    })
    .filter(Boolean);

  // Missions
  const missionItems = [];
  if (opts.includeMissions && scope !== "current_selection") {
    const missionClasses = scope === "current_source"
      ? Object.keys(allLoot.m || {}).sort()
      : [...missionClassesUsedOnCurrentMap()].sort();

    for (const cls of missionClasses) {
      const item = buildMissionExportItem(cls, opts);
      if (item) missionItems.push(item);
    }
  }

  return {
    type: "crate_report",
    source: src.label || src.id,
    scope,
    map: scope === "current_source" ? "all" : (State.mapId || ""),
    exportedAt: new Date().toISOString(),
    crateCount: crateItems.length,
    crates: crateItems,
    ...(missionItems.length ? { missionCount: missionItems.length, missions: missionItems } : {})
  };
}


function buildItemReport(){
  const src = currentSourceMeta();
  const opts = exportPanelState.item;
  const scope = exportPanelState.scope;

  let itemEntries = [];

  if (scope === "current_selection") {
    const itemName = State.selections?.item || "";
    if (itemName) itemEntries = [[itemName, State.itemNameToIds.get(itemName) || []]];
  } else if (scope === "current_source") {
    // All items that appear in any crate in the loot data
    const allItemNames = new Map();
    for (const [name, ids] of State.itemNameToIds.entries()) {
      const inLoot = ids.filter(id => lootData().r?.[String(id)]);
      if (inLoot.length) allItemNames.set(name, inLoot);
    }
    itemEntries = [...allItemNames.entries()].sort(([a], [b]) => a.localeCompare(b));
  } else {
    itemEntries = [...State.itemNameToIds.entries()].sort(([a], [b]) => a.localeCompare(b));
  }

  const itemRows = itemEntries.map(([itemName, itemIds]) => {
    const entry = { name: itemName };

    const firstId = itemIds[0];
    const itemRow = firstId != null ? itemData().i?.[String(firstId)] : null;
    if (itemRow?.p != null) {
      const pathPrefix = itemData().p?.[String(itemRow.p)] || "";
      entry.blueprint = `${pathPrefix}${itemRow.c || ""}`;
    }

    if (opts.includeMaps) {
      const mapsWithItem = new Set();
      for (const itemId of itemIds) {
        const rRows = lootData().r?.[String(itemId)] || [];
        for (const r of rRows) {
          if (!Array.isArray(r) || typeof r[0] !== "number") continue;
          const crateClass = lootData().ci?.[r[0]];
          if (!crateClass) continue;
          for (const mapName of mapNamesForCrateClass(crateClass)) {
            mapsWithItem.add(mapName);
          }
        }
      }
      entry.maps = [...mapsWithItem].sort();
    }

    if (opts.includeCrates || opts.includeMissions) {
      const crateEntries = [];
      const missionEntries = [];

      for (const itemId of itemIds) {
        const rRows = lootData().r?.[String(itemId)] || [];

        for (const r of rRows) {
          if (!Array.isArray(r) || !r.length) continue;

          // Mission entry: r = ["m", missionId, context, 0]
          if (r[0] === "m" && opts.includeMissions) {
            const missionClass = typeof r[1] === "number"
              ? lootData().mi?.[r[1]]
              : r[1];
            if (!missionClass) continue;

            // Avoid duplicates
            if (missionEntries.some(e => e.mission === missionClass)) continue;

            missionEntries.push({
              mission: missionClass,
              displayName: missionLootDisplayName(missionClass),
              type: lootData().m?.[missionClass]?.t || null,
              difficulty: missionDiffLabelFromClass(missionClass)
            });
            continue;
          }

          // Supply/horde crate entry
          if (!opts.includeCrates) continue;
          if (typeof r[0] !== "number") continue;
          if (scope !== "current_source" && !State.mapCrateIds.has(r[0])) continue;

          const crateClass = lootData().ci?.[r[0]];
          if (!crateClass) continue;

          const crate = lootData().c?.[crateClass];
          if (!crate) continue;

          const setIdx   = r[1] ?? 0;
          const entryIdx = r[2] ?? 0;
          const set = (crate.s || [])[setIdx];
          if (!set) continue;

          const { allEntries } = lootSetEntriesFromRow(set);
          const e = allEntries[entryIdx];
          if (!e) continue;

          const crateEntry = {
            crate: crateDisplayNameByClass(crateClass),
            crateClass
          };

          if (opts.includeSetName)  crateEntry.lootSet     = lootSetNameFromRow(set, `Set ${setIdx + 1}`);
          if (opts.includeWeights)  crateEntry.entryWeight = e.w ?? null;
          if (opts.includeQuantity) crateEntry.quantity    = e.mn != null ? `${fmt(e.mn)} - ${fmt(e.mx)}` : null;
          if (opts.includeQuality)  crateEntry.quality     = e.q1 != null ? `${fmt(e.q1)} - ${fmt(e.q2)}` : null;
          if (opts.includeBpChance) crateEntry.bpChance    = isTrue01(e.fb) ? "Force BP" : (e.b != null ? `${fmt(e.b * 100)}%` : null);

          if (opts.includeCrateMaps) {
            crateEntry.maps = mapNamesForCrateClass(crateClass);
          }

          crateEntries.push(crateEntry);
        }
      }

      if (opts.includeCrates && crateEntries.length)  entry.sources   = crateEntries;
      if (opts.includeMissions && missionEntries.length) entry.missions = missionEntries;
    }

    return entry;
  });

  return {
    type: "item_report",
    source: src.label || src.id,
    scope,
    map: scope === "current_source" ? "all" : (State.mapId || ""),
    exportedAt: new Date().toISOString(),
    itemCount: itemRows.length,
    items: itemRows
  };
}


function buildExportReport(){
  if (exportPanelState.reportType === "dino") return buildDinoReport();
  if (exportPanelState.reportType === "entry") return buildEntryReport();
  if (exportPanelState.reportType === "crate") return buildCrateReport();
  if (exportPanelState.reportType === "item") return buildItemReport();
  return buildMapReport();
}

function exportCurrentReportJSON(){
  const report = buildExportReport();
  const src = currentSourceMeta();

  const type = exportPanelState.reportType;

  const fileBase = [
    "export",
    type,
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
