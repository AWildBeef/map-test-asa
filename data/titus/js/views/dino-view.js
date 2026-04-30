

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


function renderDinoHero(d, selectedName){
  const bp = d.bpPath || "";
  const extraBps = Array.isArray(d.additionalBpPathsToDisplay)
    ? d.additionalBpPathsToDisplay
    : [];

  const allBps = [bp, ...extraBps].filter(Boolean);
  const nameTag = d.nameTag || "";
  const displayName = d.displayName || "(Unknown)";
  const otherName = otherSexNameForSelected(d, selectedName);
  const modId = Global.modMeta?.modId || "";
  /*const modName = Global.modMeta?.modName || "";*/
  /*
      ${modName ? `<div class="info-submeta">${escapeHtml(modName)}</div>` : ""}
      */

  return `
    <div class="dino-hero">
      <div class="dino-hero-title">${escapeHtml(displayName)}</div>
      ${otherName ? `<div class="info-submeta">Also: ${escapeHtml(otherName)}</div>` : ""}
      ${modId ? `<div class="info-submeta">Mod ID: ${escapeHtml(modId)}</div>` : ""}

      ${d.tameable === false || d.tameable === 0 ? `<span class="dino-badge tameable">Untameable</span>` : ""}
      ${d.breedable === false || d.breedable === 0 ? `<span class="dino-badge breedable">Unbreedable</span>` : ""}

      <div class="info-subtitle">Blueprint</div>
      ${allBps.length
        ? allBps.map(v => `
            <div class="info-mono copy-on-click" data-copy="${escapeAttr(v)}">
              ${escapeHtml(v)}
            </div>
          `).join("")
        : `
            <div class="info-mono copy-on-click" data-copy="">
              (none)
            </div>
          `
      }

      ${renderCopyField("Nametag", nameTag || "")}
    </div>
  `;
}


function renderDinoTabSpawns(d, selectedName){
  const entries = d.entries || [];

  const allChecked = entries.length
    ? entries.every((e, i) => {
        const key = entryVisibilityKey(selectedName, i);
        return entryVisibility[key] ?? true;
      })
    : true;

  return `
    <div class="info-section">
      <div class="entries mode-menu-like-list">
        ${
          entries.length
            ? `
              <div class="mod-filter-row" style="align-items:center; padding:0 0 4px;">
                <button
                  type="button"
                  class="mod-filter-pill ${allChecked ? "is-on" : ""}"
                  data-dino-toggle-all="1"
                >Toggle All</button>
                <button
                  type="button"
                  class="loot-set-toggle-all"
                  data-dino-collapse-all="1"
                  style="margin-left:auto;"
                >Collapse All</button>
              </div>
            `
            : ``
        }

        ${entries.map((e, i) => renderDinoSpawnMenuRow(e, selectedName, i)).join("")}
      </div>
    </div>
  `;
}

function renderDinoTabStats(d){
  const drag = fmtNum(d?.dragWeight, 0);
  const xp = fmtNum(d?.killXpBase, 0);

  return `
    <div class="info-section">
      <div class="info-subtitle">Stats</div>
      <div class="entry-meta">
        ${drag !== null ? `<div class="entry-meta-line">Drag Weight: ${escapeHtml(drag)}</div>` : ``}
        ${xp !== null ? `<div class="entry-meta-line">Kill XP: ${escapeHtml(String(Number(xp) * 4))}</div>` : ``}
      </div>
      ${renderStatsTable(d?.stats)}
    </div>
    
    ${renderAttacksTable(d?.attacks)}
  `;
}


