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
  // If the name ends in a difficulty, render it as a colored pill (same
  // pills Item View uses on boss rows).
  setInfoPanelTitle(bossName);
  {
    const m = /^(.*)\s*\((Gamma|Beta|Alpha)\)\s*$/i.exec(bossName);
    if (m){
      const titleEl = ensureInfoPanel().querySelector(".fp-title");
      if (titleEl){
        const cls = m[2].toLowerCase() === "gamma" ? "g" : m[2].toLowerCase() === "beta" ? "b" : "a";
        titleEl.innerHTML = `${escapeHtml(m[1].trim())} <span class="iv-dif ${cls}" style="vertical-align:middle;">${escapeHtml(m[2])}</span>`;
      }
    }
  }

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

  // Wire collapse/expand toggles for pool loot set sections.
  for (const btn of body.querySelectorAll("[data-boss-set-toggle]")){
    btn.addEventListener("click", () => {
      const section = btn.closest(".loot-set-section");
      if (!section) return;
      const isOpen = section.classList.toggle("is-open");
      section.classList.toggle("is-closed", !isOpen);
      const bodyEl = section.querySelector(".loot-set-body");
      if (bodyEl) bodyEl.style.display = isOpen ? "" : "none";
      const chevron = section.querySelector(".loot-set-toggle-chevron");
      if (chevron) chevron.textContent = isOpen ? "⌄" : "›";
      // Recalculate panel height so expanded content scrolls properly.
      refreshInfoPanelPageHeight();
    });
  }

  // Wire collapse/expand for spawned-crate wrapper cards.
  for (const btn of body.querySelectorAll("[data-boss-crate-toggle]")){
    btn.addEventListener("click", () => {
      const card = btn.closest(".bv-crate");
      if (!card) return;
      const isOpen = card.classList.toggle("is-open");
      const bodyEl = card.querySelector(".bv-crate-body");
      if (bodyEl) bodyEl.style.display = isOpen ? "" : "none";
      const chevron = card.querySelector(".bv-crate-chev");
      if (chevron) chevron.textContent = isOpen ? "⌄" : "›";
      refreshInfoPanelPageHeight();
    });
  }

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

// Summon tab: recipe + requirements + where-summoned.
function renderBossSummonTab(boss){
  const summon = boss.summon;

  // Summon cost: a collapsible card with a single-column, independently
  // scrollable ingredient list — long boss recipes no longer eat the panel.
  const recipeHtml = (summon && summon.recipe && summon.recipe.length)
    ? `
      <div class="info-section">
        <div class="bv-crate bv-cost is-open">
          <button type="button" class="bv-crate-head" data-boss-crate-toggle>
            <span class="bv-crate-name">Summon Cost</span>
            <span class="bv-cost-n">${summon.recipe.length} items</span>
            <span class="bv-crate-chev">⌄</span>
          </button>
          <div class="bv-crate-body">
            <div class="bv-cost-scroll iv-recipe">
              ${summon.recipe.map(r => {
                const isArtifact = /^artifact/i.test(r.name || "");
                const nameHtml = r.id != null
                  ? `<span class="item-link" data-item-link-id="${escapeAttr(String(r.id))}">${escapeHtml(r.name)}</span>`
                  : escapeHtml(r.name);
                return `
                  <div class="iv-recipe-row${isArtifact ? " is-artifact" : ""}">
                    <span>${nameHtml}</span>
                    <span class="iv-recipe-qty">× ${escapeHtml(fmt(r.qty))}</span>
                  </div>`;
              }).join("")}
            </div>
          </div>
        </div>
      </div>`
    : `<div class="info-section"><div class="iv-eyebrow">Summon Cost</div>
         <div class="boss-empty">No summon item — this boss is fought directly in the world.</div>
       </div>`;

  // Requirements as chips.
  const chip = (label, val) => (val == null || val === "")
    ? ""
    : `<span class="lc-chip">${escapeHtml(label)} <b>${escapeHtml(val)}</b></span>`;
  const reqChips = [
    chip("Craft Lv",      boss.craftLevel    != null ? String(boss.craftLevel)    : ""),
    chip("Teleport Lv",   boss.teleportLevel != null ? String(boss.teleportLevel) : ""),
    chip("Max Survivors", boss.maxPlayers    != null ? String(boss.maxPlayers)    : ""),
    chip("Max Creatures", boss.maxDinos      != null ? String(boss.maxDinos)      : ""),
    chip("Max Drag Wt",   boss.maxDragWeight != null ? fmt(boss.maxDragWeight)    : ""),
  ].filter(Boolean).join("");

  const reqHtml = reqChips
    ? `<div class="info-section">
         <div class="iv-eyebrow">Requirements</div>
         <div class="lc-chips">${reqChips}</div>
       </div>`
    : "";

  // Terminals / arena this boss is summoned at, as chips (the markers already
  // pinpoint them on the map; this stays readable when the panel covers it).
  const locs = (boss.locations || [])
    .map(l => l.label)
    .filter((v, i, a) => v && a.indexOf(v) === i);
  const locHtml = locs.length
    ? `<div class="info-section">
         <div class="iv-eyebrow">Summoned At</div>
         <div class="lc-chips">
           ${locs.map(l => `<span class="lc-chip iv-station">${escapeHtml(l)}</span>`).join("")}
         </div>
       </div>`
    : "";

  return recipeHtml + reqHtml + locHtml;
}

