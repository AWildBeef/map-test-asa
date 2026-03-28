window.ASA_APP_MODULES = [
  "js/config-utils.js",
  "js/data.js",
  "js/poi.js",
  "js/map-panel.js",
  "js/ui.js",
  "js/views/dino-view.js",
  "js/views/spawn-view.js",
  "js/views/crate-view.js",
  "js/views/item-view.js",
  "js/render-boot.js",
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
