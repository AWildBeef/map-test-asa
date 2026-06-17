function drawItem(itemName) {
  clearDraw();
  clearPois();

  const itemIds = (State.itemNameToIds.get(itemName) || [])
    .filter(id => State.mapItemIds.has(id));

  if (!itemIds.length) return;

  // --- visible normal/horde crate classes ---
  const visibleClasses = new Set();

  // --- visible mission classes ---
  const visibleMissionClasses = new Set();

  for (const itemId of itemIds) {
    // normal crate refs
    for (const crateId of crateIdsForItemId(itemId)) {
      if (!State.mapCrateIds.has(crateId)) continue;

      const crateValue = `crate:${crateId}`;
      const key = itemCrateVisibilityKey(itemName, crateValue);
      const visible = entryVisibility[key] ?? true;
      if (!visible) continue;

      const crateClass = crateIdToClass(crateId);
      if (crateClass) visibleClasses.add(crateClass);
    }

    // mission refs
    for (const missionClass of itemMissionRefsForItemId(itemId)) {
      const missionClassesOnMap = missionClassesUsedOnCurrentMap();
      if (!missionClassesOnMap.has(missionClass)) continue;

      const mission = lootData().m?.[missionClass];
      const structs = Array.isArray(mission?.ls) ? mission.ls : [];

      for (const structClass of structs) {
        if (!structClass || !lootData().ls?.[structClass]) continue;

        const crateValue = `mission:${missionClass}:${structClass}`;
        const key = itemCrateVisibilityKey(itemName, crateValue);
        const visible = entryVisibility[key] ?? true;
        if (!visible) continue;

        visibleMissionClasses.add(missionClass);
      }
    }
  }

  // supply crates
  const supplyRows = cratePoiRowsForItem(itemName).filter(p => {
    const poiClasses = poiCrateClasses(p) || [];
    return poiClasses.some(cls => visibleClasses.has(cls));
  });
  addSupplyCrateMarkers(supplyRows, { layer: mapObj.poiLayer });

  // horde crates
  const hordeRows = hordePoiRowsForItem(itemName).filter(p => {
    const poiClasses = poiCrateClasses(p) || [];
    return poiClasses.some(cls => visibleClasses.has(cls));
  });
  addHordeMarkers(hordeRows, { layer: mapObj.poiLayer });

  // missions
  const missionRows = (currentGeom()?.pois?.missions || []).filter(p => {
    for (const missionClass of visibleMissionClasses) {
      if (missionPointHasClass(p, missionClass)) return true;
    }
    return false;
  });
  addMissionMarkers(missionRows, { layer: mapObj.poiLayer });
}

function getSelectedItem(itemName){
  const ids = State.itemNameToIds.get(itemName) || [];
  if (!ids.length) return null;

  const firstId = ids[0];
  return {
    ids,
    id: firstId,
    name: itemDisplayNameById(firstId),
    blueprint: itemBlueprintById(firstId),
    class: itemData().i?.[String(firstId)]?.c || ""
  };
}

function visibleCrateClassesForItem(itemName){
  const itemIds = (State.itemNameToIds.get(itemName) || [])
    .filter(id => State.mapItemIds.has(id));

  const out = new Set();

  for (const itemId of itemIds){
    for (const crateId of crateIdsForItemId(itemId)){
      if (!State.mapCrateIds.has(crateId)) continue;

      const crateValue = `crate:${crateId}`;
      const key = itemCrateVisibilityKey(itemName, crateValue);
      const visible = entryVisibility[key] ?? true;
      if (!visible) continue;

      const crateClass = crateIdToClass(crateId);
      if (crateClass) out.add(crateClass);
    }
  }

  return out;
}



/* ============================================================
   ITEM METADATA HELPERS
   Reads the new fields from items_global.json (v5.13+).
============================================================ */

// Get the raw item row from items_global
function itemRowById(id){
  if (id == null) return null;
  return itemData().i?.[String(id)] || null;
}

// Item type name from type id
function itemTypeName(typeId){
  if (typeId == null) return "";
  return itemData().it?.[String(typeId)] || "";
}

// Item stat name from stat id
function itemStatName(statId){
  if (statId == null) return "";
  return itemData().is?.[String(statId)] || `Stat ${statId}`;
}

// Engram group name (e.g. "ARK_SCORCHEDEARTH")
function engramGroupName(groupId){
  if (groupId == null) return "";
  return itemData().eg?.[String(groupId)] || "";
}

// Look up an engram row by id (engrams live under items_global.e)
function engramRowById(id){
  if (id == null) return null;
  return itemData().e?.[String(id)] || null;
}

// Returns the engram(s) associated with an item. e may be a single id or an array.
function engramRowsForItem(itemRow){
  if (!itemRow?.e && itemRow?.e !== 0) return [];
  const raw = itemRow.e;
  const ids = Array.isArray(raw) ? raw : [raw];
  return ids.map(id => ({ id, row: engramRowById(id) })).filter(x => x.row);
}

// Build a full blueprint path from an engram row
function engramBlueprintPath(engramRow){
  if (!engramRow) return "";
  const path = itemData().p?.[String(engramRow.p)] || "";
  const cls  = engramRow.c || "";
  if (!path || !cls) return "";
  return `${path}${cls}.${cls}_C`;
}

// Build full blueprint for an item by row (rather than by id)
function itemBlueprintByRow(row){
  if (!row) return "";
  const path = itemData().p?.[String(row.p)] || "";
  const cls  = row.c || "";
  return path && cls ? `${path}${cls}.${cls}_C` : "";
}

// Look up a "station" (a crafting structure item) by item id → display name
function craftingStationName(stationItemId){
  const row = itemRowById(stationItemId);
  return row?.n || `Item ${stationItemId}`;
}



// Current command parameters (from infoPanelState)
function currentCmdParams(){
  return {
    qty:     Math.max(1, Number(infoPanelState.itemCmdQty || 1)),
    quality: Math.max(0, Number(infoPanelState.itemCmdQuality || 0)),
    isBp:    infoPanelState.itemCmdIsBp ? 1 : 0,
  };
}

// Generates the cheat GFI command
function gfiCommandForItem(itemRow){
  if (!itemRow?.c) return "";
  let cls = itemRow.c;
  cls = cls.replace(/^PrimalItem(Ammo|Armor|Consumable|Resource|Structure|Weapon|Equip|Dye|Skin|Trophy)?_/, "");
  const { qty, quality, isBp } = currentCmdParams();
  return `cheat GFI ${cls} ${qty} ${quality} ${isBp}`;
}

