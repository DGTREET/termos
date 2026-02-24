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

// BANCO DE DADOS TEMPORÁRIO
let carteiras = {}; 
let configBot = {
    valorPass: 10.00,
    canalLogs: process.env.LOG_STAFF_CHANNEL,
    categoriaTickets: process.env.CATEGORY_TICKETS
};

// VITRINE (!LOJA)
let vitrinePaginas = [
    { titulo: "🔥 BOOYAH PASS", desc: "O melhor custo benefício!\nPreço: **R$ 7,99**", img: "https://cdn.discordapp.com/attachments/1474175360793837761/1475918101026705520/IMG-20260214-WA0002.jpg?ex=699f3b58&is=699de9d8&hm=432090a0a56289f84be899381b2b35cc0bcabc68e044b516850ed4a6d2146f35&", cor: "#ffaa00" },
    { titulo: "✨️ GT GIFTS", desc: "Recarga de saldo no bot , para resgata .\nBooyah Pass: **R$ 7.99**", img: "https://cdn.discordapp.com/attachments/1474175360793837761/1475920275483922593/Image.png.webp?ex=699f3d5e&is=699debde&hm=1333a0d441a62a7dc073b8faeaf284960be3243af0d861576d97cec6735f5be4&", cor: "#00ccff" }
];

app.post('/webhook', (req, res) => res.sendStatus(200));
app.listen(process.env.PORT || 10000);

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;

    // COMANDO !PERFIL (CORRIGIDO)
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
                ).setColor("Purple");
            return msg.channel.send({ embeds: [embed] });
        } catch { return msg.channel.send("❌ UID não encontrado."); }
    }

    // PAINEL ADMIN
    if (msg.content === '!admin' && msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const embed = new EmbedBuilder().setTitle("⚙️ Painel de Gestão").setColor("Grey");
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('adm_add').setLabel('Add Saldo').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('adm_rem').setLabel('Remover Saldo').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('adm_bot').setLabel('Config Bot').setStyle(ButtonStyle.Secondary)
        );
        return msg.channel.send({ embeds: [embed], components: [row] });
    }

    // COMANDO SETGT
    if (msg.content === '!setgt' && msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_compra').setLabel('Comprar Gift').setStyle(ButtonStyle.Primary)
        );
        return msg.channel.send({ content: "💳 **CANAL DE COMPRAS**", components: [row] });
    }
});

// COLETOR DE INTERAÇÕES (CORREÇÃO "INTERAÇÃO FALHOU")
client.on('interactionCreate', async (i) => {
    
    // 1. LÓGICA DE COMPRA PIX (MERCADO PAGO)
    if (i.customId === 'btn_compra') {
        await i.deferReply({ ephemeral: true });
        try {
            const payData = {
                body: {
                    transaction_amount: 7.99, // Valor fixo ou via modal
                    description: `Saldo - ${i.user.tag}`,
                    payment_method_id: 'pix',
                    payer: { email: 'pagamento@discord.com' },
                    external_reference: i.user.id
                }
            };
            const res = await payment.create(payData);
            const pixLink = res.point_of_interaction.transaction_data.ticket_url;
            const pixCopia = res.point_of_interaction.transaction_data.qr_code;

            const embed = new EmbedBuilder()
                .setTitle("💠 Pagamento PIX Gerado")
                .setDescription("Pague para receber seu saldo automaticamente.")
                .addFields({ name: "Copia e Cola", value: `\`${pixCopia}\`` })
                .setColor("Green");

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('Link do Pagamento').setURL(pixLink).setStyle(ButtonStyle.Link)
            );
            return i.editReply({ embeds: [embed], components: [row] });
        } catch (e) {
            console.error(e);
            return i.editReply("❌ Erro ao gerar PIX. Verifique seu Token do Mercado Pago.");
        }
    }

    // 2. BOTÕES DE ADMIN (MODAIS)
    if (i.customId === 'adm_add' || i.customId === 'adm_rem') {
        const modal = new ModalBuilder().setCustomId(i.customId).setTitle('Saldo');
        const u = new TextInputBuilder().setCustomId('u').setLabel('ID do Usuário').setStyle(TextInputStyle.Short).setRequired(true);
        const v = new TextInputBuilder().setCustomId('v').setLabel('Valor').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(u), new ActionRowBuilder().addComponents(v));
        return i.showModal(modal);
    }

    // 3. PROCESSAR MODAIS SUBMETIDOS
    if (i.isModalSubmit()) {
        const uid = i.fields.getTextInputValue('u');
        const val = parseFloat(i.fields.getTextInputValue('v').replace(',', '.'));
        if (i.customId === 'adm_add') carteiras[uid] = (carteiras[uid] || 0) + val;
        if (i.customId === 'adm_rem') carteiras[uid] = Math.max(0, (carteiras[uid] || 0) - val);
        return i.reply({ content: `✅ Saldo atualizado para <@${uid}>!`, ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);

