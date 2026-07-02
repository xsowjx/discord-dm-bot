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
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch { return null; }
  }

  export async function handleSesgel(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild || !(interaction.member instanceof GuildMember)) {
      await interaction.reply({ content: "❌ Sadece sunucuda.", ephemeral: true });
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
      await interaction.reply({ content: "❌ Önce ses kanalına gir!", ephemeral: true });
      return;
    }
    if (voiceChannel.type !== ChannelType.GuildVoice && voiceChannel.type !== ChannelType.GuildStageVoice) {
      await interaction.reply({ content: "❌ Desteklenmeyen kanal.", ephemeral: true });
      return;
    }
    const botMember = interaction.guild.members.me;
    if (botMember) {
      const perms = voiceChannel.permissionsFor(botMember);
      if (!perms?.has(PermissionsBitField.Flags.Connect) || !perms?.has(PermissionsBitField.Flags.Speak)) {
        await interaction.reply({ content: "❌ İzin yok!", ephemeral: true });
        return;
      }
    }

    const metin = interaction.options.getString("metin", true);
    await interaction.deferReply({ ephemeral: true });

    // ADIM 1
    await interaction.editReply("⏳ Adım 1: TTS alınıyor...");
    const sesBuffer = await metniSeseCevir(metin);
    if (!sesBuffer) {
      await interaction.editReply("❌ Adım 1 BAŞARISIZ: TTS üretilemedi.");
      return;
    }

    const mp3Path = path.join(os.tmpdir(), `sesgel_${Date.now()}.mp3`);
    fs.writeFileSync(mp3Path, sesBuffer);

    // ADIM 2
    await interaction.editReply(`⏳ Adım 2: TTS hazır (${sesBuffer.length} bytes). Ses kanalına bağlanıyor...`);

    let connection;
    try {
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
      });

      // ADIM 3
      await interaction.editReply("⏳ Adım 3: joinVoiceChannel tamam, Ready bekleniyor (max 30s)...");
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

      // ADIM 4
      await interaction.editReply("⏳ Adım 4: Ready! Player oluşturuluyor...");

      const resource = createAudioResource(mp3Path);
      const player = createAudioPlayer();

      player.on("error", async (e) => {
        console.error("Player hatası:", e.message);
        try { await interaction.editReply(`❌ Adım 5 PLAYER HATASI: ${e.message.slice(0,200)}`); } catch { /* */ }
      });

      player.on("stateChange", (o, n) => {
        console.log(`Player durumu: ${o.status} → ${n.status}`);
      });

      connection.subscribe(player);
      player.play(resource);

      // ADIM 5
      await interaction.editReply(`⏳ Adım 5: play() çağrıldı, Idle bekleniyor...`);
      await entersState(player, AudioPlayerStatus.Idle, 60_000);

      connection.destroy();
      await interaction.editReply("✅ Adım 6: BAŞARILI! Söylendi ve kanaldan ayrıldı.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Ses hatası:", err);
      try { if (connection) connection.destroy(); } catch { /* */ }
      try { getVoiceConnection(interaction.guild?.id ?? "")?.destroy(); } catch { /* */ }
      await interaction.editReply(`❌ HATA (son adımda): ${msg.slice(0, 300)}`);
    } finally {
      try { fs.unlinkSync(mp3Path); } catch { /* */ }
    }
  }
  