function renderDinoTabLoot(d){
  const bp = d?.bpPath;
  if (!bp) return `<div class="info-section"><div class="info-empty">No loot data</div></div>`;

  const dropComp = dropCompForDino(bp);
  const harvestComp = harvestCompForDino(bp);

  if (!dropComp && !harvestComp){
    return `<div class="info-section"><div class="info-empty">No loot data for this dino</div></div>`;
  }

  let html = "";

  // ── Drop component (death inventory) ─────────────────────────────────
  if (dropComp){
    const sets = Array.isArray(dropComp.s) ? dropComp.s : [];
    const mn = dropComp.mn ?? 1;
    const mx = dropComp.mx ?? 1;
    const setsHtml = sets.map(setRow => {
      const entries = Array.isArray(setRow?.e) ? setRow.e : [];
      const setName = setRow?.n || "";

      if (!entries.length) return "";

      const entriesHtml = entries.map(e => {
        const itemNames = (Array.isArray(e?.i) ? e.i : []).map(id => {
          const name = itemDisplayNameById(id);
          return `<span class="loot-item-tag" data-item-id="${id}">${escapeHtml(name)}</span>`;
        }).join("");
        if (!itemNames) return "";
        const chance = (e?.chance != null && e.chance !== 1)
          ? ` <span class="loot-chance">${Math.round(e.chance * 100)}%</span>` : "";
        const qty = (e?.mn != null && e?.mx != null && !(e.mn === 1 && e.mx === 1))
          ? ` <span class="loot-qty">${fmtRange(e.mn, e.mx)}</span>` : "";
        return `<div class="loot-entry">${itemNames}${qty}${chance}</div>`;
      }).join("");

      if (!entriesHtml) return "";

      return `
        <div class="loot-set">
          ${setName ? `<div class="loot-set-name">${escapeHtml(setName)}</div>` : ""}
          ${entriesHtml}
        </div>`;
    }).join("");

    html += `
      <div class="info-section">
        <div class="info-subtitle">Drops on Death</div>
        ${mn != null && mx != null ? `<div class="loot-set-count">Loot sets: ${fmtRange(mn, mx)}</div>` : ""}
        ${setsHtml || `<div class="info-empty">No drop data</div>`}
      </div>`;
  }

  // ── Harvest component (tool harvesting) ──────────────────────────────
  if (harvestComp){
    const itemIds = Array.isArray(harvestComp.i) ? harvestComp.i : [];
    const itemsHtml = itemIds.map(id => {
      const name = itemDisplayNameById(id);
      return `<span class="loot-item-tag" data-item-id="${id}">${escapeHtml(name)}</span>`;
    }).join("");

    html += `
      <div class="info-section">
        <div class="info-subtitle">Harvested From Corpse</div>
        <div class="loot-harvest-list">${itemsHtml || `<div class="info-empty">No harvest data</div>`}</div>
      </div>`;
  }

  return html;
}


