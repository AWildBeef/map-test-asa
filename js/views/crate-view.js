
function missionSizeLabelFromClass(missionClass){
  const s = String(missionClass || "");

  if (s.includes("_City_")) return "City";
  if (s.includes("_Large_")) return "Large";
  if (s.includes("_Medium_")) return "Medium";
  if (s.includes("_Small_")) return "Small";

  return "";
}

function missionDisplayName(missionClass){
  const base = missionLootDisplayName(missionClass);
  const size = missionSizeLabelFromClass(missionClass);
  return size ? `${base} (${size})` : base;
}

function crateDisplayNameByClass(crateClass){
  const meta = lootData().c?.[crateClass];
  if (!meta) return crateClass || "";

  return meta.dn || meta.n || crateClass;
}

function crateDisplayNameById(crateId){
  const crateClass = crateIdToClass(crateId);
  if (!crateClass) return "";
  return crateDisplayNameByClass(crateClass);
}

function drawCrate(crateName) {
  clearDraw();
  clearPois();
  
  const ref = State.crateNameToRef.get(crateName);
  if (!ref) return;
  
  if (ref.kind === "crate") {
    const supplyRows = cratePoiRowsForSelectedCrate(ref.crateId);
    addSupplyCrateMarkers(supplyRows, { layer: mapObj.poiLayer });

    const hordeRows = hordePoiRowsForSelectedCrate(ref.crateId);
    addHordeMarkers(hordeRows, { layer: mapObj.poiLayer });

    return;
  }
  
  if (ref.kind === "mission") {
    const rows = (currentGeom()?.pois?.missions || []).filter(p =>
      missionPointHasClass(p, ref.missionClass)
    );

    addMissionMarkers(rows, { layer: mapObj.poiLayer });
    return;
  }
}

function getSelectedCrate(selectionValue){
  const ref = State.crateNameToRef.get(selectionValue);
  if (!ref) return null;

  if (ref.kind === "crate"){
    const crateClass = crateIdToClass(ref.crateId);
    const meta = crateMetaById(ref.crateId);
    if (!crateClass || !meta) return null;

    return {
      kind: "crate",
      id: ref.crateId,
      class: crateClass,
      name: crateDisplayNameByClass(crateClass),
      rawName: meta.n || crateClass,
      level: meta.l,
      minSets: meta.mn,
      maxSets: meta.mx,
      qmin: meta.qm1,
      qmax: meta.qm2,
      sets: Array.isArray(meta.s) ? meta.s : []
    };
  }

  if (ref.kind === "mission"){
    const meta = lootData().ls?.[ref.lootStructClass];
    const mission = lootData().m?.[ref.missionClass];
    if (!meta || !mission) return null;

    return {
      kind: "mission",
      missionClass: ref.missionClass,
      lootStructClass: ref.lootStructClass,
      class: ref.lootStructClass,
      name: missionDisplayName(ref.missionClass),
      rawName: ref.lootStructClass,
      level: null,
      minSets: null,
      maxSets: null,
      qmin: null,
      qmax: null,
      sets: Array.isArray(meta.s) ? meta.s : []
    };
  }

  return null;
}


function renderCrateHero(c) {
  const mission = missionMetaByClass(c.missionClass);
  
  return `
    <div class="entry-hero">
      <div class="entry-hero-title">${escapeHtml(c.name)}</div>

      ${
        c.kind === "mission"
          ? `<div class="info-submeta">${escapeHtml(String(mission?.t || "--"))}</div>`
          : `
            <div class="meta-grid">
              <div class="meta-cell">
                <div class="meta-label">Required Level</div>
                <div class="meta-value">${escapeHtml(String(c.level ?? "--"))}</div>
              </div>
              <div class="meta-cell">
                <div class="meta-label">Min Loot Sets</div>
                <div class="meta-value">${escapeHtml(String(c.minSets ?? "--"))}</div>
              </div>
              <div class="meta-cell">
                <div class="meta-label">Max Loot Sets</div>
                <div class="meta-value">${escapeHtml(String(c.maxSets ?? "--"))}</div>
              </div>
              ${
                c.qmin != null || c.qmax != null
                  ? `
                    <div class="meta-cell">
                      <div class="meta-label">Quality Mult</div>
                      <div class="meta-value">${escapeHtml(fmtRange(c.qmin, c.qmax))}</div>
                    </div>
                  `
                  : ``
              }
            </div>
          `
      }

      ${renderCopyField("Loot Class", c.class)}
      ${
        c.kind === "mission"
          ? renderCopyField("Mission Class", c.missionClass || "")
          : ""
      }
    </div>
  `;
}

