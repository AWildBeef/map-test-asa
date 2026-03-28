

function setMapBackgroundFromDock(btn){
  const mapMeta = dockState.mapMeta;
  if (!mapMeta?.backgrounds?.length || !mapObj?.overlay) return;

  const bgs = mapMeta.backgrounds;
  const cur = btn.dataset.bgIndex ? Number(btn.dataset.bgIndex) : 0;
  const next = (cur + 1) % bgs.length;

  btn.dataset.bgIndex = String(next);
  mapObj.overlay.setUrl(bgs[next].url);
  btn.title = `Background: ${bgs[next].label || bgs[next].id || (next + 1)} (tap to cycle)`;
}


function supplyLegendForCurrentMap(){
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);
  return Array.isArray(geom?.supplyLegend) ? geom.supplyLegend : [];
}


function hordeLegendForCurrentMap(){
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);
  return Array.isArray(geom?.hordeLegend) ? geom.hordeLegend : [];
}


function drawPlayerStarts(groups){
  if (!mapObj?.poiLayer) return;
  if (!poiVisibility.playerStarts) return;
  if (!groups || typeof groups !== "object") return;

  const regionNames = Object.keys(groups);

  for (const [regionName, block] of Object.entries(groups)) {
    const difficulty = block?.difficulty;
    const points = Array.isArray(block?.points) ? block.points : [];
    const fill = playerStartColorByRegionIndex(regionName, regionNames);

    for (const pt of points) {
      if (!Array.isArray(pt) || pt.length < 2) continue;

      const x = Number(pt[0]);
      const y = Number(pt[1]);
      if (![x, y].every(Number.isFinite)) continue;

      const tip = [
        regionName,
        difficulty != null ? `Difficulty ${difficulty}` : null
      ].filter(Boolean).join(" • ");

      L.circleMarker([y, x], {
        radius: 5,
        color: "#111",
        weight: 1.5,
        fillColor: fill,
        fillOpacity: 0.95,
        pane: "poiPane",
        className:"poi-pstart"
      })
        .addTo(mapObj.poiLayer)
        .bindTooltip(tip || "Player Start"), {
          direction: "auto",
          sticky: true,
          opacity: 0.97,
          className: "pstart-tooltip",
          autoPan: true
        };
    }
  }
}


function missionLegendForMap(){
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);
  return Array.isArray(geom?.missionLegend) ? geom.missionLegend : [];
}


function missionLegendForCurrentMap(){
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);
  return Array.isArray(geom?.missionLegend) ? geom.missionLegend : [];
}


function worldRulesForCurrentMap(){
  const all = Global.spawn?.worldReplacements || {};

  const mapRules = Array.isArray(all?.[State.mapId]) ? all[State.mapId] : [];
  const globalRules = Array.isArray(all?.__global__) ? all.__global__ : [];

  return [...mapRules, ...globalRules];
}


function rebuildMapIndices(){

  const spawn = Global.spawn || {};

  State.mapEntries.clear();
  State.entryToDinos.clear();
  State.dinoToEntries.clear();
  State.nameToBps.clear();

  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const mapCode = mapMeta?.mapCode;

  // 1) which entries are on this map?
  for (const [entryName, maps] of Object.entries(spawn.entryMaps || {})){
    if (Array.isArray(maps) && maps.includes(mapCode)){
      State.mapEntries.add(entryName);
    }
  }

  // 2) build entry -> dinos and dino -> entries USING WORLD REPLACEMENTS
  for (const entryName of State.mapEntries){

    const rows = spawn.entries?.[entryName]?.d || [];
    const finalBpsForEntry = new Set();

    for (const r of rows){
      const rawBp = normalizeBp(r?.[0]);
      if (!rawBp) continue;

      const outs = worldOutputsForBp(rawBp);

      for (const out of outs){
        const finalBp = normalizeBp(out?.[0]);
        const prob = Number(out?.[1] || 0);

        if (!finalBp || prob <= 0) continue;

        finalBpsForEntry.add(finalBp);

        if (!State.dinoToEntries.has(finalBp)){
          State.dinoToEntries.set(finalBp, []);
        }
        State.dinoToEntries.get(finalBp).push(entryName);
      }
    }

    State.entryToDinos.set(entryName, [...finalBpsForEntry]);
  }

  // 3) build name -> bp index from FINAL OUTPUT dinos
  const allowedModBps = modBlueprintSet();

    for (const bp of State.dinoToEntries.keys()){
      if (!activeSourceIsOfficial() && !allowedModBps.has(bp)) {
        continue;
      }

      const d = getDinoObjByBp(bp);
      if (!d) continue;

    const labels = labelsForDinoObj(d);
    for (const name of labels){
      if (!State.nameToBps.has(name)){
        State.nameToBps.set(name, []);
      }
      State.nameToBps.get(name).push(bp);
    }
  }

  // 4) sort / dedupe
  for (const [bp, entries] of State.dinoToEntries.entries()){
    State.dinoToEntries.set(bp, [...new Set(entries)].sort());
  }

  for (const [entry, bps] of State.entryToDinos.entries()){
    State.entryToDinos.set(entry, [...new Set(bps)].sort());
  }

  for (const [name, bps] of State.nameToBps.entries()){
    State.nameToBps.set(name, [...new Set(bps)].sort());
  }

  State.names = [...State.nameToBps.keys()].sort((a,b)=>a.localeCompare(b));
  State.entryList = [...State.mapEntries].sort((a,b)=>a.localeCompare(b));
}


