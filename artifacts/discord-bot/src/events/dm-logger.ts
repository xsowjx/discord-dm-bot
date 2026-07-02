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

export function registerDmLogger(client: Client): void {
  client.on("messageCreate", async (message: Message) => {
    if (message.channel.type !== ChannelType.DM) return;
    if (message.author.bot) return;

    const sender = message.author;

    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setAuthor({
        name: `${sender.displayName ?? sender.username} (@${sender.username})`,
        iconURL: sender.displayAvatarURL({ size: 64 }),
      })
      .setDescription(message.content || "*[İçerik yok]*")
      .setFooter({ text: `Kullanıcı ID: ${sender.id}` })
      .setTimestamp(message.createdAt);

    const attachments: AttachmentBuilder[] = [];
    let firstImage: string | null = null;

    for (const attachment of message.attachments.values()) {
      if (!firstImage && attachment.contentType?.startsWith("image/")) {
        firstImage = attachment.url;
      } else {
        try {
          const res = await fetch(attachment.url);
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.byteLength <= 24 * 1024 * 1024) {
              attachments.push(new AttachmentBuilder(buf, { name: attachment.name }));
            }
          }
        } catch {}
      }
    }

    if (firstImage) embed.setImage(firstImage);

    for (const [, guild] of client.guilds.cache) {
      try {
        let logChannel = guild.channels.cache.find(
          (ch) => ch.type === ChannelType.GuildText &&
            ch.name.toLowerCase() === LOG_CHANNEL_NAME.toLowerCase()
        ) as TextChannel | undefined;

        if (!logChannel) {
          const fetched = await guild.channels.fetch();
          logChannel = fetched.find(
            (ch) => ch?.type === ChannelType.GuildText &&
              ch?.name?.toLowerCase() === LOG_CHANNEL_NAME.toLowerCase()
          ) as TextChannel | undefined;
        }

        if (!logChannel) continue;

        await logChannel.send({ embeds: [embed], files: attachments });
      } catch (err) {
        console.error(`Gönderilemedi:`, err);
      }
    }
  });
}
