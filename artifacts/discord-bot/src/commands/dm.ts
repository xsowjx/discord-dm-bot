import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    Collection,
    ComponentType,
    GuildMember,
    User,
  } from "discord.js";

  const AUTHORIZED_ROLE = process.env.AUTHORIZED_ROLE ?? "yonetici rolu";
  const CONFIRM_TIMEOUT_MS = 30_000;
  const MAX_FILE_BYTES = 24 * 1024 * 1024;
  const BATCH_SIZE = 5;
  const BATCH_DELAY_MS = 1500;

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

  /** Ortak toplu gönderim — hem /dm all hem /dm devam kullanır */
  async function bulkSend(
    interaction: ChatInputCommandInteraction,
    message: string,
    atlanacak: number
  ): Promise<void> {
    if (!interaction.guild) return;

    let members: Collection<string, GuildMember>;
    try {
      members = (await interaction.guild.members.fetch()) as Collection<string, GuildMember>;
    } catch {
      await interaction.editReply({ content: "❌ Üye listesi alınamadı." });
      return;
    }

    const memberList = [...members.values()].filter((m) => !m.user.bot);
    const total = memberList.length;
    const skip = Math.min(Math.max(0, atlanacak), total);
    const gonderilenList = memberList.slice(skip);

    if (skip > 0) {
      await interaction.editReply({
        content: "⏭️ İlk **" + skip + "** kişi atlandı, **" + gonderilenList.length + "** kişiye gönderilecek...",
      });
    }

    let successCount = 0;
    let failCount = 0;
    let processed = skip;

    for (let i = 0; i < gonderilenList.length; i += BATCH_SIZE) {
      const batch = gonderilenList.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (member) => {
          const payload = await buildPayload(message);
          await sendToUser(member.user, payload);
        })
      );
      for (const result of results) {
        if (result.status === "fulfilled") successCount++;
        else failCount++;
      }
      processed += batch.length;
      await interaction
        .editReply({ content: "⏳ Gönderiliyor… **" + processed + "/" + total + "** işlendi." })
        .catch(() => undefined);

      if (i + BATCH_SIZE < gonderilenList.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    await interaction.editReply({
      content: [
        "✅ Toplu gönderim tamamlandı!",
        "📨 Başarılı: **" + successCount + "** kişi",
        "❌ Başarısız: **" + failCount + "** kişi",
      ].join("\n"),
    });
  }

  async function handleDmAll(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ content: "❌ Bu komut sadece sunucularda kullanılabilir.", ephemeral: true });
      return;
    }

    const message = interaction.options.getString("mesaj", true);
    const confirmId = "confirm_all_" + interaction.id;
    const cancelId = "cancel_all_" + interaction.id;
    const preview = isMediaUrl(message.trim())
      ? "📎 *Medya dosyası gönderilecek:*\n" + message.trim()
      : "> " + message;

    await interaction.reply({
      content: "📢 **Sunucudaki herkese** şunu göndermek istediğinden emin misin?\n" + preview,
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
      await btn.update({ content: "⏳ Üyeler yükleniyor…", components: [] });
      await bulkSend(interaction, message, 0);
    } catch {
      await interaction.editReply({ content: "⏰ Süre doldu (30 sn), iptal edildi.", components: [] });
    }
  }

  async function handleDmDevam(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ content: "❌ Bu komut sadece sunucularda kullanılabilir.", ephemeral: true });
      return;
    }

    const message = interaction.options.getString("mesaj", true);
    const sayi = interaction.options.getInteger("sayi", true);
    const confirmId = "confirm_devam_" + interaction.id;
    const cancelId = "cancel_devam_" + interaction.id;
    const preview = isMediaUrl(message.trim())
      ? "📎 *Medya dosyası gönderilecek:*\n" + message.trim()
      : "> " + message;

    await interaction.reply({
      content: "⏭️ **" + sayi + ". kişiden** itibaren göndermek istediğinden emin misin?\n" + preview,
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
      await btn.update({ content: "⏳ Üyeler yükleniyor…", components: [] });
      await bulkSend(interaction, message, sayi - 1);
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
    } else if (subcommand === "all") {
      await handleDmAll(interaction);
    } else if (subcommand === "devam") {
      await handleDmDevam(interaction);
    }
  }
  