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


