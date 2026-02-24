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

// BANCO DE DADOS E CONFIGS (Em produção, use um Banco de Dados real)
let carteiras = {}; 
let configBot = {
    canalLogs: process.env.LOG_CHANNEL_ID || "ID_DO_CANAL_LOGS",
    categoriaTickets: process.env.CATEGORY_ID || "ID_DA_CATEGORIA"
};

let vitrinePaginas = [
    { titulo: "🔥 BOOYAH PASS", desc: "O melhor custo benefício!\nPreço: **R$ 7,99**", img: "https://cdn.discordapp.com/attachments/1474175360793837761/1475918101026705520/IMG-20260214-WA0002.jpg?ex=699f3b58&is=699de9d8&hm=432090a0a56289f84be899381b2b35cc0bcabc68e044b516850ed4a6d2146f35&", cor: "#ffaa00" },
    { titulo: "✨️ GT GIFT ", desc: "Recarregue seu saldo no servidor para resgatar seu .\nBooyah Pass: **R$ 9,99**", img: "https://cdn.discordapp.com/attachments/1474175360793837761/1475920275483922593/Image.png.webp?ex=699f3d5e&is=699debde&hm=1333a0d441a62a7dc073b8faeaf284960be3243af0d861576d97cec6735f5be4&", cor: "#00ccff" }
];
app.post('/webhook', (req, res) => res.sendStatus(200));
app.listen(process.env.PORT || 10000);

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;

    // Função de limpeza de chat
    const limpar = () => msg.delete().catch(() => {});

    // --- COMANDO !CARTEIRA ---
    if (msg.content === '!carteira') {
        limpar();
        const saldo = carteiras[msg.author.id] || 0;
        return msg.channel.send(`💰 <@${msg.author.id}>, seu saldo atual é: **R$ ${saldo.toFixed(2)}**`);
    }

    // --- COMANDO !PERFIL ---
    if (msg.content.startsWith('!perfil')) {
        limpar();
        const uid = msg.content.split(' ')[1];
        if (!uid) return msg.channel.send("❌ Use: `!perfil [UID]`");
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
        } catch { return msg.channel.send("❌ Erro ao buscar perfil."); }
    }

    // --- COMANDO !LOJA ---
    if (msg.content === '!loja') {
        limpar();
        let index = 0;
        const genEmbed = (idx) => new EmbedBuilder()
            .setTitle(vitrinePaginas[idx].titulo).setDescription(vitrinePaginas[idx].desc)
            .setImage(vitrinePaginas[idx].img).setColor(vitrinePaginas[idx].cor)
            .setFooter({ text: `Página ${idx + 1} de ${vitrinePaginas.length}` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('loja_prev').setEmoji('⏪').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('loja_next').setEmoji('⏩').setStyle(ButtonStyle.Secondary)
        );
        return msg.channel.send({ embeds: [genEmbed(0)], components: [row] });
    }

    // --- COMANDOS SET STAFF ---
    if (msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
        if (msg.content === '!setgt') {
            limpar();
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_buy').setLabel('Comprar Gift').setStyle(ButtonStyle.Primary));
            return msg.channel.send({ content: "💳 **RECARGA DE SALDO**", components: [row] });
        }
        if (msg.content === '!setpass') {
            limpar();
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_resgatar_pass').setLabel('Resgatar Passe').setStyle(ButtonStyle.Success));
            return msg.channel.send({ content: "🎫 **RESGATE DE BOOYAH PASS**", components: [row] });
        }
        if (msg.content === '!setsuporte') {
            limpar();
            const embed = new EmbedBuilder().setTitle("📩 Suporte ao Cliente").setDescription("Clique abaixo para abrir um ticket de atendimento.").setColor("Blue");
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('abrir_ticket').setLabel('Abrir Ticket').setStyle(ButtonStyle.Primary).setEmoji('📩'));
            return msg.channel.send({ embeds: [embed], components: [row] });
        }
        if (msg.content === '!admin') {
            limpar();
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('adm_add').setLabel('Add Saldo').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('adm_rem').setLabel('Remover Saldo').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('adm_config').setLabel('Configurar Bot').setStyle(ButtonStyle.Secondary)
            );
            return msg.channel.send({ content: "⚙️ **Painel de Gestão Staff**", components: [row] });
        }
    }
});

