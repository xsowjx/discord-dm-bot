import { ChatInputCommandInteraction, EmbedBuilder, Colors } from "discord.js";
import {
  YONETICI_ROLE_NAME,
  KAYITSIZ_ROLE_NAME,
  memberHasRoleNamed,
  findRoleByName,
  getLogChannel,
} from "../lib/permissions.js";

export async function handleKayitsizAlCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const guild = interaction.guild;
  const executor = interaction.member;
  if (!guild || !executor || !("roles" in executor)) {
    await interaction.editReply("❌ Bu komut sadece sunucu içinde kullanılabilir.");
    return;
  }

  if (!memberHasRoleNamed(executor as any, YONETICI_ROLE_NAME)) {
    await interaction.editReply(`❌ Bu komutu sadece **${YONETICI_ROLE_NAME}** kullanabilir.`);
    return;
  }

  const targetUser = interaction.options.getUser("kullanici", true);
  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    await interaction.editReply("❌ Bu kullanıcı sunucuda bulunamadı.");
    return;
  }

  const kayitsizRole = findRoleByName(guild, KAYITSIZ_ROLE_NAME);

  if (!kayitsizRole) {
    await interaction.editReply(`❌ Sunucuda **${KAYITSIZ_ROLE_NAME}** isimli bir rol bulunamadı. Lütfen bu rolü oluştur.`);
    return;
  }

  // @everyone rolü ve yönetilemeyen (bot entegrasyonu vb.) roller hariç, kullanıcının
  // sahip olduğu TÜM roller kaldırılır — böylece kişi tamamen "kayıtsız" durumuna sıfırlanır.
  const rolesToRemove = targetMember.roles.cache.filter(
    (role) => role.id !== guild.id && role.id !== kayitsizRole.id && !role.managed
  );
  const removedRoleNames: string[] = [];
  const failedRoleNames: string[] = [];

  try {
    for (const role of rolesToRemove.values()) {
      try {
        await targetMember.roles.remove(role);
        removedRoleNames.push(role.name);
      } catch (err) {
        console.error(`Rol kaldırma hatası (${role.name}):`, err);
        failedRoleNames.push(role.name);
      }
    }

    if (!targetMember.roles.cache.has(kayitsizRole.id)) {
      await targetMember.roles.add(kayitsizRole);
    }
  } catch (err) {
    console.error("Kayıtsızlaştırma rol işlemi hatası:", err);
    await interaction.editReply("❌ Rol işlemi sırasında hata oluştu. Botun rol sıralaması, verilecek/alınacak rollerden yukarıda mı kontrol et.");
    return;
  }

  const removedText = removedRoleNames.length > 0 ? removedRoleNames.join(", ") : "yoktu";
  const failedNote = failedRoleNames.length > 0
    ? `\n⚠️ Şu roller botun yetkisi yetmediği için kaldırılamadı: ${failedRoleNames.join(", ")}`
    : "";

  await interaction.editReply(
    `✅ <@${targetUser.id}> kayıtsız yapıldı. (Alınan roller: ${removedText} — verilen rol: ${KAYITSIZ_ROLE_NAME})${failedNote}`
  );

  const logChannel = await getLogChannel(guild);
  if (logChannel) {
    const embed = new EmbedBuilder()
      .setColor(Colors.Orange)
      .setTitle("↩️ Kayıt Geri Alındı")
      .addFields(
        { name: "İşlemi Yapan", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Kayıtsız Yapılan", value: `<@${targetUser.id}>`, inline: true },
        { name: "Alınan Roller", value: removedText, inline: false }
      )
      .setTimestamp();
    if (failedRoleNames.length > 0) {
      embed.addFields({ name: "⚠️ Kaldırılamayan Roller", value: failedRoleNames.join(", "), inline: false });
    }
    await logChannel.send({ embeds: [embed] }).catch(() => {});
  }
}
