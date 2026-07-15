

function rebuildDinoSelect(){

  const list = State.mode === "dino" ? State.names : State.entryList;
  const placeholder = State.mode === "dino"
    ? "(Select a Dino)"
    : "(Select a Spawn Entry)";

  // restore valid remembered selection for current mode
  const saved = State.selections[State.mode] || "";
  State.selection = (saved && list.includes(saved)) ? saved : "";

  UI.dinoSelect.innerHTML = "";

  const emptyOpt = document.createElement("option");
  emptyOpt.value = "";
  emptyOpt.textContent = placeholder;
  UI.dinoSelect.appendChild(emptyOpt);

  for (const v of list){
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    UI.dinoSelect.appendChild(o);
  }

  UI.dinoSelect.value = State.selection;

  UI.dinoSelect.onchange = () => {
    State.selection = UI.dinoSelect.value || "";
    State.selections[State.mode] = State.selection;
    render();
  };

  mountFancyDropdown(
    UI.dinoSelect,
    UI.dinoFancy,
    State.mode === "dino" ? "Search dinos..." : "Search spawn entries..."
  );
}


// --- SDF Spawn Command State ---
// Per-dino preferences; falls back to shared defaults across selections.
var sdfDefaults = { tamed: false, level: 150, skipBonusLevels: false };
var sdfStateByDino = {};

function getSdfState(name) {
  if (!sdfStateByDino[name]) sdfStateByDino[name] = { ...sdfDefaults };
  return sdfStateByDino[name];
}

// Extract the shortest SDF-usable partial from a blueprint path.
//
// Strategy: take the class name segment (after last dot), strip the standard
// ARK suffixes layer by layer, and return whatever is left.  If stripping
// leaves an empty string we fall back to the full stripped-suffix form, and
// if that is also empty we return the raw class name so there is always
// something usable.
//
// Examples
//   Rex_Character_BP_C            -> Rex
//   MegaRex_Character_BP_C        -> MegaRex
//   Dodo_Character_BP_Aberrant_C  -> Dodo_Character_BP_Aberrant  (unique part kept)
//   SomeWeirdMod_C                -> SomeWeirdMod
function extractSdfPartial(bp) {
  if (!bp) return "";

  // Grab the class identifier after the last dot (or last slash as fallback)
  const raw = String(bp).split(".").pop().split("/").pop();

  // Ordered list of suffix patterns to strip, most-specific first
  const SUFFIXES = [
    /_Character_BP_C$/,
    /_BP_C$/,
    /_Character_C$/,
    /_C$/,
    /_Character_BP$/,
    /_Character$/,
    /_BP$/,
  ];

  let cls = raw;
  for (const re of SUFFIXES) {
    const stripped = cls.replace(re, "");
    if (stripped && stripped !== cls) { cls = stripped; break; }
  }

  return cls || raw;
}

function buildSdfCommand(partial, tamed, level, skipBonus) {
  const wildTamed = tamed ? 1 : 0;
  const lvl = Math.max(1, Math.round(Number(level) || 1));
  const skip = skipBonus ? 1 : 0;
  return `cheat SDF ${partial} ${wildTamed} ${lvl} 1 ${skip}`;
}

function buildSdfSummary(displayName, tamed, level, skipBonus) {
  const kind = tamed ? "tamed" : "wild";
  const lvl  = Math.max(1, Math.round(Number(level) || 1));
  // When tamed without skip-bonus the game applies a 50% level bonus on spawn
  const effectiveLvl = (tamed && !skipBonus) ? Math.round(lvl * 1.5) : lvl;
  return `Spawns a <b>${kind}</b> level <b>${effectiveLvl}</b> ${escapeHtml(displayName)}${(tamed && skipBonus) ? " <b>(no bonus levels)</b>" : ""}`;
}

// Tame type lookup: dinos have a numeric `tt` that indexes into Global.dinos.tt
// Returns a friendly label (e.g. "Knockout", "Passive", "Egg Steal", etc.)
// or "" when the dino is untameable or has no tame type.
function tameTypeLabelFromCode(tt){
  if (tt == null) return "";
  const table = Global.dinos?.tt;
  if (!Array.isArray(table)) return "";
  const raw = table[Number(tt)];
  if (!raw) return "";
  // Normalize "egg_steal" → "Egg Steal", "knockout" → "Knockout", etc.
  return String(raw)
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}


function renderDinoHero(d, selectedName) {
  const bp = d.bpPath || "";
  const displayName = d.displayName || "(Unknown)";
  const otherName = otherSexNameForSelected(d, selectedName);
  const modId = Global.modMeta?.modId || "";

  const sdf = getSdfState(selectedName);
  const partial = extractSdfPartial(bp);
  const cmd = buildSdfCommand(partial, sdf.tamed, sdf.level, sdf.skipBonusLevels);

  return `
    <div class="dino-hero">
      <div class="dino-hero-title">${escapeHtml(displayName)}</div>
      ${otherName ? `<div class="info-submeta">Also: ${escapeHtml(otherName)}</div>` : ""}
      ${modId ? `<div class="info-submeta">Mod ID: ${escapeHtml(modId)}</div>` : ""}

      ${d.tameable === false || d.tameable === 0 ? `<span class="dino-badge tameable">Untameable</span>` : ""}
      ${(d.tameable === true || d.tameable === 1) && d.tameType ? `<span class="dino-badge tame-type">${escapeHtml(d.tameType)} Tame</span>` : ""}
      ${d.breedable === false || d.breedable === 0 ? `<span class="dino-badge breedable">Unbreedable</span>` : ""}

      <div class="spawn-cmd-block">
        <div class="iv-eyebrow" style="margin:0;">Spawn Command</div>

        <div class="dv-cmdrow">
          <button type="button"
            class="dv-flip ${sdf.tamed ? 'is-tamed' : ''}"
            data-sdf-tamed-flip="1"
          >${sdf.tamed ? 'Tamed' : 'Wild'}</button>

          <span class="iv-cmd-input">
            <label>LV</label>
            <input type="number" data-sdf-level="1"
              value="${escapeAttr(String(sdf.level))}" min="1" max="9999">
          </span>

          <button type="button"
            class="dv-skip ${sdf.tamed && sdf.skipBonusLevels ? 'on' : ''} ${!sdf.tamed ? 'is-disabled' : ''}"
            data-sdf-skip-flip="1"
            ${!sdf.tamed ? 'disabled' : ''}
          >Skip Bonus</button>
        </div>

        <div class="iv-cmd-lines">
          <div class="iv-cmd-line copy-on-click" data-sdf-cmd-line="1"
            data-copy="${escapeAttr(cmd)}" title="Tap to copy">
            <span class="iv-cmd-tag">SDF</span>
            <span class="iv-cmd-text" data-sdf-cmd-text="1">${escapeHtml(cmd)}</span>
          </div>
        </div>
        <div class="iv-cmd-hint">tap the command to copy</div>

        <div class="spawn-cmd-summary" data-sdf-summary="1">${buildSdfSummary(displayName, sdf.tamed, sdf.level, sdf.skipBonusLevels)}</div>
      </div>
    </div>
  `;
}


function renderDinoTabSpawns(d, selectedName){
  const entries = d.entries || [];

  const allChecked = entries.length
    ? entries.every((e, i) => {
        const key = entryVisibilityKey(selectedName, i);
        return entryVisibility[key] ?? true;
      })
    : true;

  const allCardsOpen = entries.length
    ? entries.every((e, i) => {
        const key = entryVisibilityKey(selectedName, i);
        return dinoSpawnCardOpenState[key] ?? true;
      })
    : true;

  return `
    <div class="info-section">
      <div class="entries mode-menu-like-list">
        ${
          entries.length
            ? `
              <div class="mod-filter-row" style="align-items:center; padding:0 0 4px;">
                <button
                  type="button"
                  class="mod-filter-pill ${allChecked ? "is-on" : ""}"
                  data-dino-toggle-all="1"
                >Toggle All</button>
                <button
                  type="button"
                  class="loot-set-toggle-all"
                  data-dino-collapse-all="1"
                  style="margin-left:auto;"
                >${allCardsOpen ? "Collapse All" : "Expand All"}</button>
              </div>
            `
            : ``
        }

        ${entries.map((e, i) => renderDinoSpawnMenuRow(e, selectedName, i)).join("")}
      </div>
    </div>
  `;
}

