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

// Returns the loot set name and entry details for a specific item within a crate
function itemLootDetail(itemId, crateId){
  const crateClass = crateIdToClass(crateId);
  if (!crateClass) return [];

  const crate = lootData().c?.[crateClass];
  if (!crate) return [];

  const out = [];

  const rRows = lootData().r?.[String(itemId)] || [];
  for (const r of rRows){
    if (!Array.isArray(r) || typeof r[0] !== "number") continue;
    if (r[0] !== crateId) continue;

    const setIdx   = r[1] ?? 0;
    const entryIdx = r[2] ?? 0;
    const set      = (crate.s || [])[setIdx];
    if (!set) continue;

    const { allEntries } = lootSetEntriesFromRow(set);
    const entry = allEntries[entryIdx];
    if (!entry) continue;

    out.push({
      setName:   lootSetNameFromRow(set, `Set ${setIdx + 1}`),
      setWeight: set.w ?? null,
      w:   entry.w   ?? null,
      mn:  entry.mn  ?? null,
      mx:  entry.mx  ?? null,
      q1:  entry.q1  ?? null,
      q2:  entry.q2  ?? null,
      b:   entry.b   ?? null,
      fb:  entry.fb  ?? null,
    });
  }

  const seen = new Set();
  return out.filter(d => {
    const key = `${d.setName}::${d.w}::${d.mn}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function itemCrateIsOpen(itemName, crateValue){
  return itemCrateOpenState[`${itemName}::${crateValue}`] ?? true;
}

function itemCrateSetOpen(itemName, crateValue, open){
  itemCrateOpenState[`${itemName}::${crateValue}`] = !!open;
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
          level: meta.l ?? null,
          details: []
        });
      }

      const detail = itemLootDetail(itemId, crateId);
      if (detail.length) crateMap.get(crateId).details.push(...detail);
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
            level: null,
            details: []
          });
        }
      }
    }
  }

  const rows = [
    ...[...crateMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    ...[...missionMap.values()].sort((a, b) => a.name.localeCompare(b.name))
  ];

  if (!rows.length){
    return `<div style="color:var(--muted); padding:8px 4px;">No crate or mission sources found on this map.</div>`;
  }

  const allOn = rows.every(row => {
    const key = itemCrateVisibilityKey(it.name, row.crateValue);
    return entryVisibility[key] ?? true;
  });

  return `
    <div class="info-section">
      <div class="mode-menu-like-list">
        ${rows.map(row => {
          const visKey = itemCrateVisibilityKey(it.name, row.crateValue);
          const isOn = entryVisibility[visKey] ?? true;
          const isOpen = itemCrateIsOpen(it.name, row.crateValue);

          const detailHtml = row.details?.length ? `
            <div class="item-loot-details">
              ${row.details.map(d => `
                <div class="item-loot-detail">
                  <div class="item-loot-set-name">${escapeHtml(d.setName)}</div>
                  <div class="meta-grid" style="margin-top:4px;">
                    ${d.w != null ? `
                      <div class="meta-cell">
                        <div class="meta-label">Entry Weight</div>
                        <div class="meta-value">${escapeHtml(fmt(d.w) || "--")}</div>
                      </div>` : ""}
                    ${d.mn != null || d.mx != null ? `
                      <div class="meta-cell">
                        <div class="meta-label">Quantity</div>
                        <div class="meta-value">${escapeHtml(fmtRange(d.mn, d.mx))}</div>
                      </div>` : ""}
                    ${d.q1 != null || d.q2 != null ? `
                      <div class="meta-cell">
                        <div class="meta-label">Quality</div>
                        <div class="meta-value">${escapeHtml(fmtRange(d.q1, d.q2))}</div>
                      </div>` : ""}
                    ${d.b != null ? `
                      <div class="meta-cell">
                        <div class="meta-label">${isTrue01(d.fb) ? "Force BP" : "BP Chance"}</div>
                        <div class="meta-value">${isTrue01(d.fb) ? "Yes" : escapeHtml(pct(d.b) || "0%")}</div>
                      </div>` : ""}
                  </div>
                </div>
              `).join("")}
            </div>
          ` : "";

          return `
            <div class="item-crate-card ${isOn ? "is-on" : ""} ${isOpen ? "is-open" : "is-closed"}">

              <div class="item-crate-card-header">
                <button
                  type="button"
                  class="item-crate-toggle-btn"
                  data-item-crate-toggle="1"
                  data-key="${escapeAttr(visKey)}"
                  data-crate-value="${escapeAttr(row.crateValue)}"
                  title="Toggle map visibility"
                >
                  <span class="dino-spawn-title">${escapeHtml(row.name)}</span>
                  <span class="dino-spawn-meta-line" style="margin-top:2px;">
                    ${row.level != null ? `Required Level: ${escapeHtml(String(row.level))}` : "Mission Source"}
                  </span>
                </button>

                <button
                  type="button"
                  class="dino-spawn-corner-jump"
                  data-item-crate-expand="${escapeAttr(row.crateValue)}"
                  title="${isOpen ? "Collapse" : "Expand"} details"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                    <path d="${isOpen ? "M6 9l6 6 6-6" : "M6 15l6-6 6 6"}"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>

              ${isOpen ? `
                <div class="item-crate-card-body">
                  ${detailHtml}
                  <button
                    type="button"
                    class="fp-btn"
                    data-open-crate="${escapeAttr(row.crateValue)}"
                    title="Open in crate view"
                    style="margin-top:6px; width:100%; justify-content:center;"
                  >Open in Crate View ›</button>
                </div>
              ` : ""}
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

  // Count sources for tab label
  const itemIds = Array.isArray(it?.ids) ? it.ids : (it?.id != null ? [it.id] : []);
  const crateCount = new Set(
    itemIds.flatMap(id => crateIdsForItemId(id).filter(cid => State.mapCrateIds.has(cid)))
  ).size;
  const missionCount = new Set(
    itemIds.flatMap(id => itemMissionRefsForItemId(id).filter(mc => missionClassesUsedOnCurrentMap().has(mc)))
  ).size;
  const sourceCount = crateCount + missionCount;

  const itemPanelTabs = [
    { id: "crates", label: `Crates (${sourceCount})` },
    { id: "info",   label: "Info" }
  ];

  setInfoPanelTitle(itemName);

  // Compute whether all are currently open for the label
  const allItemsOpen = (() => {
    const itemIds2 = Array.isArray(it?.ids) ? it.ids : (it?.id != null ? [it.id] : []);
    const crateIds2 = [...new Set(itemIds2.flatMap(id =>
      crateIdsForItemId(id).filter(cid => State.mapCrateIds.has(cid))
    ))];
    return crateIds2.every(cid => itemCrateIsOpen(itemName, `crate:${cid}`));
  })();

  const collapseAllBtn = (activeTab === "crates") ? `
    <button type="button" class="loot-set-toggle-all" data-item-collapse-all="1" style="margin-left:auto;">
      ${allItemsOpen ? "Collapse All" : "Expand All"}
    </button>
  ` : "";

  const toggleAllBtn = (activeTab === "crates") ? `
    <button
      type="button"
      class="mod-filter-pill"
      data-item-toggle-all="1"
    >Toggle All</button>
  ` : "";

  const html = `
    ${renderItemHero(it)}
    ${renderTabs({
      tabs: itemPanelTabs,
      activeId: activeTab,
      dataAttr: "data-item-tab"
    })}
    ${(toggleAllBtn || collapseAllBtn) ? `
      <div class="mod-filter-row" style="align-items:center;">
        ${toggleAllBtn}
        ${collapseAllBtn}
      </div>
    ` : ""}
    ${renderPages({
      tabs: itemPanelTabs,
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
    tabs: itemPanelTabs,
    activeId: activeTab,
    dataAttr: "data-item-tab",
    onChange: (id) => {
      infoPanelState.itemTab = id;
      renderItemPanel(itemName);
    }
  });

  // Sync toggle-all button glow state
  const syncToggleAll = () => {
    const toggleAllBtn2 = body.querySelector("[data-item-toggle-all]");
    if (!toggleAllBtn2) return;
    const allKeys = [...body.querySelectorAll("[data-item-crate-toggle]")]
      .map(b => b.dataset.key).filter(Boolean);
    const allOn = allKeys.every(k => entryVisibility[k] ?? true);
    toggleAllBtn2.classList.toggle("is-on", allOn);
  };
  syncToggleAll();

  // Toggle visibility (glow) per crate row
  body.querySelectorAll("[data-item-crate-toggle]").forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.key;
      if (!key) return;
      entryVisibility[key] = !(entryVisibility[key] ?? true);
      btn.closest(".item-crate-card")?.classList.toggle("is-on", entryVisibility[key]);
      drawItem(itemName);
      syncToggleAll();
    };
  });

  // Toggle all
  body.querySelectorAll("[data-item-toggle-all]").forEach(btn => {
    btn.onclick = () => {
      const allKeys = [...body.querySelectorAll("[data-item-crate-toggle]")]
        .map(b => b.dataset.key).filter(Boolean);
      const allOn = allKeys.every(k => entryVisibility[k] ?? true);
      allKeys.forEach(k => { entryVisibility[k] = !allOn; });
      body.querySelectorAll(".item-crate-card").forEach(card => {
        card.classList.toggle("is-on", !allOn);
      });
      drawItem(itemName);
      syncToggleAll();
    };
  });

  // Collapse all / expand all
  body.querySelectorAll("[data-item-collapse-all]").forEach(btn => {
    btn.onclick = () => {
      const crateValues = [...body.querySelectorAll("[data-item-crate-expand]")]
        .map(b => b.dataset.itemCrateExpand).filter(Boolean);
      const allOpen = crateValues.every(cv => itemCrateIsOpen(itemName, cv));
      crateValues.forEach(cv => itemCrateSetOpen(itemName, cv, !allOpen));
      renderItemPanel(itemName);
    };
  });

  // Expand/collapse individual crate detail
  body.querySelectorAll("[data-item-crate-expand]").forEach(btn => {
    btn.onclick = () => {
      const cv = btn.dataset.itemCrateExpand;
      itemCrateSetOpen(itemName, cv, !itemCrateIsOpen(itemName, cv));
      renderItemPanel(itemName);
    };
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