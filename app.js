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
  { id: "Astraeos", file: "data/Astraeos.json" }
];

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

  L.imageOverlay(cfg.image, bounds).addTo(map);

  map.fitBounds(bounds, {
    padding: [20, 20],
    maxZoom: -1
  });

  map.setMaxBounds(bounds);
  map.options.maxBoundsViscosity = 1.0;

  const layer = L.layerGroup().addTo(map);
  return { map, layer };
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
  layer.clearLayers();

  const dino = cfg.dinos?.[dinoKey];
  if (!dino) return;

  for (const entry of (dino.entries || [])) {
    const hasPoints = (entry.points && entry.points.length > 0);
    const color = rarityToColor(entry.rarity);
    const isCave = entry.bIsCaveManager === true;
    const untame = entry.bForceUntameable === true;
    const strokeColor = isCave ? "#000000" : color;


    // Boxes (with tiny-box → point fallback if points exist)
    for (const box of (entry.boxes || [])) {
      if (hasPoints && isTinyBox(box)) {
        const cx = box.x + box.w / 2;
        const cy = box.y + box.h / 2;

        L.circleMarker([cy, cx], {
          color: strokeColor,
          weight: isCave ? 2 : 1,
          opacity: 1,
          fillColor: color,
          radius: 2,
          fillOpacity: untame ? 0.55 : 0.8
        }).addTo(layer);
      } else {
        const y1 = box.y;
        const x1 = box.x;
        const y2 = box.y + box.h;
        const x2 = box.x + box.w;

        L.rectangle([[y1, x1], [y2, x2]], {
          color: strokeColor,
          weight: isCave ? 2 : 1,
          opacity: 1,
          dashArray: untame ? "6 4" : null,
          fillColor: color,
          fillOpacity: untame ? 0.50 : (isCave ? 0.50 : 0.70)
        }).addTo(layer);
      }
    }

    // Real server-side points
    for (const pt of (entry.points || [])) {
      L.circleMarker([pt.y, pt.x], {
        color: strokeColor,
        weight: isCave ? 2 : 1,
        opacity: 1,
        fillColor: color,
        radius: 2,
        fillOpacity: untame ? 0.55 : 0.8
      }).addTo(layer);
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

let mapObj = null;
let currentCfg = null;

async function loadMap(file) {
  currentCfg = await loadJSON(file);

  if (!mapObj) {
    mapObj = initMap(currentCfg);
  } else {
    mapObj.map.remove();
    mapObj = initMap(currentCfg);
  }

  setupDropdown(currentCfg, (dinoKey) => drawDino(mapObj.layer, currentCfg, dinoKey));
}

function setupMapDropdown() {
  const sel = document.getElementById("mapSelect");
  if (!sel) return;

  sel.innerHTML = "";
  for (const m of MAPS) {
    const opt = document.createElement("option");
    opt.value = m.file;
    opt.textContent = m.id;
    sel.appendChild(opt);
  }

  sel.addEventListener("change", () => loadMap(sel.value));

  if (MAPS.length) {
    sel.value = MAPS[0].file;
    loadMap(MAPS[0].file);
  }
}

setupMapDropdown();