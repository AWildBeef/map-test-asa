/* Split from app_embed.js lines 3668-3838 */

/* ============================================================
   WORLD REPLACEMENTS
============================================================ */

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

function worldRulesForCurrentMap(){
  const all = Global.spawn?.worldReplacements || {};

  const mapRules = Array.isArray(all?.[State.mapId]) ? all[State.mapId] : [];
  const globalRules = Array.isArray(all?.__global__) ? all.__global__ : [];

  return [...mapRules, ...globalRules];
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

function getDinoObjByBp(bp){
  const dinos = Global.dinos?.dinos || {};
  if (dinos[bp]) return dinos[bp];

  const cls = bpClass(bp);
  for (const [k, v] of Object.entries(dinos)){
    if (bpClass(k) === cls) return v;
  }

  return null;
}
