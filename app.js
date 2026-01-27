let map;
let overlayGroup;

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return await res.json();
}

function initMap(cfg) {
  // Leaflet “simple CRS” = pixel coordinates
  map = L.map('map', { crs: L.CRS.Simple, minZoom: -4 });

  const w = cfg.imageSize.width;
  const h = cfg.imageSize.height;

  // Bounds in pixel space: top-left (0,0), bottom-right (w,h)
  const bounds = [[0, 0], [h, w]];

  L.imageOverlay(cfg.image, bounds).addTo(map);
  map.fitBounds(bounds);

  overlayGroup = L.layerGroup().addTo(map);
}

function rectFromBox(box) {
  // Your x,y are top-left in pixel coords.
  // Leaflet wants lat/lng-ish as [row(y), col(x)].
  const y1 = box.y;
  const x1 = box.x;
  const y2 = box.y + box.h;
  const x2 = box.x + box.w;

  return L.rectangle([[y1, x1], [y2, x2]], {
    weight: 1,
    fillOpacity: 0.25
  });
}

function renderDino(cfg, dinoKey) {
  overlayGroup.clearLayers();

  const d = cfg.dinos[dinoKey];
  if (!d) return;

  for (const entry of d.entries || []) {
    for (const box of entry.boxes || []) {
      rectFromBox(box).addTo(overlayGroup);
    }
  }
}

function populateDropdown(cfg) {
  const sel = document.getElementById('dinoSelect');
  sel.innerHTML = "";

  const keys = Object.keys(cfg.dinos || {}).sort((a,b) => a.localeCompare(b));
  for (const k of keys) {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = k;
    sel.appendChild(opt);
  }

  sel.addEventListener('change', () => renderDino(cfg, sel.value));
  if (keys.length) renderDino(cfg, keys[0]);
}

(async () => {
  // For now we’ll load one map JSON
  const cfg = await loadJSON("data/TheIsland.json");
  initMap(cfg);
  populateDropdown(cfg);
})();