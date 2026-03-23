

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


function ensureInfoPanel(){
  let panel = document.getElementById("dinoInfoPanel");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = "dinoInfoPanel";
  panel.className = "floating-panel";

  panel.innerHTML = `
    <div class="fp-header">
      <div class="fp-title">Info</div>
      <div class="fp-actions"></div>
    </div>
    <div class="fp-body"></div>
  `;
  
  const actions = panel.querySelector(".fp-actions");

  const minBtn = createIconButton(CHEVRON_DOWN_ICON);
  minBtn.dataset.action = "min";
  minBtn.title = "Collapse";
  minBtn.classList.add("fp-btn-chevron");

  const hideBtn = createIconButton(CLOSE_ICON);
  hideBtn.dataset.action = "hide";
  hideBtn.title = "Hide";

  actions.appendChild(minBtn);
  actions.appendChild(hideBtn);

  const mapWrap = document.getElementById("mapWrap") || document.body;
  mapWrap.appendChild(panel);

  installPanelTitleFitter(panel, {
    minPx: 11,
    maxPx: 20
  });
  
  panel.style.display = "";
  panel.dataset.hidden = "0";

  const body = panel.querySelector(".fp-body");

  // start collapsed
  body.style.display = "none";
  panel.classList.add("collapsed");

  panel.querySelector('[data-action="min"]').onclick = () => {
    const closed = body.style.display === "none";
    body.style.display = closed ? "" : "none";
    panel.classList.toggle("collapsed", !closed);

    if (closed) {
      refreshInfoPanelPageHeight();
    }
  };

  panel.querySelector('[data-action="hide"]').onclick = () => {
    panel.style.display = "none";
  };

  panel.style.position = "absolute";
  panel.style.left = "2px";
  panel.style.top = "2px";
  panel.style.zIndex = "800";

  return panel;
}


function setInfoPanelTitle(text){
  const panel = ensureInfoPanel();
  const t = panel.querySelector(".fp-title");
  if (t) t.textContent = text || "Info";
}


function setInfoPanelHTML(html){
  const panel = ensureInfoPanel();
  const body = panel.querySelector(".fp-body");
  if (!body) return;
  body.innerHTML = html || `<div style="color:var(--muted)">No data.</div>`;
  panel.style.display = "";
  syncInfoPanelState();
}


function renderInfoPanelBodyEmpty(){
  setInfoPanelTitle("Info");
  setInfoPanelHTML(`<div style="color:var(--muted)">Select something to see details.</div>`);
}


function renderTabs({ tabs, activeId, dataAttr }){
  return `
    <div class="fp-tabs">
      ${tabs.map(t => `
        <button type="button"
                class="fp-tab ${activeId === t.id ? "is-on" : ""}"
                ${dataAttr}="${escapeAttr(t.id)}">
          ${escapeHtml(t.label)}
        </button>
      `).join("")}
    </div>
  `;
}


function wireTabs(container, { tabs, activeId, dataAttr, onChange }){
  container.querySelectorAll(`[${dataAttr}]`).forEach(btn => {
    btn.onclick = () => {
      const id = btn.getAttribute(dataAttr);
      if (!tabs.some(t => t.id === id)) return;
      onChange(id);
    };
  });
}


function mountPanelSwipe(container, tabs, getActive, setActive){
  if (!container) return;

  const order = tabs.map(t => t.id);

  let sx = 0;
  let sy = 0;
  let tracking = false;
  let decided = false;
  let isHorizontal = false;

  const EDGE_GUARD_PX = 22;
  const SWIPE_MIN_PX = 40;
  const SWIPE_MAX_Y = 60;

  container.addEventListener("touchstart", (e) => {
    if (!e.touches || e.touches.length !== 1) return;

    const t = e.touches[0];
    if (t.clientX <= EDGE_GUARD_PX){
      tracking = false;
      return;
    }

    tracking = true;
    decided = false;
    isHorizontal = false;
    sx = t.clientX;
    sy = t.clientY;
  }, { passive: true });

  container.addEventListener("touchmove", (e) => {
    if (!tracking || !e.touches || e.touches.length !== 1) return;

    const t = e.touches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;

    if (!decided){
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10){
        decided = true;
        isHorizontal = Math.abs(dx) > Math.abs(dy);
      }
    }

    if (decided && isHorizontal){
      e.preventDefault();
    }
  }, { passive: false });

  container.addEventListener("touchend", (e) => {
    if (!tracking) return;
    tracking = false;

    const t = e.changedTouches?.[0];
    if (!t) return;

    const dx = t.clientX - sx;
    const dy = t.clientY - sy;

    if (Math.abs(dy) > SWIPE_MAX_Y) return;
    if (Math.abs(dx) < SWIPE_MIN_PX) return;

    const active = getActive();
    const i = Math.max(0, order.indexOf(active));

    const nextIndex = (dx < 0)
      ? Math.min(order.length - 1, i + 1)
      : Math.max(0, i - 1);

    if (nextIndex !== i){
      setActive(order[nextIndex]);
    }
  }, { passive: true });
}


