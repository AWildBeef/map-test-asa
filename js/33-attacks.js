/* Split from app_embed.js lines 1977-2109 */

/* ============================================================
   ATTACKS
============================================================ */

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
