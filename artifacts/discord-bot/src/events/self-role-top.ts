import { Client, Events, Guild } from "discord.js";

/**
 * Bot bir sunucuya katıldığında (veya zaten katılmış olduğu sunucularda bot
 * açılışta), kendi rolünü mümkün olduğunca en üste taşımaya çalışır.
 *
 * NOT: Discord'un hiyerarşi kuralı yüzünden bot, o anki en yüksek rolünün
 * ÜZERİNDE olan bir role asla kendi kendine geçemez (sunucu sahibinin rolü,
 * ya da botun erişemediği başka bir rol gibi). Bu durumda taşıma başarısız
 * olur ve sessizce loglanır — elle bir kere sürüklemek gerekebilir.
 */
export function registerSelfRoleTop(client: Client): void {
  client.on(Events.GuildCreate, async (guild) => {
    await moveSelfRoleToTop(guild);
  });

  client.once(Events.ClientReady, async (readyClient) => {
    for (const guild of readyClient.guilds.cache.values()) {
      await moveSelfRoleToTop(guild);
    }
  });
}

async function moveSelfRoleToTop(guild: Guild): Promise<void> {
  try {
    const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    if (!me) return;

    const myRole = me.roles.highest;
    if (!myRole || myRole.id === guild.id) return; // sadece @everyone'a sahipse yapacak bir şey yok

    const highestOther = guild.roles.cache
      .filter((r) => r.id !== myRole.id && r.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .first();

    const targetPosition = highestOther
      ? highestOther.position + 1
      : Math.max(guild.roles.cache.size - 1, 1);

    if (myRole.position >= targetPosition) return; // zaten yeterince yüksek, yapacak bir şey yok

    await myRole.setPosition(targetPosition);
    console.log(`[bot-rol-en-ust] "${guild.name}" sunucusunda bot rolü en üste taşındı.`);
  } catch (err) {
    console.warn(
      `[bot-rol-en-ust] "${guild.name}" sunucusunda bot rolü taşınamadı (muhtemelen hiyerarşi kısıtlaması): ${(err as Error).message}`
    );
  }
}
