const { Client, GatewayIntentBits, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const express = require('express');
require('dotenv').config();

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

// CONFIGURAÇÃO MERCADO PAGO
const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN || '' });
const payment = new Payment(mpClient);
const app = express();
app.use(express.json());

// BANCO DE DADOS E CONFIGS
let carteiras = {}; 
let configBot = {
    valorPass: 10.00,
    canalLogs: process.env.LOG_STAFF_CHANNEL,
    categoriaTickets: process.env.CATEGORY_TICKETS
};

// CONFIGURAÇÃO DA VITRINE (!LOJA)
let vitrinePaginas = [
    { titulo: "🔥 BOOYAH PASS", desc: "O melhor custo benefício!\nPreço: **R$ 10,00**", img: "https://i.imgur.com/u5uP9mO.png", cor: "#ffaa00" },
    { titulo: "💎 DIAMANTES FF", desc: "Recarga rápida via ID.\n1000 Dimas: **R$ 35,00**", img: "https://i.imgur.com/vHq0M2y.png", cor: "#00ccff" },
    { titulo: "👑 ACESSO VIP", desc: "Canais exclusivos e sorteios.\nCargo: <@&ID_DO_CARGO>", img: "https://i.imgur.com/6EwB7Ym.png", cor: "#aa00ff" }
];

