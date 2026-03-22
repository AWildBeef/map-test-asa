/* Auto-generated loader for modular split. */
window.ASA_APP_MODULES = [
  "js/00-config.js",
  "js/01-state.js",
  "js/03-utils.js",
  "js/20-style-panel.js",
  "js/21-map-panel.js",
  "js/22-map-entries-panel.js",
  "js/30-info-panel.js",
  "js/31-dock.js",
  "js/32-stats-table.js",
  "js/33-attacks.js",
  "js/34-entry-meta.js",
  "js/35-panel-helpers.js",
  "js/36-dino-view.js",
  "js/37-entry-view.js",
  "js/38-unified-panel.js",
  "js/40-pois.js",
  "js/41-rarity-engine.js",
  "js/42-spawn-rarity.js",
  "js/43-map-rendering.js",
  "js/44-world-replacements.js",
  "js/45-draw-entry.js",
  "js/46-draw-dino.js",
  "js/47-index-builder.js",
  "js/48-source-dropdown.js",
  "js/49-ui-setup.js",
  "js/50-render.js",
  "js/51-map-change.js",
  "js/52-boot.js",
];

(function loadAsaModules(){
  const current = document.currentScript;
  if (!current) return;
  const appPath = current.getAttribute("src") || "js/app.js";
  const base = appPath.slice(0, appPath.lastIndexOf("/") + 1);
  for (const rel of window.ASA_APP_MODULES) {
    const s = document.createElement("script");
    s.src = base + rel.replace(/^js\//, "");
    document.head.appendChild(s);
  }
})();
