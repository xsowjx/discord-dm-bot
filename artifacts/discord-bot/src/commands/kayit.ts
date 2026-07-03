import { ChatInputCommandInteraction, EmbedBuilder, Colors } from "discord.js";
import {
  YETKILI_ROLE_NAME,
  KAYITSIZ_ROLE_NAME,
  ACEMI_ROLE_NAME,
  memberHasRoleNamed,
  findRoleByName,
  getLogChannel,
} from "../lib/permissions.js";
import { addRegistration } from "../lib/registrationStore.js";

export async function handleKayitCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  const executor = interaction.member;
  if (!guild || !executor || !("roles" in executor)) {
    await interaction.editReply("❌ Bu komut sadece sunucu içinde kullanılabilir.");
    return;
  }

  if (!memberHasRoleNamed(executor as any, YETKILI_ROLE_NAME)) {
    await interaction.editReply(`❌ Bu komutu sadece **${YETKILI_ROLE_NAME}** kullanabilir.`);
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

  if (!acemiRole) {
    await interaction.editReply(`❌ Sunucuda **${ACEMI_ROLE_NAME}** isimli bir rol bulunamadı. Lütfen bu rolü oluştur.`);
    return;
  }

  try {
    if (kayitsizRole && targetMember.roles.cache.has(kayitsizRole.id)) {
      await targetMember.roles.remove(kayitsizRole);
    }
    if (!targetMember.roles.cache.has(acemiRole.id)) {
      await targetMember.roles.add(acemiRole);
    }
  } catch (err) {
    console.error("Kayıt rol işlemi hatası:", err);
    await interaction.editReply("❌ Rol işlemi sırasında hata oluştu. Botun rol sıralaması, verilecek rollerden yukarıda mı kontrol et.");
    return;
  }

  addRegistration({
    guildId: guild.id,
    targetId: targetUser.id,
    byId: interaction.user.id,
    timestamp: Date.now(),
  });

  await interaction.editReply(`✅ **${targetUser.username}** kayıt edildi. (${KAYITSIZ_ROLE_NAME} rolü alındı, ${ACEMI_ROLE_NAME} rolü verildi)`);

  const logChannel = await getLogChannel(guild);
  if (logChannel) {
    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle("📋 Yeni Kayıt")
      .addFields(
        { name: "Kayıt Eden", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Kayıt Edilen", value: `<@${targetUser.id}>`, inline: true }
      )
      .setTimestamp();
    await logChannel.send({ embeds: [embed] }).catch(() => {});
  }
}
