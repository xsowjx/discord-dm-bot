import { Client, Events, GatewayIntentBits, Partials, Message } from "discord.js";
  import { registerCommands } from "./deploy-commands.js";
  import { handleDmCommand } from "./commands/dm.js";
  import { handleSesgel } from "./commands/sesgel.js";
  import { registerDmLogger } from "./events/dm-logger.js";

  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error("❌ DISCORD_TOKEN ortam değişkeni tanımlı değil.");
    process.exit(1);
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  registerDmLogger(client);

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`✅ Bot hazır: ${readyClient.user.tag}`);
    await registerCommands(readyClient);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
      if (interaction.commandName === "dm") {
        await handleDmCommand(interaction);
      } else if (interaction.commandName === "sesgel") {
        await handleSesgel(interaction);
      }
    } catch (err) {
      console.error("Komut hatası:", err);
      const msg = { content: "❌ Bir hata oluştu.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg);
      } else {
        await interaction.reply(msg);
      }
    }
  });

  const SELAM_PATTERN = /^(sa|selam|selamun aleyküm|selamün aleyküm|selamun aleykum)$/i;

  client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot) return;
    const icerik = message.content.trim();

    if (SELAM_PATTERN.test(icerik)) {
      await message.reply("Aleyküm Selam hoşgeldin 🌙 Bayadır seni göremiyorum canım, özledim! Nasılsın, nerelere gittin anlat da dinleyelim 😄");
    }
  });

  client.login(token);
  