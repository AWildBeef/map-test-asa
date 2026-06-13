

/* ============================================================
   MOD LOOT MERGE
   Merges mod.loot (items + crates) into Global.loot/Global.items.
   Mod item IDs are local (1, 2, 3…) — we remap them to new global
   IDs beyond the current maximum, then wire up reverse-lookup (r)
   entries so the existing crate/item view machinery works unchanged.
============================================================ */

function resetLootToBase(){
  if (!Global.baseLoot || !Global.baseItems) return;

  // Deep-clone the base data so mods can mutate freely without corrupting it
  Global.loot = JSON.parse(JSON.stringify(Global.baseLoot));
  Global.items = JSON.parse(JSON.stringify(Global.baseItems));

  // Rebuild indexes from the clean base
  buildLootIndexes();
}

function mergeLootFromMod(mod){
  if (!mod?.loot) return;
  if (!Global.loot || !Global.items) return;

  const modItems  = mod.loot.items  || {};
  const modCrates = mod.loot.crates || {};

  const modItemDefs   = modItems.i || {};   // localId -> {p, c, n}
  const modPathDefs   = modItems.p || {};   // localId -> pathPrefix
  const modCrateDefs  = modCrates.c || {};  // crateClass -> crate meta
  const modItemRefs   = modCrates.r || {};  // localId -> [[crateClass, setIdx, entryIdx]]

  if (!Object.keys(modItemDefs).length && !Object.keys(modCrateDefs).length) return;

  // --- 1. Assign new global item IDs ---
  const existingIds = Object.keys(Global.items.i || {}).map(Number);
  let nextId = existingIds.length ? Math.max(...existingIds) + 1 : 1;

  // Map: local path prefix id -> global path prefix string
  const existingPaths = new Map(
    Object.entries(Global.items.p || {}).map(([id, path]) => [path, Number(id)])
  );
  const pathIdMap = {};       // modLocalPathId -> globalPathId
  let nextPathId = Object.keys(Global.items.p || {}).length
    ? Math.max(...Object.keys(Global.items.p).map(Number)) + 1
    : 1;

  for (const [localPathId, pathStr] of Object.entries(modPathDefs)){
    if (existingPaths.has(pathStr)){
      pathIdMap[localPathId] = existingPaths.get(pathStr);
    } else {
      pathIdMap[localPathId] = nextPathId;
      Global.items.p[String(nextPathId)] = pathStr;
      existingPaths.set(pathStr, nextPathId);
      nextPathId++;
    }
  }

  // Map: localItemId -> globalItemId
  const localToGlobalId = {};

  for (const [localId, itemDef] of Object.entries(modItemDefs)){
    const globalId = nextId++;
    localToGlobalId[localId] = globalId;

    Global.items.i[String(globalId)] = {
      ...itemDef,
      p: pathIdMap[String(itemDef.p)] ?? itemDef.p,
      _mod: true   // flag so we can identify mod items
    };
  }

  // --- 2. Merge crate definitions ---
  // For each crate class in the mod: if it already exists in global,
  // append the mod's loot sets (tagged with _mod:true).
  // If it's new, add it to c{} and ci[].

  const ci = Global.loot.ci;

  for (const [crateClass, modCrateMeta] of Object.entries(modCrateDefs)){
    // Remap item IDs inside the crate's loot sets from local -> global
    const remappedSets = (modCrateMeta.s || []).map(set => ({
      ...set,
      _mod: true,
      e: (set.e || []).map(entry => ({
        ...entry,
        i: (entry.i || []).map(localId => localToGlobalId[String(localId)] ?? localId)
      }))
    }));

    if (Global.loot.c[crateClass]){
      // Crate exists — append mod sets
      Global.loot.c[crateClass] = {
        ...Global.loot.c[crateClass],
        s: [...(Global.loot.c[crateClass].s || []), ...remappedSets]
      };
    } else {
      // New crate — add to c{} and ci[]
      Global.loot.c[crateClass] = { ...modCrateMeta, s: remappedSets };
      ci.push(crateClass);
      // Update the class->id map
      Global.crateClassToId.set(crateClass, ci.length - 1);
    }
  }

  // --- 3. Build reverse-lookup (r) entries for mod items ---
  // Global r format: itemId -> [[crateId, setIdx, entryIdx], ...]
  // where crateId is the index in ci[]

  const crateClassToIdx = new Map(ci.map((cls, i) => [cls, i]));

  for (const [localId, refs] of Object.entries(modItemRefs)){
    const globalId = localToGlobalId[localId];
    if (globalId == null) continue;

    const rEntries = [];
    for (const ref of (Array.isArray(refs) ? refs : [])){
      if (!Array.isArray(ref) || !ref.length) continue;
      const crateClass = ref[0];
      const setIdx     = ref[1] ?? 0;
      const entryIdx   = ref[2] ?? 0;
      const crateIdx   = crateClassToIdx.get(crateClass);
      if (crateIdx == null) continue;
      rEntries.push([crateIdx, setIdx, entryIdx]);
    }

    if (rEntries.length){
      const key = String(globalId);
      Global.loot.r[key] = [...(Global.loot.r[key] || []), ...rEntries];
    }
  }
}

async function loadSelectedSource() {
  const srcId = UI.sourceSelect.value;
  const src = SOURCES.find(s => s.id === srcId);
  if (!src) return;

  // Always reset loot to base before applying any mod loot
  resetLootToBase();

  if (src.kind === "official") {

    Global.modMeta = null;
    Global.spawn = Global.baseSpawn;
    Global.dinos = Global.baseDinos;

  }
  else if (src.kind === "group") {

    const merged = await buildMergedGroupSource(src);

    Global.modMeta = {
      modId: src.id,
      modName: src.name,
      isGroup: true,
      members: src.members || [],
      dinos: merged.modOnlyDinos || {}
    };

    Global.spawn = merged.spawn;
    Global.dinos = merged.dinos;

    // Merge loot from each mod in the group
    for (const modId of src.members || []) {
      const modSrc = SOURCES.find(s => s.id === modId);
      if (!modSrc?.file) continue;
      const mod = await loadJSON(modSrc.file);
      mergeLootFromMod(mod);
    }

  }
  else {

    const mod = await loadJSON(src.file);

    const modId = String(mod.modId || "");
    const baseIndex = Global.baseDinos?.dinoIndex || [];
    const decoded = decodeModSource(mod, baseIndex);

    // modMeta carries mod metadata plus the mod's dinos keyed by BP (decoded),
    // so modBlueprintSet() — which keys off Object.keys(modMeta.dinos) — yields
    // bps that match the bp-keyed dino collection used everywhere else.
    Global.modMeta = { ...mod, dinos: decoded.dinos };
    const taggedModDinos = decoded.dinos;
    const modSpawnEntries = decoded.entries;
    const modWorldRepl = decoded.worldReplacements;

    Global.spawn = {
      entryIndex: Global.baseSpawn?.entryIndex || [],
      mapLegend: {
        ...(Global.baseSpawn?.mapLegend || {}),
        ...(mod.mapLegend || {})
      },
      entryMaps: {
        ...(Global.baseSpawn?.entryMaps || {}),
        ...(mod.entryMaps || {})
      },
      entries: mergeEntryTables(
        Global.baseSpawn?.entries || {},
        modSpawnEntries
      ),
      maps: {
        ...(Global.baseSpawn?.maps || {}),
        ...(mod.maps || {})
      },
      dinos: {
        ...(Global.baseSpawn?.dinos || {}),
        ...(mod.spawnDinos || {})
      },
      worldReplacements: mergeWorldReplacementTables(
        Global.baseSpawn?.worldReplacements || {},
        modWorldRepl
      )
    };

    Global.dinos = {
      // Base dinos stay index-keyed; mod dinos are bp-keyed. The layer keys
      // both by bp, so the differing key styles coexist without collision.
      dinos: {
        ...(Global.baseDinos?.dinos || {}),
        ...taggedModDinos
      },
      dinoIndex: baseIndex,
      c: Global.baseDinos?.c || {},
      cs: Global.baseDinos?.cs || {},
      modCsByMod: (modId && mod.cs) ? { [modId]: mod.cs } : {}
    };

    mergeLootFromMod(mod);

  }

  // Rebuild the dino index compatibility maps for whatever source is now active.
  rebuildDinoIndex();

  rebuildMapIndices();
  rebuildLootIndices();
  syncSelectionForMode(State.mode);
  rebuildSelectionSelect();
  applyEmbedRestrictions();
  renderDock();
  render();
  if (isPanelVisible("mapEntriesPanel")) {
    renderMapEntriesPanel();
  }
}


function buildWorldRuleIndex(rules){
  const exact = new Map();
  const ancestor = [];

  for (const r of rules || []){
    const fromBp = normalizeBp(r?.from);
    if (!fromBp) continue;

    // Skip event-specific rules (FearEvolved, WinterWonderland, etc.)
    // They would overwrite the base non-event rule in the exact map,
    // causing wrong outputs during normal (non-event) gameplay display.
    // A missing event, "None", "none", or "-" all mean non-event.
    const event = r?.event;
    if (event && event !== "None" && event !== "none" && event !== "-") continue;

    if (r?.exact){
      exact.set(fromBp, r);
    } else {
      ancestor.push(r);
    }
  }

  return { exact, ancestor };
}


// Cached world-rule index. Keyed to the map it was built for, so a map change
// auto-invalidates it even if invalidateWorldRuleCache() isn't called on that
// path. Rebuilt at most once per map (then reused across all dino selections).
let _worldRuleIndexCache = null;
let _worldRuleIndexCacheKey = null;

function invalidateWorldRuleCache(){
  _worldRuleIndexCache = null;
  _worldRuleIndexCacheKey = null;
  _ancestorDistCache.clear();
  if (typeof invalidateBossCache === "function") invalidateBossCache();
}

function worldRuleIndexForCurrentMap(){
  // Cache key combines map id and source identity. If either changed since the
  // cache was built, rebuild. This makes stale-rule bugs impossible regardless
  // of whether an explicit invalidation happened.
  const key = String(State.mapId) + "\x00" + (Global.modMeta?.modId || "official");
  if (_worldRuleIndexCache && _worldRuleIndexCacheKey === key){
    return _worldRuleIndexCache;
  }
  const rules = worldRulesForCurrentMap();
  _worldRuleIndexCache = buildWorldRuleIndex(rules);
  _worldRuleIndexCacheKey = key;
  return _worldRuleIndexCache;
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


function playerStartColorByRegionIndex(regionName, allRegionNames){
  const names = [...new Set(allRegionNames || [])].sort((a, b) => a.localeCompare(b));
  const idx = Math.max(0, names.indexOf(regionName));

  const hue = Math.round((idx * 137.508) % 360);
  return `hsl(${hue}, 72%, 52%)`;
}


function entryVisibilityKey(dinoKey, idx){
  return `${State.mapId}::${State.mode}::${dinoKey}::${idx}`;
}


function isEntryVisible(dinoKey, idx){
  const key = entryVisibilityKey(dinoKey, idx);
  return entryVisibility[key] ?? true;
}


function mergeEntryTables(baseEntries, modEntries){
  // Base entries are id-keyed ({ n: className, d }); mod entries are
  // class-keyed. A mod that injects rows into a vanilla entry names it by
  // class, so map class -> base id(s) and append there. Anything else is
  // added under its class key, which the spawn-entry resolvers accept.
  const out = {};
  for (const [k, v] of Object.entries(baseEntries || {})){
    out[k] = { ...v, d: [...(v?.d || [])] };
  }

  const idsByClass = new Map();
  for (const [k, v] of Object.entries(out)){
    const cls = v?.n || k;
    if (!idsByClass.has(cls)) idsByClass.set(cls, []);
    idsByClass.get(cls).push(k);
  }

  for (const [entryName, modEntry] of Object.entries(modEntries || {})){
    const modRows = Array.isArray(modEntry?.d) ? modEntry.d : [];
    const targets = idsByClass.get(entryName);

    if (!targets?.length){
      out[entryName] = {
        n: entryName,
        bp: modEntry?.bp || "",
        d: [...modRows]
      };
      continue;
    }

    for (const id of targets){
      out[id] = {
        ...out[id],
        bp: out[id].bp || modEntry?.bp || "",
        d: [...out[id].d, ...modRows]
      };
    }
  }

  return out;
}


// ── Spawn entry resolution ──────────────────────────────────────────────
// spawn_global entries are keyed by entry id (an index into entryIndex,
// which holds the full blueprint paths). Class names are NOT globally
// unique (e.g. DinoSpawnEntries_Cats_C exists on both Astraeos and
// Valguero with different bps) but ARE unique within a map, so
// rebuildMapIndices records a per-map class -> key map. These helpers
// accept a class name, a raw id key, or a legacy class key (mod data).

function spawnEntryIdForClass(entryName){
  return State.entryIdByClass?.get?.(entryName) ?? null;
}

function spawnEntryByName(entryName){
  const ents = Global.spawn?.entries || {};
  const id = spawnEntryIdForClass(entryName);
  if (id != null && ents[id]) return ents[id];
  return ents[entryName] || null;
}

function spawnRowsForEntry(entryName){
  return spawnEntryByName(entryName)?.d || [];
}

function spawnBpForEntry(entryName){
  const id = spawnEntryIdForClass(entryName);
  if (id != null){
    const viaIndex = Global.spawn?.entryIndex?.[Number(id)];
    if (viaIndex) return viaIndex;
  }
  return spawnEntryByName(entryName)?.bp || "";
}

function entryMapCodesForClass(entryName){
  const em = Global.spawn?.entryMaps || {};
  const id = spawnEntryIdForClass(entryName);
  const codes = (id != null ? em[id] : undefined) ?? em[entryName];
  return Array.isArray(codes) ? codes : [];
}

function entryTotalExpected(entryName){

  const rows = spawnRowsForEntry(entryName);

  let sum=0;

  for(const r of rows){

    const gw=Number(r?.[1]||0);
    const sm=Number(r?.[2]||1);

    sum+=gw*sm;
  }

  return sum;
}


function entryRarityForBps(entryName, bpSet){

  const rows = spawnRowsForEntry(entryName);
  if (!rows.length) return 0;

  let totalExpected = 0;
  let matchedRarity = 0;

  for (const r of rows){
    const rawBp = normalizeBp(bpForDinoRef(r?.[0]));
    if (!rawBp) continue;

    const gw = Number(r?.[1] || 0);
    const sm = Number(r?.[2] || 1);
    const lim = Number(r?.[3] || 1);

    const baseExpected = gw;
    if (baseExpected <= 0) continue;

    const outs = worldOutputsForBp(rawBp);

    for (const out of outs){
      const finalBp = normalizeBp(out?.[0]);
      const prob = Number(out?.[1] || 0);
      if (!finalBp || prob <= 0) continue;

      const expected = baseExpected * prob;
      totalExpected += expected;

      if (bpSet.has(finalBp)){
        // same formula you were already using:
        // rarity += (expected / total) * lim
        // but total is not known until after full pass, so accumulate numerator first
        matchedRarity += expected * lim;
      }
    }
  }

  if (totalExpected <= 0) return 0;

  return matchedRarity / totalExpected;
}


function entryManagerMinStats(entryName){

  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);
  const entry = geom?.entries?.[entryName];

  if (!entry) return { best:0, total:0 };

  const rawMins = [];
  let total = 0;

  for (const mgr of Object.values(entry.m || {})) {

    const md = Number(mgr?.md || 0);
    if (md <= 0) continue;

    const boxCount = Array.isArray(mgr?.b) ? mgr.b.length : 0;
    const pointCount = Array.isArray(mgr?.p) ? mgr.p.length : 0;
    const nodeCount = boxCount + pointCount;

    // keep raw manager min for manager-vs-best downshift
    rawMins.push(md);

    // global downshift uses shared min across nodes
    if (nodeCount > 0) {
      total += (md / nodeCount);
    } else {
      total += md;
    }
  }

  const best = rawMins.length ? Math.max(...rawMins) : 0;

  return {
    best,
    total
  };
}