// Rewards tab: engrams/items unlocked on death, grouped by boss creature.
// Format a min/max count as a quantity label: "178" or "120–550".
function bossQtyLabel(mn, mx){
  const lo = Number(mn), hi = Number(mx);
  if (!Number.isFinite(lo) && !Number.isFinite(hi)) return "";
  if (Number.isFinite(lo) && Number.isFinite(hi) && lo !== hi) return `${fmt(lo)}–${fmt(hi)}`;
  return fmt(Number.isFinite(hi) ? hi : lo);
}

// A single reward cell: accent quantity + linked item name, laid out in the
// .bv-rewards two-column grid.
function bossRewardRow(item, opts = {}){
  const qty = bossQtyLabel(item.mn, item.mx);
  const qtyHtml = qty ? `<b>${escapeHtml(qty)}×</b>` : "";
  const nameInner = item.id != null
    ? `<span class="item-link" data-item-link-id="${escapeAttr(String(item.id))}">${escapeHtml(item.name)}</span>`
    : escapeHtml(item.name);
  return `
    <div class="bv-reward${opts.highlight ? " is-element" : ""}">
      ${qtyHtml}
      <span class="bv-reward-name">${nameInner}</span>
    </div>`;
}

// Render pool-style loot using the same loot-set-section structure as Crate
// View and Dino View, so the styling matches: collapsible header with set
// name + chevron, body with meta-grid and entry blocks.
function renderBossLootSetSection(name, entries, opts = {}){
  const weight = opts.weight;
  const smn = opts.smn;
  const smx = opts.smx;
  const isOpen = opts.open !== false; // default open

  const metaCells = [
    weight != null ? `<div class="meta-cell"><div class="meta-label">Set Weight</div><div class="meta-value">${escapeHtml(fmt(weight) || "--")}</div></div>` : "",
    (smn != null || smx != null) ? `<div class="meta-cell"><div class="meta-label">Items Chosen</div><div class="meta-value">${escapeHtml(fmtRange(smn, smx))}</div></div>` : ""
  ].filter(Boolean).join("");

  return `
    <div class="loot-set-section ${isOpen ? "is-open" : "is-closed"}">
      <button type="button" class="loot-set-toggle" data-boss-set-toggle>
        <div class="loot-set-toggle-main">
          <div class="info-row">
            <span class="info-label">${escapeHtml(name)}</span>
          </div>
        </div>
        <div class="loot-set-toggle-right">
          <span class="loot-set-toggle-chevron">${isOpen ? "⌄" : "›"}</span>
        </div>
      </button>
      <div class="loot-set-body" style="display:${isOpen ? "" : "none"};">
        ${metaCells ? `<div class="meta-grid">${metaCells}</div>` : ""}
        ${(entries || []).length
          ? entries.map(renderLootEntryBlock).join("")
          : `<div class="boss-empty">No entries.</div>`}
      </div>
    </div>`;
}

