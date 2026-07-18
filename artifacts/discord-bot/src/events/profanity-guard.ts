import { ChannelType, Client, Colors, EmbedBuilder, Message } from "discord.js";
import { findTextChannelByName } from "../lib/permissions.js";

const SPAM_LOG_CHANNEL_NAME = "spam-engel";
const TIMEOUT_DURATION_MS = 24 * 60 * 60 * 1000; // 1 gün
const GENERAL_WARN_LIMIT = 2; // ilk 2 ihlalde uyarı, 3.'de ceza

// Genel ağır küfür/hakaret kök listesi (aile içerikli olanlar dahil).
// Kelime bazlı (tam kelime eşleşmesi) kontrol edilir, yanlış pozitifleri azaltmak için.
const CURSE_WORDS = [
  "amk", "a.m.k", "aq", "a.q", "oç", "oc", "piç", "pic",
  "yavşak", "yavsak", "orospu", "ibne",
  "siktir", "sikeyim", "sikerim", "yarrak", "yarak",
  "şerefsiz", "serefsiz", "kahpe", "pezevenk", "gavat",
  "puşt", "pust", "ananı", "anani",
  "bacını", "bacini", "avradını", "avradini",
];

// Atatürk'e yapılan atıflar — bunlarla birlikte küfür geçen mesajlar özel kategoride işlenir.
const ATATURK_REFERENCES = ["atatürk", "ataturk", "mustafa kemal", "gazi mustafa kemal"];

// Dini değerlere yapılan atıflar.
const RELIGIOUS_REFERENCES = [
  "allah", "peygamber", "muhammed", "muhammet", "kuran", "kur'an", "kur an", "islam", "i̇slam",
];

// key: `${guildId}:${userId}` — genel küfür ihlal sayacı (bot yeniden başlayınca sıfırlanır)
const generalOffenseCount = new Map<string, number>();

function normalize(text: string): string {
  return text.toLocaleLowerCase("tr-TR");
}

function containsCurseWord(normalizedContent: string): boolean {
  // Kelimeleri harf olmayan karakterlerden ayırarak tek tek kontrol ediyoruz
  // (yanlış pozitifleri önlemek için tam kelime eşleşmesi arıyoruz).
  const tokens = normalizedContent.split(/[^a-zçğıöşü.]+/i).filter(Boolean);
  return tokens.some((token) => CURSE_WORDS.includes(token));
}

function containsAny(normalizedContent: string, list: string[]): boolean {
  return list.some((phrase) => normalizedContent.includes(phrase));
}

export function registerProfanityGuard(client: Client): void {
  client.on("messageCreate", async (message: Message) => {
    try {
      if (message.author.bot) return;
      if (!message.guild) return;
      if (message.channel.type !== ChannelType.GuildText) return;

      const content = message.content.trim();
      if (!content) return;

      const normalized = normalize(content);
      const hasCurse = containsCurseWord(normalized);
      if (!hasCurse) return;

      const isAtaturkInsult = containsAny(normalized, ATATURK_REFERENCES);
      const isReligiousInsult = !isAtaturkInsult && containsAny(normalized, RELIGIOUS_REFERENCES);

      if (isAtaturkInsult) {
        await handleSevereViolation(message, "Atatürk'e Küfür/Hakaret", content);
        return;
      }

      if (isReligiousInsult) {
        await handleSevereViolation(message, "Dini Değerlere Küfür/Hakaret", content);
        return;
      }

      await handleGeneralViolation(message, content);
    } catch (err) {
      console.error("[küfür-filtresi] mesaj işlenirken hata:", err);
    }
  });
}

async function deleteMessage(message: Message): Promise<void> {
  await message.delete().catch(() => {});
}

