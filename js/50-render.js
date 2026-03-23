/* Split from app_embed.js lines 4441-4464 */

/* ============================================================
   RENDER
============================================================ */

function render() {
  if (!State.selection) {
    clearDraw();
    drawPois();
    renderInfoPanelBodyEmpty();
    return;
  }
  
  if (State.mode === "dino") {
    drawDino(State.selection);
    drawPois();
  } else if (State.mode === "entry") {
    clearDraw();
    const score = entryRarityForEntry(State.selection);
    drawEntry(State.selection, score);
    drawPois();
  } else if (State.mode === "crate") {
    drawCrate(State.selection);
  } else if (State.mode === "item") {
    drawItem(State.selection);
  }
  
  renderInfoPanel();
}