function renderDinoPanel(name){
  const d = getSelectedDinoGroup(name);
  if (!d){
    renderInfoPanelBodyEmpty();
    return;
  }

  const panel = ensureInfoPanel();
  const activeTab = DINO_PANEL_TABS.some(t => t.id === infoPanelState.dinoTab)
    ? infoPanelState.dinoTab
    : "spawns";

  const spawnCount = d.entries?.length ?? 0;
  const hasLoot = !!(dropCompForDino(d?.bpPath) || harvestCompForDino(d?.bpPath));
  const dinoPanelTabs = [
    { id: "spawns", label: `Spawns (${spawnCount})` },
    { id: "stats",  label: "Stats" },
    ...(hasLoot ? [{ id: "loot", label: "Loot" }] : [])
  ];

  setInfoPanelTitle(name);

  const html = `
    ${renderDinoHero(d, name)}
    ${renderTabs({
      tabs: dinoPanelTabs,
      activeId: activeTab,
      dataAttr: "data-dino-tab"
    })}
    ${renderPages({
      tabs: dinoPanelTabs,
      activeId: activeTab,
      renderPage: (id) => {
        if (id === "spawns") return renderDinoTabSpawns(d, name);
        if (id === "stats") return renderDinoTabStats(d);
        if (id === "loot") return renderDinoTabLoot(d);
        return "";
      }
    })}
  `;

  setInfoPanelHTML(html);

  const body = panel.querySelector(".fp-body");

  wireTabs(body, {
    tabs: dinoPanelTabs,
    activeId: activeTab,
    dataAttr: "data-dino-tab",
    onChange: (id) => {
      infoPanelState.dinoTab = id;
      renderDinoPanel(name);
    }
  });

  body.querySelectorAll("[data-dino-entry-toggle]").forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.key;
      if (!key) return;

      const next = !(entryVisibility[key] ?? true);
      entryVisibility[key] = next;

      // Toggle is-on on the visible card container (parent loot-set-section),
      // not on the inner button itself
      const card = btn.closest(".dino-spawn-section");
      card?.classList.toggle("is-on", next);

      const master = body.querySelector("[data-dino-toggle-all]");
      if (master){
        const allOn = [...body.querySelectorAll("[data-dino-entry-toggle]")]
          .every(el => el.closest(".dino-spawn-section")?.classList.contains("is-on"));
        master.classList.toggle("is-on", allOn);
      }

      drawDino(name);
    };
  });

  const master = body.querySelector("[data-dino-toggle-all]");
  if (master){
    master.onclick = () => {
      const rows = [...body.querySelectorAll("[data-dino-entry-toggle]")];
      const allOn = rows.every(el => el.closest(".dino-spawn-section")?.classList.contains("is-on"));
      const next = !allOn;

      rows.forEach(el => {
        const key = el.dataset.key;
        if (!key) return;
        entryVisibility[key] = next;
        el.closest(".dino-spawn-section")?.classList.toggle("is-on", next);
      });

      master.classList.toggle("is-on", next);
      drawDino(name);
    };
  }

  // Expand/collapse individual spawn cards
  body.querySelectorAll("[data-dino-spawn-card-toggle]").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const key = btn.dataset.dinoSpawnCardToggle;
      const prevScroll = getActiveInfoPanelScroll(infoPanelState.dinoTab);
      dinoSpawnCardOpenState[key] = !dinoSpawnCardOpenState[key];
      renderDinoPanel(name);
      restoreActiveInfoPanelScroll(prevScroll, infoPanelState.dinoTab);
    };
  });

  // Collapse all spawn cards
  body.querySelectorAll("[data-dino-collapse-all]").forEach(btn => {
    btn.onclick = () => {
      const keys = [...body.querySelectorAll("[data-dino-spawn-card-toggle]")]
        .map(b => b.dataset.dinoSpawnCardToggle).filter(Boolean);
      const allOpen = keys.every(k => dinoSpawnCardOpenState[k] ?? true);
      keys.forEach(k => { dinoSpawnCardOpenState[k] = !allOpen; });
      renderDinoPanel(name);
    };
  });

  body.querySelectorAll("[data-open-entry]").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      const entryName = btn.dataset.openEntry;
      openEntryView(entryName);
    };
  });

  mountPanelSwipe(
    body.querySelector(".fp-pages"),
    dinoPanelTabs,
    () => infoPanelState.dinoTab,
    (id) => {
      infoPanelState.dinoTab = id;
      renderDinoPanel(name);
    }
  );

  refreshInfoPanelPageHeight();
  const pagesEl = body.querySelector(".fp-pages");
  syncActivePageHeight(pagesEl, activeTab);
}


function labelsForDinoObj(d){
  const out = new Set();
  if (!d) return [];

  if (d.n) out.add(String(d.n));
  if (d.fn) out.add(String(d.fn));
  if (d.mn) out.add(String(d.mn));

  return [...out];
}


