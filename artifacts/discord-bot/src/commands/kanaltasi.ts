import {
  ChatInputCommandInteraction,
  ChannelType,
} from "discord.js";
import { YONETICI_ROLE_NAME, memberHasRoleNamed } from "../lib/permissions.js";
import type { GuildMember } from "discord.js";

export async function handleKanalTasiCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  const executor = interaction.member;
  if (!guild || !executor || !("roles" in executor)) {
    await interaction.editReply("❌ Bu komut sadece sunucu içinde kullanılabilir.");
    return;
  }

  const isYonetici = memberHasRoleNamed(executor as GuildMember, YONETICI_ROLE_NAME);

  if (!isYonetici) {
    await interaction.editReply(`❌ Bu komutu sadece **${YONETICI_ROLE_NAME}** kullanabilir.`);
    return;
  }

  const targetChannel = interaction.options.getChannel("kanal", true);
  const targetCategory = interaction.options.getChannel("kategori", true);

  if (targetCategory.type !== ChannelType.GuildCategory) {
    await interaction.editReply("❌ **kategori** seçeneği bir kategori olmalı, normal bir kanal değil.");
    return;
  }

  if (targetChannel.type === ChannelType.GuildCategory) {
    await interaction.editReply("❌ Bir kategoriyi başka bir kategorinin içine taşıyamazsın.");
    return;
  }

  const channel = await guild.channels.fetch(targetChannel.id).catch(() => null);
  if (!channel || !("setParent" in channel)) {
    await interaction.editReply("❌ Bu kanal taşınamıyor (desteklenmeyen tür).");
    return;
  }

  try {
    await channel.setParent(targetCategory.id, { lockPermissions: false });
    await interaction.editReply(
      `✅ <#${targetChannel.id}> kanalı **${targetCategory.name}** kategorisine taşındı.`
    );
  } catch (err) {
    await interaction.editReply(
      `❌ Kanal taşınamadı: ${(err as Error).message}\n\nBotun "Kanalları Yönet" yetkisi olduğundan ve rol sıralamasında yeterince yukarıda olduğundan emin ol.`
    );
  }
}