async function applyTimeout(message: Message, reason: string): Promise<boolean> {
  const guild = message.guild;
  if (!guild) return false;
  const member = await guild.members.fetch(message.author.id).catch(() => null);
  if (!member || !member.moderatable) return false;
  try {
    await member.timeout(TIMEOUT_DURATION_MS, reason);
    return true;
  } catch (err) {
    console.error("[küfür-filtresi] zaman aşımı uygulanamadı:", err);
    return false;
  }
}

async function logToSpamChannel(
  guild: NonNullable<Message["guild"]>,
  title: string,
  userId: string,
  channelId: string,
  reason: string,
  messageContent: string,
  timeoutApplied: boolean
): Promise<void> {
  const logChannel = await findTextChannelByName(guild, SPAM_LOG_CHANNEL_NAME);
  if (!logChannel) {
    console.warn(`[küfür-filtresi] "${SPAM_LOG_CHANNEL_NAME}" kanalı bulunamadı, log gönderilemedi.`);
    return;
  }
  const embed = new EmbedBuilder()
    .setColor(Colors.Red)
    .setTitle(title)
    .addFields(
      { name: "Kullanıcı", value: `<@${userId}>`, inline: true },
      { name: "Kanal", value: `<#${channelId}>`, inline: true },
      { name: "Sebep", value: reason, inline: false },
      {
        name: "Zaman Aşımı",
        value: timeoutApplied ? "✅ 1 gün uygulandı" : "⚠️ Uygulanamadı (yetki/rol sıralaması olabilir)",
        inline: false,
      },
      { name: "Mesaj İçeriği", value: messageContent.slice(0, 1000) || "*[boş]*", inline: false }
    )
    .setTimestamp();
  await logChannel.send({ embeds: [embed] }).catch(() => {});
}

async function handleSevereViolation(message: Message, reason: string, content: string): Promise<void> {
  const guild = message.guild;
  const channel = message.channel;
  if (!guild || channel.type !== ChannelType.GuildText) return;

  await deleteMessage(message);

  try {
    await channel.send(
      `🚫 <@${message.author.id}> **${reason}** nedeniyle mesajın silindi ve **1 gün** susturuldun. Bu tür içeriklere sunucumuzda izin verilmiyor.`
    );
  } catch (err) {
    console.error("[küfür-filtresi] uyarı mesajı gönderilemedi:", err);
  }

  const timeoutApplied = await applyTimeout(message, reason);
  await logToSpamChannel(guild, `🚫 ${reason}`, message.author.id, channel.id, reason, content, timeoutApplied);
}

async function handleGeneralViolation(message: Message, content: string): Promise<void> {
  const guild = message.guild;
  const channel = message.channel;
  if (!guild || channel.type !== ChannelType.GuildText) return;

  const key = `${guild.id}:${message.author.id}`;
  const count = (generalOffenseCount.get(key) ?? 0) + 1;
  generalOffenseCount.set(key, count);

  await deleteMessage(message);

  if (count <= GENERAL_WARN_LIMIT) {
    try {
      await channel.send(
        `⚠️ <@${message.author.id}> lütfen küfür/hakaret içerikli mesaj atma! (${count}/${GENERAL_WARN_LIMIT + 1} uyarı — bir sonraki ihlalde 1 gün susturulursun)`
      );
    } catch (err) {
      console.error("[küfür-filtresi] uyarı mesajı gönderilemedi:", err);
    }
    return;
  }

  // Limit aşıldı — cezalandır ve sayaç sıfırla.
  generalOffenseCount.delete(key);

  const reason = `Tekrarlı küfür/hakaret (${count}. ihlal)`;
  try {
    await channel.send(
      `🚫 <@${message.author.id}> tekrar tekrar küfür ettiğin için **1 gün** susturuldun.`
    );
  } catch (err) {
    console.error("[küfür-filtresi] ceza mesajı gönderilemedi:", err);
  }

  const timeoutApplied = await applyTimeout(message, reason);
  await logToSpamChannel(guild, "🚫 Tekrarlı Küfür/Hakaret", message.author.id, channel.id, reason, content, timeoutApplied);
}
