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
    console.error("❌ DISCORD_TOKEN ortam değişkeni tanımlı değil.");
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

  // Hazır şiirler
  const SIIRLER = [
    "Yağmur yağar taş üstüne, taş ezilmez ama ıslanır. Sevgi böyle bir şeydir, görmezsin ama hissedersin.",
    "Gece yarısı bir mum gibi, sessizce yanarım. Kimseler görmez ama ışığım hep seninledir.",
    "Dağlar kadar büyük hayallerim var, denizler kadar derin sevdam. Ama en güzel şey, seni her gün yeniden bulmak.",
    "Bahar gelir çiçek açar, kış gelir solar gider. Ama kalpte bıraktığın iz, hiçbir mevsimde silinmez.",
    "Sözcükler bazen yetmez, bazen bir bakış her şeyi anlatır. Sen de öylesin, gözlerin konuşur, kalbim dinler.",
  ];

  // Yedek arka plan müzikleri (royalty-free)
  const MUZIK_URLS = [
    "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3",
    "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
  ];

  let cachedMuzikBuffer: Buffer | null = null;

  async function getMuzikBuffer(ozelUrl?: string): Promise<Buffer | null> {
    // Kullanıcı kendi URL'sini verdiyse onu indir
    if (ozelUrl) {
      try {
        const res = await fetch(ozelUrl, { signal: AbortSignal.timeout(10_000) });
        if (res.ok) return Buffer.from(await res.arrayBuffer());
      } catch {
        // Başarısız → varsayılan müziğe geç
      }
    }

    // Önbellek varsa kullan
    if (cachedMuzikBuffer) return cachedMuzikBuffer;

    // Varsayılan müzikleri dene
    for (const url of MUZIK_URLS) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
        if (!res.ok) continue;
        cachedMuzikBuffer = Buffer.from(await res.arrayBuffer());
        return cachedMuzikBuffer;
      } catch {
        continue;
      }
    }
    return null;
  }

  // Google TTS
  async function metniSeseCevir(metin: string): Promise<Buffer | null> {
    try {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(metin)}&tl=tr&client=tw-ob`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  // ffmpeg ile TTS + müzik karıştır
  async function sesiMuzikleKaristir(ttsBuffer: Buffer, muzikBuffer: Buffer): Promise<Buffer | null> {
    const tmpDir = os.tmpdir();
    const uid = Date.now();
    const ttsPath = path.join(tmpDir, `tts_${uid}.mp3`);
    const muzikPath = path.join(tmpDir, `muzik_${uid}.mp3`);
    const cikisPath = path.join(tmpDir, `siir_${uid}.mp3`);

    try {
      fs.writeFileSync(ttsPath, ttsBuffer);
      fs.writeFileSync(muzikPath, muzikBuffer);

      await execFileAsync("ffmpeg", [
        "-i", ttsPath,
        "-i", muzikPath,
        "-filter_complex", "[1:a]volume=0.2[bg];[0:a][bg]amix=inputs=2:duration=first[out]",
        "-map", "[out]",
        "-codec:a", "libmp3lame",
        "-q:a", "4",
        "-y", cikisPath,
      ]);

      return fs.readFileSync(cikisPath);
    } catch (err) {
      console.error("ffmpeg hatası:", err);
      return null;
    } finally {
      for (const p of [ttsPath, muzikPath, cikisPath]) {
        try { fs.unlinkSync(p); } catch { /* yok, atla */ }
      }
    }
  }

  // Metinden URL'leri ayıkla
  const URL_REGEX = /https?://[^s]+/gi;
  function metindenUrlAyir(girdi: string): { metin: string; url: string | null } {
    const eslesmeler = girdi.match(URL_REGEX);
    const temizMetin = girdi.replace(URL_REGEX, "").trim();
    return { metin: temizMetin, url: eslesmeler?.[0] ?? null };
  }

  // Selam algılayıcı
  const SELAM_PATTERN = /^(sa|selam|selamun aleyküm|selamün aleyküm|selamun aleykum)$/i;

  // Şiir oku: "şiir oku", "şiir oku: metin", "şiir oku metin", "şiir oku metin url"
  const SIIR_PATTERN = /^şiir oku(?:(?:\s*[:\-]\s*|\s+)(.+))?$/is;

  client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot) return;

    const icerik = message.content.trim();

    if (SELAM_PATTERN.test(icerik)) {
      await message.reply("Aleyküm Selam hoşgeldin 🌙 Bayadır seni göremiyorum canım, özledim! Nasılsın, nerelere gittin anlat da dinleyelim 😄");
      return;
    }

    const siirEslesmesi = icerik.match(SIIR_PATTERN);
    if (siirEslesmesi) {
      const hamGirdi = siirEslesmesi[1]?.trim() ?? "";

      // URL varsa ayır, metni temizle
      const { metin: ayrikMetin, url: muzikUrl } = hamGirdi ? metindenUrlAyir(hamGirdi) : { metin: "", url: null };

      // Okunacak metin: URL'siz temiz metin veya rastgele şiir
      const okunacakMetin = ayrikMetin || SIIRLER[Math.floor(Math.random() * SIIRLER.length)];

      await message.channel.sendTyping();

      // TTS ve müziği paralel al
      const [sesBuffer, muzikBuffer] = await Promise.all([
        metniSeseCevir(okunacakMetin),
        getMuzikBuffer(muzikUrl ?? undefined),
      ]);

      if (!sesBuffer) {
        await message.reply("❌ Ses üretilemedi, biraz sonra tekrar dene.");
        return;
      }

      let finalBuffer: Buffer | null = null;
      if (muzikBuffer) {
        finalBuffer = await sesiMuzikleKaristir(sesBuffer, muzikBuffer);
      }

      const gonderilecek = finalBuffer ?? sesBuffer;
      const dosyaAdi = finalBuffer ? "siir_muzikli.mp3" : "siir.mp3";
      const ikon = finalBuffer ? "🎵" : "🎙️";

      const dosya = new AttachmentBuilder(gonderilecek, { name: dosyaAdi });
      await message.reply({
        content: `${ikon} **Şiir okunuyor...**\n> ${okunacakMetin}`,
        files: [dosya],
      });
    }
  });

  client.login(token);
  