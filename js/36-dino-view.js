/* Split from app_embed.js lines 2386-2607 */

/* ============================================================
   DINO PANEL
============================================================ */

const DINO_PANEL_TABS = [
  { id: "spawns", label: "Spawns" },
  { id: "stats",  label: "Stats" }
];

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

function installPanelTitleFitter(panelEl, opts = {}) {
  const titleEl = panelEl?.querySelector(".fp-title");
  const titleWrap = titleEl?.parentElement;

  if (!panelEl || !titleEl) return;

  requestAnimationFrame(() => fitTitleToSpace(titleEl, opts));

  if (panelEl._titleFitCleanup) {
    panelEl._titleFitCleanup();
    panelEl._titleFitCleanup = null;
  }

  const ro = new ResizeObserver(() => fitTitleToSpace(titleEl, opts));
  ro.observe(titleWrap || panelEl);

  const mo = new MutationObserver(() => fitTitleToSpace(titleEl, opts));
  mo.observe(titleEl, { childList: true, characterData: true, subtree: true });

  panelEl._titleFitCleanup = () => {
    ro.disconnect();
    mo.disconnect();
  };
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
  return `
    <div class="info-section">
      <div class="info-subtitle">Spawn Entries (${entries.length})</div>
      <div class="entries">
        ${entries.map((e, i) => renderEntryRow(e, selectedName, i)).join("")}
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

  setInfoPanelTitle(name);

  const html = `
    ${renderDinoHero(d, name)}
    ${renderTabs({
      tabs: DINO_PANEL_TABS,
      activeId: activeTab,
      dataAttr: 'data-dino-tab'
    })}
    ${renderPages({
      tabs: DINO_PANEL_TABS,
      activeId: activeTab,
      renderPage: (id) => {
        if (id === "spawns") return renderDinoTabSpawns(d, name);
        if (id === "stats") return renderDinoTabStats(d);
        return "";
      }
    })}
  `;

  setInfoPanelHTML(html);

  const body = panel.querySelector(".fp-body");
  wireTabs(body, {
    tabs: DINO_PANEL_TABS,
    activeId: activeTab,
    dataAttr: "data-dino-tab",
    onChange: (id) => {
      infoPanelState.dinoTab = id;
      renderDinoPanel(name);
    }
  });
  body.querySelectorAll('input[data-entry-toggle="1"]').forEach(chk => {
    chk.onchange = () => {
      const key = chk.dataset.key;
      entryVisibility[key] = chk.checked;
      drawDino(name);
    };
  });
  mountPanelSwipe(
    body.querySelector(".fp-pages"),
    DINO_PANEL_TABS,
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
