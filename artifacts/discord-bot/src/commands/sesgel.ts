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
    StreamType,
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

  function bekle(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  export async function handleSesgel(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    if (
      !interaction.guild ||
      !(interaction.member instanceof GuildMember)
    ) {
      await interaction.reply({
        content: "❌ Sadece sunucuda kullanılabilir.",
        ephemeral: true,
      });
      return;
    }

    const member = interaction.member as GuildMember;

    const hasRole = member.roles.cache.some(
      (r) => r.name.toLowerCase() === AUTHORIZED_ROLE.toLowerCase()
    );
    if (!hasRole) {
      await interaction.reply({
        content: `❌ **${AUTHORIZED_ROLE}** rolü gerekli!`,
        ephemeral: true,
      });
      return;
    }

    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      await interaction.reply({
        content: "❌ Önce bir ses kanalına gir!",
        ephemeral: true,
      });
      return;
    }
    if (
      voiceChannel.type !== ChannelType.GuildVoice &&
      voiceChannel.type !== ChannelType.GuildStageVoice
    ) {
      await interaction.reply({
        content: "❌ Desteklenmeyen kanal türü.",
        ephemeral: true,
      });
      return;
    }

    const botMember = interaction.guild.members.me;
    if (botMember) {
      const perms = voiceChannel.permissionsFor(botMember);
      if (
        !perms?.has(PermissionsBitField.Flags.Connect) ||
        !perms?.has(PermissionsBitField.Flags.Speak)
      ) {
        await interaction.reply({
          content: "❌ Botun kanalda Bağlan/Konuş izni yok!",
          ephemeral: true,
        });
        return;
      }
    }

    const metin = interaction.options.getString("metin", true);
    await interaction.deferReply({ ephemeral: true });

    const sesBuffer = await metniSeseCevir(metin);
    if (!sesBuffer) {
      await interaction.editReply(
        "❌ Ses üretilemedi, biraz sonra tekrar dene."
      );
      return;
    }

    const mp3Path = path.join(os.tmpdir(), `sesgel_${Date.now()}.mp3`);
    fs.writeFileSync(mp3Path, sesBuffer);

    let connection;
    try {
      // Eski bağlantı varsa temizle
      const eski = getVoiceConnection(interaction.guild.id);
      if (eski) eski.destroy();

      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
        selfDeaf: false,
      });

      // Bağlantı hazır olana kadar bekle
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

      const player = createAudioPlayer();
      const resource = createAudioResource(mp3Path, {
        inputType: StreamType.Arbitrary,
      });

      connection.subscribe(player);

      // Event tabanlı bekle — entersState yerine
      const oynamaAktif = new Promise<void>((resolve, reject) => {
        // Oynatma bitince
        player.once("stateChange", (_eski, yeni) => {
          if (yeni.status === AudioPlayerStatus.Idle) resolve();
        });
        // Hata olursa
        player.once("error", (err) => reject(err));
        // Maksimum 30 saniye
        setTimeout(() => resolve(), 30_000);
      });

      player.play(resource);
      await interaction.editReply(
        `🔊 **${voiceChannel.name}** kanalında söyleniyor...`
      );

      await oynamaAktif;

      connection.destroy();
      await interaction.editReply("✅ Söylendi ve kanaldan ayrıldı!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Ses hatası:", err);
      try {
        if (connection) connection.destroy();
      } catch { /* */ }
      try {
        getVoiceConnection(interaction.guild?.id ?? "")?.destroy();
      } catch { /* */ }
      await interaction.editReply(`❌ Hata: ${msg.slice(0, 200)}`);
    } finally {
      try {
        fs.unlinkSync(mp3Path);
      } catch { /* */ }
    }
  }
  