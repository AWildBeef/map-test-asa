/* Split from app_embed.js lines 4225-4440 */

/* ============================================================
   UI SETUP
============================================================ */
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
  rebuildDinoSelect();
  applyEmbedRestrictions();
  renderDock();
  render();
}


function setupUI(){

  /* SOURCE SELECT */

  UI.sourceSelect.innerHTML = "";

  for(const s of SOURCES){

    const o = document.createElement("option");

    o.value = s.id;
    o.textContent = s.label;

    UI.sourceSelect.appendChild(o);
  }

  UI.sourceSelect.value = UI.sourceSelect.options[0]?.value || "";

  UI.sourceSelect.onchange = async () => {
    await loadSelectedSource();
  };

  mountSourceDrillDropdown(
    UI.sourceSelect,
    UI.sourceFancy
  );
  applyEmbedRestrictions();

  UI.mapSelect.innerHTML="";

  for(const m of MAPS){

    const o=document.createElement("option");

    o.value=m.id;
    o.textContent=m.id;

    UI.mapSelect.appendChild(o);
  }

  UI.mapSelect.value=State.mapId;

  UI.mapSelect.onchange=async()=>{
    State.mapId=UI.mapSelect.value;
    await onMapChanged();
  };

  mountFancyDropdown(UI.mapSelect,UI.mapFancy,"Search maps...");

  syncModeButton();
  rebuildDinoSelect();

  UI.modeToggle.onclick = () => {
    // save current selection into the mode we're leaving
    State.selections[State.mode] = State.selection || "";

    // switch mode
    State.mode = State.mode === "dino" ? "entry" : "dino";

    // restore remembered selection for new mode
    syncSelectionForMode(State.mode);

    syncModeButton();
    rebuildDinoSelect();
    applyEmbedRestrictions();
    render();
  };

  UI.controlsToggle.onclick = () => {
    const before = UI.topbar?.offsetHeight ?? 0;

    UI.topbar.classList.toggle("show-controls");

    requestAnimationFrame(() => {
      const after = UI.topbar?.offsetHeight ?? 0;
      nudgeMapForTopbarToggle(before, after);
    });
  };
}

function initRarityLegend(){

  const legend = document.getElementById("rarityLegend");
  if (!legend) return;

  legend.querySelectorAll(".rl-sq").forEach(el => {

    const rarity = el.dataset.r;
    const color = rarityToColor(rarity);

    el.style.background = color;
  });

}

function rebuildDinoSelect(){

  const list = State.mode === "dino" ? State.names : State.entryList;
  const placeholder = State.mode === "dino"
    ? "(Select a Dino)"
    : "(Select a Spawn Entry)";

  // restore valid remembered selection for current mode
  const saved = State.selections[State.mode] || "";
  State.selection = (saved && list.includes(saved)) ? saved : "";

  UI.dinoSelect.innerHTML = "";

  const emptyOpt = document.createElement("option");
  emptyOpt.value = "";
  emptyOpt.textContent = placeholder;
  UI.dinoSelect.appendChild(emptyOpt);

  for (const v of list){
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    UI.dinoSelect.appendChild(o);
  }

  UI.dinoSelect.value = State.selection;

  UI.dinoSelect.onchange = () => {
    State.selection = UI.dinoSelect.value || "";
    State.selections[State.mode] = State.selection;
    render();
  };

  mountFancyDropdown(
    UI.dinoSelect,
    UI.dinoFancy,
    State.mode === "dino" ? "Search dinos..." : "Search spawn entries..."
  );
}
