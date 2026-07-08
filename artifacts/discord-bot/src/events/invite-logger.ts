import {
  ChannelType,
  Client,
  Colors,
  EmbedBuilder,
  GuildMember,
  Invite,
  TextChannel,
} from "discord.js";

const LOG_CHANNEL_NAME = "davet-log";

// guildId -> Map(inviteCode -> { uses, inviterTag, inviterId })
const inviteCache = new Map<string, Map<string, { uses: number; inviterTag: string | null; inviterId: string | null }>>();

async function cacheGuildInvites(guild: import("discord.js").Guild): Promise<void> {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map<string, { uses: number; inviterTag: string | null; inviterId: string | null }>();
    for (const invite of invites.values()) {
      map.set(invite.code, {
        uses: invite.uses ?? 0,
        inviterTag: invite.inviter?.tag ?? null,
        inviterId: invite.inviter?.id ?? null,
      });
    }
    if (guild.features.includes("VANITY_URL")) {
      try {
        const vanity = await guild.fetchVanityData();
        map.set("VANITY", { uses: vanity.uses ?? 0, inviterTag: "Vanity URL", inviterId: null });
      } catch {}
    }
    inviteCache.set(guild.id, map);
  } catch (err) {
    console.error(`[davet-log] "${guild.name}" davetleri cache'lenemedi:`, (err as Error).message);
  }
}

function findLogChannel(guild: import("discord.js").Guild): TextChannel | undefined {
  return guild.channels.cache.find(
    (ch) => ch.type === ChannelType.GuildText && ch.name.toLowerCase() === LOG_CHANNEL_NAME
  ) as TextChannel | undefined;
}

export function registerInviteLogger(client: Client): void {
  client.once("ready", async (readyClient) => {
    for (const guild of readyClient.guilds.cache.values()) {
      await cacheGuildInvites(guild);
    }
    console.log("[davet-log] Tüm sunucuların davetleri cache'lendi.");
  });

  client.on("guildCreate", async (guild) => {
    await cacheGuildInvites(guild);
  });

  client.on("inviteCreate", async (invite: Invite) => {
    const guild = invite.guild;
    if (!guild || !("id" in guild)) return;
    const map = inviteCache.get(guild.id) ?? new Map();
    map.set(invite.code, {
      uses: invite.uses ?? 0,
      inviterTag: invite.inviter?.tag ?? null,
      inviterId: invite.inviter?.id ?? null,
    });
    inviteCache.set(guild.id, map);
  });

  client.on("inviteDelete", (invite: Invite) => {
    const guild = invite.guild;
    if (!guild || !("id" in guild)) return;
    inviteCache.get(guild.id)?.delete(invite.code);
  });

  client.on("guildMemberAdd", async (member: GuildMember) => {
    console.log(`[davet-log] ${member.user.tag} sunucuya katıldı, işleniyor...`);
    try {
      const guild = member.guild;
      const oldInvites = inviteCache.get(guild.id) ?? new Map();

      let newInvites: Map<string, Invite> = new Map();
      let fetchError: string | null = null;
      try {
        const fetched = await guild.invites.fetch();
        newInvites = new Map(fetched.map((inv) => [inv.code, inv]));
      } catch (err) {
        fetchError = (err as Error).message;
        console.error("[davet-log] Davetler çekilemedi (izin eksik olabilir):", fetchError);
      }

      let usedInvite: Invite | null = null;
      for (const invite of newInvites.values()) {
        const old = oldInvites.get(invite.code);
        const oldUses = old ? old.uses : 0;
        if ((invite.uses ?? 0) > oldUses) {
          usedInvite = invite;
          break;
        }
      }

      let vanityUsed = false;
      if (!usedInvite && guild.features.includes("VANITY_URL")) {
        try {
          const vanity = await guild.fetchVanityData();
          const oldVanity = oldInvites.get("VANITY");
          const oldUses = oldVanity ? oldVanity.uses : 0;
          if ((vanity.uses ?? 0) > oldUses) vanityUsed = true;
        } catch {}
      }

      // Cache'i güncelle
      cacheGuildInvites(guild).catch(() => {});

      const logChannel = findLogChannel(guild);
      if (!logChannel) {
        console.warn(`[davet-log] "${LOG_CHANNEL_NAME}" adında kanal bulunamadı.`);
        return;
      }

      const invitedUser = member.user;
      const inviterUser = usedInvite?.inviter ?? null;

      let davetEdenValue: string;
      if (inviterUser) {
        davetEdenValue = `${inviterUser} (${inviterUser.tag})`;
      } else if (vanityUsed) {
        davetEdenValue = "Sunucunun özel (vanity) davet linki";
      } else if (fetchError) {
        davetEdenValue = 'Tespit edilemedi (bota "Sunucuyu Yönet" izni eksik olabilir)';
      } else {
        davetEdenValue = "Tespit edilemedi (link süresi dolmuş olabilir)";
      }

      const accountCreatedTs = Math.floor(invitedUser.createdTimestamp / 1000);
      const joinedTs = Math.floor((member.joinedTimestamp ?? Date.now()) / 1000);

      const embed = new EmbedBuilder()
        .setColor(inviterUser ? Colors.Green : Colors.Red)
        .setThumbnail(invitedUser.displayAvatarURL({ size: 256 }))
        .setTitle("📥 Yeni Üye Katıldı")
        .addFields(
          { name: "Davet Eden", value: davetEdenValue, inline: true },
          { name: "Davet Edilen", value: `${invitedUser} (${invitedUser.tag})`, inline: true },
          {
            name: "Discord'a Kayıt Tarihi",
            value: `<t:${accountCreatedTs}:F> (<t:${accountCreatedTs}:R>)`,
            inline: false,
          },
          {
            name: "Sunucuya Katılma Tarihi",
            value: `<t:${joinedTs}:F> (<t:${joinedTs}:R>)`,
            inline: false,
          }
        )
        .setFooter({ text: `Kullanıcı ID: ${invitedUser.id}` })
        .setTimestamp();

      await logChannel.send({ embeds: [embed] });
      console.log(`[davet-log] ${invitedUser.tag} için log mesajı gönderildi.`);
    } catch (err) {
      console.error("[davet-log] Beklenmeyen hata:", err);
    }
  });
}
