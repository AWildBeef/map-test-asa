/* Split from app_embed.js lines 919-1083 */

/* ============================================================
   MAP ENTRIES PANEL
============================================================ */

function ensureMapEntriesPanel(){
  let panel = document.getElementById("mapEntriesPanel");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = "mapEntriesPanel";
  panel.className = "floating-panel floating-panel--small";

  panel.innerHTML = `
    <div class="fp-header">
      <div class="fp-title">Map Entries</div>
      <div class="fp-actions">
        <button type="button" class="fp-btn fp-btn-chevron" data-action="min" title="Collapse">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M6 9l6 6 6-6"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"/>
          </svg>
        </button>
        <button type="button" class="fp-btn" data-action="hide" title="Hide">✕</button>
      </div>
    </div>
    <div class="fp-body"></div>
  `;

  const mapWrap = document.getElementById("mapWrap") || document.body;
  mapWrap.appendChild(panel);

  panel.style.position = "absolute";
  panel.style.right = "2px";
  panel.style.bottom = "90px";
  panel.style.zIndex = "800";
  panel.style.display = "none";
  panel.dataset.hidden = "1";

  const body = panel.querySelector(".fp-body");

  panel.querySelector('[data-action="min"]').onclick = () => {
    const closed = body.style.display === "none";
    body.style.display = closed ? "" : "none";
    panel.classList.toggle("collapsed", !closed);
  };

  panel.querySelector('[data-action="hide"]').onclick = () => {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
    updateDockToggles();
  };

  return panel;
}

function renderMapEntriesList(){
  const panel = ensureMapEntriesPanel();
  const body = panel.querySelector(".fp-body");
  const list = body.querySelector(".mapEntriesList");
  if (!list) return;

  const rows = getFilteredMapEntryRows();

  list.innerHTML = rows.length
    ? rows.map(r => `
        <div class="dd-item" data-entry-jump="${escapeAttr(r.entryName)}">
          <div class="dd-item-left" style="display:block; min-width:0;">
            <div class="dd-item-name">${escapeHtml(r.entryName)}</div>
            <div class="dd-item-meta">
              ${
                r.uniqueHere
                  ? `<div class="entry-meta-line">Unique to this map</div>`
                  : `<div class="entry-meta-line">Used on ${r.mapCount} maps</div>`
              }
              <div class="entry-meta-line">${escapeHtml(r.mapNames.join(", "))}</div>
            </div>
          </div>
        </div>
      `).join("")
    : `<div style="color:var(--muted)">No matching spawn entries.</div>`;

  list.querySelectorAll("[data-entry-jump]").forEach(row => {
    row.onclick = () => {
      const entryName = row.dataset.entryJump;
      if (!entryName) return;

      State.mode = "entry";
      syncModeButton();
      rebuildDinoSelect();

      State.selection = entryName;
      UI.dinoSelect.value = entryName;

      render();
    };
  });
}

function renderMapEntriesPanel(){
  const panel = ensureMapEntriesPanel();
  const body = panel.querySelector(".fp-body");
  if (!body) return;

  body.innerHTML = `
    <div class="fp-row" style="gap:6px; flex-wrap:wrap;">
      <button type="button" class="fp-tab ${entryBrowserState.filter === "all" ? "is-on" : ""}" data-entry-filter="all">All</button>
      <button type="button" class="fp-tab ${entryBrowserState.filter === "unique" ? "is-on" : ""}" data-entry-filter="unique">Unique</button>
      <button type="button" class="fp-tab ${entryBrowserState.filter === "shared" ? "is-on" : ""}" data-entry-filter="shared">Shared</button>
    </div>

    <input
      id="mapEntriesSearch"
      class="dd-search"
      type="text"
      placeholder="Search spawn entries..."
      value="${escapeAttr(entryBrowserState.search)}"
      style="margin-bottom:8px;"
    >

    <div class="dd-list mapEntriesList"></div>
  `;

  body.querySelectorAll("[data-entry-filter]").forEach(btn => {
    btn.onclick = () => {
      entryBrowserState.filter = btn.dataset.entryFilter;

      body.querySelectorAll("[data-entry-filter]").forEach(b => {
        b.classList.toggle("is-on", b.dataset.entryFilter === entryBrowserState.filter);
      });

      renderMapEntriesList();
    };
  });

  const search = body.querySelector("#mapEntriesSearch");
  if (search){
    search.oninput = () => {
      entryBrowserState.search = search.value || "";
      renderMapEntriesList();
    };
  }

  renderMapEntriesList();
}

function toggleMapEntriesPanel(){
  const panel = ensureMapEntriesPanel();
  const show = panel.style.display === "none";

  if (show){
    renderMapEntriesPanel();
    panel.style.display = "";
    panel.dataset.hidden = "0";
  } else {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
  }

  updateDockToggles();
}
