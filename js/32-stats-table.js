/* Split from app_embed.js lines 1769-1976 */

/* ============================================================
   STATS TABLE
============================================================ */
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

function applyServerMultiplier(statKey, colKey, value) {
  if (value == null) return value;

  const mult = ARK_DEFAULT_MULT?.[statKey]?.[colKey] ?? 1;
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
  const mult = ARK_DEFAULT_MULT?.[statKey]?.[colKey] ?? 1;
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
