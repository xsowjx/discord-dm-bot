import {
    ChatInputCommandInteraction,
    GuildMember,
    ChannelType,
  } from "discord.js";
  import {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    getVoiceConnection,
    StreamType,
    type VoiceConnection,
    type AudioPlayer,
  } from "@discordjs/voice";
  import { spawn } from "node:child_process";

  const AUTHORIZED_ROLE = process.env.AUTHORIZED_ROLE ?? "Yetkili Ekibi";

  interface GuildQueue {
    connection: VoiceConnection;
    player: AudioPlayer;
    queue: string[];
  }

  const guildQueues = new Map<string, GuildQueue>();

  function isYouTubeUrl(url: string): boolean {
    return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url);
  }

  function playNext(guildId: string): void {
    const gq = guildQueues.get(guildId);
    if (!gq) return;

    if (gq.queue.length === 0) {
      gq.connection.destroy();
      guildQueues.delete(guildId);
      return;
    }

    const url = gq.queue.shift()!;
    const proc = spawn("yt-dlp", [
      "-q",
      "-f", "bestaudio",
      "-o", "-",
      "--no-playlist",
      url,
    ]);

    proc.stderr.on("data", (d: Buffer) => console.error("yt-dlp:", d.toString()));

    const resource = createAudioResource(proc.stdout, {
      inputType: StreamType.Arbitrary,
    });
    gq.player.play(resource);
  }

  export async function handleSarkiCal(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const member = interaction.member as GuildMember;
    if (!member || !interaction.guild) {
      await interaction.reply({ content: "❌ Sadece sunucuda kullanılabilir.", ephemeral: true });
      return;
    }

    const hasRole = member.roles.cache.some(
      (r) => r.name.toLowerCase() === AUTHORIZED_ROLE.toLowerCase()
    );
    if (!hasRole) {
      await interaction.reply({ content: `❌ **${AUTHORIZED_ROLE}** rolü gerekli!`, ephemeral: true });
      return;
    }

    const voiceChannel = member.voice.channel;
    if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
      await interaction.reply({ content: "❌ Önce bir ses kanalına gir!", ephemeral: true });
      return;
    }

    const link = interaction.options.getString("link", true);
    if (!isYouTubeUrl(link)) {
      await interaction.reply({ content: "❌ Geçerli bir YouTube linki gir!", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guild.id;
    let gq = guildQueues.get(guildId);

    if (!gq) {
      // Eski bağlantı varsa temizle
      getVoiceConnection(guildId)?.destroy();

      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId,
        adapterCreator: interaction.guild.voiceAdapterCreator,
        selfDeaf: false,
      });

      try {
        await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
      } catch {
        connection.destroy();
        await interaction.editReply("❌ Ses kanalına bağlanılamadı!");
        return;
      }

      const player = createAudioPlayer();
      connection.subscribe(player);

      gq = { connection, player, queue: [] };
      guildQueues.set(guildId, gq);

      player.on("stateChange", (oldState, newState) => {
        if (
          oldState.status !== AudioPlayerStatus.Idle &&
          newState.status === AudioPlayerStatus.Idle
        ) {
          playNext(guildId);
        }
      });

      player.on("error", (err) => {
        console.error("Player hatası:", err.message);
        playNext(guildId);
      });
    }

    const isIdle = gq.player.state.status === AudioPlayerStatus.Idle;

    gq.queue.push(link);

    if (isIdle) {
      playNext(guildId);
      await interaction.editReply("🎵 Çalınıyor!");
    } else {
      await interaction.editReply("✅ Sıraya eklendi! (Sıra: " + gq.queue.length + ". sırada)");
    }
  }

  export async function handleSkip(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ content: "❌ Sadece sunucuda kullanılabilir.", ephemeral: true });
      return;
    }

    const gq = guildQueues.get(interaction.guild.id);
    if (!gq || gq.player.state.status === AudioPlayerStatus.Idle) {
      await interaction.reply({ content: "❌ Şu an çalan şarkı yok!", ephemeral: true });
      return;
    }

    gq.player.stop();
    await interaction.reply({ content: "⏭️ Atlandı!", ephemeral: true });
  }
  