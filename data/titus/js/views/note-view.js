/* ============================================================
   NOTE VIEW  (v5.12)
   Explorer Notes & Dino Dossiers — search, map markers,
   and console command generation.

   Note data format (from geom pois.explorerNotes):
     [index, name, UE_X, UE_Y, UE_Z]

   Coordinate conversion relies on worldBounds being present in the
   geom file (added by the POI exporter):
     { minX, maxX, minY, maxY }  (UE world units)

   Commands:
     Teleport : cheat SPI <X> <Y> <Z>  (SetPlayerImpulse)
     Unlock   : cheat UnlockExplorerNote <index>
============================================================ */


/* ── Data helpers ──────────────────────────────────────────── */

function getNotesForCurrentMap() {
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);
  return Array.isArray(geom?.pois?.explorerNotes) ? geom.pois.explorerNotes : [];
}

function noteHasCoords(note) {
  const wb = boundsForCurrentMap();
  return !!wb && Array.isArray(note) && note.length >= 4;
}

/* ── Command generation ────────────────────────────────────── */

// Teleport to the note location using cheat SPI (SetPlayerImpulse)
// Adds a small Z offset so the player lands on the ground rather than in it.
function noteTeleportCommand(note) {
  const [idx, name, ue_x, ue_y, ue_z] = note;
  const z = Math.round((ue_z || 0) + 200);
  return `cheat SPI ${Math.round(ue_x)} ${Math.round(ue_y)} ${z}`;
}

// Unlock (give) the note without travelling to it
function noteUnlockCommand(note) {
  const [idx] = note;
  return `cheat UnlockExplorerNote ${idx}`;
}

/* ── Filtering ─────────────────────────────────────────────── */

function filteredNotes(tabMode) {
  const notes = getNotesForCurrentMap();
  const q = String(noteViewState.query || "").trim().toLowerCase();

  return notes.filter(note => {
    if (!Array.isArray(note) || note.length < 2) return false;
    const [idx, name] = note;
    const dossier = isDossierNote(name);
    if (tabMode === "notes"    &&  dossier) return false;
    if (tabMode === "dossiers" && !dossier) return false;

    if (!q) return true;
    if (noteViewState.searchMode === "index") return String(idx).includes(q);
    return String(name).toLowerCase().includes(q);
  });
}

/* ── Info panel content ────────────────────────────────────── */

function renderNotePanel(note) {
  if (!note || !Array.isArray(note)) { renderInfoPanelBodyEmpty(); return; }

  const [idx, name, ue_x, ue_y, ue_z] = note;
  const dossier = isDossierNote(name);

  const gps    = ueToGps(ue_x, ue_y);
  const gpsStr = gps ? `${gps.lat.toFixed(1)}, ${gps.lon.toFixed(1)}` : "N/A (bounds missing from geom)";

  const teleportCmd = noteTeleportCommand(note);
  const unlockCmd   = noteUnlockCommand(note);

  setInfoPanelTitle(name);
  setInfoPanelHTML(`
    <div class="entry-hero">
      <div class="entry-hero-title">${escapeHtml(name)}</div>
      <div class="meta-grid">
        <div class="meta-cell">
          <div class="meta-stack">
            <div class="meta-label">Type</div>
            <div class="meta-value">${dossier ? "Dino Dossier" : "Explorer Note"}</div>
          </div>
        </div>
        <div class="meta-cell">
          <div class="meta-stack">
            <div class="meta-label">Index</div>
            <div class="meta-value">${escapeHtml(String(idx))}</div>
          </div>
        </div>
        <div class="meta-cell">
          <div class="meta-stack">
            <div class="meta-label">GPS</div>
            <div class="meta-value">${escapeHtml(gpsStr)}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="info-section">
      <div class="info-subtitle">Commands</div>

      <div class="note-cmd-block">
        <div class="note-cmd-label">Teleport To Note</div>
        <div class="info-mono copy-on-click" data-copy="${escapeAttr(teleportCmd)}">${escapeHtml(teleportCmd)}</div>
      </div>

      <div class="note-cmd-block" style="margin-top:8px;">
        <div class="note-cmd-label">Unlock Note</div>
        <div class="info-mono copy-on-click" data-copy="${escapeAttr(unlockCmd)}">${escapeHtml(unlockCmd)}</div>
      </div>
    </div>

    <div class="info-section">
      <div class="info-subtitle">UE Coordinates</div>
      <div class="entry-meta">
        <div class="entry-meta-line">X: ${escapeHtml(String(Math.round(ue_x)))}</div>
        <div class="entry-meta-line">Y: ${escapeHtml(String(Math.round(ue_y)))}</div>
        <div class="entry-meta-line">Z: ${escapeHtml(String(Math.round(ue_z || 0)))}</div>
      </div>
    </div>
  `);
}

/* ── Note View floating panel ──────────────────────────────── */

