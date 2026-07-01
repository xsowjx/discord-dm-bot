import { Client, Events, GatewayIntentBits, Partials, Message } from "discord.js";
import { registerCommands } from "./deploy-commands.js";
import { handleDmCommand } from "./commands/dm.js";
import { registerDmLogger } from "./events/dm-logger.js";

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error(
    "❌ DISCORD_TOKEN ortam değişkeni tanımlı değil. Lütfen ayarlayın."
  );
  process.exit(1);
}

// Privileged intents — Discord Developer Portal'da etkinleştirilmeli:
// Bot → Privileged Gateway Intents:
//   ✅ Server Members Intent
//   ✅ Message Content Intent
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  // DM kanallarını dinlemek için Partial gerekli
  partials: [Partials.Channel, Partials.Message],
});

// DM logger'ı kaydet (ready'den önce — mesajları kaçırma)
registerDmLogger(client);

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

// Selam algılayıcı
const SELAM_PATTERN = /^(sa|selam|selamun aleyküm|selamün aleyküm|selamun aleykum)$/i;

client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;
  if (SELAM_PATTERN.test(message.content.trim())) {
    await message.reply(
      "Aleyküm Selam hoşgeldin 🌙 Bayadır seni göremiyorum canım, özledim! Nasılsın, nerelere gittin anlat da dinleyelim 😄"
    );
  }
});

client.login(token);
