window.ASA_APP_MODULES = [
  "js/00-config.js",
  "js/01-state.js",
  "js/03-utils.js",
  "js/data.js",
  "js/poi.js",
  "js/map.js",
  "js/panel.js",
  "js/ui.js",
  "js/views/dino-view.js",
  "js/views/spawn-view.js",
  "js/views/crate-view.js",
  "js/views/item-view.js",
  "js/41-rarity-engine.js",
  "js/50-render.js",
  "js/52-boot.js",
];

(function loadSequentially(i = 0) {
  if (i >= window.ASA_APP_MODULES.length) return;
  const s = document.createElement('script');
  s.src = window.ASA_APP_MODULES[i];
  s.async = false;
  s.onload = () => loadSequentially(i + 1);
  s.onerror = () => console.error('Failed to load', s.src);
  document.head.appendChild(s);
})();
