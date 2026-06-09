function setAllCrateSetsOpen(crateObj, open){
  const rows = crateObj?.sets || [];
  for (let i = 0; i < rows.length; i++){
    setCrateSetOpen(crateObj, i, open);
  }
}

function areAllCrateSetsOpen(crateObj){
  const rows = crateObj?.sets || [];
  if (!rows.length) return true;
  return rows.every((_, i) => isCrateSetOpen(crateObj, i));
}

function crateSetStateKey(crateObj, idx){
  const id =
    crateObj.kind === "mission"
      ? `${crateObj.missionClass}::${crateObj.lootStructClass}`
      : crateObj.class;

  return `${State.mapId}::${id}::set::${idx}`;
}

function isCrateSetOpen(crateObj, idx){
  const key = crateSetStateKey(crateObj, idx);
  return crateSetOpenState[key] ?? true; // default open
}

function setCrateSetOpen(crateObj, idx, open){
  const key = crateSetStateKey(crateObj, idx);
  crateSetOpenState[key] = !!open;
}

function getActiveInfoPanelScroll(activeTabId){
  const panel = document.getElementById("dinoInfoPanel");
  if (!panel) return 0;

  const body = panel.querySelector(".fp-body");
  const pagesEl = body?.querySelector(".fp-pages");

  const tabId = activeTabId ?? infoPanelState.crateTab ?? "";
  const page = body?.querySelector(`.fp-page[data-page="${CSS.escape(tabId)}"]`);
  if (page && page.scrollHeight > page.clientHeight) {
    return page.scrollTop || 0;
  }

  return pagesEl?.scrollTop || 0;
}

function restoreActiveInfoPanelScroll(scrollTop, activeTabId){
  const panel = document.getElementById("dinoInfoPanel");
  if (!panel) return;

  const body = panel.querySelector(".fp-body");
  const pagesEl = body?.querySelector(".fp-pages");
  const tabId = activeTabId ?? infoPanelState.crateTab ?? "";
  const page = body?.querySelector(`.fp-page[data-page="${CSS.escape(tabId)}"]`);

  requestAnimationFrame(() => {
    if (page && page.scrollHeight > page.clientHeight) {
      page.scrollTop = scrollTop || 0;
    } else if (pagesEl) {
      pagesEl.scrollTop = scrollTop || 0;
    }
  });
}

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
  const cls = String(crateClass || "");
  const meta = lootData().c?.[cls];

  if (!meta) return cls;

  if (cls.toLowerCase().includes("artifactcrate")) {
    return meta.n || cls;
  }

  return meta.dn || meta.n || cls;
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
      nsp: meta.nsp,
      rwr: meta.rwr,
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


/* ── Crate display helpers ────────────────────────────────── */

function fmtRangeCollapsed(a, b, empty = "--"){
  const fa = fmt(a);
  const fb = fmt(b);
  if (!fa && !fb) return empty;
  if (fa && fb) return fa === fb ? fa : `${fa} - ${fb}`;
  return fa || fb || empty;
}

function fmtPct(weight, total){
  if (weight == null || !total) return null;
  const raw = (weight / total) * 100;
  if (raw <= 0) return "0%";
  if (raw < 1) return raw.toFixed(1) + "%";
  return Math.round(raw) + "%";
}

