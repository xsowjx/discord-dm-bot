import { ChatInputCommandInteraction, EmbedBuilder, Colors } from "discord.js";
import { YONETICI_ROLE_NAME, memberHasRoleNamed } from "../lib/permissions.js";
import { getRegistrationCounts } from "../lib/registrationStore.js";
import { getTicketCounts } from "../lib/ticketStore.js";

export async function handleKayitGorCommand(interaction: ChatInputCommandInteraction): Promise<void> {
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

  const counts = getRegistrationCounts(guild.id);
  const ticketCounts = getTicketCounts(guild.id);

  const embed = new EmbedBuilder()
    .setColor(Colors.Gold)
    .setTitle("🏆 Kayıt ve Ticket Listesi")
    .setTimestamp();

  if (counts.length === 0) {
    embed.addFields({ name: "📋 Kayıtlar", value: "Henüz kimse kayıt yapmamış." });
  } else {
    const lines = counts.map((c, i) => `**${i + 1}.** <@${c.byId}> — ${c.count} kayıt`);
    embed.addFields({ name: "📋 Kayıtlar", value: lines.join("\n") });
  }

  if (ticketCounts.length === 0) {
    embed.addFields({ name: "🎫 Kapatılan Ticketlar", value: "Henüz kimse ticket kapatmamış." });
  } else {
    const ticketLines = ticketCounts.map((c, i) => `**${i + 1}.** <@${c.byId}> — ${c.count} ticket`);
    embed.addFields({ name: "🎫 Kapatılan Ticketlar", value: ticketLines.join("\n") });
  }

  await interaction.editReply({ embeds: [embed] });
}