function getSelectedDinoGroup(name){
  const bps = State.nameToBps.get(name) || [];
  if (!bps.length) return null;

  const first = getDinoObjByBp(bps[0]);
  const bpSet = new Set(bps);

  const entryList = [...new Set(
    bps.flatMap(bp => State.dinoToEntries.get(bp) || [])
  )].sort((a,b)=>a.localeCompare(b));

  const entries = entryList.map(entryName => {
    const rows = Global.spawn?.entries?.[entryName]?.d || [];

    let groupWeight = 0;
    let spawnMultiplier = 1;
    let spawnLimit = 1;
    let spawnChances = "";

    for (const r of rows){
      const rawBp = normalizeBp(r?.[0]);
      if (!rawBp) continue;

      const outs = worldOutputsForBp(rawBp);
      let matched = false;

      for (const out of outs){
        const finalBp = normalizeBp(out?.[0]);
        const prob = Number(out?.[1] || 0);
        if (!finalBp || prob <= 0) continue;

        if (bpSet.has(finalBp)){
          groupWeight += Number(r?.[1] || 0) * prob;
          spawnMultiplier = Number(r?.[2] || 1);
          spawnLimit = Number(r?.[3] || 1);
          spawnChances = r?.[4] || "";
          matched = true;
        }
      }

      if (matched) {
        // keep scanning in case multiple rows contribute
      }
    }

    return {
      entryClass: entryName,
      groupWeight,
      spawnMultiplier,
      spawnLimit,
      spawnChances
    };
  }).filter(e => e.groupWeight > 0);

  return {
    displayName: name,
    bpPath: bps[0],
    additionalBpPathsToDisplay: bps.slice(1),
    nameTag: first?.t || "",
    fName: first?.fn || "",
    mName: first?.mn || "",
    tameable: first?.flags?.tameable,
    breedable: first?.flags?.breedable,
    isAlpha: first?.flags?.isAlpha,
    isBoss: first?.flags?.isBoss,
    isBossMinion: first?.flags?.isBossMinion,
    dragWeight: first?.flags?.dragWeight || 35,
    killXpBase: first?.flags?.killXpBase || 2,
    stats: first?.stats || null,
    attacks: first?.attacks || null,
    entries
  };
}


function renderStatsTable(statsObj) {
  if (!statsObj || typeof statsObj !== "object") {
    return `<div style="color:var(--muted)">No stats found.</div>`;
  }

  const keys = [];
  for (const k of STAT_ORDER) if (k in statsObj) keys.push(k);
  for (const k of Object.keys(statsObj)) {
    if (k.endsWith("_TBM")) continue;
    if (!keys.includes(k)) keys.push(k);
  }

  if (!keys.length) {
    return `<div style="color:var(--muted)">No stats found.</div>`;
  }

  const header = `
    <div class="statgrid">
      <div class="statgrid-head">
        <div class="statgrid-th">Stat</div>
        ${STAT_COLS.map(c => `<div class="statgrid-th num">${escapeHtml(c.label)}</div>`).join("")}
      </div>
  `;

  const rows = keys.map(statKey => {
    const label = STAT_LABEL[statKey] || statKey;
    const data = unpackStat(statsObj[statKey]);

    const cells = STAT_COLS.map(c => {
      let txt = "";

      if (c.key === "base") {
        txt = fmtBaseCell(statKey, data.base);
      }
      else if (c.key === "tm" && statKey === "Health" && statsObj.Health_TBM != null) {
        const pct = fmtStatNum(Number(statsObj.Health_TBM) * 100);
        txt = `TBHM: ${pct}%`;
      }
      else {
        const eff = computeDisplayValue(statKey, c.key, data, statsObj);

        if (eff == null) {
          txt = "";
        }
        else if (c.key === "iw") {
          txt = fmtStatNum(eff);
        }
        else if (c.key === "ta") {
          if (isMultiplierStat(statKey)) {
            txt = `${fmtStatNum(eff * 100)}%`;
          } else {
            txt = fmtStatNum(eff);
          }
        }
        else {
          txt = `${fmtStatNum(eff * 100)}%`;
        }
      }

      const muted = txt ? "" : " muted";
      return `<div class="statgrid-td num${muted}">${escapeHtml(txt || "--")}</div>`;
    }).join("");

    return `
      <div class="statgrid-row">
        <div class="statgrid-td statname">${escapeHtml(label)}</div>
        ${cells}
      </div>
    `;
  }).join("");

  return header + rows + `</div>`;
}


