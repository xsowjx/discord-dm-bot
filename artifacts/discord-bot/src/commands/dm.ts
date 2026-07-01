import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Collection,
  ComponentType,
  GuildMember,
} from "discord.js";

const AUTHORIZED_ROLE = process.env.AUTHORIZED_ROLE ?? "yonetici rolu";
const CONFIRM_TIMEOUT_MS = 30_000; // 30 saniye onay süresi

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

/** Onay / İptal butonlarından oluşan bir satır döndürür */
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

/** Tek kullanıcıya DM — önce onay iste */
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

  await interaction.reply({
    content: [
      `📩 **${targetUser.tag}** kullanıcısına aşağıdaki mesajı göndermek istediğinden emin misin?`,
      `> ${message}`,
    ].join("\n"),
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
      await btn.update({ content: "🚫 İşlem iptal edildi.", components: [] });
      return;
    }

    // Onaylandı — gönder
    await btn.update({ content: "⏳ Gönderiliyor…", components: [] });

    try {
      await targetUser.send(message);
      await interaction.editReply({
        content: `✅ **${targetUser.tag}** kullanıcısına DM başarıyla gönderildi!`,
      });
    } catch {
      await interaction.editReply({
        content: `❌ **${targetUser.tag}** kullanıcısına DM gönderilemedi. DM'leri kapalı veya bot engellenmiş olabilir.`,
      });
    }
  } catch {
    // Süre doldu
    await interaction.editReply({ content: "⏰ Süre doldu, işlem iptal edildi.", components: [] });
  }
}

/** Herkese DM — önce onay iste */
async function handleDmAll(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: "❌ Bu komut sadece sunucularda kullanılabilir.",
      ephemeral: true,
    });
    return;
  }

  const message = interaction.options.getString("mesaj", true);
  const confirmId = `confirm_all_${interaction.id}`;
  const cancelId = `cancel_all_${interaction.id}`;

  await interaction.reply({
    content: [
      `📢 **Sunucudaki herkese** aşağıdaki mesajı göndermek istediğinden emin misin?`,
      `> ${message}`,
    ].join("\n"),
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
      await btn.update({ content: "🚫 İşlem iptal edildi.", components: [] });
      return;
    }

    await btn.update({ content: "⏳ Üyeler yükleniyor…", components: [] });

    let members: Collection<string, GuildMember>;
    try {
      members = (await interaction.guild.members.fetch()) as Collection<string, GuildMember>;
    } catch (err) {
      console.error("Üye listesi çekilemedi:", err);
      await interaction.editReply({ content: "❌ Üye listesi alınırken hata oluştu." });
      return;
    }

    const humanMembers = members.filter((m) => !m.user.bot);
    const total = humanMembers.size;
    let successCount = 0;
    let failCount = 0;
    let processed = 0;

    for (const [, member] of humanMembers) {
      try {
        await member.send(message);
        successCount++;
      } catch {
        failCount++;
      }
      processed++;

      // Her 10 kişide bir ilerlemeyi güncelle
      if (processed % 10 === 0) {
        await interaction
          .editReply({ content: `⏳ Gönderiliyor… **${processed}/${total}** işlendi.` })
          .catch(() => undefined);
      }

      // Rate-limit koruması: mesajlar arası 1.2 saniye
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    await interaction.editReply({
      content: [
        `✅ Toplu DM tamamlandı! (toplam ${total} üye)`,
        `📨 Başarılı: **${successCount}** kişi`,
        `❌ Başarısız: **${failCount}** kişi (DM kapalı veya bot engelli)`,
      ].join("\n"),
    });
  } catch {
    await interaction.editReply({ content: "⏰ Süre doldu (30 sn), işlem iptal edildi.", components: [] });
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
