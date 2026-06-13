

function mapsForEntry(entryName){
  const codes = Global.spawn?.entryMaps?.[entryName] || [];
  if (!Array.isArray(codes)) return [];

  return codes.map(code => {
    return Global.spawn?.mapLegend?.[code] || code;
  });
}


function isEntryUniqueToCurrentMap(entryName){
  const codes = mapsForEntry(entryName);
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const curCode = mapMeta?.mapCode;
  return codes.length === 1 && codes[0] === curCode;
}


function isEntryShared(entryName){
  return mapsForEntry(entryName).length > 1;
}


function buildMapEntryBrowserRows(){
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const curCode = mapMeta?.mapCode;

  return [...State.mapEntries]
    .sort((a, b) => a.localeCompare(b))
    .map(entryName => {
      const codes = Array.isArray(Global.spawn?.entryMaps?.[entryName])
        ? Global.spawn.entryMaps[entryName]
        : [];

      const mapNames = codes.map(code => Global.spawn?.mapLegend?.[code] || code);
      const uniqueHere = (codes.length === 1 && codes[0] === curCode);

      return {
        entryName,
        codes,
        mapNames,
        mapCount: codes.length,
        uniqueHere,
        shared: codes.length > 1
      };
    });
}


function getEntryRowsCurrentMap(){
  let rows = buildMapEntryBrowserRows();
  return filterSpawnRows(rows);
}


function formatSpawnChances(chances) {
  if (chances == null) return "";

  if (Array.isArray(chances)) {
    const parts = chances
      .map(n => Number(n))
      .filter(n => Number.isFinite(n));
    return parts.length
      ? `Spawn chances: ${parts.map(n => `${fmt(n)}%`).join(", ")}`
      : "";
  }

  if (typeof chances === "string") {
    const parts = chances
      .split(",")
      .map(s => s.trim().replace(/%$/, ""))
      .filter(Boolean)
      .map(s => Number(s))
      .filter(n => Number.isFinite(n));

    return parts.length
      ? `Spawn chances: ${parts.map(n => `${fmt(n)}%`).join(", ")}`
      : "";
  }

  return "";
}


function buildEntryMetaLines(entry){
  const lines = [];

  const gw  = entry?.groupWeight ?? entry?.group_weight;
  const lim = entry?.spawnLimit ?? entry?.spawn_limit;
  const chances = entry?.spawnChances ?? entry?.spawn_chances;

  if (gw != null) lines.push(`Entry Weight: ${fmt(gw)}`);

  const chancesLine = formatSpawnChances(chances);
  if (chancesLine) lines.push(chancesLine);

  if (lim != null) lines.push(`Max % To Allow: ${fmt(Number(lim) * 100)}%`);

  return lines;
}


function renderEntryRow(entry, dinoKey, idx){
  const key = entryVisibilityKey(dinoKey, idx);
  const visible = entryVisibility[key] ?? true;

  const entryClass = entry.entryClass || entry.entry || `Entry ${idx + 1}`;
  const metaLines = buildEntryMetaLines(entry);

  return `
    <label class="entry-row">
      <input
        type="checkbox"
        data-entry-toggle="1"
        data-key="${escapeAttr(key)}"
        ${visible ? "checked" : ""}
      >
      <div class="entry-main">
        <div class="entry-name">${escapeHtml(entryClass)}</div>
        <div class="entry-meta">
          ${metaLines.map(line => `<div class="entry-meta-line">${escapeHtml(line)}</div>`).join("")}
        </div>
      </div>
    </label>
  `;
}


function buildEntryIndexForCurrentMap(){
  const idx = {};

  for (const entryName of State.mapEntries){
    const rows = Global.spawn?.entries?.[entryName]?.d || [];

    for (const r of rows){
      // r[0] is a dino reference: a numeric dino index in current data, or a
      // bp string in older/mod data. Resolve to a bp before the world-
      // replacement lookup, otherwise replacement rules never match.
      const rawBp = normalizeBp(bpForDinoRef(r?.[0]));
      if (!rawBp) continue;

      const outs = worldOutputsForBp(rawBp);

      for (const out of outs){
        const finalBp = normalizeBp(out?.[0]);
        const prob = Number(out?.[1] || 0);
        if (!finalBp || prob <= 0) continue;

        (idx[entryName] ||= []).push({
          dinoKey: finalBp,
          entry: {
            entryClass: entryName,
            sourceBp: rawBp,
            outputBp: finalBp,
            outputChance: prob,
            groupWeight: Number(r?.[1] || 0) * prob,
            spawnMultiplier: Number(r?.[2] || 1),
            spawnLimit: Number(r?.[3] || 1),
            spawnChances: r?.[4] || ""
          }
        });
      }
    }
  }

  return idx;
}


