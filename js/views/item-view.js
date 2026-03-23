

function drawItem(itemName) {
  clearDraw();
  clearPois();

  const supplyRows = cratePoiRowsForItem(itemName);
  addSupplyCrateMarkers(supplyRows, { layer: mapObj.poiLayer });

  const hordeRows = hordePoiRowsForItem(itemName);
  addHordeMarkers(hordeRows, { layer: mapObj.poiLayer });
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


function renderItemTabCrates(it){
  const crateRefs = [];
  const missionRefs = [];

  for (const itemId of it.ids){
    for (const ref of lootSourcesForItemId(itemId)){
      if (ref.kind === "crate" && State.mapCrateIds.has(ref.crateId)){
        crateRefs.push(ref.crateId);
      }

      if (ref.kind === "mission"){
        const missionClasses = missionClassesUsedOnCurrentMap();
        if (missionClasses.has(ref.missionClass)){
          missionRefs.push(ref.missionClass);
        }
      }
    }
  }

  const crateIds = [...new Set(crateRefs)];
  const missionClasses = [...new Set(missionRefs)];

  if (!crateIds.length && !missionClasses.length){
    return `<div style="color:var(--muted)">No loot sources found for this item.</div>`;
  }

  return `
    <div class="info-section">
      <div class="info-subtitle">Sources (${crateIds.length + missionClasses.length})</div>
      <div class="entries">
        ${crateIds.map(crateId => {
          const meta = crateMetaById(crateId);
          const name = crateDisplayNameById(crateId);
          const key = itemCrateVisibilityKey(it.name, crateId);
          const visible = isItemCrateVisible(it.name, crateId);

          return `
            <label class="entry-row">
              <input
                type="checkbox"
                data-item-crate-toggle="1"
                data-key="${escapeAttr(key)}"
                data-item-name="${escapeAttr(it.name)}"
                data-crate-id="${escapeAttr(String(crateId))}"
                ${visible ? "checked" : ""}
              >
              <div class="entry-main">
                <div class="entry-name">${escapeHtml(name)}</div>
                <div class="entry-meta">
                  <div class="entry-meta-line">Required Level: ${escapeHtml(String(meta?.l ?? "--"))}</div>
                </div>
              </div>
            </label>
          `;
        }).join("")}

        ${missionClasses.map(missionClass => {
          const mission = missionMetaByClass(missionClass);
          return `
            <div class="entry-row">
              <div class="entry-main">
                <div class="entry-name">${escapeHtml(missionLootDisplayName(missionClass))}</div>
                <div class="entry-meta">
                  <div class="entry-meta-line">Mission Type: ${escapeHtml(String(mission?.t || "--"))}</div>
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
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
      dataAttr: 'data-item-tab'
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
      entryVisibility[key] = chk.checked;
      drawItem(itemName);
    };
  });

  refreshInfoPanelPageHeight();
  syncActivePageHeight(body.querySelector(".fp-pages"), activeTab);
}



const ITEM_PANEL_TABS = [
  { id: "crates", label: "Crates" },
  { id: "info", label: "Info" }
];