function renderDinoTabStats(d){
  return `
    <div class="info-section">
      <div class="iv-eyebrow" style="margin-top:2px;">Stats per Level</div>
      <div data-dino-stats-table>${renderStatsTable(d?.stats)}</div>
      ${renderStatSettingsCard(d?.stats)}
    </div>
  `;
}

// Collapsible Server Settings card: per-stat PerLevelStatsMultiplier inputs
// (Wild / Tamed / Tamed_Add / Tamed_Affinity). The stats table above
// recomputes live as values change.
function renderStatSettingsCard(statsObj){
  if (!statsObj || typeof statsObj !== "object") return "";

  const keys = [];
  for (const k of STAT_ORDER) if (k in statsObj) keys.push(k);
  for (const k of Object.keys(statsObj)) {
    if (k.endsWith("_TBM")) continue;
    if (!keys.includes(k)) keys.push(k);
  }
  if (!keys.length) return "";

  const COLS = [["iw", "Wild ×"], ["it", "Tamed ×"], ["ta", "Add ×"], ["tm", "Affinity ×"]];

  const rows = keys.map(statKey => {
    const label = STAT_LABEL[statKey] || statKey;
    const cells = COLS.map(([col]) => {
      const val = getStatMult(statKey, col);
      const def = ARK_DEFAULT_MULT?.[statKey]?.[col] ?? 1;
      return `<input type="text" inputmode="decimal"
        class="${val !== def ? "changed" : ""}"
        data-stat-mult="1" data-stat="${escapeAttr(statKey)}" data-col="${col}"
        value="${escapeAttr(String(val))}">`;
    }).join("");
    return `<div class="dv-set-row">
      <div class="dv-set-name">${escapeHtml(label)}</div>
      ${cells}
    </div>`;
  }).join("");

  return `
    <div class="dv-settings ${dinoStatSettingsOpen ? "is-open" : ""}" data-stat-settings-card="1">
      <button type="button" class="dv-settings-head" data-stat-settings-toggle="1">
        <span class="dv-settings-name">Server Settings</span>
        <span class="dv-settings-sub">stats update live</span>
        <span class="dv-settings-chev">${dinoStatSettingsOpen ? "⌄" : "›"}</span>
      </button>
      <div class="dv-settings-body">
        <div class="dv-set-row head">
          <div>Stat</div><div>Wild ×</div><div>Tamed ×</div><div>Add ×</div><div>Affinity ×</div>
        </div>
        ${rows}
        <button type="button" class="dv-reset" data-stat-settings-reset="1">Reset to defaults</button>
        <div class="dv-set-note">PerLevelStatsMultiplier — Wild, Tamed, Tamed_Add, Tamed_Affinity. Base stats can't be changed by server settings.</div>
      </div>
    </div>
  `;
}


// ── Dino inventory section (weight reductions, passive gen, etc.) ─────────
// Known broad parent items that should be shown as summaries rather than
// expanding every child item.
const INV_SUMMARY_NAMES = {
  443: "All Consumables",
  445: "All Consumables",
  311: "All Artifacts",
  460: "All Berries",
  812: "All Kibble",
  809: "All Kibble (Simple+)",
  808: "All Kibble (Regular+)",
  807: "All Kibble (Superior+)",
  811: "All Kibble (Exceptional+)",
  2239: "All Structures",
  2962: "All Weapons",
  1307: "All Items",
  1532: "Chitin / Keratin",
};

function invItemName(itemId){
  if (INV_SUMMARY_NAMES[itemId]) return INV_SUMMARY_NAMES[itemId];
  return itemDisplayNameById(itemId);
}

function invItemChip(itemId, suffix){
  const name = invItemName(itemId);
  const isSummary = !!INV_SUMMARY_NAMES[itemId];
  // Summary items aren't tappable (no real item to open); specific items link
  if (isSummary){
    return `<span class="lc-chip"><em>${escapeHtml(name)}</em>${suffix ? ` <b>${escapeHtml(suffix)}</b>` : ""}</span>`;
  }
  return `<span class="lc-chip loot-item-tag" data-item-id="${escapeAttr(String(itemId))}">${escapeHtml(name)}${suffix ? ` <b>${escapeHtml(suffix)}</b>` : ""}</span>`;
}

function renderDinoInventorySection(d){
  const dinoObj = getDinoObjByBp(d?.bpPath);
  if (dinoObj?.iv == null) return "";
  const invObj = itemData()?.inv?.[String(dinoObj.iv)];
  if (!invObj) return "";

  const sections = [];

  // ── Weight Reductions ──
  const wm = invObj.wm || [];
  if (wm.length){
    const chips = wm.map(pair =>
      invItemChip(pair[0], `×${pair[1]}`)
    ).join("");
    sections.push(`
      <div class="iv-eyebrow">Weight Reductions</div>
      <div class="lc-chips">${chips}</div>
    `);
  }

  // ── Passive Generation ──
  const gi = invObj.gi || [];
  if (gi.length){
    const rows = gi.map(entry => {
      const name = itemDisplayNameById(entry[0]);
      const interval = fmtDuration(entry[1]);
      const max = entry[2];
      return `<div class="dv-inv-row">
        <span class="loot-item-tag" data-item-id="${escapeAttr(String(entry[0]))}">${escapeHtml(name)}</span>
        <span class="dv-inv-detail">every <b>${escapeHtml(interval)}</b> · max <b>${escapeHtml(String(max))}</b></span>
      </div>`;
    }).join("");
    sections.push(`
      <div class="iv-eyebrow">Generates</div>
      ${rows}
    `);
  }

  // ── Spoil Multipliers ──
  const sm = invObj.sm || [];
  if (sm.length){
    const chips = sm.map(pair =>
      invItemChip(pair[0], `×${pair[1]}`)
    ).join("");
    sections.push(`
      <div class="iv-eyebrow">Spoil Time</div>
      <div class="lc-chips">${chips}</div>
    `);
  }

  // ── Prevented Items ──
  const pi = invObj.pi || [];
  if (pi.length){
    const chips = pi.map(id => invItemChip(id, "")).join("");
    sections.push(`
      <div class="iv-eyebrow">Cannot Carry</div>
      <div class="lc-chips">${chips}</div>
    `);
  }

  // ── Allowed Items Only ──
  const ai = invObj.ai || [];
  if (ai.length){
    const chips = ai.map(id => invItemChip(id, "")).join("");
    sections.push(`
      <div class="iv-eyebrow">Allowed Items Only</div>
      <div class="lc-chips">${chips}</div>
    `);
  }

  // ── Max Slots ──
  const mi = invObj.mi;
  if (mi != null){
    sections.push(`
      <div class="lc-chips" style="margin-top:6px;">
        <span class="lc-chip">Max Slots <b>${escapeHtml(String(mi))}</b></span>
      </div>
    `);
  }

  // ── Saddle crafting (fc → linked inventories' structures) ──
  const fc = invObj.fc;
  if (fc != null){
    const data = itemData();
    const structs = data?.st || {};
    const fcIds = Array.isArray(fc) ? fc : [fc];
    const stationNames = [];
    for (const fcId of fcIds){
      for (const stObj of Object.values(structs)){
        if (stObj?.inv === fcId && stObj.n){
          if (!stationNames.includes(stObj.n)) stationNames.push(stObj.n);
          break;
        }
      }
    }
    if (stationNames.length){
      const label = stationNames.length === 1
        ? `Crafts <b>${escapeHtml(stationNames[0])}</b> items with saddle`
        : `Crafts ${stationNames.map(n => `<b>${escapeHtml(n)}</b>`).join(" + ")} items with saddle`;
      sections.push(`
        <div class="lc-chips" style="margin-top:6px;">
          <span class="lc-chip">${label}</span>
        </div>
      `);
    }
  }

  if (!sections.length) return "";
  return `
    <div class="info-section">
      <div class="iv-eyebrow" style="margin-top:2px;">Inventory</div>
      ${sections.join("")}
    </div>
  `;
}

