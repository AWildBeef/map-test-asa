/* ============================================================
   BOSS VIEW
   The 6th view. A boss is selected from the dropdown; its summon
   location(s) are marked on the map, and the floating panel shows
   the summon recipe, level/restriction requirements, the boss
   creatures, and the engrams/items unlocked on the boss's death.
============================================================ */

// ── Marker icon for a boss summon location ──────────────────────
// A diamond (echoing the terminal icon) in a distinct boss colour.
function makeBossIcon(){
  const size = 46;
  return L.divIcon({
    className: "poi-icon poi-boss-marker",
    html: `
      <svg width="${size}" height="${size}" viewBox="-10 -12 20 26">
        <path d="M -3.4 0 L 0 -9 L 3.4 0 L 0 6 Z"
              fill="#1a1020"
              stroke="#ffd24a"
              stroke-width="0.8"
              opacity="0.97"/>
        <path d="M -2 0 L 0 -6 L 2 0 L 0 3.5 Z"
              fill="#ff5d5d"
              opacity="0.95"/>
      </svg>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size * 0.58333]
  });
}

// ── Draw the selected boss's summon location markers ────────────
function drawBoss(bossName){
  clearDraw();
  clearPois();

  const boss = getBossByName(bossName);
  if (!boss || !mapObj?.poiLayer) return;

  const seen = new Set();
  for (const loc of (boss.locations || [])){
    const x = Number(loc.x), y = Number(loc.y);
    if (![x, y].every(Number.isFinite)) continue;

    // De-dupe markers that share a coordinate (e.g. multiple tiers at one
    // obelisk would otherwise stack identical pins).
    const key = `${Math.round(x)}:${Math.round(y)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    L.marker([y, x], { icon: makeBossIcon(), pane: "poiPane" })
      .addTo(mapObj.poiLayer)
      .bindTooltip(bossLocationTooltipHtml(boss, loc), {
        direction: "auto",
        sticky: true,
        offset: [0, -14],
        opacity: 0.97,
        className: "dark-tooltip term-tooltip",
        autoPan: true
      });
  }
}

function bossLocationTooltipHtml(boss, loc){
  const where = escapeHtml(loc.label || (loc.direct ? "Arena" : "Terminal"));
  let html = `<div class="term-tip"><div class="term-tip-title">${escapeHtml(boss.name)}</div>`;
  html += `<div class="term-tip-section"><span class="term-tip-head">Location:</span> ${where}</div>`;
  if (boss.craftLevel != null){
    html += `<div class="term-tip-section"><span class="term-tip-head">Craft Lvl:</span> ${escapeHtml(String(boss.craftLevel))}</div>`;
  }
  html += `</div>`;
  return html;
}

// ── Floating panel ──────────────────────────────────────────────
function renderBossPanel(bossName){
  const boss = getBossByName(bossName);
  if (!boss){
    renderInfoPanelBodyEmpty();
    return;
  }

  // The dropdown selection IS the display name; use it as the panel title.
  setInfoPanelTitle(bossName);

  const tabs = [
    { id: "summon",  label: "Summon" },
    { id: "rewards", label: `Unlocks (${bossUnlockCount(boss)})` }
  ];
  const activeTab = tabs.some(t => t.id === infoPanelState.bossTab)
    ? infoPanelState.bossTab
    : "summon";

  const body = activeTab === "rewards"
    ? renderBossRewardsTab(boss)
    : renderBossSummonTab(boss);

  const html = `
    ${renderTabs({ tabs, activeId: activeTab, dataAttr: "data-boss-tab" })}
    ${body}
  `;

  setInfoPanelHTML(html);

  const panel = ensureInfoPanel();
  wireTabs(panel, {
    tabs, activeId: activeTab, dataAttr: "data-boss-tab",
    onChange: (id) => { infoPanelState.bossTab = id; renderBossPanel(bossName); }
  });
}

function bossUnlockCount(boss){
  const ids = new Set();
  for (const d of (boss.dinos || [])){
    for (const u of (d.de || [])) ids.add(u.id);
  }
  return ids.size;
}

// Local meta-cell renderer (kept self-contained so Boss View has no cross-view
// load-order dependency on item-view.js).
function bossMetaCell(label, value){
  if (value == null || value === "") return "";
  return `
    <div class="meta-cell">
      <div class="meta-stack">
        <div class="meta-label">${escapeHtml(label)}</div>
        <div class="meta-value">${escapeHtml(value)}</div>
      </div>
    </div>
  `;
}

// Summon tab: recipe + where-summoned + requirements.
function renderBossSummonTab(boss){
  const summon = boss.summon;

  // Terminals / arena this boss is summoned at (shown here rather than the
  // hero, since the markers already pinpoint them on the map).
  const locs = (boss.locations || [])
    .map(l => l.label)
    .filter((v, i, a) => v && a.indexOf(v) === i);
  const locHtml = locs.length
    ? `<div class="info-section">
         <div class="info-subtitle">Summoned At</div>
         <div class="boss-loc-line">${locs.map(l => escapeHtml(l)).join(", ")}</div>
       </div>`
    : "";

  const recipeHtml = (summon && summon.recipe && summon.recipe.length)
    ? `
      <div class="info-section">
        <div class="info-subtitle">Summon Cost${summon.name ? ` — ${escapeHtml(summon.name)}` : ""}</div>
        <div class="boss-recipe boss-recipe--cols">
          ${summon.recipe.map(r => `
            <div class="boss-recipe-row">
              <span class="boss-recipe-qty">${escapeHtml(fmt(r.qty))}×</span>
              <span class="boss-recipe-name">${escapeHtml(r.name)}</span>
            </div>
          `).join("")}
        </div>
      </div>`
    : `<div class="info-section"><div class="info-subtitle">Summon Cost</div>
         <div class="boss-empty">No summon item — this boss is fought directly in the world.</div>
       </div>`;

  // Requirements grid (only cells that have a value).
  const reqCells = [
    bossMetaCell("Craft Level",    boss.craftLevel    != null ? String(boss.craftLevel)    : ""),
    bossMetaCell("Teleport Level", boss.teleportLevel != null ? String(boss.teleportLevel) : ""),
    bossMetaCell("Max Survivors",  boss.maxPlayers    != null ? String(boss.maxPlayers)    : ""),
    bossMetaCell("Max Creatures",  boss.maxDinos      != null ? String(boss.maxDinos)      : ""),
    bossMetaCell("Max Drag Wt",    boss.maxDragWeight != null ? fmt(boss.maxDragWeight)    : ""),
  ].filter(Boolean).join("");

  const reqHtml = reqCells
    ? `<div class="info-section">
         <div class="info-subtitle">Requirements & Restrictions</div>
         <div class="meta-grid">${reqCells}</div>
       </div>`
    : "";

  return recipeHtml + locHtml + reqHtml;
}

// Rewards tab: engrams/items unlocked on death, grouped by boss creature.
function renderBossRewardsTab(boss){
  const blocks = [];
  for (const d of (boss.dinos || [])){
    if (!d.de || !d.de.length) continue;
    blocks.push(`
      <div class="info-section">
        <div class="info-subtitle">${escapeHtml(d.name)} — unlocks (${d.de.length})</div>
        <div class="boss-unlocks">
          ${d.de.map(u => `<span class="boss-unlock-chip">${escapeHtml(u.name)}</span>`).join("")}
        </div>
      </div>
    `);
  }
  if (!blocks.length){
    return `<div class="info-section"><div class="boss-empty">No engram or item unlocks recorded for this boss.</div></div>`;
  }
  return blocks.join("");
}
