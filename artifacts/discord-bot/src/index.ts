import { Client, Events, GatewayIntentBits, Partials, Message, AttachmentBuilder } from "discord.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { registerCommands } from "./deploy-commands.js";
import { handleDmCommand } from "./commands/dm.js";
import { registerDmLogger } from "./events/dm-logger.js";

const execFileAsync = promisify(execFile);

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

// Arka plan müzikleri (royalty-free enstrümantal)
const MUZIK_URLS = [
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
];

// İndirilen müziği bellekte önbelleğe al
let cachedMuzikBuffer: Buffer | null = null;

async function getMuzikBuffer(): Promise<Buffer | null> {
  if (cachedMuzikBuffer) return cachedMuzikBuffer;
  for (const url of MUZIK_URLS) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      cachedMuzikBuffer = Buffer.from(await res.arrayBuffer());
      return cachedMuzikBuffer;
    } catch {
      continue;
    }
  }
  return null;
}

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

// TTS + arka plan müziğini ffmpeg ile karıştır
async function sesiMuzikleKaristir(
  ttsBuffer: Buffer,
  muzikBuffer: Buffer
): Promise<Buffer | null> {
  const tmpDir = os.tmpdir();
  const uid = Date.now();
  const ttsPath = path.join(tmpDir, `tts_${uid}.mp3`);
  const muzikPath = path.join(tmpDir, `muzik_${uid}.mp3`);
  const cikisPath = path.join(tmpDir, `siir_${uid}.mp3`);

  try {
    fs.writeFileSync(ttsPath, ttsBuffer);
    fs.writeFileSync(muzikPath, muzikBuffer);

    // Müzik sesi %25, TTS sesi %100 — TTS bitince müzik de biter
    await execFileAsync("ffmpeg", [
      "-i", ttsPath,
      "-i", muzikPath,
      "-filter_complex",
      "[1:a]volume=0.25,afade=t=out:st=0:d=3[bg];[0:a][bg]amix=inputs=2:duration=first[out]",
      "-map", "[out]",
      "-y",
      cikisPath,
    ]);

    return fs.readFileSync(cikisPath);
  } catch (err) {
    console.error("ffmpeg karıştırma hatası:", err);
    return null;
  } finally {
    for (const p of [ttsPath, muzikPath, cikisPath]) {
      try { fs.unlinkSync(p); } catch { /* zaten yoksa atla */ }
    }
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

    // TTS ve müziği paralel olarak al
    const [sesBuffer, muzikBuffer] = await Promise.all([
      metniSeseCevir(okunacakMetin),
      getMuzikBuffer(),
    ]);

    if (!sesBuffer) {
      await message.reply("❌ Ses üretilemedi, biraz sonra tekrar dene.");
      return;
    }

    let finalBuffer: Buffer | null = null;

    // Eğer müzik varsa ve ffmpeg mevcutsa karıştır
    if (muzikBuffer) {
      finalBuffer = await sesiMuzikleKaristir(sesBuffer, muzikBuffer);
    }

    // ffmpeg başarısız olursa sadece TTS'i gönder
    const gonderilecek = finalBuffer ?? sesBuffer;
    const dosyaAdi = finalBuffer ? "siir_muzikli.mp3" : "siir.mp3";

    const dosya = new AttachmentBuilder(gonderilecek, { name: dosyaAdi });
    await message.reply({
      content: `🎵 **Şiir okunuyor...**\n> ${okunacakMetin}`,
      files: [dosya],
    });
  }
});

client.login(token);
