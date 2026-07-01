import {
  ChatInputCommandInteraction,
  GuildMember,
} from "discord.js";

const AUTHORIZED_ROLE = process.env.AUTHORIZED_ROLE ?? "yonetici rolu";

function hasAuthorizedRole(interaction: ChatInputCommandInteraction): boolean {
  const member = interaction.member;
  if (!member || !(member instanceof GuildMember)) return false;
  return member.roles.cache.some(
    (role) => role.name.toLowerCase() === AUTHORIZED_ROLE.toLowerCase()
  );
}

async function handleDmUser(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const targetUser = interaction.options.getUser("kullanici", true);
  const message = interaction.options.getString("mesaj", true);

  await interaction.deferReply({ ephemeral: true });

  try {
    await targetUser.send(message);
    await interaction.editReply({
      content: `✅ **${targetUser.tag}** kullanıcısına DM başarıyla gönderildi!`,
    });
  } catch {
    await interaction.editReply({
      content: `❌ **${targetUser.tag}** kullanıcısına DM gönderilemedi. DM'leri kapalı ya da botun engellenmiş olabilir.`,
    });
  }
}

async function handleDmAll(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const message = interaction.options.getString("mesaj", true);

  if (!interaction.guild) {
    await interaction.reply({
      content: "❌ Bu komut sadece sunucularda kullanılabilir.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const members = await interaction.guild.members.fetch();
    let successCount = 0;
    let failCount = 0;

    for (const [, member] of members) {
      // Botları atla
      if (member.user.bot) continue;

      try {
        await member.send(message);
        successCount++;
      } catch {
        failCount++;
      }

      // Rate-limit: her mesaj arasında 1.2 saniye bekle
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    await interaction.editReply({
      content: [
        `✅ Toplu DM gönderme tamamlandı!`,
        `📨 Başarılı: **${successCount}** kişi`,
        `❌ Başarısız: **${failCount}** kişi (DM'leri kapalı veya bot engelli)`,
      ].join("\n"),
    });
  } catch (err) {
    console.error("DM all hatası:", err);
    await interaction.editReply({
      content: "❌ Üye listesi alınırken bir hata oluştu.",
    });
  }
}

export async function handleDmCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  // Yetki kontrolü
  if (!hasAuthorizedRole(interaction)) {
    await interaction.reply({
      content:
        "❌ Bu komutu kullanmak için **yönetici rolü** gereklidir. Yetkin yok!",
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