function renderEntryHero(entryName){
  const entryBp = Global.spawn?.entries?.[entryName]?.bp || "";

  const idRow = (tag, value) => value ? `
    <div class="iv-cmd-line copy-on-click" data-copy="${escapeAttr(value)}" title="Tap to copy">
      <span class="iv-cmd-tag">${escapeHtml(tag)}</span>
      <span class="iv-cmd-text">${escapeHtml(value)}</span>
    </div>` : "";

  return `
    <div class="entry-hero">
      <div class="entry-hero-title">${escapeHtml(entryName)}</div>
      <div class="sv-idrows">
        ${idRow("CLASS", entryName)}
        ${idRow("BP", entryBp)}
      </div>
      <div class="iv-cmd-hint">tap a row to copy</div>
    </div>
  `;
}

// ── Spawn manager info (md / ii / iim / c / u / dw / wiw / lm / cld / cwd / cdc) ──

// Resolve cdc (OnlyCountDinoClasses) values — single index or array — to
// display names for chips.
function cdcDinoNames(cdc){
  const refs = Array.isArray(cdc) ? cdc : (cdc != null ? [cdc] : []);
  return refs
    .map(ref => {
      const bp = bpForDinoRef(ref);
      const obj = bp ? getDinoObjByBp(bp) : null;
      return obj?.n || null;
    })
    .filter(Boolean);
}

function managersForEntryOnCurrentMap(entryName){
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);
  return geom?.entries?.[entryName]?.m || null;
}

function renderEntryManagersSection(entryName){
  const managers = managersForEntryOnCurrentMap(entryName);
  const mgrList = managers ? Object.values(managers) : [];
  if (!mgrList.length){
    return `
      <div class="info-section">
        <div class="iv-eyebrow">Spawn Managers</div>
        <div class="info-empty">No manager data on this map.</div>
      </div>`;
  }

  const totalMin = mgrList.reduce((s, m) => s + (Number(m?.md) || 0), 0);

  // Group managers that share identical settings so a dozen clones read as
  // one line instead of a dozen.
  const groups = new Map();
  for (const m of mgrList){
    const zones = (m?.b?.length || 0) + (m?.p?.length || 0);
    const cdcKey = Array.isArray(m?.cdc) ? [...m.cdc].sort().join(",") : (m?.cdc ?? "");
    const sig = JSON.stringify([
      m?.md ?? null, m?.ii ?? null, m?.iim ?? null,
      m?.c ? 1 : 0, m?.u ? 1 : 0, m?.dw ? 1 : 0, m?.wiw ? 1 : 0,
      m?.lm ?? null, m?.cld ? 1 : 0, m?.cwd ? 1 : 0, cdcKey, zones
    ]);
    if (!groups.has(sig)) groups.set(sig, { mgr: m, count: 0, zones });
    groups.get(sig).count++;
  }

  const groupHtml = [...groups.values()].map(({ mgr, count, zones }) => {
    const md = Number(mgr?.md) || 0;
    const line = `
      <div class="sv-mgr-line">
        <b>${count}</b> manager${count > 1 ? "s" : ""}
        · Min <b>${escapeHtml(fmt(md))}</b>${count > 1 ? ` each <span class="dim">(${escapeHtml(fmt(md * count))} total)</span>` : ""}
        ${zones > 1 ? `<span class="dim">· ${zones} linked zones</span>` : ""}
      </div>`;

    const chips = [];
    if (mgr?.c)  chips.push(`<span class="lc-chip flag-cave">Cave</span>`);
    if (mgr?.u)  chips.push(`<span class="lc-chip flag-untame">Untameable</span>`);
    if (mgr?.ii != null)  chips.push(`<span class="lc-chip">Respawn <b>${escapeHtml(fmtDuration(mgr.ii))}</b></span>`);
    if (mgr?.iim != null) chips.push(`<span class="lc-chip">Max Respawn <b>${escapeHtml(fmtDuration(mgr.iim))}</b></span>`);
    if (mgr?.lm != null)  chips.push(`<span class="lc-chip">Level ×<b>${escapeHtml(fmt(mgr.lm))}</b></span>`);
    if (mgr?.cld) chips.push(`<span class="lc-chip">Counts land dinos only</span>`);
    if (mgr?.cwd) chips.push(`<span class="lc-chip">Counts water dinos only</span>`);
    const cdcNames = cdcDinoNames(mgr?.cdc);
    if (cdcNames.length){
      chips.push(`<span class="lc-chip">Counts only →</span>` +
        cdcNames.map(n => `<span class="lc-chip dino" data-open-dino="${escapeAttr(n)}">${escapeHtml(n)}</span>`).join(""));
    }
    if (mgr?.dw)  chips.push(`<span class="lc-chip">No wandering</span>`);
    if (mgr?.wiw) chips.push(`<span class="lc-chip">Ignores wild</span>`);

    return `
      <div class="sv-mgr">
        ${line}
        ${chips.length ? `<div class="lc-chips">${chips.join("")}</div>` : ""}
      </div>`;
  }).join("");

  return `
    <div class="info-section">
      <div class="iv-eyebrow">Spawn Managers</div>
      <div class="lc-chips" style="margin-bottom:9px;">
        <span class="lc-chip">Managers <b>${mgrList.length}</b></span>
        <span class="lc-chip">Min Desired NPCs <b>${escapeHtml(fmt(totalMin))}</b></span>
      </div>
      ${groupHtml}
    </div>`;
}


