import { ChannelType, Guild, GuildMember, TextChannel } from "discord.js";

// Bu isimler, sunucundaki rol/kanal isimleriyle BİREBİR (büyük/küçük harf önemli değil) eşleşmeli.
export const YETKILI_ROLE_NAME = "Yetkili Ekibi";
export const YONETICI_ROLE_NAME = "Yonetici Rolu";
export const KAYITSIZ_ROLE_NAME = "Kayıtsız";
export const ACEMI_ROLE_NAME = "Acemi";
export const LOG_CHANNEL_NAME = "kayıtgörme";

export function findRoleByName(guild: Guild, name: string) {
  return guild.roles.cache.find(
    (role) => role.name.trim().toLowerCase() === name.trim().toLowerCase()
  );
}

export function memberHasRoleNamed(member: GuildMember, name: string): boolean {
  return member.roles.cache.some(
    (role) => role.name.trim().toLowerCase() === name.trim().toLowerCase()
  );
}

export function getHighestRolePosition(member: GuildMember): number {
  return member.roles.highest.position;
}

export async function getLogChannel(guild: Guild): Promise<TextChannel | undefined> {
  let channel = guild.channels.cache.find(
    (ch) => ch.type === ChannelType.GuildText &&
    ch.name.toLowerCase() === LOG_CHANNEL_NAME.toLowerCase()
  ) as TextChannel | undefined;

  if (!channel) {
    const fetched = await guild.channels.fetch();
    channel = fetched.find(
      (ch) => ch?.type === ChannelType.GuildText &&
      ch?.name?.toLowerCase() === LOG_CHANNEL_NAME.toLowerCase()
    ) as TextChannel | undefined;
  }

  return channel;
}