function nudgeMapForTopbarToggle(prevHeight, nextHeight){
  if (!mapObj?.map) return;

  const delta = Number(nextHeight || 0) - Number(prevHeight || 0);
  if (!delta) return;

  mapObj.map.invalidateSize();

  // positive delta = controls opened taller
  // pan map upward visually by moving center downward in screen space
  mapObj.map.panBy([0, Math.round(delta * 0.5)], {
    animate: false
  });
}


function refitMapForUI(){
  if (!mapObj?.map || !mapObj?.bounds) return;

  mapObj.map.invalidateSize();
  map.fitBounds(bounds, {
    paddingTopLeft: [6, 6],
    paddingBottomRight: [6, 70]
  });
}


function initMap(img,size=[2048,2048]){

  const bounds = [[0,0],[size[1],size[0]]];
  const paddedBounds = L.latLngBounds(bounds).pad(0.1);


  const map = L.map("map", {
    crs: L.CRS.Simple,
    minZoom: -3,
    maxZoom: 2,
    zoomSnap: 0.25,
    zoomDelta: 0.25,
    wheelPxPerZoomLevel: 120,
    zoomControl: false,
    maxBounds: paddedBounds,
    maxBoundsViscosity: 0.6,
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false
  });
  
  L.control.zoom({ position: "bottomleft" }).addTo(map);

  setTimeout(() => {
    document.querySelector(".leaflet-control-zoom")?.classList.add("zoom-horizontal");
  }, 0);

  // panes
  map.createPane("spawnPane");
  map.createPane("poiPane");

  map.getPane("spawnPane").style.zIndex = 410;
  map.getPane("poiPane").style.zIndex = 620;
  map.getPane("tooltipPane").style.zIndex = 900;

  const overlay = L.imageOverlay(img, bounds).addTo(map);

  const layer = L.layerGroup().addTo(map);
  const poiLayer = L.layerGroup().addTo(map);

  map.fitBounds(bounds, {
    paddingTopLeft: [6, 6],
    paddingBottomRight: [6, 20]
  });

  return { map, overlay, layer, poiLayer, bounds };
}


async function onMapChanged(){

  const mapMeta = MAPS.find(m => m.id === State.mapId);

  const geom = await loadJSON(`${PATHS.geomDir}/${mapMeta.geomShort}_geom.json`);
  Global.mapGeom.set(mapMeta.geomShort, geom);
  
  const resolvedLegend = buildResolvedSupplyLegend(geom);
  Global.resolvedSupplyLegend.set(mapMeta.geomShort, resolvedLegend);

  const img = geom.image || `${PATHS.mapsDir}/${mapMeta.image}`;

  const size = geom.size || [2048,2048];
  const bounds = [[0,0],[size[1],size[0]]];

  if (!mapObj){
    mapObj = initMap(img, geom.size || [2048,2048]);
    ensureDockControl(mapObj.map);
  } else {
    mapObj.overlay.setUrl(img);
  }

  dockState.mapMeta = mapMeta;
  dockState.cfg = {
    image: img
  };

  rebuildMapIndices();
  rebuildLootIndices();
  syncSelectionForMode(State.mode);
  rebuildSelectionSelect();
  renderDock();
  if (isPanelVisible("mapEntriesPanel")) {
    renderMapEntriesPanel();
  }

  render();
}


