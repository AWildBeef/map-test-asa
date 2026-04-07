/* Split from app_embed.js lines 3356-3437 */

/* ============================================================
   RARITY ENGINE
============================================================ */

const RARITY_THRESHOLDS=[
  [0.03,"very common"],
  [0.009,"common"],
  [0.005,"uncommon"],
  [0.0009,"very uncommon"],
  [0.0001,"rare"],
  [-1,"very rare"]
];

function downshiftStepsForMinPct(pct){

  const p = Number(pct || 1);

  if(p >= 0.51) return 0;

  return 1;
}

function rarityFromWeight(w){
  for(const [t,l] of RARITY_THRESHOLDS){
    if(w>=t) return l;
  }
  return "very rare";
}

const MIN_GLOBAL_DOWNSHIFT = [
  [4,6]
];

function downshiftStepsForTotalMin(totalMin){

  const m = Number(totalMin || 0);

  if(m <= 0) return 0;

  for(const [thr,steps] of MIN_GLOBAL_DOWNSHIFT){

    if(m <= thr) return steps;
  }

  return 0;
}

const RARITY_ORDER = [
  "very common",
  "common",
  "uncommon",
  "very uncommon",
  "rare",
  "very rare"
];

function rarityToColor(r){

  r=String(r||"").toLowerCase();

  if(r.includes("very rare")) return "#ff0000";
  if(r.includes("rare")) return "#ff6600";
  if(r.includes("very uncommon")) return "#ffcc00";
  if(r.includes("uncommon")) return "#ffff00";
  if(r.includes("very common")) return "#00ff00";
  if(r.includes("common")) return "#b2ff00";

  return "#888";
}

function downgradeRarity(label,steps){

  if(!steps) return label;

  let i = RARITY_ORDER.indexOf(label);

  if(i < 0) i = RARITY_ORDER.length-1;

  const j = Math.min(RARITY_ORDER.length-1,i+steps);

  return RARITY_ORDER[j];
}


/*=========MAP=============*/

function mapNamesForEntry(entryName){
  const codes = Array.isArray(Global.spawn?.entryMaps?.[entryName])
    ? Global.spawn.entryMaps[entryName]
    : [];

  return codes.map(code => Global.spawn?.mapLegend?.[code] || code);
}


function ensureExportPanel(){
  let panel = document.getElementById("exportPanel");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = "exportPanel";
  panel.className = "floating-panel floating-panel--small";

  panel.innerHTML = `
    <div class="fp-header">
      <div class="fp-title">Export</div>
      <div class="fp-actions"></div>
    </div>
    <div class="fp-body"></div>
  `;

  const actions = panel.querySelector(".fp-actions");

  const hideBtn = createIconButton(CLOSE_ICON);
  hideBtn.dataset.action = "hide";
  hideBtn.title = "Hide";
  actions.appendChild(hideBtn);

  const mapWrap = document.getElementById("mapWrap") || document.body;
  mapWrap.appendChild(panel);

  panel.style.position = "absolute";
  panel.style.right = "2px";
  panel.style.bottom = "90px";
  panel.style.zIndex = "800";
  panel.style.display = "none";
  panel.dataset.hidden = "1";

  panel.querySelector('[data-action="hide"]').onclick = () => {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
    updateDockToggles();
  };

  return panel;
}

function renderExportPanel(){
  const panel = ensureExportPanel();
  const body = panel.querySelector(".fp-body");
  if (!body) return;

  body.innerHTML = `
    <div class="fp-row fp-col">
      <div class="info-subtitle">Report Type</div>
      <div class="fp-row" style="gap:6px; flex-wrap:wrap;">
        <button type="button" class="fp-tab ${exportPanelState.reportType === "dino" ? "is-on" : ""}" data-export-type="dino">Dino</button>
        <button type="button" class="fp-tab ${exportPanelState.reportType === "entry" ? "is-on" : ""}" data-export-type="entry">Entry</button>
        <button type="button" class="fp-tab ${exportPanelState.reportType === "map" ? "is-on" : ""}" data-export-type="map">Map</button>
      </div>
    </div>

    <div class="fp-row fp-col">
      <div class="info-subtitle">Scope</div>
      <div class="fp-row" style="gap:6px; flex-wrap:wrap;">
        <button type="button" class="fp-tab ${exportPanelState.scope === "current_selection" ? "is-on" : ""}" data-export-scope="current_selection">Current Selection</button>
        <button type="button" class="fp-tab ${exportPanelState.scope === "current_map" ? "is-on" : ""}" data-export-scope="current_map">Current Map</button>
        <button type="button" class="fp-tab ${exportPanelState.scope === "current_source" ? "is-on" : ""}" data-export-scope="current_source">Current Source</button>
      </div>
    </div>

    <div class="fp-row fp-col">
      <div class="info-subtitle">Include</div>

      <label class="fp-row">
        <input type="checkbox" data-export-opt="maps" ${exportPanelState.includeMaps ? "checked" : ""}>
        <span>Maps</span>
      </label>

      <label class="fp-row">
        <input type="checkbox" data-export-opt="entries" ${exportPanelState.includeEntries ? "checked" : ""}>
        <span>Entries / linked names</span>
      </label>
      ${
        exportPanelState.reportType === "dino" && exportPanelState.includeEntries
          ? `
            <label class="fp-row">
              <input type="checkbox" data-export-opt="entryMaps" ${exportPanelState.includeEntryMaps ? "checked" : ""}>
              <span>Include Maps per Entry</span>
            </label>
          `
          : ""
      }


      <label class="fp-row">
        <input type="checkbox" data-export-opt="blueprints" ${exportPanelState.includeBlueprints ? "checked" : ""}>
        <span>Blueprints</span>
      </label>
      ${
        exportPanelState.reportType === "dino"
          ? `
            <label class="fp-row">
              <input type="checkbox" data-export-opt="nametag" ${exportPanelState.includeNametag ? "checked" : ""}>
              <span>Nametag</span>
            </label>
          `
          : ""
      }
    </div>

    <div class="fp-row fp-col" style="margin-top:10px;">
      <button type="button" class="fp-tab is-on" data-export-run="json">Download JSON</button>
    </div>
  `;

  body.querySelectorAll("[data-export-type]").forEach(btn => {
    btn.onclick = () => {
      exportPanelState.reportType = btn.dataset.exportType;
      renderExportPanel();
    };
  });

  body.querySelectorAll("[data-export-scope]").forEach(btn => {
    btn.onclick = () => {
      exportPanelState.scope = btn.dataset.exportScope;
      renderExportPanel();
    };
  });

  body.querySelectorAll("[data-export-opt]").forEach(el => {
    el.onchange = () => {
      const key = el.dataset.exportOpt;
      if (key === "maps") exportPanelState.includeMaps = el.checked;
      if (key === "entries") exportPanelState.includeEntries = el.checked;
      if (key === "entryMaps") exportPanelState.includeEntryMaps = el.checked;
      if (key === "blueprints") exportPanelState.includeBlueprints = el.checked;
      if (key === "nametag") exportPanelState.includeNametag = el.checked;
    };
  });

  const runBtn = body.querySelector("[data-export-run='json']");
  if (runBtn){
    runBtn.onclick = () => {
      exportCurrentReportJSON();
    };
  }
}

