import { Client, Events, GatewayIntentBits, Partials, Message, AttachmentBuilder } from "discord.js";
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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
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

// Hazır şiirler (bot kendi okuyacağında)
const SIIRLER = [
  "Yağmur yağar taş üstüne, taş ezilmez ama ıslanır. Sevgi böyle bir şeydir, görmezsin ama hissedersin.",
  "Gece yarısı bir mum gibi, sessizce yanarım. Kimseler görmez ama ışığım hep seninledir.",
  "Dağlar kadar büyük hayallerim var, denizler kadar derin sevdam. Ama en güzel şey, seni her gün yeniden bulmak.",
  "Bahar gelir çiçek açar, kış gelir solar gider. Ama kalpte bıraktığın iz, hiçbir mevsimde silinmez.",
  "Sözcükler bazen yetmez, bazen bir bakış her şeyi anlatır. Sen de öylesin, gözlerin konuşur, kalbim dinler.",
];

// TTS ses dosyası üret (Google Translate)
async function metniSeseCevir(metin: string): Promise<Buffer | null> {
  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(metin)}&tl=tr&client=tw-ob`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
      },
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

// Selam algılayıcı
const SELAM_PATTERN = /^(sa|selam|selamun aleyküm|selamün aleyküm|selamun aleykum)$/i;

// Şiir oku algılayıcı
// "şiir oku" → bot kendi şiirini okur
// "şiir oku: [metin]" → verilen metni okur
const SIIR_PATTERN = /^şiir oku(?:\s*[:\-]\s*(.+))?$/is;

client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;

  const icerik = message.content.trim();

  // Selam kontrolü
  if (SELAM_PATTERN.test(icerik)) {
    await message.reply(
      "Aleyküm Selam hoşgeldin 🌙 Bayadır seni göremiyorum canım, özledim! Nasılsın, nerelere gittin anlat da dinleyelim 😄"
    );
    return;
  }

  // Şiir oku kontrolü
  const siirEslesmesi = icerik.match(SIIR_PATTERN);
  if (siirEslesmesi) {
    const okunacakMetin =
      siirEslesmesi[1]?.trim() ||
      SIIRLER[Math.floor(Math.random() * SIIRLER.length)];

    await message.channel.sendTyping();

    const sesBuffer = await metniSeseCevir(okunacakMetin);

    if (!sesBuffer) {
      await message.reply("❌ Ses üretilemedi, biraz sonra tekrar dene.");
      return;
    }

    const dosya = new AttachmentBuilder(sesBuffer, { name: "siir.mp3" });
    await message.reply({
      content: `🎙️ **Şiir okunuyor...**\n> ${okunacakMetin}`,
      files: [dosya],
    });
  }
});

client.login(token);