function renderDinoTabInfo(d) {
  const bp = d.bpPath || "";
  const extraBps = Array.isArray(d.additionalBpPathsToDisplay)
    ? d.additionalBpPathsToDisplay
    : [];
  const nameTag = d.nameTag || "";
  const classDisplay = bp ? bp.split(".").pop() : "";
  const drag = fmtNum(d?.dragWeight, 0);
  const xp = fmtNum(d?.killXpBase, 0);

  const idRow = (tag, value) => value ? `
    <div class="iv-cmd-line copy-on-click" data-copy="${escapeAttr(value)}" title="Tap to copy">
      <span class="iv-cmd-tag">${escapeHtml(tag)}</span>
      <span class="iv-cmd-text">${escapeHtml(value)}</span>
    </div>` : "";

  const generalChips = [
    drag !== null ? `<span class="lc-chip">Drag Weight <b>${escapeHtml(drag)}</b></span>` : "",
    xp !== null ? `<span class="lc-chip">Kill XP <b>${escapeHtml(String(Number(xp) * 4))}</b></span>` : ""
  ].filter(Boolean).join("");

  return `
    ${generalChips ? `
      <div class="info-section">
        <div class="iv-eyebrow" style="margin-top:2px;">General</div>
        <div class="lc-chips">${generalChips}</div>
      </div>
    ` : ""}

    ${renderDinoInventorySection(d)}

    <div class="info-section">
      <div class="iv-eyebrow">Identifiers</div>
      <div class="dv-idrows">
        ${idRow("CLASS", classDisplay)}
        ${idRow("TAG", nameTag)}
        ${idRow("BP", bp)}
        ${extraBps.filter(Boolean).map(v => idRow("VARIANT", v)).join("")}
      </div>
      <div class="iv-cmd-hint">tap a row to copy</div>
    </div>

    ${renderDossierSection(d)}

    ${renderColorRegionsSection(d)}
  `;
}


function renderDossierSection(d){
  // The dino's Dossier Index (`di`). The dossier is an explorer note, so it
  // unlocks with the same command notes use: cheat GiveExplorerNote <index>.
  const idx = d?.dossierIndex;
  if (idx == null) return "";

  const unlockCmd = `cheat GiveExplorerNote ${idx}`;
  return `
    <div class="info-section">
      <div class="iv-eyebrow">Dossier</div>
      <div class="lc-chips" style="margin-bottom:7px;">
        <span class="lc-chip">Dossier Index <b>${escapeHtml(String(idx))}</b></span>
      </div>
      <div class="iv-cmd-line copy-on-click" data-copy="${escapeAttr(unlockCmd)}" title="Tap to copy">
        <span class="iv-cmd-tag">NOTE</span>
        <span class="iv-cmd-text">${escapeHtml(unlockCmd)}</span>
      </div>
    </div>
  `;
}


function colorSetsForDino(d){
  // Returns { male: cs|null, female: cs|null }
  //
  // A dino references color sets through one of two key families:
  //   cs / mcs / fcs    -> a set in THIS dino's own file
  //                        (vanilla file for vanilla dinos; mod file for mod dinos)
  //   vcs / vmcs / vfcs -> a VANILLA set, even on a mod dino
  // mcs/fcs (and vmcs/vfcs) split male vs female; cs/vcs is unified.
  //
  // Vanilla sets resolve against Global.dinos.cs. Mod sets resolve against the
  // originating mod's table in Global.dinos.modCsByMod[_modId] — kept per-mod
  // because each mod's set ids restart at 1.
  const dinoObj = getDinoObjByBp(d?.bpPath);
  if (!dinoObj) return { male: null, female: null };

  const vanillaCs = Global.dinos?.cs || {};
  const modCsByMod = Global.dinos?.modCsByMod || {};
  const modId = String(dinoObj._modId || "");

  // `cs`/`mcs`/`fcs` mean "a set in this dino's OWN file". For a mod dino
  // that's the mod's color set table; for a vanilla dino it's the vanilla
  // `cs` table. `vcs`/`vmcs`/`vfcs` always mean the vanilla table.
  const ownCs = modId ? (modCsByMod[modId] || {}) : vanillaCs;

  function lookup(table, id){
    if (id == null) return null;
    return table[String(id)] || table[id] || null;
  }

  // Unified set: cs (own-file set) or vcs (vanilla set).
  if (dinoObj.cs != null){
    const set = lookup(ownCs, dinoObj.cs);
    return { male: set, female: set };
  }
  if (dinoObj.vcs != null){
    const set = lookup(vanillaCs, dinoObj.vcs);
    return { male: set, female: set };
  }

  // Split male/female. A dino may mix namespaces (e.g. mod male, vanilla
  // female), so each side is resolved independently.
  const male =
    dinoObj.mcs  != null ? lookup(ownCs,     dinoObj.mcs)  :
    dinoObj.vmcs != null ? lookup(vanillaCs, dinoObj.vmcs) : null;
  const female =
    dinoObj.fcs  != null ? lookup(ownCs,     dinoObj.fcs)  :
    dinoObj.vfcs != null ? lookup(vanillaCs, dinoObj.vfcs) : null;

  if (male || female) return { male, female };
  return { male: null, female: null };
}


function colorSwatchHtml(colorIdx){
  const defs = Global.dinos?.c || {};
  const entry = defs[String(colorIdx)] || defs[colorIdx];
  if (!Array.isArray(entry) || entry.length < 2) return "";
  const name = entry[0];
  const hex  = entry[1];
  return `<span class="color-swatch" style="background:#${escapeAttr(hex)};"
    data-color-name="${escapeAttr(name)}"
    data-color-hex="${escapeAttr(hex)}"
    data-color-idx="${escapeAttr(String(colorIdx))}"
    role="button" tabindex="0"></span>`;
}


function isUsableRegionName(name){
  // Guard against malformed source data where the color list was dumped into
  // the RegionName field, and against names long enough to break layout.
  if (!name || typeof name !== "string") return false;
  const t = name.trim();
  if (!t || t.length > 48) return false;
  if (t.includes('("') || t.includes('","') || t.includes('")')) return false;
  return true;
}


function renderColorRegionRow(regionIdx, regionData){
  // regionData can be either:
  //   - new format: { n: "Dark All", c: [color indices] }
  //   - old format: [color indices]  (legacy fallback)
  //   - null  (region not used by this dino)
  let name = "";
  let colorIndices = null;

  if (regionData && typeof regionData === "object" && !Array.isArray(regionData)) {
    name = isUsableRegionName(regionData.n) ? regionData.n : "";
    colorIndices = Array.isArray(regionData.c) ? regionData.c : null;
  } else if (Array.isArray(regionData)) {
    colorIndices = regionData;
  }

  if (!colorIndices || !colorIndices.length) return "";

  // Color indices must be numbers (ids). Drop anything else defensively —
  // older/broken data sometimes carried raw name strings here.
  colorIndices = colorIndices.filter(x => typeof x === "number");
  if (!colorIndices.length) return "";

  const swatches = colorIndices.map(colorSwatchHtml).join("");
  return `
    <div class="color-region-row dv-region">
      <div class="dv-region-title">
        ${name ? `<span class="dv-region-name">${escapeHtml(name)}</span>` : ""}
        <span class="dv-region-idx">REGION ${regionIdx}</span>
      </div>
      <div class="color-region-swatches">${swatches}</div>
    </div>
  `;
}


function renderColorRegionsSection(d){
  const { male, female } = colorSetsForDino(d);

  // No color data at all
  if (!male && !female) return "";

  // If both exist and are the same array reference (unified cs), show single section
  const isSameSet = male === female;

  function renderSet(cs, title){
    if (!cs) return "";
    // cs is an array of 6 entries (objects or null). Skip empty/null regions.
    const rows = [];
    for (let i = 0; i < 6; i++){
      const region = cs[i];
      if (!region) continue;
      // region is either {n,c} or legacy array; renderColorRegionRow handles both
      const html = renderColorRegionRow(i, region);
      if (html) rows.push(html);
    }
    if (!rows.length) return "";
    return `
      ${title ? `<div class="info-subtitle" style="margin-top:8px;">${escapeHtml(title)}</div>` : ""}
      <div class="color-regions">
        ${rows.join("")}
      </div>
    `;
  }

  return `
    <div class="info-section">
      <div class="iv-eyebrow">Color Regions</div>
      ${
        isSameSet
          ? renderSet(male, "")
          : `${renderSet(male, "Male")}${renderSet(female, "Female")}`
      }
    </div>
  `;
}