function toggleExportPanel(){
  const panel = ensureExportPanel();
  const show = panel.style.display === "none";

  if (show){
    renderExportPanel();
    panel.style.display = "";
    panel.dataset.hidden = "0";
  } else {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
  }

  updateDockToggles();
}

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


function ensureSettingsPanel(){
  let panel = document.getElementById("settingsPanel");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = "settingsPanel";
  panel.className = "floating-panel floating-panel--small";

  panel.innerHTML = `
    <div class="fp-header">
      <div class="fp-title">Settings</div>
      <div class="fp-actions"></div>
    </div>
    <div class="fp-body"></div>
  `;

  const actions = panel.querySelector(".fp-actions");

  const hideBtn = createIconButton(CLOSE_ICON);
  hideBtn.dataset.action = "hide";
  hideBtn.title = "Hide";
  actions.appendChild(hideBtn);

  const mapWrap = document.getElementById("mapWrap") || document.body;
  mapWrap.appendChild(panel);

  panel.style.position = "absolute";
  panel.style.right = "2px";
  panel.style.bottom = "90px";
  panel.style.zIndex = "800";
  panel.style.display = "none";
  panel.dataset.hidden = "1";

  panel.querySelector('[data-action="hide"]').onclick = () => {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
    updateDockToggles();
  };

  return panel;
}

function renderSettingsPanel(){
  const panel = ensureSettingsPanel();
  const body = panel.querySelector(".fp-body");
  if (!body) return;

  const currentTheme = getTheme();

  body.innerHTML = `
    <div class="fp-row fp-col">
      <label class="settings-label" for="themeSelect">Theme</label>
      <select id="themeSelect" class="settings-select">
        ${THEME_OPTIONS.map(opt => `
          <option value="${escapeAttr(opt.id)}" ${opt.id === currentTheme ? "selected" : ""}>
            ${escapeHtml(opt.label)}
          </option>
        `).join("")}
      </select>
    </div>
  `;

  const themeSelect = body.querySelector("#themeSelect");
  if (themeSelect){
    themeSelect.onchange = () => {
      updateThemeSetting(themeSelect.value || "");
    };
  }
}