function renderInfoPanel() {
  console.log("MODE:", State.mode);
  console.log("SELECTION:", State.selection);
  syncInfoPanelState();
  if (!State.selection) {
    renderInfoPanelBodyEmpty();
    return;
  }
  
  if (State.mode === "dino") {
    renderDinoPanel(State.selection);
    
  } else if (State.mode === "entry") {
    renderEntryPanel(State.selection);
    
  } else if (State.mode === "crate") {
    renderCratePanel(State.selection);
    
  } else if (State.mode === "item") {
    renderItemPanel(State.selection);
  }
}

function ensureDrawStylePanel(){
  let panel = document.getElementById("drawStylePanel");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = "drawStylePanel";
  panel.className = "floating-panel floating-panel--small";

  panel.innerHTML = `
    <div class="fp-header">
      <div class="fp-title">Draw Style</div>
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
  panel.style.right = "2px";
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


function renderDrawStylePanel(){
  const panel = ensureDrawStylePanel();
  const body = panel.querySelector(".fp-body");
  if (!body) return;

  body.innerHTML = `
    <label class="fp-row">
      <input id="drawUseRarity" type="checkbox" ${drawStyle.useRarity ? "checked" : ""}>
      <span>Use rarity colors</span>
    </label>

    <label class="fp-row">
      <span>Color</span>
      <input id="drawColor" type="color" value="${drawStyle.color}">
    </label>

    <label class="fp-row fp-col">
      <div class="fp-row fp-between">
        <span>Opacity</span>
        <span id="drawOpacityLabel">${drawStyle.opacity.toFixed(2)}</span>
      </div>
      <input
        id="drawOpacity"
        type="range"
        min="0.05"
        max="1"
        step="0.05"
        value="${drawStyle.opacity}"
      >
    </label>
  `;

  const rarity = body.querySelector("#drawUseRarity");
  const color = body.querySelector("#drawColor");
  const opacity = body.querySelector("#drawOpacity");
  const opacityLabel = body.querySelector("#drawOpacityLabel");

  if (rarity){
    rarity.onchange = () => {
      drawStyle.useRarity = rarity.checked;
      renderDrawStylePanel();
      render();
    };
  }

  if (color){
    color.disabled = drawStyle.useRarity;
    color.style.opacity = drawStyle.useRarity ? "0.5" : "1";

    color.oninput = () => {
      drawStyle.color = color.value;
      render();
    };
  }

  if (opacity){
    opacity.oninput = () => {
      drawStyle.opacity = Number(opacity.value);
      if (opacityLabel) opacityLabel.textContent = drawStyle.opacity.toFixed(2);
      render();
    };
  }
}


function toggleDrawStylePanel(){
  const panel = ensureDrawStylePanel();
  const show = panel.style.display === "none";

  if (show){
    renderDrawStylePanel();
    panel.style.display = "";
    panel.dataset.hidden = "0";
  } else {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
  }

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


async function copyText(text){
  try{
    await navigator.clipboard.writeText(text);
  }catch{
    const ta = document.createElement("textarea");
    ta.value = String(text || "");
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}


function installCopyDelegation(){
  document.addEventListener("click", async (e) => {
    const el = e.target.closest(".copy-on-click");
    if (!el) return;

    const text = el.dataset.copy ?? el.textContent ?? "";
    await copyText(String(text).trim());
    showCopiedBubble(el);
  });
}


function showCopiedBubble(target){
  const bubble = document.createElement("div");
  bubble.className = "copy-bubble";
  bubble.textContent = "Copied!";

  document.body.appendChild(bubble);

  const r = target.getBoundingClientRect();
  bubble.style.left = `${r.right + 6}px`;
  bubble.style.top = `${r.top + r.height / 2 - 10}px`;

  requestAnimationFrame(() => {
    bubble.classList.add("show");
  });

  setTimeout(() => {
    bubble.classList.remove("show");
    setTimeout(() => bubble.remove(), 200);
  }, 900);
}


function createIconButton(svgPath, viewBox = "0 0 24 24"){
  const btn = document.createElement("button");
  btn.className = "fp-btn";
  btn.type = "button";

  btn.innerHTML = `
    <svg viewBox="${viewBox}" width="16" height="16" aria-hidden="true">
      ${svgPath}
    </svg>
  `;

  return btn;
}


function syncActivePageHeight(pagesEl, activeId, opts = {}) {
  if (!pagesEl || !activeId) return;

  const {
    maxHeight = Math.floor(window.innerHeight * 0.42)
  } = opts;

  const activePage = pagesEl.querySelector(`.fp-page[data-page="${CSS.escape(activeId)}"]`);
  if (!activePage) return;

  // clear old scrolling first
  pagesEl.querySelectorAll(".fp-page").forEach(p => {
    p.style.overflowY = "";
    p.style.maxHeight = "";
  });

  // temporarily let wrapper size naturally so measurement is real
  pagesEl.style.height = "auto";

  const naturalHeight = activePage.scrollHeight;
  const finalHeight = Number.isFinite(maxHeight)
    ? Math.min(naturalHeight, maxHeight)
    : naturalHeight;

  pagesEl.style.height = `${finalHeight}px`;

  if (naturalHeight > finalHeight) {
    activePage.style.overflowY = "auto";
    activePage.style.maxHeight = `${finalHeight}px`;
    activePage.style.webkitOverflowScrolling = "touch";
  }
}


function refreshInfoPanelPageHeight() {
  const panel = document.getElementById("dinoInfoPanel");
  if (!panel || panel.classList.contains("collapsed")) return;

  const body = panel.querySelector(".fp-body");
  const pagesEl = body?.querySelector(".fp-pages");
  if (!pagesEl) return;

  let activeId = "";
  if (State.mode === "dino") activeId = infoPanelState.dinoTab;
  else if (State.mode === "entry") activeId = infoPanelState.entryTab;
  else if (State.mode === "crate") activeId = infoPanelState.crateTab;
  else if (State.mode === "item") activeId = infoPanelState.itemTab;

  requestAnimationFrame(() => {
    syncActivePageHeight(pagesEl, activeId);
  });
}


function fmt(v){
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  let s = n.toFixed(6);
  s = s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  if (s === "-0") s = "0";
  return s;
}


function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[c]));
}

function escapeAttr(s){
  return escapeHtml(s).replace(/"/g, "&quot;");
}


function renderCopyField(label, value){
  const v = String(value || "");
  return `
    <div class="info-subtitle">${escapeHtml(label)}</div>
    <div class="info-mono copy-on-click" data-copy="${escapeAttr(v)}">
      ${escapeHtml(v || "(none)")}
    </div>
  `;
}


function renderSection(title, innerHtml){
  return `
    <div class="info-section">
      <div class="info-subtitle">${escapeHtml(title)}</div>
      ${innerHtml || ""}
    </div>
  `;
}


function renderPages({ tabs, activeId, renderPage, pageClass = "" }){
  const idx = Math.max(0, tabs.findIndex(t => t.id === activeId));
  return `
    <div class="fp-pages ${pageClass}">
      <div class="fp-track" style="transform:translateX(${-idx * 100}%);">
        ${tabs.map(t => `
          <div class="fp-page" data-page="${escapeAttr(t.id)}">
            ${renderPage(t.id)}
          </div>
        `).join("")}
      </div>
    </div>
  `;
}


function isTrue01(v){
  return v === 1 || v === "1" || v === true;
}


function fmtNum(v, decimals = 0){
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return decimals > 0 ? n.toFixed(decimals) : String(Math.round(n));
}

let infoPanelState = {
  dinoTab: "spawns",
  entryTab: "dinos",
  crateTab: "sets",
  itemTab: "crates"
};


const CLOSE_ICON = `
  <path d="M6 6L18 18M18 6L6 18"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"/>
`;




const CHEVRON_DOWN_ICON = `
  <path d="M6 9l6 6 6-6"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"/>
`;

function addSupplyCrateMarkers(points, { layer = mapObj.poiLayer } = {}) {
  if (!layer || !Array.isArray(points)) return;

  const legend = supplyLegendForCurrentMap();

  for (const p of points) {
    const x = Number(p?.x);
    const y = Number(p?.y);
    if (![x, y].every(Number.isFinite)) continue;

    L.circleMarker([y, x], {
      radius: 6,
      color: "#111",
      weight: 2.2,
      fillColor: "#ffd54a",
      fillOpacity: 0.95,
      pane: "poiPane",
      className:"poi-supply"
    })
      .addTo(mapObj.poiLayer)
      .bindTooltip(supplyCrateTooltipHtml(p, legend), {
        direction: "auto",
        sticky: true,
        offset: [0, -14],
        opacity: 0.97,
        className: "supply-tooltip",
        autoPan: true
      });
  }
}