function renderAttacksTable(attacks){
  const rows = dedupeDisplayAttacks(attacks);

  if (!rows.length){
    return `<div style="color:var(--muted)"></div>`;
  }

  return `
    <div class="info-section" id="attackTable">
      <div class="info-subtitle">Attacks</div>
      <div class="info-subtitle-sub">(work in progress)</div>

      <div class="atkgrid">
        <div class="atkgrid-head">
          <div class="atkgrid-th">Name</div>
          <div class="atkgrid-th num">Damage</div>
          <div class="atkgrid-th num">Interval</div>
          <div class="atkgrid-th num">Stamina Cost</div>
        </div>

        ${rows.map(a => `
          <div class="atkgrid-row">
            <div class="atkgrid-td name">
              <div class="atkgrid-td atkname">${escapeHtml(a.n || "(Unnamed)")}</div>
              <div class="atkgrid-td wildonly">${a.pr ? "Wild Only" : ""}</div>
            </div>
            <div class="atkgrid-td num">${escapeHtml(a.d != null ? fmtStatNum(a.d) : "--")}</div>
            <div class="atkgrid-td num">${escapeHtml(a.i != null ? fmtStatNum(a.i) : "--")}</div>
            <div class="atkgrid-td num">${escapeHtml(a.s != null ? fmtStatNum(a.s) : "--")}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}


function entryDinoOpenKey(entryName, dinoBp){
  return `${entryName}::${dinoBp}`;
}

function isEntryDinoOpen(entryName, dinoBp){
  return entryDinoOpenState[entryDinoOpenKey(entryName, dinoBp)] ?? true;
}

function setEntryDinoOpen(entryName, dinoBp, open){
  entryDinoOpenState[entryDinoOpenKey(entryName, dinoBp)] = !!open;
}

function areAllEntryDinosOpen(entryName, dinoKeys){
  return dinoKeys.every(bp => isEntryDinoOpen(entryName, bp));
}

function renderEntryDinoBlock(dinoBp, dinoObj, rowsForThisDino, entryName){
  const displayName = dinoObj?.n || bpClass(dinoBp) || "(Unknown)";
  const bp = dinoBp || "";
  const nameTag = dinoObj?.t || "";
  const isOpen = isEntryDinoOpen(entryName, dinoBp);

  const metaHtml = rowsForThisDino.map((r) => {
    const e = r.entry;
    const metaLines = buildEntryMetaLines(e);
    if (!metaLines.length) return "";
    return `
      <div class="entry-meta" style="margin-top:4px;">
        ${metaLines.map(line => `<div class="entry-meta-line">${escapeHtml(line)}</div>`).join("")}
      </div>
    `;
  }).join("");

  return `
    <div class="loot-set-section ${isOpen ? "is-open" : "is-closed"}" style="margin-bottom:6px;">
      <button
        type="button"
        class="loot-set-toggle"
        data-entry-dino-toggle="${escapeAttr(dinoBp)}"
      >
        <div class="loot-set-toggle-main">
          <div class="info-row">
            <span class="info-label">${escapeHtml(displayName)}</span>
          </div>
        </div>
        <div class="loot-set-toggle-right">
          <span class="loot-set-toggle-chevron">${isOpen ? "⌄" : "›"}</span>
        </div>
      </button>

      <div class="loot-set-body" style="display:${isOpen ? "" : "none"};">
        ${metaHtml}
        <button
          type="button"
          class="fp-btn"
          data-open-dino="${escapeAttr(displayName)}"
          style="width:100%; justify-content:center; margin-top:6px;"
        >Open in Dino View ›</button>
      </div>
    </div>
  `;
}

