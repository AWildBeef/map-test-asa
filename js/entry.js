(function () {
  const isEmbedded = window.self !== window.top;
  const params = new URLSearchParams(window.location.search);
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

  document.title = isDiscordLike ? "ASA Spawn Activity" : "ASA Spawn Maps";

  if (isDiscordLike) {
    document.body.classList.add("discord-activity");
  }

  console.log("ENTRY LOADED");
  console.log("isEmbedded:", isEmbedded);
  console.log("isDiscordLike:", isDiscordLike);
  console.log("body classes:", document.body.className);

  const script = document.createElement("script");
  script.src = "js/app.js?v=4";
  document.head.appendChild(script);
})();