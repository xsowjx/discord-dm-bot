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
    entersState,
    VoiceConnectionStatus,
    getVoiceConnection,
  } from "@discordjs/voice";
  import { createRequire } from "node:module";
  import * as fs from "node:fs";
  import * as os from "node:os";
  import * as path from "node:path";

  const require = createRequire(import.meta.url);
  const ffmpegStatic: string = require("ffmpeg-static");

  // @discordjs/voice ve prism-media'nın kullandığı ffmpeg path'ini override et
  process.env["FFMPEG_PATH"] = ffmpegStatic;

  const AUTHORIZED_ROLE = process.env.AUTHORIZED_ROLE ?? "Yetkili Ekibi";

  async function metniSeseCevir(metin: string): Promise<Buffer | null> {
    try {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(metin)}&tl=tr&client=tw-ob`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      });
      if (!res.ok) {
        console.error("TTS HTTP hatası:", res.status);
        return null;
      }
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      console.error("TTS fetch hatası:", e);
      return null;
    }
  }

  export async function handleSesgel(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    if (!interaction.guild || !(interaction.member instanceof GuildMember)) {
      await interaction.reply({ content: "❌ Bu komut sadece sunucularda kullanılabilir.", ephemeral: true });
      return;
    }

    const member = interaction.member as GuildMember;

    const hasRole = member.roles.cache.some(
      (r) => r.name.toLowerCase() === AUTHORIZED_ROLE.toLowerCase()
    );
    if (!hasRole) {
      await interaction.reply({
        content: `❌ Bu komutu kullanmak için **${AUTHORIZED_ROLE}** rolü gereklidir!`,
        ephemeral: true,
      });
      return;
    }

    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      await interaction.reply({ content: "❌ Önce bir **ses kanalına** girmen lazım!", ephemeral: true });
      return;
    }

    if (voiceChannel.type !== ChannelType.GuildVoice && voiceChannel.type !== ChannelType.GuildStageVoice) {
      await interaction.reply({ content: "❌ Desteklenmeyen ses kanalı türü.", ephemeral: true });
      return;
    }

    const botMember = interaction.guild.members.me;
    if (botMember) {
      const perms = voiceChannel.permissionsFor(botMember);
      if (!perms?.has(PermissionsBitField.Flags.Connect)) {
        await interaction.reply({ content: `❌ Botun **${voiceChannel.name}** kanalına **Bağlan** izni yok!`, ephemeral: true });
        return;
      }
      if (!perms?.has(PermissionsBitField.Flags.Speak)) {
        await interaction.reply({ content: `❌ Botun **${voiceChannel.name}** kanalında **Konuş** izni yok!`, ephemeral: true });
        return;
      }
    }

    const metin = interaction.options.getString("metin", true);
    await interaction.deferReply({ ephemeral: true });

    const sesBuffer = await metniSeseCevir(metin);
    if (!sesBuffer) {
      await interaction.editReply("❌ TTS ses üretilemedi.");
      return;
    }

    const tmpDir = os.tmpdir();
    const mp3Path = path.join(tmpDir, `sesgel_${Date.now()}.mp3`);
    fs.writeFileSync(mp3Path, sesBuffer);
    console.log("TTS yazıldı:", mp3Path, sesBuffer.length, "bytes");

    let connection;
    try {
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
      });

      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
      console.log("Voice bağlantısı hazır");

      // StreamType belirtmeden — @discordjs/voice kendi ffmpeg ile mp3'ü handle eder
      const resource = createAudioResource(mp3Path);
      const player = createAudioPlayer();

      player.on("error", (err) => {
        console.error("Player hatası:", err.message, err.resource?.metadata);
      });

      player.on("stateChange", (oldState, newState) => {
        console.log(`Player: ${oldState.status} → ${newState.status}`);
      });

      connection.subscribe(player);
      player.play(resource);

      console.log("Ses çalınıyor...");
      await interaction.editReply(`🔊 **${voiceChannel.name}** kanalında söyleniyor...`);

      await entersState(player, AudioPlayerStatus.Idle, 60_000);

      connection.destroy();
      await interaction.editReply("✅ Söylendi ve kanaldan ayrıldı!");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("Ses kanalı hatası:", err);
      try { if (connection) connection.destroy(); } catch { /* yok */ }
      try {
        const conn = getVoiceConnection(interaction.guild?.id ?? "");
        if (conn) conn.destroy();
      } catch { /* yok */ }
      await interaction.editReply(`❌ Hata: ${errMsg.slice(0, 200)}`);
    } finally {
      try { fs.unlinkSync(mp3Path); } catch { /* yok */ }
    }
  }
  