import {
    ChatInputCommandInteraction,
    GuildMember,
    ChannelType,
    PermissionsBitField,
  } from "discord.js";
  import {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    StreamType,
    entersState,
    VoiceConnectionStatus,
    getVoiceConnection,
  } from "@discordjs/voice";
  import { spawn, execFile } from "node:child_process";
  import { promisify } from "node:util";
  import { createRequire } from "node:module";
  import * as fs from "node:fs";
  import * as os from "node:os";
  import * as path from "node:path";

  const require = createRequire(import.meta.url);
  const ffmpegPath: string = require("ffmpeg-static");
  const execFileAsync = promisify(execFile);

  const AUTHORIZED_ROLE = process.env.AUTHORIZED_ROLE ?? "Yetkili Ekibi";

  async function metniSeseCevir(metin: string): Promise<Buffer | null> {
    try {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(metin)}&tl=tr&client=tw-ob`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch { return null; }
  }

  async function mp3ToOgg(mp3Path: string, oggPath: string): Promise<{ ok: boolean; err: string }> {
    return new Promise((resolve) => {
      const proc = spawn(ffmpegPath, [
        "-y", "-i", mp3Path,
        "-c:a", "libopus", "-b:a", "96k", "-ar", "48000", "-ac", "2",
        "-f", "ogg", oggPath
      ], { stdio: ["ignore", "pipe", "pipe"] });

      let errOut = "";
      proc.stderr.on("data", (d: Buffer) => { errOut += d.toString(); });
      proc.on("close", (code) => {
        resolve({ ok: code === 0, err: errOut.slice(-500) });
      });
      proc.on("error", (e) => resolve({ ok: false, err: e.message }));
    });
  }

  export async function handleSesgel(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    if (!interaction.guild || !(interaction.member instanceof GuildMember)) {
      await interaction.reply({ content: "❌ Sadece sunucuda kullanılabilir.", ephemeral: true });
      return;
    }

    const member = interaction.member as GuildMember;
    const hasRole = member.roles.cache.some(r => r.name.toLowerCase() === AUTHORIZED_ROLE.toLowerCase());
    if (!hasRole) {
      await interaction.reply({ content: `❌ **${AUTHORIZED_ROLE}** rolü gerekli!`, ephemeral: true });
      return;
    }

    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      await interaction.reply({ content: "❌ Önce bir ses kanalına gir!", ephemeral: true });
      return;
    }
    if (voiceChannel.type !== ChannelType.GuildVoice && voiceChannel.type !== ChannelType.GuildStageVoice) {
      await interaction.reply({ content: "❌ Desteklenmeyen kanal türü.", ephemeral: true });
      return;
    }
    const botMember = interaction.guild.members.me;
    if (botMember) {
      const perms = voiceChannel.permissionsFor(botMember);
      if (!perms?.has(PermissionsBitField.Flags.Connect) || !perms?.has(PermissionsBitField.Flags.Speak)) {
        await interaction.reply({ content: "❌ Botun kanalda Bağlan/Konuş izni yok!", ephemeral: true });
        return;
      }
    }

    const metin = interaction.options.getString("metin", true);
    await interaction.deferReply({ ephemeral: true });

    // 1. TTS
    const sesBuffer = await metniSeseCevir(metin);
    if (!sesBuffer) {
      await interaction.editReply("❌ TTS üretilemedi.");
      return;
    }

    const tmpDir = os.tmpdir();
    const uid = Date.now();
    const mp3Path = path.join(tmpDir, `sg_${uid}.mp3`);
    const oggPath = path.join(tmpDir, `sg_${uid}.ogg`);
    fs.writeFileSync(mp3Path, sesBuffer);

    // 2. ffmpeg dönüşümünü dosyaya yap — daha güvenilir stream yerine
    const { ok, err: ffmpegErr } = await mp3ToOgg(mp3Path, oggPath);

    if (!ok || !fs.existsSync(oggPath) || fs.statSync(oggPath).size === 0) {
      await interaction.editReply(
        `❌ ffmpeg hatası (path: ${ffmpegPath})\n\`\`\`\n${ffmpegErr.slice(-300)}\n\`\`\``
      );
      try { fs.unlinkSync(mp3Path); } catch { /* */ }
      return;
    }

    let connection;
    try {
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
      });

      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

      // Dosyadan OGG/Opus oku — stream değil, daha stabil
      const resource = createAudioResource(fs.createReadStream(oggPath), {
        inputType: StreamType.OggOpus,
      });

      const player = createAudioPlayer();
      player.on("error", (e) => console.error("Player hatası:", e.message));
      player.on("stateChange", (o, n) => console.log(`Player: ${o.status} → ${n.status}`));

      connection.subscribe(player);
      player.play(resource);

      await interaction.editReply(`🔊 **${voiceChannel.name}** kanalında söyleniyor...`);
      await entersState(player, AudioPlayerStatus.Idle, 60_000);

      connection.destroy();
      await interaction.editReply("✅ Söylendi ve kanaldan ayrıldı!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Ses kanalı hatası:", err);
      try { if (connection) connection.destroy(); } catch { /* */ }
      try { getVoiceConnection(interaction.guild?.id ?? "")?.destroy(); } catch { /* */ }
      await interaction.editReply(`❌ Ses hatası: ${msg.slice(0, 200)}`);
    } finally {
      for (const p of [mp3Path, oggPath]) {
        try { fs.unlinkSync(p); } catch { /* */ }
      }
    }
  }
  