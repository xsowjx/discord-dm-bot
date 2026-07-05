import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  Colors,
  GuildMember,
} from "discord.js";
import {
  YETKILI_ROLE_NAME,
  YONETICI_ROLE_NAME,
  findRoleByName,
  memberHasRoleNamed,
} from "../lib/permissions.js";

export const TICKET_OPEN_ID = "ticket_open";
export const TICKET_CLOSE_PREFIX = "ticket_close_";
const TICKET_CATEGORY_NAME = "Ticketlar";

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

  await interaction.reply({ embeds: [embed], components: [row] });
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

    const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${TICKET_CLOSE_PREFIX}${interaction.user.id}`)
        .setLabel("🔒 Ticketi Kapat")
        .setStyle(ButtonStyle.Danger)
    );

    await ticketChannel.send({
      content: `<@${interaction.user.id}>`,
      embeds: [welcomeEmbed],
      components: [closeRow],
    });

    await interaction.editReply(`✅ Ticket'ın oluşturuldu: <#${ticketChannel.id}>`);
  } catch (err) {
    console.error("Ticket açma hatası:", err);
    await interaction.editReply(
      "❌ Ticket açılırken bir hata oluştu. Botun sunucuda \"Kanalları Yönet\" iznine sahip olduğundan emin ol."
    );
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

  await interaction.reply("🔒 Bu ticket 5 saniye içinde kapatılacak...");

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
