(function () {
  const isEmbedded = window.self !== window.top;
  const params = new URLSearchParams(window.location.search);

  // Optional manual override for testing:
  // ?discord=1
  const isDiscordLike = isEmbedded || params.get("discord") === "1";

  window.ASA_RUNTIME = {
    isDiscordActivity: isDiscordLike,
    launchConfig: {
      source: params.get("source") || "",
      group: params.get("group") || "",
      map: params.get("map") || "",
      mode: params.get("mode") || "",
    }
  };

  if (isDiscordLike) {
    document.body.classList.add("discord-activity");
    document.title = "ASA Spawn Activity";
  }

  const script = document.createElement("script");
  script.src = "js/app.js";
  document.head.appendChild(script);
})();