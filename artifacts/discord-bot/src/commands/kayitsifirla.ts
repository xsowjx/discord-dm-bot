import { ChatInputCommandInteraction, EmbedBuilder, Colors } from "discord.js";
import { YONETICI_ROLE_NAME, memberHasRoleNamed } from "../lib/permissions.js";
import { clearRegistrations } from "../lib/registrationStore.js";
import { clearTickets } from "../lib/ticketStore.js";

export async function handleKayitSifirlaCommand(interaction: ChatInputCommandInteraction): Promise<void> {
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

  const removedCount = clearRegistrations(guild.id);
  const removedTicketCount = clearTickets(guild.id);

  const embed = new EmbedBuilder()
    .setColor(Colors.Red)
    .setTitle("🗑️ Kayıt ve Ticket Listesi Sıfırlandı")
    .addFields(
      { name: "Sıfırlayan", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Silinen Kayıt Sayısı", value: `${removedCount}`, inline: true },
      { name: "Silinen Ticket Kaydı", value: `${removedTicketCount}`, inline: true }
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
