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

// BANCO DE DADOS E CONFIGURAÇÕES
let carteiras = {}; 
let saldoAdmin = {}; 
let configBot = {
    canalLogs: process.env.LOG_STAFF_CHANNEL || "ID_DO_CANAL",
    categoriaTickets: process.env.CATEGORY_TICKET || "ID_DA_CATEGORIA"
};

let vitrinePaginas = [
    { titulo: "🔥 BOOYAH PASS", desc: "O melhor custo benefício!\nPreço: **R$ 7,99**", img: "https://cdn.discordapp.com/attachments/1474175360793837761/1475918101026705520/IMG-20260214-WA0002.jpg?ex=699f3b58&is=699de9d8&hm=432090a0a56289f84be899381b2b35cc0bcabc68e044b516850ed4a6d2146f35&", cor: "#ffaa00" },
    { titulo: "✨️ GT GIFT ", desc: "Recarregue seu saldo no servidor para resgatar seu .\nBooyah Pass: **R$ 9,99**", img: "https://cdn.discordapp.com/attachments/1474175360793837761/1475920275483922593/Image.png.webp?ex=699f3d5e&is=699debde&hm=1333a0d441a62a7dc073b8faeaf284960be3243af0d861576d97cec6735f5be4&", cor: "#00ccff" }
];

