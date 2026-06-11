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

  const type = exportPanelState.reportType;
  const scope = exportPanelState.scope;

  const isDino  = type === "dino";
  const isEntry = type === "entry";
  const isMap   = type === "map";
  const isCrate = type === "crate";
  const isItem  = type === "item";

  const dinoOpts  = exportPanelState.dino;
  const entryOpts = exportPanelState.entry;
  const mapOpts   = exportPanelState.map;
  const crateOpts = exportPanelState.crate;
  const itemOpts  = exportPanelState.item;

  // Scope options vary by report type
  const scopeOptions = (isCrate || isItem)
    ? [
        { id: "current_selection", label: isCrate ? "Selected Crate" : "Selected Item" },
        { id: "current_map",       label: "Current Map" },
        { id: "current_source",    label: "All Maps (Source)" }
      ]
    : isDino
    ? [
        { id: "current_selection", label: "Selected Dino" },
        { id: "current_map",       label: "Current Map" },
        { id: "current_source",    label: "All Maps (Source)" }
      ]
    : isEntry
    ? [
        { id: "current_selection", label: "Selected Entry" },
        { id: "current_map",       label: "Current Map" },
        { id: "current_source",    label: "All Maps (Source)" }
      ]
    : /* map */
    [
        { id: "current_map",       label: "Current Map" },
        { id: "current_source",    label: "All Maps (Source)" }
    ];

  // Auto-fix scope if not valid for current type
  const validScope = scopeOptions.some(o => o.id === scope);
  if (!validScope) exportPanelState.scope = scopeOptions[0].id;
  const activeScope = exportPanelState.scope;

  body.innerHTML = `
    <div class="fp-row fp-col">
      <div class="info-subtitle">Report Type</div>
      <div class="fp-row" style="gap:6px; flex-wrap:wrap;">
        <button type="button" class="fp-tab ${isDino  ? "is-on" : ""}" data-export-type="dino">Dinos</button>
        <button type="button" class="fp-tab ${isEntry ? "is-on" : ""}" data-export-type="entry">Entries</button>
        <button type="button" class="fp-tab ${isMap   ? "is-on" : ""}" data-export-type="map">Map</button>
        <button type="button" class="fp-tab ${isCrate ? "is-on" : ""}" data-export-type="crate">Crates</button>
        <button type="button" class="fp-tab ${isItem  ? "is-on" : ""}" data-export-type="item">Items</button>
      </div>
    </div>

    <div class="fp-row fp-col">
      <div class="info-subtitle">Scope</div>
      <div class="fp-row" style="gap:6px; flex-wrap:wrap;">
        ${scopeOptions.map(o => `
          <button type="button" class="fp-tab ${activeScope === o.id ? "is-on" : ""}" data-export-scope="${o.id}">${o.label}</button>
        `).join("")}
      </div>
    </div>

    <div class="fp-row fp-col">
      <div class="info-subtitle">Include</div>

      ${isDino ? `
        <div class="export-group">
          <label class="fp-row">
            <input type="checkbox" data-export-opt="dino.includeMaps" ${dinoOpts.includeMaps ? "checked" : ""}>
            <span>Which maps it spawns on</span>
          </label>
          <label class="fp-row">
            <input type="checkbox" data-export-opt="dino.includeEntries" ${dinoOpts.includeEntries ? "checked" : ""}>
            <span>Spawn entry names</span>
          </label>
          ${dinoOpts.includeEntries ? `
            <label class="fp-row" style="padding-left:18px;">
              <input type="checkbox" data-export-opt="dino.includeEntryMaps" ${dinoOpts.includeEntryMaps ? "checked" : ""}>
              <span>Which maps per entry</span>
            </label>
          ` : ""}
          <label class="fp-row">
            <input type="checkbox" data-export-opt="dino.includeBlueprints" ${dinoOpts.includeBlueprints ? "checked" : ""}>
            <span>Blueprint path</span>
          </label>
          <label class="fp-row">
            <input type="checkbox" data-export-opt="dino.includeNametag" ${dinoOpts.includeNametag ? "checked" : ""}>
            <span>Nametag</span>
          </label>
        </div>
      ` : ""}

      ${isEntry ? `
        <div class="export-group">
          <label class="fp-row">
            <input type="checkbox" data-export-opt="entry.includeMaps" ${entryOpts.includeMaps ? "checked" : ""}>
            <span>Which maps it appears on</span>
          </label>
          <label class="fp-row">
            <input type="checkbox" data-export-opt="entry.includeDinos" ${entryOpts.includeDinos ? "checked" : ""}>
            <span>Dinos in the entry</span>
          </label>
          <label class="fp-row">
            <input type="checkbox" data-export-opt="entry.includeBlueprint" ${entryOpts.includeBlueprint ? "checked" : ""}>
            <span>Entry blueprint path</span>
          </label>
        </div>
      ` : ""}

      ${isMap ? `
        <div class="export-group">
          <div class="export-group-title">Dinos</div>
          <label class="fp-row">
            <input type="checkbox" data-export-opt="map.includeDinos" ${mapOpts.includeDinos ? "checked" : ""}>
            <span>Include dinos</span>
          </label>
          ${mapOpts.includeDinos ? `
            <label class="fp-row" style="padding-left:18px;">
              <input type="checkbox" data-export-opt="map.dino.includeEntries" ${mapOpts.dino.includeEntries ? "checked" : ""}>
              <span>Spawn entries</span>
            </label>
            <label class="fp-row" style="padding-left:18px;">
              <input type="checkbox" data-export-opt="map.dino.includeBlueprints" ${mapOpts.dino.includeBlueprints ? "checked" : ""}>
              <span>Blueprint paths</span>
            </label>
          ` : ""}
        </div>

        <div class="export-group">
          <div class="export-group-title">Spawn Entries</div>
          <label class="fp-row">
            <input type="checkbox" data-export-opt="map.includeEntries" ${mapOpts.includeEntries ? "checked" : ""}>
            <span>Include spawn entries</span>
          </label>
          ${mapOpts.includeEntries ? `
            <label class="fp-row" style="padding-left:18px;">
              <input type="checkbox" data-export-opt="map.entry.includeDinos" ${mapOpts.entry.includeDinos ? "checked" : ""}>
              <span>Dinos per entry</span>
            </label>
          ` : ""}
        </div>

        <div class="export-group">
          <div class="export-group-title">Crates</div>
          <label class="fp-row">
            <input type="checkbox" data-export-opt="map.includeCrates" ${mapOpts.includeCrates ? "checked" : ""}>
            <span>Include crate class names</span>
          </label>
          ${mapOpts.includeCrates ? `
            <label class="fp-row" style="padding-left:18px;">
              <input type="checkbox" data-export-opt="map.crateUseDisplayName" ${mapOpts.crateUseDisplayName ? "checked" : ""}>
              <span>Also include descriptive name</span>
            </label>
          ` : ""}
        </div>

        <div class="export-group">
          <div class="export-group-title">Items</div>
          <label class="fp-row">
            <input type="checkbox" data-export-opt="map.includeItems" ${mapOpts.includeItems ? "checked" : ""}>
            <span>Include item names</span>
          </label>
        </div>

        <div class="export-group">
          <div class="export-group-title">Missions</div>
          <label class="fp-row">
            <input type="checkbox" data-export-opt="map.includeMissions" ${mapOpts.includeMissions ? "checked" : ""}>
            <span>Include mission class names</span>
          </label>
          ${mapOpts.includeMissions ? `
            <label class="fp-row" style="padding-left:18px;">
              <input type="checkbox" data-export-opt="map.crateUseDisplayName" ${mapOpts.crateUseDisplayName ? "checked" : ""}>
              <span>Also include descriptive name</span>
            </label>
          ` : ""}
        </div>
      ` : ""}

      ${isCrate ? `
        <div class="export-group">
          <label class="fp-row">
            <input type="checkbox" data-export-opt="crate.includeSets" ${crateOpts.includeSets ? "checked" : ""}>
            <span>Loot sets</span>
          </label>
          <label class="fp-row">
            <input type="checkbox" data-export-opt="crate.includeItems" ${crateOpts.includeItems ? "checked" : ""}>
            <span>Items per entry</span>
          </label>
          <label class="fp-row">
            <input type="checkbox" data-export-opt="crate.includeWeights" ${crateOpts.includeWeights ? "checked" : ""}>
            <span>Weights &amp; quantity</span>
          </label>
          <label class="fp-row">
            <input type="checkbox" data-export-opt="crate.includeQuality" ${crateOpts.includeQuality ? "checked" : ""}>
            <span>Quality range</span>
          </label>
          <label class="fp-row">
            <input type="checkbox" data-export-opt="crate.includeBpChance" ${crateOpts.includeBpChance ? "checked" : ""}>
            <span>Blueprint chance</span>
          </label>
          ${activeScope !== "current_selection" ? `
            <label class="fp-row">
              <input type="checkbox" data-export-opt="crate.includeMaps" ${crateOpts.includeMaps ? "checked" : ""}>
              <span>Which maps each crate appears on</span>
            </label>
          ` : ""}
          <label class="fp-row">
            <input type="checkbox" data-export-opt="crate.includeMissions" ${crateOpts.includeMissions ? "checked" : ""}>
            <span>Include missions</span>
          </label>
        </div>
      ` : ""}

      ${isItem ? `
        <div class="export-group">
          <label class="fp-row">
            <input type="checkbox" data-export-opt="item.includeMaps" ${itemOpts.includeMaps ? "checked" : ""}>
            <span>Which maps it can be found on</span>
          </label>
          <label class="fp-row">
            <input type="checkbox" data-export-opt="item.includeCrates" ${itemOpts.includeCrates ? "checked" : ""}>
            <span>Which crates contain it</span>
          </label>
          ${itemOpts.includeCrates ? `
            <label class="fp-row" style="padding-left:18px;">
              <input type="checkbox" data-export-opt="item.includeSetName" ${itemOpts.includeSetName ? "checked" : ""}>
              <span>Loot set name</span>
            </label>
            <label class="fp-row" style="padding-left:18px;">
              <input type="checkbox" data-export-opt="item.includeWeights" ${itemOpts.includeWeights ? "checked" : ""}>
              <span>Entry weight</span>
            </label>
            <label class="fp-row" style="padding-left:18px;">
              <input type="checkbox" data-export-opt="item.includeQuantity" ${itemOpts.includeQuantity ? "checked" : ""}>
              <span>Quantity range</span>
            </label>
            <label class="fp-row" style="padding-left:18px;">
              <input type="checkbox" data-export-opt="item.includeQuality" ${itemOpts.includeQuality ? "checked" : ""}>
              <span>Quality range</span>
            </label>
            <label class="fp-row" style="padding-left:18px;">
              <input type="checkbox" data-export-opt="item.includeBpChance" ${itemOpts.includeBpChance ? "checked" : ""}>
              <span>Blueprint chance</span>
            </label>
            <label class="fp-row" style="padding-left:18px;">
              <input type="checkbox" data-export-opt="item.includeCrateMaps" ${itemOpts.includeCrateMaps ? "checked" : ""}>
              <span>Which maps those crates appear on</span>
            </label>
          ` : ""}
          <label class="fp-row">
            <input type="checkbox" data-export-opt="item.includeMissions" ${itemOpts.includeMissions ? "checked" : ""}>
            <span>Include missions as sources</span>
          </label>
        </div>
      ` : ""}
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
      const path = el.dataset.exportOpt.split(".");
      let target = exportPanelState;

      for (let i = 0; i < path.length - 1; i++) {
        target = target[path[i]];
      }

      target[path[path.length - 1]] = el.checked;
      renderExportPanel();
    };
  });

  const runBtn = body.querySelector("[data-export-run='json']");
  if (runBtn){
    runBtn.onclick = () => exportCurrentReportJSON();
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
        .bindTooltip(tip || "Player Start", {
          direction: "auto",
          sticky: true,
          opacity: 0.97,
          className: "dark-tooltip",
          autoPan: true
        });
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

  // Rule `from` and `outs[][0]` are dino indices in current data. Resolve to
  // bp here so the world-replacement engine operates purely on bps. This runs
  // only once per map change now (result is cached in worldRuleIndexForCurrentMap),
  // so the per-call resolution cost is negligible.
  const resolveRule = (r) => {
    if (!r || typeof r !== "object") return r;
    const out = { ...r, from: bpForDinoRef(r.from) };
    if (Array.isArray(r.outs)){
      out.outs = r.outs.map(o => Array.isArray(o) ? [bpForDinoRef(o[0]), o[1]] : o);
    }
    return out;
  };

  return [...mapRules, ...globalRules].map(resolveRule);
}


function rebuildMapIndices(){

  const spawn = Global.spawn || {};

  // Invalidate the world-rule index cache — it's map-specific and must be
  // rebuilt for the new map before worldOutputsForBp() is called.
  invalidateWorldRuleCache();

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
      // r[0] is a dino reference: a numeric dino index in current data, or a
      // bp string in older/mod data. Resolve to a bp up front.
      const rawBp = normalizeBp(bpForDinoRef(r?.[0]));
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

  // Boss list for the current map (used by Boss View's dropdown).
  if (typeof rebuildBossIndex === "function") rebuildBossIndex();
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

  // Coordinate display
  const coordDisplay = document.createElement("div");
  coordDisplay.id = "coordDisplay";
  coordDisplay.className = "coord-display";
  coordDisplay.textContent = "—";
  document.getElementById("mapWrap")?.appendChild(coordDisplay);

  function pixelToArkCoords(latlng) {
    // In CRS.Simple, leaflet lat = pixel Y, lng = pixel X
    // bounds = [[0,0],[imageHeight, imageWidth]]
    // Leaflet Y increases upward, but Ark lat increases downward (0=top, 100=bottom)
    // so we subtract from 100 to flip the axis.
    const b = mapObj?.bounds || [[0,0],[2048,2048]];
    const H = b[1][0]; // imageHeight
    const W = b[1][1]; // imageWidth
    const lat = 100 - (latlng.lat / H) * 100;
    const lon = (latlng.lng / W) * 100;
    return { lat, lon };
  }

  map.on("mousemove", (e) => {
    const { lat, lon } = pixelToArkCoords(e.latlng);
    if (lat < -5 || lat > 105 || lon < -5 || lon > 105) {
      coordDisplay.textContent = "—";
    } else {
      const clampedLat = Math.max(0, Math.min(100, lat));
      const clampedLon = Math.max(0, Math.min(100, lon));
      coordDisplay.textContent = `${clampedLat.toFixed(2)}, ${clampedLon.toFixed(2)}`;
    }
  });

  map.on("mouseout", () => {
    coordDisplay.textContent = "—";
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
    const paddedBounds = L.latLngBounds(bounds).pad(0.1);
    mapObj.overlay.setBounds(bounds);
    mapObj.overlay.setUrl(img);
    mapObj.map.setMaxBounds(paddedBounds);
    mapObj.map.fitBounds(bounds, {
      paddingTopLeft: [6, 6],
      paddingBottomRight: [6, 20]
    });
    mapObj.bounds = bounds;
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
  if (isPanelVisible("noteViewPanel")) {
    noteViewState.selected = null;
    renderNoteViewPanel();
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

function getDockPrefs(){
  try {
    return JSON.parse(localStorage.getItem("dockPrefs") || "{}");
  } catch { return {}; }
}

function setDockPref(key, val){
  const prefs = getDockPrefs();
  prefs[key] = val;
  localStorage.setItem("dockPrefs", JSON.stringify(prefs));
}

function isDockBtnVisible(key){
  const prefs = getDockPrefs();
  return prefs[key] !== false; // default visible
}

function getAstraeosBgPref(){
  return localStorage.getItem("astraeosBg") || null;
}

function setAstraeosBgPref(id){
  localStorage.setItem("astraeosBg", id);
}


function renderSettingsPanel(){
  const panel = ensureSettingsPanel();
  const body = panel.querySelector(".fp-body");
  if (!body) return;

  const currentTheme = getTheme();
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const isAstraeos = !!(mapMeta?.backgrounds?.length);

  const DOCK_BTNS = [
    { key: "dinoInfoPanel",   label: "Info panel" },
    { key: "drawStylePanel",  label: "Draw style" },
    { key: "poiPanel",        label: "Markers" },
    { key: "rarityLegend",    label: "Rarity legend" },
    { key: "mapEntriesPanel", label: "Entries browser" },
    { key: "exportPanel",     label: "Export panel" }
  ];

  body.innerHTML = `
    <div class="fp-row fp-col">
      <div class="info-subtitle">Theme</div>
      <select id="themeSelect" class="settings-select">
        ${THEME_OPTIONS.map(opt => `
          <option value="${escapeAttr(opt.id)}" ${opt.id === currentTheme ? "selected" : ""}>
            ${escapeHtml(opt.label)}
          </option>
        `).join("")}
      </select>
    </div>

    <div class="fp-row fp-col" style="margin-top:14px;">
      <div class="info-subtitle">Dock buttons</div>
      <div class="settings-check-group">
        ${DOCK_BTNS.map(b => `
          <label class="settings-check-row">
            <input type="checkbox" data-dock-pref="${escapeAttr(b.key)}" ${isDockBtnVisible(b.key) ? "checked" : ""}>
            <span>${escapeHtml(b.label)}</span>
          </label>
        `).join("")}
      </div>
    </div>

    ${isAstraeos ? `
      <div class="fp-row fp-col" style="margin-top:14px;">
        <div class="info-subtitle">Astraeos default background</div>
        <select id="astraeosBgSelect" class="settings-select">
          ${(mapMeta.backgrounds || []).map(bg => `
            <option value="${escapeAttr(bg.id)}" ${(getAstraeosBgPref() || mapMeta.defaultBg) === bg.id ? "selected" : ""}>
              ${escapeHtml(bg.label || bg.id)}
            </option>
          `).join("")}
        </select>
      </div>
    ` : ""}
  `;

  const themeSelect = body.querySelector("#themeSelect");
  if (themeSelect){
    themeSelect.onchange = () => updateThemeSetting(themeSelect.value || "");
  }

  body.querySelectorAll("[data-dock-pref]").forEach(el => {
    el.onchange = () => {
      setDockPref(el.dataset.dockPref, el.checked);
      renderDock();
    };
  });

  const bgSelect = body.querySelector("#astraeosBgSelect");
  if (bgSelect){
    bgSelect.onchange = () => {
      setAstraeosBgPref(bgSelect.value);
      const bg = mapMeta.backgrounds.find(b => b.id === bgSelect.value);
      if (bg && mapObj?.overlay) mapObj.overlay.setUrl(bg.url);
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

/* ============================================================
   UE COORDINATE CONVERSION
   Reads worldBounds from the geom file (added by the POI exporter).
   worldBounds format: { minX, maxX, minY, maxY }  (UE world units)

   ARK GPS convention:
     lat 0  = north (UE_Y minimum)
     lat 100= south (UE_Y maximum)
     lon 0  = west  (UE_X minimum)
     lon 100= east  (UE_X maximum)

   In our Leaflet CRS.Simple setup (bounds [[0,0],[imgH,imgW]]):
     leaflet lat = (1 - gps_lat/100) * imgH
     leaflet lng = (gps_lon/100) * imgW
============================================================ */

// geom.bounds format: [minX, maxX, minY, maxY]  (UE world units, flat array)
function boundsForCurrentMap() {
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);
  const b = geom?.bounds;
  if (!Array.isArray(b) || b.length < 4) return null;
  return { minX: b[0], maxX: b[1], minY: b[2], maxY: b[3] };
}

// Convert UE world coords → ARK GPS (lat 0-100, lon 0-100).
// Returns null if bounds are unavailable.
function ueToGps(ue_x, ue_y) {
  const b = boundsForCurrentMap();
  if (!b) return null;
  const lon = (ue_x - b.minX) / (b.maxX - b.minX) * 100;
  const lat = (ue_y - b.minY) / (b.maxY - b.minY) * 100;
  return { lat, lon };
}

// Convert UE world coords → Leaflet [lat, lng] for our CRS.Simple map.
// Returns null if bounds are unavailable.
function ueToLeaflet(ue_x, ue_y) {
  const gps = ueToGps(ue_x, ue_y);
  if (!gps) return null;
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);
  const [imgW, imgH] = geom?.size || [2048, 2048];
  return [
    (1 - gps.lat / 100) * imgH,   // leaflet lat (Y axis inverted: lat 0=top, lat 100=bottom)
    (gps.lon / 100) * imgW         // leaflet lng
  ];
}


/* ============================================================
   CAVE / OCEAN / DESERT CRATE DETECTION
============================================================ */

function isCaveCrate(crateClass) {
  const cls = String(crateClass || "").toLowerCase();
  return cls.includes("cave") || cls.includes("underwater");
}

// LC "normal" drops: LostLootChest without Cave in the name
function isLcNormalCrate(crateClass) {
  const cls = String(crateClass || "").toLowerCase();
  return cls.includes("lostlootchest") && !cls.includes("cave");
}

// LC cave drops: LostLootChest_Cave_*
function isLcCaveCrate(crateClass) {
  const cls = String(crateClass || "").toLowerCase();
  return cls.includes("lostlootchest") && cls.includes("cave");
}

// Extinction OSD (Orbital Supply Drop / Horde Event) crates
function isHordeCrate(crateClass) {
  const cls = String(crateClass || "").toLowerCase();
  return cls.includes("horde");
}

// Ocean/Desert drops share the same loot set and are grouped together.
// "High" class variants (SupplyCreate_OceanInstant_High_*) are used for desert spawns
// on maps like Scorched Earth and Ragnarok but reference the same ocean loot set.
function isOceanCrate(crateClass) {
  const cls = String(crateClass || "").toLowerCase();
  return cls.includes("ocean") || cls.includes("seabed") || cls.includes("high");
}

// isDesertCrate is an alias for isOceanCrate - kept for potential future separation
function isDesertCrate(crateClass) { return isOceanCrate(crateClass); }

// Beaver dams — giant beaver lodges that act as lootable supply containers.
// Two known classes: DenLogs_Child2 and DamLogs_Child. Matched on the
// distinctive "...Logs_..." segment so either variant is caught.
function isBeaverDam(crateClass) {
  const cls = String(crateClass || "").toLowerCase();
  return cls.includes("denlogs") || cls.includes("damlogs");
}

// ── Aberration special crate types ───────────────────────────────────────────
// Ab "cave" = normal gameplay drops (inside the main cave map)
// Ab "dungeon" = challenging cave areas
// Ab "surface" = the dangerous irradiated surface zone
// These only apply on Aberration; on other maps cave detection is the usual logic.

function isAbMap() {
  return State.mapId === "Aberration";
}

function isAbNormalCrate(crateClass) {
  if (!isAbMap()) return false;
  const cls = String(crateClass || "").toLowerCase();
  return cls.includes("cave") && cls.includes("aberration");
}

function isAbDungeonCrate(crateClass) {
  if (!isAbMap()) return false;
  const cls = String(crateClass || "").toLowerCase();
  return cls.includes("dungeon") && cls.includes("aberration");
}

function isAbSurfaceCrate(crateClass) {
  if (!isAbMap()) return false;
  const cls = String(crateClass || "").toLowerCase();
  return cls.includes("surface") && cls.includes("aberrant");
}

// A crate is "special" (excluded from the normal surface drop bucket)
function isExMap() { return State.mapId === "Extinction"; }
function isLcMap() { return State.mapId === "Lost Colony"; }

function isSpecialCrate(crateClass) {
  if (isAbMap()) {
    return isAbNormalCrate(crateClass) || isAbDungeonCrate(crateClass) || isAbSurfaceCrate(crateClass)
        || isBeaverDam(crateClass);
  }
  // For all other maps including LC and EX: special = cave or ocean or beaver dam
  // (LC cave drops have "cave" in their class name; EX cave drops do too)
  return isCaveCrate(crateClass) || isOceanCrate(crateClass) || isBeaverDam(crateClass);
}

function _poiMatchesCrateFn(point, fn) {
  const legend = resolvedSupplyLegendForCurrentMap();
  const rows = Array.isArray(point?.c) ? point.c : [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const idx = Number(row[0]);
    if (!Number.isInteger(idx) || idx < 0 || idx >= legend.length) continue;
    if (fn(legend[idx]?.cls || "")) return true;
  }
  return false;
}

function poiHasCaveCrate(point)      { return _poiMatchesCrateFn(point, isCaveCrate); }
function poiHasOsdCrate(point)       { return _poiMatchesCrateFn(point, isOsdCrate); }
function poiHasOceanCrate(point)     { return _poiMatchesCrateFn(point, isOceanCrate); }
function poiHasDesertCrate(point)    { return poiHasOceanCrate(point); } // alias
function poiHasAbNormalCrate(point)  { return _poiMatchesCrateFn(point, isAbNormalCrate); }
function poiHasAbDungeonCrate(point) { return _poiMatchesCrateFn(point, isAbDungeonCrate); }
function poiHasAbSurfaceCrate(point) { return _poiMatchesCrateFn(point, isAbSurfaceCrate); }
function poiIsSpecialCrate(point)    { return _poiMatchesCrateFn(point, isSpecialCrate); }
function poiHasBeaverDam(point)      { return _poiMatchesCrateFn(point, isBeaverDam); }



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

// Returns ALL blueprint paths from Global.dinos that resolve to the given
// display name. Used by the spawn browser so that world-replaced variants
// (e.g. cave Tuso replacing normal Tuso on The Island) don't cause the
// display name to appear falsely unique to that map.
function globalBpsForName(name){
  const dinos = Global.dinos?.dinos || {};
  const out = new Set();
  for (const [bp, d] of Object.entries(dinos)){
    const labels = labelsForDinoObj(d);
    if (labels.includes(name)) out.add(normalizeBp(bp));
  }
  return out;
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
      const rawBp = normalizeBp(bpForDinoRef(r?.[0]));
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

    // Use ALL globally-known BPs for this display name when computing map
    // spread. This prevents world-replaced variants (e.g. cave Tuso standing
    // in for normal Tuso on The Island) from making the name look unique here
    // when the underlying species actually appears on many maps.
    const allBpsForName = globalBpsForName(name);

    // now scan ALL entries globally to find all maps this dino appears on
    for (const [entryName, entryData] of Object.entries(allEntries)) {
      const rowsInEntry = entryData?.d || [];
      let foundInThisEntry = false;

      for (const r of rowsInEntry) {
        const rawBp = normalizeBp(bpForDinoRef(r?.[0]));
        if (!rawBp) continue;

        const outs = worldOutputsForBp(rawBp);

        for (const out of outs) {
          const finalBp = normalizeBp(out?.[0]);
          const prob = Number(out?.[1] || 0);
          if (!finalBp || prob <= 0) continue;

          // Match against the full global set, not just current-map BPs
          if (allBpsForName.has(finalBp) || bps.includes(finalBp)) {
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
  const SWIPE_MIN_PX = 80;   // was 40 — higher threshold means deliberate swipes only
  const SWIPE_MAX_Y = 40;    // was 60 — tighter vertical tolerance

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
  syncInfoPanelState();

  if (!State.selection && State.mode !== "note") {
    renderInfoPanelBodyEmpty();
    return;
  }

  if (State.mode === "note") {
    if (noteViewState.selected) renderNotePanel(noteViewState.selected);
    else renderInfoPanelBodyEmpty();
    return;
  }

  if (State.mode === "dino") {
    try {
      renderDinoPanel(State.selection);
    } catch (err) {
      console.error("renderDinoPanel threw:", err);
      setInfoPanelTitle(State.selection);
      setInfoPanelHTML(`<div style="color:var(--muted);padding:8px;font-size:12px;">
        Panel error: ${err.message}<br>
        <pre style="font-size:10px;white-space:pre-wrap;opacity:.7">${err.stack || ""}</pre>
      </div>`);
    }
  } else if (State.mode === "entry") {
    renderEntryPanel(State.selection);
    
  } else if (State.mode === "crate") {
    renderCratePanel(State.selection);
    
  } else if (State.mode === "item") {
    renderItemPanel(State.selection);
  } else if (State.mode === "boss") {
    renderBossPanel(State.selection);
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
    const isSupply = /supplycr[ea]te/i.test(cls); // handles both SupplyCrate and SupplyCreate (desert crates)

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
  return (Array.isArray(points) ? points : []).filter(p =>
    poiHasArtifactCrate(p) && !poiHasSupplyCrate(p) && !poiIsSpecialCrate(p)
  ).length;
}

function countSupplyPois(points){
  return (Array.isArray(points) ? points : []).filter(p =>
    poiHasSupplyCrate(p) && !poiIsSpecialCrate(p)
  ).length;
}

function countCavePois(points)          { return (Array.isArray(points) ? points : []).filter(p => poiHasCaveCrate(p)).length; }
function countLcNormalPois(points)     { return (Array.isArray(points) ? points : []).filter(p => _poiMatchesCrateFn(p, isLcNormalCrate)).length; }
function countLcCavePois(points)       { return (Array.isArray(points) ? points : []).filter(p => _poiMatchesCrateFn(p, isLcCaveCrate)).length; }

// Builds the dynamic "special crate" rows for the POI menu based on the current map
function buildSpecialCrateRows(supplyCrates) {
  if (isAbMap()) {
    return [
      { key: "abNormalCrates",  label: "Cave Drops",    count: countAbNormalPois(supplyCrates) },
      { key: "abDungeonCrates", label: "Dungeon Drops", count: countAbDungeonPois(supplyCrates) },
      { key: "abSurfaceCrates", label: "Surface Drops", count: countAbSurfacePois(supplyCrates) },
    ];
  }
  if (isExMap()) {
    // Extinction only has cave drops (no surface drops, no ocean - OSDs are in Horde Events)
    return [
      { key: "caveCrates", label: "Cave Drops", count: countCavePois(supplyCrates) },
    ];
  }
  if (isLcMap()) {
    // LC: Supply Drops (handled by main "supplyCrates" toggle) + Cave Drops
    return [
      { key: "caveCrates", label: "Cave Drops", count: countCavePois(supplyCrates) },
    ];
  }
  // Determine ocean/desert label dynamically
  const hasOcean  = supplyCrates.some(p => _poiMatchesCrateFn(p, c => isOceanCrate(c) && !isOceanHigh(c)));
  const hasDesert = supplyCrates.some(p => _poiMatchesCrateFn(p, isOceanHigh));
  const oceanLabel = hasOcean && hasDesert ? "Ocean / Desert Drops"
                   : hasDesert             ? "Desert Drops"
                   : "Ocean Drops";
  const rows = [];
  if (!isLcMap()) {  // LC has no ocean/desert
    const oceanCount = countOceanPois(supplyCrates);
    if (oceanCount > 0) rows.push({ key: "oceanCrates", label: oceanLabel, count: oceanCount });
  }
  // Cave drops (skip if none)
  const caveCount = countCavePois(supplyCrates);
  if (caveCount > 0) rows.push({ key: "caveCrates", label: "Cave Drops", count: caveCount });
  // Beaver dams (skip if none)
  const beaverCount = countBeaverDamPois(supplyCrates);
  if (beaverCount > 0) rows.push({ key: "beaverDams", label: "Beaver Dams", count: beaverCount });
  return rows;
}

// "High" variant = desert drop specifically
function isOceanHigh(crateClass) {
  return /supplycr[ea]te.*high/i.test(crateClass) || /high.*supplycr[ea]te/i.test(crateClass)
      || String(crateClass).toLowerCase().includes("oceaninstant_high");
}
function countOceanPois(points)     { return (Array.isArray(points) ? points : []).filter(p => poiHasOceanCrate(p)).length; }
function countBeaverDamPois(points) { return (Array.isArray(points) ? points : []).filter(p => poiHasBeaverDam(p)).length; }
function countAbNormalPois(points)  { return (Array.isArray(points) ? points : []).filter(p => poiHasAbNormalCrate(p)).length; }
function countAbDungeonPois(points) { return (Array.isArray(points) ? points : []).filter(p => poiHasAbDungeonCrate(p)).length; }
function countAbSurfacePois(points) { return (Array.isArray(points) ? points : []).filter(p => poiHasAbSurfaceCrate(p)).length; }


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

  const supplyCrates = pois.supplyCrates || [];
  const allNotes = pois.explorerNotes || [];
  const dossierCount = allNotes.filter(n => isDossierNote(n[1])).length;
  const noteCount = allNotes.length - dossierCount;

  const rows = [
    { key: "tributeTerminals",  label: "Tribute Terminals",  count: (pois.tributeTerminals || []).length },
    { key: "supplyCrates",      label: "Supply Drops",        count: countSupplyPois(supplyCrates) },
    ...buildSpecialCrateRows(supplyCrates),
    { key: "artifactCrates",    label: "Artifacts",           count: countArtifactPois(supplyCrates) },
    { key: "playerStarts",      label: "Player Start Points", count: poiCount(pois.playerStarts) },
    { key: "explorerNotes",     label: "Explorer Notes",      count: noteCount },
    { key: "dinoDossiers",      label: "Dino Dossiers",       count: dossierCount },
    { key: "missions",          label: "Missions",            count: (pois.missions || []).length },
    { key: "hordeEvents",       label: "Horde Events",        count: (pois.hordeEvents || []).length },
    { key: "cityTerminals",     label: "City Terminals",      count: (pois.cityTerminals || []).length },
    { key: "beacons",           label: "Border Beacons",      count: ((pois.beacons||[]).length||(pois.borderBeacons||[]).length) },
    { key: "waterVeins",        label: "Water Veins",         count: (pois.waterVeins || []).length },
    { key: "oilVeins",          label: "Oil Veins",           count: (pois.oilVeins || []).length },
    { key: "gasVeins",          label: "Gas Veins",           count: (pois.gasVeins || []).length },
    { key: "chargeNodes",       label: "Charge Nodes",        count: (pois.chargeNodes || []).length },
    { key: "hyperChargeNodes",  label: "Hyper Charge Nodes",  count: (pois.hyperChargeNodes || []).length },
    { key: "plantZ",            label: "Wild Plant Z",        count: (pois.plantZ || []).length },
    { key: "plantR",            label: "Proto Plant R",       count: (pois.plantR || []).length },
    { key: "wyvernNests",       label: "Wyvern Nests",        count: (pois.wyvernNests || []).length },
    { key: "iceWyvernNests",    label: "Ice Wyvern Nests",    count: (pois.iceWyvernNests || []).length },
    { key: "rockDrakeNests",    label: "Rock Drake Nests",    count: (pois.rockDrakeNests || []).length },
    { key: "deinonychusNests",  label: "Deinonychus Nests",   count: (pois.deinonychusNests || []).length },
    { key: "beachChests",       label: "Beach Crates",        count: (pois.beachChests || []).length },
    { key: "memorial",          label: "Memorial",            count: (pois.memorial || []).length },
    { key: "teleporters",       label: "Teleporters",         count: (pois.teleporters || []).length }
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
  // Tooltip jump buttons use mousedown (fires before Leaflet closes the tooltip).
  // We stop propagation so Leaflet's tooltip close handler doesn't run before us.
  const jumpHandler = (e) => {
    const artJump = e.target.closest(".artifact-crate-jump");
    if (artJump) {
      e.preventDefault();
      e.stopPropagation();
      const crateValue = artJump.dataset.crateValue;
      if (crateValue) openCrateView(crateValue);
      return;
    }
    const noteJump = e.target.closest(".note-view-jump");
    if (noteJump) {
      e.preventDefault();
      e.stopPropagation();
      const idx = Number(noteJump.dataset.noteIdx);
      if (Number.isInteger(idx)) {
        const mapMeta = MAPS.find(m => m.id === State.mapId);
        const geom = Global.mapGeom.get(mapMeta?.geomShort);
        const note = (geom?.pois?.explorerNotes || []).find(n => n[0] === idx);
        if (note) openNoteView(note);
      }
      return;
    }
  };
  // mousedown captures the event before Leaflet's click handler runs
  document.addEventListener("mousedown", jumpHandler, true);
  document.addEventListener("touchstart", jumpHandler, { capture: true, passive: false });

  // Copy-on-click stays on click (no tooltip involved)
  document.addEventListener("click", async (e) => {
    // Color swatch tap → show floating popover with name + hex
    const swatch = e.target.closest(".color-swatch");
    if (swatch) {
      e.stopPropagation();
      showColorSwatchPopover(swatch);
      return;
    }

    // Item link → navigate to that item in Item View
    // Matches both data-item-link-id (new explicit links) and data-item-id (loot tags)
    const link = e.target.closest("[data-item-link-id], .loot-item-tag[data-item-id]");
    if (link) {
      const itemId = Number(link.dataset.itemLinkId || link.dataset.itemId);
      if (Number.isFinite(itemId)) {
        const name = itemDisplayNameById(itemId);
        if (name && typeof openItemView === "function") {
          openItemView(name);
          return;
        }
      }
    }

    const el = e.target.closest(".copy-on-click");
    if (!el) return;
    const text = el.dataset.copy ?? el.textContent ?? "";
    await copyText(String(text).trim());
    showCopiedBubble(el);
  });

  // Reflow the panel scroll area on viewport changes (rotation, browser chrome
  // collapsing on scroll, keyboard appearing, etc.)
  let _resizeRaf = 0;
  const onResize = () => {
    if (_resizeRaf) cancelAnimationFrame(_resizeRaf);
    _resizeRaf = requestAnimationFrame(() => {
      _resizeRaf = 0;
      refreshInfoPanelPageHeight();
    });
  };
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
}


// Floating popover for color swatch info
let _swatchPopoverEl = null;
function showColorSwatchPopover(swatch) {
  // Remove existing popover if any
  if (_swatchPopoverEl) { _swatchPopoverEl.remove(); _swatchPopoverEl = null; }

  const name = swatch.dataset.colorName || "";
  const hex  = swatch.dataset.colorHex  || "";
  const idx  = swatch.dataset.colorIdx  || "";

  const pop = document.createElement("div");
  pop.className = "color-swatch-popover";
  pop.innerHTML = `
    <div class="color-swatch-popover-row">
      <span class="color-swatch-popover-chip" style="background:#${escapeAttr(hex)};"></span>
      <div class="color-swatch-popover-text">
        <div class="color-swatch-popover-name">${escapeHtml(name)}</div>
        <div class="color-swatch-popover-hex">#${escapeHtml(hex)} <span class="color-swatch-popover-idx">· id ${escapeHtml(idx)}</span></div>
      </div>
    </div>
  `;
  document.body.appendChild(pop);
  _swatchPopoverEl = pop;

  // Position above the swatch
  const r = swatch.getBoundingClientRect();
  const popR = pop.getBoundingClientRect();
  let left = r.left + (r.width / 2) - (popR.width / 2);
  let top  = r.top - popR.height - 8;
  // Clamp to viewport
  const margin = 4;
  left = Math.max(margin, Math.min(left, window.innerWidth - popR.width - margin));
  if (top < margin) top = r.bottom + 8; // flip below if not enough room above
  pop.style.left = `${left}px`;
  pop.style.top  = `${top}px`;

  // Auto-dismiss on any next click outside, or after 3s
  const dismiss = () => {
    if (_swatchPopoverEl === pop) { pop.remove(); _swatchPopoverEl = null; }
    document.removeEventListener("click", dismiss, true);
  };
  setTimeout(() => document.addEventListener("click", dismiss, true), 0);
  setTimeout(dismiss, 3500);
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


function syncActivePageHeight(pagesEl, activeId, opts = {}){
  if (!pagesEl) return;

  const activePage = pagesEl.querySelector(`.fp-page[data-page="${CSS.escape(activeId)}"]`);
  if (!activePage) return;

  // clear old scrolling first
  pagesEl.querySelectorAll(".fp-page").forEach(p => {
    p.style.overflowY = "";
    p.style.maxHeight = "";
  });

  // temporarily let wrapper size naturally so measurement is real
  pagesEl.style.height = "auto";

  // Compute the actual available height inside the panel:
  // panel.clientHeight − (everything above .fp-pages inside .fp-body)
  const panel = pagesEl.closest(".floating-panel");
  const body  = pagesEl.closest(".fp-body");
  let availableHeight = Infinity;

  if (panel && body) {
    const panelRect = panel.getBoundingClientRect();
    const pagesRect = pagesEl.getBoundingClientRect();

    // Find the bottom dock (Leaflet map controls) so we don't scroll under it.
    // It lives in the leaflet-bottom container which holds dock buttons + zoom.
    let dockTop = window.innerHeight;
    const dockEl =
      document.querySelector(".leaflet-bottom.leaflet-left") ||
      document.querySelector(".leaflet-bottom.leaflet-right") ||
      document.querySelector(".leaflet-control.map-dock") ||
      document.querySelector(".leaflet-bottom");
    if (dockEl) {
      const r = dockEl.getBoundingClientRect();
      if (r.top > 0 && r.top < window.innerHeight) dockTop = r.top;
    }

    // Read CSS vars for a safe fallback when the dock element isn't measurable yet
    const cs = getComputedStyle(document.documentElement);
    const toolbarH = parseFloat(cs.getPropertyValue("--leaflet-toolbar-h")) || 50;
    const safeAreaFallback = window.innerHeight - toolbarH - 12;

    // Skip layout-not-ready edge cases (zero rects during mount)
    if (panelRect.bottom > 0 && pagesRect.top >= 0) {
      // Cap to whichever is closer: bottom of panel, top of dock, or safe-area fallback
      const usableBottom = Math.min(panelRect.bottom, dockTop - 8, safeAreaFallback);
      const computed = usableBottom - pagesRect.top - 8;
      availableHeight = computed > 80
        ? computed
        : Math.floor(window.innerHeight * 0.5);
    } else {
      availableHeight = Math.floor(window.innerHeight * 0.5);
    }
  }

  // Caller can also pass a maxHeight to further cap
  const explicitMax = Number.isFinite(opts.maxHeight) ? opts.maxHeight : Infinity;
  const cap = Math.min(availableHeight, explicitMax);

  const naturalHeight = activePage.scrollHeight;
  const finalHeight = Math.min(naturalHeight, cap);

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
  else if (State.mode === "boss") activeId = infoPanelState.bossTab;

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
  itemTab: "crates",
  bossTab: "summon",
  itemCmdQty: 1,
  itemCmdQuality: 0,
  itemCmdIsBp: 0,
  showOfficialSets: false,   // when mod active, also show official sets in panel
  showAllCrates: false,      // when mod active, show all crates not just mod ones
  showAllEntries: false,     // when mod active, show all entries not just mod ones
  crateTypeFilter: "all"     // "all" | "normal" | "cave" | "artifact"
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

function artifactNameFromCrateClass(crateClass) {
  const crateData = Global.loot?.c?.[crateClass];
  if (!crateData) return null;
  // Drill into sets → entries → first item id
  for (const set of (crateData.s || [])) {
    for (const entry of (set.e || [])) {
      const itemId = entry.i?.[0];
      if (itemId != null) {
        const item = Global.items?.i?.[String(itemId)];
        if (item?.n) return item.n;
      }
    }
  }
  return crateData.dn || null;
}

function artifactTooltipHtml(p, legend) {
  const rows = Array.isArray(p?.c) ? p.c : [];
  let crateValue = "";
  const lines = rows.map(row => {
    if (!Array.isArray(row)) return "";
    const idx = Number(row[0]);
    const meta = Number.isInteger(idx) && idx >= 0 && idx < legend.length ? legend[idx] : null;
    if (!meta) return "";
    const cls = meta.cls || crateClassFromLegendRow(meta);
    const artifactName = artifactNameFromCrateClass(cls);
    const displayName = artifactName || crateDisplayNameByClass(cls) || meta.n || shortBpName(meta.bp || "") || "Artifact";
    // Capture the crateId for the jump button
    if (!crateValue) {
      const crateId = Global.crateClassToId?.get(cls);
      if (Number.isInteger(crateId)) crateValue = `crate:${crateId}`;
    }
    return `<div class="poi-tip-line">${escapeHtml(displayName)}</div>`;
  }).filter(Boolean).join("");
  const jumpBtn = crateValue
    ? `<div class="poi-tip-action artifact-crate-jump" data-crate-value="${escapeAttr(crateValue)}">Open in Crate View &#8594;</div>`
    : "";
  return `<div class="poi-tip-block">
    <div class="poi-tip-title">Artifact</div>
    ${lines || '<div class="poi-tip-line">Unknown artifact</div>'}
    ${jumpBtn}
  </div>`;
}

