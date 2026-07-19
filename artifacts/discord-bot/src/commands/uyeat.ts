import { ChatInputCommandInteraction, PermissionsBitField } from "discord.js";
import { YONETICI_ROLE_NAME, memberHasRoleNamed } from "../lib/permissions.js";
import type { GuildMember } from "discord.js";

export async function handleUyeAtCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const guild = interaction.guild;
  const executor = interaction.member;
  if (!guild || !executor || !("roles" in executor)) {
    await interaction.editReply("❌ Bu komut sadece sunucu içinde kullanılabilir.");
    return;
  }

  const isOwner = interaction.user.id === guild.ownerId;
  const isAdmin = interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator) ?? false;
  const isYonetici = memberHasRoleNamed(executor as GuildMember, YONETICI_ROLE_NAME);

  if (!isOwner && !isAdmin && !isYonetici) {
    await interaction.editReply(
      `❌ Bu komutu sadece sunucu sahibi, **Yönetici (Administrator)** yetkisine sahip biri veya **${YONETICI_ROLE_NAME}** kullanabilir.`
    );
    return;
  }

  const targetUser = interaction.options.getUser("kullanici", true);
  const sebep = interaction.options.getString("sebep") ?? "Sebep belirtilmedi";

  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    await interaction.editReply("❌ Bu kullanıcı/bot sunucuda bulunamadı.");
    return;
  }

  if (!targetMember.kickable) {
    await interaction.editReply(
      "❌ Bu üyeyi/botu atamıyorum — rol sıralamasında benden yukarıda olabilir. Sunucu Ayarları → Roller'dan botumun rolünü en üste yakın bir yere taşı."
    );
    return;
  }

  try {
    await targetMember.kick(`${sebep} — ${interaction.user.tag} tarafından /uyeat ile atıldı`);
    await interaction.editReply(
      `✅ **${targetUser.tag}** ${targetUser.bot ? "(bot)" : ""} sunucudan atıldı.\nSebep: ${sebep}`
    );
  } catch (err) {
    await interaction.editReply(`❌ Atma işlemi başarısız oldu: ${(err as Error).message}`);
  }
}
