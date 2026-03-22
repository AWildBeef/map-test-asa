/* Split from app_embed.js lines 849-918 */

/* ============================================================
   ~~MAP PANEL
============================================================ */

function mapsForEntry(entryName){
  const codes = Global.spawn?.entryMaps?.[entryName] || [];
  return Array.isArray(codes) ? codes : [];
}

function isEntryUniqueToCurrentMap(entryName){
  const codes = mapsForEntry(entryName);
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const curCode = mapMeta?.mapCode;
  return codes.length === 1 && codes[0] === curCode;
}

function isEntryShared(entryName){
  return mapsForEntry(entryName).length > 1;
}

function buildMapEntryBrowserRows(){
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const curCode = mapMeta?.mapCode;

  return [...State.mapEntries]
    .sort((a, b) => a.localeCompare(b))
    .map(entryName => {
      const codes = Array.isArray(Global.spawn?.entryMaps?.[entryName])
        ? Global.spawn.entryMaps[entryName]
        : [];

      const mapNames = codes.map(code => Global.spawn?.mapLegend?.[code] || code);
      const uniqueHere = (codes.length === 1 && codes[0] === curCode);

      return {
        entryName,
        codes,
        mapNames,
        mapCount: codes.length,
        uniqueHere,
        shared: codes.length > 1
      };
    });
}

const entryBrowserState = {
  filter: "all",   // "all" | "unique" | "shared"
  search: ""
};

function getFilteredMapEntryRows(){
  const q = normSearch(entryBrowserState.search);
  let rows = buildMapEntryBrowserRows();

  if (entryBrowserState.filter === "unique"){
    rows = rows.filter(r => r.uniqueHere);
  } else if (entryBrowserState.filter === "shared"){
    rows = rows.filter(r => r.shared);
  }

  if (q){
    rows = rows.filter(r =>
      normSearch(r.entryName).includes(q) ||
      r.mapNames.some(m => normSearch(m).includes(q))
    );
  }

  return rows;
}
