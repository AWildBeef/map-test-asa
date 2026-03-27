// js/discord-activity-bootstrap.js
import { DiscordSDK } from "@discord/embedded-app-sdk";

const DISCORD_CLIENT_ID = "YOUR_APP_CLIENT_ID";

const discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);

async function start() {
  await discordSdk.ready();

  // optional runtime info shared with the legacy app
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

  const script = document.createElement("script");
  script.src = "js/app.js";
  document.head.appendChild(script);
}

start().catch(err => {
  console.error("Discord Activity bootstrap failed:", err);
});