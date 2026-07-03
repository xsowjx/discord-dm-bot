import { ChatInputCommandInteraction, EmbedBuilder, Colors } from "discord.js";
  import {
    YETKILI_ROLE_NAME,
    memberHasRoleNamed,
    getHighestRolePosition,
    getLogChannel,
  } from "../lib/permissions.js";

  export async function handleRolAlCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

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
      await interaction.editReply("❌ Kendinden üstün veya kendinle eşit bir rolü başkasından alamazsın.");
      return;
    }

    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      await interaction.editReply("❌ Bu kullanıcı sunucuda bulunamadı.");
      return;
    }

    try {
      await targetMember.roles.remove(role.id);
    } catch (err) {
      console.error("Rol alma hatası:", err);
      await interaction.editReply("❌ Rol alınırken hata oluştu. Botun rolü, alınacak rolden yukarıda mı kontrol et.");
      return;
    }

    const resultEmbed = new EmbedBuilder()
      .setColor(Colors.Orange)
      .setTitle("➖ Rol Alındı")
      .addFields(
        { name: "Alan (Yetkili)", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Kimden Alındı", value: `<@${targetUser.id}>`, inline: true },
        { name: "Rol", value: `${role.name}`, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [resultEmbed] });

    const logChannel = await getLogChannel(guild);
    if (logChannel) {
      await logChannel.send({ embeds: [resultEmbed] }).catch(() => {});
    }
  }
  