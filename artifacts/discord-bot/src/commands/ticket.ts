import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ComponentType,
  PermissionsBitField,
  Colors,
  GuildMember,
} from "discord.js";
import {
  YETKILI_ROLE_NAME,
  YONETICI_ROLE_NAME,
  findRoleByName,
  memberHasRoleNamed,
  getTicketLogChannel,
} from "../lib/permissions.js";
import {
  addTicketClose,
  claimTicket,
  getTicketClaim,
  removeTicketClaim,
} from "../lib/ticketStore.js";

export const TICKET_OPEN_ID = "ticket_open";
export const TICKET_CLOSE_PREFIX = "ticket_close_";
export const TICKET_CLAIM_ID = "ticket_claim";
const TICKET_CATEGORY_NAME = "Ticketlar";

export function buildTicketPanelMessage() {
  const embed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle("🎫 Destek Talebi")
    .setDescription(
      "Yardıma mı ihtiyacın var? Aşağıdaki butona tıklayarak sana özel bir destek kanalı aç.\n\nAçılan kanalı sadece **sen** ve **yetkililer** görebilecek."
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(TICKET_OPEN_ID)
      .setLabel("🎫 Ticket Aç")
      .setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row] };
}

export async function handleTicketPanelCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const guild = interaction.guild;
  const executor = interaction.member;
  if (!guild || !executor || !("roles" in executor)) {
    await interaction.reply({
      content: "❌ Bu komut sadece sunucu içinde kullanılabilir.",
      ephemeral: true,
    });
    return;
  }

  if (!memberHasRoleNamed(executor as GuildMember, YONETICI_ROLE_NAME)) {
    await interaction.reply({
      content: `❌ Bu komutu sadece **${YONETICI_ROLE_NAME}** kullanabilir.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply(buildTicketPanelMessage());
}

export async function handleTicketOpenButton(
  interaction: ButtonInteraction
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: "❌ Bu işlem sadece sunucuda yapılabilir.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const safeUsername =
    interaction.user.username
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 20) || interaction.user.id;
  const channelName = `ticket-${safeUsername}`;

  const existing = guild.channels.cache.find(
    (ch) => ch.type === ChannelType.GuildText && ch.name === channelName
  );
  if (existing) {
    await interaction.editReply(`❌ Zaten açık bir ticket'ın var: <#${existing.id}>`);
    return;
  }

  const yetkiliRole = findRoleByName(guild, YETKILI_ROLE_NAME);
  const yoneticiRole = findRoleByName(guild, YONETICI_ROLE_NAME);

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    },
  ];
  if (yetkiliRole) {
    overwrites.push({
      id: yetkiliRole.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels,
      ],
    });
  }
  if (yoneticiRole) {
    overwrites.push({
      id: yoneticiRole.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels,
      ],
    });
  }

  try {
    let category = guild.channels.cache.find(
      (ch) =>
        ch.type === ChannelType.GuildCategory &&
        ch.name.toLowerCase() === TICKET_CATEGORY_NAME.toLowerCase()
    );

    if (!category) {
      category = await guild.channels.create({
        name: TICKET_CATEGORY_NAME,
        type: ChannelType.GuildCategory,
        permissionOverwrites: overwrites,
      });
    }

    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: overwrites,
    });

    const welcomeEmbed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle("🎫 Yeni Ticket")
      .setDescription(
        `Merhaba <@${interaction.user.id}>! Talebini buraya yazabilirsin, yetkili ekibimiz en kısa sürede sana yardımcı olacak.\n\nSadece sen ve yetkililer bu kanalı görebiliyor.`
      )
      .setTimestamp();

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(TICKET_CLAIM_ID)
        .setLabel("🙋 Sahiplen")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${TICKET_CLOSE_PREFIX}${interaction.user.id}`)
        .setLabel("🔒 Ticketi Kapat")
        .setStyle(ButtonStyle.Danger)
    );

    const roleMentions: string[] = [];
    const allowedRoleIds: string[] = [];
    if (yetkiliRole) {
      roleMentions.push(`<@&${yetkiliRole.id}>`);
      allowedRoleIds.push(yetkiliRole.id);
    }
    if (yoneticiRole) {
      roleMentions.push(`<@&${yoneticiRole.id}>`);
      allowedRoleIds.push(yoneticiRole.id);
    }

    const mentionLine = [`<@${interaction.user.id}>`, ...roleMentions].join(" ");

    await ticketChannel.send({
      content: mentionLine,
      embeds: [welcomeEmbed],
      components: [actionRow],
      allowedMentions: { users: [interaction.user.id], roles: allowedRoleIds },
    });

    await interaction.editReply(`✅ Ticket'ın oluşturuldu: <#${ticketChannel.id}>`);

    const logChannel = await getTicketLogChannel(guild);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle("🎫 Ticket Açıldı")
        .addFields(
          { name: "Açan", value: `<@${interaction.user.id}>`, inline: true },
          { name: "Kanal", value: `<#${ticketChannel.id}>`, inline: true }
        )
        .setTimestamp();
      await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
    }
  } catch (err) {
    console.error("Ticket açma hatası:", err);
    await interaction.editReply(
      "❌ Ticket açılırken bir hata oluştu. Botun sunucuda \"Kanalları Yönet\" iznine sahip olduğundan emin ol."
    );
  }
}

