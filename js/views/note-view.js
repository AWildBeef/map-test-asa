/* ============================================================
   NOTE VIEW  (v5.12 rev2)
   Explorer Notes & Dino Dossiers integrated into top dropdown.

   Note format: [index, name, UE_X, UE_Y, UE_Z]
   Commands:
     cheat SPI <X> <Y> <Z+200>
     cheat GiveExplorerNote <index>
============================================================ */

function getNotesForCurrentMap() {
  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);
  return Array.isArray(geom?.pois?.explorerNotes) ? geom.pois.explorerNotes : [];
}

function getNoteOptionsForCurrentMap() {
  const notes = getNotesForCurrentMap();
  const q = String(noteViewState.query || "").trim().toLowerCase();
  const tab = noteViewState.noteTab || "all";

  return notes.filter(note => {
    if (!Array.isArray(note) || note.length < 2) return false;
    const [idx, name] = note;
    const dossier = isDossierNote(name);
    if (tab === "notes"    &&  dossier) return false;
    if (tab === "dossiers" && !dossier) return false;
    if (!q) return true;
    // Search by name OR index simultaneously - numeric query also matches index
    return name.toLowerCase().includes(q) || String(idx).includes(q);
  });
}

function noteFromSelection(selection) {
  if (!selection || !selection.startsWith("note:")) return null;
  const idx = Number(selection.slice(5));
  if (!Number.isInteger(idx)) return null;
  return getNotesForCurrentMap().find(n => n[0] === idx) || null;
}

/* ── Commands ─────────────────────────────────────── */

function noteTeleportCommand(note) {
  const [idx, name, ue_x, ue_y, ue_z] = note;
  return `cheat SPI ${Math.round(ue_x)} ${Math.round(ue_y)} ${Math.round((ue_z || 0) + 200)}`;
}

function noteUnlockCommand(note) {
  const [idx] = note;
  return `cheat GiveExplorerNote ${idx}`;
}

/* ── Info panel ───────────────────────────────────── */

function renderNotePanel(note) {
  if (!note || !Array.isArray(note)) { renderInfoPanelBodyEmpty(); return; }
  const [idx, name, ue_x, ue_y, ue_z] = note;
  const dossier = isDossierNote(name);
  const gps     = ueToGps(ue_x, ue_y);
  const gpsStr  = gps ? `${gps.lat.toFixed(1)}, ${gps.lon.toFixed(1)}` : "N/A";
  const teleportCmd = noteTeleportCommand(note);
  const unlockCmd   = noteUnlockCommand(note);

  setInfoPanelTitle(name);
  setInfoPanelHTML(`
    <div class="info-section">
      <div class="lc-chips">
        <span class="lc-chip">${dossier ? "Dino Dossier" : "Explorer Note"}</span>
        <span class="lc-chip">Index <b>${escapeHtml(String(idx))}</b></span>
        <span class="lc-chip">GPS <b>${escapeHtml(gpsStr)}</b></span>
      </div>
    </div>
    <div class="info-section">
      <div class="iv-eyebrow">Commands</div>
      <div class="iv-cmd-lines">
        <div class="iv-cmd-line copy-on-click" data-copy="${escapeAttr(teleportCmd)}">
          <span class="iv-cmd-tag">TP</span>
          <span class="iv-cmd-text">${escapeHtml(teleportCmd)}</span>
        </div>
        <div class="iv-cmd-line copy-on-click" data-copy="${escapeAttr(unlockCmd)}">
          <span class="iv-cmd-tag">${dossier ? "DOSSIER" : "NOTE"}</span>
          <span class="iv-cmd-text">${escapeHtml(unlockCmd)}</span>
        </div>
      </div>
      <div class="iv-cmd-hint">tap a command to copy</div>
    </div>
    <div class="info-section">
      <div class="iv-eyebrow">UE Coordinates</div>
      <div class="lc-chips">
        <span class="lc-chip">X <b>${escapeHtml(String(Math.round(ue_x)))}</b></span>
        <span class="lc-chip">Y <b>${escapeHtml(String(Math.round(ue_y)))}</b></span>
        <span class="lc-chip">Z <b>${escapeHtml(String(Math.round(ue_z || 0)))}</b></span>
      </div>
    </div>
  `);
}

/* ── Note dropdown toolbar ────────────────────────── */