function renderCrateHero(c) {
  const mission = missionMetaByClass(c.missionClass);
  const rewardIds = Array.isArray(mission?.ri) ? mission.ri : [];
  const rewardQty = Array.isArray(mission?.rq) ? mission.rq : [null, null];
  const sig = Array.isArray(mission?.sig) ? mission.sig : [null, null];

  return `
    <div class="entry-hero">
      <div class="entry-hero-title">${escapeHtml(c.name)}</div>

      ${
        c.kind === "mission"
          ? `
            <div class="meta-grid">
              <div class="meta-cell">
                <div class="meta-stack">
                  <div class="meta-label">Mission Type</div>
                  <div class="meta-value">${escapeHtml(String(mission?.t || "--"))}</div>
                </div>
              </div>

              ${rewardIds.map(itemId => `
                <div class="meta-cell">
                  <div class="meta-stack">
                    <div class="meta-label">${escapeHtml(itemDisplayNameById(itemId))}</div>
                    <div class="meta-value">
                      ${
                        rewardQty[0] != null && rewardQty[1] != null
                          ? escapeHtml(`${rewardQty[0]}–${rewardQty[1]}`)
                          : "--"
                      }
                    </div>
                  </div>
                </div>
              `).join("")}

              ${
                sig[0] != null && sig[1] != null
                  ? `
                    <div class="meta-cell">
                      <div class="meta-stack">
                        <div class="meta-label">${escapeHtml(itemDisplayNameById(sig[1]))}s</div>
                        <div class="meta-value">${escapeHtml(String(sig[0]))}</div>
                      </div>
                    </div>
                  `
                  : ``
              }
            </div>
          `
          : `
            <div class="meta-grid">
              <div class="meta-cell">
                <div class="meta-stack">
                  <div class="meta-label">Required Level</div>
                  <div class="meta-value">${escapeHtml(String(c.level ?? "--"))}</div>
                </div>
              </div>
              <div class="meta-cell">
                <div class="meta-stack">
                  <div class="meta-label">Item Sets Chosen</div>
                  <div class="meta-value">${escapeHtml(fmtRangeCollapsed(c.minSets, c.maxSets))}</div>
                </div>
              </div>
              ${
                c.qmin != null || c.qmax != null
                  ? `
                    <div class="meta-cell">
                      <div class="meta-stack">
                        <div class="meta-label">Quality Mult</div>
                        <div class="meta-value">${escapeHtml(fmtRange(c.qmin, c.qmax))}</div>
                      </div>
                    </div>
                  `
                  : ``
              }
            </div>
            ${
              c.rwr === true
                ? `<div style="font-size:11px;opacity:.6;margin-top:2px;">Item sets may not be chosen more than once</div>`
              : c.rwr === false
                ? `<div style="font-size:11px;opacity:.6;margin-top:2px;">Item sets may be chosen multiple times</div>`
              : ``
            }
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

  const modActive = !activeSourceIsOfficial();
  const allSets = c.sets || [];
  const hasModSets = modActive && allSets.some(s => s._mod);
  const modOnly = modActive && hasModSets && !infoPanelState.showOfficialSets;

  const items = crateItemSummary(c.class, { modOnly });

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
  const allRows = c.sets || [];
  const modActive = !activeSourceIsOfficial();

  // When a mod is active, split sets into mod and official
  // and filter based on the toggle state
  let rows = allRows;
  const hasModSets = modActive && allRows.some(s => s._mod);
  const hasOfficialSets = modActive && allRows.some(s => !s._mod);

  if (modActive && hasModSets) {
    rows = infoPanelState.showOfficialSets
      ? allRows
      : allRows.filter(s => s._mod);
  }

  if (!rows.length){
    return `<div style="color:var(--muted); padding:8px 4px;">No loot sets found.</div>`;
  }

  return `
    <div class="info-section">
      <div class="entries">
        ${rows.map((row, idx) => {
          const origIdx = allRows.indexOf(row);
          const { allEntries, setMeta } = lootSetEntriesFromRow(row);
          const setName = lootSetNameFromRow(row, `Set ${origIdx + 1}`);
          const weight = row?.w;
          const isOpen = isCrateSetOpen(c, origIdx);

          const totalWeight = rows.reduce((s, r) => s + (r?.w || 0), 0) || 1;
          const weightPct = weight != null ? Math.round((weight / totalWeight) * 100) : null;

          const smn = row?.smn ?? setMeta?.smn;
          const smx = row?.smx ?? setMeta?.smx;
          const setNip = row?.nip ?? setMeta?.nip;
          const setRwr = row?.rwr;

          const totalEntryWeight = allEntries.reduce((s, e) => s + (e?.w || 0), 0) || 1;

          return `
            <div class="loot-set-section ${isOpen ? "is-open" : "is-closed"} ${row._mod ? "is-mod-set" : ""}">
              <button
                type="button"
                class="loot-set-toggle"
                data-crate-set-toggle="${escapeAttr(String(origIdx))}"
              >
                <div class="loot-set-toggle-main">
                  <div class="info-row">
                    <span class="info-label">${escapeHtml(setName)}</span>
                    ${row._mod ? `<span class="mod-set-badge">MOD</span>` : ""}
                  </div>
                </div>

                <div class="loot-set-toggle-right">
                  <span class="loot-set-toggle-chevron">${isOpen ? "⌄" : "›"}</span>
                </div>
              </button>

              <div class="loot-set-body" style="display:${isOpen ? "" : "none"};">
                <div class="meta-grid">
                  <div class="meta-cell">
                    <div class="meta-label">Set Weight</div>
                    <div class="meta-value">${escapeHtml(fmt(weight) || "--")}</div>
                  </div>

                  ${
                    weightPct != null
                      ? `
                        <div class="meta-cell">
                          <div class="meta-label">Chance</div>
                          <div class="meta-value">${escapeHtml(fmtPct(weight, totalWeight))}</div>
                        </div>
                      `
                      : ``
                  }

                  ${
                    smn != null || smx != null
                      ? `
                        <div class="meta-cell">
                          <div class="meta-label">Entries Chosen</div>
                          <div class="meta-value">${escapeHtml(fmtRangeCollapsed(smn, smx))}</div>
                        </div>
                      `
                      : ``
                  }
                </div>
                ${
                  setRwr === true
                    ? `<div style="font-size:11px;opacity:.6;margin-top:2px;">Entries may not be chosen more than once</div>`
                  : setRwr === false
                    ? `<div style="font-size:11px;opacity:.6;margin-top:2px;">Entries may be chosen multiple times</div>`
                  : ``
                }

                ${
                  allEntries.length
                    ? allEntries.map(e => renderLootEntryBlock(e, totalEntryWeight)).join("")
                    : `<div class="entry-meta"><div class="entry-meta-line">No entries found.</div></div>`
                }
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}