// Render pool item sets from drop component overrides ("o" field).
function renderBossPoolSets(poolSets, poolPicks){
  if (!poolSets || !poolSets.length) return "";
  const picksLine = (poolPicks && (poolPicks.mn != null || poolPicks.mx != null))
    ? `<div class="bv-crate-mech" style="padding:0 0 8px;">Will include <b>${escapeHtml(typeof fmtRangeCollapsed === "function" ? fmtRangeCollapsed(poolPicks.mn, poolPicks.mx) : fmtRange(poolPicks.mn, poolPicks.mx))}</b> of the item sets below.</div>`
    : "";
  return `<div class="info-section">
    <div class="iv-eyebrow">Loot Pool</div>
    ${picksLine}
    <div class="entries">${
    poolSets.map((row, idx) => {
      const { allEntries, setMeta } = lootSetEntriesFromRow(row);
      const setName = lootSetNameFromRow(row, `Loot Pool ${idx + 1}`);
      return renderBossLootSetSection(setName, allEntries, {
        weight: row?.w,
        smn: setMeta?.smn ?? row?.smn,
        smx: setMeta?.smx ?? row?.smx,
        open: false
      });
    }).join("")
  }</div></div>`;
}

// Render rls (Individual Reward Loot Set) entries as loot-set-sections.
// Header is supplied by the caller so these can live inside the merged
// "Awarded to Each Player" section.
function renderBossRlsSections(rlsData){
  if (!rlsData || !rlsData.entries || !rlsData.entries.length) return "";
  return `<div class="entries">${
    rlsData.entries.map((entry, idx) => {
      const entryName = entry.n || `Group ${idx + 1}`;
      return renderBossLootSetSection(entryName, [entry], {
        open: false
      });
    }).join("")
  }</div>`;
}

