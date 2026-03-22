/* Split from app_embed.js lines 3356-3437 */

/* ============================================================
   RARITY ENGINE
============================================================ */

const RARITY_THRESHOLDS=[
  [0.03,"very common"],
  [0.009,"common"],
  [0.005,"uncommon"],
  [0.0009,"very uncommon"],
  [0.0001,"rare"],
  [-1,"very rare"]
];

function downshiftStepsForMinPct(pct){

  const p = Number(pct || 1);

  if(p >= 0.51) return 0;

  return 1;
}

function rarityFromWeight(w){
  for(const [t,l] of RARITY_THRESHOLDS){
    if(w>=t) return l;
  }
  return "very rare";
}

const MIN_GLOBAL_DOWNSHIFT = [
  [4,6]
];

function downshiftStepsForTotalMin(totalMin){

  const m = Number(totalMin || 0);

  if(m <= 0) return 0;

  for(const [thr,steps] of MIN_GLOBAL_DOWNSHIFT){

    if(m <= thr) return steps;
  }

  return 0;
}

const RARITY_ORDER = [
  "very common",
  "common",
  "uncommon",
  "very uncommon",
  "rare",
  "very rare"
];

function rarityToColor(r){

  r=String(r||"").toLowerCase();

  if(r.includes("very rare")) return "#ff0000";
  if(r.includes("rare")) return "#ff6600";
  if(r.includes("very uncommon")) return "#ffcc00";
  if(r.includes("uncommon")) return "#ffff00";
  if(r.includes("very common")) return "#00ff00";
  if(r.includes("common")) return "#b2ff00";

  return "#888";
}

function downgradeRarity(label,steps){

  if(!steps) return label;

  let i = RARITY_ORDER.indexOf(label);

  if(i < 0) i = RARITY_ORDER.length-1;

  const j = Math.min(RARITY_ORDER.length-1,i+steps);

  return RARITY_ORDER[j];
}
