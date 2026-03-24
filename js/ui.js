

function updateDockToggles(){
  const dockEl = document.querySelector(".map-dock");
  if (!dockEl) return;

  dockEl.querySelectorAll("[data-toggle-panel]").forEach(btn => {
    const id = btn.getAttribute("data-toggle-panel");
    const on = isPanelVisible(id);
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function ensureModeMenu(){
  let menu = document.getElementById("modeMenu");
  if (menu) return menu;

  menu = document.createElement("div");
  menu.id = "modeMenu";
  menu.className = "mode-menu";
  menu.style.display = "none";

  document.body.appendChild(menu);

  document.addEventListener("pointerdown", (e) => {
    const btn = UI.modeToggle;
    if (!menu || menu.style.display === "none") return;

    if (menu.contains(e.target) || btn?.contains(e.target)) return;
    closeModeMenu();
  });

  window.addEventListener("resize", () => {
    if (menu.style.display !== "none") {
      positionModeMenu();
    }
  });

  return menu;
}

function positionModeMenu(){
  const menu = document.getElementById("modeMenu");
  const btn = UI.modeToggle;
  if (!menu || !btn) return;

  const r = btn.getBoundingClientRect();

  menu.style.position = "fixed";
  menu.style.left = `${Math.max(8, r.left)}px`;
  menu.style.top = `${r.bottom + 6}px`;
  menu.style.zIndex = "1200";
}

function renderModeMenu(){
  const menu = ensureModeMenu();

  menu.innerHTML = MODE_OPTIONS.map(opt => `
    <button
      type="button"
      class="mode-menu-item ${State.mode === opt.id ? "is-on" : ""}"
      data-mode-value="${escapeAttr(opt.id)}"
    >
      <span class="mode-menu-label">${escapeHtml(opt.label)}</span>
      <span class="mode-menu-check" aria-hidden="true">${State.mode === opt.id ? "✓" : ""}</span>
    </button>
  `).join("");

  menu.querySelectorAll("[data-mode-value]").forEach(btn => {
    btn.onclick = () => {
      const mode = btn.getAttribute("data-mode-value");
      closeModeMenu();
      setMode(mode);
    };
  });
}

function openModeMenu(){
  const menu = ensureModeMenu();
  renderModeMenu();
  positionModeMenu();
  menu.style.display = "";
}

function closeModeMenu(){
  const menu = document.getElementById("modeMenu");
  if (!menu) return;
  menu.style.display = "none";
}

function toggleModeMenu(){
  const menu = ensureModeMenu();
  if (menu.style.display === "none") openModeMenu();
  else closeModeMenu();
}


function setupUI(){

  /* SOURCE SELECT */

  UI.sourceSelect.innerHTML = "";

  for(const s of SOURCES){

    const o = document.createElement("option");

    o.value = s.id;
    o.textContent = s.label;

    UI.sourceSelect.appendChild(o);
  }

  UI.sourceSelect.value = UI.sourceSelect.options[0]?.value || "";

  UI.sourceSelect.onchange = async () => {
    await loadSelectedSource();
  };

  mountSourceDrillDropdown(
    UI.sourceSelect,
    UI.sourceFancy
  );
  applyEmbedRestrictions();

  UI.mapSelect.innerHTML="";

  for(const m of MAPS){

    const o=document.createElement("option");

    o.value=m.id;
    o.textContent=m.id;

    UI.mapSelect.appendChild(o);
  }

  UI.mapSelect.value=State.mapId;

  UI.mapSelect.onchange=async()=>{
    State.mapId=UI.mapSelect.value;
    await onMapChanged();
  };

  mountFancyDropdown(UI.mapSelect,UI.mapFancy,"Search maps...");

  syncModeButton();
  rebuildSelectionSelect();

  UI.modeToggle.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleModeMenu();
  };

  UI.controlsToggle.onclick = () => {
    const before = UI.topbar?.offsetHeight ?? 0;

    UI.topbar.classList.toggle("show-controls");

    requestAnimationFrame(() => {
      const after = UI.topbar?.offsetHeight ?? 0;
      nudgeMapForTopbarToggle(before, after);
    });
  };
}


function buildHordeGroups(point, legend){
  const rows = Array.isArray(point?.h) ? point.h : [];
  const grouped = new Map();

  for (const rawIdx of rows){
    const idx = Number(rawIdx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= legend.length) continue;

    const meta = legend[idx];
    if (!meta) continue;

    const name = String(meta.n || "Horde Event").trim() || "Horde Event";
    const diffLabel = hordeDifficultyLabel(meta.d);
    const typeLabel = hordeTypeLabel(meta.t);

    const key = `${name}::${diffLabel}`;

    if (!grouped.has(key)){
      grouped.set(key, {
        name,
        difficulty: diffLabel,
        type: typeLabel,
        bp: meta.bp || ""
      });
    }
  }

  return [...grouped.values()];
}


function buildMissionGroups(point, legend){
  const rows = Array.isArray(point?.m) ? point.m : [];
  const grouped = new Map();

  for (const row of rows){
    if (!Array.isArray(row) || !row.length) continue;

    const idx = Number(row[0]);
    const weight = row.length > 1 ? row[1] : null;

    if (!Number.isInteger(idx) || idx < 0 || idx >= legend.length) continue;

    const meta = legend[idx];
    if (!meta) continue;

    const groupName = String(meta.n || "Mission").trim() || "Mission";

    if (!grouped.has(groupName)){
      grouped.set(groupName, {
        name: groupName,
        bp: meta.bp || "",
        variants: []
      });
    }

    grouped.get(groupName).variants.push({
      bp: meta.bp || "",
      k: meta.k || "",
      d: meta.d || "",
      s: meta.s || "",
      w: weight
    });
  }

  return [...grouped.values()];
}


function fitOptionsForUI(){
  const isMobile = window.innerWidth <= 640;

  const topbar = UI.topbar || document.getElementById("topbar");
  const expanded = topbar?.classList.contains("show-controls");
  const topbarH = expanded ? (topbar?.offsetHeight ?? 0) : 0;

  const bottomSafe = isMobile ? 70 : 40;

  const padX = isMobile ? 6 : 20;
  const padTop = isMobile ? 6 : 10;
  const padBottom = isMobile ? Math.max(bottomSafe, 60) : 20;

  return {
    paddingTopLeft: [padX, padTop + topbarH],
    paddingBottomRight: [padX, padBottom]
  };
}


function buildSourceDrillTree() {
  const root = { label: "Sources", children: [] };

  const official = SOURCES.find(s => s.id === "official");
  if (official) {
    root.children.push({ label: official.name, value: official.id });
  }

  const modsFolder = { label: "Mods", children: [] };
  const modSources = SOURCES.filter(s => s.id !== "official");

  const groups = new Map();
  const loose = [];

  for (const s of modSources) {
    if (s.kind === "group") {
      const gname = String(s.group || "");

      if (!groups.has(gname)) {
        groups.set(gname, {
          label: gname,
          children: [],
          _groupOrder: Number.isFinite(s.groupOrder) ? s.groupOrder : 9999
        });
      }

      groups.get(gname).children.push({
        label: s.name,
        value: s.id,
        _order: -1
      });

      continue;
    }

    const leaf = {
      label: s.name,
      value: s.id,
      _order: Number.isFinite(s.order) ? s.order : 9999
    };

    if (s.group) {
      const gname = String(s.group);

      if (!groups.has(gname)) {
        groups.set(gname, {
          label: gname,
          children: [],
          _groupOrder: Number.isFinite(s.groupOrder) ? s.groupOrder : 9999
        });
      }

      groups.get(gname).children.push(leaf);
    } else {
      loose.push(leaf);
    }
  }
  
  for (const g of groups.values()) {
    g.children.sort((a, b) =>
      (a._order - b._order) || a.label.localeCompare(b.label)
    );
  }

  loose.sort((a, b) =>
    (a._order - b._order) || a.label.localeCompare(b.label)
  );

  const groupFolders = Array.from(groups.values())
    .sort((a, b) =>
      (a._groupOrder - b._groupOrder) || a.label.localeCompare(b.label)
    )
    .map(g => ({
      label: g.label,
      children: g.children.map(({ _order, ...x }) => x)
    }));

  const looseClean = loose.map(({ _order, ...x }) => x);

  modsFolder.children.push(...groupFolders, ...looseClean);
  root.children.push(modsFolder);

  return root;
}


async function buildMergedGroupSource(src){
  const mods = [];

  for (const modId of src.members || []){
    const modSrc = SOURCES.find(s => s.id === modId);
    if (!modSrc?.file) continue;
    mods.push(await loadJSON(modSrc.file));
  }

  let mergedSpawn = {
    mapLegend: { ...(Global.baseSpawn?.mapLegend || {}) },
    entryMaps: { ...(Global.baseSpawn?.entryMaps || {}) },
    entries: { ...(Global.baseSpawn?.entries || {}) },
    maps: { ...(Global.baseSpawn?.maps || {}) },
    dinos: { ...(Global.baseSpawn?.dinos || {}) },
    worldReplacements: { ...(Global.baseSpawn?.worldReplacements || {}) }
  };

  let mergedDinos = {
    dinos: { ...(Global.baseDinos?.dinos || {}) }
  };

  let modOnlyDinos = {};

  for (const mod of mods){
    mergedSpawn = {
      mapLegend: {
        ...(mergedSpawn.mapLegend || {}),
        ...(mod.mapLegend || {})
      },
      entryMaps: {
        ...(mergedSpawn.entryMaps || {}),
        ...(mod.entryMaps || {})
      },
      entries: mergeEntryTables(
        mergedSpawn.entries || {},
        mod.entries || {}
      ),
      maps: {
        ...(mergedSpawn.maps || {}),
        ...(mod.maps || {})
      },
      dinos: {
        ...(mergedSpawn.dinos || {}),
        ...(mod.spawnDinos || {})
      },
      worldReplacements: mergeWorldReplacementTables(
        mergedSpawn.worldReplacements || {},
        mod.worldReplacements || {}
      )
    };

    mergedDinos = {
      dinos: {
        ...(mergedDinos.dinos || {}),
        ...(mod.dinos || {})
      }
    };

    modOnlyDinos = {
      ...modOnlyDinos,
      ...(mod.dinos || {})
    };
  }

  return {
    spawn: mergedSpawn,
    dinos: mergedDinos,
    modOnlyDinos
  };
}


function mountSourceDrillDropdown(native, host){
  native.style.display = "none";
  host.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "dd";

  const btn = document.createElement("button");
  btn.className = "dd-btn";

  const label = document.createElement("div");
  label.className = "dd-label";

  const caret = document.createElement("div");
  caret.className = "dd-caret";
  caret.textContent = "▾";

  btn.append(label, caret);

  const panel = document.createElement("div");
  panel.className = "dd-panel";

  const crumb = document.createElement("div");
  crumb.className = "dd-crumb";

  const list = document.createElement("div");
  list.className = "dd-list";

  panel.append(crumb, list);
  wrap.append(btn, panel);
  host.appendChild(wrap);

  const root = buildSourceDrillTree();
  const stack = [root];
  let lastPath = []; // folder labels only, like ["Mods", "My Group"]

  function currentNode(){
    return stack[stack.length - 1];
  }

  function syncLabel(){
    label.textContent = native.selectedOptions?.[0]?.textContent || "(Select)";
  }
  
  function rebuildStackFromPath(){
    stack.length = 0;
    stack.push(root);

    let node = root;

    for (const label of lastPath){
      const next = (node.children || []).find(child =>
        Array.isArray(child.children) && child.label === label
      );

      if (!next) break;

      stack.push(next);
      node = next;
    }
  }

  function renderLevel(){
    const node = currentNode();
    list.innerHTML = "";
    crumb.innerHTML = "";

    if (stack.length > 1) {
      const back = document.createElement("button");
      back.type = "button";
      back.className = "dd-back";
      back.textContent = "‹ Back";
      back.onclick = () => {
        stack.pop();
        lastPath = stack.slice(1).map(n => n.label);
        renderLevel();
      };
      crumb.appendChild(back);
    }

    for (const item of node.children || []) {
      const row = document.createElement("div");
      row.className = "dd-item";

      const isFolder = Array.isArray(item.children);

      row.textContent = isFolder ? `▸ ${item.label}` : item.label;

      row.onclick = () => {
        if (isFolder) {
          stack.push(item);
          lastPath = stack.slice(1).map(n => n.label);
          renderLevel();
          return;
        }

        native.value = item.value;
        native.dispatchEvent(new Event("change"));
        close();
      };

      list.appendChild(row);
    }
  }

  function open(){
    rebuildStackFromPath();
    renderLevel();
    wrap.classList.add("open");
  }

  function close(){
    wrap.classList.remove("open");
  }

  btn.onclick = () => {
    wrap.classList.contains("open") ? close() : open();
  };

  document.addEventListener("pointerdown", e => {
    if (!wrap.contains(e.target)) close();
  });

  native.addEventListener("change", syncLabel);
  syncLabel();
}


function mountFancyDropdown(native,host,placeholder){

  native.style.display="none";
  host.innerHTML="";

  const wrap=document.createElement("div");
  wrap.className="dd";

  const btn=document.createElement("button");
  btn.className="dd-btn";

  const label=document.createElement("div");
  label.className="dd-label";

  const caret=document.createElement("div");
  caret.className="dd-caret";
  caret.textContent="▾";

  btn.append(label,caret);

  const panel=document.createElement("div");
  panel.className="dd-panel";

  const search=document.createElement("input");
  search.className="dd-search";
  search.placeholder=placeholder;

  const list=document.createElement("div");
  list.className="dd-list";

  panel.append(search,list);
  wrap.append(btn,panel);
  host.appendChild(wrap);

  function rebuild(){

    list.innerHTML="";

    for(const o of native.options){

      const row=document.createElement("div");

      row.className="dd-item";
      row.textContent=o.textContent;
      row.dataset.search=normSearch(o.textContent);

      row.onclick=()=>{
        native.value=o.value;
        native.dispatchEvent(new Event("change"));
        close();
      };

      list.appendChild(row);
    }
  }

  function sync(){
    label.textContent=native.selectedOptions?.[0]?.textContent||"(Select)";
  }

  function open(){
    wrap.classList.add("open");
    search.focus();
  }

  function close(){
    wrap.classList.remove("open");
  }

  btn.onclick=()=>{
    wrap.classList.contains("open")?close():open();
  };

  search.oninput=()=>{
    const q=normSearch(search.value);

    list.querySelectorAll(".dd-item").forEach(el=>{
      el.style.display=el.dataset.search.includes(q)?"":"none";
    });
  };

  document.addEventListener("pointerdown",e=>{
    if(!wrap.contains(e.target)) close();
  });

  native.addEventListener("change",sync);

  rebuild();
  sync();
}


function applyEmbedRestrictions(){
  if (!EMBED_MODE) return;

  if (EMBED_HIDE_TOPBAR && UI.topbar) {
    UI.topbar.style.display = "none";
  }

  const allowedSources = allowedSourceIdsForEmbed();
  if (allowedSources) {
    [...UI.sourceSelect.options].forEach(opt => {
      opt.hidden = !allowedSources.has(opt.value);
    });

    if (!allowedSources.has(UI.sourceSelect.value)) {
      const firstAllowed = [...allowedSources][0];
      if (firstAllowed) UI.sourceSelect.value = firstAllowed;
    }

    if (EMBED_SOURCE || EMBED_HIDE_SOURCE) {
      UI.sourceSelect.disabled = true;
      if (UI.sourceFancy) UI.sourceFancy.style.display = "none";
      if (UI.sourceSelect.parentElement && !EMBED_HIDE_SOURCE) {
        UI.sourceSelect.style.display = "";
      }
    }
  }

  const allowedMaps = allowedMapsForEmbed();
  if (allowedMaps) {
    [...UI.mapSelect.options].forEach(opt => {
      opt.hidden = !allowedMaps.has(opt.value);
    });

    if (!allowedMaps.has(UI.mapSelect.value)) {
      const firstAllowed = [...allowedMaps][0];
      if (firstAllowed) {
        UI.mapSelect.value = firstAllowed;
        State.mapId = firstAllowed;
      }
    }

    if (EMBED_MAP || EMBED_HIDE_MAP) {
      UI.mapSelect.disabled = true;
      if (UI.mapFancy) UI.mapFancy.style.display = "none";
      if (UI.mapSelect.parentElement && !EMBED_HIDE_MAP) {
        UI.mapSelect.style.display = "";
      }
    }
  }

  if (EMBED_MODE_LOCK) {
    const validModes = new Set(["dino", "entry"]);
    if (validModes.has(EMBED_MODE_LOCK)) {
      State.mode = EMBED_MODE_LOCK;
      syncModeButton();
    }
  }

  if (EMBED_MODE_LOCK || EMBED_HIDE_MODE) {
    if (UI.modeToggle) UI.modeToggle.disabled = true;
    if (EMBED_HIDE_MODE && UI.modeToggle) UI.modeToggle.style.display = "none";
    closeModeMenu();
  }
}


function allowedSourceIdsForEmbed(){
  if (!EMBED_MODE) return null;

  const allowed = new Set();

  if (EMBED_SOURCE) {
    const src = sourceById(EMBED_SOURCE);
    if (src) {
      allowed.add(src.id);

      if (src.kind === "group") {
        for (const mid of (src.members || [])) allowed.add(mid);
      }
    }
  } else if (EMBED_GROUP) {
    const groupName = EMBED_GROUP.trim().toLowerCase();

    for (const s of SOURCES){
      if (String(s.group || "").trim().toLowerCase() === groupName) {
        allowed.add(s.id);
      }
    }

    const groupSource = SOURCES.find(s =>
      s.kind === "group" &&
      String(s.group || "").trim().toLowerCase() === groupName
    );

    if (groupSource) allowed.add(groupSource.id);
  } else {
    return null;
  }

  if (EMBED_ALLOW_OFFICIAL) {
    allowed.add("official");
  }

  return allowed;
}


function allowedMapsForEmbed(){
  if (!EMBED_MODE || !EMBED_MAP) return null;

  const allowed = new Set();

  for (const raw of EMBED_MAP.split(",")) {
    const mapId = normalizeMapId(raw);
    if (mapId) allowed.add(mapId);
  }

  return allowed.size ? allowed : null;
}


function normalizeMapId(raw){
  const s = String(raw || "").trim().toLowerCase();
  const hit = MAPS.find(m => m.id.toLowerCase() === s);
  return hit ? hit.id : "";
}


function sourceById(id){
  return SOURCES.find(s => s.id === id) || null;
}


function ensureDockControl(map){
  if (dockControl) return;

  const Dock = L.Control.extend({
    options: { position: "bottomleft" },

    onAdd() {
      const container = L.DomUtil.create("div", "leaflet-control leaflet-bar map-dock");
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      return container;
    }
  });

  dockControl = new Dock();
  map.addControl(dockControl);
}


function renderDock(){
  const container = document.querySelector(".map-dock");
  if (!container) return;

  const mapMeta = dockState.mapMeta;
  const cfg = dockState.cfg || {};
  const isAstraeos = !!(mapMeta?.backgrounds?.length);

  container.innerHTML = "";
  container.style.display = "flex";
  container.style.overflow = "hidden";

  const mkBtn = ({ title, icon, onClick, togglePanelId = null, extraClass = "" }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `dock-btn ${extraClass}`.trim();
    btn.title = title;
    btn.setAttribute("aria-label", title);

    if (togglePanelId) {
      btn.setAttribute("data-toggle-panel", togglePanelId);
      btn.setAttribute("aria-pressed", "false");
    }

    btn.innerHTML = icon;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick?.(btn);
      if (document.activeElement?.blur) document.activeElement.blur();
    });

    container.appendChild(btn);
    return btn;
  };

  // Astraeos background swap
  if (isAstraeos) {
    const bgs = mapMeta.backgrounds;
    const def = bgs.find(x => x.id === mapMeta.defaultBg) || bgs[0];
    const idx = Math.max(0, bgs.indexOf(def));

    if (mapObj?.overlay) {
      mapObj.overlay.setUrl(bgs[idx].url);
    }

    const bgBtn = mkBtn({
      title: `Background: ${def.label || def.id || (idx + 1)} (tap to cycle)`,
      icon: `
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M12 3 2 8l10 5 10-5-10-5Zm0 7L2 15l10 5 10-5-10-5Z"
                fill="none" stroke="currentColor" stroke-width="2"
                stroke-linejoin="round"/>
        </svg>
      `,
      onClick: (btn) => setMapBackgroundFromDock(btn)
    });

    bgBtn.dataset.bgIndex = String(idx);
  } else {
    if (cfg?.image && mapObj?.overlay) {
      mapObj.overlay.setUrl(cfg.image);
    }
  }

  // Dino info panel toggle
  mkBtn({
    title: "Toggle Dino Info",
    icon: `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M4 6h16v12H4z" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M7 9h10M7 12h10M7 15h6" stroke="currentColor" stroke-width="2"/>
      </svg>
    `,
    togglePanelId: "dinoInfoPanel",
    onClick: () => togglePanel("dinoInfoPanel")
  });
  mkBtn({
    title: "Toggle Draw Style",
    icon: `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M7 21c2.5 0 4-1.5 4-4 0-1.1-.9-2-2-2H7.5C6.1 15 5 16.1 5 17.5V18c0 1.7.3 3 2 3Z"
              fill="currentColor" opacity=".9"/>
        <path d="M20.7 4.3a1 1 0 0 0-1.4 0l-9.7 9.7c.8.3 1.4 1 1.7 1.8l9.4-9.5a1 1 0 0 0 0-1.4Z"
              fill="currentColor"/>
      </svg>
    `,
    togglePanelId: "drawStylePanel",
    onClick: () => toggleDrawStylePanel()
  });

  // POI toggle
  mkBtn({
    title: "Toggle markers menu",
    icon: `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z"
              fill="none" stroke="currentColor" stroke-width="2"/>
        <circle cx="12" cy="10" r="2.5" fill="currentColor"/>
      </svg>
    `,
    togglePanelId: "poiPanel",
    onClick: () => togglePoiPanel()
  });

  // Rarity legend toggle
  mkBtn({
    title: showRarityLegend ? "Hide rarity legend" : "Show rarity legend",
    icon: `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M12 10v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <circle cx="12" cy="7.5" r="1.2" fill="currentColor"/>
      </svg>
    `,
    onClick: (btn) => {
      setLegendOpen(!showRarityLegend);
      btn.title = showRarityLegend ? "Hide rarity legend" : "Show rarity legend";
      btn.classList.toggle("is-on", showRarityLegend);
    },
    extraClass: showRarityLegend ? "is-on" : ""
  });
  mkBtn({
    title: "Toggle map entries browser",
    icon: `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M5 6h14M5 12h14M5 18h14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"/>
      </svg>
    `,
    togglePanelId: "mapEntriesPanel",
    onClick: () => toggleMapEntriesPanel()
  });

  updateDockToggles();
}


