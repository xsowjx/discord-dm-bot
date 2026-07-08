import { Client, Events, GatewayIntentBits, Partials, Message } from "discord.js";
import { registerCommands } from "./deploy-commands.js";
import { handleDmCommand } from "./commands/dm.js";
import { registerInviteLogger } from "./events/invite-logger.js";
import { registerDmLogger } from "./events/dm-logger.js";
import { handleKayitCommand } from "./commands/kayit.js";
import { handleRolVerCommand } from "./commands/rolver.js";
import { handleRolAlCommand } from "./commands/rolal.js";
import { handleKayitGorCommand } from "./commands/kayitgor.js";
import { handleKayitSifirlaCommand } from "./commands/kayitsifirla.js";
import { handleKayitsizAlCommand } from "./commands/kayitsizal.js";
import {
  handleTicketPanelCommand,
  handleTicketOpenButton,
  handleTicketCloseButton,
  handleTicketClaimButton,
  TICKET_OPEN_ID,
  TICKET_CLOSE_PREFIX,
  TICKET_CLAIM_ID,
} from "./commands/ticket.js";

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
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

registerDmLogger(client);
registerInviteLogger(client);
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ Bot hazır: ${readyClient.user.tag}`);
  await registerCommands(readyClient);
});

client.on(Events.GuildCreate, async (guild) => {
  console.log(`➕ Yeni/tekrar katılınan sunucu: ${guild.name} — komutlar kaydediliyor.`);
  if (client.isReady()) {
    await registerCommands(client);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "dm") {
        await handleDmCommand(interaction);
      } else if (interaction.commandName === "k") {
        await handleKayitCommand(interaction);
      } else if (interaction.commandName === "rolver") {
        await handleRolVerCommand(interaction);
      } else if (interaction.commandName === "rolal") {
        await handleRolAlCommand(interaction);
      } else if (interaction.commandName === "kayıtgör") {
        await handleKayitGorCommand(interaction);
      } else if (interaction.commandName === "kayıtsıfırla") {
        await handleKayitSifirlaCommand(interaction);
      } else if (interaction.commandName === "kayıtsızal") {
        await handleKayitsizAlCommand(interaction);
      } else if (interaction.commandName === "ticketpanel") {
        await handleTicketPanelCommand(interaction);
      }
    } else if (interaction.isButton()) {
      if (interaction.customId === TICKET_OPEN_ID) {
        await handleTicketOpenButton(interaction);
      } else if (interaction.customId === TICKET_CLAIM_ID) {
        await handleTicketClaimButton(interaction);
      } else if (interaction.customId.startsWith(TICKET_CLOSE_PREFIX)) {
        await handleTicketCloseButton(interaction);
      }
    }
  } catch (err) {
    console.error("Etkileşim hatası:", err);
    const msg = { content: "❌ Bir hata oluştu.", ephemeral: true };
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg);
      } else {
        await interaction.reply(msg);
      }
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
