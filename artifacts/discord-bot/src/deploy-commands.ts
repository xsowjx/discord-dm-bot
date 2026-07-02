import { REST, Routes, SlashCommandBuilder } from "discord.js";
    import type { Client } from "discord.js";

    const dmCommand = new SlashCommandBuilder()
      .setName("dm")
      .setDescription("Kullanıcılara DM gönder (Sadece yetkililer)")
      .addSubcommand((sub) =>
        sub
          .setName("user")
          .setDescription("Belirli bir kullanıcıya DM gönder")
          .addUserOption((opt) =>
            opt
              .setName("kullanici")
              .setDescription("DM gönderilecek kullanıcıyı @etiketle")
              .setRequired(true)
          )
          .addStringOption((opt) =>
            opt
              .setName("mesaj")
              .setDescription("Gönderilecek mesaj")
              .setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("all")
          .setDescription("Sunucudaki herkese DM gönder")
          .addStringOption((opt) =>
            opt
              .setName("mesaj")
              .setDescription("Gönderilecek mesaj")
              .setRequired(true)
          )
          .addIntegerOption((opt) =>
            opt
              .setName("baslangic")
              .setDescription("Kaçıncı kişiden başlansın? (kaldığın yerden devam et)")
              .setRequired(false)
              .setMinValue(1)
          )
      );

    const sesgelCommand = new SlashCommandBuilder()
      .setName("sesgel")
      .setDescription("Ses kanalına gir ve metin oku, sonra çık (Sadece Yetkili Ekibi)")
      .addStringOption((opt) =>
        opt
          .setName("metin")
          .setDescription("Botun sesli okuyacağı metin")
          .setRequired(true)
      );

    export async function registerCommands(client: Client<true>): Promise<void> {
      const token = process.env.DISCORD_TOKEN!;
      const rest = new REST({ version: "10" }).setToken(token);
      const guilds = client.guilds.cache;

      if (guilds.size === 0) {
        console.log("Hiç sunucu bulunamadı — komutlar kaydedilemedi.");
        return;
      }

      for (const [, guild] of guilds) {
        try {
          await rest.put(
            Routes.applicationGuildCommands(client.user.id, guild.id),
            { body: [dmCommand.toJSON(), sesgelCommand.toJSON()] }
          );
          console.log(`✅ Komutlar "${guild.name}" sunucusuna kaydedildi.`);
        } catch (err) {
          console.error(`❌ "${guild.name}" sunucusuna komut kaydedilemedi:`, err);
        }
      }
    }
  