import {
  ChatInputCommandInteraction,
  Collection,
  GuildMember,
} from "discord.js";

const AUTHORIZED_ROLE = process.env.AUTHORIZED_ROLE ?? "yonetici rolu";

/** Komutu kullanan kişiyi guild'den çekip rol kontrolü yap */
async function hasAuthorizedRole(
  interaction: ChatInputCommandInteraction
): Promise<boolean> {
  if (!interaction.guild) return false;
  try {
    // member'ı her zaman guild üzerinden çek — interaction.member API payload olabilir
    const member = await interaction.guild.members.fetch(interaction.user.id);
    return member.roles.cache.some(
      (role) => role.name.toLowerCase() === AUTHORIZED_ROLE.toLowerCase()
    );
  } catch {
    return false;
  }
}

/** Display name, kullanıcı adı veya global name'e göre üye bul */
function findMemberByName(
  members: Collection<string, GuildMember>,
  query: string
): GuildMember | undefined {
  const q = query.toLowerCase().trim();
  return members.find(
    (m) =>
      m.displayName.toLowerCase() === q ||
      m.user.username.toLowerCase() === q ||
      (m.user.globalName?.toLowerCase() ?? "") === q
  );
}

async function handleDmSingle(
  interaction: ChatInputCommandInteraction,
  targetName: string,
  message: string
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: "❌ Bu komut sadece sunucularda kullanılabilir.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const members = await interaction.guild.members.fetch();
  const target = findMemberByName(members as Collection<string, GuildMember>, targetName);

  if (!target) {
    await interaction.editReply({
      content: `❌ **${targetName}** adında bir üye bulunamadı. Sunucu ismini (display name) tam olarak yaz.`,
    });
    return;
  }

  if (target.user.bot) {
    await interaction.editReply({ content: "❌ Botlara DM gönderilemez." });
    return;
  }

  try {
    await target.send(message);
    await interaction.editReply({
      content: `✅ **${target.displayName}** kullanıcısına DM başarıyla gönderildi!`,
    });
  } catch {
    await interaction.editReply({
      content: `❌ **${target.displayName}** kullanıcısına DM gönderilemedi. DM'leri kapalı veya bot engelli olabilir.`,
    });
  }
}

async function handleDmAll(
  interaction: ChatInputCommandInteraction,
  message: string
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: "❌ Bu komut sadece sunucularda kullanılabilir.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  let members: Collection<string, GuildMember>;
  try {
    members = await interaction.guild.members.fetch() as Collection<string, GuildMember>;
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

    // Her 10 kişide bir ilerleme güncelle (interaction 15 dk geçerli)
    if (processed % 10 === 0) {
      await interaction.editReply({
        content: `⏳ Gönderiliyor… **${processed}/${total}** kişi işlendi.`,
      }).catch(() => undefined); // editReply başarısız olsa bile devam et
    }

    // Discord rate-limit: mesajlar arası 1.2 saniye
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  await interaction.editReply({
    content: [
      `✅ Toplu DM tamamlandı! (${total} kişi)`,
      `📨 Başarılı: **${successCount}** kişi`,
      `❌ Başarısız: **${failCount}** kişi (DM kapalı veya bot engelli)`,
    ].join("\n"),
  });
}

export async function handleDmCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  // Yetki kontrolü — guild'den member çekerek güvenilir şekilde kontrol et
  const authorized = await hasAuthorizedRole(interaction);
  if (!authorized) {
    await interaction.reply({
      content: "❌ Bu komutu kullanmak için **yönetici rolü** gereklidir!",
      ephemeral: true,
    });
    return;
  }

  const isim = interaction.options.getString("isim", true).trim();
  const mesaj = interaction.options.getString("mesaj", true);

  if (isim.toLowerCase() === "all") {
    await handleDmAll(interaction, mesaj);
  } else {
    await handleDmSingle(interaction, isim, mesaj);
  }
}
