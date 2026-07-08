import {
  ChannelType,
  Client,
  Colors,
  EmbedBuilder,
  Message,
} from "discord.js";
import { findTextChannelByName } from "../lib/permissions.js";

const SPAM_LOG_CHANNEL_NAME = "spam-engel";
const WARNING_THRESHOLD = 4; // aynı mesaj bu sayıya ulaşınca sadece uyarı verilir
const PUNISH_THRESHOLD = 9; // aynı mesaj bu sayıya ulaşınca silinir + timeout uygulanır
const TIMEOUT_DURATION_MS = 24 * 60 * 60 * 1000; // 1 gün

interface SpamTracker {
  content: string;
  count: number;
  messages: Message[];
  warned: boolean;
}

// key: `${guildId}:${userId}:${channelId}`
const spamMap = new Map<string, SpamTracker>();

export function registerSpamGuard(client: Client): void {
  client.on("messageCreate", async (message: Message) => {
    try {
      if (message.author.bot) return;
      if (!message.guild) return;
      if (message.channel.type !== ChannelType.GuildText) return;

      const content = message.content.trim();
      if (!content) return; // sadece dosya/resim atılan mesajları takip etme

      const key = `${message.guild.id}:${message.author.id}:${message.channel.id}`;
      const existing = spamMap.get(key);

      let tracker: SpamTracker;
      if (existing && existing.content === content) {
        existing.count += 1;
        existing.messages.push(message);
        tracker = existing;
      } else {
        tracker = { content, count: 1, messages: [message], warned: false };
        spamMap.set(key, tracker);
      }

      if (tracker.count >= PUNISH_THRESHOLD) {
        spamMap.delete(key); // aynı seri için tekrar tetiklenmesin
        await handleSpamDetected(message, tracker);
      } else if (tracker.count >= WARNING_THRESHOLD && !tracker.warned) {
        tracker.warned = true;
        await handleSpamWarning(message, tracker);
      }
    } catch (err) {
      console.error("[spam-engel] mesaj işlenirken hata:", err);
    }
  });
}

async function handleSpamWarning(message: Message, tracker: SpamTracker): Promise<void> {
  const channel = message.channel;
  if (channel.type !== ChannelType.GuildText) return;

  try {
    await channel.send(`⚠️ <@${message.author.id}> dur aga spam atma!`);
  } catch (err) {
    console.error("[spam-engel] uyarı mesajı gönderilemedi:", err);
  }
}

async function handleSpamDetected(message: Message, tracker: SpamTracker): Promise<void> {
  const guild = message.guild;
  const channel = message.channel;
  if (!guild || channel.type !== ChannelType.GuildText) return;

  try {
    await channel.send(
      `🚫 <@${message.author.id}> dur bakalım, spam atma! Aynı mesajı **${tracker.count}** kez üst üste attığın için mesajların silindi ve **1 gün** susturuldun.`
    );
  } catch (err) {
    console.error("[spam-engel] uyarı mesajı gönderilemedi:", err);
  }

  try {
    const ids = tracker.messages.map((m) => m.id);
    await channel.bulkDelete(ids, true).catch(async () => {
      for (const m of tracker.messages) {
        await m.delete().catch(() => {});
      }
    });
  } catch (err) {
    console.error("[spam-engel] mesajlar silinemedi:", err);
  }

  let timeoutApplied = false;
  const member = await guild.members.fetch(message.author.id).catch(() => null);
  if (member) {
    try {
      if (member.moderatable) {
        await member.timeout(
          TIMEOUT_DURATION_MS,
          `Spam engelleme: aynı mesaj ${tracker.count} kez üst üste atıldı`
        );
        timeoutApplied = true;
      }
    } catch (err) {
      console.error("[spam-engel] zaman aşımı uygulanamadı:", err);
    }
  }

  const logChannel = await findTextChannelByName(guild, SPAM_LOG_CHANNEL_NAME);
  if (logChannel) {
    const embed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle("🚫 Spam Engellendi")
      .addFields(
        { name: "Kullanıcı", value: `<@${message.author.id}>`, inline: true },
        { name: "Kanal", value: `<#${channel.id}>`, inline: true },
        { name: "Tekrar Sayısı", value: `${tracker.count}`, inline: true },
        {
          name: "Zaman Aşımı",
          value: timeoutApplied
            ? "✅ 1 gün uygulandı"
            : "⚠️ Uygulanamadı (bot yetkisi/rol sıralaması yetersiz olabilir)",
          inline: false,
        },
        {
          name: "Gönderilen Mesaj",
          value: tracker.content.slice(0, 1000) || "*[boş]*",
          inline: false,
        }
      )
      .setTimestamp();
    await logChannel.send({ embeds: [embed] }).catch(() => {});
  } else {
    console.warn(
      `[spam-engel] "${SPAM_LOG_CHANNEL_NAME}" isimli bir kanal bulunamadı, log gönderilemedi.`
    );
  }
}