function renderDinoSpawnMenuRow(entry, selectedName, idx){
  const key = entryVisibilityKey(selectedName, idx);
  const checked = entryVisibility[key] ?? true;

  const metaLines = [];

  if (entry.groupWeight != null){
    metaLines.push(`Entry Weight: ${fmt(entry.groupWeight)}`);
  }

  if (entry.spawnChances){
    metaLines.push(`Spawn chances: ${entry.spawnChances}`);
  }

  if (entry.spawnLimit != null){
    metaLines.push(`Max % To Allow: ${fmt(entry.spawnLimit * 100)}%`);
  }

  const isOpen = dinoSpawnCardOpenState[key] ?? true;

  return `
    <div class="loot-set-section dino-spawn-section ${checked ? "is-on" : ""} ${isOpen ? "is-open" : "is-closed"}" style="margin-bottom:6px;">
      <div class="loot-set-toggle dino-spawn-section-header">
        <button
          type="button"
          class="dino-spawn-section-main"
          data-dino-entry-toggle="1"
          data-key="${escapeAttr(key)}"
        >
          <span class="info-label">${escapeHtml(entry.entryClass)}</span>
          ${isOpen ? `
            <span class="dino-spawn-meta">
              ${metaLines.map(line => `
                <span class="dino-spawn-meta-line">${escapeHtml(line)}</span>
              `).join("")}
            </span>
          ` : ""}
        </button>

        <button
          type="button"
          class="loot-set-toggle-right dino-spawn-chevron-btn"
          data-dino-spawn-card-toggle="${escapeAttr(key)}"
          title="${isOpen ? "Collapse" : "Expand"}"
        >
          <span class="loot-set-toggle-chevron">${isOpen ? "⌄" : "›"}</span>
        </button>
      </div>

      ${isOpen ? `
        <div class="loot-set-body">
          <button
            type="button"
            class="fp-btn"
            data-open-entry="${escapeAttr(entry.entryClass)}"
            style="width:100%; justify-content:center; margin-top:6px;"
          >Open in Spawn View ›</button>
        </div>
      ` : ""}
    </div>
  `;
}

function renderEntryTabDinos(entryName){
  const entryIndex = buildEntryIndexForCurrentMap();
  const rows = entryIndex?.[entryName] || [];
  if (!rows.length){
    return `<div style="color:var(--muted)">No dinos found for this spawn entry.</div>`;
  }

  const byDino = new Map();
  for (const r of rows){
    if (!byDino.has(r.dinoKey)) byDino.set(r.dinoKey, []);
    byDino.get(r.dinoKey).push(r);
  }

  const rawDinoKeys = [...byDino.keys()];

  const filteredDinoKeys = rawDinoKeys.filter(bp => {
    if (activeSourceIsOfficial()) return true;
    if (viewOptions.includeOfficialInEntryPanels) return true;
    return isBlueprintFromActiveMod(bp);
  });

  const dinoKeys = filteredDinoKeys.sort((a, b) => {
    const da = getDinoObjByBp(a);
    const db = getDinoObjByBp(b);
    const an = da?.n || a;
    const bn = db?.n || b;
    return an.localeCompare(bn);
  });

  const allOpen = areAllEntryDinosOpen(entryName, dinoKeys);
  const showOfficial = viewOptions.includeOfficialInEntryPanels;

  const officialPill = activeSourceIsOfficial() ? "" : `
    <button type="button"
      class="mod-filter-pill ${showOfficial ? "is-on" : ""}"
      data-entry-official-toggle="1"
      title="${showOfficial ? "Showing all dinos" : "Showing mod dinos only"}"
    >${showOfficial ? "Mod + official dinos" : "Mod dinos only"}</button>
  `;

  const collapseBtn = `
    <button type="button" class="loot-set-toggle-all" data-entry-dino-toggle-all="1" style="margin-left:auto;">
      ${allOpen ? "Collapse All" : "Expand All"}
    </button>
  `;

  return `
    <div class="info-section">
      <div class="mod-filter-row" style="margin-bottom:8px;">
        ${officialPill}
        ${collapseBtn}
      </div>

      <div class="entries" data-entry-dino-list="${escapeAttr(entryName)}">
        ${dinoKeys.map(dinoKey => renderEntryDinoBlock(dinoKey, getDinoObjByBp(dinoKey), byDino.get(dinoKey), entryName)).join("")}
      </div>
    </div>
  `;
}