app.post('/webhook', async (req, res) => { res.sendStatus(200); });
app.listen(process.env.PORT || 10000);

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;

    // COMANDO !HELP
    if (msg.content === '!help') {
        msg.delete().catch(() => {});
        const embedHelp = new EmbedBuilder()
            .setTitle("❓ Central de Ajuda")
            .setColor("Blue")
            .addFields(
                { name: "👤 Clientes", value: "`!carteira`, `!perfil [UID]`, `!loja`" },
                { name: "🛠️ Staff", value: "`!admin`, `!setgt`, `!setticketpass`, `!setsuporte`, `!trancachat`, `!destrancarchat`" }
            );
        return msg.channel.send({ embeds: [embedHelp] });
    }

    // COMANDO !PERFIL (AJUSTADO PARA ROTA BASICINFO)
    if (msg.content.startsWith('!perfil')) {
        const uid = msg.content.split(' ')[1];
        if (!uid) return msg.reply("❌ Use: `!perfil [UID]`");
        try {
            const response = await axios.get(`https://lhubapi.shardweb.app/player?uid=${uid}`);
            const data = response.data.basicInfo; // Acessando o objeto pai do nick

            const embed = new EmbedBuilder()
                .setTitle("🎮 Perfil do Jogador")
                .addFields(
                    { name: "👤 Nick", value: `\`${data.nickname || 'Não encontrado'}\``, inline: true },
                    { name: "🆔 UID", value: `\`${uid}\``, inline: true },
                    { name: "🆙 Nível", value: `\`${data.level || '?'}\``, inline: true }
                )
                .setColor("Purple")
                .setThumbnail(msg.author.displayAvatarURL());
            msg.channel.send({ embeds: [embed] });
        } catch (e) { 
            msg.channel.send("❌ Erro: UID inválido ou sistema da API offline."); 
        }
    }

    // MODERAÇÃO DE CHAT
    if (msg.content === '!trancachat' && msg.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await msg.channel.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: false });
        return msg.channel.send("🔒 **Este chat foi trancado.**");
    }
    if (msg.content === '!destrancarchat' && msg.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await msg.channel.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: true });
        return msg.channel.send("🔓 **Este chat foi liberado.**");
    }

    // VITRINE (!LOJA)
    if (msg.content === '!loja') {
        msg.delete().catch(() => {});
        let index = 0;
        const generateEmbed = (idx) => new EmbedBuilder()
            .setTitle(vitrinePaginas[idx].titulo).setDescription(vitrinePaginas[idx].desc)
            .setImage(vitrinePaginas[idx].img).setColor(vitrinePaginas[idx].cor)
            .setFooter({ text: `Página ${idx + 1} de ${vitrinePaginas.length}` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('prev').setEmoji('⏪').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('info').setEmoji('ℹ️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('next').setEmoji('⏩').setStyle(ButtonStyle.Secondary)
        );

        const m = await msg.channel.send({ embeds: [generateEmbed(0)], components: [row] });
        const collector = m.createMessageComponentCollector({ time: 600000 });
        collector.on('collect', async i => {
            if (i.user.id !== msg.author.id) return i.reply({ content: "Abra seu próprio !loja", ephemeral: true });
            if (i.customId === 'next') index = (index + 1) % vitrinePaginas.length;
            else if (i.customId === 'prev') index = (index - 1 + vitrinePaginas.length) % vitrinePaginas.length;
            await i.update({ embeds: [generateEmbed(index)] });
        });
    }

    // PAINEL ADMINISTRATIVO (!ADMIN)
    if (msg.content === '!admin' && msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
        msg.delete().catch(() => {});
        const embed = new EmbedBuilder().setTitle("⚙️ Painel de Gestão").setColor("DarkGrey");
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('adm_add').setLabel('Add Saldo').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('adm_rem').setLabel('Remover Saldo').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('adm_bot').setLabel('Config Bot').setStyle(ButtonStyle.Secondary)
        );
        msg.channel.send({ embeds: [embed], components: [row] });
    }

    // COMANDOS DE SET (CANAIS)
    if (msg.content === '!setgt' && msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_buy').setLabel('Comprar Gift').setStyle(ButtonStyle.Primary));
        msg.channel.send({ content: "💳 **CANAL DE COMPRAS**", components: [row] });
    }

    if (msg.content === '!setticketpass' && msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_res_pass').setLabel('Resgatar Passe').setStyle(ButtonStyle.Success));
        msg.channel.send({ content: "🎫 **CANAL DE RESGATE**", components: [row] });
    }

    // FECHAR TICKET COM LOGS HTML
    if (msg.content === '!fechar' && (msg.channel.name.includes('ticket-') || msg.channel.name.includes('resgate-'))) {
        const msgs = await msg.channel.messages.fetch();
        let logHtml = `<html><body style="background:#222;color:#fff;padding:20px;"><h2>Ticket: ${msg.channel.name}</h2><hr>`;
        msgs.reverse().forEach(m => { logHtml += `<p><strong>${m.author.tag}:</strong> ${m.content}</p>`; });
        logHtml += `</body></html>`;
        const canalLog = client.channels.cache.get(configBot.canalLogs);
        if (canalLog) await canalLog.send({ content: `📁 Log gerado: ${msg.channel.name}`, files: [new AttachmentBuilder(Buffer.from(logHtml), { name: 'log.html' })] });
        msg.channel.send("🧹 Fechando...").then(() => setTimeout(() => msg.channel.delete(), 5000));
    }
});

// INTERAÇÕES (ADMIN SALDO)
client.on('interactionCreate', async (i) => {
    if (i.customId === 'adm_add' || i.customId === 'adm_rem') {
        const modal = new ModalBuilder().setCustomId(i.customId).setTitle('Gerenciar Saldo');
        const userIn = new TextInputBuilder().setCustomId('u').setLabel('ID do Usuário').setStyle(TextInputStyle.Short).setRequired(true);
        const valIn = new TextInputBuilder().setCustomId('v').setLabel('Valor').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(userIn), new ActionRowBuilder().addComponents(valIn));
        return i.showModal(modal);
    }

    if (i.isModalSubmit()) {
        const uid = i.fields.getTextInputValue('u');
        const val = parseFloat(i.fields.getTextInputValue('v').replace(',', '.'));
        if (i.customId === 'adm_add') carteiras[uid] = (carteiras[uid] || 0) + val;
        if (i.customId === 'adm_rem') carteiras[uid] = Math.max(0, (carteiras[uid] || 0) - val);
        await i.reply({ content: `✅ Saldo de <@${uid}> atualizado para R$ ${(carteiras[uid] || 0).toFixed(2)}`, ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);
