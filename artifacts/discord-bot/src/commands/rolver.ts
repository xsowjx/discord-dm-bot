import { ChatInputCommandInteraction, EmbedBuilder, Colors } from "discord.js";
import {
  YETKILI_ROLE_NAME,
  memberHasRoleNamed,
  getHighestRolePosition,
  getLogChannel,
} from "../lib/permissions.js";

export async function handleRolVerCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  const executor = interaction.member;
  if (!guild || !executor || !("roles" in executor)) {
    await interaction.editReply("❌ Bu komut sadece sunucu içinde kullanılabilir.");
    return;
  }
  const executorMember = executor as any;

  if (!memberHasRoleNamed(executorMember, YETKILI_ROLE_NAME)) {
    await interaction.editReply(`❌ Bu komutu sadece **${YETKILI_ROLE_NAME}** kullanabilir.`);
    return;
  }

  const targetUser = interaction.options.getUser("kisi", true);
  const role = interaction.options.getRole("rol", true);

  const executorTopPosition = getHighestRolePosition(executorMember);
  if (role.position >= executorTopPosition) {
    await interaction.editReply("❌ Kendinden üstün veya kendinle eşit bir rolü başkasına veremezsin.");
    return;
  }

  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    await interaction.editReply("❌ Bu kullanıcı sunucuda bulunamadı.");
    return;
  }

  try {
    await targetMember.roles.add(role.id);
  } catch (err) {
    console.error("Rol verme hatası:", err);
    await interaction.editReply("❌ Rol verilirken hata oluştu. Botun rolü, verilecek rolden yukarıda mı kontrol et.");
    return;
  }

  await interaction.editReply(`✅ **${role.name}** rolü **${targetUser.username}** kullanıcısına verildi.`);

  const logChannel = await getLogChannel(guild);
  if (logChannel) {
    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle("➕ Rol Verildi")
      .addFields(
        { name: "Veren", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Alan", value: `<@${targetUser.id}>`, inline: true },
        { name: "Rol", value: `${role.name}`, inline: true }
      )
      .setTimestamp();
    await logChannel.send({ embeds: [embed] }).catch(() => {});
  }
}
