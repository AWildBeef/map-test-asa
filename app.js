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

  const map = L.map("map", {
    crs: L.CRS.Simple,
    minZoom: -4
  });

  const bounds = [[0, 0], [h, w]];
  L.imageOverlay(cfg.image, bounds).addTo(map);
  map.fitBounds(bounds);

  const layer = L.layerGroup().addTo(map);
  return { map, layer };
}

function rarityToColor(r) {
  const s = String(r || "").toLowerCase();
  if (s.includes("very rare")) return "red";
  if (s.includes("rare")) return "orange";
  if (s.includes("uncommon")) return "yellow";
  if (s.includes("common")) return "lime";
  return "white";
}

function drawDino(layer, cfg, dinoKey) {
  layer.clearLayers();

  const dino = cfg.dinos?.[dinoKey];
  if (!dino) return;

  for (const entry of (dino.entries || [])) {
    const hasPoints = (entry.points && entry.points.length > 0);
    const color = rarityToColor(entry.rarity);

    // Boxes (with tiny-box → point fallback if points exist)
    for (const box of (entry.boxes || [])) {
      if (hasPoints && isTinyBox(box)) {
        const cx = box.x + box.w / 2;
        const cy = box.y + box.h / 2;

        L.circleMarker([cy, cx], {
          color,
          fillColor: color,
          radius: 3,
          weight: 1,
          fillOpacity: 0.9
        }).addTo(layer);
      } else {
        const y1 = box.y;
        const x1 = box.x;
        const y2 = box.y + box.h;
        const x2 = box.x + box.w;

        L.rectangle([[y1, x1], [y2, x2]], {
          color,
          weight: 1,
          fillColor: color,
          fillOpacity: 0.20
        }).addTo(layer);
      }
    }

    // Real server-side points
    for (const pt of (entry.points || [])) {
      L.circleMarker([pt.y, pt.x], {
        color,
        fillColor: color,
        radius: 3,
        weight: 1,
        fillOpacity: 0.9
      }).addTo(layer);
    }
  }
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