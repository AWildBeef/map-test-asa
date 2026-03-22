/* Split from app_embed.js lines 4441-4464 */

/* ============================================================
   RENDER
============================================================ */

function render(){
  if (!State.selection) {
    clearDraw();
    drawPois();
    renderInfoPanelBodyEmpty();
    return;
  }

  if (State.mode === "dino"){
    drawDino(State.selection);
  } else {
    clearDraw();
    const score = entryRarityForEntry(State.selection);
    drawEntry(State.selection, score);
  }

  drawPois();
  renderInfoPanel();
}