function toggleSettingsPanel(){
  const panel = ensureSettingsPanel();
  const show = panel.style.display === "none";

  if (show){
    renderSettingsPanel();
    panel.style.display = "";
    panel.dataset.hidden = "0";
  } else {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
  }

  updateDockToggles();
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

  if (!window.ASA_RUNTIME?.isDiscordActivity) {
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
  }

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

  const exportEl = panel.querySelector('[data-action="export"]');
  if (exportEl){
    exportEl.onclick = () => {
      exportSpawnBrowserJSON();
    };
  }

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

  const jsonText = JSON.stringify(payload, null, 2);

  if (window.ASA_RUNTIME?.isDiscordActivity) {
    copyText(jsonText).then(() => {
      const panel = document.getElementById("mapEntriesPanel");
      if (panel) showCopiedBubble(panel);
    });
    return;
  }

  const fileBase = [
    "spawn",
    safeFilePart(sourceOpt?.textContent || "source"),
    spawnBrowserState.tab,
    spawnBrowserState.scope,
    spawnBrowserState.scope === "current" ? spawnBrowserState.filter : null
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
      <div class="fp-row">
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

      body.querySelectorAll("[data-entry-filter]").forEach(b => {
        const isOn = b.dataset.entryFilter === spawnBrowserState.filter;
        b.classList.toggle("is-on", isOn);
        b.setAttribute("aria-pressed", isOn ? "true" : "false");
      });

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
    const dinoNames = dinoNamesForEntryGlobal(entryName);

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

function renderToggleAllRow({
  label = "Toggle All",
  checked = true,
  dataAttr = "data-toggle-all",
  value = "1"
} = {}){
  return `
    <div class="col-exp-row">
      <label class="entry-main" style="display:flex; align-items:flex-start; gap:10px; min-width:0;">
        <input
          type="checkbox"
          ${dataAttr}="${escapeAttr(value)}"
          ${checked ? "checked" : ""}
          style="margin-top:4px;"
        >
        <div style="min-width:0; flex:1;">
          <div class="entry-name">${escapeHtml(label)}</div>
        </div>
      </label>
    </div>
  `;
}


function wireToggleAll(container, {
  masterSelector,
  itemSelector,
  getItemKey,
  onAfterChange
}){
  const master = container.querySelector(masterSelector);
  if (!master) return;

  master.onchange = () => {
    const checked = master.checked;

    container.querySelectorAll(itemSelector).forEach(el => {
      const key = getItemKey(el);
      if (!key) return;

      el.checked = checked;
      entryVisibility[key] = checked;
    });

    onAfterChange?.();
  };
}

function isPanelVisible(id){
  const el = document.getElementById(id);
  if (!el) return false;
  return el.style.display !== "none";
}


function setPanelVisible(id, show){
  const el = document.getElementById(id);
  if (!el) return;

  el.style.display = show ? "" : "none";
  el.dataset.hidden = show ? "0" : "1";
}


function togglePanel(id){
  setPanelVisible(id, !isPanelVisible(id));
  updateDockToggles();
}


function installPanelTitleFitter(panelEl, opts = {}) {
  const titleEl = panelEl?.querySelector(".fp-title");
  const titleWrap = titleEl?.parentElement;

  if (!panelEl || !titleEl) return;

  requestAnimationFrame(() => fitTitleToSpace(titleEl, opts));

  if (panelEl._titleFitCleanup) {
    panelEl._titleFitCleanup();
    panelEl._titleFitCleanup = null;
  }

  const ro = new ResizeObserver(() => fitTitleToSpace(titleEl, opts));
  ro.observe(titleWrap || panelEl);

  const mo = new MutationObserver(() => fitTitleToSpace(titleEl, opts));
  mo.observe(titleEl, { childList: true, characterData: true, subtree: true });

  panelEl._titleFitCleanup = () => {
    ro.disconnect();
    mo.disconnect();
  };
}


function ensureInfoPanel(){
  let panel = document.getElementById("dinoInfoPanel");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = "dinoInfoPanel";
  panel.className = "floating-panel";

  panel.innerHTML = `
    <div class="fp-header">
      <div class="fp-title">Info</div>
      <div class="fp-actions"></div>
    </div>
    <div class="fp-body"></div>
  `;
  
  const actions = panel.querySelector(".fp-actions");

  const minBtn = createIconButton(CHEVRON_DOWN_ICON);
  minBtn.dataset.action = "min";
  minBtn.title = "Collapse";
  minBtn.classList.add("fp-btn-chevron");

  const hideBtn = createIconButton(CLOSE_ICON);
  hideBtn.dataset.action = "hide";
  hideBtn.title = "Hide";

  actions.appendChild(minBtn);
  actions.appendChild(hideBtn);

  const mapWrap = document.getElementById("mapWrap") || document.body;
  mapWrap.appendChild(panel);

  installPanelTitleFitter(panel, {
    minPx: 11,
    maxPx: 20
  });
  
  panel.style.display = "";
  panel.dataset.hidden = "0";

  const body = panel.querySelector(".fp-body");

  // start collapsed
  body.style.display = "none";
  panel.classList.add("collapsed");

  panel.querySelector('[data-action="min"]').onclick = () => {
    const closed = body.style.display === "none";
    body.style.display = closed ? "" : "none";
    panel.classList.toggle("collapsed", !closed);

    if (closed) {
      refreshInfoPanelPageHeight();
    }
  };

  panel.querySelector('[data-action="hide"]').onclick = () => {
    panel.style.display = "none";
  };

  panel.style.position = "absolute";
  panel.style.left = "2px";
  panel.style.top = "2px";
  panel.style.zIndex = "800";

  return panel;
}


function setInfoPanelTitle(text){
  const panel = ensureInfoPanel();
  const t = panel.querySelector(".fp-title");
  if (t) t.textContent = text || "Info";
}


function setInfoPanelHTML(html){
  const panel = ensureInfoPanel();
  const body = panel.querySelector(".fp-body");
  if (!body) return;
  body.innerHTML = html || `<div style="color:var(--muted)">No data.</div>`;
  panel.style.display = "";
  syncInfoPanelState();
}


function renderInfoPanelBodyEmpty(){
  setInfoPanelTitle("Info");
  setInfoPanelHTML(`<div style="color:var(--muted)">Select something to see details.</div>`);
}


function renderTabs({ tabs, activeId, dataAttr }){
  return `
    <div class="fp-tabs">
      ${tabs.map(t => `
        <button type="button"
                class="fp-tab ${activeId === t.id ? "is-on" : ""}"
                ${dataAttr}="${escapeAttr(t.id)}">
          ${escapeHtml(t.label)}
        </button>
      `).join("")}
    </div>
  `;
}


function wireTabs(container, { tabs, activeId, dataAttr, onChange }){
  container.querySelectorAll(`[${dataAttr}]`).forEach(btn => {
    btn.onclick = () => {
      const id = btn.getAttribute(dataAttr);
      if (!tabs.some(t => t.id === id)) return;
      onChange(id);
    };
  });
}


function mountPanelSwipe(container, tabs, getActive, setActive){
  if (!container) return;

  const order = tabs.map(t => t.id);

  let sx = 0;
  let sy = 0;
  let tracking = false;
  let decided = false;
  let isHorizontal = false;

  const EDGE_GUARD_PX = 22;
  const SWIPE_MIN_PX = 40;
  const SWIPE_MAX_Y = 60;

  container.addEventListener("touchstart", (e) => {
    if (!e.touches || e.touches.length !== 1) return;

    const t = e.touches[0];
    if (t.clientX <= EDGE_GUARD_PX){
      tracking = false;
      return;
    }

    tracking = true;
    decided = false;
    isHorizontal = false;
    sx = t.clientX;
    sy = t.clientY;
  }, { passive: true });

  container.addEventListener("touchmove", (e) => {
    if (!tracking || !e.touches || e.touches.length !== 1) return;

    const t = e.touches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;

    if (!decided){
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10){
        decided = true;
        isHorizontal = Math.abs(dx) > Math.abs(dy);
      }
    }

    if (decided && isHorizontal){
      e.preventDefault();
    }
  }, { passive: false });

  container.addEventListener("touchend", (e) => {
    if (!tracking) return;
    tracking = false;

    const t = e.changedTouches?.[0];
    if (!t) return;

    const dx = t.clientX - sx;
    const dy = t.clientY - sy;

    if (Math.abs(dy) > SWIPE_MAX_Y) return;
    if (Math.abs(dx) < SWIPE_MIN_PX) return;

    const active = getActive();
    const i = Math.max(0, order.indexOf(active));

    const nextIndex = (dx < 0)
      ? Math.min(order.length - 1, i + 1)
      : Math.max(0, i - 1);

    if (nextIndex !== i){
      setActive(order[nextIndex]);
    }
  }, { passive: true });
}


function renderInfoPanel() {
  console.log("MODE:", State.mode);
  console.log("SELECTION:", State.selection);
  syncInfoPanelState();
  if (!State.selection) {
    renderInfoPanelBodyEmpty();
    return;
  }
  
  if (State.mode === "dino") {
    renderDinoPanel(State.selection);
    
  } else if (State.mode === "entry") {
    renderEntryPanel(State.selection);
    
  } else if (State.mode === "crate") {
    renderCratePanel(State.selection);
    
  } else if (State.mode === "item") {
    renderItemPanel(State.selection);
  }
}

function ensureDrawStylePanel(){
  let panel = document.getElementById("drawStylePanel");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = "drawStylePanel";
  panel.className = "floating-panel floating-panel--small";

  panel.innerHTML = `
    <div class="fp-header">
      <div class="fp-title">Draw Style</div>
      <div class="fp-actions"></div>
    </div>
    <div class="fp-body"></div>
  `;

  const actions = panel.querySelector(".fp-actions");

  const hideBtn = createIconButton(CLOSE_ICON);
  hideBtn.dataset.action = "hide";
  hideBtn.title = "Hide";
  actions.appendChild(hideBtn);

  const mapWrap = document.getElementById("mapWrap") || document.body;
  mapWrap.appendChild(panel);

  panel.style.position = "absolute";
  panel.style.right = "2px";
  panel.style.bottom = "90px";
  panel.style.zIndex = "800";
  panel.style.display = "none";
  panel.dataset.hidden = "1";

  panel.querySelector('[data-action="hide"]').onclick = () => {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
    updateDockToggles();
  };

  return panel;
}


function renderDrawStylePanel(){
  const panel = ensureDrawStylePanel();
  const body = panel.querySelector(".fp-body");
  if (!body) return;

  body.innerHTML = `
    <label class="fp-row">
      <input id="drawUseRarity" type="checkbox" ${drawStyle.useRarity ? "checked" : ""}>
      <span>Use rarity colors</span>
    </label>

    <label class="fp-row">
      <span>Color</span>
      <input id="drawColor" type="color" value="${drawStyle.color}">
    </label>

    <label class="fp-row fp-col">
      <div class="fp-row fp-between">
        <span>Opacity</span>
        <span id="drawOpacityLabel">${drawStyle.opacity.toFixed(2)}</span>
      </div>
      <input
        id="drawOpacity"
        type="range"
        min="0.05"
        max="1"
        step="0.05"
        value="${drawStyle.opacity}"
      >
    </label>
  `;

  const rarity = body.querySelector("#drawUseRarity");
  const color = body.querySelector("#drawColor");
  const opacity = body.querySelector("#drawOpacity");
  const opacityLabel = body.querySelector("#drawOpacityLabel");

  if (rarity){
    rarity.onchange = () => {
      drawStyle.useRarity = rarity.checked;
      renderDrawStylePanel();
      render();
    };
  }

  if (color){
    color.disabled = drawStyle.useRarity;
    color.style.opacity = drawStyle.useRarity ? "0.5" : "1";

    color.oninput = () => {
      drawStyle.color = color.value;
      render();
    };
  }

  if (opacity){
    opacity.oninput = () => {
      drawStyle.opacity = Number(opacity.value);
      if (opacityLabel) opacityLabel.textContent = drawStyle.opacity.toFixed(2);
      render();
    };
  }
}


function toggleDrawStylePanel(){
  const panel = ensureDrawStylePanel();
  const show = panel.style.display === "none";

  if (show){
    renderDrawStylePanel();
    panel.style.display = "";
    panel.dataset.hidden = "0";
  } else {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
  }

  updateDockToggles();
}


function ensurePoiPanel(){
  let panel = document.getElementById("poiPanel");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = "poiPanel";
  panel.className = "floating-panel floating-panel--small";

  panel.innerHTML = `
    <div class="fp-header">
      <div class="fp-title">Markers</div>
      <div class="fp-actions"></div>
    </div>
    <div class="fp-body"></div>
  `;
  
  const actions = panel.querySelector(".fp-actions");

  const hideBtn = createIconButton(CLOSE_ICON);
  hideBtn.dataset.action = "hide";
  hideBtn.title = "Hide";

  actions.appendChild(hideBtn);

  const mapWrap = document.getElementById("mapWrap") || document.body;
  mapWrap.appendChild(panel);

  panel.style.position = "absolute";
  panel.style.left = "2px";
  panel.style.bottom = "90px";
  panel.style.zIndex = "800";
  panel.style.display = "none";
  panel.dataset.hidden = "1";

  panel.querySelector('[data-action="hide"]').onclick = () => {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
    updateDockToggles();
  };

  return panel;
}


function buildResolvedSupplyLegend(geom){
  const legend = Array.isArray(geom?.supplyLegend) ? geom.supplyLegend : [];
  const out = [];

  for (const row of legend){
    const bp = row?.bp || "";
    const n = row?.n || "";
    const cls = crateClassFromBp(bp);

    const crateId = Global.crateClassToId.has(cls)
      ? Global.crateClassToId.get(cls)
      : null;

    const crateData = Number.isInteger(crateId)
      ? Global.loot?.c?.[crateId] || null
      : null;

    const isArtifact = cls.toLowerCase().includes("artifactcrate");
    const isSupply = cls.toLowerCase().includes("supplycrate");

    out.push({
      bp,
      n,
      cls,
      crateId,
      crateData,
      isArtifact,
      isSupply
    });
  }

  return out;
}

function resolvedSupplyLegendForCurrentMap(){
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  if (!mapMeta) return [];
  return Global.resolvedSupplyLegend.get(mapMeta.geomShort) || [];
}

function resolvedCratesForPoi(poi){
  const legend = resolvedSupplyLegendForCurrentMap();
  const rows = Array.isArray(poi?.c) ? poi.c : [];
  const out = [];

  for (const row of rows){
    if (!Array.isArray(row) || !row.length) continue;

    const legendIdx = Number(row[0]);
    const weight = row[1];

    if (!Number.isInteger(legendIdx) || legendIdx < 0 || legendIdx >= legend.length){
      continue;
    }

    const meta = legend[legendIdx];
    if (!meta) continue;

    out.push({
      legendIdx,
      weight,
      crateId: meta.crateId,
      cls: meta.cls,
      bp: meta.bp,
      n: meta.n,
      isArtifact: !!meta.isArtifact,
      isSupply: !!meta.isSupply
    });
  }

  return out;
}

function poiHasArtifactCrate(poi){
  return resolvedCratesForPoi(poi).some(r => r.isArtifact);
}

function poiHasSupplyCrate(poi){
  return resolvedCratesForPoi(poi).some(r => r.isSupply);
}

function countArtifactPois(points){
  return (Array.isArray(points) ? points : []).filter(p => poiHasArtifactCrate(p) && !poiHasSupplyCrate(p)).length;
}

function countSupplyPois(points){
  return (Array.isArray(points) ? points : []).filter(p => poiHasSupplyCrate(p)).length;
}


function renderPoiPanel(){
  const panel = ensurePoiPanel();
  const body = panel.querySelector(".fp-body");
  if (!body) return;

  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);
  const pois = geom?.pois || {};
  console.log("raw supply crate points:", (pois.supplyCrates || []).length);
  console.log("resolved legend current map:", resolvedSupplyLegendForCurrentMap());
  console.log("supply count:", countSupplyPois(pois.supplyCrates || []));
  console.log("artifact count:", countArtifactPois(pois.supplyCrates || []));

  const rows = [
    { key: "tributeTerminals", label: "Tribute Terminals", count: (pois.tributeTerminals || []).length },
    { key: "supplyCrates", label: "Supply Drops", count: countSupplyPois(pois.supplyCrates || []) },
    { key: "artifactCrates", label: "Artifacts", count: countArtifactPois(pois.supplyCrates || []) },
    { key: "playerStarts", label: "Player Start Points", count: poiCount(pois.playerStarts) },
    { key: "explorerNotes", label: "Explorer Notes", count: (pois.explorerNotes || []).length },
    { key: "missions", label: "Missions", count: (pois.missions || []).length },
    { key: "hordeEvents", label: "Horde Events", count: (pois.hordeEvents || []).length },
    { key: "cityTerminals", label: "City Terminals", count: (pois.cityTerminals || []).length },
    { key: "beacons", label: "Border Beacons", count: (pois.beacons || []).length }
  ].filter(r => r.count > 0);

  body.innerHTML = rows.length ? `
    <div class="poi-menu">
      ${rows.map(r => `
        <button
          type="button"
          class="poi-menu-item ${poiVisibility[r.key] ? "is-on" : ""}"
          data-poi-toggle="${escapeAttr(r.key)}"
          aria-pressed="${poiVisibility[r.key] ? "true" : "false"}"
        >
          <span class="poi-menu-label">${escapeHtml(r.label)} (${r.count})</span>
          <span class="poi-menu-check">${poiVisibility[r.key] ? "✓" : ""}</span>
        </button>
      `).join("")}
    </div>
  ` : `
    <div style="color:var(--muted)">No markers on this map.</div>
  `;

  body.querySelectorAll("[data-poi-toggle]").forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.poiToggle;
      if (!key) return;

      poiVisibility[key] = !poiVisibility[key];

      btn.classList.toggle("is-on", poiVisibility[key]);
      btn.setAttribute("aria-pressed", poiVisibility[key] ? "true" : "false");

      const check = btn.querySelector(".poi-menu-check");
      if (check) check.textContent = poiVisibility[key] ? "✓" : "";

      drawPois();
    };
  });
}