function renderCrateTabInfo(c){
  if (c.kind === "mission"){
    const mission = missionMetaByClass(c.missionClass);
    const rewardIds = Array.isArray(mission?.ri) ? mission.ri : [];
    const rewardQty = Array.isArray(mission?.rq) ? mission.rq : [null, null];
    const sig = Array.isArray(mission?.sig) ? mission.sig : [0, null];
    const cosmeticIds = Array.isArray(mission?.cos) ? mission.cos : [];
    const lootItems = missionLootItemIds(c.missionClass);

    return `

      ${
        rewardIds.length
          ? `
            <div class="info-section">
              <div class="mission-subtitle">Direct Rewards (${rewardIds.length})</div>
              <div class="entries">
                ${rewardIds.map(itemId => `
                  <div class="entry-row">
                    <div class="entry-main">
                      <div class="entry-name">
                        ${escapeHtml(itemDisplayNameById(itemId))}
                        ${
                          rewardQty[0] != null && rewardQty[1] != null
                            ? `<span class="entry-qty"> (${rewardQty[0]}–${rewardQty[1]})</span>`
                            : ``
                        }
                      </div>
                      
                    </div>
                  </div>
                `).join("")}
              </div>
            </div>
          `
          : ``
      }

      ${
        sig[0] && sig[1]
          ? `
            <div class="info-section">
              <div class="mission-subtitle">Sigil Reward</div>
              <div class="entry-meta">
                <div class="entry-meta-line">${escapeHtml(String(sig[0]))} × ${escapeHtml(itemDisplayNameById(sig[1]))}</div>
              </div>
              
            </div>
          `
          : ``
      }

      ${
        cosmeticIds.length
          ? `
            <div class="info-section">
              <div class="mission-subtitle">Possible Cosmetics (${cosmeticIds.length})</div>
              <div class="entries">
                ${cosmeticIds.map(itemId => `
                  <div class="entry-row">
                    <div class="entry-main">
                      <div class="entry-name">${escapeHtml(itemDisplayNameById(itemId))}</div>
                      
                    </div>
                  </div>
                `).join("")}
              </div>
            </div>
          `
          : ``
      }

      <div class="info-section">
        <div class="mission-subtitle">All Possible Items (${lootItems.length})</div>
        ${
          !lootItems.length
            ? `<div style="color:var(--muted)">No loot items found.</div>`
            : `
              <div class="entries">
                ${lootItems.map(itemId => `
                  <div class="entry-row">
                    <div class="entry-main">
                      <div class="entry-name">${escapeHtml(itemDisplayNameById(itemId))}</div>
                      
                    </div>
                  </div>
                `).join("")}
              </div>
            `
        }
      </div>
    `;
  }

  const items = crateItemSummary(c.class);

  return `
    <div class="info-section">
      <div class="info-subtitle">All Possible Items (${items.length})</div>
      ${
        !items.length
          ? `<div style="color:var(--muted)">No items found.</div>`
          : `
            <div class="entries">
              ${items.map(it => `
                <div class="entry-row">
                  <div class="entry-main">
                    <div class="entry-name">${escapeHtml(it.name)}</div>
                  </div>
                </div>
              `).join("")}
            </div>
          `
      }
    </div>
  `;
}


function renderCrateTabSets(c){
  const rows = c.sets || [];

  if (!rows.length){
    return `<div style="color:var(--muted)">No loot sets found.</div>`;
  }

  return `
    <div class="info-section">
      <div class="info-subtitle">Loot Sets (${rows.length})</div>
      <div class="entries">
        ${rows.map((row, idx) => {
          const { inlineEntries, overrideEntries, allEntries, setMeta } = lootSetEntriesFromRow(row);
          const setName = lootSetNameFromRow(row, `Set ${idx + 1}`);
          const weight = row?.w;

          return `
            <div class="loot-set-section">
              <div class="info-row">
                <span class="info-label">${escapeHtml(setName)}</span>
              </div>

              <div class="meta-grid">
                <div class="meta-cell">
                  <div class="meta-label">Set Weight</div>
                  <div class="meta-value">${escapeHtml(fmt(weight) || "--")}</div>
                </div>

                ${
                  setMeta?.smn != null || setMeta?.smx != null
                    ? `
                      <div class="meta-cell">
                        <div class="meta-label">Items Chosen</div>
                        <div class="meta-value">${escapeHtml(fmtRange(setMeta?.smn, setMeta?.smx))}</div>
                      </div>
                    `
                    : ``
                }

                ${
                  row?.o != null && row?.o !== ""
                    ? `
                      <div class="meta-cell" style="grid-column:1 / -1;">
                        <div class="meta-label">Override Set</div>
                        <div class="meta-value">${escapeHtml(setMeta?.n || String(row.o))}</div>
                      </div>
                    `
                    : ``
                }
              </div>

              ${
                allEntries.length
                  ? allEntries.map(renderLootEntryBlock).join("")
                  : `<div class="entry-meta"><div class="entry-meta-line">No entries found.</div></div>`
              }
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}


