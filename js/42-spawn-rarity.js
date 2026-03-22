/* Split from app_embed.js lines 3438-3592 */

/* ============================================================
   SPAWN RARITY CALCULATION
============================================================ */

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

function finalRarityForManager(entryName,meta,score){

  const baseLabel = rarityFromWeight(score);

  const {best,total} = entryManagerMinStats(entryName);

  const globalSteps = downshiftStepsForTotalMin(total);

  const pct = best>0 ? (meta.md || best)/best : 1;

  const managerSteps = downshiftStepsForMinPct(pct);

  return downgradeRarity(baseLabel,globalSteps+managerSteps);
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
