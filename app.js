// If an entry has points AND boxes, and ALL boxes are smaller than this area,
// render points instead of boxes.
const BOX_TO_POINT_AREA_THRESHOLD = 18_000; // tweak (e.g. 10k–50k)

// Optional: also trigger if boxes are tiny in width/height
const BOX_TO_POINT_MIN_DIM = 40; // pixels; tweak or set to 0 to disable

function shouldPreferPoints(entry) {
  const hasPts = (entry.points && entry.points.length > 0);
  const hasBoxes = (entry.boxes && entry.boxes.length > 0);
  if (!hasPts || !hasBoxes) return false;

  return entry.boxes.every(b => {
    const area = (b.w || 0) * (b.h || 0);
    const tinyArea = area > 0 && area <= BOX_TO_POINT_AREA_THRESHOLD;
    const tinyDim = (BOX_TO_POINT_MIN_DIM > 0) &&
      ((b.w || 0) <= BOX_TO_POINT_MIN_DIM || (b.h || 0) <= BOX_TO_POINT_MIN_DIM);

    return tinyArea || tinyDim;
  });
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

function drawDino(layer, cfg, dinoKey) {
  layer.clearLayers();

  const dino = cfg.dinos?.[dinoKey];
  if (!dino) return;

  for (const entry of (dino.entries || [])) {
    const preferPoints = shouldPreferPoints(entry);

    if (!preferPoints) {
      // Draw boxes
      for (const box of (entry.boxes || [])) {
        const y1 = box.y;
        const x1 = box.x;
        const y2 = box.y + box.h;
        const x2 = box.x + box.w;

        L.rectangle([[y1, x1], [y2, x2]], {
          weight: 1,
          fillOpacity: 0.25
        }).addTo(layer);
      }
    }

    // Draw points if either:
    // - we prefer points (boxes too small), OR
    // - the entry only has points
    if (preferPoints || !(entry.boxes && entry.boxes.length)) {
      for (const pt of (entry.points || [])) {
        L.circleMarker([pt.y, pt.x], {
          radius: 3,
          weight: 1,
          fillOpacity: 0.9
        }).addTo(layer);
      }
    }
  }
} // ✅ <-- you were missing this closing brace

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

(async function init() {
  const cfg = await loadJSON("data/TheIsland.json");
  const { layer } = initMap(cfg);

  setupDropdown(cfg, (dinoKey) => drawDino(layer, cfg, dinoKey));
})();