// --- COLETOR DE INTERAÇÕES GLOBAL ---
client.on('interactionCreate', async (i) => {
    
    // SISTEMA DE TICKETS
    if (i.customId === 'abrir_ticket') {
        const canal = await i.guild.channels.create({
            name: `ticket-${i.user.username}`,
            type: ChannelType.GuildText,
            parent: configBot.categoriaTickets,
            permissionOverwrites: [
                { id: i.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
                { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
            ]
        });
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('fechar_ticket').setLabel('Fechar e Gerar Log').setStyle(ButtonStyle.Danger));
        await canal.send({ content: `Olá ${i.user}, descreva seu problema.`, components: [row] });
        return i.reply({ content: `✅ Ticket aberto em ${canal}`, ephemeral: true });
    }

    if (i.customId === 'fechar_ticket') {
        const msgs = await i.channel.messages.fetch();
        let html = `<html><body style="background:#2c2f33;color:white;font-family:sans-serif;"><h1>Log de: ${i.channel.name}</h1><hr>`;
        msgs.reverse().forEach(m => { html += `<p><strong>${m.author.tag}:</strong> ${m.content}</p>`; });
        html += `</body></html>`;

        const logChannel = client.channels.cache.get(configBot.canalLogs);
        if (logChannel) {
            await logChannel.send({ content: `📄 Log de Ticket: **${i.channel.name}**`, files: [new AttachmentBuilder(Buffer.from(html), { name: 'log.html' })] });
        }
        await i.reply("🧹 Fechando canal em 5 segundos...");
        setTimeout(() => i.channel.delete(), 5000);
    }

    // PIX E PAGAMENTOS
    if (i.customId === 'btn_buy') {
        await i.deferReply({ ephemeral: true });
        try {
            const res = await payment.create({
                body: { transaction_amount: 1.00, description: `Saldo - ${i.user.tag}`, payment_method_id: 'pix', payer: { email: 'contato@loja.com' }, external_reference: i.user.id }
            });
            const pixCopia = res.point_of_interaction.transaction_data.qr_code;
            const pixLink = res.point_of_interaction.transaction_data.ticket_url;
            const embed = new EmbedBuilder().setTitle("💠 PIX GERADO").setDescription(`\`${pixCopia}\``).setColor("Green");
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Link de Pagamento').setURL(pixLink).setStyle(ButtonStyle.Link));
            return i.editReply({ embeds: [embed], components: [row] });
        } catch { return i.editReply("❌ Erro no PIX."); }
    }

    // ADMIN MODAIS
    if (i.customId === 'adm_add' || i.customId === 'adm_rem' || i.customId === 'adm_config') {
        const modal = new ModalBuilder().setCustomId(i.customId).setTitle('Configurações');
        const input1 = new TextInputBuilder().setCustomId('c1').setLabel('ID (Usuário ou Canal)').setStyle(TextInputStyle.Short).setRequired(true);
        const input2 = new TextInputBuilder().setCustomId('c2').setLabel('Valor ou Categoria').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input1), new ActionRowBuilder().addComponents(input2));
        return i.showModal(modal);
    }

    if (i.isModalSubmit()) {
        const c1 = i.fields.getTextInputValue('c1');
        const c2 = i.fields.getTextInputValue('c2');
        if (i.customId === 'adm_add') carteiras[c1] = (carteiras[c1] || 0) + parseFloat(c2);
        if (i.customId === 'adm_config') { configBot.canalLogs = c1; configBot.categoriaTickets = c2; }
        return i.reply({ content: "✅ Alteração realizada com sucesso!", ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);

