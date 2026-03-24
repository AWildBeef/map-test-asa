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


function renderItemHero(it){
  return `
    <div class="entry-hero">
      <div class="entry-hero-title">${escapeHtml(it.name)}</div>
      <div class="info-submeta">Item</div>
      ${renderCopyField("Item Class", it.class)}
      ${renderCopyField("Item Blueprint", it.blueprint)}
    </div>
  `;
}

function renderItemTabInfo(it){
  return `
    <div class="info-section">
      <div class="info-subtitle">Item Info</div>
      <div class="entry-meta">
        <div class="entry-meta-line">Matching Item IDs: ${escapeHtml(String(it.ids.length))}</div>
      </div>
    </div>
  `;
}

function itemCrateVisibilityKey(itemName, crateRef){
  return `${State.mapId}::item::${itemName}::crate::${crateRef}`;
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
          level: meta.l ?? null
        });
      }
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
            level: null
          });
        }
      }
    }
  }

  const rows = [
    ...[...crateMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    ...[...missionMap.values()].sort((a, b) => a.name.localeCompare(b.name))
  ];

  const allChecked = rows.length
    ? rows.every(row => {
        const key = itemCrateVisibilityKey(it.name, row.crateValue);
        return entryVisibility[key] ?? true;
      })
    : true;

  return `
    <div class="info-section">
      <div class="info-subtitle">Sources (${rows.length})</div>

      ${
        !rows.length
          ? `<div style="color:var(--muted)">No crate or mission sources found on this map.</div>`
          : `
            <div class="entries">
              ${renderToggleAllRow({
                label: "Toggle All Sources",
                checked: allChecked,
                dataAttr: "data-item-toggle-all"
              })}

              ${rows.map(row => {
                const key = itemCrateVisibilityKey(it.name, row.crateValue);
                const checked = entryVisibility[key] ?? true;

                return `
                  <div class="entry-row">
                    <label class="entry-main" style="display:flex; align-items:flex-start; gap:10px; min-width:0;">
                      <input
                        type="checkbox"
                        data-item-crate-toggle="1"
                        data-key="${escapeAttr(key)}"
                        ${checked ? "checked" : ""}
                        style="margin-top:4px;"
                      >
                      <div style="min-width:0; flex:1;">
                        <div class="entry-name">${escapeHtml(row.name)}</div>
                        <div class="entry-meta">
                          <div class="entry-meta-line">
                            ${
                              row.level != null
                                ? `Required Level: ${escapeHtml(String(row.level))}`
                                : `Mission Source`
                            }
                          </div>
                        </div>
                      </div>
                    </label>

                    <button
                      type="button"
                      class="fp-btn"
                      data-open-crate="${escapeAttr(row.crateValue)}"
                      title="Open in crate view"
                      aria-label="Open in crate view"
                      style="margin-left:8px; flex:0 0 auto;"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                        <path d="M9 6l6 6-6 6"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"/>
                      </svg>
                    </button>
                  </div>
                `;
              }).join("")}
            </div>
          `
      }
    </div>
  `;
}

function renderItemPanel(itemName){
  const it = getSelectedItem(itemName);
  if (!it){
    renderInfoPanelBodyEmpty();
    return;
  }

  const panel = ensureInfoPanel();
  const activeTab = ITEM_PANEL_TABS.some(t => t.id === infoPanelState.itemTab)
    ? infoPanelState.itemTab
    : "crates";

  setInfoPanelTitle(itemName);

  const html = `
    ${renderItemHero(it)}
    ${renderTabs({
      tabs: ITEM_PANEL_TABS,
      activeId: activeTab,
      dataAttr: "data-item-tab"
    })}
    ${renderPages({
      tabs: ITEM_PANEL_TABS,
      activeId: activeTab,
      renderPage: (id) => {
        if (id === "crates") return renderItemTabCrates(it);
        if (id === "info") return renderItemTabInfo(it);
        return "";
      }
    })}
  `;

  setInfoPanelHTML(html);

  const body = panel.querySelector(".fp-body");

  wireTabs(body, {
    tabs: ITEM_PANEL_TABS,
    activeId: activeTab,
    dataAttr: "data-item-tab",
    onChange: (id) => {
      infoPanelState.itemTab = id;
      renderItemPanel(itemName);
    }
  });

  body.querySelectorAll('input[data-item-crate-toggle="1"]').forEach(chk => {
    chk.onchange = () => {
      const key = chk.dataset.key;
      if (!key) return;
      entryVisibility[key] = chk.checked;
      drawItem(itemName);

      const master = body.querySelector('input[data-item-toggle-all]');
      if (master){
        const allChecked = [...body.querySelectorAll('input[data-item-crate-toggle="1"]')]
          .every(el => el.checked);
        master.checked = allChecked;
      }
    };
  });

  wireToggleAll(body, {
    masterSelector: 'input[data-item-toggle-all]',
    itemSelector: 'input[data-item-crate-toggle="1"]',
    getItemKey: (el) => el.dataset.key,
    onAfterChange: () => drawItem(itemName)
  });

  body.querySelectorAll("[data-open-crate]").forEach(btn => {
    btn.onclick = () => {
      const crateValue = btn.dataset.openCrate;
      if (crateValue) openCrateView(crateValue);
    };
  });

  refreshInfoPanelPageHeight();
  syncActivePageHeight(body.querySelector(".fp-pages"), activeTab);
}

const ITEM_PANEL_TABS = [
  { id: "crates", label: "Crates" },
  { id: "info", label: "Info" }
];