// Generates the cheat giveitem command
function giveItemCommandForItem(itemRow){
  const bp = itemBlueprintByRow(itemRow);
  if (!bp) return "";
  const { qty, quality, isBp } = currentCmdParams();
  return `cheat giveitem "Blueprint'${bp}'" ${qty} ${quality} ${isBp}`;
}

// Generates the cheat UnlockEngram command from an engram row
function unlockEngramCommand(engramRow){
  const bp = engramBlueprintPath(engramRow);
  if (!bp) return "";
  return `cheat UnlockEngram "Blueprint'${bp}'"`;
}

function renderItemHero(it){
  const itemRow = itemRowById(it.id);
  const gfiCmd   = gfiCommandForItem(itemRow);
  const giveCmd  = giveItemCommandForItem(itemRow);

  // Command parameter controls (same data attributes; chip styling)
  const p = currentCmdParams();
  const paramsHtml = (gfiCmd || giveCmd) ? `
    <div class="iv-cmd-row">
      <label class="iv-cmd-input">
        <span>Qty</span>
        <input type="number" min="1" step="1"
          data-cmd-param="qty" value="${p.qty}">
      </label>
      <label class="iv-cmd-input">
        <span>Quality</span>
        <input type="number" min="0" step="1"
          data-cmd-param="quality" value="${p.quality}">
      </label>
      <label class="iv-cmd-input iv-cmd-bp ${p.isBp ? "on" : ""}">
        <input type="checkbox" data-cmd-param="isBp" ${p.isBp ? "checked" : ""}>
        <span class="iv-bp-dot"></span>
        <span>Blueprint</span>
      </label>
    </div>
  ` : "";

  return `
    <div class="entry-hero">
      <div class="entry-hero-title">${escapeHtml(it.name)}</div>

      ${(gfiCmd || giveCmd) ? `
        ${paramsHtml}
        ${gfiCmd ? `
          <div class="iv-cmd-line copy-on-click" data-copy="${escapeAttr(gfiCmd)}">
            <span class="iv-cmd-tag">GFI</span>
            <div class="iv-cmd-text">${escapeHtml(gfiCmd)}</div>
          </div>
        ` : ""}
        ${giveCmd ? `
          <div class="iv-cmd-line copy-on-click" data-copy="${escapeAttr(giveCmd)}">
            <span class="iv-cmd-tag">GIVE</span>
            <div class="iv-cmd-text">${escapeHtml(giveCmd)}</div>
          </div>
        ` : ""}
        <div class="iv-cmd-hint">tap a command to copy</div>
      ` : ""}
    </div>
  `;
}

// Renders a single labeled meta cell (used by the metaGrid below)
function _metaCell(label, value){
  if (value == null || value === "") return "";
  return `
    <div class="meta-cell">
      <div class="meta-stack">
        <div class="meta-label">${escapeHtml(label)}</div>
        <div class="meta-value">${value}</div>
      </div>
    </div>
  `;
}

function renderItemTabInfo(it){
  const itemRow = itemRowById(it.id);

  // ── Class / Blueprint as tagged mono rows ──
  // Data stores the class without the _C suffix; restore it for display/copy.
  const clsFull = it.class
    ? (String(it.class).endsWith("_C") ? it.class : `${it.class}_C`)
    : "";
  const idsHtml = `
    <div class="info-section">
      ${clsFull ? `
        <div class="iv-cmd-line copy-on-click" data-copy="${escapeAttr(clsFull)}">
          <span class="iv-cmd-tag">CLASS</span>
          <div class="iv-cmd-text">${escapeHtml(clsFull)}</div>
        </div>` : ``}
      ${it.blueprint ? `
        <div class="iv-cmd-line copy-on-click" data-copy="${escapeAttr(it.blueprint)}">
          <span class="iv-cmd-tag">BP</span>
          <div class="iv-cmd-text">${escapeHtml(it.blueprint)}</div>
        </div>` : ``}
    </div>
  `;

  if (!itemRow) {
    return idsHtml;
  }

  const typeName = itemTypeName(itemRow.t);
  const weight   = itemRow.w;
  const stack    = itemRow.st;
  const cxp      = itemRow.cxp;
  const qty      = itemRow.q;
  const itemIx   = itemRow.ix;  // master item index (game's internal index)

  const stats = Array.isArray(itemRow.s) ? itemRow.s : [];
  const reqs  = Array.isArray(itemRow.cr) ? itemRow.cr : [];
  const stations = Array.isArray(itemRow.cs) ? itemRow.cs : [];

  // ── General info: chips ──
  const chip = (label, val) => (val == null || val === "")
    ? ""
    : `<span class="lc-chip">${escapeHtml(label)} <b>${val}</b></span>`;

  const generalChips = [
    chip("Type",        typeName ? escapeHtml(typeName) : ""),
    chip("Item Index",  itemIx   != null ? escapeHtml(String(itemIx)) : ""),
    chip("Weight",      weight   != null ? escapeHtml(fmt(weight))    : ""),
    chip("Stack",       stack    != null ? escapeHtml(fmt(stack))     : ""),
    chip("Crafted Qty", (qty != null && qty > 1) ? escapeHtml(fmt(qty)) : ""),
    chip("Crafting XP", cxp      != null ? escapeHtml(fmt(cxp))       : ""),
  ].filter(Boolean).join("");

  const generalHtml = generalChips
    ? `<div class="info-section">
         <div class="iv-eyebrow">General</div>
         <div class="lc-chips">${generalChips}</div>
       </div>`
    : "";

  // ── Stats: chips ──
  const statsHtml = stats.length
    ? `<div class="info-section">
         <div class="iv-eyebrow">Item Stats</div>
         <div class="lc-chips">
           ${stats.map(([statId, val]) => chip(itemStatName(statId), escapeHtml(fmt(val)))).join("")}
         </div>
       </div>`
    : "";

  // ── Crafting Costs + Crafted In ──
  const craftingHtml = reqs.length
    ? `<div class="info-section">
         <div class="iv-eyebrow">Crafting Costs</div>
         <div class="iv-recipe">
           ${reqs.map(([reqId, reqQty]) => `
             <div class="iv-recipe-row">
               <span class="item-link" data-item-link-id="${escapeAttr(String(reqId))}">${escapeHtml(itemDisplayNameById(reqId))}</span>
               <span class="iv-recipe-qty">× ${escapeHtml(String(reqQty))}</span>
             </div>
           `).join("")}
         </div>
         <div class="iv-eyebrow">Crafted In</div>
         <div class="lc-chips">
           ${
             stations.length
               ? stations.map(id =>
                   `<span class="lc-chip iv-station"><span class="item-link" data-item-link-id="${escapeAttr(String(id))}">${escapeHtml(craftingStationName(id))}</span></span>`
                 ).join("")
               : `<span class="lc-chip iv-station"><em>Player Inventory</em></span>`
           }
         </div>
       </div>`
    : "";

  return `${idsHtml}${generalHtml}${statsHtml}${craftingHtml}`;
}