function buildNoteDropdownToolbar({ rebuild } = {}) {
  const bar = document.createElement("div");
  bar.className = "dd-source-toolbar";
  bar.style.cssText = "display:flex; flex-wrap:wrap; gap:4px;";

  const allNotes = getNotesForCurrentMap();
  const nNotes   = allNotes.filter(n => !isDossierNote(n[1])).length;
  const nDoss    = allNotes.filter(n =>  isDossierNote(n[1])).length;
  const tab      = noteViewState.noteTab || "all";

  // Tab pills
  const pillRow = document.createElement("div");
  pillRow.style.cssText = "display:flex; gap:4px; flex-wrap:wrap; width:100%;";
  [
    { id: "all",      label: `All (${allNotes.length})` },
    { id: "notes",    label: `Notes (${nNotes})` },
    { id: "dossiers", label: `Dossiers (${nDoss})` }
  ].forEach(t => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "dd-source-mode-btn" + (tab === t.id ? " is-on" : "");
    pill.textContent = t.label;
    pill.onclick = () => {
      noteViewState.noteTab = t.id;
      noteViewState.query = "";
      rebuildSelectionSelect();
      // Re-open dropdown
      setTimeout(() => UI.dinoFancy?.querySelector(".dd-btn")?.click(), 0);
    };
    pillRow.appendChild(pill);
  });
  bar.appendChild(pillRow);

  return bar;
}

/* ── Map drawing ──────────────────────────────────── */

function _makeNoteIcon(dossier) {
  const size = 16;
  return dossier
    ? L.divIcon({
        className: "poi-dossier-icon",
        html: `<svg width="${size}" height="${size}" viewBox="-8 -8 16 16" aria-hidden="true">
          <rect x="-6" y="-7" width="12" height="14" rx="1.5" fill="#66ccff" stroke="#111" stroke-width="1.5"/>
          <path d="M -3 -3 Q 0 -6 3 -3 L 3 4 L -3 4 Z" fill="#111" opacity="0.3"/>
          <line x1="-3" y1="0" x2="3" y2="0" stroke="#111" stroke-width="1.2"/>
          <line x1="-3" y1="3" x2="1" y2="3" stroke="#111" stroke-width="1.2"/>
        </svg>`,
        iconSize: [size, size], iconAnchor: [size / 2, size / 2]
      })
    : L.divIcon({
        className: "poi-note-icon",
        html: `<svg width="${size}" height="${size}" viewBox="-8 -8 16 16" aria-hidden="true">
          <rect x="-6" y="-7" width="12" height="14" rx="1.5" fill="#ffd54a" stroke="#111" stroke-width="1.5"/>
          <line x1="-3" y1="-3" x2="3" y2="-3" stroke="#111" stroke-width="1.2"/>
          <line x1="-3" y1="0" x2="3" y2="0" stroke="#111" stroke-width="1.2"/>
          <line x1="-3" y1="3" x2="1" y2="3" stroke="#111" stroke-width="1.2"/>
        </svg>`,
        iconSize: [size, size], iconAnchor: [size / 2, size / 2]
      });
}

function drawNote(note) {
  clearDraw();
  clearPois();
  if (!note || !mapObj?.poiLayer) return;
  const [idx, name, ue_x, ue_y] = note;
  const latlng = ueToLeaflet(ue_x, ue_y);
  if (!latlng) return;
  L.marker(latlng, { icon: _makeNoteIcon(isDossierNote(name)), pane: "poiPane" })
    .addTo(mapObj.poiLayer)
    .bindTooltip(noteTooltipHtml(note, { hideJump: true }), {
      direction: "auto", sticky: true, offset: [0, -10],
      opacity: 0.97, className: "note-tooltip", autoPan: true
    });
}

// Switch to Note View and select this note (called when clicking a POI note marker)
function openNoteView(note) {
  if (!note || !Array.isArray(note)) return;
  const [idx] = note;
  noteViewState.selected = note;
  noteViewState.noteTab  = isDossierNote(note[1]) ? "dossiers" : "notes";
  noteViewState.query    = "";
  State.mode = "note";
  State.selection = `note:${idx}`;
  State.selections.note = `note:${idx}`;
  syncModeButton();
  syncModeClass();
  rebuildSelectionSelect();
  applyEmbedRestrictions();
  renderNotePanel(note);
  drawNote(note);
}

/* ── Stubs for old floating panel references ──────── */
function ensureNoteViewPanel() {
  return document.getElementById("noteViewPanel") || document.createElement("div");
}
function renderNoteViewPanel() {}
function toggleNoteViewPanel() {}