function dinoLootSetStateKey(dinoBp, idx){
  return `${State.mapId}::${dinoBp}::dinoLootSet::${idx}`;
}

function isDinoLootSetOpen(dinoBp, idx){
  return dinoLootSetOpenState[dinoLootSetStateKey(dinoBp, idx)] ?? true;
}

function setDinoLootSetOpen(dinoBp, idx, open){
  dinoLootSetOpenState[dinoLootSetStateKey(dinoBp, idx)] = !!open;
}

function areAllDinoLootSetsOpen(dinoBp, sets){
  return sets.every((_, i) => isDinoLootSetOpen(dinoBp, i));
}

function setAllDinoLootSetsOpen(dinoBp, sets, open){
  sets.forEach((_, i) => setDinoLootSetOpen(dinoBp, i, open));
}


// Per-entry collapse state for dino loot sets, keyed by dino bp + set + entry.
const dinoLootEntryOpenState = {};
function dinoLootEntryKey(dinoBp, setIdx, entryIdx){
  return `${dinoBp}|${setIdx}|${entryIdx}`;
}
function isDinoLootEntryOpen(dinoBp, setIdx, entryIdx, dflt){
  return dinoLootEntryOpenState[dinoLootEntryKey(dinoBp, setIdx, entryIdx)] ?? !!dflt;
}
function setDinoLootEntryOpen(dinoBp, setIdx, entryIdx, open){
  dinoLootEntryOpenState[dinoLootEntryKey(dinoBp, setIdx, entryIdx)] = open;
}

function lootSetById(id){
  return Global.loot?.si?.[id] || null;
}

function renderLootEntryItems(e){
  const itemNames = (Array.isArray(e?.i) ? e.i : []).map(id => {
    const name = itemDisplayNameById(id);
    return `<span class="loot-item-tag" data-item-id="${id}">${escapeHtml(name)}</span>`;
  }).join("");

  if (!itemNames) return "";

  const chance = (e?.chance != null && e.chance !== 1)
    ? ` <span class="loot-chance">${Math.round(e.chance * 100)}%</span>` : "";

  const qty = (e?.mn != null && e?.mx != null && !(e.mn === 1 && e.mx === 1))
    ? ` <span class="loot-qty">${fmtRange(e.mn, e.mx)}</span>` : "";

  return `<div class="loot-entry">${itemNames}${qty}${chance}</div>`;
}

function renderDinoLootSetCard(setRow, idx, dinoBp, allRows, dropComp){
  const { allEntries, setMeta } = lootSetEntriesFromRow(setRow);
  const setName = lootSetNameFromRow(setRow, `Set ${idx + 1}`);
  const isOpen = isDinoLootSetOpen(dinoBp, idx);

  if (!allEntries.length) return "";

  const weight = setRow?.w;
  const smn = setMeta?.smn ?? setRow?.smn;
  const smx = setMeta?.smx ?? setRow?.smx;
  const setNip = setMeta?.nip ?? setRow?.nip;
  const setRwr = setMeta?.rwr ?? setRow?.rwr;

  const totalEntryWeight = allEntries.reduce((s, e) => s + (e?.w || 0), 0) || 1;

  // Exact appears-in-bag chance, same math as crates (helpers in item-view.js)
  let pSet = null;
  if (allRows && dropComp
      && typeof rollCountDistribution === "function"
      && typeof pFiresAtLeastOnce === "function"){
    const allWeights = allRows.map(r => r?.w || 0);
    const picksDist = rollCountDistribution(
      dropComp.mn ?? 1, dropComp.mx ?? dropComp.mn ?? 1, dropComp.nsp ?? 1.0);
    pSet = pFiresAtLeastOnce(allWeights, idx, picksDist, dropComp.rwr === true);
  }
  const pSetStr = fmtProb(pSet);

  // Per-entry draw context for chance sentences inside entries
  let drawsDist = null;
  if (typeof rollCountDistribution === "function"){
    drawsDist = rollCountDistribution(smn ?? 1, smx ?? smn ?? 1, setNip ?? 1.0);
  }
  const entryWeights = allEntries.map(e => e?.w || 0);

  return `
    <div class="loot-set-section ${isOpen ? "is-open" : "is-closed"} dino-loot-set">
      <button
        type="button"
        class="loot-set-toggle"
        data-dino-loot-set-toggle="${escapeAttr(String(idx))}"
      >
        <div class="loot-set-toggle-main">
          <div class="info-row">
            <span class="info-label">${escapeHtml(setName)}</span>
          </div>
        </div>
        <div class="loot-set-toggle-right">
          ${pSetStr != null ? `<span class="lc-set-pct">${pSetStr}</span>` : ``}
          <span class="loot-set-toggle-chevron">${isOpen ? "⌄" : "›"}</span>
        </div>
      </button>

      ${
        pSet != null
          ? `
            <div class="lc-pbar"><i style="width:${Math.max(2, Math.round(pSet * 100))}%"></i></div>
            <div class="lc-set-sub">
              <span>chance of appearing in their bag</span>
              <span class="lc-mono">weight ${escapeHtml(fmt(weight) || "--")}</span>
            </div>
          `
          : ``
      }

      <div class="loot-set-body" style="display:${isOpen ? "" : "none"};">
        <div class="lc-chips">
          ${
            pSet == null
              ? `<span class="lc-chip">Weight <b>${escapeHtml(fmt(weight) || "--")}</b></span>`
              : ``
          }
          ${
            smn != null || smx != null
              ? `<span class="lc-chip">Entry picks <b>${escapeHtml(fmtRangeCollapsed(smn, smx))}</b></span>`
              : ``
          }
          ${
            setRwr === true ? `<span class="lc-chip rwr">⊘ no repeats</span>`
            : setRwr === false ? `<span class="lc-chip rwr">↻ repeats allowed</span>`
            : ``
          }
        </div>
        ${
          smn != null || smx != null
            ? `<div class="lc-set-mech">Will include <b>${escapeHtml(fmtRangeCollapsed(smn, smx))}</b> of the item entries below.${
                setRwr === true ? " Repeats are not allowed."
                : setRwr === false ? " Repeats are allowed."
                : ""
              }</div>`
            : ``
        }

        ${allEntries.map((e, ei) => renderLootEntryBlock(e, totalEntryWeight, {
          drawsDist,
          entryWeights,
          entryIdx: ei,
          setRwr: setRwr === true,
          collapsible: true,
          isOpen: isDinoLootEntryOpen(dinoBp, idx, ei, allEntries.length <= 1),
          toggleAttr: `${idx}:${ei}`
        })).join("")}
      </div>
    </div>
  `;
}