function togglePoiPanel(){
  const panel = ensurePoiPanel();

  const show = panel.style.display === "none";

  if (show){
    renderPoiPanel();
    panel.style.display = "";
    panel.dataset.hidden = "0";
  } else {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
  }

  updateDockToggles();
}


async function copyText(text){
  try{
    await navigator.clipboard.writeText(text);
  }catch{
    const ta = document.createElement("textarea");
    ta.value = String(text || "");
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}


function installCopyDelegation(){
  document.addEventListener("click", async (e) => {
    const el = e.target.closest(".copy-on-click");
    if (!el) return;

    const text = el.dataset.copy ?? el.textContent ?? "";
    await copyText(String(text).trim());
    showCopiedBubble(el);
  });
}


function showCopiedBubble(target){
  const bubble = document.createElement("div");
  bubble.className = "copy-bubble";
  bubble.textContent = "Copied!";

  document.body.appendChild(bubble);

  const r = target.getBoundingClientRect();
  bubble.style.left = `${r.right + 6}px`;
  bubble.style.top = `${r.top + r.height / 2 - 10}px`;

  requestAnimationFrame(() => {
    bubble.classList.add("show");
  });

  setTimeout(() => {
    bubble.classList.remove("show");
    setTimeout(() => bubble.remove(), 200);
  }, 900);
}


function createIconButton(svgPath, viewBox = "0 0 24 24"){
  const btn = document.createElement("button");
  btn.className = "fp-btn";
  btn.type = "button";

  btn.innerHTML = `
    <svg viewBox="${viewBox}" width="16" height="16" aria-hidden="true">
      ${svgPath}
    </svg>
  `;

  return btn;
}


function syncActivePageHeight(pagesEl, activeId, opts = {}) {
  if (!pagesEl || !activeId) return;

  const {
    maxHeight = Math.floor(window.innerHeight * 0.42)
  } = opts;

  const activePage = pagesEl.querySelector(`.fp-page[data-page="${CSS.escape(activeId)}"]`);
  if (!activePage) return;

  // clear old scrolling first
  pagesEl.querySelectorAll(".fp-page").forEach(p => {
    p.style.overflowY = "";
    p.style.maxHeight = "";
  });

  // temporarily let wrapper size naturally so measurement is real
  pagesEl.style.height = "auto";

  const naturalHeight = activePage.scrollHeight;
  const finalHeight = Number.isFinite(maxHeight)
    ? Math.min(naturalHeight, maxHeight)
    : naturalHeight;

  pagesEl.style.height = `${finalHeight}px`;

  if (naturalHeight > finalHeight) {
    activePage.style.overflowY = "auto";
    activePage.style.maxHeight = `${finalHeight}px`;
    activePage.style.webkitOverflowScrolling = "touch";
  }
}


function refreshInfoPanelPageHeight() {
  const panel = document.getElementById("dinoInfoPanel");
  if (!panel || panel.classList.contains("collapsed")) return;

  const body = panel.querySelector(".fp-body");
  const pagesEl = body?.querySelector(".fp-pages");
  if (!pagesEl) return;

  let activeId = "";
  if (State.mode === "dino") activeId = infoPanelState.dinoTab;
  else if (State.mode === "entry") activeId = infoPanelState.entryTab;
  else if (State.mode === "crate") activeId = infoPanelState.crateTab;
  else if (State.mode === "item") activeId = infoPanelState.itemTab;

  requestAnimationFrame(() => {
    syncActivePageHeight(pagesEl, activeId);
  });
}


function fmt(v){
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  let s = n.toFixed(6);
  s = s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  if (s === "-0") s = "0";
  return s;
}


function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[c]));
}

