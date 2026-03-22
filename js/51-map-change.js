/* Split from app_embed.js lines 4465-4503 */

/* ============================================================
   MAP CHANGE
============================================================ */

async function onMapChanged(){

  const mapMeta = MAPS.find(m => m.id === State.mapId);

  const geom = await loadJSON(`${PATHS.geomDir}/${mapMeta.geomShort}_geom.json`);
  Global.mapGeom.set(mapMeta.geomShort, geom);

  const img = geom.image || `${PATHS.mapsDir}/${mapMeta.image}`;

  const size = geom.size || [2048,2048];
  const bounds = [[0,0],[size[1],size[0]]];

  if (!mapObj){
    mapObj = initMap(img, geom.size || [2048,2048]);
    ensureDockControl(mapObj.map);
  } else {
    mapObj.overlay.setUrl(img);
  }

  dockState.mapMeta = mapMeta;
  dockState.cfg = {
    image: img
  };

  rebuildMapIndices();
  rebuildDinoSelect();
  applyEmbedRestrictions();
  renderDock();
  if (isPanelVisible("mapEntriesPanel")) {
    renderMapEntriesPanel();
  }

  render();
}
