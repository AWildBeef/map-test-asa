

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
      const rawBp = normalizeBp(r?.[0]);
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

  return `
    <div class="entry-hero">
      <div class="entry-hero-title">${escapeHtml(entryName)}</div>
      <div class="info-submeta">Spawn Entry</div>
      ${renderCopyField("Entry Blueprint", entryBp)}
      ${renderCopyField("Entry Class", entryName)}
    </div>
  `;
}


function renderEntryTabInfo(entryName){
  const maps = mapsForEntry(entryName);

  return `
    <div class="info-section">
      <div class="info-subtitle">Used On Maps (${maps.length})</div>
      ${
        maps.length
          ? `<div class="entry-meta">
              ${maps.map(m => `<div class="entry-meta-line">${escapeHtml(m)}</div>`).join("")}
             </div>`
          : `<div style="color:var(--muted)">No map list found.</div>`
      }
    </div>
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
  const officialToggle = body.querySelector("#entryIncludeOfficialToggle");
  if (officialToggle){
    officialToggle.onchange = () => {
      viewOptions.includeOfficialInEntryPanels = officialToggle.checked;
      renderEntryPanel(entryName);
    };
  }

  // Wire individual dino collapse toggles
  body.querySelectorAll("[data-entry-dino-toggle]").forEach(btn => {
    btn.onclick = () => {
      const dinoBp = btn.dataset.entryDinoToggle;
      setEntryDinoOpen(entryName, dinoBp, !isEntryDinoOpen(entryName, dinoBp));
      renderEntryPanel(entryName);
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