function renderLootEntryBlock(entry){
  const itemIds = Array.isArray(entry?.i) ? entry.i : [];
  const itemWeights = Array.isArray(entry?.iw) ? entry.iw : [];

  return `
    <div class="info-section-sub" style="margin-top:8px;">
      <div class="info-subtitle-sub">${escapeHtml(entry?.n || "Entry")}</div>

      <div class="meta-grid">
        <div class="meta-cell">
          <div class="meta-label">Entry Weight</div>
          <div class="meta-value">${escapeHtml(fmt(entry?.w) || "--")}</div>
        </div>

        <div class="meta-cell">
          <div class="meta-label">Quantity</div>
          <div class="meta-value">${escapeHtml(fmtRange(entry?.mn, entry?.mx))}</div>
        </div>

        ${
          entry?.q1 != null || entry?.q2 != null
            ? `
              <div class="meta-cell">
                <div class="meta-label">Quality</div>
                <div class="meta-value">${escapeHtml(fmtRange(entry?.q1, entry?.q2))}</div>
              </div>
            `
            : ``
        }

        ${
          entry?.b != null
            ? `
              <div class="meta-cell">
                <div class="meta-label">BP Chance</div>
                <div class="meta-value">${escapeHtml(pct(entry.b) || "0%")}</div>
              </div>
            `
            : ``
        }

        ${
          isTrue01(entry?.fb)
            ? `
              <div class="meta-cell">
                <div class="meta-label">Force BP</div>
                <div class="meta-value">Yes</div>
              </div>
            `
            : ``
        }

        ${
          isTrue01(entry?.aq)
            ? `
              <div class="meta-cell">
                <div class="meta-label">Single Qty</div>
                <div class="meta-value">Yes</div>
              </div>
            `
            : ``
        }
      </div>

      <div class="item-entries">
        ${
          itemIds.length
            ? itemIds.map((itemId, i) => {
                const iw = itemWeights[i];
                return `
                  <div class="item-row">
                    <div class="item-main">
                      <div class="item-name">${escapeHtml(itemDisplayNameById(itemId))}</div>
                      ${
                        iw != null
                          ? `<div class="entry-meta"><div class="entry-meta-line">Item Weight: ${escapeHtml(fmt(iw) || "--")}</div></div>`
                          : ``
                      }
                    </div>
                  </div>
                `;
              }).join("")
            : `<div class="entry-meta"><div class="entry-meta-line">No items listed.</div></div>`
        }
      </div>
    </div>
  `;
}


function renderCratePanel(crateName){
  const c = getSelectedCrate(crateName);
  if (!c){
    renderInfoPanelBodyEmpty();
    return;
  }

  const panel = ensureInfoPanel();
  const itemCount =
    c.kind === "mission"
      ? missionLootItemIds(c.missionClass).length
      : crateItemSummary(c.class).length;

  const crateTabs = [
    { id: "sets", label: `Loot Sets (${(c.sets || []).length})` },
    { id: "info", label: `All Items (${itemCount})` }
  ];

  const activeTab = crateTabs.some(t => t.id === infoPanelState.crateTab)
    ? infoPanelState.crateTab
    : "sets";

  setInfoPanelTitle(c.name);;

  const html = `
    ${renderCrateHero(c)}
    ${renderTabs({
      tabs: crateTabs,
      activeId: activeTab,
      dataAttr: 'data-crate-tab'
    })}
    ${renderPages({
      tabs: crateTabs,
      activeId: activeTab,
      renderPage: (id) => {
        if (id === "sets") return renderCrateTabSets(c);
        if (id === "info") return renderCrateTabInfo(c);
        return "";
      }
    })}
  `;

  setInfoPanelHTML(html);

  const body = panel.querySelector(".fp-body");
  wireTabs(body, {
    tabs: crateTabs,
    activeId: activeTab,
    dataAttr: "data-crate-tab",
    onChange: (id) => {
      infoPanelState.crateTab = id;
      renderCratePanel(crateName);
    }
  });

  refreshInfoPanelPageHeight();
  syncActivePageHeight(body.querySelector(".fp-pages"), activeTab);
}



const CRATE_PANEL_TABS = [
  { id: "sets", label: "Loot Sets" },
  { id: "info", label: "All Items" }
];
