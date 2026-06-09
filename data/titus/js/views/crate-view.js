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
                ? `<div class="crate-note">Item sets may not be chosen more than once</div>`
              : c.rwr === false
                ? `<div class="crate-note">Item sets may be chosen multiple times</div>`
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
                    ? `<div class="crate-note">Entries may not be chosen more than once</div>`
                  : setRwr === false
                    ? `<div class="crate-note">Entries may be chosen multiple times</div>`
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
          ? `<div class="crate-note">Quantity is applied to a single item</div>`
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
                        iwPctStr != null ? ` <span class="item-weight-pct">(${iwPctStr})</span>` : ``
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


/* ── Simulate tab ────────────────────────────────────────── */

const QUALITY_TIERS = [
  { name: "Primitive",    prefix: "",             color: "#b0b0b0" },
  { name: "Ramshackle",   prefix: "Ramshackle ",  color: "#3dd43d" },
  { name: "Apprentice",   prefix: "Apprentice ",  color: "#48b8ff" },
  { name: "Journeyman",   prefix: "Journeyman ",  color: "#c06dff" },
  { name: "Mastercraft",  prefix: "Mastercraft ", color: "#ffd033" },
  { name: "Ascendant",    prefix: "Ascendant ",   color: "#33ffee" },
];

function simWeightedPick(weights, excludeSet){
  let total = 0;
  for (let i = 0; i < weights.length; i++){
    if (excludeSet && excludeSet.has(i)) continue;
    total += (weights[i] || 0);
  }
  if (total <= 0) return -1;
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++){
    if (excludeSet && excludeSet.has(i)) continue;
    r -= (weights[i] || 0);
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

function simRollPower(min, max, power){
  if (min === max || min == null) return min ?? max ?? 1;
  const p = power ?? 1.0;
  if (p < 1.0 && p > 0) return max;               // Power < 1 quirk
  const raw = min + (max - min) * Math.pow(Math.random(), p);
  return Math.round(raw);
}

function simulateCrateDrop(c){
  const sets = c.sets || [];
  if (!sets.length) return { picks: [], allItems: [], nSetPicks: 0 };

  const nSetPicks = simRollPower(c.minSets, c.maxSets, c.nsp);
  const crateRwr = c.rwr === true;
  const setWeights = sets.map(s => s.w || 0);

  const picks = [];
  const usedSets = crateRwr ? new Set() : null;

  for (let p = 0; p < nSetPicks; p++){
    const si = simWeightedPick(setWeights, usedSets);
    if (si < 0) break;
    if (usedSets) usedSets.add(si);

    const row = sets[si];
    const { allEntries, setMeta } = lootSetEntriesFromRow(row);
    const setName = lootSetNameFromRow(row, `Set ${si + 1}`);
    const smn = row?.smn ?? setMeta?.smn ?? 1;
    const smx = row?.smx ?? setMeta?.smx ?? smn;
    const setNip = row?.nip ?? setMeta?.nip ?? 1.0;
    const setRwr = row?.rwr === true;

    const nEntries = simRollPower(smn, smx, setNip);
    const entryWeights = allEntries.map(e => e?.w || 0);
    const usedEntries = setRwr ? new Set() : null;
    const pickEntries = [];

    for (let ep = 0; ep < nEntries; ep++){
      const ei = simWeightedPick(entryWeights, usedEntries);
      if (ei < 0) break;
      if (usedEntries) usedEntries.add(ei);

      const entry = allEntries[ei];
      if (!entry) continue;

      const cg = entry.cg ?? 1.0;
      if (Math.random() >= cg) continue;

      const qMin = entry.mn ?? 1;
      const qMax = entry.mx ?? qMin;
      const qp = entry.qp ?? 1.0;
      let qty = simRollPower(qMin, qMax, qp);
      qty = Math.max(1, qty);

      const isStack = isTrue01(entry.aq);
      const itemIds = Array.isArray(entry.i) ? entry.i : [];
      const iw = Array.isArray(entry.iw) ? entry.iw : [];
      if (!itemIds.length) continue;

      const q1 = entry.q1 ?? 0;
      const q2 = entry.q2 ?? q1;
      const hasQuality = q1 > 0 || q2 > 0;
      const bpChance = entry.b ?? 0;
      const forceBP = isTrue01(entry.fb);

      const entryItems = [];

      if (isStack){
        const idx = simWeightedPick(iw.length ? iw : itemIds.map(() => 1), null);
        const itemId = itemIds[Math.max(0, idx)];
        const qualRoll = hasQuality ? q1 + (q2 - q1) * Math.random() : 0;
        const qualTier = hasQuality ? Math.max(0, Math.min(5, Math.floor(qualRoll))) : -1;
        const isBP = forceBP || (bpChance > 0 && Math.random() < bpChance);
        entryItems.push({
          id: itemId,
          name: itemDisplayNameById(itemId),
          qty,
          qualTier,
          isBP
        });
      } else {
        for (let q = 0; q < qty; q++){
          const idx = simWeightedPick(iw.length ? iw : itemIds.map(() => 1), null);
          const itemId = itemIds[Math.max(0, idx)];
          const qualRoll = hasQuality ? q1 + (q2 - q1) * Math.random() : 0;
          const qualTier = hasQuality ? Math.max(0, Math.min(5, Math.floor(qualRoll))) : -1;
          const isBP = forceBP || (bpChance > 0 && Math.random() < bpChance);
          entryItems.push({
            id: itemId,
            name: itemDisplayNameById(itemId),
            qty: 1,
            qualTier,
            isBP
          });
        }
      }

      pickEntries.push({
        entryName: entry.n || "Entry",
        items: entryItems
      });
    }

    picks.push({ setIdx: si, setName, entries: pickEntries });
  }

  const allItems = [];
  for (const pick of picks){
    for (const entry of pick.entries){
      allItems.push(...entry.items);
    }
  }

  return { picks, allItems, nSetPicks };
}


function renderSimItem(item){
  const tier = (item.qualTier >= 0 && item.qualTier <= 5) ? QUALITY_TIERS[item.qualTier] : null;
  const color = tier ? tier.color : "#b0b0b0";
  const prefix = tier && item.qualTier > 0 ? tier.prefix : "";
  const bpTag = item.isBP ? "Blueprint: " : "";
  const qtyTag = item.qty > 1 ? ` (×${item.qty})` : "";
  const bpClass = item.isBP ? " is-bp" : "";
  return `<div class="sim-item${bpClass}" style="border-left-color:${color}"><span style="color:${color}">${escapeHtml(bpTag + prefix)}${escapeHtml(item.name)}</span>${escapeHtml(qtyTag)}</div>`;
}


function renderCrateTabSimulate(c){
  const result = infoPanelState.simResult;
  if (!result){
    return `
      <div class="sim-prompt">
        <button type="button" class="loot-set-toggle-all" data-crate-sim-roll="1"
          style="font-size:14px;padding:8px 20px;">
          🎲 Simulate Drop
        </button>
        <div class="sim-prompt-hint">
          Roll the crate to see a possible drop
        </div>
      </div>
    `;
  }

  const { picks, allItems, nSetPicks } = result;
  const totalItems = allItems.reduce((s, it) => s + it.qty, 0);

  return `
    <div class="sim-results">
      <div class="sim-header">
        <button type="button" class="loot-set-toggle-all" data-crate-sim-roll="1"
          style="font-size:13px;padding:6px 16px;">
          🎲 Roll Again
        </button>
        <span class="sim-summary">
          ${totalItems} item${totalItems !== 1 ? "s" : ""} from ${picks.length} set pick${picks.length !== 1 ? "s" : ""}
        </span>
      </div>

      ${allItems.length
        ? `<div class="sim-items">
            ${allItems.map(renderSimItem).join("")}
          </div>`
        : `<div class="sim-empty">Nothing dropped!</div>`
      }

      ${picks.length
        ? `
          <details class="sim-details" data-crate-sim-details="1">
            <summary>Roll details</summary>
            <div class="sim-details-body">
              <div class="sim-details-intro">Rolled ${nSetPicks} set pick${nSetPicks !== 1 ? "s" : ""} from ${(c.sets || []).length} available set${(c.sets || []).length !== 1 ? "s" : ""}</div>
              ${picks.map((pick, pi) => `
                <div class="sim-pick">
                  <div class="sim-pick-name">Pick ${pi + 1}: ${escapeHtml(pick.setName)}</div>
                  ${pick.entries.map(ent => `
                    <div class="sim-pick-entry">
                      <div class="sim-pick-entry-name">→ ${escapeHtml(ent.entryName)}</div>
                      ${ent.items.map(it => {
                        const tier = (it.qualTier >= 0 && it.qualTier <= 5) ? QUALITY_TIERS[it.qualTier] : null;
                        const color = tier ? tier.color : "#b0b0b0";
                        const prefix = tier && it.qualTier > 0 ? tier.prefix : "";
                        const bpTag = it.isBP ? "Blueprint: " : "";
                        const qtyTag = it.qty > 1 ? ` (×${it.qty})` : "";
                        return `<div class="sim-pick-entry-item" style="color:${color}">${escapeHtml(bpTag + prefix + it.name + qtyTag)}</div>`;
                      }).join("")}
                    </div>
                  `).join("")}
                  ${!pick.entries.length ? `<div class="sim-pick-empty">No items (filtered by drop chance)</div>` : ""}
                </div>
              `).join("")}
            </div>
          </details>
        `
        : ``
      }
    </div>
  `;
}

function renderCratePanel(crateName){
  const c = getSelectedCrate(crateName);
  if (!c){
    renderInfoPanelBodyEmpty();
    return;
  }

  // Clear simulation when switching to a different crate
  if (infoPanelState._simCrateClass !== c.class){
    infoPanelState.simResult = null;
    infoPanelState._simCrateClass = c.class;
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
    { id: "info", label: `All Items (${itemCount})` },
    { id: "sim",  label: "Simulate" }
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
        if (id === "sim")  return renderCrateTabSimulate(c);
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

  body.querySelectorAll("[data-crate-sim-roll]").forEach(btn => {
    btn.onclick = () => {
      infoPanelState.simResult = simulateCrateDrop(c);
      renderCratePanel(crateName);
    };
  });

  body.querySelectorAll("[data-crate-sim-details]").forEach(el => {
    el.addEventListener("toggle", () => {
      refreshInfoPanelPageHeight();
      syncActivePageHeight(body.querySelector(".fp-pages"), activeTab);
    });
  });

  refreshInfoPanelPageHeight();
  syncActivePageHeight(body.querySelector(".fp-pages"), activeTab);
}


const CRATE_PANEL_TABS = [
  { id: "sets", label: "Loot Sets" },
  { id: "info", label: "All Items" }
];