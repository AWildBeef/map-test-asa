/* Split from app_embed.js lines 2771-2787 */

/* ============================================================
   UNIFIED PANEL RENDER
============================================================ */

function renderInfoPanel(){
  if (!State.selection){
    renderInfoPanelBodyEmpty();
    return;
  }

  if (State.mode === "dino"){
    renderDinoPanel(State.selection);
  } else {
    renderEntryPanel(State.selection);
  }
}