// --- WEBHOOK PARA ENTREGA AUTOMÁTICA ---
app.post('/webhook', async (req, res) => {
    const { action, data } = req.body;
    if (action === "payment.updated" && data.id) {
        try {
            const pagamento = await payment.get({ id: data.id });
            if (pagamento.status === 'approved') {
                const valor = pagamento.transaction_amount;
                const userId = pagamento.external_reference;
                if (!carteiras[userId]) carteiras[userId] = 0;
                carteiras[userId] += valor;
                const logChannel = client.channels.cache.get(configBot.canalLogs);
                if (logChannel) logChannel.send(`✅ **PAGAMENTO APROVADO**\n👤 Usuário: <@${userId}>\n💰 Valor: R$ ${valor.toFixed(2)} creditados.`);
            }
        } catch (e) { console.error("Erro no Webhook:", e); }
    }
    res.sendStatus(200);
});
app.listen(process.env.PORT || 10000);

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    const limpar = () => msg.delete().catch(() => {});

    // --- COMANDO !HELP ---
    if (msg.content === '!help') {
        limpar();
        const embed = new EmbedBuilder()
            .setTitle("❓ Central de Ajuda - Guardian Likes")
            .setDescription("Aqui estão os comandos disponíveis no bot:")
            .addFields(
                { name: "👤 Clientes", value: "`!carteira` - Ver seu saldo e pedir reembolso\n`!loja` - Ver produtos disponíveis\n`!perfil [UID]` - Consultar conta no FF", inline: false },
                { name: "🛠️ Staff / Admin", value: "`!admin` - Painel de gestão de saldo e bot\n`!setgt` - Setar canal de recarga PIX\n`!setpass` - Setar canal de resgate de passe\n`!setsuporte` - Setar canal de tickets", inline: false }
            )
            .setColor("Blue")
            .setFooter({ text: "Todas as mensagens de comando são apagadas automaticamente." });
        return msg.channel.send({ embeds: [embed] });
    }

    // --- COMANDO !CARTEIRA ---
    if (msg.content === '!carteira') {
        limpar();
        const saldo = (carteiras[msg.author.id] || 0).toFixed(2);
        const embed = new EmbedBuilder()
            .setTitle("💰 Sua Carteira").setDescription(`Olá <@${msg.author.id}>, seu saldo:\n## R$ ${saldo}`).setColor("Gold");
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_reembolso').setLabel('Solicitar Reembolso').setStyle(ButtonStyle.Danger));
        return msg.channel.send({ embeds: [embed], components: [row] });
    }

    // --- COMANDO !LOJA ---
    if (msg.content === '!loja') {
        limpar();
        const genEmbed = (idx) => new EmbedBuilder()
            .setTitle(vitrinePaginas[idx].titulo).setDescription(vitrinePaginas[idx].desc).setImage(vitrinePaginas[idx].img).setColor(vitrinePaginas[idx].cor)
            .setFooter({ text: `Página ${idx + 1} de ${vitrinePaginas.length}` });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('loja_prev').setEmoji('⏪').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('loja_next').setEmoji('⏩').setStyle(ButtonStyle.Secondary)
        );
        return msg.channel.send({ embeds: [genEmbed(0)], components: [row] });
    }

    // --- COMANDO !PERFIL ---
    if (msg.content.startsWith('!perfil')) {
        limpar();
        const uid = msg.content.split(' ')[1];
        if (!uid) return msg.channel.send("❌ Use: `!perfil [UID]`");
        try {
            const resApi = await axios.get(`https://lhubapi.shardweb.app/player?uid=${uid}`);
            const data = resApi.data.basicInfo;
            const embed = new EmbedBuilder().setTitle("🎮 Perfil").addFields(
                { name: "👤 Nick", value: `\`${data.nickname || 'Não encontrado'}\``, inline: true },
                { name: "🆔 UID", value: `\`${uid}\``, inline: true },
                { name: "🆙 Nível", value: `\`${data.level || '?'}\``, inline: true }
            ).setColor("Purple");
            return msg.channel.send({ embeds: [embed] });
        } catch { return msg.channel.send("❌ Erro ao buscar perfil."); }
    }

    // --- COMANDOS STAFF ---
    if (msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
        if (msg.content === '!setgt') {
            limpar();
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_buy').setLabel('Comprar Gift').setStyle(ButtonStyle.Primary));
            return msg.channel.send({ content: "💳 **RECARGA DE SALDO VIA PIX**", components: [row] });
        }
        if (msg.content === '!setpass') {
            limpar();
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_resgatar_pass').setLabel('Resgatar Passe').setStyle(ButtonStyle.Success));
            return msg.channel.send({ content: "🎫 **RESGATE DE BOOYAH PASS**", components: [row] });
        }
        if (msg.content === '!setsuporte') {
            limpar();
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('abrir_ticket').setLabel('Abrir Ticket').setStyle(ButtonStyle.Primary));
            return msg.channel.send({ content: "📩 **SUPORTE AO CLIENTE**", components: [row] });
        }
        if (msg.content === '!admin') {
            limpar();
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('adm_add').setLabel('Add Saldo').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('adm_rem').setLabel('Remover Saldo').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('adm_config').setLabel('Config Bot').setStyle(ButtonStyle.Secondary)
            );
            return msg.channel.send({ content: "⚙️ **PAINEL GESTÃO**", components: [row] });
        }
    }
});

