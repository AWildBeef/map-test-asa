

async function loadSelectedSource() {
  const srcId = UI.sourceSelect.value;
  const src = SOURCES.find(s => s.id === srcId);
  if (!src) return;

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

  }
  else {

    const mod = await loadJSON(src.file);

    Global.modMeta = mod;

    Global.spawn = {
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
        mod.entries || {}
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
        mod.worldReplacements || {}
      )
    };

    Global.dinos = {
      dinos: {
        ...(Global.baseDinos?.dinos || {}),
        ...(mod.dinos || {})
      }
    };

  }

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

    if (r?.exact){
      exact.set(fromBp, r);
    } else {
      ancestor.push(r);
    }
  }

  return { exact, ancestor };
}


function worldRuleIndexForCurrentMap(){
  const rules = worldRulesForCurrentMap();
  return buildWorldRuleIndex(rules);
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


function entryTotalExpected(entryName){

  const rows=Global.spawn?.entries?.[entryName]?.d||[];

  let sum=0;

  for(const r of rows){

    const gw=Number(r?.[1]||0);
    const sm=Number(r?.[2]||1);

    sum+=gw*sm;
  }

  return sum;
}


function entryRarityForBps(entryName, bpSet){

  const rows = Global.spawn?.entries?.[entryName]?.d || [];
  if (!rows.length) return 0;

  let totalExpected = 0;
  let matchedRarity = 0;

  for (const r of rows){
    const rawBp = normalizeBp(r?.[0]);
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

  const rows = Global.spawn?.entries?.[entryName]?.d || [];
  if (!rows.length) return 0;

  let totalExpected = 0;
  let rarity = 0;

  for (const r of rows){
    const rawBp = normalizeBp(r?.[0]);
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


async function buildSources(){
  const registry = await loadJSON("mods_registry.json");

  const mods = (registry.mods || []).map(m => ({
    id: String(m.id),
    name: m.name,
    label: m.name,
    file: `data/mods/${m.id}.json`,
    group: m.group || "",
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


function getDinoObjByBp(bp){
  const dinos = Global.dinos?.dinos || {};
  if (dinos[bp]) return dinos[bp];

  const cls = bpClass(bp);
  for (const [k, v] of Object.entries(dinos)){
    if (bpClass(k) === cls) return v;
  }

  return null;
}


function normalizeBp(bp){
  return String(bp || "").trim();
}


function getParentBp(bp){
  const d = Global.dinos?.dinos?.[bp];
  return normalizeBp(d?.p);
}


function ancestorDistance(childBp, ancestorBp){
  childBp = normalizeBp(childBp);
  ancestorBp = normalizeBp(ancestorBp);

  if (!childBp || !ancestorBp) return null;
  if (childBp === ancestorBp) return 0;

  let cur = childBp;
  let dist = 0;
  const seen = new Set();

  while (cur && !seen.has(cur) && dist < 200){
    seen.add(cur);
    cur = getParentBp(cur);
    dist += 1;
    if (cur === ancestorBp) return dist;
  }

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


function worldOutputsForBp(bp){
  bp = normalizeBp(bp);
  if (!bp) return [[bp, 1]];

  const { exact, ancestor } = worldRuleIndexForCurrentMap();

  function resolveOne(curBp, seen = new Set()){
    curBp = normalizeBp(curBp);
    if (!curBp) return [];

    if (seen.has(curBp)) {
      return [[curBp, 1]];
    }

    const nextSeen = new Set(seen);
    nextSeen.add(curBp);

    const exactRule = exact.get(curBp);
    if (exactRule) {
      const outs = Array.isArray(exactRule.outs) && exactRule.outs.length
        ? exactRule.outs
        : [[curBp, 1]];

      let finalOuts = [];
      for (const o of outs) {
        const nextBp = normalizeBp(o?.[0]);
        const nextProb = Number(o?.[1] || 0);
        if (!nextBp || nextProb <= 0) continue;

        const resolved = resolveOne(nextBp, nextSeen);
        for (const [rbp, rprob] of resolved) {
          finalOuts.push([rbp, nextProb * rprob]);
        }
      }

      return combineOutputWeights(finalOuts);
    }

    let bestRule = null;
    let bestDist = null;

    for (const r of ancestor) {
      const fromBp = normalizeBp(r?.from);
      if (!fromBp) continue;

      const dist = ancestorDistance(curBp, fromBp);
      if (dist == null) continue;

      if (bestRule === null || dist < bestDist) {
        bestRule = r;
        bestDist = dist;
      }
    }

    if (bestRule) {
      const outs = Array.isArray(bestRule.outs) && bestRule.outs.length
        ? bestRule.outs
        : [[curBp, 1]];

      let finalOuts = [];
      for (const o of outs) {
        const nextBp = normalizeBp(o?.[0]);
        const nextProb = Number(o?.[1] || 0);
        if (!nextBp || nextProb <= 0) continue;

        const resolved = resolveOne(nextBp, nextSeen);
        for (const [rbp, rprob] of resolved) {
          finalOuts.push([rbp, nextProb * rprob]);
        }
      }

      return combineOutputWeights(finalOuts);
    }

    return [[curBp, 1]];
  }

  return resolveOne(bp);
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
  if (mode === "dino") return State.names;
  if (mode === "entry") return State.entryList;
  if (mode === "crate") return State.crateNames;
  if (mode === "item") return State.itemNames;
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


function currentGeom(){
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  return Global.mapGeom.get(mapMeta?.geomShort);
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

  // --- normal crates on this map ---
  for (const crateClass of mapCrateClasses){
    const crateId = crateClassToId(crateClass);
    if (!Number.isInteger(crateId) || crateId < 0) continue;

    State.mapCrateIds.add(crateId);

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

  State.crateOptions.sort((a, b) => a.label.localeCompare(b.label));
  State.crateNames = State.crateOptions.map(x => x.value);

  // --- items on this map ---
  for (const [itemIdStr, refs] of Object.entries(loot.r || {})){
    const itemId = Number(itemIdStr);
    if (!Number.isInteger(itemId)) continue;

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

    const row = items.i?.[String(itemId)];
    if (!row) continue;

    const name = row.n || `Item ${itemId}`;

    if (!State.itemNameToIds.has(name)){
      State.itemNameToIds.set(name, []);
    }
    State.itemNameToIds.get(name).push(itemId);
  }

  for (const [name, ids] of State.itemNameToIds.entries()){
    State.itemNameToIds.set(name, [...new Set(ids)].sort((a,b)=>a-b));
  }

  State.itemNames = [...State.itemNameToIds.keys()].sort((a,b)=>a.localeCompare(b));
}


function crateItemSummary(crateClass){
  const crate = lootData().c?.[crateClass];
  if (!crate) return [];

  const seen = new Map();

  for (const row of (crate.s || [])){
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

      buildLootIndexes();

      // Rebuild current map-dependent loot data now that loot exists
      const mapMeta = MAPS.find(m => m.id === State.mapId);
      const geomShort = mapMeta?.geomShort;
      const geom = Global.mapGeom.get(geomShort);

      if (geom && geomShort) {
        const resolvedLegend = buildResolvedSupplyLegend(geom);
        Global.resolvedSupplyLegend.set(geomShort, resolvedLegend);
      }

      rebuildLootIndices();

      // If we're currently in a loot-dependent mode, refresh the UI
      if (State.mode === "crate" || State.mode === "item") {
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
  
  mkBtn({
    title: "Settings",
    icon: `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 1 0 12 8.5Z"
              fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1.2 1.2a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.8a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1.2-1.2a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.8a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1.2-1.2a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.8a1 1 0 0 1 1 1v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1.2 1.2a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a1 1 0 0 1 1 1v1.8a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.6Z"
              fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
      </svg>
    `,
    togglePanelId: "settingsPanel",
    onClick: () => toggleSettingsPanel()
  });

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

  const saved = State.selections[State.mode] || "";
  const visibleSelection = options.some(opt => opt.value === saved) ? saved : "";

  State.selection = visibleSelection;
  UI.dinoSelect.value = visibleSelection;

  UI.dinoSelect.onchange = () => {
    const newValue = UI.dinoSelect.value || "";
    State.selection = newValue;
    State.selections[State.mode] = newValue;
    render();
  };

  mountFancyDropdown(
    UI.dinoSelect,
    UI.dinoFancy,
    placeholder.replace(/[()]/g, "")
  );
}