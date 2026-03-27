(function () {
  const params = new URLSearchParams(window.location.search);
  const isDiscordLike = true;

  window.ASA_RUNTIME = {
    isDiscordActivity: isDiscordLike,
    launchConfig: {
      source: params.get("source") || "",
      group: params.get("group") || "",
      map: params.get("map") || "",
      mode: params.get("mode") || "",
    }
  };

  document.title = "ASA Spawn Activity";
  document.body.classList.add("discord-activity");

  const script = document.createElement("script");
  script.src = "js/app.js?v=force1";
  document.head.appendChild(script);
})();