// Rewards tab: loot you get from defeating the boss.
function renderBossLootTab(boss){
  const r = boss.rewards || { drops: [], given: [], poolSets: [], rlsData: null, crates: [], bonusItems: [] };
  const sections = [];

  // Exact boss loot (dd/rd sets without overrides) — Element, trophies, flags.
  if (r.drops.length){
    sections.push(`
      <div class="info-section">
        <div class="iv-eyebrow">Boss Loot</div>
        <div class="bv-rewards">
          ${r.drops.map(it => bossRewardRow(it, { highlight: /element/i.test(it.name) })).join("")}
        </div>
      </div>`);
  }

  // Everything handed to players directly: death-gives (dg) and per-player
  // rolled loot sets (rls) live under one section.
  if (r.given.length || r.rlsData){
    sections.push(`
      <div class="info-section">
        <div class="iv-eyebrow">Awarded to Each Player</div>
        ${r.given.length ? `
          <div class="bv-rewards">
            ${r.given.map(it => bossRewardRow(it)).join("")}
          </div>` : ""}
        ${r.rlsData ? `
          ${r.given.length ? `<div class="bv-cap">rolled per player</div>` : ""}
          ${renderBossRlsSections(r.rlsData)}` : ""}
      </div>`);
  }

  // Pool loot from ItemSetOverride sets (e.g. Astraeos boar's miniboss loot).
  if (r.poolSets && r.poolSets.length){
    sections.push(renderBossPoolSets(r.poolSets, r.poolPicks));
  }

  // Arena loot crates — each wrapped in a card that represents the crate
  // itself (count, name, roll info), with its sets contained inside.
  if (r.crates.length || r.bonusItems.length){
    // Injected bonus items (li) render inside the first crate card.
    const bonusHtml = r.bonusItems.length
      ? r.bonusItems.map(it => {
          const qty = bossQtyLabel(it.mn, it.mx) || "1";
          const nameInner = it.id != null
            ? `<span class="item-link" data-item-link-id="${escapeAttr(String(it.id))}">${escapeHtml(it.name)}</span>`
            : escapeHtml(it.name);
          return `<div class="bv-bonus"><b>+ ${escapeHtml(qty)}×</b> <span>${nameInner} added to ${(r.crates[0]?.qty || 1) > 1 ? "one of these crates" : "this crate"}</span></div>`;
        }).join("")
      : "";

    if (r.crates.length){
      r.crates.forEach((c, ci) => {
        const co = c.crateObj;
        const setsCount = co?.s?.length || 0;

        const chips = co ? [
          (co.mn != null || co.mx != null)
            ? `<span class="lc-chip">Item sets <b>${escapeHtml(typeof fmtRangeCollapsed === "function" ? fmtRangeCollapsed(co.mn, co.mx) : fmtRange(co.mn, co.mx))}</b></span>` : "",
          (co.qm1 != null || co.qm2 != null)
            ? `<span class="lc-chip">Quality ×<b>${escapeHtml(typeof fmtRangeCollapsed === "function" ? fmtRangeCollapsed(co.qm1, co.qm2) : fmtRange(co.qm1, co.qm2))}</b></span>` : ""
        ].filter(Boolean).join("") : "";

        const mech = (co && (co.mn != null || co.mx != null))
          ? `<div class="bv-crate-mech">${c.qty > 1 ? "Each crate" : "This crate"} will contain <b>${escapeHtml(typeof fmtRangeCollapsed === "function" ? fmtRangeCollapsed(co.mn, co.mx) : fmtRange(co.mn, co.mx))}</b> of the item sets below.</div>`
          : "";

        const setsHtml = (co && co.s)
          ? co.s.map((setRow, idx) => {
              const { allEntries, setMeta } = lootSetEntriesFromRow(setRow);
              const setName = lootSetNameFromRow(setRow, `Set ${idx + 1}`);
              return renderBossLootSetSection(setName, allEntries, {
                weight: setRow.w,
                smn: setMeta?.smn ?? setRow?.smn,
                smx: setMeta?.smx ?? setRow?.smx,
                open: false
              });
            }).join("")
          : "";

        sections.push(`
          <div class="info-section">
            ${ci === 0 ? `<div class="iv-eyebrow">Crates Spawned</div>` : ""}
            <div class="bv-crate is-open">
              <button type="button" class="bv-crate-head" data-boss-crate-toggle>
                ${c.qty > 1 ? `<span class="bv-crate-count">${escapeHtml(String(c.qty))}×</span>` : ""}
                <span class="bv-crate-name">${escapeHtml(c.name)}</span>
                <span class="bv-crate-chev">⌄</span>
              </button>
              ${chips ? `<div class="bv-crate-meta lc-chips">${chips}</div>` : ""}
              ${mech}
              ${ci === 0 ? bonusHtml : ""}
              <div class="bv-crate-body">
                ${setsHtml || `<div class="boss-empty">No set data for this crate.</div>`}
              </div>
            </div>
          </div>`);
      });
    } else {
      // Bonus items with no crate data — standalone section.
      sections.push(`
        <div class="info-section">
          <div class="iv-eyebrow">Bonus Item${r.bonusItems.length > 1 ? "s" : ""}</div>
          ${bonusHtml}
        </div>`);
    }
  }

  if (!sections.length){
    return `<div class="info-section"><div class="boss-empty">No loot rewards recorded for this boss.</div></div>`;
  }
  return sections.join("");
}

// Unlocks tab: engrams/items unlocked on death, grouped by boss creature.
function renderBossRewardsTab(boss){
  const unlockCell = u => `
    <div class="bv-unlock">${
      u.id != null
        ? `<span class="item-link" data-item-link-id="${escapeAttr(String(u.id))}">${escapeHtml(u.name)}</span>`
        : escapeHtml(u.name)
    }</div>`;

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
        <div class="iv-eyebrow">Unlocks (${items.length})</div>
        <div class="bv-unlocks">
          ${items.map(unlockCell).join("")}
        </div>
      </div>`;
  }

  // Fallback: per-dino de (death engrams).
  const blocks = [];
  for (const d of (boss.dinos || [])){
    if (!d.de || !d.de.length) continue;
    blocks.push(`
      <div class="info-section">
        <div class="iv-eyebrow">${escapeHtml(d.name)} — Unlocks (${d.de.length})</div>
        <div class="bv-unlocks">
          ${d.de.map(unlockCell).join("")}
        </div>
      </div>`);
  }
  if (!blocks.length){
    return `<div class="info-section"><div class="boss-empty">No engram or item unlocks recorded for this boss.</div></div>`;
  }
  return blocks.join("");
}