function entryRarityForEntry(entryName){

  const rows = spawnRowsForEntry(entryName);
  if (!rows.length) return 0;

  let totalExpected = 0;
  let rarity = 0;

  for (const r of rows){
    const rawBp = normalizeBp(bpForDinoRef(r?.[0]));
    if (!rawBp) continue;

    const gw = Number(r?.[1] || 0);
    const sm = Number(r?.[2] || 1);
    const lim = Number(r?.[3] || 1);

    const baseExpected = gw * sm;
    if (baseExpected <= 0) continue;

    const outs = worldOutputsForBp(rawBp);

    for (const out of outs){
      const finalBp = normalizeBp(out?.[0]);
      const prob = Number(out?.[1] || 0);
      if (!finalBp || prob <= 0) continue;

      const expected = baseExpected * prob;
      totalExpected += expected;
      rarity += expected * lim;
    }
  }

  if (totalExpected <= 0) return 0;

  return rarity / totalExpected;
}


function mergeWorldReplacementTables(baseWR, modWR){
  // Build a global mod exact index to detect when mod handles a split internally.
  // A mod's 1-to-1 Remap_NPC rule + a multi-output exact rule on the target
  // means the base ancestor rule is redundant (mod already encodes the distribution).
  const modExactIdx = new Map();
  for (const rules of Object.values(modWR || {})) {
    for (const r of (Array.isArray(rules) ? rules : [])) {
      const ev = r?.event;
      if (ev && ev !== "None" && ev !== "none" && ev !== "-" && ev !== "") continue;
      if (!r?.exact) continue;
      const from = normalizeBp(r?.from);
      if (!from) continue;
      const existing = modExactIdx.get(from);
      if (!existing || (r.outs?.length || 0) > (existing.outs?.length || 0)) {
        modExactIdx.set(from, r);
      }
    }
  }

  // Find 1-to-1 exact remaps (Remap_NPC style) where the target has its own
  // multi-output non-event exact rule — these base ancestor rules are dropped.
  const dropFromBase = new Set();
  for (const rules of Object.values(modWR || {})) {
    for (const r of (Array.isArray(rules) ? rules : [])) {
      const ev = r?.event;
      if (ev && ev !== "None" && ev !== "none" && ev !== "-" && ev !== "") continue;
      if (!r?.exact || (r.outs?.length || 0) !== 1) continue;
      const from = normalizeBp(r?.from);
      const to = normalizeBp(r?.outs?.[0]?.[0]);
      if (!from || !to) continue;
      const targetRule = modExactIdx.get(to);
      if (targetRule && (targetRule.outs?.length || 0) > 1) {
        dropFromBase.add(from);
      }
    }
  }

  const keys = new Set([
    ...Object.keys(baseWR || {}),
    ...Object.keys(modWR || {})
  ]);

  const out = {};
  for (const k of keys){
    const baseRules = Array.isArray(baseWR?.[k]) ? baseWR[k] : [];
    const modRules  = Array.isArray(modWR?.[k])  ? modWR[k]  : [];

    // Drop base ancestor rules that the mod supersedes
    const filteredBase = baseRules.filter(r => {
      if (r?.exact) return true; // keep base exact rules always
      const from = normalizeBp(r?.from);
      return !from || !dropFromBase.has(from);
    });

    out[k] = [...filteredBase, ...modRules];
  }

  return out;
}


async function buildSources(){
  const registry = await loadJSON("mods_registry.json");

  const mods = (registry.mods || []).map(m => ({
    id: String(m.id),
    name: m.name,
    label: m.name,
    file: `data/mods/${m.id}.json`,
    group: m.group || "",
    author: m.author || "",
    order: Number.isFinite(m.order) ? m.order : 9999,
    groupOrder: Number.isFinite(m.groupOrder) ? m.groupOrder : 9999,
    kind: "mod"
  }));

  const groupMap = new Map();

  for (const m of mods){
    if (!m.group) continue;
    if (!groupMap.has(m.group)) groupMap.set(m.group, []);
    groupMap.get(m.group).push(m);
  }

  const groupSources = [...groupMap.entries()].map(([group, members]) => ({
    id: `group:${group}`,
    name: `All ${group}`,
    label: `All ${group}`,
    group,
    members: members.map(m => m.id),
    kind: "group",
    order: -1,
    groupOrder: members[0]?.groupOrder ?? 9999
  }));

  mods.sort((a,b)=>
    (a.groupOrder - b.groupOrder) ||
    String(a.group || "").localeCompare(String(b.group || "")) ||
    (a.order - b.order) ||
    a.name.localeCompare(b.name)
  );

  return [
    {
      id:"official",
      name:"Official",
      label:"Official",
      spawn: PATHS.spawnGlobal,
      dinos: PATHS.dinoGlobal,
      order: 0,
      kind: "official"
    },
    ...groupSources,
    ...mods
  ];
}

