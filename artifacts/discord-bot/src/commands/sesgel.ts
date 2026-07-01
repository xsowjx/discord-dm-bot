import {
    ChatInputCommandInteraction,
    GuildMember,
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
      await interaction.reply({
        content: "❌ Önce bir **ses kanalına** girmen lazım!",
        ephemeral: true,
      });
      return;
    }

    const metin = interaction.options.getString("metin", true);
    await interaction.deferReply({ ephemeral: true });

    const sesBuffer = await metniSeseCevir(metin);
    if (!sesBuffer) {
      await interaction.editReply("❌ Ses üretilemedi, biraz sonra tekrar dene.");
      return;
    }

    const tmpDir = os.tmpdir();
    const mp3Path = path.join(tmpDir, `sesgel_${Date.now()}.mp3`);
    fs.writeFileSync(mp3Path, sesBuffer);

    try {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
      });

      await entersState(connection, VoiceConnectionStatus.Ready, 10_000);

      const player = createAudioPlayer();
      const resource = createAudioResource(mp3Path);
      connection.subscribe(player);
      player.play(resource);

      await interaction.editReply(`🔊 **${voiceChannel.name}** kanalında söyleniyor...`);

      await entersState(player, AudioPlayerStatus.Idle, 60_000);

      connection.destroy();
      await interaction.editReply("✅ Söylendi ve kanaldan ayrıldı!");
    } catch (err) {
      console.error("Ses kanalı hatası:", err);
      await interaction.editReply("❌ Ses kanalına bağlanılamadı veya bir hata oluştu.");
      const conn = getVoiceConnection(interaction.guild.id);
      if (conn) conn.destroy();
    } finally {
      try { fs.unlinkSync(mp3Path); } catch { /* yok */ }
    }
  }
  