import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    ComponentType,
    User,
  } from "discord.js";

  const AUTHORIZED_ROLE = process.env.AUTHORIZED_ROLE ?? "yonetici rolu";
  const CONFIRM_TIMEOUT_MS = 30_000;
  const MAX_FILE_BYTES = 24 * 1024 * 1024;

  const MEDIA_EXTENSIONS = /\.(mp4|mov|avi|webm|mkv|gif|png|jpg|jpeg|mp3|wav|ogg|pdf)(\?.*)?$/i;

  function isMediaUrl(text: string): boolean {
    const trimmed = text.trim();
    return (
      (trimmed.startsWith("http://") || trimmed.startsWith("https://")) &&
      MEDIA_EXTENSIONS.test(trimmed.split("?")[0])
    );
  }

  async function buildPayload(
    message: string
  ): Promise<{ content?: string; files?: AttachmentBuilder[] }> {
    const trimmed = message.trim();
    if (!isMediaUrl(trimmed)) return { content: trimmed };
    try {
      const response = await fetch(trimmed);
      if (!response.ok) return { content: trimmed };
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > MAX_FILE_BYTES) return { content: trimmed };
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > MAX_FILE_BYTES) return { content: trimmed };
      const urlPath = new URL(trimmed).pathname;
      const fileName = urlPath.split("/").pop() || "dosya";
      return { files: [new AttachmentBuilder(buffer, { name: fileName })] };
    } catch {
      return { content: trimmed };
    }
  }

  async function hasAuthorizedRole(
    interaction: ChatInputCommandInteraction
  ): Promise<boolean> {
    if (!interaction.guild) return false;
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      return member.roles.cache.some(
        (role) => role.name.toLowerCase() === AUTHORIZED_ROLE.toLowerCase()
      );
    } catch {
      return false;
    }
  }

  function buildConfirmRow(confirmId: string, cancelId: string) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(confirmId).setLabel("✅ Evet, gönder").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(cancelId).setLabel("❌ İptal").setStyle(ButtonStyle.Danger)
    );
  }

  async function sendToUser(user: User, payload: { content?: string; files?: AttachmentBuilder[] }) {
    await user.send(payload as Parameters<typeof user.send>[0]);
  }

  async function handleDmUser(interaction: ChatInputCommandInteraction): Promise<void> {
    const targetUser = interaction.options.getUser("kullanici", true);
    const message = interaction.options.getString("mesaj", true);

    if (targetUser.bot) {
      await interaction.reply({ content: "❌ Botlara DM gönderilemez.", ephemeral: true });
      return;
    }

    const confirmId = "confirm_user_" + interaction.id;
    const cancelId = "cancel_user_" + interaction.id;
    const preview = isMediaUrl(message.trim())
      ? "📎 *Medya dosyası gönderilecek:*\n" + message.trim()
      : "> " + message;

    await interaction.reply({
      content: "📩 **" + targetUser.tag + "** kullanıcısına şunu göndermek istediğinden emin misin?\n" + preview,
      components: [buildConfirmRow(confirmId, cancelId)],
      ephemeral: true,
    });

    try {
      const btn = await interaction.channel!.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => [confirmId, cancelId].includes(i.customId) && i.user.id === interaction.user.id,
        time: CONFIRM_TIMEOUT_MS,
      });
      if (btn.customId === cancelId) {
        await btn.update({ content: "🚫 İptal edildi.", components: [] });
        return;
      }
      await btn.update({ content: "⏳ Gönderiliyor…", components: [] });
      try {
        const payload = await buildPayload(message);
        await sendToUser(targetUser, payload);
        await interaction.editReply({ content: "✅ **" + targetUser.tag + "** kullanıcısına başarıyla gönderildi!" });
      } catch {
        await interaction.editReply({ content: "❌ **" + targetUser.tag + "** kullanıcısına gönderilemedi. DM'leri kapalı olabilir." });
      }
    } catch {
      await interaction.editReply({ content: "⏰ Süre doldu (30 sn), iptal edildi.", components: [] });
    }
  }

  export async function handleDmCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const authorized = await hasAuthorizedRole(interaction);
    if (!authorized) {
      await interaction.reply({
        content: "❌ Bu komutu kullanmak için **yönetici rolü** gereklidir!",
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "user") {
      await handleDmUser(interaction);
    }
  }
