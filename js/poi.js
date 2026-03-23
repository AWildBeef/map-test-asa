

function hordeTooltipHtml(point, legend){
  const groups = buildHordeGroups(point, legend);

  const pointType = hordeTypeLabel(point?.t);
  const pointDiff = point?.d != null ? hordeDifficultyLabel(point.d) : "";

  if (!groups.length){
    return `
      <div class="poi-tip-block">
        <div class="poi-tip-title">${escapeHtml(pointType)}</div>
        ${pointDiff ? `<div class="poi-tip-line">${escapeHtml(`Max: ${pointDiff}`)}</div>` : ""}
      </div>
    `;
  }

  return `
    <div class="poi-tip-block">
      <div class="poi-tip-title">${escapeHtml(pointType)}</div>
      ${pointDiff ? `<div class="poi-tip-line">${escapeHtml(`Max Difficulty: ${pointDiff}`)}</div>` : ""}
      <div class="poi-tip-lines">
        ${groups.map(g => `
          <div class="poi-tip-line">${escapeHtml(`${g.name} • ${g.difficulty}`)}</div>
        `).join("")}
      </div>
    </div>
  `;
}


function hordeMarkerColor(point){
  const t = String(point?.t || "");

  if (t.includes("NewEnumerator1")) return "#7dff7a"; // nodes
  if (t.includes("NewEnumerator2")) return "#ff66cc"; // both
  return "#ffd54a"; // osd
}

function addHordeMarkers(points, { layer = mapObj?.poiLayer } = {}) {
  if (!layer || !Array.isArray(points)) return;

  const legend = hordeLegendForCurrentMap();

  for (const p of points){
    const x = Number(p?.x);
    const y = Number(p?.y);
    if (![x, y].every(Number.isFinite)) continue;

    const fillColor = hordeMarkerColor(p);

    L.circleMarker([y, x], {
      radius: 6,
      color: "#111",
      weight: 2.2,
      fillColor,
      fillOpacity: 0.95,
      pane: "poiPane",
      className: "poi-horde"
    })
      .addTo(layer)
      .bindTooltip(hordeTooltipHtml(p, legend), {
        direction: "auto",
        sticky: true,
        opacity: 0.97,
        className: "horde-tooltip",
        autoPan: true
      });
  }
}

function drawHordePois(points){
  if (!mapObj?.poiLayer || !Array.isArray(points)) return;
  if (!poiVisibility.hordeEvents) return;

  addHordeMarkers(points, { layer: mapObj.poiLayer });
}


function supplyCrateTooltipHtml(p, legend){
  const crateRows = Array.isArray(p?.c) ? p.c : [];
  const sourceIds = Array.isArray(p?.s) ? p.s : [];

  const crateLines = crateRows.length
    ? crateRows.map(row => {
        if (!Array.isArray(row) || row.length < 1) return "";

        const idx = Number(row[0]);
        const weight = row[1];

        const meta = Number.isInteger(idx) && idx >= 0 && idx < legend.length
          ? legend[idx]
          : null;

        const bp = meta?.bp || "";
        const name = meta?.n || shortBpName(bp) || "Supply Crate";

        const w = Number(weight);
        const suffix = Number.isFinite(w) ? ` (${fmt(w)})` : "";

        return `<div class="poi-tip-line">${escapeHtml(name + suffix)}</div>`;
      }).filter(Boolean).join("")
    : `<div class="poi-tip-line">No crates listed</div>`;

  const sourceBlock = sourceIds.length
    ? `
      <div class="poi-tip-subtitle">Sources</div>
      ${sourceIds.map(rawIdx => {
        const idx = Number(rawIdx);
        const meta = Number.isInteger(idx) && idx >= 0 && idx < legend.length
          ? legend[idx]
          : null;

        const name = meta?.n || meta?.bp || `Source ${idx}`;
        return `<div class="poi-tip-line poi-tip-bp">${escapeHtml(name)}</div>`;
      }).join("")}
    `
    : "";

  return `
    <div class="poi-tip-block">
      <div class="poi-tip-title">Supply Drops</div>
      ${crateLines}
    </div>
  `;
}