// ── New Engram tab ────────────────────────────────────────────
function renderItemTabEngram(it){
  const itemRow = itemRowById(it.id);
  if (!itemRow) return `<div class="info-section"><div class="info-empty">No engram data</div></div>`;
  const engramRows = engramRowsForItem(itemRow);
  if (!engramRows.length) return `<div class="info-section"><div class="info-empty">No engram data</div></div>`;

  return engramRows.map(({ id, row }) => {
    const groupName = row.g != null ? engramGroupName(row.g) : "";
    const engBp     = engramBlueprintPath(row);
    const unlockCmd = unlockEngramCommand(row);

    // Prereq names
    let preNames = [];
    if (Array.isArray(row.pre) && row.pre.length){
      const preIds = row.pre.flat().filter(x => x != null);
      preNames = preIds.map(pid => {
        const pre = engramRowById(pid);
        return pre?.c?.replace(/^EngramEntry_/, "").replace(/_C$/, "") || `Engram ${pid}`;
      });
    }

    const chip = (label, val) => (val == null || val === "")
      ? ""
      : `<span class="lc-chip">${escapeHtml(label)} <b>${val}</b></span>`;

    const chips = [
      chip("Unlock Level",  row.lvl != null ? escapeHtml(String(row.lvl)) : ""),
      chip("Engram Points", row.pts != null ? escapeHtml(String(row.pts)) : ""),
      chip("Index",         row.ix  != null ? escapeHtml(String(row.ix))  : ""),
      chip("Group",         groupName ? escapeHtml(groupName) : ""),
    ].filter(Boolean).join("");

    return `
      <div class="info-section">
        ${chips ? `<div class="lc-chips" style="margin-top:4px;">${chips}</div>` : ""}

        ${preNames.length ? `
          <div class="iv-eyebrow">Prerequisites</div>
          <div class="lc-chips">
            ${preNames.map(n => `<span class="lc-chip iv-station">${escapeHtml(n)}</span>`).join("")}
          </div>
        ` : ""}

        ${engBp ? `
          <div class="iv-eyebrow">Engram Blueprint</div>
          <div class="iv-cmd-line copy-on-click" data-copy="${escapeAttr(engBp)}">
            <span class="iv-cmd-tag">BP</span>
            <div class="iv-cmd-text">${escapeHtml(engBp)}</div>
          </div>
        ` : ""}

        ${unlockCmd ? `
          <div class="iv-eyebrow">Unlock Command</div>
          <div class="iv-cmd-line copy-on-click" data-copy="${escapeAttr(unlockCmd)}">
            <span class="iv-cmd-tag">CMD</span>
            <div class="iv-cmd-text">${escapeHtml(unlockCmd)}</div>
          </div>
        ` : ""}
      </div>
    `;
  }).join("");
}

function itemCrateVisibilityKey(itemName, crateRef){
  return `${State.mapId}::item::${itemName}::crate::${crateRef}`;
}

// ── Probability helpers (exact, based on validated roll formula) ──

// Distribution of k = round(min + (max-min) * r^power), r ~ Uniform(0,1).
// Returns Map of k -> probability. Power < 1 forces max (confirmed quirk).
function rollCountDistribution(min, max, power){
  if (min == null && max == null) return new Map([[1, 1]]);
  if (min == null) min = max;
  if (max == null) max = min;
  if (min === max) return new Map([[Math.round(min), 1]]);

  const p = power ?? 1.0;
  if (p < 1.0) return new Map([[Math.round(max), 1]]);  // Power<1 quirk: always max

  const lo = Math.min(min, max), hi = Math.max(min, max);
  const span = hi - lo;
  const dist = new Map();
  for (let k = Math.round(lo); k <= Math.round(hi); k++){
    // r-interval where round(lo + span * r^p) === k
    const aFrac = Math.max(0, Math.min(1, (k - 0.5 - lo) / span));
    const bFrac = Math.max(0, Math.min(1, (k + 0.5 - lo) / span));
    const a = Math.pow(aFrac, 1 / p);
    const b = Math.pow(bFrac, 1 / p);
    const prob = Math.max(0, b - a);
    if (prob > 0) dist.set(k, prob);
  }
  // Normalize float dust
  let s = 0; dist.forEach(v => { s += v; });
  if (s > 0 && Math.abs(s - 1) > 1e-9) dist.forEach((v, k) => dist.set(k, v / s));
  return dist;
}

// Exact P(target included in k weighted draws WITHOUT replacement).
// Memoized recursion over removed-set bitmask; falls back to the
// with-replacement formula for big pools where recursion is too costly.
function pIncludedWithoutReplacement(weights, targetIdx, k){
  const n = weights.length;
  if (k >= n) return 1.0;
  if (k <= 0) return 0.0;
  const totalAll = weights.reduce((s, w) => s + (w || 0), 0);
  if (totalAll <= 0 || (weights[targetIdx] || 0) <= 0) return 0.0;

  if (n > 14 || k > 10){
    const p = (weights[targetIdx] || 0) / totalAll;
    return 1 - Math.pow(1 - p, k);
  }

  const memo = new Map();
  function notPicked(mask, d){
    if (d <= 0) return 1;
    const key = mask * 16 + d;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let total = 0;
    for (let i = 0; i < n; i++){
      if (!(mask & (1 << i))) total += (weights[i] || 0);
    }
    if (total <= 0) { memo.set(key, 1); return 1; }
    let acc = 0;
    for (let i = 0; i < n; i++){
      if (mask & (1 << i)) continue;
      if (i === targetIdx) continue;       // picking the target breaks "not picked"
      const w = weights[i] || 0;
      if (w <= 0) continue;
      acc += (w / total) * notPicked(mask | (1 << i), d - 1);
    }
    memo.set(key, acc);
    return acc;
  }
  return 1 - notPicked(0, k);
}

// P(target fires at least once) averaged over the exact roll-count
// distribution. rwr=true uses the exact without-replacement math.
function pFiresAtLeastOnce(weights, targetIdx, countDist, rwr){
  const total = weights.reduce((s, w) => s + (w || 0), 0);
  if (total <= 0) return 0;
  const p = (weights[targetIdx] || 0) / total;
  let acc = 0;
  countDist.forEach((prob, k) => {
    let pk;
    if (rwr) pk = pIncludedWithoutReplacement(weights, targetIdx, k);
    else pk = 1 - Math.pow(1 - p, k);
    acc += prob * pk;
  });
  return Math.min(1, Math.max(0, acc));
}

