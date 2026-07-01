import { Client, Events, GatewayIntentBits } from "discord.js";
import { registerCommands } from "./deploy-commands.js";
import { handleDmCommand } from "./commands/dm.js";

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error(
    "❌ DISCORD_TOKEN ortam değişkeni tanımlı değil. Lütfen ayarlayın."
  );
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ Bot hazır: ${readyClient.user.tag}`);
  await registerCommands(readyClient);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "dm") {
    try {
      await handleDmCommand(interaction);
    } catch (err) {
      console.error("Komut hatası:", err);
      const msg = { content: "❌ Bir hata oluştu.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg);
      } else {
        await interaction.reply(msg);
      }
    }
  }
});

client.login(token);
