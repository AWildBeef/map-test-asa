async function loadJSON(path) {
  const res = await fetch(path);
  return await res.json();
}

async function init() {
  const cfg = await loadJSON("data/TheIsland.json");

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

  for (const dinoName in cfg.dinos) {
    const dino = cfg.dinos[dinoName];

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
}

init();