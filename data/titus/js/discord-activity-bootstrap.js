import { DiscordSDK } from "@discord/embedded-app-sdk";

const DISCORD_CLIENT_ID = "YOUR_APP_CLIENT_ID";

const discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);

async function start() {
  await discordSdk.ready();

  // runtime info
  window.ASA_RUNTIME = {
    isDiscordActivity: true,
    discordSdk,
    launchConfig: {
      source: new URLSearchParams(window.location.search).get("source") || "",
      group: new URLSearchParams(window.location.search).get("group") || "",
      map: new URLSearchParams(window.location.search).get("map") || "",
      mode: new URLSearchParams(window.location.search).get("mode") || "",
    }
  };

  // ✅ add class AFTER DOM + Discord ready
  document.body.classList.add("discord-activity");

  // load your main app
  const script = document.createElement("script");
  script.src = "js/app.js";
  document.head.appendChild(script);
}

start().catch(err => {
  console.error("Discord Activity bootstrap failed:", err);
});