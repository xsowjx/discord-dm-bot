import { ChatInputCommandInteraction, EmbedBuilder, Colors } from "discord.js";
import {
  YONETICI_ROLE_NAME,
  KAYITSIZ_ROLE_NAME,
  ACEMI_ROLE_NAME,
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
  const acemiRole = findRoleByName(guild, ACEMI_ROLE_NAME);

  if (!kayitsizRole) {
    await interaction.editReply(`❌ Sunucuda **${KAYITSIZ_ROLE_NAME}** isimli bir rol bulunamadı. Lütfen bu rolü oluştur.`);
    return;
  }

  try {
    if (acemiRole && targetMember.roles.cache.has(acemiRole.id)) {
      await targetMember.roles.remove(acemiRole);
    }
    if (!targetMember.roles.cache.has(kayitsizRole.id)) {
      await targetMember.roles.add(kayitsizRole);
    }
  } catch (err) {
    console.error("Kayıtsızlaştırma rol işlemi hatası:", err);
    await interaction.editReply("❌ Rol işlemi sırasında hata oluştu. Botun rol sıralaması, verilecek/alınacak rollerden yukarıda mı kontrol et.");
    return;
  }

  await interaction.editReply(`✅ **${targetUser.username}** kayıtsız yapıldı. (${ACEMI_ROLE_NAME} rolü alındı, ${KAYITSIZ_ROLE_NAME} rolü verildi)`);

  const logChannel = await getLogChannel(guild);
  if (logChannel) {
    const embed = new EmbedBuilder()
      .setColor(Colors.Orange)
      .setTitle("↩️ Kayıt Geri Alındı")
      .addFields(
        { name: "İşlemi Yapan", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Kayıtsız Yapılan", value: `<@${targetUser.id}>`, inline: true }
      )
      .setTimestamp();
    await logChannel.send({ embeds: [embed] }).catch(() => {});
  }
}
