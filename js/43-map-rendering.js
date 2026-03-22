/* Split from app_embed.js lines 3593-3667 */

/* ============================================================
   MAP RENDERING
============================================================ */

let mapObj = null;

function initMap(img,size=[2048,2048]){

  const bounds = [[0,0],[size[1],size[0]]];
  const paddedBounds = L.latLngBounds(bounds).pad(0.1);


  const map = L.map("map", {
    crs: L.CRS.Simple,
    minZoom: -3,
    maxZoom: 2,
    zoomSnap: 0.25,
    zoomDelta: 0.25,
    wheelPxPerZoomLevel: 120,
    zoomControl: false,
    maxBounds: paddedBounds,
    maxBoundsViscosity: 0.6,
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false
  });
  
  L.control.zoom({ position: "bottomleft" }).addTo(map);

  setTimeout(() => {
    document.querySelector(".leaflet-control-zoom")?.classList.add("zoom-horizontal");
  }, 0);

  // panes
  map.createPane("spawnPane");
  map.createPane("poiPane");

  map.getPane("spawnPane").style.zIndex = 410;
  map.getPane("poiPane").style.zIndex = 620;
  map.getPane("tooltipPane").style.zIndex = 900;

  const overlay = L.imageOverlay(img, bounds).addTo(map);

  const layer = L.layerGroup().addTo(map);
  const poiLayer = L.layerGroup().addTo(map);

  map.fitBounds(bounds, {
    paddingTopLeft: [6, 6],
    paddingBottomRight: [6, 20]
  });

  return { map, overlay, layer, poiLayer, bounds };
}

function clearDraw(){
  mapObj?.layer.clearLayers();
}

function styleForEntry(meta, color){
  const finalColor = drawStyle.useRarity ? color : drawStyle.color;
  const finalOpacity = Number.isFinite(drawStyle.opacity) ? drawStyle.opacity : 0.8;

  const style = {
    color: finalColor,
    weight: meta?.isCave ? 3 : 1,
    opacity: 1,
    fillColor: finalColor,
    fillOpacity: meta?.isCave ? Math.min(finalOpacity * 0.4, 0.8) : finalOpacity
  };

  if (meta?.isUntameable) style.dashArray = "3 3";

  return style;
}