function escapeAttr(s){
  return escapeHtml(s).replace(/"/g, "&quot;");
}


function renderCopyField(label, value){
  const v = String(value || "");
  return `
    <div class="info-subtitle">${escapeHtml(label)}</div>
    <div class="info-mono copy-on-click" data-copy="${escapeAttr(v)}">
      ${escapeHtml(v || "(none)")}
    </div>
  `;
}


function renderSection(title, innerHtml){
  return `
    <div class="info-section">
      <div class="info-subtitle">${escapeHtml(title)}</div>
      ${innerHtml || ""}
    </div>
  `;
}


function renderPages({ tabs, activeId, renderPage, pageClass = "" }){
  const idx = Math.max(0, tabs.findIndex(t => t.id === activeId));
  return `
    <div class="fp-pages ${pageClass}">
      <div class="fp-track" style="transform:translateX(${-idx * 100}%);">
        ${tabs.map(t => `
          <div class="fp-page" data-page="${escapeAttr(t.id)}">
            ${renderPage(t.id)}
          </div>
        `).join("")}
      </div>
    </div>
  `;
}


function isTrue01(v){
  return v === 1 || v === "1" || v === true;
}


function fmtNum(v, decimals = 0){
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return decimals > 0 ? n.toFixed(decimals) : String(Math.round(n));
}

let infoPanelState = {
  dinoTab: "spawns",
  entryTab: "dinos",
  crateTab: "sets",
  itemTab: "crates"
};


const CLOSE_ICON = `
  <path d="M6 6L18 18M18 6L6 18"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"/>
`;




const CHEVRON_DOWN_ICON = `
  <path d="M6 9l6 6 6-6"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"/>
`;

/*==========~POI=========*/



function makeArtifactIcon() {
  const size = 18;

  return L.divIcon({
    className: "poi-artifact-icon",
    html: `
      <svg width="${size}" height="${size}" viewBox="-10 -10 20 20" aria-hidden="true">
        <path
          d="M 0 -7 L 7 6 L -7 6 Z"
          fill="#ffd54a"
          stroke="#111"
          stroke-width="1.8"
          stroke-linejoin="round"
        />
      </svg>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

function artifactTooltipHtml(p, legend){
  return supplyCrateTooltipHtml(p, legend);
}

function addArtifactMarkers(points, { layer = mapObj.poiLayer } = {}) {
  if (!layer || !Array.isArray(points)) return;

  const legend = supplyLegendForCurrentMap();
  const icon = makeArtifactIcon();

  for (const p of points) {
    const x = Number(p?.x);
    const y = Number(p?.y);
    if (![x, y].every(Number.isFinite)) continue;

    L.marker([y, x], {
      icon,
      pane: "poiPane"
    })
      .addTo(layer)
      .bindTooltip(artifactTooltipHtml(p, legend), {
        direction: "auto",
        sticky: true,
        offset: [0, -12],
        opacity: 0.97,
        className: "supply-tooltip",
        autoPan: true
      });
  }
}

function drawArtifactCratePois(points){
  if (!mapObj?.poiLayer || !Array.isArray(points)) return;
  if (!poiVisibility.artifactCrates) return;

  const artifactRows = points.filter(p => poiHasArtifactCrate(p) && !poiHasSupplyCrate(p));
  addArtifactMarkers(artifactRows, { layer: mapObj.poiLayer });
}

function supplyCrateColor(crateClass, name = ""){
  const s = `${crateClass || ""} ${name || ""}`.toLowerCase();

  if (s.includes("white")) return "#f5f5f5";
  if (s.includes("green")) return "#5cff6b";
  if (s.includes("blue")) return "#4da3ff";
  if (s.includes("purple")) return "#c77dff";
  if (s.includes("yellow")) return "#ffd54a";
  if (s.includes("red")) return "#ff4d4d";
  if (s.includes("lime")) return "#bfff00";

  if (s.includes("artifact")) return "#ffffff";

  return "#ff4d4d";
}


function supplyCrateSlicesForPoint(point, legend){
  const rows = Array.isArray(point?.c) ? point.c : [];
  const byColor = new Map();

  for (const row of rows){
    if (!Array.isArray(row) || row.length < 1) continue;

    const idx = Number(row[0]);
    const weight = Number(row[1]);

    if (!Number.isInteger(idx) || idx < 0 || idx >= legend.length) continue;

    const meta = legend[idx];
    if (!meta) continue;

    const bp = meta.bp || "";
    const crateClass = crateClassFromLegendRow(meta);
    const name =
      crateDisplayNameByClass(crateClass) ||
      meta.n ||
      shortBpName(bp) ||
      "Supply Crate";

    const color = supplyCrateColor(crateClass, name);
    const safeWeight = Number.isFinite(weight) && weight > 0 ? weight : 1;

    if (!byColor.has(color)) {
      byColor.set(color, {
        color,
        weight: safeWeight,
        crateClasses: new Set([crateClass]),
        names: new Set([name])
      });
    } else {
      const existing = byColor.get(color);
      existing.weight += safeWeight;
      existing.crateClasses.add(crateClass);
      existing.names.add(name);
    }
  }

  return [...byColor.values()].map(s => ({
    color: s.color,
    weight: s.weight,
    crateClass: [...s.crateClasses][0] || "",
    name: [...s.names][0] || ""
  }));
}


function polarToCartesian(cx, cy, r, angleDeg){
  const rad = (angleDeg - 90) * Math.PI / 180;
  return {
    x: cx + (r * Math.cos(rad)),
    y: cy + (r * Math.sin(rad))
  };
}


function describePieSlice(cx, cy, r, startAngle, endAngle){
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = (endAngle - startAngle) <= 180 ? "0" : "1";

  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    "Z"
  ].join(" ");
}


function makeSupplyPieIcon(slices, opts = {}){
  const size = opts.size || 18;
  const radius = opts.radius || 8;
  const stroke = opts.stroke || "#111";
  const strokeWidth = opts.strokeWidth || 2;
  const minFrac = opts.minFrac || 0.08; // 8% minimum visible slice

  const rawWeights = slices.map(s => Math.max(0, Number(s.weight) || 0));
  const rawTotal = rawWeights.reduce((a, b) => a + b, 0) || 1;

  let fracs = rawWeights.map(w => w / rawTotal);

  // enforce a minimum visible slice size
  const boosted = fracs.map(f => Math.max(f, minFrac));
  const boostedTotal = boosted.reduce((a, b) => a + b, 0) || 1;
  fracs = boosted.map(f => f / boostedTotal);

  let startAngle = 0;
  const cx = size / 2;
  const cy = size / 2;

  const paths = slices.map((slice, i) => {
    const endAngle = startAngle + fracs[i] * 360;
    const d = describePieSlice(cx, cy, radius, startAngle, endAngle);
    startAngle = endAngle;
    return `<path d="${d}" fill="${slice.color}" />`;
  }).join("");

  return L.divIcon({
    className: "poi-icon poi-supply-pie",
    html: `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        ${paths}
        <circle
          cx="${cx}"
          cy="${cy}"
          r="${radius}"
          fill="none"
          stroke="${stroke}"
          stroke-width="${strokeWidth}"
        />
      </svg>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

function makeSupplySolidIcon(color, opts = {}){
  const size = opts.size || 18;
  const radius = opts.radius || 8;

  return L.divIcon({
    className: "poi-icon poi-supply-solid",
    html: `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle
          cx="${size / 2}"
          cy="${size / 2}"
          r="${radius}"
          fill="${color}"
          stroke="#111"
          stroke-width="2"
        />
      </svg>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}


function addSupplyCrateMarkers(points, { layer = mapObj.poiLayer } = {}) {
  if (!layer || !Array.isArray(points)) return;

  const legend = supplyLegendForCurrentMap();

  for (const p of points) {
    const x = Number(p?.x);
    const y = Number(p?.y);
    if (![x, y].every(Number.isFinite)) continue;

    const slices = supplyCrateSlicesForPoint(p, legend);

    let icon;
    if (slices.length <= 1) {
      icon = makeSupplySolidIcon(slices[0]?.color || "#ffd54a");
    } else {
      icon = makeSupplyPieIcon(slices);
    }

    L.marker([y, x], {
      icon,
      pane: "poiPane"
    })
      .addTo(layer)
      .bindTooltip(supplyCrateTooltipHtml(p, legend), {
        direction: "auto",
        sticky: true,
        offset: [0, -14],
        opacity: 0.97,
        className: "supply-tooltip",
        autoPan: true
      });
  }
}

function hordeTooltipHtml(point, legend){
  const groups = buildHordeGroups(point, legend);

  const pointType = hordeTypeLabel(point?.t);
  const pointDiff = point?.d != null ? hordeDifficultyLabel(point.d) : "";

  if (!groups.length){
    return `
      <div class="poi-tip-block">
        <div class="poi-tip-title">${escapeHtml(pointType)}</div>
        ${pointDiff ? `<div class="poi-tip-line">${escapeHtml(`Max: ${pointDiff}`)}</div>` : ""}
      </div>
    `;
  }

  return `
    <div class="poi-tip-block">
      <div class="poi-tip-title">${escapeHtml(pointType)}</div>
      ${pointDiff ? `<div class="poi-tip-line">${escapeHtml(`Max Difficulty: ${pointDiff}`)}</div>` : ""}
      <div class="poi-tip-lines">
        ${groups.map(g => `
          <div class="poi-tip-line">${escapeHtml(`${g.name} • ${g.difficulty}`)}</div>
        `).join("")}
      </div>
    </div>
  `;
}


function hordeMarkerColor(point){
  const t = String(point?.t || "");

  if (t.includes("NewEnumerator1")) return "#7dff7a"; // nodes
  if (t.includes("NewEnumerator2")) return "#ff66cc"; // both
  return "#ffd54a"; // osd
}

function addHordeMarkers(points, { layer = mapObj?.poiLayer } = {}) {
  if (!layer || !Array.isArray(points)) return;

  const legend = hordeLegendForCurrentMap();

  for (const p of points){
    const x = Number(p?.x);
    const y = Number(p?.y);
    if (![x, y].every(Number.isFinite)) continue;

    const fillColor = hordeMarkerColor(p);

    L.circleMarker([y, x], {
      radius: 6,
      color: "#111",
      weight: 2.2,
      fillColor,
      fillOpacity: 0.95,
      pane: "poiPane",
      className: "poi-horde"
    })
      .addTo(layer)
      .bindTooltip(hordeTooltipHtml(p, legend), {
        direction: "auto",
        sticky: true,
        opacity: 0.97,
        className: "horde-tooltip",
        autoPan: true
      });
  }
}

function drawHordePois(points){
  if (!mapObj?.poiLayer || !Array.isArray(points)) return;
  if (!poiVisibility.hordeEvents) return;

  addHordeMarkers(points, { layer: mapObj.poiLayer });
}


function supplyCrateTooltipHtml(p, legend){
  const crateRows = Array.isArray(p?.c) ? p.c : [];
  const sourceIds = Array.isArray(p?.s) ? p.s : [];

  const crateLines = crateRows.length
    ? crateRows.map(row => {
        if (!Array.isArray(row) || row.length < 1) return "";

        const idx = Number(row[0]);
        const weight = row[1];

        const meta = Number.isInteger(idx) && idx >= 0 && idx < legend.length
          ? legend[idx]
          : null;

        const bp = meta?.bp || "";
        const crateClass = meta ? crateClassFromLegendRow(meta) : "";
        const name =
          crateDisplayNameByClass(crateClass) ||
          meta?.n ||
          shortBpName(bp) ||
          "Supply Crate";

        const w = Number(weight);
        const suffix = Number.isFinite(w) ? ` (${fmt(w)})` : "";

        return `<div class="poi-tip-line">${escapeHtml(name + suffix)}</div>`;
      }).filter(Boolean).join("")
    : `<div class="poi-tip-line">No crates listed</div>`;

  const sourceBlock = sourceIds.length
    ? `
      <div class="poi-tip-subtitle">Sources</div>
      ${sourceIds.map(rawIdx => {
        const idx = Number(rawIdx);
        const meta = Number.isInteger(idx) && idx >= 0 && idx < legend.length
          ? legend[idx]
          : null;

        const crateClass = meta ? crateClassFromLegendRow(meta) : "";
        const name =
          crateDisplayNameByClass(crateClass) ||
          meta?.n ||
          meta?.bp ||
          `Source ${idx}`;

        return `<div class="poi-tip-line poi-tip-bp">${escapeHtml(name)}</div>`;
      }).join("")}
    `
    : "";

  return `
    <div class="poi-tip-block">
      <div class="poi-tip-title">Supply Drops</div>
      ${crateLines}
      ${sourceBlock}
    </div>
  `;
}


function drawSupplyCratePois(points) {
  if (!mapObj?.poiLayer || !Array.isArray(points)) return;
  if (!poiVisibility.supplyCrates) return;

  const supplyRows = points.filter(p => poiHasSupplyCrate(p));
  addSupplyCrateMarkers(supplyRows, { layer: mapObj.poiLayer });
}


function missionTooltipHtml(point, legend){
  const groups = buildMissionGroups(point, legend);

  if (!groups.length){
    return `<div class="poi-tip-title">Mission</div>`;
  }

  return groups.map(g => `
    <div class="poi-tip-block">
      <div class="poi-tip-title">${escapeHtml(g.name)}</div>
      <div class="poi-tip-lines">
        ${g.variants.map(v => `
          <div class="poi-tip-line">${escapeHtml(missionVariantLine(v, v.w))}</div>
        `).join("")}
      </div>
    </div>
  `).join("");
}


function missionMarkerColor(point, legend){
  const groups = buildMissionGroups(point, legend);
  const first = groups[0]?.variants?.[0];

  const kind = String(first?.k || "").toLowerCase();

  if (kind.includes("attack")) return "#ff8a3d";
  if (kind.includes("defense")) return "#4db6ff";
  if (kind.includes("resource")) return "#7dff7a";

  return "#ff66cc";
}

function addMissionMarkers(points, { layer = mapObj?.poiLayer } = {}) {
  if (!layer || !Array.isArray(points)) return;

  const legend = missionLegendForCurrentMap();

  for (const p of points){
    const x = Number(p?.x);
    const y = Number(p?.y);
    if (![x, y].every(Number.isFinite)) continue;

    const fillColor = missionMarkerColor(p, legend);

    L.circleMarker([y, x], {
      radius: 6,
      color: "#111",
      weight: 2.2,
      fillColor,
      fillOpacity: 0.95,
      pane: "poiPane",
      className: "poi-mission"
    })
      .addTo(layer)
      .bindTooltip(missionTooltipHtml(p, legend), {
        direction: "auto",
        sticky: true,
        opacity: 0.97,
        className: "mission-tooltip",
        autoPan: true
      });
  }
}

function drawMissionPois(points){
  if (!mapObj?.poiLayer || !Array.isArray(points)) return;
  if (!poiVisibility.missions) return;

  addMissionMarkers(points, { layer: mapObj.poiLayer });
}


function poiCount(v){
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === "object") return Object.keys(v).length;
  return 0;
}


function poiRadius(type){
  const t = String(type || "").toLowerCase();

  if (t.includes("cityterminal")) return 4;
  if (t.includes("beacon")) return 3;

  if (t.includes("blue")) return 7;
  if (t.includes("green")) return 7;
  if (t.includes("red")) return 7;

  if (t.includes("tek") || t.includes("titan")) return 15;

  return 6;
}


function poiColor(type){
  const t = String(type || "").toLowerCase();
  
  if (t.includes("cityterminal")) return "#4db6ff";
  if (t.includes("beacon")) return "#ff8a3d";

  if (t.includes("blue")) return "#4da3ff";
  if (t.includes("green")) return "#5cff6b";
  if (t.includes("red")) return "#ff4d4d";
  if (t.includes("corrupt")) return "#555bcf";
  if (t.includes("tek") || t.includes("titan")) return "#b388ff";

  return "#ffffff";
}


function clearPois(){
  mapObj?.poiLayer?.clearLayers();
}


function drawPoiGroup(points, groupName){
  if (!mapObj?.poiLayer || !Array.isArray(points)) return;
  if (!poiVisibility[groupName]) return;

  for (const p of points){
    const x = Number(p?.x);
    const y = Number(p?.y);
    if (![x, y].every(Number.isFinite)) continue;

    const color = poiColor(p.type);
    const type = String(p.type || "").toLowerCase();
    const tooltipHtml =
      groupName === "supplyCrates"
        ? supplyCrateTooltipHtml(p)
        : (p.label || p.type || "POI");

    // TEK terminals get the special icon
    if (type.includes("tek") || type.includes("titan")) {

      const icon = makeTerminalIcon(type);

      const marker = L.marker([y, x], { 
        icon,
        pane: "poiPane"
      })
        .addTo(mapObj.poiLayer)
        .bindTooltip(tooltipHtml, {
          direction: "auto",
          sticky: true,
          opacity: 0.97,
          className: "basic-tooltip",
          autoPan: true
        });

      marker.getElement()?.style.setProperty("color", color);
      continue;
    }

    // Everything else = circle markers (red/blue/green obelisks)
    L.circleMarker([y, x], {
      radius: poiRadius(type),
      color: "#111",
      weight: 1,
      fillColor: color,
      fillOpacity: 0.95,
      pane: "poiPane",
      className:"poi-basic"
    })
      .addTo(mapObj.poiLayer)
      .bindTooltip(p.label || p.type || "POI");
  }
}


function drawPois(){
  clearPois();

  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);
  if (!geom?.pois) return;

  drawPoiGroup(geom.pois.tributeTerminals, "tributeTerminals");
  drawSupplyCratePois(geom.pois.supplyCrates || []);
  drawArtifactCratePois(geom.pois.supplyCrates || []);
  drawPlayerStarts(geom.pois.playerStarts);
  drawPoiGroup(geom.pois.explorerNotes, "explorerNotes");
  drawMissionPois(geom.pois.missions || []);
  drawHordePois(geom.pois.hordeEvents || []);
  drawPoiGroup(geom.pois.cityTerminals, "cityTerminals");
  drawPoiGroup(geom.pois.beacons, "beacons");
}


function anyPoisVisible(){
  return Object.values(poiVisibility).some(Boolean);
}


function hordeDifficultyLabel(d){
  const n = Number(d);

  if (n === 1) return "Gamma";
  if (n === 2) return "Beta";
  if (n === 3) return "Alpha";
  if (n === 4) return "Legendary";

  return `Difficulty ${d}`;
}


function hordeTypeLabel(t){
  const s = String(t || "");

  if (s.includes("NewEnumerator0")) return "OSD";
  if (s.includes("NewEnumerator1")) return "Element Node";
  if (s.includes("NewEnumerator2")) return "OSD / Element Node";

  return "Horde Event";
}


function crateShortName(bp){
  const s = String(bp || "");
  const cls = s.split(".").pop() || s;
  return cls.replace(/_C$/, "");
}


function shortBpName(bp){
  const s = String(bp || "").trim();
  if (!s) return "";

  const last = s.split("/").pop() || s;
  return last.split(".")[0] || last;
}


function fmtWeightShort(v){
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return fmt(n);
}


function missionVariantLine(meta, weight){
  const parts = [];

  if (meta?.k) parts.push(meta.k);
  if (meta?.s) parts.push(meta.s);
  if (meta?.d) parts.push(meta.d);

  let line = parts.join(" • ");
  if (!line) line = "Mission Variant";

  const w = fmtWeightShort(weight);
  if (w) line += ` (${w})`;

  return line;
}


function cssEscape(s){
  return String(s || "").toLowerCase().replace(/[^a-z0-9_-]/g,"");
}


function makeTerminalIcon(type){
  const cls = cssEscape(type);

  const size = 45;

  return L.divIcon({
    className: `poi-icon poi-${cls}`,
    html: `
      <svg width="${size}" height="${size}" viewBox="-10 -12 20 26">

        <!-- white frame -->
        <path d="M -3 0 L 0 -8 L 3 0 L 0 5 Z"
              fill="black"
              stroke="white"
              stroke-width="0.5"
              opacity="0.95"/>

        <!-- inner core -->
        <path class="poi-fill"
              d="M -2 0 L 0 -6 L 2 0 L 0 3.5 Z"
              fill="currentColor"
              opacity="0.9"/>
      </svg>
    `,
    iconSize:[size,size],
    iconAnchor:[size/2,size*0.58333]
  });
}