function fitTitleToSpace(titleEl, opts = {}) {
  if (!titleEl) return;

  const {
    minPx = 10,
    maxPx = 20,
    stepPx = 0.25
  } = opts;

  titleEl.style.fontSize = maxPx + "px";

  if (titleEl.scrollWidth <= titleEl.clientWidth) return;

  let lo = minPx;
  let hi = maxPx;

  for (let i = 0; i < 16; i++) {
    const mid = Math.floor(((lo + hi) / 2) / stepPx) * stepPx;
    titleEl.style.fontSize = mid + "px";

    const fits = titleEl.scrollWidth <= titleEl.clientWidth;
    if (fits) lo = mid;
    else hi = mid - stepPx;

    if (hi < lo) break;
  }

  titleEl.style.fontSize = Math.max(minPx, lo) + "px";
}


function cleanName(s){
  const x = String(s ?? "").trim();
  return x.length ? x : "";
}


function otherSexNameForSelected(d, selectedLabel){
  const f = cleanName(d?.fName);
  const m = cleanName(d?.mName);
  const sel = cleanName(selectedLabel);

  if (!sel) return "";

  if (f && sel.toLowerCase() === f.toLowerCase()) return m;
  if (m && sel.toLowerCase() === m.toLowerCase()) return f;

  if (f && m && f.toLowerCase() !== m.toLowerCase()) return `${f} / ${m}`;
  return "";
}


function applyServerMultiplier(statKey, colKey, value) {
  if (value == null) return value;

  const mult = ARK_DEFAULT_MULT?.[statKey]?.[colKey] ?? 1;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;

  return n * mult;
}


function computeDisplayValue(statKey, colKey, data, statsObj) {
  const raw = data[colKey];

  if (raw == null || raw === "") return null;

  const v = Number(raw);
  if (!Number.isFinite(v)) return null;

  if (v < 0) {
    return v;
  }

  const base = Number(data.base);
  const mult = ARK_DEFAULT_MULT?.[statKey]?.[colKey] ?? 1;
  const effectiveMult = (v < 0) ? 1 : mult;

  if (colKey === "iw") {
    if (!Number.isFinite(base)) return null;
    return base * (v * effectiveMult);
  }

  if (colKey === "it") {
    return v * effectiveMult;
  }

  if (colKey === "ta") {
    return v * effectiveMult;
  }

  if (colKey === "tm") {
    return v * effectiveMult;
  }

  return v;
}


function unpackStat(arr){
  const a = Array.isArray(arr) ? arr : [];
  return {
    base: a.length > 0 ? a[0] : null,
    iw:   a.length > 1 ? a[1] : null,
    it:   a.length > 2 ? a[2] : null,
    ta:   a.length > 3 ? a[3] : null,
    tm:   a.length > 4 ? a[4] : null,
  };
}


function fmtStatNum(v){
  if (v == null || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";

  const abs = Math.abs(n);
  if (abs > 0 && abs < 0.001) return n.toPrecision(3);

  let s = n.toFixed(6);
  s = s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  if (s === "-0") s = "0";
  return s;
}


function isMultiplierStat(statKey){
  return statKey === "MeleeDamageMultiplier"
      || statKey === "SpeedMultiplier"
      || statKey === "CraftingSpeedMultiplier";
}


function fmtBaseCell(statKey, v){
  if (isMultiplierStat(statKey)) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    return `${fmtStatNum(n * 100)}%`;
  }
  return fmtStatNum(v);
}


function cleanAttackName(name){
  return String(name || "").trim();
}


function attackNameBase(name){
  return cleanAttackName(name)
    .replace(/\s*\((ai|ai only)\)\s*$/i, "")
    .trim();
}


function attackKeyForCompare(a){
  const base = attackNameBase(a?.n);
  const dmg = Number(a?.d);
  const dmgKey = Number.isFinite(dmg) ? dmg : "__nodmg__";
  return `${base.toLowerCase()}::${dmgKey}`;
}


