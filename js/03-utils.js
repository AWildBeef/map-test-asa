/* Split from app_embed.js lines 252-721 */

/* ============================================================
   UI
============================================================ */

const UI = {

  sourceSelect: document.getElementById("sourceSelect"),
  sourceFancy: document.getElementById("sourceSelectFancy"),
  
  mapSelect:document.getElementById("mapSelect"),
  mapFancy:document.getElementById("mapSelectFancy"),

  dinoSelect:document.getElementById("dinoSelect"),
  dinoFancy:document.getElementById("dinoSelectFancy"),

  modeToggle:document.getElementById("modeToggle"),
  controlsToggle:document.getElementById("controlsToggle"),
  topbar:document.getElementById("topbar")
};



function syncModeButton(){
  if (!UI.modeToggle) return;
  UI.modeToggle.textContent = State.mode === "dino" ? "Dino View" : "Spawn View";
}





/* ============================================================
   UTILS
============================================================ */











function activeSourceIsOfficial(){
  return !Global.modMeta;
}

function modBlueprintSet(){
  if (!Global.modMeta?.dinos) return new Set();
  return new Set(Object.keys(Global.modMeta.dinos));
}

function normSearch(s){
  return String(s||"").toLowerCase().replace(/[\s_-]/g,"");
}



function bpClass(bp){
  return String(bp||"").split(".").pop();
}










