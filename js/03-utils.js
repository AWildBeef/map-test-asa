/* Split from app_embed.js lines 252-721 */

/* ============================================================
   UI
============================================================ */

const UI = {

  sourceSelect: document.getElementById("sourceSelect"),
  sourceFancy: document.getElementById("sourceSelectFancy"),
  
  mapSelect:document.getElementById("mapSelect"),
  mapFancy:document.getElementById("mapSelectFancy"),

  dinoSelect:document.getElementById("dinoSelect"),
  dinoFancy:document.getElementById("dinoSelectFancy"),

  modeToggle:document.getElementById("modeToggle"),
  controlsToggle:document.getElementById("controlsToggle"),
  topbar:document.getElementById("topbar")
};

function anyPoisVisible(){
  return Object.values(poiVisibility).some(Boolean);
}

function syncModeButton(){
  if (!UI.modeToggle) return;
  UI.modeToggle.textContent = State.mode === "dino" ? "Dino View" : "Spawn View";
}

function entryVisibilityKey(dinoKey, idx){
  return `${State.mapId}::${State.mode}::${dinoKey}::${idx}`;
}

function isEntryVisible(dinoKey, idx){
  const key = entryVisibilityKey(dinoKey, idx);
  return entryVisibility[key] ?? true;
}

/* ============================================================
   UTILS
============================================================ */

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

function refitMapForUI(){
  if (!mapObj?.map || !mapObj?.bounds) return;

  mapObj.map.invalidateSize();
  map.fitBounds(bounds, {
    paddingTopLeft: [6, 6],
    paddingBottomRight: [6, 70]
  });
}

function mergeEntryTables(baseEntries, modEntries){
  const out = { ...baseEntries };

  for (const [entryName, modEntry] of Object.entries(modEntries || {})){
    if (!out[entryName]){
      out[entryName] = {
        bp: modEntry?.bp || "",
        d: [...(modEntry?.d || [])]
      };
      continue;
    }

    const baseRows = Array.isArray(out[entryName].d) ? out[entryName].d : [];
    const modRows = Array.isArray(modEntry?.d) ? modEntry.d : [];

    out[entryName] = {
      bp: out[entryName].bp || modEntry?.bp || "",
      d: [...baseRows, ...modRows]
    };
  }

  return out;
}

function mergeWorldReplacementTables(baseWR, modWR){
  const out = {};

  const keys = new Set([
    ...Object.keys(baseWR || {}),
    ...Object.keys(modWR || {})
  ]);

  for (const k of keys){
    out[k] = [
      ...(Array.isArray(baseWR?.[k]) ? baseWR[k] : []),
      ...(Array.isArray(modWR?.[k]) ? modWR[k] : [])
    ];
  }

  return out;
}

function activeSourceIsOfficial(){
  return !Global.modMeta;
}

function modBlueprintSet(){
  if (!Global.modMeta?.dinos) return new Set();
  return new Set(Object.keys(Global.modMeta.dinos));
}

function normSearch(s){
  return String(s||"").toLowerCase().replace(/[\s_-]/g,"");
}

async function loadJSON(path){
  const url = `${path}?v=${ASSET_VER}`;

  if (jsonCache[url]) return jsonCache[url];

  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to load ${path}`);

  const data = await r.json();
  jsonCache[url] = data;
  return data;
}

function bpClass(bp){
  return String(bp||"").split(".").pop();
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

function preloadImage(url){
  if (!url) return;

  const img = new Image();
  img.decoding = "async";
  img.loading = "eager";
  img.src = url;
}

async function preloadAllMapImages(){
  for (const mapMeta of MAPS){
    try{
      const geom = await loadJSON(`${PATHS.geomDir}/${mapMeta.geomShort}_geom.json`);
      const img = geom.image || `${PATHS.mapsDir}/${mapMeta.image}`;

      preloadImage(img);

      if (Array.isArray(mapMeta.backgrounds)){
        for (const bg of mapMeta.backgrounds){
          preloadImage(bg.url);
        }
      }
    }catch(err){
      console.warn("Image preload failed for", mapMeta.id, err);
    }
  }
}
