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

    // COMANDO !ADMIN
    if (msg.content === '!admin' && msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
        setTimeout(() => msg.delete().catch(() => {}), 1000);
        
        const embed = new EmbedBuilder()
            .setTitle("⚙️ GESTÃO ADMINISTRATIVA")
            .setDescription("Controle total do bot e gerenciamento de saldos.")
            .setColor("#2b2d31");

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('admin_nome').setLabel('Nome').setStyle(ButtonStyle.Secondary).setEmoji('📝'),
            new ButtonBuilder().setCustomId('admin_avatar').setLabel('Avatar').setStyle(ButtonStyle.Secondary).setEmoji('🖼️'),
            new ButtonBuilder().setCustomId('admin_gift').setLabel('Gerar Gift').setStyle(ButtonStyle.Success).setEmoji('🎁')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('admin_limpar_saldo').setLabel('Zerar Saldo User').setStyle(ButtonStyle.Danger).setEmoji('🧹'),
            new ButtonBuilder().setCustomId('admin_saldo_lhub').setLabel('Saldo LHub').setStyle(ButtonStyle.Primary).setEmoji('💰')
        );

        return msg.channel.send({ embeds: [embed], components: [row1, row2] });
    }

    // COMANDO !SETLOJA
    if (msg.content === '!setloja' && msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
        setTimeout(() => msg.delete().catch(() => {}), 1000);
        const embedLoja = new EmbedBuilder()
            .setTitle("🏪 GT STORE - ATENDIMENTO")
            .setDescription("Selecione uma opção para iniciar:")
            .setColor("Blue");
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_compra').setLabel('Comprar Gift').setStyle(ButtonStyle.Primary).setEmoji('💳'),
            new ButtonBuilder().setCustomId('btn_resgate').setLabel('Resgatar').setStyle(ButtonStyle.Success).setEmoji('✅'),
            new ButtonBuilder().setCustomId('btn_suporte').setLabel('Suporte').setStyle(ButtonStyle.Danger).setEmoji('🎧')
        );
        msg.channel.send({ embeds: [embedLoja], components: [row] });
    }

    // COMANDO !FECHAR (LOGS HTML)
    if (msg.content === '!fechar' && (msg.channel.name.includes('ticket-') || msg.channel.name.includes('resgate-'))) {
        setTimeout(() => msg.delete().catch(() => {}), 500);
        const mensagens = await msg.channel.messages.fetch();
        let logHtml = `<html><body style="background:#1a1a1a; color:white; font-family:sans-serif; padding:20px;"><h1>Transcrição: ${msg.channel.name}</h1><hr>`;
        
        mensagens.reverse().forEach(m => {
            const data = new Date(m.createdTimestamp).toLocaleString('pt-BR');
            logHtml += `<p style="margin:10px 0; border-bottom:1px solid #333;">[${data}] <strong>${m.author.tag}:</strong> ${m.content}</p>`;
        });
        logHtml += `</body></html>`;

        const attachment = new AttachmentBuilder(Buffer.from(logHtml), { name: `log-${msg.channel.name}.html` });
        const canalLogs = client.channels.cache.get(configBot.canalLogs);
        
        if (canalLogs) await canalLogs.send({ content: `✅ Ticket **${msg.channel.name}** arquivado.`, files: [attachment] });
        await msg.channel.send("🧹 **Canal fechando...**");
        setTimeout(() => msg.channel.delete(), 5000);
    }
});

// --- INTERAÇÕES ---
client.on('interactionCreate', async (i) => {
    if (!i.guild) return;

    // BOTÃO LIMPAR SALDO (ADMIN)
    if (i.customId === 'admin_limpar_saldo') {
        const modal = new ModalBuilder().setCustomId('mod_limpar_saldo').setTitle('Zerar Saldo de Usuário');
        const input = new TextInputBuilder().setCustomId('txt_userid').setLabel('ID do Usuário:').setStyle(TextInputStyle.Short).setPlaceholder('Ex: 123456789...').setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await i.showModal(modal);
    }

    // MODAL SUBMITS
    if (i.isModalSubmit()) {
        if (i.customId === 'mod_limpar_saldo') {
            const userId = i.fields.getTextInputValue('txt_userid');
            carteiras[userId] = 0;
            await i.reply({ content: `🧹 Saldo do usuário <@${userId}> foi zerado com sucesso!`, ephemeral: true });
        }
        
        if (i.customId === 'mod_admin_nome') {
            await client.user.setUsername(i.fields.getTextInputValue('txt_nome'));
            await i.reply({ content: "✅ Nome atualizado!", ephemeral: true });
        }

        if (i.customId === 'mod_admin_gift') {
            const valor = parseFloat(i.fields.getTextInputValue('txt_valor').replace(',', '.'));
            const cod = `ADMIN-${Math.random().toString(36).toUpperCase().substring(2, 8)}`;
            codigosGerados[cod] = valor;
            await i.reply({ content: `🎁 **Gift Gerado!**\nCódigo: \`${cod}\` (R$ ${valor.toFixed(2)})`, ephemeral: false });
        }
    }

    // BOTÕES DE IDENTIDADE
    if (i.customId === 'admin_nome') {
        const modal = new ModalBuilder().setCustomId('mod_admin_nome').setTitle('Mudar Nome');
        const input = new TextInputBuilder().setCustomId('txt_nome').setLabel('Novo Nome:').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await i.showModal(modal);
    }

    if (i.customId === 'admin_gift') {
        const modal = new ModalBuilder().setCustomId('mod_admin_gift').setTitle('Gerar Gift Manual');
        const input = new TextInputBuilder().setCustomId('txt_valor').setLabel('Valor R$:').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await i.showModal(modal);
    }

    // BOTÕES DA LOJA
    if (i.customId === 'btn_suporte') {
        const ticket = await i.guild.channels.create({
            name: `ticket-suporte-${i.user.username}`,
            type: ChannelType.GuildText,
            parent: configBot.categoriaTickets,
            permissionOverwrites: [
                { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
            ]
        });
        await i.reply({ content: `✅ Ticket aberto: ${ticket}`, ephemeral: true });
        await ticket.send(`🎧 <@${i.user.id}>, diga como podemos ajudar. Digite \`!fechar\` para encerrar.`);
    }

    if (i.customId === 'btn_resgate') {
        const modal = new ModalBuilder().setCustomId('mod_resgate_cliente').setTitle('Resgatar Código');
        const input = new TextInputBuilder().setCustomId('txt_cod').setLabel('Insira seu código:').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId === 'mod_resgate_cliente') {
        const cod = i.fields.getTextInputValue('txt_cod').trim();
        if (codigosGerados[cod]) {
            const v = codigosGerados[cod];
            carteiras[i.user.id] = (carteiras[i.user.id] || 0) + v;
            delete codigosGerados[cod];
            await i.reply({ content: `✅ Sucesso! R$ ${v.toFixed(2)} adicionados à sua carteira.`, ephemeral: true });
        } else {
            await i.reply({ content: "❌ Código inválido ou já utilizado.", ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);

