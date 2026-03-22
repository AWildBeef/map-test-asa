/* Split from app_embed.js lines 2608-2770 */

/* ============================================================
   ENTRY PANEL
============================================================ */

const ENTRY_PANEL_TABS = [
  { id: "dinos", label: "Dinos" },
  { id: "info",  label: "Info" }
];

function mapsForEntry(entryName){
  const codes = Global.spawn?.entryMaps?.[entryName] || [];
  if (!Array.isArray(codes)) return [];

  return codes.map(code => {
    return Global.spawn?.mapLegend?.[code] || code;
  });
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

  return `
    <div class="info-section">
      <div class="info-subtitle">Dinos (${dinoKeys.length})</div>
      
      ${
        activeSourceIsOfficial()
          ? ""
          : `
            <label class="fp-row" style="margin-bottom:8px;">
              <input
                type="checkbox"
                id="entryIncludeOfficialToggle"
                ${viewOptions.includeOfficialInEntryPanels ? "checked" : ""}
              >
              <span>Show official dinos</span>
            </label>
          `
      }

      <div class="entries">
        ${dinoKeys.map(dinoKey => renderEntryDinoBlock(dinoKey, getDinoObjByBp(dinoKey), byDino.get(dinoKey))).join("")}
      </div>
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

  setInfoPanelTitle(entryName);

  const html = `
    ${renderEntryHero(entryName)}
    ${renderTabs({
      tabs: ENTRY_PANEL_TABS,
      activeId: activeTab,
      dataAttr: 'data-entry-tab'
    })}
    ${renderPages({
      tabs: ENTRY_PANEL_TABS,
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
    tabs: ENTRY_PANEL_TABS,
    activeId: activeTab,
    dataAttr: "data-entry-tab",
    onChange: (id) => {
      infoPanelState.entryTab = id;
      renderEntryPanel(entryName);
    }
  });
  const officialToggle =  body.querySelector("#entryIncludeOfficialToggle");
  if (officialToggle){
    officialToggle.onchange = () => {
      viewOptions.includeOfficialInEntryPanels = officialToggle.checked;
      renderEntryPanel(entryName);
    };
  }
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
