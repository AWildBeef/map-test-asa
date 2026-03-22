/* Split from app_embed.js lines 3913-4002 */

/* ============================================================
   INDEX BUILDER
============================================================ */

function rebuildMapIndices(){

  const spawn = Global.spawn || {};

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
      const rawBp = normalizeBp(r?.[0]);
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
}
