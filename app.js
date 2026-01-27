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

  for (const entry of dino.entries || []) {
    for (const box of entry.boxes || []) {
      const y1 = box.y;
      const x1 = box.x;
      const y2 = box.y + box.h;
      const x2 = box.x + box.w;

      L.rectangle([[y1, x1], [y2, x2]], {
        color: "red",
        weight: 1,
        fillOpacity: 0.25
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

  // Default to first dino
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