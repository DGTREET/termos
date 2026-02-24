const { Client, GatewayIntentBits, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const express = require('express');
require('dotenv').config();

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN || '' });
const payment = new Payment(mpClient);
const app = express();
app.use(express.json());

// BANCO DE DADOS TEMPORÁRIO
let carteiras = {}; 
let codigosGerados = {}; 
let configBot = {
    valorPass: 10.00,
    op1: 10.00, op2: 30.00, op3: 50.00,
    canalLogs: process.env.LOG_STAFF_CHANNEL,
    categoriaTickets: process.env.CATEGORY_TICKETS
};

app.listen(process.env.PORT || 10000);

// --- COMANDOS ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;

    // 1. COMANDO !setgt (PAINEL DE COMPRA E RESGATE DE GIFT)
    if (msg.content === '!setgt' && msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
        setTimeout(() => msg.delete().catch(() => {}), 1000);
        const embed = new EmbedBuilder()
            .setTitle("💳 SISTEMA DE GIFTS")
            .setDescription("Compre saldo via PIX ou resgate seu código GT GIFT abaixo:")
            .setColor("#5865F2");
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_compra').setLabel('Comprar GT GIFT').setStyle(ButtonStyle.Primary).setEmoji('💰'),
            new ButtonBuilder().setCustomId('btn_resgate').setLabel('Resgatar Código').setStyle(ButtonStyle.Secondary).setEmoji('🎁')
        );
        msg.channel.send({ embeds: [embed], components: [row] });
    }

    // 2. COMANDO !setticketpass (PAINEL DE RESGATE DO PASSE)
    if (msg.content === '!setticketpass' && msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
        setTimeout(() => msg.delete().catch(() => {}), 1000);
        const embed = new EmbedBuilder()
            .setTitle("🎫 RESGATE DE PASSE")
            .setDescription("Clique no botão abaixo para usar seu saldo e receber o passe em sua conta.")
            .setFooter({ text: "Certifique-se de ter saldo suficiente na carteira." })
            .setColor("Green");
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_loja_resgatar_pass').setLabel('Resgatar Passe').setStyle(ButtonStyle.Success).setEmoji('🔥')
        );
        msg.channel.send({ embeds: [embed], components: [row] });
    }

    // 3. COMANDO !setsuporte (PAINEL DE SUPORTE)
    if (msg.content === '!setsuporte' && msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
        setTimeout(() => msg.delete().catch(() => {}), 1000);
        const embed = new EmbedBuilder()
            .setTitle("🎧 SUPORTE TÉCNICO")
            .setDescription("Precisa de ajuda? Abra um ticket de atendimento com nossa equipe.")
            .setColor("Red");
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_suporte').setLabel('Abrir Ticket').setStyle(ButtonStyle.Danger).setEmoji('🎧')
        );
        msg.channel.send({ embeds: [embed], components: [row] });
    }

    // COMANDO !admin (RESTAURADO)
    if (msg.content === '!admin' && msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
        setTimeout(() => msg.delete().catch(() => {}), 1000);
        const embed = new EmbedBuilder().setTitle("⚙️ PAINEL ADMIN").setColor("DarkGrey");
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('admin_nome').setLabel('Nome').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('admin_avatar').setLabel('Avatar').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('admin_gift').setLabel('Gerar Gift Sorteio').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('admin_limpar_saldo').setLabel('Zerar Saldo').setStyle(ButtonStyle.Danger)
        );
        msg.channel.send({ embeds: [embed], components: [row] });
    }

    // COMANDO !fechar (COM LOGS HTML)
    if (msg.content === '!fechar' && (msg.channel.name.includes('ticket-') || msg.channel.name.includes('resgate-'))) {
        setTimeout(() => msg.delete().catch(() => {}), 500);
        const mensagens = await msg.channel.messages.fetch();
        let logHtml = `<html><body style="background:#1a1a1a; color:white; font-family:sans-serif; padding:20px;"><h1>Transcrição: ${msg.channel.name}</h1><hr>`;
        mensagens.reverse().forEach(m => {
            logHtml += `<p style="border-bottom:1px solid #333;"><strong>${m.author.tag}:</strong> ${m.content}</p>`;
        });
        logHtml += `</body></html>`;

        const attachment = new AttachmentBuilder(Buffer.from(logHtml), { name: `log-${msg.channel.name}.html` });
        const canalLogs = client.channels.cache.get(configBot.canalLogs);
        if (canalLogs) await canalLogs.send({ content: `✅ Log gerado para **${msg.channel.name}**`, files: [attachment] });
        
        await msg.channel.send("🧹 Fechando em 5 segundos...");
        setTimeout(() => msg.channel.delete(), 5000);
    }
});

// --- INTERAÇÕES ---
client.on('interactionCreate', async (i) => {
    if (!i.guild) return;

    // LÓGICA DE RESGATE DE PASSE (COM VERIFICAÇÃO DE SALDO)
    if (i.customId === 'btn_loja_resgatar_pass') {
        const saldo = carteiras[i.user.id] || 0;
        
        // Se NÃO tem saldo suficiente
        if (saldo < configBot.valorPass) {
            return i.reply({ 
                content: `❌ **Saldo Insuficiente!**\nSeu saldo atual é **R$ ${saldo.toFixed(2)}**, mas o passe custa **R$ ${configBot.valorPass.toFixed(2)}**.\n\nPor favor, recarregue comprando um **GT GIFT** no canal de compras.`, 
                ephemeral: true 
            });
        }

        // Se TEM saldo, abre o ticket e pede o ID
        const ticket = await i.guild.channels.create({
            name: `resgate-pass-${i.user.username}`,
            type: ChannelType.GuildText,
            parent: configBot.categoriaTickets,
            permissionOverwrites: [
                { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
            ]
        });

        await i.reply({ content: `✅ Ticket de resgate criado: ${ticket}`, ephemeral: true });
        await ticket.send(`Olá <@${i.user.id}>! Você tem saldo suficiente (**R$ ${saldo.toFixed(2)}**).\n\nPor favor, digite apenas o **UID** do jogador que receberá o passe:`);

        const col = ticket.createMessageCollector({ filter: m => m.author.id === i.user.id, max: 1 });
        col.on('collect', async (m) => {
            const uid = m.content.trim();
            try {
                const p = await axios.get(`https://lhubapi.shardweb.app/player?uid=${uid}`);
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`conf_${uid}`).setLabel('Confirmar Envio').setStyle(ButtonStyle.Success));
                await ticket.send({ content: `👤 Jogador: **${p.data.nickname}**\nConfirma o débito de **R$ ${configBot.valorPass.toFixed(2)}** e o envio do passe?`, components: [row] });
            } catch { ticket.send("❌ UID não encontrado ou API Offline. Tente novamente."); }
        });
    }

    // BOTÃO DE SUPORTE
    if (i.customId === 'btn_suporte') {
        const ticket = await i.guild.channels.create({
            name: `ticket-suporte-${i.user.username}`,
            type: ChannelType.GuildText,
            parent: configBot.categoriaTickets,
            permissionOverwrites: [{ id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }]
        });
        await i.reply({ content: `✅ Suporte aberto: ${ticket}`, ephemeral: true });
        await ticket.send(`🎧 <@${i.user.id}>, como podemos ajudar? Digite sua dúvida e aguarde a staff. Use \`!fechar\` para encerrar.`);
    }

    // ... (As outras interações de admin_nome, admin_gift e admin_limpar_saldo permanecem as mesmas do código anterior)
});

client.login(process.env.DISCORD_TOKEN);
