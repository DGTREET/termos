const { Client, GatewayIntentBits, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require('discord.js');
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

// CONFIGURAÇÃO DA VITRINE
let vitrinePaginas = [
    { titulo: "🔥 BOOYAH PASS", desc: "O melhor custo benefício!\nPreço: **R$ 7,99**", img: "https://cdn.discordapp.com/attachments/1474175360793837761/1475918101026705520/IMG-20260214-WA0002.jpg?ex=699f3b58&is=699de9d8&hm=432090a0a56289f84be899381b2b35cc0bcabc68e044b516850ed4a6d2146f35&", cor: "#ffaa00" },
    { titulo: "✨️ GT GIFT ", desc: "Recarregue seu saldo no servidor para resgatar seu .\nBooyah Pass: **R$ 9,99**", img: "https://cdn.discordapp.com/attachments/1474175360793837761/1475920275483922593/Image.png.webp?ex=699f3d5e&is=699debde&hm=1333a0d441a62a7dc073b8faeaf284960be3243af0d861576d97cec6735f5be4&", cor: "#00ccff" }
];

app.post('/webhook', (req, res) => res.sendStatus(200));
app.listen(process.env.PORT || 10000, () => console.log("✅ Servidor Online"));

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;

    // --- COMANDO !HELP ---
    if (msg.content === '!help') {
        const embed = new EmbedBuilder()
            .setTitle("❓ Central de Ajuda")
            .setColor("Blue")
            .addFields(
                { name: "👤 Clientes", value: "`!carteira`, `!perfil [UID]`, `!loja`" },
                { name: "🛠️ Staff", value: "`!admin`, `!setgt`, `!setticketpass`, `!trancachat`, `!destrancarchat`" }
            );
        return msg.channel.send({ embeds: [embed] });
    }

    // --- COMANDO !PERFIL (ROTA CORRIGIDA) ---
    if (msg.content.startsWith('!perfil')) {
        const uid = msg.content.split(' ')[1];
        if (!uid) return msg.reply("❌ Use: `!perfil [UID]`");
        try {
            const resApi = await axios.get(`https://lhubapi.shardweb.app/player?uid=${uid}`);
            const data = resApi.data.basicInfo;
            const embed = new EmbedBuilder()
                .setTitle("🎮 Perfil do Jogador")
                .addFields(
                    { name: "👤 Nick", value: `\`${data.nickname || 'Não encontrado'}\``, inline: true },
                    { name: "🆔 UID", value: `\`${uid}\``, inline: true },
                    { name: "🆙 Nível", value: `\`${data.level || '?'}\``, inline: true }
                ).setColor("Purple").setThumbnail(msg.author.displayAvatarURL());
            return msg.channel.send({ embeds: [embed] });
        } catch { return msg.channel.send("❌ Erro ao buscar UID."); }
    }

    // --- COMANDO !LOJA (VITRINE) ---
    if (msg.content === '!loja') {
        let index = 0;
        const genEmbed = (idx) => new EmbedBuilder()
            .setTitle(vitrinePaginas[idx].titulo).setDescription(vitrinePaginas[idx].desc)
            .setImage(vitrinePaginas[idx].img).setColor(vitrinePaginas[idx].cor)
            .setFooter({ text: `Página ${idx + 1} de ${vitrinePaginas.length}` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('loja_prev').setEmoji('⏪').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('loja_info').setEmoji('ℹ️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('loja_next').setEmoji('⏩').setStyle(ButtonStyle.Secondary)
        );

        const m = await msg.channel.send({ embeds: [genEmbed(0)], components: [row] });
        const collector = m.createMessageComponentCollector({ time: 600000 });

        collector.on('collect', async i => {
            if (i.user.id !== msg.author.id) return i.reply({ content: "Abra seu próprio !loja", ephemeral: true });
            if (i.customId === 'loja_next') index = (index + 1) % vitrinePaginas.length;
            else if (i.customId === 'loja_prev') index = (index - 1 + vitrinePaginas.length) % vitrinePaginas.length;
            else if (i.customId === 'loja_info') return i.reply({ content: "🛒 Use os canais de compra para adquirir!", ephemeral: true });
            await i.update({ embeds: [genEmbed(index)] });
        });
    }

    // --- COMANDOS ADMIN ---
    if (msg.content === '!admin' && msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('adm_add').setLabel('Add Saldo').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('adm_rem').setLabel('Remover Saldo').setStyle(ButtonStyle.Danger)
        );
        return msg.channel.send({ content: "⚙️ **Painel de Gestão**", components: [row] });
    }

    if (msg.content === '!setgt' && msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_buy').setLabel('Comprar Gift').setStyle(ButtonStyle.Primary));
        return msg.channel.send({ content: "💳 **RECARGA DE SALDO**", components: [row] });
    }

    if (msg.content === '!trancachat' && msg.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await msg.channel.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: false });
        return msg.channel.send("🔒 Chat trancado.");
    }
});

// --- COLETOR DE INTERAÇÕES GLOBAL ---
client.on('interactionCreate', async (i) => {
    // 1. GERAÇÃO DE PIX MERCADO PAGO
    if (i.customId === 'btn_buy') {
        await i.deferReply({ ephemeral: true });
        try {
            const res = await payment.create({
                body: {
                    transaction_amount: 10.00,
                    description: `Saldo - ${i.user.tag}`,
                    payment_method_id: 'pix',
                    payer: { email: 'contato@loja.com' },
                    external_reference: i.user.id
                }
            });
            const pixCopia = res.point_of_interaction.transaction_data.qr_code;
            const embed = new EmbedBuilder()
                .setTitle("💠 PIX GERADO")
                .setDescription(`Copie o código abaixo:\n\n\`${pixCopia}\``)
                .setColor("Green");
            return i.editReply({ embeds: [embed] });
        } catch (e) { return i.editReply("❌ Erro ao gerar PIX."); }
    }

    // 2. MODAIS DE ADMIN
    if (i.customId === 'adm_add' || i.customId === 'adm_rem') {
        const modal = new ModalBuilder().setCustomId(i.customId).setTitle('Saldo');
        const u = new TextInputBuilder().setCustomId('u').setLabel('ID Usuário').setStyle(TextInputStyle.Short).setRequired(true);
        const v = new TextInputBuilder().setCustomId('v').setLabel('Valor').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(u), new ActionRowBuilder().addComponents(v));
        return i.showModal(modal);
    }

    if (i.isModalSubmit()) {
        const uid = i.fields.getTextInputValue('u');
        const val = parseFloat(i.fields.getTextInputValue('v').replace(',', '.'));
        if (i.customId === 'adm_add') carteiras[uid] = (carteiras[uid] || 0) + val;
        if (i.customId === 'adm_rem') carteiras[uid] = Math.max(0, (carteiras[uid] || 0) - val);
        return i.reply({ content: `✅ Saldo atualizado para <@${uid}>!`, ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);