export async function handleTicketClaimButton(
  interaction: ButtonInteraction
): Promise<void> {
  const guild = interaction.guild;
  const member = interaction.member;
  if (!guild || !member || !("roles" in member)) {
    await interaction.reply({
      content: "❌ Bu işlem sadece sunucuda yapılabilir.",
      ephemeral: true,
    });
    return;
  }

  const isAuthorized =
    memberHasRoleNamed(member as GuildMember, YETKILI_ROLE_NAME) ||
    memberHasRoleNamed(member as GuildMember, YONETICI_ROLE_NAME);

  if (!isAuthorized) {
    await interaction.reply({
      content: `❌ Bu ticket'ı sadece **${YETKILI_ROLE_NAME}** veya **${YONETICI_ROLE_NAME}** sahiplenebilir.`,
      ephemeral: true,
    });
    return;
  }

  const existingClaim = getTicketClaim(interaction.channelId);
  if (existingClaim) {
    if (existingClaim.claimedById === interaction.user.id) {
      await interaction.reply({
        content: "ℹ️ Bu ticket'ı zaten sen sahiplendin.",
        ephemeral: true,
      });
      return;
    }
    await interaction.reply({
      content: `❌ Bu ticket zaten <@${existingClaim.claimedById}> tarafından sahiplenilmiş.`,
      ephemeral: true,
    });
    return;
  }

  const claimed = claimTicket(interaction.channelId, interaction.user.id);
  if (!claimed) {
    // Aynı anda iki kişi basarsa (race condition) — tekrar kontrol et.
    const recheck = getTicketClaim(interaction.channelId);
    await interaction.reply({
      content: `❌ Bu ticket az önce <@${recheck?.claimedById}> tarafından sahiplenildi.`,
      ephemeral: true,
    });
    return;
  }

  const originalEmbed = interaction.message.embeds[0];
  const updatedEmbed = originalEmbed
    ? EmbedBuilder.from(originalEmbed).addFields({
        name: "🙋 Sahiplenen",
        value: `<@${interaction.user.id}>`,
      })
    : new EmbedBuilder().setDescription(`Sahiplenen: <@${interaction.user.id}>`);

  const firstRow = interaction.message.components[0];
  const closeButton =
    firstRow && firstRow.type === ComponentType.ActionRow
      ? firstRow.components.find(
          (c) => c.type === ComponentType.Button && "customId" in c && c.customId?.startsWith(TICKET_CLOSE_PREFIX)
        )
      : undefined;

  const closeButtonCustomId =
    closeButton && "customId" in closeButton && closeButton.customId
      ? closeButton.customId
      : `${TICKET_CLOSE_PREFIX}${interaction.user.id}`;

  const updatedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(TICKET_CLAIM_ID)
      .setLabel(`🙋 Sahiplenildi: ${interaction.user.username}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(closeButtonCustomId)
      .setLabel("🔒 Ticketi Kapat")
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.update({ embeds: [updatedEmbed], components: [updatedRow] });

  const logChannel = await getTicketLogChannel(guild);
  if (logChannel) {
    const logEmbed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle("🙋 Ticket Sahiplenildi")
      .addFields(
        { name: "Sahiplenen", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Kanal", value: `<#${interaction.channelId}>`, inline: true }
      )
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  }
}

export async function handleTicketCloseButton(
  interaction: ButtonInteraction
): Promise<void> {
  const guild = interaction.guild;
  const member = interaction.member;
  if (!guild || !member || !("roles" in member)) {
    await interaction.reply({
      content: "❌ Bu işlem sadece sunucuda yapılabilir.",
      ephemeral: true,
    });
    return;
  }

  const isAuthorized =
    memberHasRoleNamed(member as GuildMember, YETKILI_ROLE_NAME) ||
    memberHasRoleNamed(member as GuildMember, YONETICI_ROLE_NAME);

  if (!isAuthorized) {
    await interaction.reply({
      content: `❌ Bu ticket'ı sadece **${YETKILI_ROLE_NAME}** veya **${YONETICI_ROLE_NAME}** kapatabilir.`,
      ephemeral: true,
    });
    return;
  }

  const claim = getTicketClaim(interaction.channelId);
  const isYonetici = memberHasRoleNamed(member as GuildMember, YONETICI_ROLE_NAME);
  if (claim && claim.claimedById !== interaction.user.id && !isYonetici) {
    await interaction.reply({
      content: `❌ Bu ticket <@${claim.claimedById}> tarafından sahiplenilmiş. Sadece o veya bir **${YONETICI_ROLE_NAME}** kapatabilir.`,
      ephemeral: true,
    });
    return;
  }

  const openedById = interaction.customId.slice(TICKET_CLOSE_PREFIX.length);
  const channelName = interaction.channel && "name" in interaction.channel
    ? (interaction.channel as { name: string }).name
    : "bilinmiyor";

  addTicketClose({
    guildId: guild.id,
    channelId: interaction.channelId,
    openedById,
    closedById: interaction.user.id,
    timestamp: Date.now(),
  });

  removeTicketClaim(interaction.channelId);

  await interaction.reply("🔒 Bu ticket 5 saniye içinde kapatılacak...");

  const logChannel = await getTicketLogChannel(guild);
  if (logChannel) {
    const logEmbed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle("🔒 Ticket Kapatıldı")
      .addFields(
        { name: "Açan", value: `<@${openedById}>`, inline: true },
        { name: "Kapatan", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Kanal", value: `#${channelName}`, inline: true }
      )
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  }

  setTimeout(async () => {
    try {
      const channel = interaction.channel;
      if (channel && "delete" in channel) {
        await (channel as { delete: (reason?: string) => Promise<unknown> }).delete(
          "Ticket kapatıldı"
        );
      }
    } catch (err) {
      console.error("Ticket kapatma hatası:", err);
    }
  }, 5000);
}