function renderDinoTabLoot(d){
  const bp = d?.bpPath;
  if (!bp) return `<div class="info-section"><div class="info-empty">No loot data</div></div>`;

  const dropComp = dropCompForDino(bp);
  const harvestComp = harvestCompForDino(bp);

  if (!dropComp && !harvestComp){
    return `<div class="info-section"><div class="info-empty">No loot data for this dino</div></div>`;
  }

  let html = "";
  
  if (harvestComp){
    const itemIds = Array.isArray(harvestComp.i) ? harvestComp.i : [];
    const itemsHtml = itemIds.map(id => {
      const name = itemDisplayNameById(id);
      return `<span class="lc-chip loot-item-tag" data-item-id="${id}">${escapeHtml(name)}</span>`;
    }).join("");

    html += `
      <div class="info-section">
        <div class="iv-eyebrow" style="margin-top:2px;">Harvested From Corpse</div>
        <div class="lc-chips">${itemsHtml || `<div class="info-empty">No harvest data</div>`}</div>
      </div>`;
  }

  if (dropComp){
    const sets = Array.isArray(dropComp.s) ? dropComp.s : [];
    const mn = dropComp.mn ?? 1;
    const mx = dropComp.mx ?? 1;
    const allOpen = areAllDinoLootSetsOpen(bp, sets);
    const setsHtml = sets
      .map((setRow, idx) => renderDinoLootSetCard(setRow, idx, bp, sets, dropComp))
      .filter(Boolean)
      .join("");
    html += `
      <div class="info-section">
        <div class="dino-loot-section-head">
          <div class="iv-eyebrow" style="margin:0;">Drops on Death</div>

          ${sets.length ? `
            <button
              type="button"
              class="loot-set-toggle-all"
              data-dino-loot-set-toggle-all="1"
            >${allOpen ? "Collapse All" : "Expand All"}</button>
          ` : ""}
        </div>
        ${mn != null && mx != null
          ? `<div class="lc-mech">Their drop bag will contain <b>${escapeHtml(fmtRangeCollapsed(mn, mx))}</b> of the item sets below.</div>`
          : ""}
        <div class="entries mode-menu-like-list">
          ${setsHtml || `<div class="info-empty">No drop data</div>`}
        </div>
      </div>`;
  }

  return html;
}