function drawSupplyCratePois(points) {
  if (!mapObj?.poiLayer || !Array.isArray(points)) return;
  if (!poiVisibility.supplyCrates) return;

  addSupplyCrateMarkers(points, { layer: mapObj.poiLayer });
}


function missionTooltipHtml(point, legend){
  const groups = buildMissionGroups(point, legend);

  if (!groups.length){
    return `<div class="poi-tip-title">Mission</div>`;
  }

  return groups.map(g => `
    <div class="poi-tip-block">
      <div class="poi-tip-title">${escapeHtml(g.name)}</div>
      <div class="poi-tip-lines">
        ${g.variants.map(v => `
          <div class="poi-tip-line">${escapeHtml(missionVariantLine(v, v.w))}</div>
        `).join("")}
      </div>
    </div>
  `).join("");
}


function missionMarkerColor(point, legend){
  const groups = buildMissionGroups(point, legend);
  const first = groups[0]?.variants?.[0];

  const kind = String(first?.k || "").toLowerCase();

  if (kind.includes("attack")) return "#ff8a3d";
  if (kind.includes("defense")) return "#4db6ff";
  if (kind.includes("resource")) return "#7dff7a";

  return "#ff66cc";
}

function addMissionMarkers(points, { layer = mapObj?.poiLayer } = {}) {
  if (!layer || !Array.isArray(points)) return;

  const legend = missionLegendForCurrentMap();

  for (const p of points){
    const x = Number(p?.x);
    const y = Number(p?.y);
    if (![x, y].every(Number.isFinite)) continue;

    const fillColor = missionMarkerColor(p, legend);

    L.circleMarker([y, x], {
      radius: 6,
      color: "#111",
      weight: 2.2,
      fillColor,
      fillOpacity: 0.95,
      pane: "poiPane",
      className: "poi-mission"
    })
      .addTo(layer)
      .bindTooltip(missionTooltipHtml(p, legend), {
        direction: "auto",
        sticky: true,
        opacity: 0.97,
        className: "mission-tooltip",
        autoPan: true
      });
  }
}

function drawMissionPois(points){
  if (!mapObj?.poiLayer || !Array.isArray(points)) return;
  if (!poiVisibility.missions) return;

  addMissionMarkers(points, { layer: mapObj.poiLayer });
}


function poiCount(v){
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === "object") return Object.keys(v).length;
  return 0;
}


function poiRadius(type){
  const t = String(type || "").toLowerCase();

  if (t.includes("cityterminal")) return 4;
  if (t.includes("beacon")) return 3;

  if (t.includes("blue")) return 7;
  if (t.includes("green")) return 7;
  if (t.includes("red")) return 7;

  if (t.includes("tek") || t.includes("titan")) return 15;

  return 6;
}


function poiColor(type){
  const t = String(type || "").toLowerCase();
  
  if (t.includes("cityterminal")) return "#4db6ff";
  if (t.includes("beacon")) return "#ff8a3d";

  if (t.includes("blue")) return "#4da3ff";
  if (t.includes("green")) return "#5cff6b";
  if (t.includes("red")) return "#ff4d4d";
  if (t.includes("corrupt")) return "#555bcf";
  if (t.includes("tek") || t.includes("titan")) return "#b388ff";

  return "#ffffff";
}


function clearPois(){
  mapObj?.poiLayer?.clearLayers();
}