function drawDino(name){
  clearDraw();

  const grouped = getSelectedDinoGroup(name);
  if (!grouped) return;

  for (let i = 0; i < grouped.entries.length; i++){
    const entry = grouped.entries[i];
    if (!isEntryVisible(name, i)) continue;

    const bpSet = new Set(State.nameToBps.get(name) || []);
    const rarity = entryRarityForBps(entry.entryClass, bpSet);
    drawEntry(entry.entryClass, rarity);
  }
}


function drawEntry(entryName, rarityScore){

  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);

  const entry = geom?.entries?.[entryName];
  if (!entry) return;

  for (const mgr of Object.values(entry.m || {})) {

    const meta = {
      isCave: !!mgr?.c,
      isUntameable: !!mgr?.u,
      md: mgr?.md || 0
    };

    const rarityLabel = finalRarityForManager(entryName, meta, rarityScore);
    const color = rarityToColor(rarityLabel);
    const style = styleForEntry(meta, color);

    // boxes
    for (const box of mgr.b || []) {
      const [x, y, w, h] = box;
      if (![x, y, w, h].every(Number.isFinite)) continue;

      L.rectangle([[y, x], [y + h, x + w]], {
        ...style,
        pane: "spawnPane"
      }).addTo(mapObj.layer);
    }

    // points
    for (const pt of mgr.p || []) {
      const [x, y] = pt;
      if (![x, y].every(Number.isFinite)) continue;

      L.circleMarker([y, x], {
        radius: 3,
        color: style.color,
        weight: style.weight,
        opacity: style.opacity,
        fillColor: style.fillColor,
        fillOpacity: style.fillOpacity,
        dashArray: style.dashArray,
        pane: "spawnPane"
      }).addTo(mapObj.layer);
    }
  }
}


function styleForEntry(meta, color){
  const finalColor = drawStyle.useRarity ? color : drawStyle.color;
  const finalOpacity = Number.isFinite(drawStyle.opacity) ? drawStyle.opacity : 0.8;

  const style = {
    color: finalColor,
    weight: meta?.isCave ? 3 : 1,
    opacity: 1,
    fillColor: finalColor,
    fillOpacity: meta?.isCave ? Math.min(finalOpacity * 0.4, 0.8) : finalOpacity
  };

  if (meta?.isUntameable) style.dashArray = "3 3";

  return style;
}


function ensureMapEntriesPanel(){
  let panel = document.getElementById("mapEntriesPanel");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = "mapEntriesPanel";
  panel.className = "floating-panel floating-panel--small";

  panel.innerHTML = `
    <div class="fp-header">
      <div class="fp-title">Spawn Browser</div>
      <div class="fp-actions">
        <button type="button" class="fp-btn fp-btn-chevron" data-action="min" title="Collapse">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M6 9l6 6 6-6"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"/>
          </svg>
        </button>
        <button type="button" class="fp-btn" data-action="hide" title="Hide">✕</button>
      </div>
    </div>
    <div class="fp-body"></div>
  `;

  const actions = panel.querySelector(".fp-actions");

  const exportBtn = createIconButton(`
    <path d="M12 3v10M8 9l4 4 4-4M5 19h14"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"/>
  `);
  exportBtn.dataset.action = "export";
  exportBtn.title = "Export";
  actions.prepend(exportBtn);

  const mapWrap = document.getElementById("mapWrap") || document.body;
  mapWrap.appendChild(panel);

  panel.style.position = "absolute";
  panel.style.right = "2px";
  panel.style.bottom = "90px";
  panel.style.zIndex = "800";
  panel.style.display = "none";
  panel.dataset.hidden = "1";

  const body = panel.querySelector(".fp-body");

  panel.querySelector('[data-action="min"]').onclick = () => {
    const closed = body.style.display === "none";
    body.style.display = closed ? "" : "none";
    panel.classList.toggle("collapsed", !closed);
  };

  panel.querySelector('[data-action="hide"]').onclick = () => {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
    updateDockToggles();
  };

  panel.querySelector('[data-action="export"]').onclick = () => {
    exportSpawnBrowserJSON();
  };

  return panel;
}

