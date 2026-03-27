/* Split from app_embed.js lines 4504-4546 */

/* ============================================================
   BOOT
============================================================ */

async function boot() {
  
  const allSources = await buildSources();
  SOURCES = filterSourcesForEmbed(allSources);
  
  const official = allSources.find(s => s.id === "official");
  
  Global.baseSpawn = await loadJSON(official.spawn);
  Global.baseDinos = await loadJSON(official.dinos);
  
  Global.spawn = Global.baseSpawn;
  Global.dinos = Global.baseDinos;
  Global.modMeta = null;
  
  installCopyDelegation();
  ensureInfoPanel();
  ensurePoiPanel();
  ensureMapEntriesPanel();
  ensureDrawStylePanel();
  renderInfoPanelBodyEmpty();
  setLegendOpen(false);
  
  setupUI();
  syncModeClass();
  applyEmbedRestrictions();
  
  await loadSelectedSource();
  
  initRarityLegend();
  
  setTimeout(() => {
    ensureLootAndItemsLoaded().catch(err => {
      console.warn("Deferred loot/item load failed", err);
    });
  }, 300);
  
  buildLootIndexes();
  
  await onMapChanged();

  setTimeout(() => {
    preloadAllMapImages();
  }, 1200);
}

boot().catch(e=>{
  console.error(e);
  alert(e.message||e);
});