function isMeaninglessAttack(a){
  const name = cleanAttackName(a?.n);
  const dmg = Number(a?.d);

  const noName = !name || name.toLowerCase() === "none";
  const noDamage = !Number.isFinite(dmg) || dmg === 0;

  return noName && noDamage;
}


function normalizeAttackRow(a){
  if (!a || typeof a !== "object") return null;

  const out = {
    n: cleanAttackName(a.n),
    i: Number(a.i),
    s: Number(a.s),
    ri: Number(a.ri),
    d: Number(a.d),
    pr: a.pr === 1 || a.pr === "1" || a.pr === true ? 1 : 0
  };

  if (!Number.isFinite(out.i)) out.i = null;
  if (!Number.isFinite(out.s)) out.s = null;
  if (!Number.isFinite(out.ri)) out.ri = null;
  if (!Number.isFinite(out.d)) out.d = null;

  if (isMeaninglessAttack(out)) return null;

  return out;
}


function dedupeDisplayAttacks(attacks){
  const rows = (Array.isArray(attacks) ? attacks : [])
    .map(normalizeAttackRow)
    .filter(Boolean);

  if (!rows.length) return [];

  // If an AI-only version exists and a rider-usable version exists
  // with same base name + same damage, hide the AI-only one.
  const hasNonAiTwin = new Set();

  for (const a of rows){
    if (a.pr === 0){
      hasNonAiTwin.add(attackKeyForCompare(a));
    }
  }

  const filtered = rows.filter(a => {
    if (a.pr !== 1) return true;
    return !hasNonAiTwin.has(attackKeyForCompare(a));
  });

  // Final light dedupe in case exact duplicates still exist
  const seen = new Set();
  const out = [];

  for (const a of filtered){
    const key = [
      attackNameBase(a.n).toLowerCase(),
      a.i ?? "",
      a.s ?? "",
      a.ri ?? "",
      a.d ?? "",
      a.pr
    ].join("::");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }

  return out;
}



const DINO_PANEL_TABS = [
  { id: "spawns", label: "Spawns" },
  { id: "stats",  label: "Stats" }
];


const ARK_DEFAULT_MULT = {
  Health:  { iw: 1, it: 0.2, ta: 0.14, tm: 0.44 },
  Stamina: { iw: 1, it: 1,   ta: 1,    tm: 1 },
  Oxygen:  { iw: 1, it: 1,   ta: 1,    tm: 1 },
  Food:    { iw: 1, it: 1,   ta: 1,    tm: 1 },
  Water:   { iw: 1, it: 1,   ta: 1,    tm: 1 },
  Weight:  { iw: 1, it: 1,   ta: 1,    tm: 1 },
  MeleeDamageMultiplier:   { iw: 1, it: 0.17, ta: 0.14, tm: 0.44 },
  SpeedMultiplier:         { iw: 1, it: 1,    ta: 1,    tm: 1 },
  CraftingSpeedMultiplier: { iw: 1, it: 1,    ta: 1,    tm: 1 },
};





const STAT_COLS = [
  { key: "base", label: "Base" },
  { key: "iw",   label: "Wild" },
  { key: "it",   label: "Tamed" },
  { key: "ta",   label: "Add" },
  { key: "tm",   label: "Mult" },
];




const STAT_ORDER = [
  "Health",
  "Stamina",
  "Oxygen",
  "Food",
  "Water",
  "Weight",
  "MeleeDamageMultiplier",
  "SpeedMultiplier",
  "CraftingSpeedMultiplier",
];




const STAT_LABEL = {
  Health: "Health",
  Stamina: "Stamina",
  Oxygen: "Oxygen",
  Food: "Food",
  Water: "Water",
  Weight: "Weight",
  MeleeDamageMultiplier: "Melee",
  SpeedMultiplier: "Speed",
  CraftingSpeedMultiplier: "Craft",
};
