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
    { id: "loot",    label: "Rewards" },
    { id: "rewards", label: `Unlocks (${bossUnlockCount(boss)})` }
  ];
  const activeTab = tabs.some(t => t.id === infoPanelState.bossTab)
    ? infoPanelState.bossTab
    : "summon";

  // Wrap tab content in the panel's .fp-pages structure so the shared height
  // logic (syncActivePageHeight) clamps it to the dock and adds scrolling —
  // the same mechanism the dino/crate/item panels use.
  const html = `
    ${renderTabs({ tabs, activeId: activeTab, dataAttr: "data-boss-tab" })}
    ${renderPages({
      tabs,
      activeId: activeTab,
      renderPage: (id) => {
        if (id === "loot")    return renderBossLootTab(boss);
        if (id === "rewards") return renderBossRewardsTab(boss);
        return renderBossSummonTab(boss);
      }
    })}
  `;

  setInfoPanelHTML(html);

  const panel = ensureInfoPanel();
  const body = panel.querySelector(".fp-body");

  wireTabs(body, {
    tabs, activeId: activeTab, dataAttr: "data-boss-tab",
    onChange: (id) => { infoPanelState.bossTab = id; renderBossPanel(bossName); }
  });

  // Clamp the active page height to the available space above the dock.
  refreshInfoPanelPageHeight();
  syncActivePageHeight(body.querySelector(".fp-pages"), activeTab);
}

function bossUnlockCount(boss){
  // If the boss has re (reward engrams), use that instead of per-dino de.
  const re = boss.raw?.re;
  if (Array.isArray(re) && re.length) return re.length;
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
// Format a min/max count as a quantity label: "178" or "120–550".
function bossQtyLabel(mn, mx){
  const lo = Number(mn), hi = Number(mx);
  if (!Number.isFinite(lo) && !Number.isFinite(hi)) return "";
  if (Number.isFinite(lo) && Number.isFinite(hi) && lo !== hi) return `${fmt(lo)}–${fmt(hi)}`;
  return fmt(Number.isFinite(hi) ? hi : lo);
}

// A single reward row: yellow quantity on the left, item name on the right —
// the same visual language as the Summon recipe rows.
function bossRewardRow(item, opts = {}){
  const qty = bossQtyLabel(item.mn, item.mx);
  const qtyHtml = qty ? `${escapeHtml(qty)}×` : "";
  const nameClass = "boss-reward-name" + (opts.highlight ? " is-element" : "");
  return `
    <div class="boss-reward-row">
      <span class="boss-reward-qty">${qtyHtml}</span>
      <span class="${nameClass}">${escapeHtml(item.name)}</span>
    </div>`;
}

// Rewards tab: loot you get from defeating the boss (distinct from engram
// unlocks). Element and trophies come from the boss bag (dd) and direct
// death-gives (dg); some world bosses also drop an arena loot crate (lc/li).
function renderBossLootTab(boss){
  const r = boss.rewards || { drops: [], given: [], rewardSet: [], crates: [], bonusItems: [] };
  const sections = [];

  // Boss loot (dd + rd) — Element, trophies, flags. The headline reward.
  if (r.drops.length){
    sections.push(`
      <div class="info-section">
        <div class="info-subtitle">Boss Loot</div>
        <div class="boss-reward-list">
          ${r.drops.map(it => bossRewardRow(it, { highlight: /element/i.test(it.name) })).join("")}
        </div>
      </div>`);
  }

  // Direct death-gives (dg) — flags, helmets, trophies added to inventory.
  if (r.given.length){
    sections.push(`
      <div class="info-section">
        <div class="info-subtitle">Awarded Directly</div>
        <div class="boss-reward-list">
          ${r.given.map(it => bossRewardRow(it)).join("")}
        </div>
      </div>`);
  }

  // Individual reward loot set (rls) — given to every player.
  if (r.rewardSet && r.rewardSet.length){
    sections.push(`
      <div class="info-section">
        <div class="info-subtitle">Player Reward</div>
        <div class="boss-reward-list">
          ${r.rewardSet.map(it => bossRewardRow(it, { highlight: /element/i.test(it.name) })).join("")}
        </div>
      </div>`);
  }

  // Arena loot crates (lc) + bonus item (li).
  if (r.crates.length || r.bonusItems.length){
    const crateLines = r.crates.map(c => `
      <div class="boss-reward-row">
        <span class="boss-reward-qty"></span>
        <span class="boss-reward-name">${escapeHtml(c.name)}</span>
      </div>`).join("");
    const bonusLines = r.bonusItems.map(it => `
      <div class="boss-reward-row">
        <span class="boss-reward-qty">+${bossQtyLabel(it.mn, it.mx)}×</span>
        <span class="boss-reward-name is-bonus">${escapeHtml(it.name)}</span>
      </div>`).join("");
    sections.push(`
      <div class="info-section">
        <div class="info-subtitle">Arena Loot Crate${r.crates.length > 1 ? "s" : ""}</div>
        <div class="boss-reward-list">${crateLines}${bonusLines}</div>
      </div>`);
  }

  if (!sections.length){
    return `<div class="info-section"><div class="boss-empty">No loot rewards recorded for this boss.</div></div>`;
  }
  return sections.join("");
}

// Unlocks tab: engrams/items unlocked on death, grouped by boss creature.
function renderBossRewardsTab(boss){
  // If the boss has re (reward engrams from the mission/event), use that
  // instead of per-dino de — same pattern as rd suppressing dg.
  const re = boss.raw?.re;
  if (Array.isArray(re) && re.length){
    const items = re.map(id => ({
      id,
      name: cleanBossText(itemDisplayNameById(id))
    }));
    return `
      <div class="info-section">
        <div class="info-subtitle">Unlocks (${items.length})</div>
        <div class="boss-reward-list">
          ${items.map(u => `
            <div class="boss-reward-row">
              <span class="boss-reward-qty"></span>
              <span class="boss-reward-name">${escapeHtml(u.name)}</span>
            </div>`).join("")}
        </div>
      </div>`;
  }

  // Fallback: per-dino de (death engrams).
  const blocks = [];
  for (const d of (boss.dinos || [])){
    if (!d.de || !d.de.length) continue;
    blocks.push(`
      <div class="info-section">
        <div class="info-subtitle">${escapeHtml(d.name)} — unlocks (${d.de.length})</div>
        <div class="boss-reward-list">
          ${d.de.map(u => `
            <div class="boss-reward-row">
              <span class="boss-reward-qty"></span>
              <span class="boss-reward-name">${escapeHtml(u.name)}</span>
            </div>`).join("")}
        </div>
      </div>`);
  }
  if (!blocks.length){
    return `<div class="info-section"><div class="boss-empty">No engram or item unlocks recorded for this boss.</div></div>`;
  }
  return blocks.join("");
}
