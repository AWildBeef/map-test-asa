/* Split from app_embed.js lines 4441-4464 */

/* ============================================================
   RENDER
============================================================ */

function showBootSplash(text = "Loading data..."){
  const el = document.getElementById("bootSplash");
  if (!el) return;

  const sub = el.querySelector(".boot-sub");
  if (sub) sub.textContent = text;

  el.hidden = false;
  el.classList.remove("is-hidden");
}

function hideBootSplash(){
  const el = document.getElementById("bootSplash");
  if (!el) return;

  el.classList.add("is-hidden");

  setTimeout(() => {
    el.hidden = true;
  }, 220);
}


function render() {
  if (!State.selection) {
    clearDraw();
    drawPois();
    renderInfoPanelBodyEmpty();
    return;
  }
  
  if (State.mode === "dino") {
    drawDino(State.selection);
    drawPois();
  } else if (State.mode === "entry") {
    clearDraw();
    const score = entryRarityForEntry(State.selection);
    drawEntry(State.selection, score);
    drawPois();
  } else if (State.mode === "crate") {
    drawCrate(State.selection);
  } else if (State.mode === "item") {
    drawItem(State.selection);
  }
  
  renderInfoPanel();
}


/* Split from app_embed.js lines 4504-4546 */

/* ============================================================
   BOOT
============================================================ */

async function boot() {
  showBootSplash("Loading sources...");

  const allSources = await buildSources();
  SOURCES = filterSourcesForEmbed(allSources);

  const official = allSources.find(s => s.id === "official");

  showBootSplash("Loading base data...");

  Global.baseSpawn = await loadJSON(official.spawn);
  Global.baseDinos = await loadJSON(official.dinos);

  Global.spawn = Global.baseSpawn;
  Global.dinos = Global.baseDinos;
  Global.modMeta = null;

  showBootSplash("Preparing interface...");

  installCopyDelegation();
  ensureInfoPanel();
  ensurePoiPanel();
  ensureMapEntriesPanel();
  ensureDrawStylePanel();
  ensureSettingsPanel();
  renderInfoPanelBodyEmpty();
  setLegendOpen(false);
  applySavedTheme();

  setupUI();
  syncModeClass();
  applyEmbedRestrictions();

  showBootSplash("Loading selected source...");

  await loadSelectedSource();

  initRarityLegend();

  setTimeout(() => {
    ensureLootAndItemsLoaded().catch(err => {
      console.warn("Deferred loot/item load failed", err);
    });
  }, 300);

  buildLootIndexes();

  showBootSplash("Building map...");

  await onMapChanged();

  setTimeout(() => {
    preloadAllMapImages();
  }, 1200);

  showBootSplash("Almost ready...");

  requestAnimationFrame(() => {
    hideBootSplash();
  });
}

boot().catch(e => {
  console.error(e);

  showBootSplash("Failed to load");
  alert(e.message || e);
});

boot().catch(e=>{
  console.error(e);
  alert(e.message||e);
});