function setLegendOpen(open){
  showRarityLegend = !!open;

  const el = document.getElementById("rarityLegend");
  if (!el) return;

  el.style.display = showRarityLegend ? "" : "none";
}


function initRarityLegend(){

  const legend = document.getElementById("rarityLegend");
  if (!legend) return;

  legend.querySelectorAll(".rl-sq").forEach(el => {

    const rarity = el.dataset.r;
    const color = rarityToColor(rarity);

    el.style.background = color;
  });

}


function syncModeClass() {
  document.body.dataset.mode = State.mode;
}


function syncInfoPanelState() {
  const panel = document.getElementById("dinoInfoPanel");
  if (!panel) return;
  
  panel.dataset.mode = State.mode;
  
  if (State.mode === "dino") {
    panel.dataset.tab = infoPanelState.dinoTab;
  } else if (State.mode === "entry") {
    panel.dataset.tab = infoPanelState.entryTab;
  } else if (State.mode === "crate") {
    panel.dataset.tab = infoPanelState.crateTab;
  } else if (State.mode === "item") {
    panel.dataset.tab = infoPanelState.itemTab;
  } else {
    panel.dataset.tab = "";
  }
}

function rebuildSelectionSelect() {
  let placeholder = "(Select)";
  let options = [];
  
  if (State.mode === "dino") {
    placeholder = "(Select a Dino)";
    options = State.names.map(v => ({ value: v, label: v }));
  } else if (State.mode === "entry") {
    placeholder = "(Select a Spawn Entry)";
    options = State.entryList.map(v => ({ value: v, label: v }));
  } else if (State.mode === "crate") {
    placeholder = "(Select a Loot Crate)";
    options = State.crateOptions.map(v => ({ value: v.value, label: v.label }));
  } else if (State.mode === "item") {
    placeholder = "(Select an Item)";
    options = State.itemNames.map(v => ({ value: v, label: v }));
  }
  
  UI.dinoSelect.innerHTML = "";
  
  const emptyOpt = document.createElement("option");
  emptyOpt.value = "";
  emptyOpt.textContent = placeholder;
  UI.dinoSelect.appendChild(emptyOpt);
  
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    UI.dinoSelect.appendChild(o);
  }
  
  if (!options.some(opt => opt.value === State.selection)) {
    State.selection = "";
  }
  
  UI.dinoSelect.value = State.selection;
  
  UI.dinoSelect.onchange = () => {
    State.selection = UI.dinoSelect.value || "";
    render();
  };
  
  mountFancyDropdown(
    UI.dinoSelect,
    UI.dinoFancy,
    placeholder.replace(/[()]/g, "")
  );
}