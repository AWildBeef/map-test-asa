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


