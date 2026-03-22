/* Split from app_embed.js lines 722-848 */

/* ============================================================
   ~~STYLE PANEL
============================================================ */

function ensureDrawStylePanel(){
  let panel = document.getElementById("drawStylePanel");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = "drawStylePanel";
  panel.className = "floating-panel floating-panel--small";

  panel.innerHTML = `
    <div class="fp-header">
      <div class="fp-title">Draw Style</div>
      <div class="fp-actions"></div>
    </div>
    <div class="fp-body"></div>
  `;

  const actions = panel.querySelector(".fp-actions");

  const hideBtn = createIconButton(CLOSE_ICON);
  hideBtn.dataset.action = "hide";
  hideBtn.title = "Hide";
  actions.appendChild(hideBtn);

  const mapWrap = document.getElementById("mapWrap") || document.body;
  mapWrap.appendChild(panel);

  panel.style.position = "absolute";
  panel.style.right = "2px";
  panel.style.bottom = "90px";
  panel.style.zIndex = "800";
  panel.style.display = "none";
  panel.dataset.hidden = "1";

  panel.querySelector('[data-action="hide"]').onclick = () => {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
    updateDockToggles();
  };

  return panel;
}

function renderDrawStylePanel(){
  const panel = ensureDrawStylePanel();
  const body = panel.querySelector(".fp-body");
  if (!body) return;

  body.innerHTML = `
    <label class="fp-row">
      <input id="drawUseRarity" type="checkbox" ${drawStyle.useRarity ? "checked" : ""}>
      <span>Use rarity colors</span>
    </label>

    <label class="fp-row">
      <span>Color</span>
      <input id="drawColor" type="color" value="${drawStyle.color}">
    </label>

    <label class="fp-row fp-col">
      <div class="fp-row fp-between">
        <span>Opacity</span>
        <span id="drawOpacityLabel">${drawStyle.opacity.toFixed(2)}</span>
      </div>
      <input
        id="drawOpacity"
        type="range"
        min="0.05"
        max="1"
        step="0.05"
        value="${drawStyle.opacity}"
      >
    </label>
  `;

  const rarity = body.querySelector("#drawUseRarity");
  const color = body.querySelector("#drawColor");
  const opacity = body.querySelector("#drawOpacity");
  const opacityLabel = body.querySelector("#drawOpacityLabel");

  if (rarity){
    rarity.onchange = () => {
      drawStyle.useRarity = rarity.checked;
      renderDrawStylePanel();
      render();
    };
  }

  if (color){
    color.disabled = drawStyle.useRarity;
    color.style.opacity = drawStyle.useRarity ? "0.5" : "1";

    color.oninput = () => {
      drawStyle.color = color.value;
      render();
    };
  }

  if (opacity){
    opacity.oninput = () => {
      drawStyle.opacity = Number(opacity.value);
      if (opacityLabel) opacityLabel.textContent = drawStyle.opacity.toFixed(2);
      render();
    };
  }
}

function toggleDrawStylePanel(){
  const panel = ensureDrawStylePanel();
  const show = panel.style.display === "none";

  if (show){
    renderDrawStylePanel();
    panel.style.display = "";
    panel.dataset.hidden = "0";
  } else {
    panel.style.display = "none";
    panel.dataset.hidden = "1";
  }

  updateDockToggles();
}
