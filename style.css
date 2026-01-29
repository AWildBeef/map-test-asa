/* ======================================================
   THEME COLORS
   Change these to reskin the entire site
====================================================== */
:root {
  --bg: #121417;                 /* page background */
  --panel: #1a1d21;              /* top bar background */
  --panel-border: #2a2f35;

  --text: #e6e6e6;
  --muted: #b8c0cc;

  --control-bg: #242a30;
  --control-border: #3a414a;
  --focus: #7aa2ff;
}

/* ======================================================
   BASE PAGE LAYOUT
====================================================== */

* {
  box-sizing: border-box;
}

html,
body {
  height: 100%;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;

  /* This makes the map auto-fill remaining space */
  display: flex;
  flex-direction: column;
}

/* ======================================================
   TOP BAR
====================================================== */

#topbar {
  background: var(--panel);
  border-bottom: 1px solid var(--panel-border);

  padding: 14px 18px 12px;

  display: flex;
  flex-direction: column;   /* title on top, controls below */
  align-items: center;
  gap: 10px;
}

/* Title text */
#topbar .title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.4px;
  color: #f2f2f2;
}

/* Container holding dropdowns */
#topbar .controls {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
}

/* ======================================================
   DROPDOWNS
====================================================== */

#topbar select {
  min-width: 220px;
  padding: 9px 12px;

  font-size: 15px;
  border-radius: 8px;

  border: 1px solid var(--control-border);
  background: var(--control-bg);
  color: #ffffff;

  outline: none;
  cursor: pointer;
}

#topbar select:hover {
  border-color: #596273;
}

#topbar select:focus {
  border-color: var(--focus);
  box-shadow: 0 0 0 3px rgba(122, 162, 255, 0.18);
}

/* Background selector label */
#bgSelectWrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;

  font-size: 12px;
  color: var(--muted);
}

#bgSelectWrap select {
  min-width: 180px;
  opacity: 0.9;
}
/* ======================================================
   MAP AREA
====================================================== */

#map {
  flex: 1;             /* THIS is the magic line */
  width: 100vw;
}