function renderEntryTabInfo(entryName){
  const maps = mapsForEntry(entryName);

  return `
    <div class="info-section">
      <div class="iv-eyebrow" style="margin-top:2px;">Used On Maps (${maps.length})</div>
      ${
        maps.length
          ? `<div class="lc-chips">
              ${maps.map(m => `<span class="lc-chip">${escapeHtml(m)}</span>`).join("")}
             </div>`
          : `<div style="color:var(--muted)">No map list found.</div>`
      }
    </div>
    ${renderEntryManagersSection(entryName)}
  `;
}


function renderEntryPanel(entryName){
  const panel = ensureInfoPanel();
  const activeTab = ENTRY_PANEL_TABS.some(t => t.id === infoPanelState.entryTab)
    ? infoPanelState.entryTab
    : "dinos";

  // Count dinos for the tab label
  const entryIndex = buildEntryIndexForCurrentMap();
  const entryRows = entryIndex?.[entryName] || [];
  const byDino = new Map();
  for (const r of entryRows) {
    if (!byDino.has(r.dinoKey)) byDino.set(r.dinoKey, []);
    byDino.get(r.dinoKey).push(r);
  }
  const dinoCount = [...byDino.keys()].filter(bp => {
    if (activeSourceIsOfficial()) return true;
    if (viewOptions.includeOfficialInEntryPanels) return true;
    return isBlueprintFromActiveMod(bp);
  }).length;

  const entryPanelTabs = [
    { id: "dinos", label: `Dinos (${dinoCount})` },
    { id: "info",  label: "Info" }
  ];

  setInfoPanelTitle(entryName);

  const html = `
    ${renderEntryHero(entryName)}
    ${renderTabs({
      tabs: entryPanelTabs,
      activeId: activeTab,
      dataAttr: 'data-entry-tab'
    })}
    ${renderPages({
      tabs: entryPanelTabs,
      activeId: activeTab,
      renderPage: (id) => {
        if (id === "dinos") return renderEntryTabDinos(entryName);
        if (id === "info") return renderEntryTabInfo(entryName);
        return "";
      },
      pageClass: "fp-pages--entry"
    })}
  `;

  setInfoPanelHTML(html);

  const body = panel.querySelector(".fp-body");
  wireTabs(body, {
    tabs: entryPanelTabs,
    activeId: activeTab,
    dataAttr: "data-entry-tab",
    onChange: (id) => {
      infoPanelState.entryTab = id;
      renderEntryPanel(entryName);
    }
  });
  const officialToggle = body.querySelector("[data-entry-official-toggle]");
  if (officialToggle){
    officialToggle.onclick = () => {
      viewOptions.includeOfficialInEntryPanels = !viewOptions.includeOfficialInEntryPanels;
      renderEntryPanel(entryName);
    };
  }

  body.querySelectorAll("[data-open-dino]").forEach(btn => {
    btn.onclick = () => {
      const bp = btn.dataset.openDino;
      if (bp) openDinoView(bp);
    };
  });

  // Wire individual dino collapse toggles
  body.querySelectorAll("[data-entry-dino-toggle]").forEach(btn => {
    btn.onclick = () => {
      const dinoBp = btn.dataset.entryDinoToggle;
      const prevScroll = getActiveInfoPanelScroll(infoPanelState.entryTab);
      setEntryDinoOpen(entryName, dinoBp, !isEntryDinoOpen(entryName, dinoBp));
      renderEntryPanel(entryName);
      restoreActiveInfoPanelScroll(prevScroll, infoPanelState.entryTab);
    };
  });

  // Wire collapse all
  body.querySelectorAll("[data-entry-dino-toggle-all]").forEach(btn => {
    btn.onclick = () => {
      const list = body.querySelector("[data-entry-dino-list]");
      const dinoKeys = [...(list?.querySelectorAll("[data-entry-dino-toggle]") || [])]
        .map(b => b.dataset.entryDinoToggle);
      const allOpen = areAllEntryDinosOpen(entryName, dinoKeys);
      dinoKeys.forEach(bp => setEntryDinoOpen(entryName, bp, !allOpen));
      renderEntryPanel(entryName);
    };
  });
  mountPanelSwipe(
    body.querySelector(".fp-pages"),
    ENTRY_PANEL_TABS,
    () => infoPanelState.entryTab,
    (id) => {
      infoPanelState.entryTab = id;
      renderEntryPanel(entryName);
    }
  );
  refreshInfoPanelPageHeight();
  const pagesEl = body.querySelector(".fp-pages");
  syncActivePageHeight(pagesEl, activeTab);
}



const ENTRY_PANEL_TABS = [
  { id: "dinos", label: "Dinos" },
  { id: "info",  label: "Info" }
];
