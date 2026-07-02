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
const MAX_FILE_BYTES = 24 * 1024 * 1024; // 24 MB — Discord bot limiti

// Medya uzantıları
const MEDIA_EXTENSIONS = /\.(mp4|mov|avi|webm|mkv|gif|png|jpg|jpeg|mp3|wav|ogg|pdf)(\?.*)?$/i;

/** URL'nin medya dosyası olup olmadığını kontrol et */
function isMediaUrl(text: string): boolean {
  const trimmed = text.trim();
  return (
    (trimmed.startsWith("http://") || trimmed.startsWith("https://")) &&
    MEDIA_EXTENSIONS.test(trimmed.split("?")[0])
  );
}

/**
 * Mesajı analiz et:
 * - Eğer medya URL'si ise indir ve AttachmentBuilder olarak döndür.
 * - Değilse düz metin olarak döndür.
 */
async function buildPayload(
  message: string
): Promise<{ content?: string; files?: AttachmentBuilder[] }> {
  const trimmed = message.trim();

  if (!isMediaUrl(trimmed)) {
    return { content: trimmed };
  }

  try {
    const response = await fetch(trimmed);
    if (!response.ok) return { content: trimmed };

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_FILE_BYTES) {
      // Dosya çok büyük — link olarak gönder
      return { content: trimmed };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_FILE_BYTES) return { content: trimmed };

    // URL'den dosya adını çıkar
    const urlPath = new URL(trimmed).pathname;
    const fileName = urlPath.split("/").pop() || "dosya";

    const attachment = new AttachmentBuilder(buffer, { name: fileName });
    return { files: [attachment] };
  } catch {
    // İndirme başarısız — yine de linki gönder
    return { content: trimmed };
  }
}

/** Komutu kullanan kişinin yönetici rolü var mı? */
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
    new ButtonBuilder()
      .setCustomId(confirmId)
      .setLabel("✅ Evet, gönder")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(cancelId)
      .setLabel("❌ İptal")
      .setStyle(ButtonStyle.Danger)
  );
}

/** Bir kullanıcıya payload gönder */
async function sendToUser(user: User, payload: { content?: string; files?: AttachmentBuilder[] }) {
  await user.send(payload as Parameters<typeof user.send>[0]);
}

/** Tek kullanıcıya DM — önce onay */
async function handleDmUser(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const targetUser = interaction.options.getUser("kullanici", true);
  const message = interaction.options.getString("mesaj", true);

  if (targetUser.bot) {
    await interaction.reply({ content: "❌ Botlara DM gönderilemez.", ephemeral: true });
    return;
  }

  const confirmId = `confirm_user_${interaction.id}`;
  const cancelId = `cancel_user_${interaction.id}`;

  const preview = isMediaUrl(message.trim())
    ? `📎 *Medya dosyası gönderilecek:*\n${message.trim()}`
    : `> ${message}`;

  await interaction.reply({
    content: `📩 **${targetUser.tag}** kullanıcısına şunu göndermek istediğinden emin misin?\n${preview}`,
    components: [buildConfirmRow(confirmId, cancelId)],
    ephemeral: true,
  });

  try {
    const btn = await interaction.channel!.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) =>
        [confirmId, cancelId].includes(i.customId) &&
        i.user.id === interaction.user.id,
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
      await interaction.editReply({
        content: `✅ **${targetUser.tag}** kullanıcısına başarıyla gönderildi!`,
      });
    } catch {
      await interaction.editReply({
        content: `❌ **${targetUser.tag}** kullanıcısına gönderilemedi. DM'leri kapalı veya bot engelli olabilir.`,
      });
    }
  } catch {
    await interaction.editReply({ content: "⏰ Süre doldu (30 sn), iptal edildi.", components: [] });
  }
}

/** Herkese DM — önce onay */
async function handleDmAll(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "❌ Bu komut sadece sunucularda kullanılabilir.", ephemeral: true });
    return;
  }

  const message = interaction.options.getString("mesaj", true);
  const confirmId = `confirm_all_${interaction.id}`;
  const cancelId = `cancel_all_${interaction.id}`;

  const preview = isMediaUrl(message.trim())
    ? `📎 *Medya dosyası gönderilecek:*\n${message.trim()}`
    : `> ${message}`;

  await interaction.reply({
    content: `📢 **Sunucudaki herkese** şunu göndermek istediğinden emin misin?\n${preview}`,
    components: [buildConfirmRow(confirmId, cancelId)],
    ephemeral: true,
  });

  try {
    const btn = await interaction.channel!.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) =>
        [confirmId, cancelId].includes(i.customId) &&
        i.user.id === interaction.user.id,
      time: CONFIRM_TIMEOUT_MS,
    });

    if (btn.customId === cancelId) {
      await btn.update({ content: "🚫 İptal edildi.", components: [] });
      return;
    }

    await btn.update({ content: "⏳ Üyeler yükleniyor…", components: [] });

    let members: Collection<string, GuildMember>;
    try {
      members = (await interaction.guild.members.fetch()) as Collection<string, GuildMember>;
    } catch {
      await interaction.editReply({ content: "❌ Üye listesi alınamadı." });
      return;
    }

    const humanMembers = members.filter((m) => !m.user.bot);
    const memberList = [...humanMembers.values()];
    const total = memberList.length;
    let successCount = 0;
    let failCount = 0;
    let processed = 0;

    // 10'lu gruplar halinde gönder, gruplar arası 750ms bekle
      // 800 kişi → ~80 grup × 750ms ≈ ~60 saniye, rate limit yok
      const BATCH_SIZE = 10;

    for (let i = 0; i < memberList.length; i += BATCH_SIZE) {
      const batch = memberList.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (member) => {
          const memberPayload = await buildPayload(message);
          await sendToUser(member.user, memberPayload);
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") successCount++;
        else failCount++;
      }

      processed += batch.length;
      await interaction
        .editReply({ content: `⏳ Gönderiliyor… **${processed}/${total}** işlendi.` })
        .catch(() => undefined);

      if (i + BATCH_SIZE < memberList.length) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    await interaction.editReply({
      content: [
        `✅ Toplu gönderim tamamlandı! (toplam ${total} üye)`,
        `📨 Başarılı: **${successCount}** kişi`,
        `❌ Başarısız: **${failCount}** kişi`,
      ].join("\n"),
    });
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
  }
}
