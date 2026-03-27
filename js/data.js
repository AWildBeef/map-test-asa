

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
