import {
  ChatInputCommandInteraction,
  PermissionsBitField,
  ChannelType,
  Colors,
  EmbedBuilder,
  OverwriteType,
} from "discord.js";
import {
  YETKILI_ROLE_NAME,
  YONETICI_ROLE_NAME,
  KAYITSIZ_ROLE_NAME,
  ACEMI_ROLE_NAME,
  LOG_CHANNEL_NAME,
  TICKET_LOG_CHANNEL_NAME,
  findRoleByName,
  findTextChannelByName,
} from "../lib/permissions.js";

const DM_LOG_CHANNEL_NAME = "bot-dm";
const INVITE_LOG_CHANNEL_NAME = "davet-log";
const SPAM_LOG_CHANNEL_NAME = "spam-engel";
const TICKET_CATEGORY_NAME = "Ticketlar";

export async function handleKurulumCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply("❌ Bu komut sadece sunucu içinde kullanılabilir.");
    return;
  }

  const isOwner = interaction.user.id === guild.ownerId;
  const isAdmin = interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator) ?? false;

  if (!isOwner && !isAdmin) {
    await interaction.editReply(
      "❌ Bu komutu sadece sunucu sahibi veya **Yönetici (Administrator)** yetkisine sahip biri kullanabilir."
    );
    return;
  }

  const createdRoles: string[] = [];
  const existingRoles: string[] = [];
  const createdChannels: string[] = [];
  const existingChannels: string[] = [];
  const errors: string[] = [];

  async function ensureRole(name: string, color: number) {
    const existing = findRoleByName(guild!, name);
    if (existing) {
      existingRoles.push(name);
      return existing;
    }
    try {
      const role = await guild!.roles.create({ name, color, hoist: true, mentionable: false });
      createdRoles.push(name);
      return role;
    } catch (err) {
      errors.push(`Rol oluşturulamadı: **${name}** (${(err as Error).message})`);
      return undefined;
    }
  }

  const yoneticiRole = await ensureRole(YONETICI_ROLE_NAME, Colors.Red);
  const yetkiliRole = await ensureRole(YETKILI_ROLE_NAME, Colors.Blue);
  await ensureRole(ACEMI_ROLE_NAME, Colors.Green);
  await ensureRole(KAYITSIZ_ROLE_NAME, Colors.Grey);

  async function ensureLogChannel(name: string) {
    const existing = await findTextChannelByName(guild!, name);
    if (existing) {
      existingChannels.push(name);
      return existing;
    }
    try {
      const overwrites: {
        id: string;
        type: OverwriteType.Role;
        allow?: bigint[];
        deny?: bigint[];
      }[] = [
        {
          id: guild!.roles.everyone.id,
          type: OverwriteType.Role,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
      ];
      if (yoneticiRole) {
        overwrites.push({
          id: yoneticiRole.id,
          type: OverwriteType.Role,
          allow: [PermissionsBitField.Flags.ViewChannel],
        });
      }
      if (yetkiliRole) {
        overwrites.push({
          id: yetkiliRole.id,
          type: OverwriteType.Role,
          allow: [PermissionsBitField.Flags.ViewChannel],
        });
      }

      const channel = await guild!.channels.create({
        name,
        type: ChannelType.GuildText,
        permissionOverwrites: overwrites,
      });
      createdChannels.push(name);
      return channel;
    } catch (err) {
      errors.push(`Kanal oluşturulamadı: **#${name}** (${(err as Error).message})`);
      return undefined;
    }
  }

  await ensureLogChannel(LOG_CHANNEL_NAME);
  await ensureLogChannel(TICKET_LOG_CHANNEL_NAME);
  await ensureLogChannel(DM_LOG_CHANNEL_NAME);
  await ensureLogChannel(INVITE_LOG_CHANNEL_NAME);
  await ensureLogChannel(SPAM_LOG_CHANNEL_NAME);

  try {
    const existingCategory = guild.channels.cache.find(
      (ch) =>
        ch.type === ChannelType.GuildCategory &&
        ch.name.toLowerCase() === TICKET_CATEGORY_NAME.toLowerCase()
    );
    if (!existingCategory) {
      await guild.channels.create({ name: TICKET_CATEGORY_NAME, type: ChannelType.GuildCategory });
      createdChannels.push(`${TICKET_CATEGORY_NAME} (kategori)`);
    } else {
      existingChannels.push(`${TICKET_CATEGORY_NAME} (kategori)`);
    }
  } catch (err) {
    errors.push(`Ticket kategorisi oluşturulamadı: (${(err as Error).message})`);
  }

  const embed = new EmbedBuilder()
    .setColor(errors.length > 0 ? Colors.Orange : Colors.Green)
    .setTitle("⚙️ Sunucu Kurulumu Tamamlandı")
    .addFields(
      {
        name: "🆕 Oluşturulan Roller",
        value: createdRoles.length ? createdRoles.join(", ") : "yok (hepsi zaten vardı)",
        inline: false,
      },
      {
        name: "✅ Zaten Var Olan Roller",
        value: existingRoles.length ? existingRoles.join(", ") : "yok",
        inline: false,
      },
      {
        name: "🆕 Oluşturulan Kanallar",
        value: createdChannels.length ? createdChannels.join(", ") : "yok (hepsi zaten vardı)",
        inline: false,
      },
      {
        name: "✅ Zaten Var Olan Kanallar",
        value: existingChannels.length ? existingChannels.join(", ") : "yok",
        inline: false,
      }
    )
    .setFooter({
      text: "Not: Ticket paneli göndermek için istediğin kanalda /ticketpanel komutunu kullan.",
    })
    .setTimestamp();

  if (errors.length > 0) {
    embed.addFields({ name: "⚠️ Hatalar", value: errors.join("\n").slice(0, 1000), inline: false });
  }

  await interaction.editReply({ embeds: [embed] });
}
