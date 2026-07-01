import {
  AttachmentBuilder,
  ChannelType,
  Client,
  Colors,
  EmbedBuilder,
  Message,
  TextChannel,
} from "discord.js";

const LOG_CHANNEL_NAME = "bot-dm";

/** Bot'a gelen tüm DM'leri "bot dm" kanalına ilet */
export function registerDmLogger(client: Client): void {
  client.on("messageCreate", async (message: Message) => {
    // Sadece DM kanallarını dinle; bot mesajlarını yoksay
    if (message.channel.type !== ChannelType.DM) return;
    if (message.author.bot) return;

    const sender = message.author;

    // Güzel bir embed oluştur (ss görünümü)
    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setAuthor({
        name: `${sender.displayName ?? sender.username} (@${sender.username})`,
        iconURL: sender.displayAvatarURL({ size: 64 }),
      })
      .setDescription(message.content || "*[İçerik yok — medya dosyası olabilir]*")
      .setFooter({ text: `Kullanıcı ID: ${sender.id}` })
      .setTimestamp(message.createdAt);

    // Medya eklerini topla
    const attachments: AttachmentBuilder[] = [];
    let firstImage: string | null = null;

    for (const attachment of message.attachments.values()) {
      if (!firstImage && attachment.contentType?.startsWith("image/")) {
        firstImage = attachment.url;
      } else {
        // Dosyayı indir ve embed'e ekle
        try {
          const res = await fetch(attachment.url);
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.byteLength <= 24 * 1024 * 1024) {
              attachments.push(new AttachmentBuilder(buf, { name: attachment.name }));
            }
          }
        } catch {
          // İndirilemezse atla
        }
      }
    }

    // İlk resmi embed içine göm
    if (firstImage) {
      embed.setImage(firstImage);
    }

    // Tüm sunucularda "bot dm" kanalını bul ve gönder
    for (const [, guild] of client.guilds.cache) {
      const logChannel = guild.channels.cache.find(
        (ch) =>
          ch.type === ChannelType.GuildText &&
          ch.name.toLowerCase() === LOG_CHANNEL_NAME.toLowerCase()
      ) as TextChannel | undefined;

      if (!logChannel) continue;

      try {
        await logChannel.send({
          embeds: [embed],
          files: attachments,
        });
      } catch (err) {
        console.error(`"${guild.name}" → "${LOG_CHANNEL_NAME}" kanalına gönderilemedi:`, err);
      }
    }
  });
}
