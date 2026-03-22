/* Split from app_embed.js lines 99-251 */

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
