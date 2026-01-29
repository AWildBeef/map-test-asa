const BOX_TO_POINT_AREA_THRESHOLD = 18_000;
const BOX_TO_POINT_MIN_DIM = 40;

const MAPS = [
  { id: "The Island", file: "data/TheIsland.json" },
  { id: "The Center", file: "data/TheCenter.json" },
  { id: "Scorched Earth", file: "data/ScorchedEarth.json" },
  { id: "Valguero", file: "data/Valguero.json" },
  { id: "Ragnarok", file: "data/Ragnarok.json" },
  { id: "Lost Colony", file: "data/LostColony.json" },
  { id: "Extinction", file: "data/Extinction.json" },
  { id: "Aberration", file: "data/Aberration.json" },

  // Single Astraeos entry (with backgrounds)
  {
    id: "Astraeos",
    file: "data/Astraeos.json",
    backgrounds: [
      { id: "hand", label: "In Game", url: "maps/astraeos_ingame.png" },
      { id: "sat",  label: "Satellite",  url: "maps/astraeos.png" }
    ],
    defaultBg: "sat"
  }
];

let mapObj = null;
let currentCfg = null;

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return await res.json();
}

function initMap(cfg) {
  const w = cfg.imageSize.width;
  const h = cfg.imageSize.height;
  const bounds = [[0, 0], [h, w]];

  const map = L.map("map", {
    crs: L.CRS.Simple,
    minZoom: -3,
    maxZoom: 2,
    zoomSnap: 0.25,
    zoomDelta: 0.25,
    wheelPxPerZoomLevel: 120
  });

  const overlay = L.imageOverlay(cfg.image, bounds).addTo(map);

  map.fitBounds(bounds, { padding: [20, 20], maxZoom: -1 });
  map.setMaxBounds(bounds);
  map.options.maxBoundsViscosity = 1.0;

  // 👇 two groups: normal first, caves second (top)
  const layer = L.layerGroup().addTo(map);
  const caveLayer = L.layerGroup().addTo(map);

  return { map, layer, caveLayer, overlay, bounds };
}

function setupBackgroundDropdown(mapMeta, cfg) {
  const wrap = document.getElementById("bgSelectWrap");
  const sel = document.getElementById("bgSelect");
  if (!wrap || !sel || !mapObj) return;

  const bgs = mapMeta?.backgrounds;

  // Hide for maps without alt backgrounds
  if (!bgs || !bgs.length) {
    wrap.style.display = "none";
    sel.innerHTML = "";
    // ensure base image is used
    mapObj.overlay.setUrl(cfg.image);
    return;
  }

  // Show + populate
  wrap.style.display = "";
  sel.innerHTML = "";

  for (const bg of bgs) {
    const opt = document.createElement("option");
    opt.value = bg.url;
    opt.textContent = `Map style: ${bg.label}`;
    sel.appendChild(opt);
  }

  const defaultBg = bgs.find(x => x.id === mapMeta.defaultBg) || bgs[0];
  sel.value = defaultBg.url;

  mapObj.overlay.setUrl(sel.value);

  sel.onchange = () => mapObj.overlay.setUrl(sel.value);
}

async function loadMapByMeta(mapMeta) {
  currentCfg = await loadJSON(mapMeta.file);

  if (mapObj) mapObj.map.remove();
  mapObj = initMap(currentCfg);

  setupBackgroundDropdown(mapMeta, currentCfg);
  setupDropdown(currentCfg, (dinoKey) => drawDino(mapObj.layer, currentCfg, dinoKey));
}

function setupMapDropdown() {
  const sel = document.getElementById("mapSelect");
  if (!sel) return;

  sel.innerHTML = "";
  for (const m of MAPS) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.id;
    sel.appendChild(opt);
  }

  const pickById = (id) => MAPS.find(m => m.id === id) || MAPS[0];

  sel.addEventListener("change", () => loadMapByMeta(pickById(sel.value)));

  sel.value = MAPS[0].id;
  loadMapByMeta(MAPS[0]);
}

setupMapDropdown();


function isTinyBox(box) {
  const area = (box.w || 0) * (box.h || 0);
  if (area > 0 && area <= BOX_TO_POINT_AREA_THRESHOLD) return true;

  if (
    BOX_TO_POINT_MIN_DIM > 0 &&
    ((box.w || 0) <= BOX_TO_POINT_MIN_DIM ||
     (box.h || 0) <= BOX_TO_POINT_MIN_DIM)
  ) {
    return true;
  }

  return false;
}

function rarityToColor(r) {
  const s = String(r || "").toLowerCase();
  if (s.includes("very rare")) return "#FF0000";
  if (s.includes("rare")) return "#FF6600";
  if (s.includes("very uncommon")) return "#FFCC00";
  if (s.includes("uncommon")) return "#FFFF00";
  if (s.includes("common")) return "#B2FF00";
  if (s.includes("very common")) return "#00FF00";
  return "#000000";
}

function drawDino(layer, cfg, dinoKey) {
  mapObj.layer.clearLayers();
  mapObj.caveLayer.clearLayers();


  const dino = cfg.dinos?.[dinoKey];
  if (!dino) return;

  for (const entry of (dino.entries || [])) {
    const hasPoints = (entry.points && entry.points.length > 0);
    const color = rarityToColor(entry.rarity);
    const isCave = entry.bIsCaveManager === true;
    const untame = entry.bForceUntameable === true;
    const strokeColor = isCave ? "#242729" : color;
    const targetLayer = isCave ? mapObj.caveLayer : mapObj.layer;


    // Boxes (with tiny-box → point fallback if points exist)
    // Boxes
    for (const box of (entry.boxes || [])) {
      if (hasPoints && isTinyBox(box)) {
        const cx = box.x + box.w / 2;
        const cy = box.y + box.h / 2;

        const marker = L.circleMarker([cy, cx], {
          color: color,
          weight: isCave ? 1.3 : 1,
          opacity: untame ? 0.80 : (isCave ? 0.80 : 1),
          fillColor: color,
          radius: 4,
          fillOpacity: untame ? 0.5 : 0.8
        }).addTo(targetLayer);

      } else {
        const y1 = box.y;
        const x1 = box.x;
        const y2 = box.y + box.h;
        const x2 = box.x + box.w;

        const rect = L.rectangle([[y1, x1], [y2, x2]], {
          color: color,
          weight: isCave ? 3 : 1,
          opacity: untame ? 0.80 : (isCave ? 0.80 : 1),
          dashArray: untame ? "3 3" : null,
          fillColor: color,
          fillOpacity: untame ? 0.50 : (isCave ? 0.50 : 0.80)
        }).addTo(targetLayer);

      }
    }

// Points
for (const pt of (entry.points || [])) {
  const marker = L.circleMarker([pt.y, pt.x], {
    color: color,
    weight: isCave ? 2 : 1,
    opacity: untame ? 0.80 : (isCave ? 0.80 : 1),
    fillColor: color,
    radius: 4,
    fillOpacity: untame ? 0.55 : 0.8
  }).addTo(targetLayer);

}
  }
}

function setupDropdown(cfg, onChange) {
  const sel = document.getElementById("dinoSelect");
  if (!sel) return null;

  const keys = Object.keys(cfg.dinos || {}).sort((a, b) => a.localeCompare(b));

  sel.innerHTML = "";
  for (const k of keys) {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = k;
    sel.appendChild(opt);
  }

  sel.addEventListener("change", () => onChange(sel.value));

  if (keys.length) {
    sel.value = keys[0];
    onChange(keys[0]);
  }

  return sel;
}
