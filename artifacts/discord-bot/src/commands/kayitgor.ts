import { ChatInputCommandInteraction, EmbedBuilder, Colors } from "discord.js";
import { YONETICI_ROLE_NAME, memberHasRoleNamed } from "../lib/permissions.js";
import { getRegistrationCounts } from "../lib/registrationStore.js";

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

  if (counts.length === 0) {
    await interaction.editReply("📋 Henüz kimse kayıt yapmamış.");
    return;
  }

  const lines = counts.map((c, i) => `**${i + 1}.** <@${c.byId}> — ${c.count} kayıt`);

  const embed = new EmbedBuilder()
    .setColor(Colors.Gold)
    .setTitle("🏆 Kayıt Listesi")
    .setDescription(lines.join("\n"))
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