function dinoNamesForEntryGlobal(entryName){
  const rows = spawnRowsForEntry(entryName);
  const names = new Set();

  const restrictToMod = !activeSourceIsOfficial();
  const allowedModBps = restrictToMod ? modBlueprintSet() : null;

  for (const r of rows){
    const rawBp = normalizeBp(bpForDinoRef(r?.[0]));
    if (!rawBp) continue;

    const outs = worldOutputsForBp(rawBp);

    for (const out of outs){
      const finalBp = normalizeBp(out?.[0]);
      const prob = Number(out?.[1] || 0);

      if (!finalBp || prob <= 0) continue;
      if (restrictToMod && !allowedModBps.has(finalBp)) continue;

      const d = getDinoObjByBp(finalBp);
      if (!d) continue;

      const labels = labelsForDinoObj(d);
      const name = labels?.[0] || bpClass(finalBp) || finalBp;
      if (name) names.add(name);
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}


// Decode an entire mod's dino/spawn/world data from its index space into the
// shared bp space. Returns { dinos (bp-keyed), entries, worldReplacements }.
function decodeModSource(mod, baseIndex){
  const modId = String(mod.modId || "");
  const modIndex = Array.isArray(mod.dinoIndex) ? mod.dinoIndex : [];

  const dinos = {};
  for (const [key, dino] of Object.entries(mod.dinos || {})){
    if (!dino || typeof dino !== "object") continue;
    const bp = /^-?\d+$/.test(key)
      ? decodeModDinoRef(Number(key), modIndex, baseIndex)
      : key;
    if (!bp) continue;
    const resolved = { ...dino, _modId: modId };
    if (dino.p != null){
      resolved.p = decodeModDinoRef(dino.p, modIndex, baseIndex) || dino.p;
    }
    dinos[bp] = resolved;
  }

  const entries = {};
  for (const [ename, entry] of Object.entries(mod.entries || {})){
    if (!entry || !Array.isArray(entry.d)){ entries[ename] = entry; continue; }
    entries[ename] = {
      ...entry,
      d: entry.d.map(r => Array.isArray(r)
        ? [decodeModDinoRef(r[0], modIndex, baseIndex) || r[0], ...r.slice(1)]
        : r)
    };
  }

  const worldReplacements = {};
  for (const [scope, rules] of Object.entries(mod.worldReplacements || {})){
    worldReplacements[scope] = Array.isArray(rules) ? rules.map(rule => {
      if (!rule || typeof rule !== "object") return rule;
      const out = { ...rule, from: decodeModDinoRef(rule.from, modIndex, baseIndex) || rule.from };
      if (Array.isArray(rule.outs)){
        out.outs = rule.outs.map(o => Array.isArray(o)
          ? [decodeModDinoRef(o[0], modIndex, baseIndex) || o[0], o[1]] : o);
      }
      return out;
    }) : rules;
  }

  return { dinos, entries, worldReplacements };
}

// Decode a dino reference using a specific mod's index plus the base index.
// In mod files: ref >= 0 -> that mod's own dinoIndex[ref];
//               ref < 0  -> a VANILLA dino at baseIndex[-ref - 1].
// Returns a bp string ("" if unresolvable).
function decodeModDinoRef(ref, modIndex, baseIndex){
  if (ref == null) return "";
  if (typeof ref === "string" && !/^-?\d+$/.test(ref)) return ref; // already a bp
  const n = Number(ref);
  if (!Number.isFinite(n)) return "";
  if (n < 0){
    const vi = -n - 1;
    return (baseIndex && baseIndex[vi]) || "";
  }
  return (modIndex && modIndex[n]) || "";
}

// ---------------------------------------------------------------------------
// Dino index compatibility layer
//
// The base dinos section is keyed by a numeric dino index, and `dinoIndex` is
// an array mapping index -> bp. Parent (`p`) and spawn/boss references are
// also given as indices. Mod dinos, however, are still keyed by bp. To let the
// rest of the app keep working in terms of bp, we build lookup maps once per
// source load:
//   _dinoIdxToBp : index -> bp           (from Global.dinos.dinoIndex)
//   _dinoBpToObj : bp    -> dino object  (covers both index- and bp-keyed)
//   _dinoBpToIdx : bp    -> index
// Anything that needs to resolve an index (boss.d, parent p, spawn refs) goes
// through bpForDinoRef(); object lookup goes through getDinoObjByBp().
// ---------------------------------------------------------------------------
let _dinoIdxToBp = [];
let _dinoBpToObj = new Map();
let _dinoBpToIdx = new Map();

function rebuildDinoIndex(){
  _dinoIdxToBp = Array.isArray(Global.dinos?.dinoIndex) ? Global.dinos.dinoIndex : [];
  _dinoBpToObj = new Map();
  _dinoBpToIdx = new Map();

  // Map index -> bp both ways.
  _dinoIdxToBp.forEach((bp, i) => {
    if (bp){
      _dinoBpToIdx.set(bp, i);
      _dinoBpToIdx.set(bpClass(bp), i);
    }
  });

  const dinos = Global.dinos?.dinos || {};
  for (const [key, obj] of Object.entries(dinos)){
    // key is either a numeric index (base) or a bp string (mod).
    let bp = null;
    if (/^-?\d+$/.test(key)){
      bp = _dinoIdxToBp[Number(key)] || null;
    } else {
      bp = key; // mod dino, already bp-keyed
    }
    if (!bp) continue;
    _dinoBpToObj.set(bp, obj);
    _dinoBpToObj.set(bpClass(bp), obj);
  }
}

// Resolve a dino reference (bp string OR numeric index) to a bp string.
function bpForDinoRef(ref){
  if (ref == null) return "";
  if (typeof ref === "number" || /^-?\d+$/.test(String(ref))){
    return _dinoIdxToBp[Number(ref)] || "";
  }
  return String(ref);
}

function getDinoObjByBp(bp){
  if (bp == null) return null;

  // Numeric ref -> resolve through the index.
  if (typeof bp === "number" || /^-?\d+$/.test(String(bp))){
    const resolved = _dinoIdxToBp[Number(bp)];
    if (resolved && _dinoBpToObj.has(resolved)) return _dinoBpToObj.get(resolved);
  }

  // Direct bp (or class) hit via the prebuilt map.
  if (_dinoBpToObj.has(bp)) return _dinoBpToObj.get(bp);
  const cls = bpClass(bp);
  if (_dinoBpToObj.has(cls)) return _dinoBpToObj.get(cls);

  // Fallback: linear scan of the raw section (covers anything missed).
  const dinos = Global.dinos?.dinos || {};
  if (dinos[bp]) return dinos[bp];
  for (const [k, v] of Object.entries(dinos)){
    const kbp = /^-?\d+$/.test(k) ? (_dinoIdxToBp[Number(k)] || "") : k;
    if (kbp && bpClass(kbp) === cls) return v;
  }
  return null;
}


function normalizeBp(bp){
  return String(bp || "").trim();
}


function getParentBp(bp){
  const d = getDinoObjByBp(bp);
  // Parent `p` is a dino index in base data, or a bp string in mod data.
  return normalizeBp(bpForDinoRef(d?.p));
}


const _ancestorDistCache = new Map();

function ancestorDistance(childBp, ancestorBp){
  childBp = normalizeBp(childBp);
  ancestorBp = normalizeBp(ancestorBp);

  if (!childBp || !ancestorBp) return null;
  if (childBp === ancestorBp) return 0;

  const cacheKey = childBp + "\x00" + ancestorBp;
  if (_ancestorDistCache.has(cacheKey)) return _ancestorDistCache.get(cacheKey);

  let cur = childBp;
  let dist = 0;
  const seen = new Set();

  while (cur && !seen.has(cur) && dist < 200){
    seen.add(cur);
    cur = getParentBp(cur);
    dist += 1;
    if (cur === ancestorBp){
      _ancestorDistCache.set(cacheKey, dist);
      return dist;
    }
  }

  _ancestorDistCache.set(cacheKey, null);
  return null;
}


function combineOutputWeights(rows){
  const m = new Map();

  for (const [bp, prob] of rows || []) {
    const key = normalizeBp(bp);
    const p = Number(prob || 0);
    if (!key || p <= 0) continue;

    m.set(key, (m.get(key) || 0) + p);
  }

  return [...m.entries()];
}


function worldOutputsForBp(bp, _debug = false){
  bp = normalizeBp(bp);
  if (!bp) return [[bp, 1]];

  const { exact, ancestor } = worldRuleIndexForCurrentMap();

  // Resolve a BP through the world replacement chain.
  // Order mirrors Ark's execution:
  //   1. Ancestor (base WorldReplacements) fires first if present
  //   2. Remap_NPC (1-to-1 exact) applies to each ancestor output inline
  //   3. If no ancestor, exact rule fires (LeedsReplacements, WormReplacements, etc.)
  // from_exact=true: this BP came from an exact rule output — skip ancestor matching.
  function resolveOne(curBp, seen, callerBp, fromExact, depth){
    curBp = normalizeBp(curBp);
    if (!curBp) return [];
    const tag = _debug ? curBp.split("/").pop() : "";

    if (seen.has(curBp)){
      const r = curBp === callerBp ? [[curBp, 1]] : [];
      if (_debug) console.log("  ".repeat(depth) + `SEEN ${tag} -> ${r.length ? "pass" : "DROP"}`);
      return r;
    }
    const nextSeen = new Set(seen);
    nextSeen.add(curBp);

    // Step 1: ancestor rules fire first
    let bestRule = null, bestDist = null;
    if (!fromExact){
      for (const r of ancestor){
        const fromBp = normalizeBp(r?.from);
        if (!fromBp) continue;
        const dist = ancestorDistance(curBp, fromBp);
        if (dist == null) continue;
        if (bestRule === null || dist < bestDist){ bestRule = r; bestDist = dist; }
      }
    }

    if (bestRule){
      if (_debug) console.log("  ".repeat(depth) + `ANC ${tag} via ${bestRule.from.split("/").pop()} dist=${bestDist}`);
      const outs = Array.isArray(bestRule.outs) && bestRule.outs.length ? bestRule.outs : [[curBp, 1]];
      let final = [];
      for (const o of outs){
        const nb = normalizeBp(o?.[0]), np = Number(o?.[1] || 0);
        if (!nb || np <= 0) continue;

        // Step 2: apply 1-to-1 Remap_NPC inline if one exists for this output
        const ex = exact.get(nb);
        if (ex && ex.outs?.length === 1){
          const remapped = normalizeBp(ex.outs[0]?.[0]);
          if (_debug) console.log("  ".repeat(depth) + `  remap ${nb.split("/").pop()} -> ${remapped.split("/").pop()}`);
          // Recurse on remapped BP; allow exact rule (like LeedsReplacements) to fire
          for (const [rbp, rprob] of resolveOne(remapped, nextSeen, remapped, true, depth + 1)){
            final.push([rbp, np * rprob]);
          }
        } else {
          // Multi-output or no exact remap — recurse with from_exact=true (no more ancestor)
          for (const [rbp, rprob] of resolveOne(nb, nextSeen, curBp, true, depth + 1)){
            final.push([rbp, np * rprob]);
          }
        }
      }
      return final.length ? combineOutputWeights(final) : [[curBp, 1]];
    }

    // Step 3: no ancestor — try exact rule (LeedsReplacements, WormReplacements, Remap_NPC)
    const exactRule = exact.get(curBp);
    if (exactRule){
      if (_debug) console.log("  ".repeat(depth) + `EXACT ${tag}`);
      const outs = Array.isArray(exactRule.outs) && exactRule.outs.length ? exactRule.outs : [[curBp, 1]];
      let final = [];
      for (const o of outs){
        const nb = normalizeBp(o?.[0]), np = Number(o?.[1] || 0);
        if (!nb || np <= 0) continue;
        if (_debug) console.log("  ".repeat(depth) + `  -> ${nb.split("/").pop()} (${np.toFixed(3)})`);
        for (const [rbp, rprob] of resolveOne(nb, nextSeen, curBp, true, depth + 1)){
          final.push([rbp, np * rprob]);
        }
      }
      return final.length ? combineOutputWeights(final) : [[curBp, 1]];
    }

    if (fromExact){
      if (_debug) console.log("  ".repeat(depth) + `fromExact passthrough ${tag}`);
      return [[curBp, 1]];
    }

    if (_debug) console.log("  ".repeat(depth) + `NO RULE ${tag}`);
    return [[curBp, 1]];
  }

  return resolveOne(bp, new Set(), null, false, 0);
}

function finalRarityForManager(entryName,meta,score){

  const baseLabel = rarityFromWeight(score);

  const {best,total} = entryManagerMinStats(entryName);

  const globalSteps = downshiftStepsForTotalMin(total);

  const pct = best>0 ? (meta.md || best)/best : 1;

  const managerSteps = downshiftStepsForMinPct(pct);

  return downgradeRarity(baseLabel,globalSteps+managerSteps);
}


function selectionListForMode(mode) {
  if (mode === "dino")  return State.names;
  if (mode === "entry") return State.entryList;
  if (mode === "crate") return State.crateNames;
  if (mode === "item")  return State.itemNames;
  if (mode === "boss")  return State.bossNames;
  if (mode === "note")  return []; // note view uses its own panel
  return [];
}


function syncSelectionForMode(mode){
  const list = selectionListForMode(mode);
  const saved = State.selections[mode] || "";

  if (saved && list.includes(saved)) {
    State.selection = saved;
  } else {
    State.selection = "";
  }
}


function itemCrateVisibilityKey(itemName, crateId){
  return `${State.mapId}::item::${itemName}::crate::${crateId}`;
}


function isItemCrateVisible(itemName, crateId){
  const key = itemCrateVisibilityKey(itemName, crateId);
  return entryVisibility[key] ?? true;
}


function isBlueprintFromActiveMod(bp){
  if (activeSourceIsOfficial()) return true;

  const allowed = modBlueprintSet();
  return allowed.has(bp);
}


function filterSourcesForEmbed(allSources){
  if (!EMBED_MODE) return allSources;
  if (!EMBED_SOURCE && !EMBED_GROUP) return allSources;

  if (EMBED_SOURCE){
    const src = allSources.find(s => s.id === EMBED_SOURCE);
    if (!src) return [];

    const allowed = new Set([src.id]);

    if (src.kind === "group") {
      for (const mid of (src.members || [])) allowed.add(mid);
    }

    if (EMBED_ALLOW_OFFICIAL) {
      allowed.add("official");
    }

    return allSources.filter(s => allowed.has(s.id));
  }

  if (EMBED_GROUP){
    const groupName = EMBED_GROUP.trim().toLowerCase();

    const allowed = new Set();

    for (const s of allSources){
      if (String(s.group || "").trim().toLowerCase() === groupName) {
        allowed.add(s.id);
      }
    }

    const groupSource = allSources.find(s =>
      s.kind === "group" &&
      String(s.group || "").trim().toLowerCase() === groupName
    );

    if (groupSource) {
      allowed.add(groupSource.id);
    }

    if (EMBED_ALLOW_OFFICIAL) {
      allowed.add("official");
    }

    return allSources.filter(s => allowed.has(s.id));
  }

  return allSources;
}


function extractLevel(cls){
  const s = String(cls || "");
  const m = s.match(/Level[_ ]?(\d+)/i);
  return m ? Number(m[1]) : null;
}


function extractTier(cls){
  const s = String(cls || "");
  const m = s.match(/Tier[_ ]?(\d+)/i);
  return m ? Number(m[1]) : null;
}


function surfaceColorFromLevel(level){
  const n = Number(level);
  if (!Number.isFinite(n)) return "Supply";

  if (n <= 03) return "White";
  if (n <= 15) return "Green";
  if (n <= 25) return "Blue";
  if (n <= 35) return "Purple";
  if (n <= 45) return "Yellow";
  if (n <= 60) return "Red";
  return "Cyan";
}


function surfaceDropName(cls){
  const s = String(cls || "");
  const level = extractLevel(s);
  const isRinged = /double|ring/i.test(s);
  const color = surfaceColorFromLevel(level);
  return `${color} Supply Crate${isRinged ? " - Ringed" : ""}`;
}


function caveColorFromTier(tier){
  const n = Number(tier);
  if (n === 1) return "Green";
  if (n === 2) return "Blue";
  if (n === 3) return "Yellow";
  if (n === 4) return "Red";
  return null;
}


function caveDropName(cls){
  const s = String(cls || "");
  const tier = extractTier(s);
  const color = caveColorFromTier(tier);

  if (/swamp/i.test(s)) {
    return color ? `${color} Swamp Cave Crate` : "Swamp Cave Crate";
  }

  return color ? `${color} Cave Crate` : "Cave Crate";
}


function iceCaveDropName(cls){
  const s = String(cls || "");
  const tier = extractTier(s);
  const color = caveColorFromTier(tier);
  return color ? `${color} Ice Cave Crate` : "Ice Cave Crate";
}


function orbitalDisplayName(cls){
  const s = String(cls || "");
  if (/legendary/i.test(s)) return "Legendary Orbital Supply Drop";
  if (/alpha|hard/i.test(s)) return "Alpha Orbital Supply Drop";
  if (/beta|medium/i.test(s)) return "Beta Orbital Supply Drop";
  if (/gamma|easy/i.test(s)) return "Gamma Orbital Supply Drop";
  return "Orbital Supply Drop";
}


function friendlyCrateNameFromClass(crateClass){
  return crateDisplayNameByClass(crateClass);
}

function lootSetClassById(setId){
  const arr = lootData().si || [];
  return arr[Number(setId)] || "";
}


function lootSetMetaFromRef(ref){
  if (ref == null || ref === "") return null;

  // numeric indexed ref
  if (Number.isInteger(ref)) {
    const cls = lootSetClassById(ref);
    return cls ? (lootData().s?.[cls] || null) : null;
  }

  // numeric string ref
  if (typeof ref === "string" && /^\d+$/.test(ref)) {
    const cls = lootSetClassById(Number(ref));
    return cls ? (lootData().s?.[cls] || null) : null;
  }

  // class string ref
  if (typeof ref === "string") {
    return lootData().s?.[ref] || null;
  }

  return null;
}


function lootSetNameFromRow(row, fallback = "Set"){
  const meta = lootSetMetaFromRef(row?.o);
  return meta?.n || row?.n || fallback;
}


function lootSetEntriesFromRow(row){
  const inlineEntries = Array.isArray(row?.e) ? row.e : [];
  const meta = lootSetMetaFromRef(row?.o);
  const overrideEntries = Array.isArray(meta?.e) ? meta.e : [];

  return {
    inlineEntries,
    overrideEntries,
    allEntries: [...inlineEntries, ...overrideEntries],
    setMeta: meta
  };
}


function fmtRange(a, b, empty = "--"){
  const fa = fmt(a);
  const fb = fmt(b);

  if (!fa && !fb) return empty;
  if (fa && fb) return `${fa} - ${fb}`;
  return fa || fb || empty;
}


function yesNo(v){
  return isTrue01(v) ? "Yes" : "No";
}


function pct(v){
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return `${fmt(n * 100)}%`;
}


function missionMetaByClass(missionClass){
  return lootData().m?.[missionClass] || null;
}


function missionRewardItemIds(missionClass){
  const m = missionMetaByClass(missionClass);
  if (!m) return [];

  const out = [];

  for (const iid of (Array.isArray(m.ri) ? m.ri : [])){
    if (Number.isInteger(iid)) out.push(iid);
  }

  const sig = Array.isArray(m.sig) ? m.sig : [];
  if (Number.isInteger(sig[1])) out.push(sig[1]);

  for (const iid of (Array.isArray(m.cos) ? m.cos : [])){
    if (Number.isInteger(iid)) out.push(iid);
  }

  return [...new Set(out)];
}


function missionLootItemIds(missionClass){
  const m = missionMetaByClass(missionClass);
  if (!m) return [];

  const out = [];

  for (const structClass of (Array.isArray(m.ls) ? m.ls : [])){
    const ls = lootData().ls?.[structClass];
    if (!ls) continue;

    for (const setRow of (Array.isArray(ls.s) ? ls.s : [])){
      for (const entry of (Array.isArray(setRow?.e) ? setRow.e : [])){
        for (const iid of (Array.isArray(entry?.i) ? entry.i : [])){
          if (Number.isInteger(iid)) out.push(iid);
        }
      }
    }
  }

  return [...new Set(out)];
}


function missionAllItemIds(missionClass){
  return [...new Set([
    ...missionRewardItemIds(missionClass),
    ...missionLootItemIds(missionClass)
  ])];
}


function missionItemSummary(missionClass){
  const seen = new Map();

  for (const itemId of missionAllItemIds(missionClass)){
    if (!seen.has(itemId)){
      seen.set(itemId, {
        itemId,
        name: itemDisplayNameById(itemId),
        bp: itemBlueprintById(itemId)
      });
    }
  }

  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}


function itemMissionRefsForItemId(itemId){
  const rows = itemReverseRows(itemId);
  const out = [];

  for (const r of rows){
    if (!Array.isArray(r) || !r.length) continue;
    if (r[0] !== "m") continue;

    const missionClass = typeof r[1] === "number"
      ? lootData().mi?.[r[1]]
      : r[1];

    if (!missionClass) continue;

    out.push(missionClass);
  }

  return [...new Set(out)];
}


function missionDiffLabelFromClass(cls){
  const s = String(cls || "");
  if (s.includes("_Alpha_") || s.endsWith("_Alpha_C")) return "Alpha";
  if (s.includes("_Beta_") || s.endsWith("_Beta_C")) return "Beta";
  return "Gamma";
}


function missionClassesUsedOnCurrentMap(){
  if (State.mapId !== "Lost Colony") return new Set();

  const geom = currentGeom();
  const legend = Array.isArray(geom?.missionLegend) ? geom.missionLegend : [];
  const points = Array.isArray(geom?.pois?.missions) ? geom.pois.missions : [];

  const out = new Set();

  for (const p of points){
    for (const row of (Array.isArray(p?.m) ? p.m : [])){
      if (!Array.isArray(row) || !row.length) continue;

      const idx = Number(row[0]);
      if (!Number.isInteger(idx) || idx < 0 || idx >= legend.length) continue;

      const meta = legend[idx];
      const bp = normalizeBp(meta?.bp);
      const cls = bpClass(bp);

      if (cls && lootData().m?.[cls]){
        out.add(cls);
      }
    }
  }

  return out;
}


function missionPointHasClass(point, missionClass){
  const geom = currentGeom();
  const legend = Array.isArray(geom?.missionLegend) ? geom.missionLegend : [];

  for (const row of (Array.isArray(point?.m) ? point.m : [])){
    if (!Array.isArray(row) || !row.length) continue;

    const idx = Number(row[0]);
    if (!Number.isInteger(idx) || idx < 0 || idx >= legend.length) continue;

    const meta = legend[idx];
    const bp = normalizeBp(meta?.bp);
    const cls = bpClass(bp);

    if (cls === missionClass) return true;
  }

  return false;
}


function missionLootDisplayName(missionClass){
  const m = lootData().m?.[missionClass];
  if (!m) return missionClass;

  const diff = missionDiffLabelFromClass(missionClass);
  return `${m.n || missionClass} (${diff})`;
}


function lootStructureItemSummary(structClass){
  const meta = lootData().ls?.[structClass];
  if (!meta) return [];

  const seen = new Map();

  for (const row of (meta.s || [])){
    for (const entry of (row?.e || [])){
      for (const itemId of (entry?.i || [])){
        if (!seen.has(itemId)){
          seen.set(itemId, {
            itemId,
            name: itemDisplayNameById(itemId),
            bp: itemBlueprintById(itemId),
            hits: 0
          });
        }
        seen.get(itemId).hits += 1;
      }
    }
  }

  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}


function crateClassFromBp(bp){
  const s = String(bp || "").trim();
  if (!s) return "";

  const right = s.split(".").pop() || "";
  return right;
}


function buildLootIndexes(){
  Global.crateClassToId = new Map();
  Global.setClassToId = new Map();

  const loot = Global.loot || {};

  const crateIndex = Array.isArray(loot.ci) ? loot.ci : [];
  const setIndex = Array.isArray(loot.si) ? loot.si : [];

  crateIndex.forEach((cls, idx) => {
    Global.crateClassToId.set(String(cls), idx);
  });

  setIndex.forEach((cls, idx) => {
    Global.setClassToId.set(String(cls), idx);
  });
}


// ── Dino drop / harvest loot helpers ─────────────────────────────────────

// Resolve a dino dd/dh field (numeric index or class name) to the actual loot row.
// Numeric indices map via loot.di[] (drops) or loot.hi[] (harvest) to a class name,
// then loot.dd[cls] / loot.dh[cls] gives the row.
function _resolveDinoLootComp(ref, lootTable, indexArr){
  if (ref == null || !lootTable) return null;
  // String → look up directly
  if (typeof ref === "string") return lootTable[ref] || null;
  // Numeric → resolve via index array first
  const idx = Number(ref);
  if (!Number.isFinite(idx)) return null;
  if (Array.isArray(indexArr) && idx >= 0 && idx < indexArr.length) {
    const cls = indexArr[idx];
    if (cls && lootTable[cls]) return lootTable[cls];
  }
  // Fallback: maybe lootTable itself is array-indexed
  if (Array.isArray(lootTable)) return lootTable[idx] || null;
  // Fallback: maybe lootTable is keyed by stringified index
  return lootTable[String(idx)] || null;
}

function dropCompForDino(bp){
  const d = getDinoObjByBp(bp);
  return _resolveDinoLootComp(d?.dd, Global.loot?.dd, Global.loot?.di);
}

function harvestCompForDino(bp){
  const d = getDinoObjByBp(bp);
  return _resolveDinoLootComp(d?.dh, Global.loot?.dh, Global.loot?.hi);
}

function dropCompClassForDino(bp){
  return getDinoObjByBp(bp)?.dd || null;
}

function harvestCompClassForDino(bp){
  return getDinoObjByBp(bp)?.dh || null;
}

function dinoBpsThatUseDropComp(compRef){
  if (compRef == null) return [];
  const refStr = String(compRef);
  // Also resolve numeric → class name (and vice versa) so both representations match
  let altRef = null;
  if (typeof compRef === "number" || /^\d+$/.test(refStr)) {
    const idx = Number(compRef);
    altRef = Global.loot?.di?.[idx] || null;
  } else if (typeof compRef === "string" && Array.isArray(Global.loot?.di)) {
    const idx = Global.loot.di.indexOf(compRef);
    altRef = idx >= 0 ? String(idx) : null;
  }
  const out = [];
  for (const [key, obj] of Object.entries(Global.dinos?.dinos || {})){
    if (obj.dd == null) continue;
    const ddStr = String(obj.dd);
    if (ddStr === refStr || (altRef && ddStr === altRef)){
      out.push(/^-?\d+$/.test(key) ? (_dinoIdxToBp[Number(key)] || key) : key);
    }
  }
  return out;
}

function dinoBpsThatUseHarvestComp(compRef){
  if (compRef == null) return [];
  const refStr = String(compRef);
  let altRef = null;
  if (typeof compRef === "number" || /^\d+$/.test(refStr)) {
    const idx = Number(compRef);
    altRef = Global.loot?.hi?.[idx] || null;
  } else if (typeof compRef === "string" && Array.isArray(Global.loot?.hi)) {
    const idx = Global.loot.hi.indexOf(compRef);
    altRef = idx >= 0 ? String(idx) : null;
  }
  const out = [];
  for (const [key, obj] of Object.entries(Global.dinos?.dinos || {})){
    if (obj.dh == null) continue;
    const dhStr = String(obj.dh);
    if (dhStr === refStr || (altRef && dhStr === altRef)){
      out.push(/^-?\d+$/.test(key) ? (_dinoIdxToBp[Number(key)] || key) : key);
    }
  }
  return out;
}

// A dino's dd/dh references a loot component either by integer id (an index
// into loot.di / loot.hi) or, in older data, by the class name directly.
// These resolve either representation to the actual component object.
function lookupDropComp(loot, ref){
  if (ref == null || !loot?.dd) return null;
  if (loot.dd[ref]) return loot.dd[ref];                 // direct (class name)
  const idx = Number(ref);
  if (Number.isInteger(idx) && Array.isArray(loot.di)){
    const cls = loot.di[idx];
    if (cls && loot.dd[cls]) return loot.dd[cls];        // id -> class -> comp
  }
  return null;
}

function lookupHarvestComp(loot, ref){
  if (ref == null || !loot?.dh) return null;
  if (loot.dh[ref]) return loot.dh[ref];
  const idx = Number(ref);
  if (Number.isInteger(idx) && Array.isArray(loot.hi)){
    const cls = loot.hi[idx];
    if (cls && loot.dh[cls]) return loot.dh[cls];
  }
  return null;
}

function dinoBpsThatDropItem(itemId){
  const loot = Global.loot;
  if (!loot?.rd || !loot?.di) return [];

  const compIndices = loot.rd[String(itemId)] || [];
  return compIndices.flatMap(idx => {
    // Try matching dinos by index (new format) OR by class name (legacy)
    const byIdx = dinoBpsThatUseDropComp(idx);
    if (byIdx.length) return byIdx;
    const cls = loot.di[idx];
    return cls ? dinoBpsThatUseDropComp(cls) : [];
  });
}

function dinoBpsThatHarvestItem(itemId){
  const loot = Global.loot;
  if (!loot?.rh || !loot?.hi) return [];
  const compIndices = loot.rh[String(itemId)] || [];
  return compIndices.flatMap(idx => {
    const byIdx = dinoBpsThatUseHarvestComp(idx);
    if (byIdx.length) return byIdx;
    const cls = loot.hi[idx];
    return cls ? dinoBpsThatUseHarvestComp(cls) : [];
  });
}


function currentGeom(){
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  return Global.mapGeom.get(mapMeta?.geomShort);
}


// ---------------------------------------------------------------------------
// Boss data layer (Boss View)
//
// A geom file's `bosses.legend` lists the bosses summonable/fightable on that
// map. This resolves each raw boss entry into a fully-hydrated object:
//   n   -> name (whitespace-normalized)
//   i   -> summon item id; resolved to { id, name, recipe:[{id,name,qty}] }
//   d   -> boss dino indices; resolved to dino objects (+ their `de` unlocks)
//   t   -> tributeTerminal POI indices; resolved to { label, type, x, y }
//   xy  -> direct [x,y] arena location (for non-terminal bosses)
//   cl/tl/md/mp/mw -> craft level / teleport level / max dinos / max players /
//                     max drag weight requirements (any may be null)
// ---------------------------------------------------------------------------

// Collapse the embedded newlines some summon item names carry.
function cleanBossText(s){
  return String(s == null ? "" : s).replace(/\s+/g, " ").trim();
}

// Resolve an item id to { id, name, recipe }, where recipe is the crafting
// cost list (cr) expanded to ingredient names. Returns null for no item.
function resolveBossSummonItem(itemId){
  if (itemId == null) return null;
  const row = itemData().i?.[String(itemId)];
  if (!row) return { id: itemId, name: `Item ${itemId}`, recipe: [] };
  const recipe = Array.isArray(row.cr) ? row.cr.map(([ing, qty]) => ({
    id: ing,
    name: cleanBossText(itemDisplayNameById(ing)),
    qty: Number(qty) || 0
  })) : [];
  return { id: itemId, name: cleanBossText(row.n || `Item ${itemId}`), recipe };
}

// Resolve a boss dino ref (index) to { bp, name, de } where de is the list of
// items/engrams unlocked on the boss's death.
function resolveBossDino(ref){
  const bp = bpForDinoRef(ref);
  const obj = getDinoObjByBp(bp) || getDinoObjByBp(ref);
  if (!obj) return { bp, name: cleanBossText(bp.split("/").pop()), de: [] };
  const de = Array.isArray(obj.de) ? obj.de.map(id => ({
    id,
    name: cleanBossText(itemDisplayNameById(id))
  })) : [];
  return { bp, name: cleanBossText(obj.n || bp), de, obj };
}

// Resolve a boss's terminal references (t -> tributeTerminals indices) and/or
// its direct xy location into a list of { label, type, x, y } markers.
function resolveBossLocations(boss, geom){
  const terminals = geom?.pois?.tributeTerminals || [];
  const out = [];
  if (Array.isArray(boss?.t)){
    for (const ti of boss.t){
      const t = terminals[ti];
      if (!t) continue;
      const x = Number(t.x), y = Number(t.y);
      if (![x, y].every(Number.isFinite)) continue;
      out.push({
        label: cleanBossText(t.label || t.type || "Terminal"),
        type: t.type || "terminal",
        x, y,
        terminalIndex: ti
      });
    }
  }
  if (Array.isArray(boss?.xy) && boss.xy.length === 2){
    const x = Number(boss.xy[0]), y = Number(boss.xy[1]);
    if ([x, y].every(Number.isFinite)){
      out.push({ label: cleanBossText(boss.n) || "Boss", type: "arena", x, y, direct: true });
    }
  }
  return out;
}

// Resolve a boss's loot rewards (distinct from engram unlocks). Three sources:
//   1. The boss dino's `dd` drop component  -> items in the boss bag (Element, trophy)
//   2. The boss dino's `dg` (DeathGiveItemClasses) -> items handed straight to the player
//   3. The boss's arena loot crate `lc` (+ optional bonus item `li`) -> crate that
//      spawns on defeat (used by the terminal-less Ragnarok world bosses)
// Returns { drops:[{id,name}], given:[{id,name}], crates:[{name}], bonusItems:[{id,name}] }.
function resolveBossRewards(boss){
  const loot = Global.loot || {};
  const raw = boss.raw || {};
  const hasArenaCrate = raw.lc != null;

  const addToSource = (map, iid, mn, mx) => {
    const prev = map.get(iid);
    if (prev){ prev.mn = Math.min(prev.mn, mn); prev.mx = Math.max(prev.mx, mx); }
    else { map.set(iid, { id: iid, mn, mx }); }
  };

  const seenPoolComps = new Set();
  let poolPicks = null;       // { mn, mx } of the comp that contributed pool sets
  let poolCompCount = 0;      // suppress picks line if multiple comps contribute

  const extractDropComp = (comp, targetMap, poolSets) => {
    if (!comp) return;
    const sets = comp.s || [];

    // A comp "picks each set exactly once" when its pick count is fixed and
    // equals the set count — the guaranteed boss-bag pattern (Element +
    // Trophy). Anything else (e.g. the Titans picking 12–18 of 5 weighted
    // sets) is a real loot container and must render as a pool.
    const cmn = Number(comp.mn), cmx = Number(comp.mx);
    const picksEachOnce =
      (Number.isFinite(cmn) && cmn === cmx && cmn === sets.length) ||
      // Some comps omit the pick count entirely (e.g. The Center's arena
      // Element bag) — with a single set, that set is the loot.
      (!Number.isFinite(cmn) && !Number.isFinite(cmx) && sets.length === 1);

    // A set's contents are fixed only when the comp always includes it, it
    // draws ALL of its entries, and each entry has exactly one possible item
    // with no drop-chance filter. Quantity ranges (mn–mx) are fine.
    const setIsDeterministic = (setRow) => {
      if (!picksEachOnce) return false;
      const entries = setRow.e || [];
      if (!entries.length) return false;
      const smn = Number(setRow.smn ?? 1);
      const smx = Number(setRow.smx ?? setRow.smn ?? 1);
      if (smn !== entries.length || smx !== entries.length) return false;
      if (entries.length > 1 && !(setRow.rwr === 1 || setRow.rwr === true)) return false;
      return entries.every(e =>
        Array.isArray(e.i) && e.i.length === 1 &&
        (e.cg == null || Number(e.cg) >= 1));
    };

    let pushedPool = false;
    for (const setRow of sets){
      if (setRow.o != null){
        if (!seenOverrides.has(setRow.o)){
          seenOverrides.add(setRow.o);
          poolSets.push(setRow);
          pushedPool = true;
        }
      } else if (setIsDeterministic(setRow)){
        for (const entry of (setRow.e || [])){
          const mn = Number(entry.mn), mx = Number(entry.mx);
          for (const iid of (entry.i || [])){
            addToSource(targetMap, iid,
              Number.isFinite(mn) ? mn : 1,
              Number.isFinite(mx) ? mx : (Number.isFinite(mn) ? mn : 1));
          }
        }
      } else if (!seenPoolComps.has(comp)){
        poolSets.push(setRow);
        pushedPool = true;
      }
    }
    if (pushedPool && !seenPoolComps.has(comp)){
      seenPoolComps.add(comp);
      poolCompCount++;
      poolPicks = (poolCompCount === 1 && Number.isFinite(cmn))
        ? { mn: comp.mn, mx: comp.mx }
        : null;
    }
  };

  const perSourceDrops = [];
  const poolSets = [];
  const seenOverrides = new Set();
  const givenIds = new Set();

  for (const d of (boss.dinos || [])){
    const obj = d.obj;
    if (!obj) continue;
    // lc suppresses dd: arena crate replaces the boss bag.
    if (!hasArenaCrate && obj.dd != null){
      const m = new Map();
      extractDropComp(lookupDropComp(loot, obj.dd), m, poolSets);
      if (m.size) perSourceDrops.push(m);
    }
    // rd suppresses dg
    if (!raw.rd && Array.isArray(obj.dg)){
      for (const iid of obj.dg) givenIds.add(iid);
    }
  }

  const rdList = Array.isArray(raw.rd) ? raw.rd : (raw.rd != null ? [raw.rd] : []);
  for (const rdRef of rdList){
    const m = new Map();
    extractDropComp(lookupDropComp(loot, rdRef), m, poolSets);
    if (m.size) perSourceDrops.push(m);
  }

  const totalDrops = new Map();
  for (const srcMap of perSourceDrops){
    for (const [iid, item] of srcMap){
      const prev = totalDrops.get(iid);
      if (prev){ prev.mn += item.mn; prev.mx += item.mx; }
      else { totalDrops.set(iid, { id: iid, mn: item.mn, mx: item.mx }); }
    }
  }
  for (const v of totalDrops.values()) v.name = cleanBossText(itemDisplayNameById(v.id));

  // rls — for ascension loot sets, filter entries by boss difficulty tier.
  let rlsData = null;
  if (raw.rls != null){
    const si = loot.si || [];
    const idx = Number(raw.rls);
    if (Number.isInteger(idx) && idx >= 0 && idx < si.length){
      const cls = si[idx];
      const setData = cls ? (loot.s?.[cls]) : null;
      if (setData){
        let entries = setData.e || [];
        if (/Ascension/i.test(cls)){
          const tier = bossDifficultyTier(boss.name);
          if (tier >= 0 && tier < entries.length) entries = entries.slice(0, tier + 1);
        }
        rlsData = { name: setData.n || cls, entries, smn: setData.smn, smx: setData.smx };
      }
    }
  }

  // Arena crates — fully resolve for rendering, with quantity.
  const arenaCrates = [];
  const bonusItems = [];
  const lcList = Array.isArray(raw.lc) ? raw.lc : (raw.lc != null ? [raw.lc] : []);
  const lcq = Number(raw.lcq) || 1;
  for (const lc of lcList){
    const cls = crateIdToClass(lc);
    const crateObj = cls ? (loot.c?.[cls]) : null;
    const name = cleanBossText(crateObj?.dn || cls || `Crate ${lc}`);
    arenaCrates.push({ id: lc, name, crateClass: cls, qty: lcq, crateObj });
  }
  const liList = Array.isArray(raw.li) ? raw.li : (raw.li != null ? [raw.li] : []);
  for (const li of liList){
    bonusItems.push({ id: li, name: cleanBossText(itemDisplayNameById(li)), mn: 1, mx: 1 });
  }

  return {
    drops: [...totalDrops.values()],
    given: [...givenIds].map(id => ({ id, name: cleanBossText(itemDisplayNameById(id)), mn: 1, mx: 1 })),
    poolSets, poolPicks, rlsData,
    crates: arenaCrates, bonusItems
  };
}

// Detect boss difficulty tier from name: 0=Gamma/Easy, 1=Beta/Medium, 2=Alpha/Hard.
function bossDifficultyTier(name){
  const n = String(name || "").toLowerCase();
  if (/\(gamma\)|gamma |\(easy\)/i.test(n)) return 0;
  if (/\(beta\)|beta |\(medium\)/i.test(n)) return 1;
  if (/\(alpha\)|alpha |\(hard\)/i.test(n)) return 2;
  return -1;
}

// Build the fully-resolved boss list for the current map. Cached per map+source.
let _bossListCache = null;
let _bossListCacheKey = null;

function bossesForCurrentMap(){
  const key = String(State.mapId) + "\x00" + (Global.modMeta?.modId || "official");
  if (_bossListCache && _bossListCacheKey === key) return _bossListCache;

  const geom = currentGeom();
  const legend = geom?.bosses?.legend;
  const list = Array.isArray(legend) ? legend.map((boss, idx) => {
    const resolved = {
      index: idx,
      name: cleanBossText(boss.n) || `Boss ${idx}`,
      summon: resolveBossSummonItem(boss.i),
      dinos: (Array.isArray(boss.d) ? boss.d : []).map(resolveBossDino),
      locations: resolveBossLocations(boss, geom),
      craftLevel: boss.cl ?? null,
      teleportLevel: boss.tl ?? null,
      maxDinos: boss.md ?? null,
      maxPlayers: boss.mp ?? null,
      maxDragWeight: boss.mw ?? null,
      raw: boss
    };
    resolved.rewards = resolveBossRewards(resolved);
    return resolved;
  }) : [];

  _bossListCache = list;
  _bossListCacheKey = key;
  return list;
}

function invalidateBossCache(){
  _bossListCache = null;
  _bossListCacheKey = null;
}

// Resolve the Boss View dropdown selection (a boss name) to its boss object.
function getBossByName(name){
  if (!name) return null;
  const idx = State.bossNameToIndex.get(name);
  if (idx == null) return null;
  const bosses = bossesForCurrentMap();
  return bosses[idx] || null;
}

// Populate State.bossNames / bossNameToIndex from the current map's bosses,
// for the Boss View dropdown. The display name is derived from the boss's
// creature(s) plus its difficulty tier (e.g. "Broodmother (Beta)",
// "Broodmother Lysrix & Megapithecus (Gamma)"), rather than the inconsistent
// summon-item name. Names map 1:1 to a legend index.
function rebuildBossIndex(){
  const bosses = bossesForCurrentMap();
  State.bossNames = [];
  State.bossNameToIndex = new Map();
  for (const b of bosses){
    let name = b.name;
    if (State.bossNameToIndex.has(name)) name = `${name} (#${b.index})`;
    State.bossNames.push(name);
    State.bossNameToIndex.set(name, b.index);
  }
}


function itemData(){
  return Global.items || { p:{}, i:{} };
}


function lootData(){
  return Global.loot || { ci:[], si:[], c:{}, s:{}, r:{} };
}


function itemDisplayNameById(id){
  const row = itemData().i?.[String(id)];
  return row?.n || `Item ${id}`;
}


function itemBlueprintById(id){
  const row = itemData().i?.[String(id)];
  if (!row) return "";
  const path = itemData().p?.[String(row.p)] || "";
  const cls = row.c || "";
  return path && cls ? `${path}${cls}.${cls}_C` : "";
}


function crateIdToClass(crateId){
  return lootData().ci?.[Number(crateId)] || "";
}


function crateClassToId(crateClass){
  const arr = lootData().ci || [];
  const idx = arr.indexOf(crateClass);
  return idx >= 0 ? idx : -1;
}


function setClassToId(setClass){
  const arr = lootData().si || [];
  const idx = arr.indexOf(setClass);
  return idx >= 0 ? idx : -1;
}


function crateMetaById(crateId){
  const cls = crateIdToClass(crateId);
  return cls ? lootData().c?.[cls] || null : null;
}


function setClassToMeta(setClass){
  return setClass ? (lootData().s?.[setClass] || null) : null;
}


function poiLegendCrateClass(point, rowIdx = 0){
  const geom = currentGeom();
  const legend = Array.isArray(geom?.supplyLegend) ? geom.supplyLegend : [];
  const crateRows = Array.isArray(point?.c) ? point.c : [];
  const row = crateRows[rowIdx];
  if (!Array.isArray(row) || row.length < 1) return "";
  const legendIdx = Number(row[0]);
  const meta = Number.isInteger(legendIdx) && legendIdx >= 0 && legendIdx < legend.length
    ? legend[legendIdx]
    : null;
  return meta?.n ? `${meta.n}_C` : "";
}


function poiCrateClasses(point){

  const geom = currentGeom();
  const legend = Array.isArray(geom?.supplyLegend) ? geom.supplyLegend : [];
  const hordeLegend = Array.isArray(geom?.hordeLegend) ? geom.hordeLegend : [];

  const out = [];

  // supply crates
  for (const row of (Array.isArray(point?.c) ? point.c : [])){
    const idx = Number(row?.[0]);
    const meta = legend[idx];
    if (!meta?.n) continue;
    out.push(`${meta.n}_C`);
  }

  // horde crates
  for (const idxRaw of (Array.isArray(point?.h) ? point.h : [])){
    const idx = Number(idxRaw);
    const meta = hordeLegend[idx];
    if (!meta?.bp) continue;

    const cls = crateClassFromBp(meta.bp);
    if (cls) out.push(cls);
  }

  return [...new Set(out)];
}


function poiMatchesCrateClass(point, crateClass){
  return poiCrateClasses(point).includes(crateClass);
}


function poiMatchesAnyCrateClass(point, crateClasses){
  const set = new Set(crateClasses || []);
  return poiCrateClasses(point).some(cls => set.has(cls));
}


function itemReverseRows(itemId){
  return lootData().r?.[String(itemId)] || [];
}


function lootSourcesForItemId(itemId){
  const rows = itemReverseRows(itemId);
  const out = [];

  for (const r of rows){
    if (!Array.isArray(r) || !r.length) continue;

    if (typeof r[0] === "number"){
      out.push({
        kind: "crate",
        crateId: r[0]
      });
      continue;
    }

    if (r[0] === "m"){
      const missionClass = typeof r[1] === "number"
        ? lootData().mi?.[r[1]]
        : r[1];

      if (!missionClass) continue;

      out.push({
        kind: "mission",
        missionClass
      });
    }
  }

  return out;
}


function crateIdsForItemId(itemId){
  const refs = lootSourcesForItemId(itemId);
  const ids = refs
    .filter(r => r.kind === "crate" && Number.isInteger(r.crateId))
    .map(r => r.crateId);

  return [...new Set(ids)];
}


function rebuildLootIndices(){
  State.crateNames = [];
  State.crateNameToRef = new Map();
  State.crateOptions = [];

  State.itemNames = [];
  State.itemNameToIds.clear();

  State.mapCrateIds = new Set();
  State.mapItemIds = new Set();

  const loot = lootData();
  const items = itemData();

  const mapCrateClasses = crateClassesUsedOnCurrentMap();

  const modActive = !activeSourceIsOfficial();

  // typeFilter is declared once and used for both the crate loop and mission loop
  const typeFilter = infoPanelState.crateTypeFilter || "all";

  // --- normal crates on this map ---
  for (const crateClass of mapCrateClasses){
    const crateId = crateClassToId(crateClass);
    if (!Number.isInteger(crateId) || crateId < 0) continue;

    State.mapCrateIds.add(crateId);

    // When a mod is active and showAllCrates is off, only list crates
    // that have at least one mod loot set
    if (modActive && !infoPanelState.showAllCrates) {
      const crateMeta = loot.c?.[crateClass];
      const hasModSet = Array.isArray(crateMeta?.s) && crateMeta.s.some(s => s._mod);
      if (!hasModSet) continue;
    }

    // Apply crate type filter
    if (typeFilter !== "all") {
      const isArtifact  = crateClass.toLowerCase().includes("artifact");
      const isCave      = isCaveCrate(crateClass);
      const isOcean     = isOceanCrate(crateClass);
      const isHorde     = isHordeCrate(crateClass);
      const isAbNormal  = isAbNormalCrate(crateClass);
      const isAbDungeon = isAbDungeonCrate(crateClass);
      const isAbSurface = isAbSurfaceCrate(crateClass);
      const isSpecial   = isSpecialCrate(crateClass);

      // Filter "mission" means crates should be excluded entirely
      if (typeFilter === "mission") continue;

      if (typeFilter === "cave"      && !isCave) continue;
      if (typeFilter === "ocean"     && !isOcean) continue;
      if (typeFilter === "osd"       && !isHorde) continue;
      if (typeFilter === "abnormal"  && !isAbNormal) continue;
      if (typeFilter === "abdungeon" && !isAbDungeon) continue;
      if (typeFilter === "absurface" && !isAbSurface) continue;
      if (typeFilter === "artifact"  && !isArtifact) continue;
      if (typeFilter === "normal"    && (isSpecial || isArtifact || isHorde)) continue;
    }

    const value = `crate:${crateId}`;
    const label = crateDisplayNameByClass(crateClass);

    State.crateOptions.push({ value, label });
    State.crateNameToRef.set(value, {
      kind: "crate",
      crateId,
      crateClass
    });
  }

  // --- mission loot sources on this map ---
  const missionClasses = missionClassesUsedOnCurrentMap();

  // Missions only appear when filter is "all" or "mission"
  const showMissions = typeFilter === "all" || typeFilter === "mission";

  if (showMissions) {
    for (const missionClass of missionClasses){
      const m = loot.m?.[missionClass];
      if (!m) continue;

      const structs = Array.isArray(m.ls) ? m.ls : [];
      for (const structClass of structs){
        if (!structClass || !loot.ls?.[structClass]) continue;

        const value = `mission:${missionClass}:${structClass}`;
        const label = missionDisplayName(missionClass);

        State.crateOptions.push({ value, label });
        State.crateNameToRef.set(value, {
          kind: "mission",
          missionClass,
          missionName: m.n || missionClass,
          lootStructClass: structClass
        });
      }
    }
  }

  State.crateOptions.sort((a, b) => a.label.localeCompare(b.label));
  State.crateNames = State.crateOptions.map(x => x.value);

  // --- items on this map ---
  // When a mod source is active, only show mod items in the dropdown.
  // Official items are still visible within individual crate panels.

  for (const [itemIdStr, refs] of Object.entries(loot.r || {})){
    const itemId = Number(itemIdStr);
    if (!Number.isInteger(itemId)) continue;

    const itemRow = items.i?.[String(itemId)];
    if (!itemRow) continue;

    // Skip official items in the item dropdown when a mod is active
    if (modActive && !itemRow._mod) continue;

    const rows = Array.isArray(refs) ? refs : [];
    const missionClassesOnMap = missionClassesUsedOnCurrentMap();

    const appearsOnMap = rows.some(r => {
      if (!Array.isArray(r) || !r.length) return false;

      if (typeof r[0] === "number"){
        return State.mapCrateIds.has(r[0]);
      }

      if (r[0] === "m"){
        const missionRef = typeof r[1] === "number"
          ? loot.mi?.[r[1]]
          : r[1];

        return missionClassesOnMap.has(missionRef);
      }

      return false;
    });

    if (!appearsOnMap) continue;

    State.mapItemIds.add(itemId);

    const name = itemRow.n || `Item ${itemId}`;

    if (!State.itemNameToIds.has(name)){
      State.itemNameToIds.set(name, []);
    }
    State.itemNameToIds.get(name).push(itemId);
  }

  for (const [name, ids] of State.itemNameToIds.entries()){
    State.itemNameToIds.set(name, [...new Set(ids)].sort((a,b)=>a-b));
  }

  State.itemNames = [...State.itemNameToIds.keys()].sort((a,b)=>a.localeCompare(b));

  // --- dino drop / harvest items on this map ---
  // Add items that come from dino drops/harvests for dinos on the current map.
  const mapDinoBps = new Set([...State.entryToDinos.values()].flat());
  const dinoDropItemIds = new Set();
  const dinoHarvestItemIds = new Set();

  for (const bp of mapDinoBps){
    const dinoObj = getDinoObjByBp(bp);
    if (!dinoObj) continue;

    // A dino's dd/dh is a component id (index into loot.di / loot.hi), though
    // older data used the class name directly. Resolve to a class name first,
    // then look up the component. lookupDropComp/lookupHarvestComp handles both.
    const dropComp = lookupDropComp(loot, dinoObj.dd);
    if (dropComp){
      for (const setRow of (dropComp.s || [])){
        for (const entry of (setRow.e || [])){
          for (const iid of (entry.i || [])){
            dinoDropItemIds.add(iid);
          }
        }
      }
    }

    const harvestComp = lookupHarvestComp(loot, dinoObj.dh);
    if (harvestComp){
      for (const iid of (harvestComp.i || [])){
        dinoHarvestItemIds.add(iid);
      }
    }
  }

  for (const itemId of [...dinoDropItemIds, ...dinoHarvestItemIds]){
    State.mapItemIds.add(itemId);
    const itemRow = items.i?.[String(itemId)];
    if (!itemRow) continue;
    if (modActive && !itemRow._mod) continue;
    const name = itemRow.n || `Item ${itemId}`;
    if (!State.itemNameToIds.has(name)){
      State.itemNameToIds.set(name, []);
    }
    if (!State.itemNameToIds.get(name).includes(itemId)){
      State.itemNameToIds.get(name).push(itemId);
    }
  }

  // Rebuild itemNames to include dino loot items
  State.itemNames = [...State.itemNameToIds.keys()].sort((a,b)=>a.localeCompare(b));

  // --- boss reward items + engram unlocks on this map ---
  State.bossItemIndex = new Map();
  if (typeof bossesForCurrentMap === "function"){
    const bosses = bossesForCurrentMap();
    const addBossItem = (itemId, bossName, type, boss) => {
      if (!State.bossItemIndex.has(itemId)) State.bossItemIndex.set(itemId, []);
      const arr = State.bossItemIndex.get(itemId);
      if (!arr.some(e => e.name === bossName && e.type === type)){
        arr.push({ name: bossName, type, boss });
      }
      State.mapItemIds.add(itemId);
      const itemRow = items.i?.[String(itemId)];
      if (!itemRow) return;
      if (modActive && !itemRow._mod) return;
      const name = itemRow.n || `Item ${itemId}`;
      if (!State.itemNameToIds.has(name)) State.itemNameToIds.set(name, []);
      if (!State.itemNameToIds.get(name).includes(itemId))
        State.itemNameToIds.get(name).push(itemId);
    };

    for (let bi = 0; bi < bosses.length; bi++){
      const boss = bosses[bi];
      const bossName = State.bossNames[bi] || boss.name;
      const rewards = boss.rewards;

      // Loot/reward items (type: "drop")
      if (rewards){
        const ids = new Set();
        for (const d of (rewards.drops || [])) if (d.id != null) ids.add(d.id);
        for (const d of (rewards.given || [])) if (d.id != null) ids.add(d.id);
        for (const d of (rewards.bonusItems || [])) if (d.id != null) ids.add(d.id);
        for (const setRow of (rewards.poolSets || [])){
          const { allEntries } = lootSetEntriesFromRow(setRow);
          for (const entry of allEntries)
            for (const iid of (entry.i || [])) ids.add(iid);
        }
        if (rewards.rlsData)
          for (const entry of (rewards.rlsData.entries || []))
            for (const iid of (entry.i || [])) ids.add(iid);
        // Arena crate items (lc → crateObj → sets → entries → items)
        for (const crate of (rewards.crates || [])){
          if (crate.crateObj?.s){
            for (const setRow of crate.crateObj.s){
              const { allEntries } = lootSetEntriesFromRow(setRow);
              for (const entry of allEntries)
                for (const iid of (entry.i || [])) ids.add(iid);
            }
          }
        }
        for (const id of ids) addBossItem(id, bossName, "drop", boss);
      }

      // Engram/tekgram unlocks (type: "unlock")
      const raw = boss.raw || {};
      const unlockIds = new Set();
      if (Array.isArray(raw.re) && raw.re.length){
        for (const iid of raw.re) unlockIds.add(iid);
      } else {
        for (const d of (boss.dinos || []))
          for (const u of (d.de || [])) if (u.id != null) unlockIds.add(u.id);
      }
      for (const id of unlockIds) addBossItem(id, bossName, "unlock", boss);
    }
  }

  // Final rebuild of itemNames to include boss reward items
  State.itemNames = [...State.itemNameToIds.keys()].sort((a,b)=>a.localeCompare(b));
}


function crateItemSummary(crateClass, { modOnly = false } = {}){
  const crate = lootData().c?.[crateClass];
  if (!crate) return [];

  const seen = new Map();

  for (const row of (crate.s || [])){
    // When modOnly is true, skip official sets (same filter as the Sets tab)
    if (modOnly && !row._mod) continue;

    const { allEntries } = lootSetEntriesFromRow(row);

    for (const entry of allEntries){
      for (const itemId of (entry?.i || [])){
        if (!seen.has(itemId)){
          seen.set(itemId, {
            itemId,
            name: itemDisplayNameById(itemId),
            bp: itemBlueprintById(itemId),
            hits: 0
          });
        }
        seen.get(itemId).hits += 1;
      }
    }
  }

  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}


function lootPointsForCurrentMap(){

  const geom = currentGeom();
  if (!geom?.pois) return [];

  const out = [];

  for (const p of (geom.pois.supplyCrates || [])){
    out.push({ ...p, _type: "supply" });
  }

  for (const p of (geom.pois.hordeEvents || [])){
    out.push({ ...p, _type: "horde" });
  }

  for (const p of (geom.pois.missions || [])){
    out.push({ ...p, _type: "mission" });
  }

  return out;
}


function supplyCratePointsForCurrentMap(){
  const geom = currentGeom();
  return Array.isArray(geom?.pois?.supplyCrates) ? geom.pois.supplyCrates : [];
}


function crateClassFromLegendRow(row){
  const bp = row?.bp || "";
  const cls = crateClassFromBp(bp);
  if (cls) return cls;

  const short = shortBpName(bp);
  if (!short) return "";
  return short.endsWith("_C") ? short : `${short}_C`;
}


function supplyCrateClassesUsedOnCurrentMap(){
  const legend = supplyLegendForCurrentMap();
  const points = supplyCratePointsForCurrentMap();

  const out = new Set();

  for (const p of points){
    for (const row of (Array.isArray(p?.c) ? p.c : [])){
      if (!Array.isArray(row) || row.length < 1) continue;

      const idx = Number(row[0]);
      if (!Number.isInteger(idx) || idx < 0 || idx >= legend.length) continue;

      const meta = legend[idx];
      const crateClass = crateClassFromLegendRow(meta);
      if (crateClass) out.add(crateClass);
    }
  }

  return out;
}


function hordeCrateClassesUsedOnCurrentMap(){
  const geom = currentGeom();
  const legend = Array.isArray(geom?.hordeLegend) ? geom.hordeLegend : [];
  const points = Array.isArray(geom?.pois?.hordeEvents) ? geom.pois.hordeEvents : [];
  const out = new Set();

  for (const p of points){
    for (const rawIdx of (Array.isArray(p?.h) ? p.h : [])){
      const idx = Number(rawIdx);
      if (!Number.isInteger(idx) || idx < 0 || idx >= legend.length) continue;

      const meta = legend[idx];
      const bp = meta?.bp || "";
      const cls = crateClassFromBp(bp);
      if (cls) out.add(cls);
    }
  }

  return out;
}


function crateClassesUsedOnCurrentMap(){
  const out = new Set();

  for (const cls of supplyCrateClassesUsedOnCurrentMap()){
    out.add(cls);
  }

  for (const cls of hordeCrateClassesUsedOnCurrentMap()){
    out.add(cls);
  }

  return out;
}


function buildAllLootableItemNameIndex(){
  const out = new Map();
  const loot = lootData();
  const items = itemData();

  for (const itemId of Object.keys(loot.r || {})){
    const row = items.i?.[String(itemId)];
    if (!row) continue;

    const name = row.n || `Item ${itemId}`;
    if (!out.has(name)) out.set(name, []);
    out.get(name).push(Number(itemId));
  }

  for (const [name, ids] of out.entries()){
    out.set(name, [...new Set(ids)].sort((a,b)=>a-b));
  }

  return out;
}


function cratePoiRowsForSelectedCrate(crateId){
  const targetClass = crateIdToClass(crateId);
  if (!targetClass) return [];

  return supplyCratePointsForCurrentMap().filter(row =>
    poiMatchesCrateClass(row, targetClass)
  );
}


function cratePoiRowsForItem(itemName) {
  const itemIds = (State.itemNameToIds.get(itemName) || [])
    .filter(id => State.mapItemIds.has(id));

  console.log("cratePoiRowsForItem itemName:", itemName);
  console.log("filtered itemIds:", itemIds);

  if (!itemIds.length) return [];

  const crateClasses = new Set();

  for (const itemId of itemIds) {
    const crateIds = crateIdsForItemId(itemId) || [];
    console.log("item", itemId, "crateIds:", crateIds);

    for (const crateId of crateIds) {
      if (!State.mapCrateIds.has(crateId)) continue;

      const crateClass = crateIdToClass(crateId);
      if (crateClass) crateClasses.add(crateClass);
    }
  }

  console.log("crateClasses for item:", [...crateClasses]);

  if (!crateClasses.size) return [];

  const points = currentGeom()?.pois?.supplyCrates || [];

  const rows = points.filter(p => {
    const poiClasses = poiCrateClasses(p) || [];
    return poiClasses.some(cls => crateClasses.has(cls));
  });

  console.log("matched item POI rows:", rows.length);
  return rows;
}

function hordePoiRowsForSelectedCrate(crateId) {
  const targetClass = crateIdToClass(crateId);
  if (!targetClass) return [];

  const points = currentGeom()?.pois?.hordeEvents || [];

  return points.filter(p => {
    const classes = poiCrateClasses(p) || [];
    return classes.includes(targetClass);
  });
}

function hordePoiRowsForItem(itemName) {
  const itemIds = (State.itemNameToIds.get(itemName) || [])
    .filter(id => State.mapItemIds.has(id));

  if (!itemIds.length) return [];

  const crateClasses = new Set();

  for (const itemId of itemIds) {
    for (const crateId of crateIdsForItemId(itemId)) {
      if (!State.mapCrateIds.has(crateId)) continue;

      const cls = crateIdToClass(crateId);
      if (cls) crateClasses.add(cls);
    }
  }

  const points = currentGeom()?.pois?.hordeEvents || [];

  return points.filter(p => {
    const poiClasses = poiCrateClasses(p) || [];
    return poiClasses.some(cls => crateClasses.has(cls));
  });
}

let lootItemsPromise = null;

async function ensureLootAndItemsLoaded() {
  if (Global.items && Global.loot) return;

  if (!lootItemsPromise) {
    lootItemsPromise = (async () => {
      const [items, loot] = await Promise.all([
        loadJSON(PATHS.itemGlobal),
        loadJSON(PATHS.lootGlobal)
      ]);

      Global.items = items;
      Global.loot = loot;
      Global.baseItems = items;
      Global.baseLoot = loot;

      buildLootIndexes();

      // Rebuild current map-dependent loot data now that loot exists
      const mapMeta = MAPS.find(m => m.id === State.mapId);
      const geomShort = mapMeta?.geomShort;
      const geom = Global.mapGeom.get(geomShort);

      if (geom && geomShort) {
        const resolvedLegend = buildResolvedSupplyLegend(geom);
        Global.resolvedSupplyLegend.set(geomShort, resolvedLegend);
      }

      // Boss names, summon recipes, and unlock labels all depend on the item
      // table, which loads lazily. Rebuild the boss index now that items exist.
      if (typeof invalidateBossCache === "function") invalidateBossCache();
      if (typeof rebuildBossIndex === "function") rebuildBossIndex();

      rebuildLootIndices();

      // If we're currently in a loot-dependent mode, refresh the UI
      if (State.mode === "crate" || State.mode === "item" || State.mode === "dino" || State.mode === "boss") {
        rebuildSelectionSelect();
        render();
      }
    })().finally(() => {
      lootItemsPromise = null;
    });
  }

  await lootItemsPromise;
}




/*=====UI========*/



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
    try {
      await loadSelectedSource();
    } catch (e) {
      console.error("Source load failed:", e);
      showBootSplash("Failed to load source");
    }
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

  UI.mapSelect.onchange = async () => {
    State.mapId = UI.mapSelect.value;
    try {
      await onMapChanged();
    } catch (e) {
      console.error("Map load failed:", e);
      showBootSplash("Failed to load map");
    }
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


// Persists the user's chosen view mode and sort direction across dropdown open/close
let sourceDropdownViewMode = "group"; // "group" | "flat" | "author"
let sourceDropdownSortDir = "asc";    // "asc" | "desc"

function sourceSortedLeaves(leaves) {
  const sorted = [...leaves];
  sorted.sort((a, b) => a.label.localeCompare(b.label));
  if (sourceDropdownSortDir === "desc") sorted.reverse();
  return sorted;
}

function buildSourceTreeByGroup() {
  const root = { label: "Sources", children: [] };

  const official = SOURCES.find(s => s.id === "official");
  if (official) root.children.push({ label: official.name, value: official.id });

  const modSources = SOURCES.filter(s => s.id !== "official");
  const groups = new Map();
  const loose = [];

  for (const s of modSources) {
    if (s.kind === "group") {
      const gname = String(s.group || "");
      if (!groups.has(gname)) {
        groups.set(gname, { label: gname, children: [], _groupOrder: Number.isFinite(s.groupOrder) ? s.groupOrder : 9999 });
      }
      groups.get(gname).children.push({ label: s.name, value: s.id, _order: -1 });
      continue;
    }
    const leaf = { label: s.name, value: s.id, _order: Number.isFinite(s.order) ? s.order : 9999 };
    if (s.group) {
      const gname = String(s.group);
      if (!groups.has(gname)) {
        groups.set(gname, { label: gname, children: [], _groupOrder: Number.isFinite(s.groupOrder) ? s.groupOrder : 9999 });
      }
      groups.get(gname).children.push(leaf);
    } else {
      loose.push(leaf);
    }
  }

  for (const g of groups.values()) {
    g.children = sourceSortedLeaves(g.children.map(({ _order, ...x }) => x));
  }

  let groupFolders = Array.from(groups.values())
    .sort((a, b) => (a._groupOrder - b._groupOrder) || a.label.localeCompare(b.label))
    .map(g => ({ label: g.label, children: g.children }));

  if (sourceDropdownSortDir === "desc") groupFolders.reverse();

  const modsFolder = { label: "Mods", children: [...groupFolders, ...sourceSortedLeaves(loose.map(({ _order, ...x }) => x))] };
  root.children.push(modsFolder);
  return root;
}

function buildSourceTreeFlat() {
  const root = { label: "Sources", children: [] };

  const official = SOURCES.find(s => s.id === "official");
  if (official) root.children.push({ label: official.name, value: official.id });

  const mods = sourceSortedLeaves(
    SOURCES
      .filter(s => s.kind === "mod")
      .map(s => ({ label: s.name, value: s.id }))
  );

  root.children.push(...mods);
  return root;
}

function buildSourceTreeByAuthor() {
  const root = { label: "Sources", children: [] };

  const official = SOURCES.find(s => s.id === "official");
  if (official) root.children.push({ label: official.name, value: official.id });

  const byAuthor = new Map();
  for (const s of SOURCES.filter(s => s.kind === "mod")) {
    const author = s.author || "Unknown";
    if (!byAuthor.has(author)) byAuthor.set(author, []);
    byAuthor.get(author).push({ label: s.name, value: s.id });
  }

  let authorFolders = Array.from(byAuthor.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([author, children]) => ({ label: author, children: sourceSortedLeaves(children) }));

  if (sourceDropdownSortDir === "desc") authorFolders.reverse();

  root.children.push(...authorFolders);
  return root;
}

function buildSourceDrillTree() {
  if (sourceDropdownViewMode === "flat") return buildSourceTreeFlat();
  if (sourceDropdownViewMode === "author") return buildSourceTreeByAuthor();
  return buildSourceTreeByGroup();
}


async function buildMergedGroupSource(src){
  const mods = [];

  for (const modId of src.members || []){
    const modSrc = SOURCES.find(s => s.id === modId);
    if (!modSrc?.file) continue;
    mods.push(await loadJSON(modSrc.file));
  }

  let mergedSpawn = {
    entryIndex: Global.baseSpawn?.entryIndex || [],
    mapLegend: { ...(Global.baseSpawn?.mapLegend || {}) },
    entryMaps: { ...(Global.baseSpawn?.entryMaps || {}) },
    entries: { ...(Global.baseSpawn?.entries || {}) },
    maps: { ...(Global.baseSpawn?.maps || {}) },
    dinos: { ...(Global.baseSpawn?.dinos || {}) },
    worldReplacements: { ...(Global.baseSpawn?.worldReplacements || {}) }
  };

  let mergedDinos = {
    dinos: { ...(Global.baseDinos?.dinos || {}) },
    dinoIndex: Global.baseDinos?.dinoIndex || [],
    c: Global.baseDinos?.c || {},
    cs: Global.baseDinos?.cs || {},
    // Per-mod color sets: { modId: { setId: [...regions] } }. Keyed by mod id
    // because each mod's set ids restart at 1 and would otherwise collide.
    modCsByMod: {}
  };

  let modOnlyDinos = {};

  for (const mod of mods){
    const modId = String(mod.modId || "");
    const baseIndex = Global.baseDinos?.dinoIndex || [];
    const decoded = decodeModSource(mod, baseIndex);

    mergedSpawn = {
      entryIndex: mergedSpawn.entryIndex || [],
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
        decoded.entries
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
        decoded.worldReplacements
      )
    };

    // decoded.dinos is already bp-keyed and mod-tagged.
    const taggedModDinos = decoded.dinos;
    if (modId && mod.cs){
      mergedDinos.modCsByMod[modId] = mod.cs;
    }

    mergedDinos = {
      dinos: {
        ...(mergedDinos.dinos || {}),
        ...taggedModDinos
      },
      dinoIndex: mergedDinos.dinoIndex,
      c: mergedDinos.c,
      cs: mergedDinos.cs,
      modCsByMod: mergedDinos.modCsByMod
    };

    modOnlyDinos = {
      ...modOnlyDinos,
      ...taggedModDinos
    };
  }

  return {
    spawn: mergedSpawn,
    dinos: mergedDinos,
    modOnlyDinos
  };
}


function mountSourceDrillDropdown(native, host){
  host._ddAbort?.abort();
  host._ddAbort = new AbortController();
  const { signal } = host._ddAbort;

  native.style.display = "none";
  host.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "dd";

  const btn = document.createElement("button");
  btn.className = "dd-btn";

  const labelEl = document.createElement("div");
  labelEl.className = "dd-label";

  const caret = document.createElement("div");
  caret.className = "dd-caret";
  caret.textContent = "▾";

  btn.append(labelEl, caret);

  const panel = document.createElement("div");
  panel.className = "dd-panel";

  // --- View mode toolbar ---
  const toolbar = document.createElement("div");
  toolbar.className = "dd-source-toolbar";

  const VIEW_MODES = [
    { id: "group",  label: "Group" },
    { id: "flat",   label: "List" },
    { id: "author", label: "Author" }
  ];

  function renderToolbar() {
    toolbar.innerHTML = "";
    for (const mode of VIEW_MODES) {
      const tb = document.createElement("button");
      tb.type = "button";
      tb.className = "dd-source-mode-btn" + (sourceDropdownViewMode === mode.id ? " is-on" : "");
      tb.textContent = mode.label;
      tb.onclick = () => {
        sourceDropdownViewMode = mode.id;
        renderToolbar();
        resetToRoot();
        applySearch(searchInput.value);
      };
      toolbar.appendChild(tb);
    }

    // Sort direction toggle
    const sortBtn = document.createElement("button");
    sortBtn.type = "button";
    sortBtn.className = "dd-source-mode-btn dd-source-sort-btn";
    sortBtn.title = sourceDropdownSortDir === "asc" ? "A → Z (click to reverse)" : "Z → A (click to reverse)";
    sortBtn.textContent = sourceDropdownSortDir === "asc" ? "A↑" : "Z↓";
    sortBtn.onclick = () => {
      sourceDropdownSortDir = sourceDropdownSortDir === "asc" ? "desc" : "asc";
      // Rebuild tree with new sort but stay at current folder depth
      root = buildSourceDrillTree();
      rebuildStackFromPath();
      renderToolbar();
      applySearch(searchInput.value);
    };
    toolbar.appendChild(sortBtn);
  }

  // --- Search input ---
  const searchInput = document.createElement("input");
  searchInput.className = "dd-search";
  searchInput.placeholder = "Search sources...";
  searchInput.autocomplete = "off";

  // --- Breadcrumb / Back ---
  const crumb = document.createElement("div");
  crumb.className = "dd-crumb";

  // --- List ---
  const list = document.createElement("div");
  list.className = "dd-list";

  panel.append(toolbar, searchInput, crumb, list);
  wrap.append(btn, panel);
  host.appendChild(wrap);

  // --- Tree navigation state ---
  let root = buildSourceDrillTree();
  const stack = [root];
  let lastPath = [];

  function currentNode() { return stack[stack.length - 1]; }

  function syncLabel() {
    labelEl.textContent = native.selectedOptions?.[0]?.textContent || "(Select)";
  }

  function rebuildStackFromPath() {
    stack.length = 0;
    stack.push(root);
    let node = root;
    for (const seg of lastPath) {
      const next = (node.children || []).find(c => Array.isArray(c.children) && c.label === seg);
      if (!next) break;
      stack.push(next);
      node = next;
    }
  }

  function resetToRoot() {
    root = buildSourceDrillTree();
    stack.length = 0;
    stack.push(root);
    lastPath = [];
  }

  // Render a flat search result across the whole tree
  function allLeaves(node, _parentPath = []) {
    const out = [];
    for (const child of node.children || []) {
      if (Array.isArray(child.children)) {
        out.push(...allLeaves(child, [..._parentPath, child.label]));
      } else {
        out.push({ ...child, _path: _parentPath });
      }
    }
    return out;
  }

  function applySearch(q) {
    q = normSearch(q);

    if (q) {
      // Show flat filtered list, hide crumb/back
      crumb.innerHTML = "";
      list.innerHTML = "";

      const matches = sourceSortedLeaves(
        allLeaves(root).filter(leaf => normSearch(leaf.label).includes(q))
      );

      if (!matches.length) {
        const empty = document.createElement("div");
        empty.className = "dd-item";
        empty.style.color = "var(--text-dim)";
        empty.textContent = "No results";
        list.appendChild(empty);
        return;
      }

      for (const item of matches) {
        const row = document.createElement("div");
        row.className = "dd-item";
        row.textContent = item.label;
        row.onclick = () => {
          // Navigate stack to item's parent path so next open shows correct folder
          if (item._path && item._path.length) {
            stack.length = 0;
            stack.push(root);
            let node = root;
            for (const seg of item._path) {
              const next = (node.children || []).find(c => Array.isArray(c.children) && c.label === seg);
              if (!next) break;
              stack.push(next);
              node = next;
            }
            lastPath = item._path.slice();
          }
          native.value = item.value;
          native.dispatchEvent(new Event("change"));
          close();
        };
        list.appendChild(row);
      }
    } else {
      renderLevel();
    }
  }

  function renderLevel() {
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

  function open() {
    rebuildStackFromPath();
    renderToolbar();
    searchInput.value = "";
    renderLevel();
    wrap.classList.add("open");
    searchInput.focus();
  }

  function close() {
    wrap.classList.remove("open");
  }

  btn.onclick = () => {
    wrap.classList.contains("open") ? close() : open();
  };

  searchInput.oninput = () => {
    applySearch(searchInput.value);
  };

  document.addEventListener("pointerdown", e => {
    if (!wrap.contains(e.target)) close();
  }, { signal });

  native.addEventListener("change", syncLabel);
  syncLabel();
}


function mountFancyDropdown(native, host, placeholder, { buildToolbar } = {}){

  host._ddAbort?.abort();
  host._ddAbort = new AbortController();
  const { signal } = host._ddAbort;

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

  // Optional toolbar above the search
  if (buildToolbar) {
    const toolbar = buildToolbar({ rebuild, close });
    if (toolbar) panel.appendChild(toolbar);
  }

  panel.append(search, list);
  wrap.append(btn,panel);
  host.appendChild(wrap);

  function rebuild(){

    list.innerHTML="";

    for(const o of native.options){

      const row=document.createElement("div");

      row.className="dd-item";
      row.textContent=o.textContent;
      // Search key: visible label + any hidden searchExtra (e.g. note index)
      const extra = o.dataset?.searchExtra ? " " + o.dataset.searchExtra : "";
      row.dataset.search = normSearch(o.textContent + extra);

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
  }, { signal });

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
    const validModes = new Set(["dino", "entry", "crate", "item", "note"]);
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
  
  mkBtn({
    title: "Settings",
    icon: `
      <svg
        width="18px"
        height="18px"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <path d="M12 21a8.985 8.985 0 0 1-1.755-.173 1 1 0 0 1-.791-.813l-.273-1.606a6.933 6.933 0 0 1-1.32-.762l-1.527.566a1 1 0 0 1-1.1-.278 8.977 8.977 0 0 1-1.756-3.041 1 1 0 0 1 .31-1.092l1.254-1.04a6.979 6.979 0 0 1 0-1.524L3.787 10.2a1 1 0 0 1-.31-1.092 8.977 8.977 0 0 1 1.756-3.042 1 1 0 0 1 1.1-.278l1.527.566a6.933 6.933 0 0 1 1.32-.762l.274-1.606a1 1 0 0 1 .791-.813 8.957 8.957 0 0 1 3.51 0 1 1 0 0 1 .791.813l.273 1.606a6.933 6.933 0 0 1 1.32.762l1.527-.566a1 1 0 0 1 1.1.278 8.977 8.977 0 0 1 1.756 3.041 1 1 0 0 1-.31 1.092l-1.254 1.04a6.979 6.979 0 0 1 0 1.524l1.254 1.04a1 1 0 0 1 .31 1.092 8.977 8.977 0 0 1-1.756 3.041 1 1 0 0 1-1.1.278l-1.527-.566a6.933 6.933 0 0 1-1.32.762l-.273 1.606a1 1 0 0 1-.791.813A8.985 8.985 0 0 1 12 21zm-.7-2.035a6.913 6.913 0 0 0 1.393 0l.247-1.451a1 1 0 0 1 .664-.779 4.974 4.974 0 0 0 1.696-.975 1 1 0 0 1 1.008-.186l1.381.512a7.012 7.012 0 0 0 .7-1.206l-1.133-.939a1 1 0 0 1-.343-.964 5.018 5.018 0 0 0 0-1.953 1 1 0 0 1 .343-.964l1.124-.94a7.012 7.012 0 0 0-.7-1.206l-1.38.512a1 1 0 0 1-1-.186 4.974 4.974 0 0 0-1.688-.976 1 1 0 0 1-.664-.779l-.248-1.45a6.913 6.913 0 0 0-1.393 0l-.25 1.45a1 1 0 0 1-.664.779A4.974 4.974 0 0 0 8.7 8.24a1 1 0 0 1-1 .186l-1.385-.512a7.012 7.012 0 0 0-.7 1.206l1.133.939a1 1 0 0 1 .343.964 5.018 5.018 0 0 0 0 1.953 1 1 0 0 1-.343.964l-1.128.94a7.012 7.012 0 0 0 .7 1.206l1.38-.512a1 1 0 0 1 1 .186 4.974 4.974 0 0 0 1.688.976 1 1 0 0 1 .664.779zm.7-3.725a3.24 3.24 0 0 1 0-6.48 3.24 3.24 0 0 1 0 6.48zm0-4.48A1.24 1.24 0 1 0 13.24 12 1.244 1.244 0 0 0 12 10.76z" fill="currentColor" />
      </svg>
    `,
    togglePanelId: "settingsPanel",
    onClick: () => toggleSettingsPanel()
  });

  // Astraeos background swap
  if (isAstraeos) {
    const bgs = mapMeta.backgrounds;
    const savedBgId = getAstraeosBgPref();
    const preferred = bgs.find(x => x.id === savedBgId) || bgs.find(x => x.id === mapMeta.defaultBg) || bgs[0];
    const idx = Math.max(0, bgs.indexOf(preferred));

    if (mapObj?.overlay) {
      mapObj.overlay.setUrl(bgs[idx].url);
    }

    const bgBtn = mkBtn({
      title: `Background: ${preferred.label || preferred.id || (idx + 1)} (tap to cycle)`,
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
  if (isDockBtnVisible("dinoInfoPanel")) {
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
  }
  if (isDockBtnVisible("drawStylePanel")) {
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
  }

  // POI toggle
  if (isDockBtnVisible("poiPanel")) {
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
  }

  // Rarity legend toggle
  if (isDockBtnVisible("rarityLegend")) {
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
  }
  if (isDockBtnVisible("mapEntriesPanel")) {
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
  }
  if (isDockBtnVisible("exportPanel")) {
    mkBtn({
      title: "Toggle export panel",
      icon: `
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M12 3v10M8 9l4 4 4-4M5 19h14"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"/>
        </svg>
      `,
      togglePanelId: "exportPanel",
      onClick: () => toggleExportPanel()
    });
  }

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
  } else if (State.mode === "boss") {
    panel.dataset.tab = infoPanelState.bossTab;
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
    const entryOpts = State.entryList.map(v => ({ value: v, label: v }));
    if (!activeSourceIsOfficial()) {
      options = entryOpts.filter(({ value }) => {
        if (infoPanelState.showAllEntries) return true;
        const bps = State.entryToDinos.get(value) || [];
        return bps.some(bp => isBlueprintFromActiveMod(bp));
      });
    } else {
      options = entryOpts;
    }
  } else if (State.mode === "crate") {
    placeholder = "(Select a Loot Crate)";
    options = State.crateOptions.map(v => ({ value: v.value, label: v.label }));
  } else if (State.mode === "item") {
    placeholder = "(Select an Item)";
    options = State.itemNames.map(v => ({ value: v, label: v }));
  } else if (State.mode === "boss") {
    placeholder = "(Select a Boss)";
    options = State.bossNames.map(v => ({ value: v, label: v }));
  } else if (State.mode === "note") {
    placeholder = "(Select a Note or Dossier)";
    const allNotes = getNoteOptionsForCurrentMap();
    options = allNotes.map(n => ({
      value: `note:${n[0]}`,
      label: n[1],                // clean label, no #N suffix
      searchExtra: String(n[0]),  // index kept for hidden search matching
    }));
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
    if (opt.searchExtra) o.dataset.searchExtra = opt.searchExtra;
    UI.dinoSelect.appendChild(o);
  }

  const saved = State.selections[State.mode] || "";
  const visibleSelection = options.some(opt => opt.value === saved) ? saved : "";

  State.selection = visibleSelection;
  UI.dinoSelect.value = visibleSelection;

  UI.dinoSelect.onchange = () => {
    const newValue = UI.dinoSelect.value || "";
    State.selection = newValue;
    State.selections[State.mode] = newValue;
    // For note mode, sync noteViewState.selected from the selection value
    if (State.mode === "note" && newValue.startsWith("note:")) {
      noteViewState.selected = noteFromSelection(newValue);
    }
    render();
  };

  const entryDropdownToolbar = (State.mode === "entry" && !activeSourceIsOfficial())
    ? ({ rebuild }) => {
        const bar = document.createElement("div");
        bar.className = "dd-source-toolbar";

        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = "dd-source-mode-btn" + (infoPanelState.showAllEntries ? " is-on" : "");
        pill.textContent = infoPanelState.showAllEntries ? "All entries" : "Mod entries";
        pill.title = infoPanelState.showAllEntries
          ? "Showing all entries — click to show mod entries only"
          : "Showing mod entries only — click to show all";
        pill.onclick = () => {
          infoPanelState.showAllEntries = !infoPanelState.showAllEntries;
          rebuildSelectionSelect();
          UI.dinoFancy?.querySelector(".dd-btn")?.click();
          if (State.selection) render();
        };
        bar.appendChild(pill);
        return bar;
      }
    : null;

  const crateDropdownToolbar = State.mode === "crate"
    ? ({ rebuild }) => {
        const bar = document.createElement("div");
        bar.className = "dd-source-toolbar";
        bar.style.cssText = "display:flex; flex-wrap:wrap; gap:4px;";

        // Mod filter pill — only when a mod source is active
        if (!activeSourceIsOfficial()) {
          const modPill = document.createElement("button");
          modPill.type = "button";
          modPill.className = "dd-source-mode-btn" + (infoPanelState.showAllCrates ? " is-on" : "");
          modPill.textContent = infoPanelState.showAllCrates ? "All crates" : "Mod crates";
          modPill.title = infoPanelState.showAllCrates
            ? "Showing all crates — click to show mod only"
            : "Showing mod crates only — click to show all";
          modPill.onclick = () => {
            infoPanelState.showAllCrates = !infoPanelState.showAllCrates;
            rebuildLootIndices();
            rebuildSelectionSelect();
            UI.dinoFancy?.querySelector(".dd-btn")?.click();
            if (State.selection) render();
          };
          bar.appendChild(modPill);
        }

        // Type filter pills: All | Normal | Cave | Artifact
        const pillRow = document.createElement("div");
        pillRow.style.cssText = "display:flex; gap:4px; flex-wrap:wrap; width:100%; margin-top:2px;";

        // Build filter pills based on what's actually present on this map.
        // We scan the supply legend and mission legend to decide which pills to show.
        const isAb = State.mapId === "Aberration";
        const mapMeta_ = MAPS.find(m => m.id === State.mapId);
        const geom_   = Global.mapGeom.get(mapMeta_?.geomShort);
        const legend_ = geom_?.supplyLegend || [];

        const classes_ = legend_.map(row => (row.bp||"").split(".").pop());
        const hasNormal   = !isAb && classes_.some(c => {
          const cl = c.toLowerCase();
          return cl.includes("supplycr") && !cl.includes("cave") && !cl.includes("ocean") &&
                 !cl.includes("high") && !cl.includes("underwater") && !cl.includes("horde") &&
                 !cl.includes("artifact") && !cl.includes("dungeon") && !cl.includes("aberrant_surface");
        });
        const hasCave     = !isAb && classes_.some(c => isCaveCrate(c));
        const hasOceanReg = classes_.some(c => { const cl = c.toLowerCase(); return cl.includes("ocean") && !cl.includes("high"); });
        const hasDesert   = classes_.some(c => { const cl = c.toLowerCase(); return cl.includes("high"); });
        const hasOcean    = hasOceanReg || hasDesert;
        const oceanLabel  = hasOceanReg && hasDesert ? "Ocean / Desert"
                          : hasDesert                ? "Desert"
                          : "Ocean";
        const hasArtifact = classes_.some(c => c.toLowerCase().includes("artifact"));
        const hasMissions = (missionClassesUsedOnCurrentMap?.()?.size || 0) > 0;

        // Horde crates come from the horde legend, not supply legend
        const hordeLegend_ = geom_?.hordeLegend || [];
        const hasHorde    = hordeLegend_.some(row => {
          const cl = ((row.bp||"").split(".").pop()).toLowerCase();
          return cl.includes("supplycrate") && cl.includes("horde");
        });

        // Aberration always has cave/dungeon/surface
        const hasAbNormal  = isAb && classes_.some(c => isAbNormalCrate(c));
        const hasAbDungeon = isAb && classes_.some(c => isAbDungeonCrate(c));
        const hasAbSurface = isAb && classes_.some(c => isAbSurfaceCrate(c));

        const typeFilterOptions = [
          { id: "all", label: "All" }
        ];
        if (hasNormal)     typeFilterOptions.push({ id: "normal",    label: "Normal" });
        if (hasCave)       typeFilterOptions.push({ id: "cave",      label: "Cave" });
        if (hasOcean)      typeFilterOptions.push({ id: "ocean",     label: oceanLabel });
        if (hasHorde)      typeFilterOptions.push({ id: "osd",       label: "OSD" });
        if (hasAbNormal)   typeFilterOptions.push({ id: "abnormal",  label: "Cave" });
        if (hasAbDungeon)  typeFilterOptions.push({ id: "abdungeon", label: "Dungeon" });
        if (hasAbSurface)  typeFilterOptions.push({ id: "absurface", label: "Surface" });
        if (hasArtifact)   typeFilterOptions.push({ id: "artifact",  label: "Artifacts" });
        if (hasMissions)   typeFilterOptions.push({ id: "mission",   label: "Missions" });

        typeFilterOptions.forEach(tf => {
          const pill = document.createElement("button");
          pill.type = "button";
          pill.className = "dd-source-mode-btn" + ((infoPanelState.crateTypeFilter||"all") === tf.id ? " is-on" : "");
          pill.textContent = tf.label;
          pill.onclick = () => {
            infoPanelState.crateTypeFilter = tf.id;
            rebuildLootIndices();
            rebuildSelectionSelect();
            UI.dinoFancy?.querySelector(".dd-btn")?.click();
            if (State.selection) render();
          };
          pillRow.appendChild(pill);
        });
        bar.appendChild(pillRow);
        return bar;
      }
    : null;

  const noteDropdownToolbar = State.mode === "note"
    ? buildNoteDropdownToolbar
    : null;

  mountFancyDropdown(
    UI.dinoSelect,
    UI.dinoFancy,
    placeholder.replace(/[()]/g, ""),
    { buildToolbar: entryDropdownToolbar || crateDropdownToolbar || noteDropdownToolbar }
  );
}

// Debug helper: call window.debugWR("VanillaLeedBP") in console
window.debugWR = (bp) => {
  const result = worldOutputsForBp(bp, true);
  console.log("RESULT:", result.map(([b,p]) => `${b.split("/").pop()} (${(p*100).toFixed(1)}%)`).join(", "));
  return result;
};

// Dump all WR rules whose 'from' or 'outs' contain the given substring
window.debugWRRules = (substr) => {
  const all = Global.spawn?.worldReplacements || {};
  const lower = String(substr).toLowerCase();
  for (const [mapKey, rules] of Object.entries(all)) {
    if (!Array.isArray(rules)) continue;
    const matches = rules.filter(r => {
      const fromMatch = String(r?.from || "").toLowerCase().includes(lower);
      const outMatch = (r?.outs || []).some(o => String(o?.[0] || "").toLowerCase().includes(lower));
      return fromMatch || outMatch;
    });
    if (matches.length) {
      console.log(`\n=== map="${mapKey}" — ${matches.length} matching rule(s) ===`);
      for (const r of matches) {
        const tag = r.exact ? "EXACT" : "anc  ";
        const event = r.event || "-";
        console.log(`${tag} event=${event}`);
        console.log(`  from: ${r.from}`);
        for (const o of (r.outs || [])) {
          console.log(`  out:  ${o[0]} (${o[1]})`);
        }
      }
    }
  }
};

// Dump the built rule index for the current map
window.debugWRIndex = (substr) => {
  const { exact, ancestor } = worldRuleIndexForCurrentMap();
  const lower = String(substr || "").toLowerCase();
  console.log(`\n=== EXACT rules in current-map index (mapId="${State.mapId}") ===`);
  for (const [from, r] of exact.entries()) {
    if (!lower || from.toLowerCase().includes(lower)) {
      console.log(`from: ${from}`);
      for (const o of (r.outs || [])) console.log(`  -> ${o[0]} (${o[1]})`);
    }
  }
  console.log(`\n=== ANCESTOR rules in current-map index ===`);
  for (const r of ancestor) {
    if (!lower || String(r.from).toLowerCase().includes(lower)) {
      console.log(`from: ${r.from}`);
      for (const o of (r.outs || [])) console.log(`  -> ${o[0]} (${o[1]})`);
    }
  }
};

// Debug: check if a specific BP made it into the current map's index
window.debugDinoOnMap = (bpSubstr) => {
  const lower = String(bpSubstr).toLowerCase();
  console.log(`\n=== Searching for "${bpSubstr}" on map "${State.mapId}" ===`);

  // 1. Is the dino in Global.dinos?
  console.log("\n--- Global.dinos lookup ---");
  let found = false;
  for (const [bp, d] of Object.entries(Global.dinos?.dinos || {})){
    if (bp.toLowerCase().includes(lower)){
      found = true;
      console.log(`  FOUND in Global.dinos: ${bp.split('/').pop()}`);
      console.log(`    name: ${d?.n}, parent: ${d?.p?.split('/').pop()}`);
    }
  }
  if (!found) console.log("  NOT in Global.dinos");

  // 2. Is the dino in modBlueprintSet?
  if (!activeSourceIsOfficial()){
    const allowed = modBlueprintSet();
    let inMod = false;
    for (const bp of allowed){
      if (bp.toLowerCase().includes(lower)){
        inMod = true;
        console.log(`  IN modBlueprintSet: ${bp.split('/').pop()}`);
      }
    }
    if (!inMod) console.log("  NOT in modBlueprintSet (would be filtered out!)");
  }

  // 3. Is the dino in State.dinoToEntries (current map)?
  console.log("\n--- State.dinoToEntries (current map) ---");
  let inIdx = false;
  for (const [bp, entries] of State.dinoToEntries.entries()){
    if (bp.toLowerCase().includes(lower)){
      inIdx = true;
      console.log(`  FOUND: ${bp.split('/').pop()}`);
      console.log(`    in entries: ${entries.join(", ")}`);
    }
  }
  if (!inIdx) console.log("  NOT in State.dinoToEntries for this map");

  // 4. What entries on this map mention this BP in their raw data?
  console.log("\n--- Raw entry data search ---");
  for (const entryName of State.mapEntries){
    const rows = spawnRowsForEntry(entryName);
    for (const r of rows){
      const rawBp = String(r?.[0] || "");
      if (rawBp.toLowerCase().includes(lower)){
        console.log(`  in entry ${entryName}: rawBp=${rawBp.split('/').pop()}`);
        const outs = worldOutputsForBp(rawBp);
        for (const [obp, prob] of outs){
          console.log(`    -> ${obp.split('/').pop()} (${(prob*100).toFixed(1)}%)`);
        }
      }
    }
  }
};
