/* Split from app_embed.js lines 4003-4224 */

/* ============================================================
   DROPDOWN
============================================================ */

function mountFancyDropdown(native,host,placeholder){

  native.style.display="none";
  host.innerHTML="";

  const wrap=document.createElement("div");
  wrap.className="dd";

  const btn=document.createElement("button");
  btn.className="dd-btn";

  const label=document.createElement("div");
  label.className="dd-label";

  const caret=document.createElement("div");
  caret.className="dd-caret";
  caret.textContent="▾";

  btn.append(label,caret);

  const panel=document.createElement("div");
  panel.className="dd-panel";

  const search=document.createElement("input");
  search.className="dd-search";
  search.placeholder=placeholder;

  const list=document.createElement("div");
  list.className="dd-list";

  panel.append(search,list);
  wrap.append(btn,panel);
  host.appendChild(wrap);

  function rebuild(){

    list.innerHTML="";

    for(const o of native.options){

      const row=document.createElement("div");

      row.className="dd-item";
      row.textContent=o.textContent;
      row.dataset.search=normSearch(o.textContent);

      row.onclick=()=>{
        native.value=o.value;
        native.dispatchEvent(new Event("change"));
        close();
      };

      list.appendChild(row);
    }
  }

  function sync(){
    label.textContent=native.selectedOptions?.[0]?.textContent||"(Select)";
  }

  function open(){
    wrap.classList.add("open");
    search.focus();
  }

  function close(){
    wrap.classList.remove("open");
  }

  btn.onclick=()=>{
    wrap.classList.contains("open")?close():open();
  };

  search.oninput=()=>{
    const q=normSearch(search.value);

    list.querySelectorAll(".dd-item").forEach(el=>{
      el.style.display=el.dataset.search.includes(q)?"":"none";
    });
  };

  document.addEventListener("pointerdown",e=>{
    if(!wrap.contains(e.target)) close();
  });

  native.addEventListener("change",sync);

  rebuild();
  sync();
}

function sourceById(id){
  return SOURCES.find(s => s.id === id) || null;
}

function normalizeMapId(raw){
  const s = String(raw || "").trim().toLowerCase();
  const hit = MAPS.find(m => m.id.toLowerCase() === s);
  return hit ? hit.id : "";
}

function allowedSourceIdsForEmbed(){
  if (!EMBED_MODE) return null;

  const allowed = new Set();

  if (EMBED_SOURCE) {
    const src = sourceById(EMBED_SOURCE);
    if (src) {
      allowed.add(src.id);

      if (src.kind === "group") {
        for (const mid of (src.members || [])) allowed.add(mid);
      }
    }
  } else if (EMBED_GROUP) {
    const groupName = EMBED_GROUP.trim().toLowerCase();

    for (const s of SOURCES){
      if (String(s.group || "").trim().toLowerCase() === groupName) {
        allowed.add(s.id);
      }
    }

    const groupSource = SOURCES.find(s =>
      s.kind === "group" &&
      String(s.group || "").trim().toLowerCase() === groupName
    );

    if (groupSource) allowed.add(groupSource.id);
  } else {
    return null;
  }

  if (EMBED_ALLOW_OFFICIAL) {
    allowed.add("official");
  }

  return allowed;
}

function allowedMapsForEmbed(){
  if (!EMBED_MODE || !EMBED_MAP) return null;

  const allowed = new Set();

  for (const raw of EMBED_MAP.split(",")) {
    const mapId = normalizeMapId(raw);
    if (mapId) allowed.add(mapId);
  }

  return allowed.size ? allowed : null;
}

function applyEmbedRestrictions(){
  if (!EMBED_MODE) return;

  if (EMBED_HIDE_TOPBAR && UI.topbar) {
    UI.topbar.style.display = "none";
  }

  const allowedSources = allowedSourceIdsForEmbed();
  if (allowedSources) {
    [...UI.sourceSelect.options].forEach(opt => {
      opt.hidden = !allowedSources.has(opt.value);
    });

    if (!allowedSources.has(UI.sourceSelect.value)) {
      const firstAllowed = [...allowedSources][0];
      if (firstAllowed) UI.sourceSelect.value = firstAllowed;
    }

    if (EMBED_SOURCE || EMBED_HIDE_SOURCE) {
      UI.sourceSelect.disabled = true;
      if (UI.sourceFancy) UI.sourceFancy.style.display = "none";
      if (UI.sourceSelect.parentElement && !EMBED_HIDE_SOURCE) {
        UI.sourceSelect.style.display = "";
      }
    }
  }

  const allowedMaps = allowedMapsForEmbed();
  if (allowedMaps) {
    [...UI.mapSelect.options].forEach(opt => {
      opt.hidden = !allowedMaps.has(opt.value);
    });

    if (!allowedMaps.has(UI.mapSelect.value)) {
      const firstAllowed = [...allowedMaps][0];
      if (firstAllowed) {
        UI.mapSelect.value = firstAllowed;
        State.mapId = firstAllowed;
      }
    }

    if (EMBED_MAP || EMBED_HIDE_MAP) {
      UI.mapSelect.disabled = true;
      if (UI.mapFancy) UI.mapFancy.style.display = "none";
      if (UI.mapSelect.parentElement && !EMBED_HIDE_MAP) {
        UI.mapSelect.style.display = "";
      }
    }
  }

  if (EMBED_MODE_LOCK) {
    const validModes = new Set(["dino", "entry"]);
    if (validModes.has(EMBED_MODE_LOCK)) {
      State.mode = EMBED_MODE_LOCK;
      syncModeButton();
    }
  }

  if (EMBED_MODE_LOCK || EMBED_HIDE_MODE) {
    if (UI.modeToggle) UI.modeToggle.disabled = true;
    if (EMBED_HIDE_MODE && UI.modeToggle) UI.modeToggle.style.display = "none";
  }
}