// --- COLETOR DE INTERAÇÕES (LOJA, PIX, REEMBOLSO, TICKETS) ---
client.on('interactionCreate', async (i) => {
    // PIX
    if (i.customId === 'btn_buy') {
        await i.deferReply({ ephemeral: true });
        try {
            const res = await payment.create({
                body: { transaction_amount: 10.00, description: `Saldo - ${i.user.tag}`, payment_method_id: 'pix', payer: { email: 'loja@pagamento.com' }, external_reference: i.user.id, notification_url: "https://gtpass.onrender.com/webhook" }
            });
            const embed = new EmbedBuilder().setTitle("💠 PIX GERADO").setDescription(`\`${res.point_of_interaction.transaction_data.qr_code}\``).setColor("Green");
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Pagar Agora').setURL(res.point_of_interaction.transaction_data.ticket_url).setStyle(ButtonStyle.Link));
            return i.editReply({ embeds: [embed], components: [row] });
        } catch { return i.editReply("❌ Erro PIX."); }
    }

    // REEMBOLSO
    if (i.customId === 'btn_reembolso') {
        const reembolsavel = (carteiras[i.user.id] || 0) - (saldoAdmin[i.user.id] || 0);
        if (reembolsavel <= 0) return i.reply({ content: "❌ Sem saldo reembolsável.", ephemeral: true });
        carteiras[i.user.id] -= reembolsavel;
        const log = client.channels.cache.get(configBot.canalLogs);
        if (log) log.send(`💸 **REEMBOLSO**\nUsuário: <@${i.user.id}>\nValor: R$ ${reembolsavel.toFixed(2)}`);
        return i.reply({ content: "✅ Reembolso solicitado!", ephemeral: true });
    }

    // LOJA
    if (i.customId === 'loja_next' || i.customId === 'loja_prev') {
        let idx = parseInt(i.message.embeds[0].footer.text.split(' ')[1]) - 1;
        idx = i.customId === 'loja_next' ? (idx + 1) % vitrinePaginas.length : (idx - 1 + vitrinePaginas.length) % vitrinePaginas.length;
        const newEmbed = EmbedBuilder.from(i.message.embeds[0]).setTitle(vitrinePaginas[idx].titulo).setDescription(vitrinePaginas[idx].desc).setImage(vitrinePaginas[idx].img).setFooter({ text: `Página ${idx + 1} de ${vitrinePaginas.length}` });
        return i.update({ embeds: [newEmbed] });
    }

    // TICKETS
    if (i.customId === 'abrir_ticket') {
        const c = await i.guild.channels.create({ name: `ticket-${i.user.username}`, type: ChannelType.GuildText, parent: configBot.categoriaTickets });
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('fechar_ticket').setLabel('Fechar Ticket').setStyle(ButtonStyle.Danger));
        await c.send({ content: `${i.user} suporte iniciado.`, components: [row] });
        return i.reply({ content: `✅ Ticket aberto: ${c}`, ephemeral: true });
    }

    if (i.customId === 'fechar_ticket') {
        const msgs = await i.channel.messages.fetch();
        let logHtml = `<html><body style="background:#333;color:#fff;"><h1>Log ${i.channel.name}</h1>`;
        msgs.reverse().forEach(m => logHtml += `<p><b>${m.author.tag}:</b> ${m.content}</p>`);
        const logCh = client.channels.cache.get(configBot.canalLogs);
        if (logCh) await logCh.send({ files: [new AttachmentBuilder(Buffer.from(logHtml + "</body></html>"), { name: 'log.html' })] });
        await i.reply("Fechando..."); setTimeout(() => i.channel.delete(), 3000);
    }

    // MODAIS ADMIN
    if (i.customId === 'adm_add' || i.customId === 'adm_rem' || i.customId === 'adm_config') {
        const modal = new ModalBuilder().setCustomId('mod_' + i.customId).setTitle('Configuração');
        const in1 = new TextInputBuilder().setCustomId('in1').setLabel('ID').setStyle(TextInputStyle.Short);
        const in2 = new TextInputBuilder().setCustomId('in2').setLabel('Valor/Categoria').setStyle(TextInputStyle.Short);
        modal.addComponents(new ActionRowBuilder().addComponents(in1), new ActionRowBuilder().addComponents(in2));
        return i.showModal(modal);
    }

    if (i.isModalSubmit()) {
        const v1 = i.fields.getTextInputValue('in1'), v2 = i.fields.getTextInputValue('in2');
        if (i.customId === 'mod_adm_add') { 
            carteiras[v1] = (carteiras[v1] || 0) + parseFloat(v2); 
            saldoAdmin[v1] = (saldoAdmin[v1] || 0) + parseFloat(v2);
        }
        if (i.customId === 'mod_adm_rem') { carteiras[v1] = Math.max(0, (carteiras[v1] || 0) - parseFloat(v2)); }
        if (i.customId === 'mod_adm_config') { configBot.canalLogs = v1; configBot.categoriaTickets = v2; }
        return i.reply({ content: "✅ Sucesso!", ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);