function drawPoiGroup(points, groupName){
  if (!mapObj?.poiLayer || !Array.isArray(points)) return;
  if (!poiVisibility[groupName]) return;

  for (const p of points){
    const x = Number(p?.x);
    const y = Number(p?.y);
    if (![x, y].every(Number.isFinite)) continue;

    const color = poiColor(p.type);
    const type = String(p.type || "").toLowerCase();
    const tooltipHtml =
      groupName === "supplyCrates"
        ? supplyCrateTooltipHtml(p)
        : (p.label || p.type || "POI");

    // TEK terminals get the special icon
    if (type.includes("tek") || type.includes("titan")) {

      const icon = makeTerminalIcon(type);

      const marker = L.marker([y, x], { 
        icon,
        pane: "poiPane"
      })
        .addTo(mapObj.poiLayer)
        .bindTooltip(tooltipHtml, {
          direction: "auto",
          sticky: true,
          opacity: 0.97,
          className: "basic-tooltip",
          autoPan: true
        });

      marker.getElement()?.style.setProperty("color", color);
      continue;
    }

    // Everything else = circle markers (red/blue/green obelisks)
    L.circleMarker([y, x], {
      radius: poiRadius(type),
      color: "#111",
      weight: 1,
      fillColor: color,
      fillOpacity: 0.95,
      pane: "poiPane",
      className:"poi-basic"
    })
      .addTo(mapObj.poiLayer)
      .bindTooltip(p.label || p.type || "POI");
  }
}


function drawPois(){
  clearPois();

  const mapMeta = MAPS.find(m => m.id === State.mapId);
  const geom = Global.mapGeom.get(mapMeta?.geomShort);
  if (!geom?.pois) return;

  drawPoiGroup(geom.pois.tributeTerminals, "tributeTerminals");
  drawSupplyCratePois(geom.pois.supplyCrates || []);
  drawPlayerStarts(geom.pois.playerStarts);
  drawPoiGroup(geom.pois.explorerNotes, "explorerNotes");
  drawMissionPois(geom.pois.missions || []);
  drawHordePois(geom.pois.hordeEvents || []);
  drawPoiGroup(geom.pois.cityTerminals, "cityTerminals");
  drawPoiGroup(geom.pois.beacons, "beacons");
}


function anyPoisVisible(){
  return Object.values(poiVisibility).some(Boolean);
}


function hordeDifficultyLabel(d){
  const n = Number(d);

  if (n === 1) return "Gamma";
  if (n === 2) return "Beta";
  if (n === 3) return "Alpha";
  if (n === 4) return "Legendary";

  return `Difficulty ${d}`;
}


function hordeTypeLabel(t){
  const s = String(t || "");

  if (s.includes("NewEnumerator0")) return "OSD";
  if (s.includes("NewEnumerator1")) return "Element Node";
  if (s.includes("NewEnumerator2")) return "OSD / Element Node";

  return "Horde Event";
}


function crateShortName(bp){
  const s = String(bp || "");
  const cls = s.split(".").pop() || s;
  return cls.replace(/_C$/, "");
}


function shortBpName(bp){
  const s = String(bp || "").trim();
  if (!s) return "";

  const last = s.split("/").pop() || s;
  return last.split(".")[0] || last;
}


function fmtWeightShort(v){
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return fmt(n);
}


function missionVariantLine(meta, weight){
  const parts = [];

  if (meta?.k) parts.push(meta.k);
  if (meta?.s) parts.push(meta.s);
  if (meta?.d) parts.push(meta.d);

  let line = parts.join(" • ");
  if (!line) line = "Mission Variant";

  const w = fmtWeightShort(weight);
  if (w) line += ` (${w})`;

  return line;
}


function cssEscape(s){
  return String(s || "").toLowerCase().replace(/[^a-z0-9_-]/g,"");
}


function makeTerminalIcon(type){
  const cls = cssEscape(type);

  const size = 45;

  return L.divIcon({
    className: `poi-icon poi-${cls}`,
    html: `
      <svg width="${size}" height="${size}" viewBox="-10 -12 20 26">

        <!-- white frame -->
        <path d="M -3 0 L 0 -8 L 3 0 L 0 5 Z"
              fill="black"
              stroke="white"
              stroke-width="0.5"
              opacity="0.95"/>

        <!-- inner core -->
        <path class="poi-fill"
              d="M -2 0 L 0 -6 L 2 0 L 0 3.5 Z"
              fill="currentColor"
              opacity="0.9"/>
      </svg>
    `,
    iconSize:[size,size],
    iconAnchor:[size/2,size*0.58333]
  });
}
