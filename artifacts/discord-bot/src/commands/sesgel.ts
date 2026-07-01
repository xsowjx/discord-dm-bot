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
    } catch {
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

    // Rol kontrolü
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

    // Ses kanalı kontrolü
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      await interaction.reply({ content: "❌ Önce bir **ses kanalına** girmen lazım!", ephemeral: true });
      return;
    }

    // Kanal türü kontrolü
    if (voiceChannel.type !== ChannelType.GuildVoice && voiceChannel.type !== ChannelType.GuildStageVoice) {
      await interaction.reply({ content: "❌ Desteklenmeyen ses kanalı türü.", ephemeral: true });
      return;
    }

    // Bot izin kontrolü
    const botMember = interaction.guild.members.me;
    if (botMember) {
      const perms = voiceChannel.permissionsFor(botMember);
      if (!perms?.has(PermissionsBitField.Flags.Connect)) {
        await interaction.reply({ content: `❌ Botun **${voiceChannel.name}** kanalına bağlanma izni yok! Kanal izinlerini kontrol et.`, ephemeral: true });
        return;
      }
      if (!perms?.has(PermissionsBitField.Flags.Speak)) {
        await interaction.reply({ content: `❌ Botun **${voiceChannel.name}** kanalında konuşma izni yok! Kanal izinlerini kontrol et.`, ephemeral: true });
        return;
      }
    }

    const metin = interaction.options.getString("metin", true);
    await interaction.deferReply({ ephemeral: true });

    const sesBuffer = await metniSeseCevir(metin);
    if (!sesBuffer) {
      await interaction.editReply("❌ TTS ses üretilemedi. Biraz sonra tekrar dene.");
      return;
    }

    const tmpDir = os.tmpdir();
    const mp3Path = path.join(tmpDir, `sesgel_${Date.now()}.mp3`);
    fs.writeFileSync(mp3Path, sesBuffer);

    let connection;
    try {
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
      });

      await entersState(connection, VoiceConnectionStatus.Ready, 15_000);

      const player = createAudioPlayer();
      const resource = createAudioResource(mp3Path);
      connection.subscribe(player);
      player.play(resource);

      await interaction.editReply(`🔊 **${voiceChannel.name}** kanalında söyleniyor...`);
      await entersState(player, AudioPlayerStatus.Idle, 60_000);

      connection.destroy();
      await interaction.editReply("✅ Söylendi ve kanaldan ayrıldı!");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("Ses kanalı hatası:", err);

      try {
        if (connection) connection.destroy();
      } catch { /* yok */ }

      const conn = getVoiceConnection(interaction.guild.id);
      if (conn) conn.destroy();

      await interaction.editReply(`❌ Hata oluştu: ${errMsg.slice(0, 200)}`);
    } finally {
      try { fs.unlinkSync(mp3Path); } catch { /* yok */ }
    }
  }
  