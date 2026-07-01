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
  import * as fs from "node:fs";
  import * as os from "node:os";
  import * as path from "node:path";

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

  export async function handleSesgel(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    if (!interaction.guild || !(interaction.member instanceof GuildMember)) {
      await interaction.reply({ content: "❌ Sadece sunucuda kullanılabilir.", ephemeral: true });
      return;
    }

    const member = interaction.member as GuildMember;
    const hasRole = member.roles.cache.some(
      (r) => r.name.toLowerCase() === AUTHORIZED_ROLE.toLowerCase()
    );
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

    const sesBuffer = await metniSeseCevir(metin);
    if (!sesBuffer) {
      await interaction.editReply("❌ TTS üretilemedi.");
      return;
    }

    const mp3Path = path.join(os.tmpdir(), `sesgel_${Date.now()}.mp3`);
    fs.writeFileSync(mp3Path, sesBuffer);

    let connection;
    try {
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
      });

      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

      const resource = createAudioResource(mp3Path);
      const player = createAudioPlayer();
      player.on("error", (e) => console.error("Player hatası:", e.message));

      connection.subscribe(player);
      player.play(resource);

      await interaction.editReply(`🔊 **${voiceChannel.name}** kanalında söyleniyor...`);
      await entersState(player, AudioPlayerStatus.Idle, 60_000);

      connection.destroy();
      await interaction.editReply("✅ Söylendi ve kanaldan ayrıldı!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Ses hatası:", err);
      try { if (connection) connection.destroy(); } catch { /* */ }
      try { getVoiceConnection(interaction.guild?.id ?? "")?.destroy(); } catch { /* */ }
      await interaction.editReply(`❌ Hata: ${msg.slice(0, 200)}`);
    } finally {
      try { fs.unlinkSync(mp3Path); } catch { /* */ }
    }
  }
  