function renderDinoPanel(name){
  const d = getSelectedDinoGroup(name);
  if (!d){
    renderInfoPanelBodyEmpty();
    return;
  }

  const spawnCount = d.entries?.length ?? 0;
  const hasLoot = !!(dropCompForDino(d?.bpPath) || harvestCompForDino(d?.bpPath));
  const dinoPanelTabs = [
    { id: "spawns", label: `Spawns (${spawnCount})` },
    { id: "stats",  label: "Stats" },
    ...(hasLoot ? [{ id: "loot", label: "Loot" }] : []),
    { id: "info",   label: "Info" }
  ];

  const activeTab = dinoPanelTabs.some(t => t.id === infoPanelState.dinoTab)
    ? infoPanelState.dinoTab
    : "spawns";

  const panel = ensureInfoPanel();

  setInfoPanelTitle(name);

  const html = `
    ${renderDinoHero(d, name)}
    ${renderTabs({
      tabs: dinoPanelTabs,
      activeId: activeTab,
      dataAttr: "data-dino-tab"
    })}
    ${renderPages({
      tabs: dinoPanelTabs,
      activeId: activeTab,
      renderPage: (id) => {
        if (id === "spawns") return renderDinoTabSpawns(d, name);
        if (id === "stats") return renderDinoTabStats(d);
        if (id === "loot") return renderDinoTabLoot(d);
        if (id === "info") return renderDinoTabInfo(d);
        return "";
      }
    })}
  `;

  setInfoPanelHTML(html);

  const body = panel.querySelector(".fp-body");

  wireTabs(body, {
    tabs: dinoPanelTabs,
    activeId: activeTab,
    dataAttr: "data-dino-tab",
    onChange: (id) => {
      infoPanelState.dinoTab = id;
      renderDinoPanel(name);
    }
  });

  // --- SDF spawn command wiring ---
  // Helper: update the command output and summary in-place without a full re-render
  function refreshSdfOutput() {
    const sdf = getSdfState(name);
    const partial = extractSdfPartial(d?.bpPath || "");
    const cmd = buildSdfCommand(partial, sdf.tamed, sdf.level, sdf.skipBonusLevels);
    const txtEl = body.querySelector("[data-sdf-cmd-text]");
    if (txtEl) txtEl.textContent = cmd;
    const lineEl = body.querySelector("[data-sdf-cmd-line]");
    if (lineEl) lineEl.dataset.copy = cmd;
    const summary = body.querySelector("[data-sdf-summary]");
    if (summary) summary.innerHTML = buildSdfSummary(d?.displayName || name, sdf.tamed, sdf.level, sdf.skipBonusLevels);
  }

  // Wild / Tamed flip switch
  const tamedFlipBtn = body.querySelector("[data-sdf-tamed-flip]");
  if (tamedFlipBtn) {
    tamedFlipBtn.onclick = () => {
      const sdf = getSdfState(name);
      sdf.tamed = !sdf.tamed;
      // Default skip-bonus to off whenever tamed is toggled
      sdf.skipBonusLevels = false;

      tamedFlipBtn.textContent = sdf.tamed ? "Tamed" : "Wild";
      tamedFlipBtn.classList.toggle("is-tamed", sdf.tamed);

      const skipBtn = body.querySelector("[data-sdf-skip-flip]");
      if (skipBtn) {
        skipBtn.disabled = !sdf.tamed;
        skipBtn.classList.toggle("is-disabled", !sdf.tamed);
        skipBtn.classList.remove("on");
      }

      refreshSdfOutput();
    };
  }

  // Level — live update
  const levelInput = body.querySelector("[data-sdf-level]");
  if (levelInput) {
    levelInput.oninput = () => {
      const sdf = getSdfState(name);
      sdf.level = Math.max(1, parseInt(levelInput.value, 10) || 1);
      refreshSdfOutput();
    };
    levelInput.onclick = (e) => e.stopPropagation();
  }

  // Skip bonus flip button
  const skipFlipBtn = body.querySelector("[data-sdf-skip-flip]");
  if (skipFlipBtn) {
    skipFlipBtn.onclick = () => {
      const sdf = getSdfState(name);
      sdf.skipBonusLevels = !sdf.skipBonusLevels;
      skipFlipBtn.classList.toggle("on", sdf.skipBonusLevels);
      refreshSdfOutput();
    };
  }

  body.querySelectorAll("[data-dino-entry-zoom]").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const cls = btn.dataset.dinoEntryZoom;
      const key = btn.dataset.key;
      // Zooming to a hidden entry would show nothing — turn it on first.
      if (key && !(entryVisibility[key] ?? true)){
        entryVisibility[key] = true;
        render();
        renderInfoPanel();
      }
      if (typeof zoomToSpawnEntry === "function") zoomToSpawnEntry(cls);
    };
  });

  body.querySelectorAll("[data-dino-entry-toggle]").forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.key;
      if (!key) return;

      const next = !(entryVisibility[key] ?? true);
      entryVisibility[key] = next;

      // Toggle is-on on the visible card container (parent loot-set-section),
      // not on the inner button itself
      const card = btn.closest(".dv-entry");
      card?.classList.toggle("is-on", next);

      const master = body.querySelector("[data-dino-toggle-all]");
      if (master){
        const allOn = [...body.querySelectorAll("[data-dino-entry-toggle]")]
          .every(el => el.closest(".dv-entry")?.classList.contains("is-on"));
        master.classList.toggle("is-on", allOn);
      }

      drawDino(name);
    };
  });

  const master = body.querySelector("[data-dino-toggle-all]");
  if (master){
    master.onclick = () => {
      const rows = [...body.querySelectorAll("[data-dino-entry-toggle]")];
      const allOn = rows.every(el => el.closest(".dv-entry")?.classList.contains("is-on"));
      const next = !allOn;

      rows.forEach(el => {
        const key = el.dataset.key;
        if (!key) return;
        entryVisibility[key] = next;
        el.closest(".dv-entry")?.classList.toggle("is-on", next);
      });

      master.classList.toggle("is-on", next);
      drawDino(name);
    };
  }

  // Expand/collapse individual spawn cards
  body.querySelectorAll("[data-dino-spawn-card-toggle]").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const key = btn.dataset.dinoSpawnCardToggle;
      const prevScroll = getActiveInfoPanelScroll(infoPanelState.dinoTab);
      dinoSpawnCardOpenState[key] = !dinoSpawnCardOpenState[key];
      renderDinoPanel(name);
      restoreActiveInfoPanelScroll(prevScroll, infoPanelState.dinoTab);
    };
  });

  // Collapse all spawn cards
  body.querySelectorAll("[data-dino-collapse-all]").forEach(btn => {
    btn.onclick = () => {
      const keys = [...body.querySelectorAll("[data-dino-spawn-card-toggle]")]
        .map(b => b.dataset.dinoSpawnCardToggle).filter(Boolean);
      const allOpen = keys.every(k => dinoSpawnCardOpenState[k] ?? true);
      keys.forEach(k => { dinoSpawnCardOpenState[k] = !allOpen; });
      renderDinoPanel(name);
    };
  });

  body.querySelectorAll("[data-open-entry]").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      const entryName = btn.dataset.openEntry;
      openEntryView(entryName);
    };
  });
  body.querySelectorAll("[data-dino-loot-set-toggle]").forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.dinoLootSetToggle);
      if (!Number.isInteger(idx)) return;

      const prevScroll = getActiveInfoPanelScroll(infoPanelState.dinoTab);

      setDinoLootSetOpen(d.bpPath, idx, !isDinoLootSetOpen(d.bpPath, idx));
      renderDinoPanel(name);

      restoreActiveInfoPanelScroll(prevScroll, infoPanelState.dinoTab);
    };
  });

  // --- Server Settings card (Stats tab) ---
  const settingsCard = body.querySelector("[data-stat-settings-card]");
  if (settingsCard){
    const headBtn = settingsCard.querySelector("[data-stat-settings-toggle]");
    if (headBtn){
      headBtn.onclick = () => {
        dinoStatSettingsOpen = !dinoStatSettingsOpen;
        settingsCard.classList.toggle("is-open", dinoStatSettingsOpen);
        const chev = settingsCard.querySelector(".dv-settings-chev");
        if (chev) chev.textContent = dinoStatSettingsOpen ? "⌄" : "›";
        refreshInfoPanelPageHeight();
        syncActivePageHeight(body.querySelector(".fp-pages"), infoPanelState.dinoTab);
      };
    }

    // Live multiplier inputs: update the table in place so typing keeps focus
    settingsCard.querySelectorAll("[data-stat-mult]").forEach(inp => {
      inp.onclick = (e) => e.stopPropagation();
      inp.oninput = () => {
        const sk = inp.dataset.stat;
        const ck = inp.dataset.col;
        const def = ARK_DEFAULT_MULT?.[sk]?.[ck] ?? 1;
        const v = parseFloat(inp.value);
        const val = Number.isFinite(v) ? v : def;
        if (!serverStatMult[sk]) serverStatMult[sk] = {};
        serverStatMult[sk][ck] = val;
        inp.classList.toggle("changed", val !== def);
        const wrap = body.querySelector("[data-dino-stats-table]");
        if (wrap) wrap.innerHTML = renderStatsTable(d?.stats);
      };
    });

    const resetBtn = settingsCard.querySelector("[data-stat-settings-reset]");
    if (resetBtn){
      resetBtn.onclick = () => {
        resetServerStatMult();
        renderDinoPanel(name);
      };
    }
  }

  // Collapsible item entries inside dino loot sets (shares the attribute the
  // shared renderLootEntryBlock emits; the handler here uses dino state).
  body.querySelectorAll("[data-crate-entry-toggle]").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const parts = String(btn.dataset.crateEntryToggle).split(":");
      const si = Number(parts[0]), ei = Number(parts[1]);
      if (!Number.isInteger(si) || !Number.isInteger(ei)) return;

      const prevScroll = getActiveInfoPanelScroll(infoPanelState.dinoTab);

      const comp = dropCompForDino(d.bpPath);
      const row = comp?.s?.[si];
      const entryCount = row ? lootSetEntriesFromRow(row).allEntries.length : 99;
      const cur = isDinoLootEntryOpen(d.bpPath, si, ei, entryCount <= 1);
      setDinoLootEntryOpen(d.bpPath, si, ei, !cur);
      renderDinoPanel(name);

      restoreActiveInfoPanelScroll(prevScroll, infoPanelState.dinoTab);
    };
  });

  body.querySelectorAll("[data-dino-loot-set-toggle-all]").forEach(btn => {
    btn.onclick = () => {
      const dropComp = dropCompForDino(d.bpPath);
      const sets = Array.isArray(dropComp?.s) ? dropComp.s : [];
      const nextOpen = !areAllDinoLootSetsOpen(d.bpPath, sets);

      const prevScroll = getActiveInfoPanelScroll(infoPanelState.dinoTab);

      setAllDinoLootSetsOpen(d.bpPath, sets, nextOpen);
      renderDinoPanel(name);

      restoreActiveInfoPanelScroll(prevScroll, infoPanelState.dinoTab);
    };
  });

  mountPanelSwipe(
    body.querySelector(".fp-pages"),
    dinoPanelTabs,
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


function labelsForDinoObj(d){
  const out = new Set();
  if (!d) return [];

  if (d.n) out.add(String(d.n));
  if (d.fn) out.add(String(d.fn));
  if (d.mn) out.add(String(d.mn));

  return [...out];
}


function getSelectedDinoGroup(name){
  const bps = State.nameToBps.get(name) || [];
  if (!bps.length) return null;

  const first = getDinoObjByBp(bps[0]);
  const bpSet = new Set(bps);

  const entryList = [...new Set(
    bps.flatMap(bp => State.dinoToEntries.get(bp) || [])
  )].sort((a,b)=>{
    const aTek = /CaveTek/i.test(a) ? 1 : 0;
    const bTek = /CaveTek/i.test(b) ? 1 : 0;
    if (aTek !== bTek) return aTek - bTek;
    return a.localeCompare(b);
  });

  const entries = entryList.map(entryName => {
    const rows = spawnRowsForEntry(entryName);

    let groupWeight = 0;
    let spawnMultiplier = 1;
    let spawnLimit = 1;
    let spawnChances = "";

    for (const r of rows){
      const rawBp = normalizeBp(bpForDinoRef(r?.[0]));
      if (!rawBp) continue;

      const outs = worldOutputsForBp(rawBp);
      let matched = false;

      for (const out of outs){
        const finalBp = normalizeBp(out?.[0]);
        const prob = Number(out?.[1] || 0);
        if (!finalBp || prob <= 0) continue;

        if (bpSet.has(finalBp)){
          groupWeight += Number(r?.[1] || 0) * prob;
          spawnMultiplier = Number(r?.[2] || 1);
          spawnLimit = Number(r?.[3] || 1);
          spawnChances = r?.[4] || "";
          matched = true;
        }
      }

      if (matched) {
        // keep scanning in case multiple rows contribute
      }
    }

    return {
      entryClass: entryName,
      groupWeight,
      spawnMultiplier,
      spawnLimit,
      spawnChances
    };
  }).filter(e => e.groupWeight > 0);

  return {
    displayName: name,
    bpPath: bps[0],
    additionalBpPathsToDisplay: bps.slice(1),
    nameTag: first?.t || "",
    fName: first?.fn || "",
    mName: first?.mn || "",
    tameable: first?.flags?.tameable,
    breedable: first?.flags?.breedable,
    tameType:  tameTypeLabelFromCode(first?.tt),
    isAlpha: first?.flags?.isAlpha,
    isBoss: first?.flags?.isBoss,
    isBossMinion: first?.flags?.isBossMinion,
    dragWeight: first?.flags?.dragWeight || 35,
    killXpBase: first?.flags?.killXpBase || 2,
    dossierIndex: (first && first.di != null) ? first.di : null,
    stats: first?.stats || null,
    attacks: first?.attacks || null,
    entries
  };
}


function renderStatsTable(statsObj) {
  if (!statsObj || typeof statsObj !== "object") {
    return `<div style="color:var(--muted)">No stats found.</div>`;
  }

  const keys = [];
  for (const k of STAT_ORDER) if (k in statsObj) keys.push(k);
  for (const k of Object.keys(statsObj)) {
    if (k.endsWith("_TBM")) continue;
    if (!keys.includes(k)) keys.push(k);
  }

  if (!keys.length) {
    return `<div style="color:var(--muted)">No stats found.</div>`;
  }

  const header = `
    <div class="statgrid">
      <div class="statgrid-head">
        <div class="statgrid-th">Stat</div>
        ${STAT_COLS.map(c => `<div class="statgrid-th num">${escapeHtml(c.label)}</div>`).join("")}
      </div>
  `;

  const rows = keys.map(statKey => {
    const label = STAT_LABEL[statKey] || statKey;
    const data = unpackStat(statsObj[statKey]);

    const cells = STAT_COLS.map(c => {
      let txt = "";

      if (c.key === "base") {
        txt = fmtBaseCell(statKey, data.base);
      }
      else if (c.key === "tm" && statKey === "Health" && statsObj.Health_TBM != null) {
        const pct = fmtStatNum(Number(statsObj.Health_TBM) * 100);
        txt = `TBHM: ${pct}%`;
      }
      else {
        const eff = computeDisplayValue(statKey, c.key, data, statsObj);

        if (eff == null) {
          txt = "";
        }
        else if (c.key === "iw") {
          txt = fmtStatNum(eff);
        }
        else if (c.key === "ta") {
          if (isMultiplierStat(statKey)) {
            txt = `${fmtStatNum(eff * 100)}%`;
          } else {
            txt = fmtStatNum(eff);
          }
        }
        else {
          txt = `${fmtStatNum(eff * 100)}%`;
        }
      }

      const muted = txt ? "" : " muted";
      return `<div class="statgrid-td num${muted}">${escapeHtml(txt || "--")}</div>`;
    }).join("");

    return `
      <div class="statgrid-row">
        <div class="statgrid-td statname">${escapeHtml(label)}</div>
        ${cells}
      </div>
    `;
  }).join("");

  return header + rows + `</div>`;
}


function renderAttacksTable(attacks){
  const rows = dedupeDisplayAttacks(attacks);

  if (!rows.length){
    return `<div style="color:var(--muted)"></div>`;
  }

  return `
    <div class="info-section" id="attackTable">
      <div class="info-subtitle">Attacks</div>
      <div class="info-subtitle-sub">(work in progress)</div>

      <div class="atkgrid">
        <div class="atkgrid-head">
          <div class="atkgrid-th">Name</div>
          <div class="atkgrid-th num">Damage</div>
          <div class="atkgrid-th num">Interval</div>
          <div class="atkgrid-th num">Stamina Cost</div>
        </div>

        ${rows.map(a => `
          <div class="atkgrid-row">
            <div class="atkgrid-td name">
              <div class="atkgrid-td atkname">${escapeHtml(a.n || "(Unnamed)")}</div>
              <div class="atkgrid-td wildonly">${a.pr ? "Wild Only" : ""}</div>
            </div>
            <div class="atkgrid-td num">${escapeHtml(a.d != null ? fmtStatNum(a.d) : "--")}</div>
            <div class="atkgrid-td num">${escapeHtml(a.i != null ? fmtStatNum(a.i) : "--")}</div>
            <div class="atkgrid-td num">${escapeHtml(a.s != null ? fmtStatNum(a.s) : "--")}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}


function entryDinoOpenKey(entryName, dinoBp){
  return `${entryName}::${dinoBp}`;
}

function isEntryDinoOpen(entryName, dinoBp){
  return entryDinoOpenState[entryDinoOpenKey(entryName, dinoBp)] ?? true;
}

function setEntryDinoOpen(entryName, dinoBp, open){
  entryDinoOpenState[entryDinoOpenKey(entryName, dinoBp)] = !!open;
}

function areAllEntryDinosOpen(entryName, dinoKeys){
  return dinoKeys.every(bp => isEntryDinoOpen(entryName, bp));
}

function renderEntryDinoBlock(dinoBp, dinoObj, rowsForThisDino, entryName){
  const displayName = dinoObj?.n || bpClass(dinoBp) || "(Unknown)";
  const isOpen = isEntryDinoOpen(entryName, dinoBp);

  const metaHtml = rowsForThisDino.map((r) => {
    const e = r.entry;
    const lines = [];
    const gw = e?.groupWeight ?? e?.group_weight;
    const chances = e?.spawnChances ?? e?.spawn_chances;
    const lim = e?.spawnLimit ?? e?.spawn_limit;
    if (gw != null) lines.push(["Entry Weight", fmt(gw)]);
    if (chances) lines.push(["Spawn Chances", String(chances)]);
    if (lim != null) lines.push(["Max % To Allow", `${fmt(Number(lim) * 100)}%`]);
    if (!lines.length) return "";
    return `
      <div class="sv-meta">
        ${lines.map(([label, val]) => `
          <div class="sv-meta-line">${escapeHtml(label)}: <b>${escapeHtml(val)}</b></div>
        `).join("")}
      </div>
    `;
  }).join("");

  return `
    <div class="sv-card ${isOpen ? "is-open" : ""}">
      <button
        type="button"
        class="sv-card-head-btn"
        data-entry-dino-toggle="${escapeAttr(dinoBp)}"
      >
        <span class="sv-card-name">${escapeHtml(displayName)}</span>
        <span class="sv-card-chev">${isOpen ? "⌄" : "›"}</span>
      </button>

      <div class="sv-card-body" style="display:${isOpen ? "" : "none"};">
        ${metaHtml}
        <button
          type="button"
          class="sv-open"
          data-open-dino="${escapeAttr(displayName)}"
        >Open in Dino View ›</button>
      </div>
    </div>
  `;
}

function renderDinoSpawnMenuRow(entry, selectedName, idx){
  const key = entryVisibilityKey(selectedName, idx);
  const checked = entryVisibility[key] ?? true;

  const metaLines = [];

  if (entry.groupWeight != null){
    metaLines.push(["Entry Weight", fmt(entry.groupWeight)]);
  }

  if (entry.spawnChances){
    metaLines.push(["Spawn Chances", entry.spawnChances]);
  }

  if (entry.spawnLimit != null){
    metaLines.push(["Max % To Allow", `${fmt(entry.spawnLimit * 100)}%`]);
  }

  const isOpen = dinoSpawnCardOpenState[key] ?? true;

  return `
    <div class="dv-entry ${checked ? "is-on" : ""} ${isOpen ? "is-open" : "is-closed"}">
      <div class="dv-entry-head">
        <button
          type="button"
          class="dv-entry-main"
          data-dino-entry-toggle="1"
          data-key="${escapeAttr(key)}"
        >
          <span class="dv-entry-name">${escapeHtml(entry.entryClass)}</span>
        </button>

        <button
          type="button"
          class="dv-entry-zoom"
          data-dino-entry-zoom="${escapeAttr(entry.entryClass)}"
          data-key="${escapeAttr(key)}"
          title="Zoom to spawn zones"
        >⌖</button>

        <button
          type="button"
          class="dv-entry-chev"
          data-dino-spawn-card-toggle="${escapeAttr(key)}"
          title="${isOpen ? "Collapse" : "Expand"}"
        >${isOpen ? "⌄" : "›"}</button>
      </div>

      ${isOpen ? `
        <div class="dv-entry-body">
          <div class="dv-entry-meta">
            ${metaLines.map(([label, val]) => `
              <div class="dv-entry-meta-line">${escapeHtml(label)}: <b>${escapeHtml(val)}</b></div>
            `).join("")}
          </div>
          <button
            type="button"
            class="dv-openspawn"
            data-open-entry="${escapeAttr(entry.entryClass)}"
          >Open in Spawn View ›</button>
        </div>
      ` : ""}
    </div>
  `;
}

function renderEntryTabDinos(entryName){
  const entryIndex = buildEntryIndexForCurrentMap();
  const rows = entryIndex?.[entryName] || [];
  if (!rows.length){
    return `<div style="color:var(--muted)">No dinos found for this spawn entry.</div>`;
  }

  const byDino = new Map();
  for (const r of rows){
    if (!byDino.has(r.dinoKey)) byDino.set(r.dinoKey, []);
    byDino.get(r.dinoKey).push(r);
  }

  const rawDinoKeys = [...byDino.keys()];

  const filteredDinoKeys = rawDinoKeys.filter(bp => {
    if (activeSourceIsOfficial()) return true;
    if (viewOptions.includeOfficialInEntryPanels) return true;
    return isBlueprintFromActiveMod(bp);
  });

  const dinoKeys = filteredDinoKeys.sort((a, b) => {
    const da = getDinoObjByBp(a);
    const db = getDinoObjByBp(b);
    const an = da?.n || a;
    const bn = db?.n || b;
    return an.localeCompare(bn);
  });

  const allOpen = areAllEntryDinosOpen(entryName, dinoKeys);
  const showOfficial = viewOptions.includeOfficialInEntryPanels;

  const officialPill = activeSourceIsOfficial() ? "" : `
    <button type="button"
      class="mod-filter-pill ${showOfficial ? "is-on" : ""}"
      data-entry-official-toggle="1"
      title="${showOfficial ? "Showing all dinos" : "Showing mod dinos only"}"
    >${showOfficial ? "Mod + official dinos" : "Mod dinos only"}</button>
  `;

  const collapseBtn = `
    <button type="button" class="loot-set-toggle-all" data-entry-dino-toggle-all="1" style="margin-left:auto;">
      ${allOpen ? "Collapse All" : "Expand All"}
    </button>
  `;

  return `
    <div class="info-section">
      <div class="mod-filter-row" style="margin-bottom:8px;">
        ${officialPill}
        ${collapseBtn}
      </div>

      <div class="entries" data-entry-dino-list="${escapeAttr(entryName)}">
        ${dinoKeys.map(dinoKey => renderEntryDinoBlock(dinoKey, getDinoObjByBp(dinoKey), byDino.get(dinoKey), entryName)).join("")}
      </div>
    </div>
  `;
}


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


function applyServerMultiplier(statKey, colKey, value) {
  if (value == null) return value;

  const mult = getStatMult(statKey, colKey);
  const n = Number(value);
  if (!Number.isFinite(n)) return null;

  return n * mult;
}


function computeDisplayValue(statKey, colKey, data, statsObj) {
  const raw = data[colKey];

  if (raw == null || raw === "") return null;

  const v = Number(raw);
  if (!Number.isFinite(v)) return null;

  if (v < 0) {
    return v;
  }

  const base = Number(data.base);
  const mult = getStatMult(statKey, colKey);
  const effectiveMult = (v < 0) ? 1 : mult;

  if (colKey === "iw") {
    if (!Number.isFinite(base)) return null;
    return base * (v * effectiveMult);
  }

  if (colKey === "it") {
    return v * effectiveMult;
  }

  if (colKey === "ta") {
    return v * effectiveMult;
  }

  if (colKey === "tm") {
    return v * effectiveMult;
  }

  return v;
}


function unpackStat(arr){
  const a = Array.isArray(arr) ? arr : [];
  return {
    base: a.length > 0 ? a[0] : null,
    iw:   a.length > 1 ? a[1] : null,
    it:   a.length > 2 ? a[2] : null,
    ta:   a.length > 3 ? a[3] : null,
    tm:   a.length > 4 ? a[4] : null,
  };
}


function fmtStatNum(v){
  if (v == null || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";

  const abs = Math.abs(n);
  if (abs > 0 && abs < 0.001) return n.toPrecision(3);

  let s = n.toFixed(6);
  s = s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  if (s === "-0") s = "0";
  return s;
}


function isMultiplierStat(statKey){
  return statKey === "MeleeDamageMultiplier"
      || statKey === "SpeedMultiplier"
      || statKey === "CraftingSpeedMultiplier";
}


function fmtBaseCell(statKey, v){
  if (isMultiplierStat(statKey)) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    return `${fmtStatNum(n * 100)}%`;
  }
  return fmtStatNum(v);
}


function cleanAttackName(name){
  return String(name || "").trim();
}


function attackNameBase(name){
  return cleanAttackName(name)
    .replace(/\s*\((ai|ai only)\)\s*$/i, "")
    .trim();
}


function attackKeyForCompare(a){
  const base = attackNameBase(a?.n);
  const dmg = Number(a?.d);
  const dmgKey = Number.isFinite(dmg) ? dmg : "__nodmg__";
  return `${base.toLowerCase()}::${dmgKey}`;
}


function isMeaninglessAttack(a){
  const name = cleanAttackName(a?.n);
  const dmg = Number(a?.d);

  const noName = !name || name.toLowerCase() === "none";
  const noDamage = !Number.isFinite(dmg) || dmg === 0;

  return noName && noDamage;
}


function normalizeAttackRow(a){
  if (!a || typeof a !== "object") return null;

  const out = {
    n: cleanAttackName(a.n),
    i: Number(a.i),
    s: Number(a.s),
    ri: Number(a.ri),
    d: Number(a.d),
    pr: a.pr === 1 || a.pr === "1" || a.pr === true ? 1 : 0
  };

  if (!Number.isFinite(out.i)) out.i = null;
  if (!Number.isFinite(out.s)) out.s = null;
  if (!Number.isFinite(out.ri)) out.ri = null;
  if (!Number.isFinite(out.d)) out.d = null;

  if (isMeaninglessAttack(out)) return null;

  return out;
}


function dedupeDisplayAttacks(attacks){
  const rows = (Array.isArray(attacks) ? attacks : [])
    .map(normalizeAttackRow)
    .filter(Boolean);

  if (!rows.length) return [];

  // If an AI-only version exists and a rider-usable version exists
  // with same base name + same damage, hide the AI-only one.
  const hasNonAiTwin = new Set();

  for (const a of rows){
    if (a.pr === 0){
      hasNonAiTwin.add(attackKeyForCompare(a));
    }
  }

  const filtered = rows.filter(a => {
    if (a.pr !== 1) return true;
    return !hasNonAiTwin.has(attackKeyForCompare(a));
  });

  // Final light dedupe in case exact duplicates still exist
  const seen = new Set();
  const out = [];

  for (const a of filtered){
    const key = [
      attackNameBase(a.n).toLowerCase(),
      a.i ?? "",
      a.s ?? "",
      a.ri ?? "",
      a.d ?? "",
      a.pr
    ].join("::");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }

  return out;
}



const DINO_PANEL_TABS = [
  { id: "spawns", label: "Spawns" },
  { id: "stats",  label: "Stats" }
];


const ARK_DEFAULT_MULT = {
  Health:  { iw: 1, it: 0.2, ta: 0.14, tm: 0.44 },
  Stamina: { iw: 1, it: 1,   ta: 1,    tm: 1 },
  Oxygen:  { iw: 1, it: 1,   ta: 1,    tm: 1 },
  Food:    { iw: 1, it: 1,   ta: 1,    tm: 1 },
  Water:   { iw: 1, it: 1,   ta: 1,    tm: 1 },
  Weight:  { iw: 1, it: 1,   ta: 1,    tm: 1 },
  MeleeDamageMultiplier:   { iw: 1, it: 0.17, ta: 0.14, tm: 0.44 },
  SpeedMultiplier:         { iw: 1, it: 1,    ta: 1,    tm: 1 },
  CraftingSpeedMultiplier: { iw: 1, it: 1,    ta: 1,    tm: 1 },
};

// Live copy of the multipliers — the Server Settings card on the Stats tab
// edits these, and the stats table recomputes from them. Resetting restores
// the ARK official defaults above.
let serverStatMult = JSON.parse(JSON.stringify(ARK_DEFAULT_MULT));
function resetServerStatMult(){
  serverStatMult = JSON.parse(JSON.stringify(ARK_DEFAULT_MULT));
}
function getStatMult(statKey, colKey){
  return serverStatMult?.[statKey]?.[colKey]
      ?? ARK_DEFAULT_MULT?.[statKey]?.[colKey]
      ?? 1;
}

// Whether the Server Settings card is expanded (persists across re-renders).
let dinoStatSettingsOpen = false;





const STAT_COLS = [
  { key: "base", label: "Base" },
  { key: "iw",   label: "Wild" },
  { key: "it",   label: "Tamed" },
  { key: "ta",   label: "Add" },
  { key: "tm",   label: "Mult" },
];




const STAT_ORDER = [
  "Health",
  "Stamina",
  "Oxygen",
  "Food",
  "Water",
  "Weight",
  "MeleeDamageMultiplier",
  "SpeedMultiplier",
  "CraftingSpeedMultiplier",
];




const STAT_LABEL = {
  Health: "Health",
  Stamina: "Stamina",
  Oxygen: "Oxygen",
  Food: "Food",
  Water: "Water",
  Weight: "Weight",
  MeleeDamageMultiplier: "Melee",
  SpeedMultiplier: "Speed",
  CraftingSpeedMultiplier: "Craft",
};