function distMean(dist){
  let m = 0;
  dist.forEach((prob, k) => { m += prob * k; });
  return m;
}

// Returns the loot set name and entry details for a specific item within a crate
function itemLootDetail(itemId, crateId){
  const crateClass = crateIdToClass(crateId);
  if (!crateClass) return [];

  const crate = lootData().c?.[crateClass];
  if (!crate) return [];

  const out = [];
  const sets = crate.s || [];

  // Crate-level context
  const setWeights = sets.map(r => r?.w || 0);
  const totalSetWeight = setWeights.reduce((s, w) => s + w, 0) || 1;
  const crateMin = crate.mn ?? 1;
  const crateMax = crate.mx ?? crateMin;
  const crateNsp = crate.nsp ?? 1.0;
  const crateRwr = crate.rwr === true;
  const picksDist = rollCountDistribution(crateMin, crateMax, crateNsp);

  const rRows = lootData().r?.[String(itemId)] || [];
  for (const r of rRows){
    if (!Array.isArray(r) || typeof r[0] !== "number") continue;
    if (r[0] !== crateId) continue;

    const setIdx   = r[1] ?? 0;
    const entryIdx = r[2] ?? 0;
    const set      = sets[setIdx];
    if (!set) continue;

    const { allEntries, setMeta } = lootSetEntriesFromRow(set);
    const entry = allEntries[entryIdx];
    if (!entry) continue;

    // --- Step 1: P(this set fires at least once) ---
    const pSetFires = pFiresAtLeastOnce(setWeights, setIdx, picksDist, crateRwr);

    // --- Step 2: P(this entry fires at least once | set fired) ---
    // Override loot-set values trump the crate's inline slot values.
    const smn = setMeta?.smn ?? set.smn ?? 1;
    const smx = setMeta?.smx ?? set.smx ?? smn;
    const setNip = setMeta?.nip ?? set.nip ?? 1.0;
    const setRwr = (setMeta?.rwr ?? set.rwr) === true;

    const drawsDist = rollCountDistribution(smn, smx, setNip);
    const entryWeights = allEntries.map(e => e?.w || 0);
    const totalEntryWeight = entryWeights.reduce((s, w) => s + w, 0) || 1;
    const pEntryFires = pFiresAtLeastOnce(entryWeights, entryIdx, drawsDist, setRwr);

    // --- Step 3: P(this item picked | entry fired) ---
    const itemIds = Array.isArray(entry.i) ? entry.i : [];
    const iw = Array.isArray(entry.iw) ? entry.iw : [];
    const numItems = itemIds.length || 1;
    const usesItemWeights = iw.length > 0 && iw.length === itemIds.length;

    let pItemPick, itemWeight = null, itemWeightTotal = null;
    if (usesItemWeights){
      const itemIdx = itemIds.indexOf(itemId);
      itemWeightTotal = iw.reduce((s, w) => s + (w || 0), 0) || 1;
      itemWeight = itemIdx >= 0 ? (iw[itemIdx] || 0) : null;
      pItemPick = itemWeight != null ? itemWeight / itemWeightTotal : (1 / numItems);
    } else {
      pItemPick = 1 / numItems;
    }

    // Quantity = number of picks from the pool (when aq=false)
    const qtyMin = entry.mn ?? 1;
    const qtyMax = entry.mx ?? qtyMin;
    const qp = entry.qp ?? 1.0;
    const isStack = isTrue01(entry.aq);
    const qtyDist = rollCountDistribution(qtyMin, qtyMax, qp);

    let pItemAppears;
    if (isStack){
      pItemAppears = pItemPick;  // one pick, quantity stacks onto it
    } else {
      // Item picks within an entry are with-replacement; average over qty dist
      let acc = 0;
      qtyDist.forEach((prob, q) => {
        acc += prob * (1 - Math.pow(1 - pItemPick, Math.max(1, q)));
      });
      pItemAppears = acc;
    }
    pItemAppears = Math.min(1, Math.max(0, pItemAppears));

    // --- Step 4: ChanceToActuallyGiveItem ---
    const cg = entry.cg ?? 1.0;

    const pCombined = pSetFires * pEntryFires * pItemAppears * cg;

    out.push({
      setName:   lootSetNameFromRow(set, `Set ${setIdx + 1}`),
      setWeight: set.w ?? null,
      w:   entry.w   ?? null,
      mn:  entry.mn  ?? null,
      mx:  entry.mx  ?? null,
      q1:  entry.q1  ?? null,
      q2:  entry.q2  ?? null,
      b:   entry.b   ?? null,
      fb:  entry.fb  ?? null,
      prob: {
        // step 1
        setChance:   pSetFires,
        setWeight:   set.w ?? 0,
        setWeightTotal: totalSetWeight,
        numSets:     sets.length,
        picksMin:    crateMin,
        picksMax:    crateMax,
        picksMean:   distMean(picksDist),
        crateRwr,
        // step 2
        entryName:   entry.n || `Entry ${entryIdx + 1}`,
        entryChance: pEntryFires,
        entryWeight: entry.w ?? 0,
        entryWeightTotal: totalEntryWeight,
        numEntries:  allEntries.length,
        drawsMin:    smn,
        drawsMax:    smx,
        drawsMean:   distMean(drawsDist),
        setRwr,
        // step 3
        itemChance:  pItemAppears,
        pItemPick,
        numItems,
        usesItemWeights,
        itemWeight,
        itemWeightTotal,
        qtyMin,
        qtyMax,
        qtyMean:     distMean(qtyDist),
        isStack,
        // step 4
        cgChance:    cg,
        combined:    pCombined,
      }
    });
  }

  const seen = new Set();
  return out.filter(d => {
    const key = `${d.setName}::${d.prob?.entryName}::${d.w}::${d.mn}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function itemCrateIsOpen(itemName, crateValue){
  return itemCrateOpenState[`${itemName}::${crateValue}`] ?? true;
}

function itemCrateSetOpen(itemName, crateValue, open){
  itemCrateOpenState[`${itemName}::${crateValue}`] = !!open;
}

function renderItemTabCrates(it){
  const itemIds = Array.isArray(it?.ids) ? it.ids : (it?.id != null ? [it.id] : []);
  const crateMap = new Map();
  const missionMap = new Map();

  for (const itemId of itemIds){
    for (const crateId of crateIdsForItemId(itemId)){
      if (!State.mapCrateIds.has(crateId)) continue;

      if (!crateMap.has(crateId)){
        const meta = crateMetaById(crateId) || {};
        crateMap.set(crateId, {
          crateId,
          crateValue: `crate:${crateId}`,
          name: crateDisplayNameById(crateId),
          level: meta.l ?? null,
          details: []
        });
      }

      const detail = itemLootDetail(itemId, crateId);
      if (detail.length) crateMap.get(crateId).details.push(...detail);
    }

    for (const missionClass of itemMissionRefsForItemId(itemId)){
      const missionClassesOnMap = missionClassesUsedOnCurrentMap();
      if (!missionClassesOnMap.has(missionClass)) continue;

      const mission = lootData().m?.[missionClass];
      const structs = Array.isArray(mission?.ls) ? mission.ls : [];

      for (const structClass of structs){
        if (!structClass || !lootData().ls?.[structClass]) continue;

        const key = `mission:${missionClass}:${structClass}`;
        if (!missionMap.has(key)){
          missionMap.set(key, {
            crateValue: key,
            missionClass,
            structClass,
            name: missionDisplayName(missionClass),
            level: null,
            details: []
          });
        }
      }
    }
  }

  const rows = [
    ...[...crateMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    ...[...missionMap.values()].sort((a, b) => a.name.localeCompare(b.name))
  ];

  if (!rows.length){
    return `<div style="color:var(--muted); padding:8px 4px;">No crate or mission sources found on this map.</div>`;
  }

  const allOn = rows.every(row => {
    const key = itemCrateVisibilityKey(it.name, row.crateValue);
    return entryVisibility[key] ?? true;
  });

  return `
    <div class="info-section">
      <div class="mode-menu-like-list">
        ${rows.map(row => {
          const visKey = itemCrateVisibilityKey(it.name, row.crateValue);
          const isOn = entryVisibility[visKey] ?? true;
          const isOpen = itemCrateIsOpen(it.name, row.crateValue);

          // Probability formatting with better precision for small values
          const fmtP = (p) => {
            if (p >= 0.995) return "100%";
            if (p >= 0.01) return Math.round(p * 100) + "%";
            if (p >= 0.001) return (p * 100).toFixed(1) + "%";
            if (p > 0) return (p * 100).toFixed(2) + "%";
            return "0%";
          };

          // Combined probability across all paths
          const pathProbs = (row.details || []).map(d => d.prob?.combined || 0);
          const pNone = pathProbs.reduce((prod, p) => prod * (1 - p), 1);
          const pCombined = 1 - pNone;
          const pctLabel = pCombined > 0 ? `~${fmtP(pCombined)}` : null;

          // BP chance: collect from all paths
          const bpChances = (row.details || [])
            .map(d => isTrue01(d.fb) ? 1.0 : (d.b ?? null))
            .filter(v => v != null);
          const bpLabel = bpChances.length
            ? (bpChances.some(v => v >= 1) ? "Always BP"
              : bpChances.every(v => v === 0) ? null
              : `${Math.round(Math.max(...bpChances) * 100)}% BP`)
            : null;

          const detailHtml = row.details?.length ? `
            <div class="item-loot-details">
              ${row.details.map(d => {
                const p = d.prob;
                if (!p){
                  return `
                    <div class="item-loot-detail">
                      <div class="item-loot-set-name">${escapeHtml(d.setName)}</div>
                    </div>`;
                }

                // Step 1 narrative
                const picksLabel = p.picksMin === p.picksMax
                  ? `${fmt(p.picksMin)}`
                  : `${fmt(p.picksMin)} - ${fmt(p.picksMax)} (avg ${p.picksMean.toFixed(1)})`;
                const setRwrNote = p.crateRwr ? "no repeats" : "repeats allowed";

                // Step 2 narrative
                const drawsLabel = p.drawsMin === p.drawsMax
                  ? `${fmt(p.drawsMin)}`
                  : `${fmt(p.drawsMin)} - ${fmt(p.drawsMax)} (avg ${p.drawsMean.toFixed(1)})`;
                const entryRwrNote = p.setRwr ? "no repeats" : "repeats allowed";

                // Step 3 narrative
                const poolDesc = p.usesItemWeights && p.itemWeight != null
                  ? `weight ${fmt(p.itemWeight)} of ${fmt(p.itemWeightTotal)} total across ${p.numItems} items`
                  : `1 of ${p.numItems} items, equal weights`;
                const qtyLabel = p.qtyMin === p.qtyMax
                  ? `${fmt(p.qtyMin)}`
                  : `${fmt(p.qtyMin)} - ${fmt(p.qtyMax)} (avg ${p.qtyMean.toFixed(1)})`;
                const pickDesc = p.isStack
                  ? `1 pick (quantity ${qtyLabel} stacks onto it)`
                  : `${qtyLabel} pick${p.qtyMax > 1 ? "s" : ""} from the pool`;

                const hasCg = p.cgChance < 1;
                const combinedParts = [fmtP(p.setChance), fmtP(p.entryChance), fmtP(p.itemChance)];
                if (hasCg) combinedParts.push(fmtP(p.cgChance));

                return `
                <div class="item-loot-detail">
                  <div class="item-loot-set-name">${escapeHtml(d.setName)}${` <span class="item-weight-pct">— ${fmtP(p.combined)} per crate</span>`}</div>

                  <div class="prob-steps">
                    <div class="prob-step">
                      <div class="prob-step-title">1. Set must be chosen</div>
                      <div class="prob-step-detail">Weight ${escapeHtml(fmt(p.setWeight))} of ${escapeHtml(fmt(p.setWeightTotal))} total across ${p.numSets} sets · crate picks ${escapeHtml(picksLabel)} set${p.picksMax !== 1 ? "s" : ""} · ${setRwrNote}</div>
                      <div class="prob-step-result">→ ${fmtP(p.setChance)}</div>
                    </div>

                    <div class="prob-step">
                      <div class="prob-step-title">2. Entry "${escapeHtml(p.entryName)}" must be drawn</div>
                      <div class="prob-step-detail">Weight ${escapeHtml(fmt(p.entryWeight))} of ${escapeHtml(fmt(p.entryWeightTotal))} total across ${p.numEntries} entries · set draws ${escapeHtml(drawsLabel)} entr${p.drawsMax !== 1 ? "ies" : "y"} · ${entryRwrNote}</div>
                      <div class="prob-step-result">→ ${fmtP(p.entryChance)}</div>
                    </div>

                    <div class="prob-step">
                      <div class="prob-step-title">3. Item must be picked</div>
                      <div class="prob-step-detail">${escapeHtml(poolDesc)} · ${escapeHtml(pickDesc)}</div>
                      <div class="prob-step-result">→ ${fmtP(p.itemChance)}</div>
                    </div>

                    ${hasCg ? `
                      <div class="prob-step">
                        <div class="prob-step-title">4. Drop chance filter</div>
                        <div class="prob-step-detail">This entry only actually gives its item ${fmtP(p.cgChance)} of the time</div>
                        <div class="prob-step-result">→ ${fmtP(p.cgChance)}</div>
                      </div>
                    ` : ""}

                    <div class="prob-combined">${combinedParts.join(" × ")} = ${fmtP(p.combined)}</div>
                  </div>

                  ${
                    (d.q1 != null || d.q2 != null) && typeof renderQualityRibbon === "function"
                      ? renderQualityRibbon(d.q1, d.q2)
                      : (d.q1 != null || d.q2 != null)
                        ? `<div class="crate-note" style="margin-top:4px;">Quality: ${escapeHtml(fmtRange(d.q1, d.q2))}</div>`
                        : ``
                  }
                  ${isTrue01(d.fb) ? `<div class="crate-note">Always a blueprint</div>` : ``}
                </div>
              `}).join("")}
            </div>
          ` : "";

          return `
            <div class="item-crate-card iv-crate ${isOn ? "is-on" : ""} ${isOpen ? "is-open" : "is-closed"}">

              <div class="iv-crate-head">
                <button
                  type="button"
                  class="iv-crate-main"
                  data-item-crate-toggle="1"
                  data-key="${escapeAttr(visKey)}"
                  data-crate-value="${escapeAttr(row.crateValue)}"
                  title="Toggle map visibility"
                >
                  <span class="iv-eye"></span>
                  <span class="iv-crate-namewrap">
                    <span class="iv-crate-name">${escapeHtml(row.name)}</span>
                    <span class="iv-crate-lvl">${row.level != null ? `Req Level ${escapeHtml(String(row.level))}` : "Mission Source"}${bpLabel ? ` · ${escapeHtml(bpLabel)}` : ``}</span>
                  </span>
                  ${pctLabel ? `<span class="iv-crate-pct">${pctLabel}</span>` : ``}
                </button>

                <button
                  type="button"
                  class="iv-crate-exp"
                  data-item-crate-expand="${escapeAttr(row.crateValue)}"
                  title="${isOpen ? "Collapse" : "Expand"} details"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                    <path d="${isOpen ? "M6 9l6 6 6-6" : "M6 15l6-6 6 6"}"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>

              ${
                pCombined > 0
                  ? `<div class="lc-pbar"><i style="width:${Math.max(2, Math.round(pCombined * 100))}%"></i></div>`
                  : ``
              }

              ${isOpen ? `
                <div class="item-crate-card-body">
                  ${detailHtml}
                  <button
                    type="button"
                    class="fp-btn"
                    data-open-crate="${escapeAttr(row.crateValue)}"
                    title="Open in crate view"
                    style="margin-top:6px; width:100%; justify-content:center;"
                  >Open in Crate View ›</button>
                </div>
              ` : ""}
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}


// Bosses tab: which bosses on this map drop or unlock this item,
// rendered as collapsible sections matching the crate tab style.
function renderItemTabBosses(entries, itemIds){
  if (!entries || !entries.length){
    return `<div class="info-section"><div class="boss-empty">No boss sources found.</div></div>`;
  }

  const fmtQty = (mn, mx) => {
    const lo = Number(mn), hi = Number(mx);
    if (!Number.isFinite(lo) && !Number.isFinite(hi)) return "";
    if (Number.isFinite(lo) && Number.isFinite(hi) && lo !== hi) return `${fmt(lo)}–${fmt(hi)}`;
    return fmt(Number.isFinite(hi) ? hi : lo);
  };

  // Group by boss name, merging types (a boss can be both "drop" and "unlock").
  const byBoss = new Map();
  for (const e of entries){
    if (!byBoss.has(e.name)) byBoss.set(e.name, { name: e.name, boss: e.boss, types: new Set() });
    byBoss.get(e.name).types.add(e.type);
  }

  // Look up the item's quantity in a boss's rewards.
  function getQty(boss, ids){
    if (!boss?.rewards) return "";
    const idSet = new Set(ids);
    for (const d of (boss.rewards.drops || []))
      if (idSet.has(d.id)) return fmtQty(d.mn, d.mx);
    for (const d of (boss.rewards.given || []))
      if (idSet.has(d.id)) return "1";
    for (const d of (boss.rewards.bonusItems || []))
      if (idSet.has(d.id)) return "1";
    return "";
  }

  // Separate drops and unlocks.
  const dropEntries = [...byBoss.values()].filter(e => e.types.has("drop"));
  const unlockEntries = [...byBoss.values()].filter(e => e.types.has("unlock") && !e.types.has("drop"));

  function renderBossRow(entry){
    const boss = entry.boss;
    const qty = getQty(boss, itemIds);

    // Pull difficulty out of names like "Broodmother (Gamma)" for a pill
    let dispName = entry.name;
    let difHtml = "";
    const m = /^(.*)\s*\((Gamma|Beta|Alpha)\)\s*$/i.exec(entry.name);
    if (m){
      dispName = m[1].trim();
      const dif = m[2].toLowerCase();
      const cls = dif === "gamma" ? "g" : dif === "beta" ? "b" : "a";
      difHtml = `<span class="iv-dif ${cls}">${escapeHtml(m[2])}</span>`;
    }

    // Info: show min level. Use combined label unless craft and teleport
    // are both present AND different.
    const cl = boss?.craftLevel;
    const tl = boss?.teleportLevel;
    let metaLine = "";
    if (cl != null && tl != null && cl !== tl){
      metaLine = `Min level to summon: ${cl} · teleport: ${tl}`;
    } else if (cl != null || tl != null){
      metaLine = `Min level for boss: ${cl ?? tl}`;
    }

    return `
      <div class="loot-set-section iv-boss is-closed">
        <button type="button" class="iv-boss-head" data-boss-item-toggle>
          ${qty ? `<span class="iv-boss-qty">${escapeHtml(qty)}×</span>` : ``}
          <span class="iv-boss-name">${escapeHtml(dispName)}</span>
          ${difHtml}
          <span class="iv-boss-chev">›</span>
        </button>
        ${metaLine ? `<div class="iv-boss-sub">${escapeHtml(metaLine)}</div>` : ``}
        <div class="loot-set-body" style="display:none;">
          <button type="button" class="fp-btn" data-open-boss="${escapeHtml(entry.name)}" style="margin-top:2px; width:100%; justify-content:center;">Open in Boss View ›</button>
        </div>
      </div>`;
  }

  let html = "";

  if (dropEntries.length){
    html += `<div class="info-section">
      <div class="iv-eyebrow">Boss Rewards</div>
      ${dropEntries.map(renderBossRow).join("")}
    </div>`;
  }

  if (unlockEntries.length){
    html += `<div class="info-section">
      <div class="iv-eyebrow">Tekgram Unlock</div>
      ${unlockEntries.map(renderBossRow).join("")}
    </div>`;
  }

  return html || `<div class="info-section"><div class="boss-empty">No boss sources found.</div></div>`;
}

function renderItemTabDinos(it, dropDinos, harvestDinos){
  function dinoRow(bp){
    const obj = getDinoObjByBp(bp);
    const name = obj?.n || bp.split("/").pop();
    return `
      <div class="loot-dino-row">
        <span class="loot-dino-name">${escapeHtml(name)}</span>
        <button type="button" class="info-link-btn" data-open-dino="${escapeHtml(name)}">View</button>
      </div>`;
  }

  let html = "";

  if (dropDinos.length > 0){
    html += `
      <div class="info-section">
        <div class="info-subtitle">Dropped On Death</div>
        ${dropDinos.map(dinoRow).join("")}
      </div>`;
  }

  if (harvestDinos.length > 0){
    html += `
      <div class="info-section">
        <div class="info-subtitle">Harvested From Corpse</div>
        ${harvestDinos.map(dinoRow).join("")}
      </div>`;
  }

  if (!html){
    html = `<div class="info-section"><div class="info-empty">No dino sources found</div></div>`;
  }

  return html;
}


function renderItemPanel(itemName){
  const it = getSelectedItem(itemName);
  if (!it){
    renderInfoPanelBodyEmpty();
    return;
  }

  const panel = ensureInfoPanel();
  

  // Count sources for tab label
  const itemIds = Array.isArray(it?.ids) ? it.ids : (it?.id != null ? [it.id] : []);
  const crateCount = new Set(
    itemIds.flatMap(id => crateIdsForItemId(id).filter(cid => State.mapCrateIds.has(cid)))
  ).size;
  const missionCount = new Set(
    itemIds.flatMap(id => itemMissionRefsForItemId(id).filter(mc => missionClassesUsedOnCurrentMap().has(mc)))
  ).size;
  const sourceCount = crateCount + missionCount;

  // Dino drop/harvest counts — filter to dinos on current map
  const mapDinoBps = new Set(
    [...State.entryToDinos.values()].flat()
  );
  const filterToBps = (bps) => bps.filter(bp => mapDinoBps.size === 0 || mapDinoBps.has(bp));

  const dropDinos = filterToBps([...new Set(itemIds.flatMap(id => dinoBpsThatDropItem(id)))]);
  const harvestDinos = filterToBps([...new Set(itemIds.flatMap(id => dinoBpsThatHarvestItem(id)))]);
  const hasDinoLoot = dropDinos.length > 0 || harvestDinos.length > 0;

  // Boss sources — which bosses on this map drop or unlock this item?
  const bossSourceEntries = itemIds.flatMap(id => State.bossItemIndex.get(id) || []);
  // Dedupe by name+type
  const bossSourceMap = new Map();
  for (const e of bossSourceEntries){
    const key = `${e.name}\x00${e.type}`;
    if (!bossSourceMap.has(key)) bossSourceMap.set(key, e);
  }
  const bossSourceList = [...bossSourceMap.values()];
  // Unique boss names for tab count
  const bossNameSet = new Set(bossSourceList.map(e => e.name));
  const hasBossSources = bossNameSet.size > 0;

  // Detect if this item has an engram
  const itemRowForTabs = itemRowById(it.id);
  const hasEngram = itemRowForTabs ? engramRowsForItem(itemRowForTabs).length > 0 : false;

  const itemPanelTabs = [
     ...(sourceCount > 0 ? [{ id: "crates", label: `Crates (${sourceCount})` }] : []),
     ...(hasDinoLoot ? [{ id: "dinos", label: `Dinos (${dropDinos.length + harvestDinos.length})` }] : []),
     ...(hasBossSources ? [{ id: "bosses", label: `Bosses (${bossNameSet.size})` }] : []),
     { id: "info", label: "Info" },
     ...(hasEngram ? [{ id: "engram", label: "Engram" }] : []),
    ];

    const activeTab = itemPanelTabs.some(t => t.id === infoPanelState.itemTab)
      ? infoPanelState.itemTab
      : itemPanelTabs[0].id;
      
    infoPanelState.itemTab = activeTab;

  setInfoPanelTitle(itemName);

  // Compute whether all are currently open for the label
  const allItemsOpen = (() => {
    const itemIds2 = Array.isArray(it?.ids) ? it.ids : (it?.id != null ? [it.id] : []);
    const crateIds2 = [...new Set(itemIds2.flatMap(id =>
      crateIdsForItemId(id).filter(cid => State.mapCrateIds.has(cid))
    ))];
    return crateIds2.every(cid => itemCrateIsOpen(itemName, `crate:${cid}`));
  })();

  const showCollapseAll = (activeTab === "crates" || activeTab === "bosses");
  const collapseAllBtn = showCollapseAll ? `
    <button type="button" class="loot-set-toggle-all" data-item-collapse-all="1" style="margin-left:auto;">
      ${(activeTab === "crates" && allItemsOpen) ? "Collapse All" : "Expand All"}
    </button>
  ` : "";

  const toggleAllBtn = (activeTab === "crates") ? `
    <button
      type="button"
      class="mod-filter-pill"
      data-item-toggle-all="1"
    >Toggle All</button>
  ` : "";

  const html = `
    ${renderItemHero(it)}
    ${renderTabs({
      tabs: itemPanelTabs,
      activeId: activeTab,
      dataAttr: "data-item-tab"
    })}
    ${(toggleAllBtn || collapseAllBtn) ? `
      <div class="mod-filter-row" style="align-items:center;">
        ${toggleAllBtn}
        ${collapseAllBtn}
      </div>
    ` : ""}
    ${renderPages({
      tabs: itemPanelTabs,
      activeId: activeTab,
      renderPage: (id) => {
        if (id === "crates") return renderItemTabCrates(it);
        if (id === "info")   return renderItemTabInfo(it);
        if (id === "dinos")  return renderItemTabDinos(it, dropDinos, harvestDinos);
        if (id === "bosses") return renderItemTabBosses(bossSourceList, itemIds);
        if (id === "engram") return renderItemTabEngram(it);
        return "";
      }
    })}
  `;

  setInfoPanelHTML(html);

  const body = panel.querySelector(".fp-body");

  wireTabs(body, {
    tabs: itemPanelTabs,
    activeId: activeTab,
    dataAttr: "data-item-tab",
    onChange: (id) => {
      infoPanelState.itemTab = id;
      renderItemPanel(itemName);
    }
  });

  // Command parameter inputs — update the commands live without re-rendering tabs
  const updateCmdDisplays = () => {
    const itemRow2 = itemRowById(it.id);
    const gfi  = gfiCommandForItem(itemRow2);
    const give = giveItemCommandForItem(itemRow2);
    body.querySelectorAll(".iv-cmd-line.copy-on-click").forEach(el => {
      const textEl = el.querySelector(".iv-cmd-text");
      const txt = textEl?.textContent || "";
      if (txt.startsWith("cheat GFI") && gfi) {
        textEl.textContent = gfi;
        el.dataset.copy = gfi;
      } else if (txt.startsWith("cheat giveitem") && give) {
        textEl.textContent = give;
        el.dataset.copy = give;
      }
    });
    // Sync the Blueprint chip's lit state
    body.querySelectorAll(".iv-cmd-bp").forEach(chip => {
      const cb = chip.querySelector("input[type=checkbox]");
      chip.classList.toggle("on", !!cb?.checked);
    });
  };

  body.querySelectorAll("[data-cmd-param]").forEach(input => {
    const key = input.dataset.cmdParam;
    const handler = () => {
      if (input.type === "checkbox") {
        infoPanelState.itemCmdIsBp = input.checked ? 1 : 0;
      } else {
        const val = Math.max(input.min !== "" ? Number(input.min) : 0, Number(input.value) || 0);
        if (key === "qty")     infoPanelState.itemCmdQty = val;
        if (key === "quality") infoPanelState.itemCmdQuality = val;
      }
      updateCmdDisplays();
    };
    input.addEventListener("input", handler);
    input.addEventListener("change", handler);
  });

  // Sync toggle-all button glow state
  const syncToggleAll = () => {
    const toggleAllBtn2 = body.querySelector("[data-item-toggle-all]");
    if (!toggleAllBtn2) return;
    const allKeys = [...body.querySelectorAll("[data-item-crate-toggle]")]
      .map(b => b.dataset.key).filter(Boolean);
    const allOn = allKeys.every(k => entryVisibility[k] ?? true);
    toggleAllBtn2.classList.toggle("is-on", allOn);
  };
  syncToggleAll();

  // Toggle visibility (glow) per crate row
  body.querySelectorAll("[data-item-crate-toggle]").forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.key;
      if (!key) return;
      entryVisibility[key] = !(entryVisibility[key] ?? true);
      btn.closest(".item-crate-card")?.classList.toggle("is-on", entryVisibility[key]);
      drawItem(itemName);
      syncToggleAll();
    };
  });

  // Toggle all
  body.querySelectorAll("[data-item-toggle-all]").forEach(btn => {
    btn.onclick = () => {
      const allKeys = [...body.querySelectorAll("[data-item-crate-toggle]")]
        .map(b => b.dataset.key).filter(Boolean);
      const allOn = allKeys.every(k => entryVisibility[k] ?? true);
      allKeys.forEach(k => { entryVisibility[k] = !allOn; });
      body.querySelectorAll(".item-crate-card").forEach(card => {
        card.classList.toggle("is-on", !allOn);
      });
      drawItem(itemName);
      syncToggleAll();
    };
  });

  // Collapse all / expand all
  body.querySelectorAll("[data-item-collapse-all]").forEach(btn => {
    btn.onclick = () => {
      if (infoPanelState.itemTab === "bosses"){
        // Boss sections: toggle all loot-set-sections directly
        const sections = [...body.querySelectorAll(".loot-set-section")];
        const allOpen = sections.every(s => s.classList.contains("is-open"));
        sections.forEach(s => {
          s.classList.toggle("is-open", !allOpen);
          s.classList.toggle("is-closed", allOpen);
          const b = s.querySelector(".loot-set-body");
          if (b) b.style.display = allOpen ? "none" : "";
          const ch = s.querySelector(".loot-set-toggle-chevron");
          if (ch) ch.textContent = allOpen ? "›" : "⌄";
        });
        btn.textContent = allOpen ? "Expand All" : "Collapse All";
        refreshInfoPanelPageHeight();
      } else {
        // Crate sections: use crate state management
        const crateValues = [...body.querySelectorAll("[data-item-crate-expand]")]
          .map(b => b.dataset.itemCrateExpand).filter(Boolean);
        const allOpen = crateValues.every(cv => itemCrateIsOpen(itemName, cv));
        crateValues.forEach(cv => itemCrateSetOpen(itemName, cv, !allOpen));
        renderItemPanel(itemName);
      }
    };
  });

  // Expand/collapse individual crate detail
  body.querySelectorAll("[data-item-crate-expand]").forEach(btn => {
    btn.onclick = () => {
      const cv = btn.dataset.itemCrateExpand;
      const prevScroll = getActiveInfoPanelScroll(infoPanelState.itemTab);
      itemCrateSetOpen(itemName, cv, !itemCrateIsOpen(itemName, cv));
      renderItemPanel(itemName);
      restoreActiveInfoPanelScroll(prevScroll, infoPanelState.itemTab);
    };
  });

  body.querySelectorAll("[data-open-crate]").forEach(btn => {
    btn.onclick = () => {
      const crateValue = btn.dataset.openCrate;
      if (crateValue) openCrateView(crateValue);
    };
  });

  body.querySelectorAll("[data-open-dino]").forEach(btn => {
    btn.onclick = () => {
      const dinoName = btn.dataset.openDino;
      if (dinoName) openDinoView(dinoName);
    };
  });

  body.querySelectorAll("[data-open-boss]").forEach(btn => {
    btn.onclick = () => {
      const bossName = btn.dataset.openBoss;
      if (bossName) openBossView(bossName);
    };
  });

  // Wire collapse/expand toggles for boss item sections
  body.querySelectorAll("[data-boss-item-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      const section = btn.closest(".loot-set-section");
      if (!section) return;
      const isOpen = section.classList.toggle("is-open");
      section.classList.toggle("is-closed", !isOpen);
      const bodyEl = section.querySelector(".loot-set-body");
      if (bodyEl) bodyEl.style.display = isOpen ? "" : "none";
      const chevron = section.querySelector(".loot-set-toggle-chevron, .iv-boss-chev");
      if (chevron) chevron.textContent = isOpen ? "⌄" : "›";
      refreshInfoPanelPageHeight();
    });
  });

  refreshInfoPanelPageHeight();
  syncActivePageHeight(body.querySelector(".fp-pages"), activeTab);
}

const ITEM_PANEL_TABS = [
  { id: "crates", label: "Crates" },
  { id: "info", label: "Info" },
  { id: "dinos", label: "Dinos" }
];