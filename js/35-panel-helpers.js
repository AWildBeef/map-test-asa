/* Split from app_embed.js lines 2195-2385 */

/* ============================================================
   PANEL DATA HELPERS
============================================================ */

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

function buildEntryIndexForCurrentMap(){
  const idx = {};

  for (const entryName of State.mapEntries){
    const rows = Global.spawn?.entries?.[entryName]?.d || [];

    for (const r of rows){
      const rawBp = normalizeBp(r?.[0]);
      if (!rawBp) continue;

      const outs = worldOutputsForBp(rawBp);

      for (const out of outs){
        const finalBp = normalizeBp(out?.[0]);
        const prob = Number(out?.[1] || 0);
        if (!finalBp || prob <= 0) continue;

        (idx[entryName] ||= []).push({
          dinoKey: finalBp,
          entry: {
            entryClass: entryName,
            sourceBp: rawBp,
            outputBp: finalBp,
            outputChance: prob,
            groupWeight: Number(r?.[1] || 0) * prob,
            spawnMultiplier: Number(r?.[2] || 1),
            spawnLimit: Number(r?.[3] || 1),
            spawnChances: r?.[4] || ""
          }
        });
      }
    }
  }

  return idx;
}

function getSelectedDinoGroup(name){
  const bps = State.nameToBps.get(name) || [];
  if (!bps.length) return null;

  const first = getDinoObjByBp(bps[0]);
  const bpSet = new Set(bps);

  const entryList = [...new Set(
    bps.flatMap(bp => State.dinoToEntries.get(bp) || [])
  )].sort((a,b)=>a.localeCompare(b));

  const entries = entryList.map(entryName => {
    const rows = Global.spawn?.entries?.[entryName]?.d || [];

    let groupWeight = 0;
    let spawnMultiplier = 1;
    let spawnLimit = 1;
    let spawnChances = "";

    for (const r of rows){
      const rawBp = normalizeBp(r?.[0]);
      if (!rawBp) continue;

      const outs = worldOutputsForBp(rawBp);
      let matched = false;

      for (const out of outs){
        const finalBp = normalizeBp(out?.[0]);
        const prob = Number(out?.[1] || 0);
        if (!finalBp || prob <= 0) continue;

        if (bpSet.has(finalBp)){
          groupWeight += Number(r?.[1] || 0) * prob;
          spawnMultiplier = Number(r?.[2] || 1);
          spawnLimit = Number(r?.[3] || 1);
          spawnChances = r?.[4] || "";
          matched = true;
        }
      }

      if (matched) {
        // keep scanning in case multiple rows contribute
      }
    }

    return {
      entryClass: entryName,
      groupWeight,
      spawnMultiplier,
      spawnLimit,
      spawnChances
    };
  }).filter(e => e.groupWeight > 0);

  return {
    displayName: name,
    bpPath: bps[0],
    additionalBpPathsToDisplay: bps.slice(1),
    nameTag: first?.t || "",
    fName: first?.fn || "",
    mName: first?.mn || "",
    tameable: first?.flags?.tameable,
    breedable: first?.flags?.breedable,
    isAlpha: first?.flags?.isAlpha,
    isBoss: first?.flags?.isBoss,
    isBossMinion: first?.flags?.isBossMinion,
    dragWeight: first?.flags?.dragWeight || 35,
    killXpBase: first?.flags?.killXpBase || 2,
    stats: first?.stats || null,
    attacks: first?.attacks || null,
    entries
  };
}