function renderLootEntryBlock(entry, totalEntryWeight){
  const itemIds = Array.isArray(entry?.i) ? entry.i : [];
  const itemWeights = Array.isArray(entry?.iw) ? entry.iw : [];
  const totalItemWeight = itemWeights.length ? itemWeights.reduce((s, w) => s + (w || 0), 0) : 0;

  const ew = entry?.w;
  const isStack = isTrue01(entry?.aq);

  return `
    <div class="info-section-sub" style="margin-top:8px;">
      <div class="info-subtitle-sub">${escapeHtml(entry?.n || "Entry")}</div>

      <div class="meta-grid">
        <div class="meta-cell">
          <div class="meta-stack">
            <div class="meta-label">Entry Weight</div>
            <div class="meta-value">${escapeHtml(fmt(ew) || "--")}</div>
          </div>
        </div>

        ${
          totalEntryWeight > 0 && ew != null
            ? `
              <div class="meta-cell">
                <div class="meta-stack">
                  <div class="meta-label">Chance</div>
                  <div class="meta-value">${escapeHtml(fmtPct(ew, totalEntryWeight))}</div>
                </div>
              </div>
            `
            : ``
        }

        <div class="meta-cell">
          <div class="meta-stack">
            <div class="meta-label">Quantity</div>
            <div class="meta-value">${escapeHtml(fmtRangeCollapsed(entry?.mn, entry?.mx))}</div>
          </div>
        </div>

        ${
          entry?.q1 != null || entry?.q2 != null
            ? `
              <div class="meta-cell">
                <div class="meta-stack">
                  <div class="meta-label">Quality</div>
                  <div class="meta-value">${escapeHtml(fmtRangeCollapsed(entry?.q1, entry?.q2))}</div>
                </div>
              </div>
            `
            : ``
        }

        ${
          entry?.b != null
            ? `
              <div class="meta-cell">
                <div class="meta-stack">
                  <div class="meta-label">${isTrue01(entry?.fb) ? "Force BP" : "BP Chance"}</div>
                  <div class="meta-value">${isTrue01(entry?.fb) ? "Yes" : escapeHtml(pct(entry.b) || "0%")}</div>
                </div>
              </div>
            `
            : ``
        }

        ${
          entry?.cg != null && entry.cg < 1.0
            ? `
              <div class="meta-cell">
                <div class="meta-stack">
                  <div class="meta-label">Drop Chance</div>
                  <div class="meta-value">${escapeHtml(pct(entry.cg))}</div>
                </div>
              </div>
            `
            : ``
        }
      </div>
      ${
        isStack
          ? `<div style="font-size:11px;opacity:.6;margin-top:2px;">Quantity is applied to a single item</div>`
          : ``
      }

      <div class="item-entries">
        ${
          itemIds.length
            ? itemIds.map((itemId, i) => {
                const iw = itemWeights[i];
                const iwPctStr = (iw != null && totalItemWeight > 0)
                  ? fmtPct(iw, totalItemWeight) : null;
                return `
                  <div class="item-row">
                    <div class="item-main">
                      <div class="item-name">${escapeHtml(itemDisplayNameById(itemId))}${
                        iwPctStr != null ? ` <span style="opacity:.55;font-size:11px">(${iwPctStr})</span>` : ``
                      }</div>
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
  const modActive = !activeSourceIsOfficial();
  const allSets = c.sets || [];
  const hasModSets = modActive && allSets.some(s => s._mod);
  const hasOfficialSets = modActive && allSets.some(s => !s._mod);
  const modOnly = modActive && hasModSets && !infoPanelState.showOfficialSets;

  const itemCount =
    c.kind === "mission"
      ? missionLootItemIds(c.missionClass).length
      : crateItemSummary(c.class, { modOnly }).length;

  const modSetCount = hasModSets ? allSets.filter(s => s._mod).length : 0;
  const shownSetCount = (modActive && hasModSets && !infoPanelState.showOfficialSets)
    ? modSetCount
    : allSets.length;

  const crateTabs = [
    { id: "sets", label: `Loot Sets (${shownSetCount})` },
    { id: "info", label: `All Items (${itemCount})` }
  ];

  const activeTab = crateTabs.some(t => t.id === infoPanelState.crateTab)
    ? infoPanelState.crateTab
    : "sets";

  setInfoPanelTitle(c.name);

  // Collapse All always shown when on the sets tab; sets pill only when relevant
  const collapseAllBtn = (activeTab === "sets") ? `
    <button
      type="button"
      class="loot-set-toggle-all"
      data-crate-set-toggle-all="1"
      style="margin-left:auto;"
    >${areAllCrateSetsOpen(c) ? "Collapse All" : "Expand All"}</button>
  ` : "";

  const showSetsTogglePill = (modActive && hasModSets && hasOfficialSets)
    ? `<button type="button" class="mod-filter-pill ${infoPanelState.showOfficialSets ? "is-on" : ""}" data-crate-official-toggle="1" title="${infoPanelState.showOfficialSets ? "Showing all sets" : "Showing mod sets only"}">${infoPanelState.showOfficialSets ? "Mod + official sets" : "Mod sets only"}</button>`
    : "";

  const html = `
    ${renderCrateHero(c)}
    ${renderTabs({
      tabs: crateTabs,
      activeId: activeTab,
      dataAttr: 'data-crate-tab'
    })}
    ${(showSetsTogglePill || collapseAllBtn) ? `
      <div class="mod-filter-row">
        ${showSetsTogglePill}
        ${collapseAllBtn}
      </div>
    ` : ""}
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

  body.querySelectorAll("[data-crate-set-toggle]").forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.crateSetToggle);
      if (!Number.isInteger(idx)) return;

      const prevScroll = getActiveInfoPanelScroll();

      setCrateSetOpen(c, idx, !isCrateSetOpen(c, idx));
      renderCratePanel(crateName);

      restoreActiveInfoPanelScroll(prevScroll);
    };
  });
  body.querySelectorAll("[data-crate-set-toggle-all]").forEach(btn => {
    btn.onclick = () => {
      const prevScroll = getActiveInfoPanelScroll();

      const nextOpen = !areAllCrateSetsOpen(c);
      setAllCrateSetsOpen(c, nextOpen);
      renderCratePanel(crateName);

      restoreActiveInfoPanelScroll(prevScroll);
    };
  });

  body.querySelectorAll("[data-crate-official-toggle]").forEach(btn => {
    btn.onclick = () => {
      infoPanelState.showOfficialSets = !infoPanelState.showOfficialSets;
      renderCratePanel(crateName);
    };
  });

  refreshInfoPanelPageHeight();
  syncActivePageHeight(body.querySelector(".fp-pages"), activeTab);
}


const CRATE_PANEL_TABS = [
  { id: "sets", label: "Loot Sets" },
  { id: "info", label: "All Items" }
];