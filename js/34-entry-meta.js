/* Split from app_embed.js lines 2110-2194 */

/* ============================================================
   ENTRY META / ROWS
============================================================ */

function buildEntryMetaLines(entry){
  const lines = [];

  const gw  = entry?.groupWeight ?? entry?.group_weight;
  const lim = entry?.spawnLimit ?? entry?.spawn_limit;
  const chances = entry?.spawnChances ?? entry?.spawn_chances;

  if (gw != null) lines.push(`Entry Weight: ${fmt(gw)}`);

  const chancesLine = formatSpawnChances(chances);
  if (chancesLine) lines.push(chancesLine);

  if (lim != null) lines.push(`Max % To Allow: ${fmt(Number(lim) * 100)}%`);

  return lines;
}

function renderEntryRow(entry, dinoKey, idx){
  const key = entryVisibilityKey(dinoKey, idx);
  const visible = entryVisibility[key] ?? true;

  const entryClass = entry.entryClass || entry.entry || `Entry ${idx + 1}`;
  const metaLines = buildEntryMetaLines(entry);

  return `
    <label class="entry-row">
      <input
        type="checkbox"
        data-entry-toggle="1"
        data-key="${escapeAttr(key)}"
        ${visible ? "checked" : ""}
      >
      <div class="entry-main">
        <div class="entry-name">${escapeHtml(entryClass)}</div>
        <div class="entry-meta">
          ${metaLines.map(line => `<div class="entry-meta-line">${escapeHtml(line)}</div>`).join("")}
        </div>
      </div>
    </label>
  `;
}

function renderEntryDinoBlock(dinoBp, dinoObj, rowsForThisDino){
  const displayName = dinoObj?.n || "(Unknown)";
  const bp = dinoBp || "";
  const nameTag = dinoObj?.t || "";

  const entryLinesHtml = rowsForThisDino.map((r) => {
    const e = r.entry;
    const metaLines = buildEntryMetaLines(e);

    return `
      <div class="entry-meta">
        ${metaLines.map(line => `<div class="entry-meta-line">${escapeHtml(line)}</div>`).join("")}
      </div>
    `;
  }).join("");

  return `
    <div class="info-section">
      <div class="info-row">
        <span class="info-label">${escapeHtml(displayName)}</span>
      </div>

      ${bp ? `
        <div class="info-mono copy-on-click" data-copy="${escapeAttr(bp)}">
          ${escapeHtml(bp)}
        </div>
      ` : ""}

      ${nameTag ? `
        <div class="info-mono copy-on-click" data-copy="${escapeAttr(nameTag)}">
          ${escapeHtml(nameTag)}
        </div>
      ` : ""}

      ${entryLinesHtml}
    </div>
  `;
}