function ensureNoteViewPanel() {
  let panel = document.getElementById("noteViewPanel");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = "noteViewPanel";
  panel.className = "floating-panel floating-panel--small";
  panel.innerHTML = `
    <div class="fp-header">
      <div class="fp-title">Note View</div>
      <div class="fp-actions">
        <button type="button" class="fp-btn fp-btn-chevron" data-action="min" title="Collapse">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button type="button" class="fp-btn" data-action="hide" title="Hide">✕</button>
      </div>
    </div>
    <div class="fp-body"></div>
  `;

  const mapWrap = document.getElementById("mapWrap") || document.body;
  mapWrap.appendChild(panel);

  panel.style.cssText = "position:absolute; right:2px; bottom:90px; z-index:800; display:none;";
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

function renderNoteViewList(panel) {
  const body = panel.querySelector(".fp-body");
  const list = body?.querySelector(".noteViewList");
  if (!list) return;

  const tab  = noteViewState.noteTab || "notes";
  const rows = filteredNotes(tab);

  if (!rows.length) {
    list.innerHTML = `<div style="color:var(--muted)">No matching notes.</div>`;
    return;
  }

  list.innerHTML = rows.map(note => {
    const [idx, name] = note;
    // Encode only index+name (safe small data) for the click handler
    return `
      <div class="dd-item" data-note-idx="${escapeAttr(String(idx))}" data-note-name="${escapeAttr(name)}">
        <div class="dd-item-left" style="display:block; min-width:0;">
          <div class="dd-item-name">${escapeHtml(name)}</div>
          <div class="dd-item-meta">
            <div class="entry-meta-line">Index: ${idx}</div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll("[data-note-idx]").forEach(row => {
    row.onclick = () => {
      const idx  = Number(row.dataset.noteIdx);
      const name = row.dataset.noteName;
      const allNotes = getNotesForCurrentMap();
      const note = allNotes.find(n => n[0] === idx && n[1] === name);
      if (!note) return;

      noteViewState.selected = note;

      // Highlight active row
      list.querySelectorAll(".dd-item").forEach(r => r.classList.remove("is-active"));
      row.classList.add("is-active");

      renderNotePanel(note);
      drawNote(note);

      // Expand info panel if collapsed
      const infoPanel = ensureInfoPanel();
      infoPanel.style.display = "";
      const infoBody = infoPanel.querySelector(".fp-body");
      if (infoBody) infoBody.style.display = "";
      infoPanel.classList.remove("collapsed");
    };
  });
}

function renderNoteViewPanel() {
  const panel = ensureNoteViewPanel();
  const body  = panel.querySelector(".fp-body");
  if (!body) return;

  const allNotes    = getNotesForCurrentMap();
  const totalNotes  = allNotes.filter(n => !isDossierNote(n[1])).length;
  const totalDoss   = allNotes.filter(n =>  isDossierNote(n[1])).length;
  const tab         = noteViewState.noteTab || "notes";

  const placeholder = noteViewState.searchMode === "index"
    ? "Search by index number..."
    : "Search by note name...";

  body.innerHTML = `
    ${renderTabs({
      tabs: [
        { id: "notes",    label: `Explorer Notes (${totalNotes})` },
        { id: "dossiers", label: `Dino Dossiers (${totalDoss})` }
      ],
      activeId: tab,
      dataAttr: "data-note-tab"
    })}

    <div class="fp-row" style="gap:6px; margin-bottom:6px; flex-wrap:wrap;">
      <button type="button"
        class="fp-tab ${noteViewState.searchMode === "name"  ? "is-on" : ""}"
        data-note-search-mode="name">By Name</button>
      <button type="button"
        class="fp-tab ${noteViewState.searchMode === "index" ? "is-on" : ""}"
        data-note-search-mode="index">By Index</button>
    </div>

    <input
      id="noteViewSearch"
      class="dd-search"
      type="${noteViewState.searchMode === "index" ? "number" : "text"}"
      placeholder="${escapeAttr(placeholder)}"
      value="${escapeAttr(noteViewState.query)}"
      style="margin-bottom:8px;"
    >

    <div class="dd-list noteViewList" style="max-height:320px; overflow-y:auto;"></div>
  `;

  wireTabs(body, {
    tabs: [
      { id: "notes",    label: "" },
      { id: "dossiers", label: "" }
    ],
    activeId: tab,
    dataAttr: "data-note-tab",
    onChange: id => {
      noteViewState.noteTab = id;
      noteViewState.query   = "";
      renderNoteViewPanel();
    }
  });

  body.querySelectorAll("[data-note-search-mode]").forEach(btn => {
    btn.onclick = () => {
      noteViewState.searchMode = btn.dataset.noteSearchMode;
      noteViewState.query      = "";
      renderNoteViewPanel();
    };
  });

  const search = body.querySelector("#noteViewSearch");
  if (search) {
    search.oninput = () => {
      noteViewState.query = search.value || "";
      renderNoteViewList(panel);
    };
    // Auto-focus for convenience
    requestAnimationFrame(() => search.focus?.());
  }

  renderNoteViewList(panel);
}

function toggleNoteViewPanel() {
  const panel = ensureNoteViewPanel();
  const show  = panel.style.display === "none";
  if (show) {
    renderNoteViewPanel();
    panel.style.display = "";
    panel.dataset.hidden = "0";
  } else {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
  }
  updateDockToggles();
}

/* ── Map drawing for selected note ─────────────────────────── */

function drawNote(note) {
  clearDraw();
  clearPois();

  if (!note || !mapObj?.poiLayer) return;

  const [idx, name, ue_x, ue_y] = note;
  const latlng = ueToLeaflet(ue_x, ue_y);
  if (!latlng) return; // worldBounds not yet available

  const dossier   = isDossierNote(name);
  const fillColor = dossier ? "#66ccff" : "#ffd54a";
  const size      = 26;

  const icon = L.divIcon({
    className: "poi-note-selected-icon",
    html: `<svg width="${size}" height="${size}" viewBox="-13 -13 26 26" aria-hidden="true">
      <circle r="11" fill="${fillColor}" stroke="#111" stroke-width="2.5"/>
      <circle r="4"  fill="#111" opacity="0.4"/>
    </svg>`,
    iconSize:   [size, size],
    iconAnchor: [size/2, size/2]
  });

  L.marker(latlng, { icon, pane: "poiPane" })
    .addTo(mapObj.poiLayer)
    .bindTooltip(noteTooltipHtml(note), {
      direction: "auto", sticky: true, offset: [0, -14],
      opacity: 0.97, className: "note-tooltip", autoPan: true
    });
}
