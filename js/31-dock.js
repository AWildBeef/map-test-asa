/* Split from app_embed.js lines 1456-1768 */

/* ============================================================
   DOCK / TOOLBAR
============================================================ */

function isPanelVisible(id){
  const el = document.getElementById(id);
  if (!el) return false;
  return el.style.display !== "none";
}

function setPanelVisible(id, show){
  const el = document.getElementById(id);
  if (!el) return;

  el.style.display = show ? "" : "none";
  el.dataset.hidden = show ? "0" : "1";
}

function togglePanel(id){
  setPanelVisible(id, !isPanelVisible(id));
  updateDockToggles();
}

function updateDockToggles(){
  const dockEl = document.querySelector(".map-dock");
  if (!dockEl) return;

  dockEl.querySelectorAll("[data-toggle-panel]").forEach(btn => {
    const id = btn.getAttribute("data-toggle-panel");
    const on = isPanelVisible(id);
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function setLegendOpen(open){
  showRarityLegend = !!open;

  const el = document.getElementById("rarityLegend");
  if (!el) return;

  el.style.display = showRarityLegend ? "" : "none";
}

function setMapBackgroundFromDock(btn){
  const mapMeta = dockState.mapMeta;
  if (!mapMeta?.backgrounds?.length || !mapObj?.overlay) return;

  const bgs = mapMeta.backgrounds;
  const cur = btn.dataset.bgIndex ? Number(btn.dataset.bgIndex) : 0;
  const next = (cur + 1) % bgs.length;

  btn.dataset.bgIndex = String(next);
  mapObj.overlay.setUrl(bgs[next].url);
  btn.title = `Background: ${bgs[next].label || bgs[next].id || (next + 1)} (tap to cycle)`;
}

function ensureDockControl(map){
  if (dockControl) return;

  const Dock = L.Control.extend({
    options: { position: "bottomleft" },

    onAdd() {
      const container = L.DomUtil.create("div", "leaflet-control leaflet-bar map-dock");
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      return container;
    }
  });

  dockControl = new Dock();
  map.addControl(dockControl);
}

function renderDock(){
  const container = document.querySelector(".map-dock");
  if (!container) return;

  const mapMeta = dockState.mapMeta;
  const cfg = dockState.cfg || {};
  const isAstraeos = !!(mapMeta?.backgrounds?.length);

  container.innerHTML = "";
  container.style.display = "flex";
  container.style.overflow = "hidden";

  const mkBtn = ({ title, icon, onClick, togglePanelId = null, extraClass = "" }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `dock-btn ${extraClass}`.trim();
    btn.title = title;
    btn.setAttribute("aria-label", title);

    if (togglePanelId) {
      btn.setAttribute("data-toggle-panel", togglePanelId);
      btn.setAttribute("aria-pressed", "false");
    }

    btn.innerHTML = icon;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick?.(btn);
      if (document.activeElement?.blur) document.activeElement.blur();
    });

    container.appendChild(btn);
    return btn;
  };

  // Astraeos background swap
  if (isAstraeos) {
    const bgs = mapMeta.backgrounds;
    const def = bgs.find(x => x.id === mapMeta.defaultBg) || bgs[0];
    const idx = Math.max(0, bgs.indexOf(def));

    if (mapObj?.overlay) {
      mapObj.overlay.setUrl(bgs[idx].url);
    }

    const bgBtn = mkBtn({
      title: `Background: ${def.label || def.id || (idx + 1)} (tap to cycle)`,
      icon: `
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M12 3 2 8l10 5 10-5-10-5Zm0 7L2 15l10 5 10-5-10-5Z"
                fill="none" stroke="currentColor" stroke-width="2"
                stroke-linejoin="round"/>
        </svg>
      `,
      onClick: (btn) => setMapBackgroundFromDock(btn)
    });

    bgBtn.dataset.bgIndex = String(idx);
  } else {
    if (cfg?.image && mapObj?.overlay) {
      mapObj.overlay.setUrl(cfg.image);
    }
  }

  // Dino info panel toggle
  mkBtn({
    title: "Toggle Dino Info",
    icon: `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M4 6h16v12H4z" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M7 9h10M7 12h10M7 15h6" stroke="currentColor" stroke-width="2"/>
      </svg>
    `,
    togglePanelId: "dinoInfoPanel",
    onClick: () => togglePanel("dinoInfoPanel")
  });
  mkBtn({
    title: "Toggle Draw Style",
    icon: `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M7 21c2.5 0 4-1.5 4-4 0-1.1-.9-2-2-2H7.5C6.1 15 5 16.1 5 17.5V18c0 1.7.3 3 2 3Z"
              fill="currentColor" opacity=".9"/>
        <path d="M20.7 4.3a1 1 0 0 0-1.4 0l-9.7 9.7c.8.3 1.4 1 1.7 1.8l9.4-9.5a1 1 0 0 0 0-1.4Z"
              fill="currentColor"/>
      </svg>
    `,
    togglePanelId: "drawStylePanel",
    onClick: () => toggleDrawStylePanel()
  });

  // POI toggle
  mkBtn({
    title: "Toggle markers menu",
    icon: `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z"
              fill="none" stroke="currentColor" stroke-width="2"/>
        <circle cx="12" cy="10" r="2.5" fill="currentColor"/>
      </svg>
    `,
    togglePanelId: "poiPanel",
    onClick: () => togglePoiPanel()
  });

  // Rarity legend toggle
  mkBtn({
    title: showRarityLegend ? "Hide rarity legend" : "Show rarity legend",
    icon: `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M12 10v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <circle cx="12" cy="7.5" r="1.2" fill="currentColor"/>
      </svg>
    `,
    onClick: (btn) => {
      setLegendOpen(!showRarityLegend);
      btn.title = showRarityLegend ? "Hide rarity legend" : "Show rarity legend";
      btn.classList.toggle("is-on", showRarityLegend);
    },
    extraClass: showRarityLegend ? "is-on" : ""
  });
  mkBtn({
    title: "Toggle map entries browser",
    icon: `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M5 6h14M5 12h14M5 18h14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"/>
      </svg>
    `,
    togglePanelId: "mapEntriesPanel",
    onClick: () => toggleMapEntriesPanel()
  });

  updateDockToggles();
}

function ensurePoiPanel(){
  let panel = document.getElementById("poiPanel");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = "poiPanel";
  panel.className = "floating-panel floating-panel--small";

  panel.innerHTML = `
    <div class="fp-header">
      <div class="fp-title">Markers</div>
      <div class="fp-actions"></div>
    </div>
    <div class="fp-body"></div>
  `;
  
  const actions = panel.querySelector(".fp-actions");

  const hideBtn = createIconButton(CLOSE_ICON);
  hideBtn.dataset.action = "hide";
  hideBtn.title = "Hide";

  actions.appendChild(hideBtn);

  const mapWrap = document.getElementById("mapWrap") || document.body;
  mapWrap.appendChild(panel);

  panel.style.position = "absolute";
  panel.style.left = "2px";
  panel.style.bottom = "90px";
  panel.style.zIndex = "800";
  panel.style.display = "none";
  panel.dataset.hidden = "1";

  panel.querySelector('[data-action="hide"]').onclick = () => {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
    updateDockToggles();
  };

  return panel;
}

function renderPoiPanel(){
  const panel = ensurePoiPanel();
  const body = panel.querySelector(".fp-body");
  if (!body) return;

  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);
  const pois = geom?.pois || {};

  const rows = [
    { key: "tributeTerminals", label: "Tribute Terminals", count: (pois.tributeTerminals || []).length },
    { key: "supplyCrates", label: "Supply Crates", count: (pois.supplyCrates || []).length },
    { key: "playerStarts", label: "Player Start Points", count: poiCount(pois.playerStarts) },
    { key: "explorerNotes", label: "Explorer Notes", count: (pois.explorerNotes || []).length },
    { key: "missions", label: "Missions", count: (pois.missions || []).length },
    { key: "hordeEvents", label: "Horde Events", count: (pois.hordeEvents || []).length },
    { key: "cityTerminals", label: "City Terminals", count: (pois.cityTerminals || []).length },
    { key: "beacons", label: "Border Beacons", count: (pois.beacons || []).length }
  ].filter(r => r.count > 0);

  body.innerHTML = rows.length ? rows.map(r => `
    <label class="fp-row">
      <input type="checkbox" data-poi-toggle="${escapeAttr(r.key)}" ${poiVisibility[r.key] ? "checked" : ""}>
      <span>${escapeHtml(r.label)} (${r.count})</span>
    </label>
  `).join("") : `
    <div style="color:var(--muted)">No markers on this map.</div>
  `;

  body.querySelectorAll("[data-poi-toggle]").forEach(chk => {
    chk.onchange = () => {
      const key = chk.dataset.poiToggle;
      poiVisibility[key] = chk.checked;
      drawPois();
    };
  });
}

function togglePoiPanel(){
  const panel = ensurePoiPanel();

  const show = panel.style.display === "none";

  if (show){
    renderPoiPanel();
    panel.style.display = "";
    panel.dataset.hidden = "0";
  } else {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
  }

  updateDockToggles();
}