function addArtifactMarkers(points, { layer = mapObj.poiLayer } = {}) {
  if (!layer || !Array.isArray(points)) return;

  const legend = supplyLegendForCurrentMap();
  const icon = makeArtifactIcon();

  for (const p of points) {
    const x = Number(p?.x);
    const y = Number(p?.y);
    if (![x, y].every(Number.isFinite)) continue;

    const marker = L.marker([y, x], {
      icon,
      pane: "poiPane"
    })
      .addTo(layer)
      .bindTooltip(artifactTooltipHtml(p, legend), {
        direction: "auto",
        sticky: false,
        offset: [0, -12],
        opacity: 0.97,
        className: "supply-tooltip supply-tooltip--interactive",
        autoPan: true,
        interactive: true
      });

    // Click handled via delegation on .artifact-crate-jump in the tooltip
  }
}

function drawArtifactCratePois(points){
  if (!mapObj?.poiLayer || !Array.isArray(points)) return;
  if (!poiVisibility.artifactCrates) return;

  const artifactRows = points.filter(p => poiHasArtifactCrate(p) && !poiHasSupplyCrate(p) && !poiIsSpecialCrate(p));
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


function addSupplyCrateMarkers(points, { layer = mapObj.poiLayer, iconOverride = null } = {}) {
  if (!layer || !Array.isArray(points)) return;

  const legend = supplyLegendForCurrentMap();

  for (const p of points) {
    const x = Number(p?.x);
    const y = Number(p?.y);
    if (![x, y].every(Number.isFinite)) continue;

    const slices = supplyCrateSlicesForPoint(p, legend);

    let icon;
    if (iconOverride) {
      icon = iconOverride;
    } else if (slices.length <= 1) {
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

  const supplyRows = points.filter(p => poiHasSupplyCrate(p) && !poiIsSpecialCrate(p));
  addSupplyCrateMarkers(supplyRows, { layer: mapObj.poiLayer });
}


function caveCrateTooltipHtml(p, legend) {
  const crateRows = Array.isArray(p?.c) ? p.c : [];
  const lines = crateRows.map(row => {
    if (!Array.isArray(row)) return "";
    const idx = Number(row[0]);
    const meta = Number.isInteger(idx) && idx >= 0 && idx < legend.length ? legend[idx] : null;
    const crateClass = meta ? crateClassFromLegendRow(meta) : "";
    const name = crateDisplayNameByClass(crateClass) || meta?.n || shortBpName(meta?.bp || "") || "Cave Drop";
    const w = Number(row[1]);
    const suffix = Number.isFinite(w) ? " (" + fmt(w) + ")" : "";
    return `<div class="poi-tip-line">${escapeHtml(name + suffix)}</div>`;
  }).filter(Boolean).join("");
  return `<div class="poi-tip-block"><div class="poi-tip-title">Cave Drop</div>${lines || '<div class="poi-tip-line">No crates listed</div>'}</div>`;
}


function drawCaveCratePois(points) {
  if (!mapObj?.poiLayer || !Array.isArray(points)) return;
  if (!poiVisibility.caveCrates) return;
  // Use the same pie-chart markers as regular supply drops
  addSupplyCrateMarkers(points.filter(p => poiHasCaveCrate(p)), { layer: mapObj.poiLayer });
}

function drawOceanCratePois(points) {
  if (!mapObj?.poiLayer || !Array.isArray(points)) return;
  if (!poiVisibility.oceanCrates) return;
  addSupplyCrateMarkers(points.filter(p => poiHasOceanCrate(p)), { layer: mapObj.poiLayer });
}

function drawBeaverDamPois(points) {
  if (!mapObj?.poiLayer || !Array.isArray(points)) return;
  if (!poiVisibility.beaverDams) return;
  addSupplyCrateMarkers(points.filter(p => poiHasBeaverDam(p)), { layer: mapObj.poiLayer });
}

// Lost Colony drop drawers
function drawLcNormalCratePois(points) {
  if (!mapObj?.poiLayer || !Array.isArray(points) || !poiVisibility.lcNormalCrates) return;
  addSupplyCrateMarkers(points.filter(p => _poiMatchesCrateFn(p, isLcNormalCrate)), { layer: mapObj.poiLayer });
}
function drawLcCaveCratePois(points) {
  if (!mapObj?.poiLayer || !Array.isArray(points) || !poiVisibility.lcCaveCrates) return;
  addSupplyCrateMarkers(points.filter(p => _poiMatchesCrateFn(p, isLcCaveCrate)), { layer: mapObj.poiLayer });
}

// Aberration-specific drop drawers
function drawAbNormalCratePois(points) {
  if (!mapObj?.poiLayer || !Array.isArray(points) || !poiVisibility.abNormalCrates) return;
  addSupplyCrateMarkers(points.filter(p => poiHasAbNormalCrate(p)), { layer: mapObj.poiLayer });
}
function drawAbDungeonCratePois(points) {
  if (!mapObj?.poiLayer || !Array.isArray(points) || !poiVisibility.abDungeonCrates) return;
  addSupplyCrateMarkers(points.filter(p => poiHasAbDungeonCrate(p)), { layer: mapObj.poiLayer });
}
function drawAbSurfaceCratePois(points) {
  if (!mapObj?.poiLayer || !Array.isArray(points) || !poiVisibility.abSurfaceCrates) return;
  addSupplyCrateMarkers(points.filter(p => poiHasAbSurfaceCrate(p)), { layer: mapObj.poiLayer });
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


// Strip a difficulty/tier marker from a boss or boss-dino name, whether it's a
// trailing "(Gamma)" suffix ("Rockwell (Gamma)" -> "Rockwell") or a leading
// word ("Gamma King Titan" -> "King Titan").
function stripBossDifficulty(name){
  return String(name == null ? "" : name)
    .replace(/\s*\((?:Gamma|Beta|Alpha|Easy|Medium|Hard)\)\s*$/i, "")
    .replace(/^(?:Gamma|Beta|Alpha)\s+/i, "")
    .trim();
}

// Join a list of names naturally: ["A"] -> "A", ["A","B"] -> "A & B",
// ["A","B","C"] -> "A, B & C".
function joinNatural(arr){
  const a = (arr || []).filter(Boolean);
  if (a.length <= 1) return a[0] || "";
  if (a.length === 2) return `${a[0]} & ${a[1]}`;
  return `${a.slice(0, -1).join(", ")} & ${a[a.length - 1]}`;
}

// Build an enriched tooltip for a tribute terminal: its name, the bosses it can
// summon (from the terminal's `b` -> boss legend indices), and a short summary
// of craftable items (`i` -> item ids). Falls back to the plain label when the
// terminal carries no boss/item data.
function terminalTooltipHtml(p){
  const label = escapeHtml(p?.label || p?.type || "Terminal");
  const bosses = bossesForCurrentMap();

  const bossIdxs = Array.isArray(p?.b) ? p.b : [];
  const itemIds  = Array.isArray(p?.i) ? p.i : [];

  if (!bossIdxs.length && !itemIds.length) return label;

  let html = `<div class="term-tip"><div class="term-tip-title">${label}</div>`;

  if (bossIdxs.length){
    // Use the boss DINO names rather than the summon-item names — item names
    // are inconsistent across maps (e.g. "Center", "Aberration"), but the dino
    // is what the player actually fights. Strip difficulty suffixes and dedupe,
    // so e.g. the Center obelisk reads "Broodmother Lysrix & Megapithecus" and
    // the Aberration terminal reads "Rockwell".
    const seen = new Set();
    const dinoNames = [];
    for (const bi of bossIdxs){
      if (bi < 0 || bi >= bosses.length) continue;
      for (const d of (bosses[bi].dinos || [])){
        const baseName = stripBossDifficulty(d.name);
        if (baseName && !seen.has(baseName)){
          seen.add(baseName);
          dinoNames.push(baseName);
        }
      }
    }
    if (dinoNames.length){
      html += `<div class="term-tip-section"><span class="term-tip-head">Summons:</span> `
            + escapeHtml(joinNatural(dinoNames))
            + `</div>`;
    }
  }

  if (itemIds.length){
    // Separate boss summon portals (those referenced as a boss's summon item)
    // from other craftables (tribute/element items) for a cleaner summary.
    const summonItemIds = new Set(
      bosses.map(b => b.summon?.id).filter(id => id != null).map(Number)
    );
    const craftNames = itemIds
      .filter(id => !summonItemIds.has(Number(id)))
      .map(id => cleanBossText(itemDisplayNameById(id)))
      .filter(Boolean);
    if (craftNames.length){
      const shown = craftNames.slice(0, 6);
      const extra = craftNames.length - shown.length;
      html += `<div class="term-tip-section"><span class="term-tip-head">Crafts:</span> `
            + shown.map(n => escapeHtml(n)).join(", ")
            + (extra > 0 ? ` +${extra} more` : "")
            + `</div>`;
    }
  }

  html += `</div>`;
  return html;
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
    const isTerminalGroup = groupName === "tributeTerminals";
    const tooltipHtml =
      groupName === "supplyCrates"
        ? supplyCrateTooltipHtml(p)
        : isTerminalGroup
          ? terminalTooltipHtml(p)
          : (p.label || p.type || "POI");

    // Match the supply-crate tooltip behaviour: direction:"auto" lets Leaflet
    // open the tooltip toward whichever side has room (markers left of center
    // open rightward, away from the edge), and sticky+autoPan keep it visible.
    const tipOpts = isTerminalGroup
      ? { direction: "auto", sticky: true, offset: [0, -14], opacity: 0.97, className: "dark-tooltip term-tooltip", autoPan: true }
      : { direction: "auto", sticky: true, opacity: 0.97, className: "dark-tooltip", autoPan: true };

    // TEK terminals get the special icon
    if (type.includes("tek") || type.includes("titan")) {

      const icon = makeTerminalIcon(type);

      const marker = L.marker([y, x], { 
        icon,
        pane: "poiPane"
      })
        .addTo(mapObj.poiLayer)
        .bindTooltip(tooltipHtml, isTerminalGroup ? tipOpts : {
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
      .bindTooltip(tooltipHtml, tipOpts);
  }
}


/* ── Simple [x,y] array POI drawer ── */
function drawSimpleDotPois(points, visKey, color, label, outlineColor) {
  if (!mapObj?.poiLayer || !poiVisibility[visKey]) return;
  // Default outline is the standard near-black ring. A caller can pass a
  // custom outlineColor to distinguish a POI type while keeping the same dot
  // fill (e.g. hyper charge nodes share the charge-node green fill but get a
  // different ring). A custom ring is drawn slightly thicker so it reads.
  const ring = outlineColor || "#111";
  const ringWeight = outlineColor ? 2.5 : 1.5;
  for (const pt of (Array.isArray(points) ? points : [])) {
    const x = Number(pt?.[0] ?? pt?.x);
    const y = Number(pt?.[1] ?? pt?.y);
    if (![x, y].every(Number.isFinite)) continue;
    L.circleMarker([y, x], {
      radius: 5, color: ring, weight: ringWeight,
      fillColor: color, fillOpacity: 0.9, pane: "poiPane"
    }).addTo(mapObj.poiLayer).bindTooltip(escapeHtml(label), {
      direction: "auto", sticky: true, opacity: 0.97,
      className: "basic-tooltip", autoPan: true
    });
  }
}

function drawNestPois(points, visKey, color, label) {
  if (!mapObj?.poiLayer || !poiVisibility[visKey]) return;
  const size = 16;
  const icon = L.divIcon({
    className: `poi-nest-icon`,
    html: `<svg width="${size}" height="${size}" viewBox="-8 -8 16 16" aria-hidden="true">
      <ellipse cx="0" cy="2" rx="7" ry="4" fill="${color}" stroke="#111" stroke-width="1.5"/>
      <ellipse cx="0" cy="-2" rx="4" ry="3" fill="${color}" stroke="#111" stroke-width="1.2"/>
    </svg>`,
    iconSize: [size, size], iconAnchor: [size/2, size/2]
  });
  for (const pt of (Array.isArray(points) ? points : [])) {
    const x = Number(pt?.[0] ?? pt?.x);
    const y = Number(pt?.[1] ?? pt?.y);
    if (![x, y].every(Number.isFinite)) continue;
    L.marker([y, x], { icon, pane: "poiPane" })
      .addTo(mapObj.poiLayer)
      .bindTooltip(escapeHtml(label), {
        direction: "auto", sticky: true, opacity: 0.97,
        className: "basic-tooltip", autoPan: true
      });
  }
}

function drawTeleporterPois(teleporters) {
  if (!mapObj?.poiLayer || !poiVisibility.teleporters) return;
  const size = 18;
  const icon = L.divIcon({
    className: "poi-teleporter-icon",
    html: `<svg width="${size}" height="${size}" viewBox="-9 -9 18 18" aria-hidden="true">
      <polygon points="0,-8 8,4 -8,4" fill="#a78bfa" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/>
      <polygon points="0,8 8,-4 -8,-4" fill="#a78bfa" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`,
    iconSize: [size, size], iconAnchor: [size/2, size/2]
  });
  for (const tp of (Array.isArray(teleporters) ? teleporters : [])) {
    let x, y, label;
    if (Array.isArray(tp)) {
      if (tp.length >= 4) { x = tp[2]; y = tp[3]; label = `${tp[0]} ↔ ${tp[1]}`; }
      else if (tp.length >= 3) { x = tp[1]; y = tp[2]; label = String(tp[0]); }
      else continue;
    } else { x = tp?.x; y = tp?.y; label = tp?.label || "Teleporter"; }
    x = Number(x); y = Number(y);
    if (![x, y].every(Number.isFinite)) continue;
    L.marker([y, x], { icon, pane: "poiPane" })
      .addTo(mapObj.poiLayer)
      .bindTooltip(escapeHtml(String(label)), {
        direction: "auto", sticky: true, opacity: 0.97,
        className: "basic-tooltip", autoPan: true
      });
  }
}

/* ── Explorer Notes / Dossiers helpers ── */
function isDossierNote(name) {
  return String(name || "").toLowerCase().includes("dossier");
}

function noteTooltipHtml(note, { hideJump = false } = {}) {
  const [idx, name, ue_x, ue_y] = note;
  const gps = ueToGps(ue_x, ue_y);
  const gpsStr = gps ? `${gps.lat.toFixed(1)}, ${gps.lon.toFixed(1)}` : "N/A";
  const type = isDossierNote(name) ? "Dossier" : "Note";
  return `<div class="poi-tip-block">
    <div class="poi-tip-title">${escapeHtml(name)}</div>
    <div class="poi-tip-line">${type} #${idx}</div>
    <div class="poi-tip-line">GPS: ${escapeHtml(gpsStr)}</div>
    ${hideJump ? "" : `<div class="poi-tip-action note-view-jump" data-note-idx="${idx}">Open in Note View &#8594;</div>`}
  </div>`;
}

function drawExplorerNotePois(notes) {
  if (!mapObj?.poiLayer || !poiVisibility.explorerNotes) return;
  const size = 16;
  const icon = L.divIcon({
    className: "poi-note-icon",
    html: `<svg width="${size}" height="${size}" viewBox="-8 -8 16 16" aria-hidden="true">
      <rect x="-6" y="-7" width="12" height="14" rx="1.5" fill="#ffd54a" stroke="#111" stroke-width="1.5"/>
      <line x1="-3" y1="-3" x2="3" y2="-3" stroke="#111" stroke-width="1.2"/>
      <line x1="-3" y1="0" x2="3" y2="0" stroke="#111" stroke-width="1.2"/>
      <line x1="-3" y1="3" x2="1" y2="3" stroke="#111" stroke-width="1.2"/>
    </svg>`,
    iconSize: [size, size], iconAnchor: [size/2, size/2]
  });
  for (const note of notes) {
    if (!Array.isArray(note) || note.length < 4 || isDossierNote(note[1])) continue;
    const latlng = ueToLeaflet(note[2], note[3]);
    if (!latlng) continue;
    L.marker(latlng, { icon, pane: "poiPane" })
      .addTo(mapObj.poiLayer)
      .bindTooltip(noteTooltipHtml(note), {
        direction: "auto", sticky: false, offset: [0,-10],
        opacity: 0.97, className: "note-tooltip note-tooltip--interactive", autoPan: true,
        interactive: true
      });
  }
}

function drawDossierPois(notes) {
  if (!mapObj?.poiLayer || !poiVisibility.dinoDossiers) return;
  const size = 16;
  const icon = L.divIcon({
    className: "poi-dossier-icon",
    html: `<svg width="${size}" height="${size}" viewBox="-8 -8 16 16" aria-hidden="true">
      <rect x="-6" y="-7" width="12" height="14" rx="1.5" fill="#66ccff" stroke="#111" stroke-width="1.5"/>
      <path d="M -3 -3 Q 0 -6 3 -3 L 3 4 L -3 4 Z" fill="#111" opacity="0.3"/>
      <line x1="-3" y1="0" x2="3" y2="0" stroke="#111" stroke-width="1.2"/>
      <line x1="-3" y1="3" x2="1" y2="3" stroke="#111" stroke-width="1.2"/>
    </svg>`,
    iconSize: [size, size], iconAnchor: [size/2, size/2]
  });
  for (const note of notes) {
    if (!Array.isArray(note) || note.length < 4 || !isDossierNote(note[1])) continue;
    const latlng = ueToLeaflet(note[2], note[3]);
    if (!latlng) continue;
    L.marker(latlng, { icon, pane: "poiPane" })
      .addTo(mapObj.poiLayer)
      .bindTooltip(noteTooltipHtml(note), {
        direction: "auto", sticky: true, offset: [0,-10],
        opacity: 0.97, className: "note-tooltip", autoPan: true
      });
  }
}

function drawPois(){
  clearPois();

  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);
  if (!geom?.pois) return;

  const pois = geom.pois;

  drawPoiGroup(pois.tributeTerminals, "tributeTerminals");
  drawSupplyCratePois(pois.supplyCrates || []);
  if (isAbMap()) {
    drawAbNormalCratePois(pois.supplyCrates || []);
    drawAbDungeonCratePois(pois.supplyCrates || []);
    drawAbSurfaceCratePois(pois.supplyCrates || []);
  } else {
    drawCaveCratePois(pois.supplyCrates || []);
    drawOceanCratePois(pois.supplyCrates || []);
    drawBeaverDamPois(pois.supplyCrates || []);
  }
  drawArtifactCratePois(pois.supplyCrates || []);
  drawPlayerStarts(pois.playerStarts);
  drawExplorerNotePois(pois.explorerNotes || []);
  drawDossierPois(pois.explorerNotes || []);
  drawMissionPois(pois.missions || []);
  drawHordePois(pois.hordeEvents || []);
  drawPoiGroup(pois.cityTerminals, "cityTerminals");
  drawSimpleDotPois(pois.beacons || pois.borderBeacons, "beacons", "#ff8a3d", "Border Beacon");
  drawSimpleDotPois(pois.waterVeins,       "waterVeins",       "#5ab4ff", "Water Vein");
  drawSimpleDotPois(pois.oilVeins,         "oilVeins",         "#555",    "Oil Vein");
  drawSimpleDotPois(pois.gasVeins,         "gasVeins",         "#ff4dff", "Gas Vein");
  drawSimpleDotPois(pois.chargeNodes,      "chargeNodes",      "#00ff55", "Charge Node");
  drawSimpleDotPois(pois.hyperChargeNodes, "hyperChargeNodes", "#00ff55", "Hyper Charge Node", "#aa55ff");
  drawSimpleDotPois(pois.plantZ,           "plantZ",           "#00eeff", "Wild Plant Z");
  drawSimpleDotPois(pois.plantR,           "plantR",           "#ff6040", "Proto Plant R");
  drawNestPois(pois.wyvernNests,           "wyvernNests",      "#ff9933", "Wyvern Nest");
  drawNestPois(pois.iceWyvernNests,        "iceWyvernNests",   "#88eeff", "Ice Wyvern Nest");
  drawNestPois(pois.rockDrakeNests,        "rockDrakeNests",   "#00ffcc", "Rock Drake Nest");
  drawNestPois(pois.deinonychusNests,      "deinonychusNests", "#ff5050", "Deinonychus Nest");
  drawSimpleDotPois(pois.beachChests,      "beachChests",      "#f0c040", "Beach Crate");
  drawSimpleDotPois(pois.memorial,         "memorial",         "#f0f0f0", "Memorial");
  drawTeleporterPois(pois.teleporters);
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