function getSpawnBrowserRows() {
  if (spawnBrowserState.tab === "entries") {
    if (spawnBrowserState.scope === "current") return getEntryRowsCurrentMap();
    return getEntryRowsAllMaps();
  }

  if (spawnBrowserState.scope === "current") return getDinoRowsCurrentMap();
  return getDinoRowsAllMaps();
}

function exportSpawnBrowserJSON(){
  const rows = getSpawnBrowserRows();

  const sourceOpt = UI?.sourceSelect?.selectedOptions?.[0];
  const payload = {
    type: "spawn_browser_export",
    tab: spawnBrowserState.tab,
    scope: spawnBrowserState.scope,
    filter: spawnBrowserState.filter,
    search: spawnBrowserState.search || "",
    sourceId: UI?.sourceSelect?.value || "",
    sourceLabel: sourceOpt?.textContent || "",
    mapId: State.mapId || "",
    exportedAt: new Date().toISOString(),
    rowCount: rows.length,
    rows
  };

  const fileBase = [
    "spawn-browser",
    payload.sourceId || "source",
    spawnBrowserState.tab,
    spawnBrowserState.scope
  ].filter(Boolean).join("_");

  downloadJSON(`${fileBase}.json`, payload);
}

function downloadJSON(filename, data){
  const blob = new Blob(
    [JSON.stringify(data, null, 2)],
    { type: "application/json;charset=utf-8" }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


function renderMapEntriesList(){
  const panel = ensureMapEntriesPanel();
  const body = panel.querySelector(".fp-body");
  const list = body.querySelector(".mapEntriesList");
  if (!list) return;

  const rows = getSpawnBrowserRows();

  list.innerHTML = rows.length
    ? rows.map(r => {
        if (r.kind === "dino") {
          return `
            <div class="dd-item" data-dino-jump="${escapeAttr(r.name)}">
              <div class="dd-item-left" style="display:block; min-width:0;">
                <div class="dd-item-name">${escapeHtml(r.name)}</div>
                <div class="dd-item-meta">
                  ${
                    spawnBrowserState.scope === "current" && r.uniqueHere
                      ? `<div class="entry-meta-line">Unique to this map</div>`
                      : `<div class="entry-meta-line">Used on ${r.mapCount} maps</div>`
                  }
                  <div class="entry-meta-line">${escapeHtml((r.mapNames || []).join(", "))}</div>
                </div>
              </div>
            </div>
          `;
        }

        return `
          <div class="dd-item" data-entry-jump="${escapeAttr(r.entryName)}">
            <div class="dd-item-left" style="display:block; min-width:0;">
              <div class="dd-item-name">${escapeHtml(r.entryName)}</div>
              <div class="dd-item-meta">
                ${
                  spawnBrowserState.scope === "current" && r.uniqueHere
                    ? `<div class="entry-meta-line">Unique to this map</div>`
                    : `<div class="entry-meta-line">Used on ${r.mapCount} maps</div>`
                }
                <div class="entry-meta-line">${escapeHtml((r.mapNames || []).join(", "))}</div>
                ${
                  spawnBrowserState.scope === "all" && (r.dinoNames?.length)
                    ? `<div class="entry-meta-line">${escapeHtml(r.dinoNames.slice(0, 6).join(", "))}${r.dinoNames.length > 6 ? "..." : ""}</div>`
                    : ""
                }
              </div>
            </div>
          </div>
        `;
      }).join("")
    : `<div style="color:var(--muted)">No matching results.</div>`;

  list.querySelectorAll("[data-entry-jump]").forEach(row => {
    row.onclick = () => {
      const entryName = row.dataset.entryJump;
      openEntryView(entryName);
    };
  });

  list.querySelectorAll("[data-dino-jump]").forEach(row => {
    row.onclick = () => {
      const name = row.dataset.dinoJump;
      openDinoView(name);
    };
  });
}


function renderMapEntriesPanel(){
  const panel = ensureMapEntriesPanel();
  const body = panel.querySelector(".fp-body");
  if (!body) return;

  const showMapFilter = spawnBrowserState.scope === "current";

  body.innerHTML = `
    ${renderTabs({
      tabs: [
        { id: "entries", label: "Entries" },
        { id: "dinos", label: "Dinos" }
      ],
      activeId: spawnBrowserState.tab,
      dataAttr: "data-spawn-tab"
    })}

    ${renderTabs({
      tabs: [
        { id: "current", label: "Current Map" },
        { id: "all", label: "All Maps" }
      ],
      activeId: spawnBrowserState.scope,
      dataAttr: "data-spawn-scope"
    })}

    ${showMapFilter ? `
      <div class="fp-row" style="gap:6px; flex-wrap:wrap;">
        <button type="button" class="fp-tab ${spawnBrowserState.filter === "all" ? "is-on" : ""}" data-entry-filter="all">All</button>
        <button type="button" class="fp-tab ${spawnBrowserState.filter === "unique" ? "is-on" : ""}" data-entry-filter="unique">Unique</button>
        <button type="button" class="fp-tab ${spawnBrowserState.filter === "shared" ? "is-on" : ""}" data-entry-filter="shared">Shared</button>
      </div>
    ` : ""}

    <input
      id="mapEntriesSearch"
      class="dd-search"
      type="text"
      placeholder="${spawnBrowserState.tab === "entries" ? "Search spawn entries..." : "Search dinos..."}"
      value="${escapeAttr(spawnBrowserState.search)}"
      style="margin-bottom:8px;"
    >

    <div class="dd-list mapEntriesList"></div>
  `;

  wireTabs(body, {
    tabs: [
      { id: "entries", label: "Entries" },
      { id: "dinos", label: "Dinos" }
    ],
    activeId: spawnBrowserState.tab,
    dataAttr: "data-spawn-tab",
    onChange: (id) => {
      spawnBrowserState.tab = id;
      renderMapEntriesPanel();
    }
  });

  wireTabs(body, {
    tabs: [
      { id: "current", label: "Current Map" },
      { id: "all", label: "All Maps" }
    ],
    activeId: spawnBrowserState.scope,
    dataAttr: "data-spawn-scope",
    onChange: (id) => {
      spawnBrowserState.scope = id;
      renderMapEntriesPanel();
    }
  });

  body.querySelectorAll("[data-entry-filter]").forEach(btn => {
    btn.onclick = () => {
      spawnBrowserState.filter = btn.dataset.entryFilter;
      renderMapEntriesList();
    };
  });

  const search = body.querySelector("#mapEntriesSearch");
  if (search){
    search.oninput = () => {
      spawnBrowserState.search = search.value || "";
      renderMapEntriesList();
    };
  }

  renderMapEntriesList();
}




function toggleMapEntriesPanel(){
  const panel = ensureMapEntriesPanel();
  const show = panel.style.display === "none";

  if (show){
    renderMapEntriesPanel();
    panel.style.display = "";
    panel.dataset.hidden = "0";
  } else {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
  }

  updateDockToggles();
}


function clearDraw(){
  mapObj?.layer.clearLayers();
}



let mapObj = null;

const spawnBrowserState = {
  tab: "entries",     // "entries" | "dinos"
  scope: "current",   // "current" | "all"
  filter: "all",      // "all" | "unique" | "shared"
  search: ""
};

function mapNameFromCode(code){
  return Global.spawn?.mapLegend?.[code] || code || "";
}

function dinoLabelFromBp(bp){
  const d = getDinoObjByBp(bp);
  if (!d) return bpClass(bp) || bp || "(Unknown)";
  const labels = labelsForDinoObj(d);
  return labels?.[0] || bpClass(bp) || bp || "(Unknown)";
}

function getEntryRowsAllMaps(){
  const rows = [];

  for (const [entryName, maps] of Object.entries(Global.spawn?.entryMaps || {})){
    const codes = Array.isArray(maps) ? maps : [];
    const mapNames = codes.map(mapNameFromCode);

    const bps = State.entryToDinos.get(entryName) || [];
    const dinoNames = bps.map(dinoLabelFromBp);

    rows.push({
      kind: "entry",
      entryName,
      codes,
      mapNames,
      mapCount: codes.length,
      uniqueHere: false,
      dinoNames
    });
  }

  rows.sort((a, b) => a.entryName.localeCompare(b.entryName));
  return filterSpawnRows(rows);
}

function getDinoRowsAllMaps(){
  const rows = [];
  const byName = new Map();
  const allEntries = Global.spawn?.entries || {};

  const restrictToMod = !activeSourceIsOfficial();
  const allowedModBps = restrictToMod ? modBlueprintSet() : null;

  for (const [entryName, entryData] of Object.entries(allEntries)) {
    const codes = Array.isArray(Global.spawn?.entryMaps?.[entryName])
      ? Global.spawn.entryMaps[entryName]
      : [];

    const rowsInEntry = entryData?.d || [];

    for (const r of rowsInEntry) {
      const rawBp = normalizeBp(r?.[0]);
      if (!rawBp) continue;

      const outs = worldOutputsForBp(rawBp);

      for (const out of outs) {
        const finalBp = normalizeBp(out?.[0]);
        const prob = Number(out?.[1] || 0);
        if (!finalBp || prob <= 0) continue;

        // IMPORTANT: when a mod/group source is active, only include mod dinos
        if (restrictToMod && !allowedModBps.has(finalBp)) continue;

        const d = getDinoObjByBp(finalBp);
        if (!d) continue;

        const labels = labelsForDinoObj(d);
        const name = labels?.[0] || bpClass(finalBp) || finalBp;
        if (!name) continue;

        if (!byName.has(name)) {
          byName.set(name, {
            kind: "dino",
            name,
            bps: new Set(),
            entryNames: new Set(),
            mapNames: new Set(),
            uniqueHere: false
          });
        }

        const rec = byName.get(name);
        rec.bps.add(finalBp);
        rec.entryNames.add(entryName);

        for (const code of codes) {
          const mapName = Global.spawn?.mapLegend?.[code] || code;
          if (mapName) rec.mapNames.add(mapName);
        }
      }
    }
  }

  for (const rec of byName.values()) {
    const mapNames = [...rec.mapNames].sort();

    rows.push({
      kind: "dino",
      name: rec.name,
      bps: [...rec.bps].sort(),
      entryNames: [...rec.entryNames].sort(),
      mapNames,
      mapCount: mapNames.length,
      uniqueHere: false
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return filterSpawnRows(rows);
}


function getDinoRowsCurrentMap() {
  const rows = [];
  const allEntries = Global.spawn?.entries || {};

  for (const name of State.names) {
    const bps = State.nameToBps.get(name) || [];
    const currentMapEntrySet = new Set();
    const globalEntrySet = new Set();
    const mapNameSet = new Set();

    // current-map entries (so we know this dino exists on this map)
    for (const bp of bps) {
      const currentEntries = State.dinoToEntries.get(bp) || [];
      for (const entryName of currentEntries) {
        currentMapEntrySet.add(entryName);
      }
    }

    // now scan ALL entries globally to find all maps this dino appears on
    for (const [entryName, entryData] of Object.entries(allEntries)) {
      const rowsInEntry = entryData?.d || [];
      let foundInThisEntry = false;

      for (const r of rowsInEntry) {
        const rawBp = normalizeBp(r?.[0]);
        if (!rawBp) continue;

        const outs = worldOutputsForBp(rawBp);

        for (const out of outs) {
          const finalBp = normalizeBp(out?.[0]);
          const prob = Number(out?.[1] || 0);
          if (!finalBp || prob <= 0) continue;

          if (bps.includes(finalBp)) {
            foundInThisEntry = true;
            break;
          }
        }

        if (foundInThisEntry) break;
      }

      if (!foundInThisEntry) continue;

      globalEntrySet.add(entryName);

      const codes = Array.isArray(Global.spawn?.entryMaps?.[entryName])
        ? Global.spawn.entryMaps[entryName]
        : [];

      for (const code of codes) {
        const mapName = Global.spawn?.mapLegend?.[code] || code;
        if (mapName) mapNameSet.add(mapName);
      }
    }

    const mapNames = [...mapNameSet].sort();
    const mapCount = mapNames.length;
    const uniqueHere = mapCount <= 1;

    rows.push({
      kind: "dino",
      name,
      bps,
      entryNames: [...globalEntrySet].sort(),
      currentMapEntryNames: [...currentMapEntrySet].sort(),
      mapNames,
      mapCount,
      uniqueHere
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return filterSpawnRows(rows);
}

function filterSpawnRows(rows){
  const q = normSearch(spawnBrowserState.search || "");

  return rows.filter(r => {
    if (spawnBrowserState.scope === "current") {
      if (spawnBrowserState.filter === "unique" && !r.uniqueHere) return false;
      if (spawnBrowserState.filter === "shared" && r.uniqueHere) return false;
    }

    if (!q) return true;

    const hay = normSearch([
      r.entryName,
      r.name,
      ...(r.mapNames || []),
      ...(r.dinoNames || []),
      ...(r.entryNames || [])
    ].filter(Boolean).join(" "));

    return hay.includes(q);
  });
}