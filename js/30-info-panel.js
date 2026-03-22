/* Split from app_embed.js lines 1084-1455 */

/* ============================================================
   INFO PANEL SYSTEM
============================================================ */

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

  const activeId = State.mode === "dino"
    ? infoPanelState.dinoTab
    : infoPanelState.entryTab;

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

let infoPanelState = {
  dinoTab: "spawns",
  entryTab: "dinos"
};

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
}

function renderInfoPanelBodyEmpty(){
  setInfoPanelTitle("Info");
  setInfoPanelHTML(`<div style="color:var(--muted)">Select something to see details.</div>`);
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

function wireTabs(container, { tabs, activeId, dataAttr, onChange }){
  container.querySelectorAll(`[${dataAttr}]`).forEach(btn => {
    btn.onclick = () => {
      const id = btn.getAttribute(dataAttr);
      if (!tabs.some(t => t.id === id)) return;
      onChange(id);
    };
  });
}

function labelsForDinoObj(d){
  const out = new Set();
  if (!d) return [];

  if (d.n) out.add(String(d.n));
  if (d.fn) out.add(String(d.fn));
  if (d.mn) out.add(String(d.mn));

  return [...out];
}

function cleanName(s){
  const x = String(s ?? "").trim();
  return x.length ? x : "";
}

function otherSexNameForSelected(d, selectedLabel){
  const f = cleanName(d?.fn);
  const m = cleanName(d?.mn);
  const sel = cleanName(selectedLabel);

  if (!sel) return "";
  if (f && sel.toLowerCase() === f.toLowerCase()) return m;
  if (m && sel.toLowerCase() === m.toLowerCase()) return f;

  if (f && m && f.toLowerCase() !== m.toLowerCase()) return `${f} / ${m}`;
  return "";
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
