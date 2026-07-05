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
        opt.setName("kullanici").setDescription("DM gönderilecek kullanıcıyı @etiketle").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("mesaj").setDescription("Gönderilecek mesaj").setRequired(true)
      )
  );

const kayitCommand = new SlashCommandBuilder()
  .setName("k")
  .setDescription("Bir kullanıcıyı kayıt et (Sadece Yetkili Rolü)")
  .addUserOption((opt) =>
    opt.setName("kullanici").setDescription("Kayıt edilecek kişi").setRequired(true)
  );

const rolVerCommand = new SlashCommandBuilder()
  .setName("rolver")
  .setDescription("Bir kullanıcıya rol ver (Sadece Yetkili Rolü)")
  .addUserOption((opt) =>
    opt.setName("kisi").setDescription("Rol verilecek kişi").setRequired(true)
  )
  .addRoleOption((opt) =>
    opt.setName("rol").setDescription("Verilecek rol").setRequired(true)
  );

const rolAlCommand = new SlashCommandBuilder()
  .setName("rolal")
  .setDescription("Bir kullanıcıdan rol al (Sadece Yetkili Rolü)")
  .addUserOption((opt) =>
    opt.setName("kisi").setDescription("Rol alınacak kişi").setRequired(true)
  )
  .addRoleOption((opt) =>
    opt.setName("rol").setDescription("Alınacak rol").setRequired(true)
  );

const kayitGorCommand = new SlashCommandBuilder()
  .setName("kayıtgör")
  .setDescription("Kim kaç kişi kayıt etmiş, listesini gösterir (Sadece Yönetici Rolü)");

const kayitSifirlaCommand = new SlashCommandBuilder()
  .setName("kayıtsıfırla")
  .setDescription("Kayıt listesini sıfırlar (Sadece Yönetici Rolü)");

const ticketPanelCommand = new SlashCommandBuilder()
  .setName("ticketpanel")
  .setDescription("Bu kanala destek talebi (ticket) panelini gönderir (Sadece Yönetici Rolü)");

export async function registerCommands(client: Client): Promise<void> {
  const token = process.env.DISCORD_TOKEN!;
  const rest = new REST({ version: "10" }).setToken(token);
  const guilds = client.guilds.cache;

  if (guilds.size === 0) {
    console.log("Hiç sunucu bulunamadı — komutlar kaydedilemedi.");
    return;
  }

  const commands = [
    dmCommand.toJSON(),
    kayitCommand.toJSON(),
    rolVerCommand.toJSON(),
    rolAlCommand.toJSON(),
    kayitGorCommand.toJSON(),
    kayitSifirlaCommand.toJSON(),
    ticketPanelCommand.toJSON(),
  ];

  for (const [, guild] of guilds) {
    try {
      await rest.put(
        Routes.applicationGuildCommands(client.user!.id, guild.id),
        { body: commands }
      );
      console.log(`✅ Komutlar "${guild.name}" sunucusuna kaydedildi.`);
    } catch (err) {
      console.error(`❌ "${guild.name}" sunucusuna komut kaydedilemedi:`, err);
    }
  }
}
