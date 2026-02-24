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
let codigosGerados = {}; 
let configBot = {
    valorPass: 10.00,
    canalLogs: process.env.LOG_STAFF_CHANNEL,
    categoriaTickets: process.env.CATEGORY_TICKETS
};

// CONFIGURAÇÃO DA VITRINE (!LOJA)
let vitrinePaginas = [
    { titulo: "🔥 BOOYAH PASS", desc: "O melhor custo benefício!\nPreço: **R$ 10,00**", img: "https://i.imgur.com/83pS9mO.png", cor: "#ffaa00" },
    { titulo: "💎 DIAMANTES FF", desc: "Recarga rápida via ID.\n1000 Dimas: **R$ 35,00**", img: "https://i.imgur.com/vHq0M2y.png", cor: "#00ccff" },
    { titulo: "👑 CARGO VIP", desc: "Tenha acesso ao canal <#ID_DO_CANAL>.\nCargo: <@&ID_DO_CARGO>", img: "https://i.imgur.com/6EwB7Ym.png", cor: "#aa00ff" }
];

// WEBHOOK E SERVIDOR
app.post('/webhook', async (req, res) => { res.sendStatus(200); });
app.listen(process.env.PORT || 10000);

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;

    // COMANDO !HELP
    if (msg.content === '!help') {
        msg.delete().catch(() => {});
        const embed = new EmbedBuilder()
            .setTitle("❓ Central de Ajuda")
            .setColor("Blue")
            .addFields(
                { name: "👤 Clientes", value: "`!carteira`, `!perfil [UID]`, `!loja`" },
                { name: "🛠️ Staff", value: "`!admin`, `!setgt`, `!setticketpass`, `!setsuporte`, `!trancachat`, `!destrancarchat`" }
            );
        return msg.channel.send({ embeds: [embed] });
    }

    // COMANDO !PERFIL (CORRIGIDO PARA NÃO DAR UNDEFINED)
    if (msg.content.startsWith('!perfil')) {
        const uid = msg.content.split(' ')[1];
        if (!uid) return msg.reply("Use: `!perfil [UID]`");
        try {
            const res = await axios.get(`https://lhubapi.shardweb.app/player?uid=${uid}`);
            const nick = res.data.nickname || res.data.nick || "Não encontrado";
            const embed = new EmbedBuilder()
                .setTitle("🎮 Perfil do Jogador")
                .addFields({ name: "Nick", value: `\`${nick}\`` }, { name: "UID", value: `\`${uid}\`` })
                .setColor("Purple");
            msg.channel.send({ embeds: [embed] });
        } catch { msg.channel.send("❌ Erro ao buscar UID."); }
    }

    // COMANDOS DE CHAT
    if (msg.content === '!trancachat' && msg.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await msg.channel.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: false });
        return msg.channel.send("🔒 **Chat trancado.**");
    }
    if (msg.content === '!destrancarchat' && msg.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await msg.channel.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: true });
        return msg.channel.send("🔓 **Chat liberado.**");
    }

    // COMANDO !LOJA (PAGINAÇÃO)
    if (msg.content === '!loja') {
        let index = 0;
        const genEmbed = (idx) => new EmbedBuilder()
            .setTitle(vitrinePaginas[idx].titulo).setDescription(vitrinePaginas[idx].desc)
            .setImage(vitrinePaginas[idx].img).setColor(vitrinePaginas[idx].cor)
            .setFooter({ text: `Página ${idx + 1} de ${vitrinePaginas.length}` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('prev').setEmoji('⏪').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('info').setEmoji('ℹ️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('next').setEmoji('⏩').setStyle(ButtonStyle.Secondary)
        );

        const m = await msg.channel.send({ embeds: [genEmbed(0)], components: [row] });
        const coll = m.createMessageComponentCollector({ time: 60000 });
        coll.on('collect', async i => {
            if (i.customId === 'next') index = (index + 1) % vitrinePaginas.length;
            if (i.customId === 'prev') index = (index - 1 + vitrinePaginas.length) % vitrinePaginas.length;
            if (i.customId === 'info') return i.reply({ content: "🛒 Para comprar, use os canais de resgate!", ephemeral: true });
            await i.update({ embeds: [genEmbed(index)] });
        });
    }

    // ADMIN E TICKETS
    if (msg.content === '!admin' && msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('add_s').setLabel('Add Saldo').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('rem_s').setLabel('Remover Saldo').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('edit_bot').setLabel('Config Bot').setStyle(ButtonStyle.Secondary)
        );
        msg.channel.send({ content: "⚙️ **Painel Admin**", components: [row] });
    }

    if (msg.content === '!setgt' && msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('buy').setLabel('Comprar GT GIFT').setStyle(ButtonStyle.Primary));
        msg.channel.send({ content: "💳 **GIFT CARDS**", components: [row] });
    }

    if (msg.content === '!setticketpass' && msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('res_p').setLabel('Resgatar Passe').setStyle(ButtonStyle.Success));
        msg.channel.send({ content: "🎫 **RESGATE DE PASSE**", components: [row] });
    }
});

// INTERAÇÕES DE SALDO
client.on('interactionCreate', async (i) => {
    if (!i.isButton() && !i.isModalSubmit()) return;

    if (i.customId === 'add_s' || i.customId === 'rem_s') {
        const modal = new ModalBuilder().setCustomId(i.customId).setTitle('Gerenciar Saldo');
        const u = new TextInputBuilder().setCustomId('u').setLabel('ID do Usuário').setStyle(TextInputStyle.Short).setRequired(true);
        const v = new TextInputBuilder().setCustomId('v').setLabel('Valor').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(u), new ActionRowBuilder().addComponents(v));
        return i.showModal(modal);
    }

    if (i.isModalSubmit()) {
        const uid = i.fields.getTextInputValue('u');
        const val = parseFloat(i.fields.getTextInputValue('v').replace(',', '.'));
        if (i.customId === 'add_s') carteiras[uid] = (carteiras[uid] || 0) + val;
        if (i.customId === 'rem_s') carteiras[uid] = Math.max(0, (carteiras[uid] || 0) - val);
        await i.reply({ content: `✅ Saldo atualizado para R$ ${(carteiras[uid] || 0).toFixed(2)}`, ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);
