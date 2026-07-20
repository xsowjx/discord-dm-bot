import {
  ChatInputCommandInteraction,
  PermissionsBitField,
  ChannelType,
  Colors,
  EmbedBuilder,
  OverwriteType,
  CategoryChannel,
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
import { buildTicketPanelMessage } from "./ticket.js";

const DM_LOG_CHANNEL_NAME = "bot-dm";
const INVITE_LOG_CHANNEL_NAME = "davet-log";
const SPAM_LOG_CHANNEL_NAME = "spam-engel";
const WELCOME_CHANNEL_NAME = "hoşgeldin";
const TICKET_CATEGORY_NAME = "Ticketlar";
const LOG_CATEGORY_NAME = "Loglar";
const KAYITSIZ_CATEGORY_NAME = "Kayıt Ol";
const KAYITSIZ_VOICE_CHANNEL_NAMES = ["kayıt sesli 1", "kayıt sesli 2", "kayıt sesli 3"];
const KAYITSIZ_CHAT_CHANNEL_NAME = "kayıtsız-sohbet";
// Kayıtsız rolünün görebileceği TEK kanallar bunlar (+ hoşgeldin, herkese açık olduğu için zaten görünür).
const KAYITSIZ_ALLOWED_CHANNEL_NAMES = [
  ...KAYITSIZ_VOICE_CHANNEL_NAMES,
  KAYITSIZ_CHAT_CHANNEL_NAME,
  WELCOME_CHANNEL_NAME,
].map((n) => n.toLowerCase());

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
  const kayitsizRole = await ensureRole(KAYITSIZ_ROLE_NAME, Colors.Grey);

  // "Loglar" kategorisini hazırlıyoruz — tüm log kanalları bunun altına toplanacak,
  // böylece kanallar dağınık/kategorisiz görünmeyecek ve Discord'da düzgün taşınabilecek.
  let logCategory: CategoryChannel | undefined;
  try {
    await guild.channels.fetch();
    logCategory = guild.channels.cache.find(
      (ch) => ch.type === ChannelType.GuildCategory && ch.name.toLowerCase() === LOG_CATEGORY_NAME.toLowerCase()
    ) as CategoryChannel | undefined;
    if (!logCategory) {
      logCategory = await guild.channels.create({ name: LOG_CATEGORY_NAME, type: ChannelType.GuildCategory });
      createdChannels.push(`${LOG_CATEGORY_NAME} (kategori)`);
    } else {
      existingChannels.push(`${LOG_CATEGORY_NAME} (kategori)`);
    }
  } catch (err) {
    errors.push(`"${LOG_CATEGORY_NAME}" kategorisi oluşturulamadı: (${(err as Error).message})`);
  }

  function buildLogChannelOverwrites(): {
    id: string;
    type: OverwriteType;
    allow?: bigint[];
    deny?: bigint[];
  }[] {
    const overwrites: {
      id: string;
      type: OverwriteType;
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

    // NOT: Yetkili Ekibi artık bu kanalları göremiyor — sadece Yonetici Rolu
    // ve gerçek "Yönetici" (Administrator) yetkisine sahip roller görebilir.

    // İsmi ne olursa olsun, sunucuda gerçek "Yönetici" (Administrator) yetkisine
    // sahip TÜM rollere de görünürlük ver — sadece botun oluşturduğu isme bağlı kalma.
    const adminRoles = guild!.roles.cache.filter(
      (role) =>
        role.id !== guild!.roles.everyone.id &&
        role.permissions.has(PermissionsBitField.Flags.Administrator) &&
        role.id !== yoneticiRole?.id
    );
    for (const role of adminRoles.values()) {
      overwrites.push({
        id: role.id,
        type: OverwriteType.Role,
        allow: [PermissionsBitField.Flags.ViewChannel],
      });
    }

    // Komutu çalıştıran kişiye de garanti olsun diye özel olarak görünürlük ver.
    overwrites.push({
      id: interaction.user.id,
      type: OverwriteType.Member,
      allow: [PermissionsBitField.Flags.ViewChannel],
    });

    return overwrites;
  }

  async function ensureLogChannel(name: string) {
    const existing = await findTextChannelByName(guild!, name);
    if (existing) {
      existingChannels.push(name);
      // Zaten var olan kanalın izinlerini de düzeltiyoruz — belki daha önce
      // yanlış/eksik rol yüzünden kimse göremiyordu, bu tekrar çalıştırınca düzelir.
      try {
        await existing.permissionOverwrites.set(buildLogChannelOverwrites());
      } catch (err) {
        errors.push(`#${name} izinleri güncellenemedi (${(err as Error).message})`);
      }
      // Kanal doğru kategoride değilse (örn. daha önce kategorisiz oluşmuşsa) taşıyoruz.
      if (logCategory && existing.parentId !== logCategory.id) {
        try {
          await existing.setParent(logCategory.id, { lockPermissions: false });
        } catch (err) {
          errors.push(`#${name} "${LOG_CATEGORY_NAME}" kategorisine taşınamadı (${(err as Error).message})`);
        }
      }
      return existing;
    }
    try {
      const overwrites = buildLogChannelOverwrites();

      const channel = await guild!.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: logCategory?.id,
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

  // "hoşgeldin" kanalı diğerlerinin aksine HERKESE AÇIK olmalı (gizli değil),
  // bu yüzden ayrı ve özel izinsiz (varsayılan görünür) olarak oluşturuluyor.
  try {
    const existingWelcome = await findTextChannelByName(guild, WELCOME_CHANNEL_NAME);
    if (existingWelcome) {
      existingChannels.push(`#${WELCOME_CHANNEL_NAME}`);
    } else {
      await guild.channels.create({
        name: WELCOME_CHANNEL_NAME,
        type: ChannelType.GuildText,
      });
      createdChannels.push(`#${WELCOME_CHANNEL_NAME} (herkese açık)`);
    }
  } catch (err) {
    errors.push(`#${WELCOME_CHANNEL_NAME} oluşturulamadı (${(err as Error).message})`);
  }

  const TICKET_SUPPORT_CHANNEL_NAME = "destek-kanali";
  try {
    await guild.channels.fetch(); // cache güncel olmayabilir, garantiye alıyoruz
    let ticketCategory = guild.channels.cache.find(
      (ch) =>
        ch.type === ChannelType.GuildCategory &&
        ch.name.toLowerCase() === TICKET_CATEGORY_NAME.toLowerCase()
    );

    if (!ticketCategory) {
      ticketCategory = await guild.channels.create({
        name: TICKET_CATEGORY_NAME,
        type: ChannelType.GuildCategory,
      });
      console.log(`[kurulum] "${TICKET_CATEGORY_NAME}" kategorisi oluşturuldu (id: ${ticketCategory.id}).`);
      createdChannels.push(`${TICKET_CATEGORY_NAME} (kategori)`);
    } else {
      existingChannels.push(`${TICKET_CATEGORY_NAME} (kategori)`);
    }

    const existingSupportChannel = await findTextChannelByName(guild, TICKET_SUPPORT_CHANNEL_NAME);
    if (!existingSupportChannel) {
      const supportChannel = await guild.channels.create({
        name: TICKET_SUPPORT_CHANNEL_NAME,
        type: ChannelType.GuildText,
        parent: ticketCategory.id,
      });
      await supportChannel.send(buildTicketPanelMessage());
      createdChannels.push(`#${TICKET_SUPPORT_CHANNEL_NAME} (ticket paneli postalandı)`);
    } else {
      existingChannels.push(`#${TICKET_SUPPORT_CHANNEL_NAME}`);
    }
  } catch (err) {
    console.error("[kurulum] Ticket kategorisi/kanalı oluşturulamadı:", err);
    errors.push(`Ticket kategorisi/kanalı oluşturulamadı: (${(err as Error).message})`);
  }

  // --- Kayıtsız rolü için özel "Kayıt Ol" kategorisi ve kanalları ---
  try {
    await guild.channels.fetch();
    let kayitsizCategory = guild.channels.cache.find(
      (ch) =>
        ch.type === ChannelType.GuildCategory &&
        ch.name.toLowerCase() === KAYITSIZ_CATEGORY_NAME.toLowerCase()
    ) as CategoryChannel | undefined;

    if (!kayitsizCategory) {
      kayitsizCategory = await guild.channels.create({
        name: KAYITSIZ_CATEGORY_NAME,
        type: ChannelType.GuildCategory,
      });
      createdChannels.push(`${KAYITSIZ_CATEGORY_NAME} (kategori)`);
    } else {
      existingChannels.push(`${KAYITSIZ_CATEGORY_NAME} (kategori)`);
    }

    for (const voiceName of KAYITSIZ_VOICE_CHANNEL_NAMES) {
      const existingVoice = guild.channels.cache.find(
        (ch) => ch.type === ChannelType.GuildVoice && ch.name.toLowerCase() === voiceName.toLowerCase()
      );
      if (existingVoice) {
        existingChannels.push(`🔊 ${voiceName}`);
      } else {
        await guild.channels.create({
          name: voiceName,
          type: ChannelType.GuildVoice,
          parent: kayitsizCategory.id,
        });
        createdChannels.push(`🔊 ${voiceName}`);
      }
    }

    const existingKayitsizChat = await findTextChannelByName(guild, KAYITSIZ_CHAT_CHANNEL_NAME);
    if (existingKayitsizChat) {
      existingChannels.push(`#${KAYITSIZ_CHAT_CHANNEL_NAME}`);
    } else {
      await guild.channels.create({
        name: KAYITSIZ_CHAT_CHANNEL_NAME,
        type: ChannelType.GuildText,
        parent: kayitsizCategory.id,
      });
      createdChannels.push(`#${KAYITSIZ_CHAT_CHANNEL_NAME}`);
    }
  } catch (err) {
    errors.push(`Kayıtsız kanalları oluşturulamadı: (${(err as Error).message})`);
  }

  // --- Kayıtsız rolü SADECE izin verilen kanalları görebilsin, geri kalan HER ŞEY gizli olsun ---
  if (kayitsizRole) {
    try {
      await guild.channels.fetch();
      const allChannels = guild.channels.cache.filter(
        (ch) => ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildVoice
      );
      let restrictedCount = 0;
      let allowedCount = 0;
      for (const ch of allChannels.values()) {
        const isAllowed = KAYITSIZ_ALLOWED_CHANNEL_NAMES.includes(ch.name.toLowerCase());
        try {
          if (isAllowed) {
            await ch.permissionOverwrites.edit(kayitsizRole.id, {
              ViewChannel: true,
              ...(ch.type === ChannelType.GuildVoice ? { Connect: true } : {}),
            });
            allowedCount++;
          } else {
            await ch.permissionOverwrites.edit(kayitsizRole.id, { ViewChannel: false });
            restrictedCount++;
          }
        } catch (err) {
          errors.push(`#${ch.name} için Kayıtsız izni ayarlanamadı (${(err as Error).message})`);
        }
      }
      existingChannels.push(
        `Kayıtsız izinleri: ${allowedCount} kanal görünür bırakıldı, ${restrictedCount} kanal gizlendi`
      );
    } catch (err) {
      errors.push(`Kayıtsız izin taraması başarısız oldu: (${(err as Error).message})`);
    }
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
