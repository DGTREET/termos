const { Client, GatewayIntentBits, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const axios = require('axios');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const express = require('express');
require('dotenv').config();

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const payment = new Payment(mpClient);
const app = express();
app.use(express.json());

// BANCO DE DADOS TEMPORÁRIO
let carteiras = {}; 
let codigosGerados = {}; 

// CONFIGURAÇÕES INICIAIS
let valoresGT = {
    op1: parseFloat(process.env.VALOR_OP1) || 10,
    op2: parseFloat(process.env.VALOR_OP2) || 30,
    op3: parseFloat(process.env.VALOR_OP3) || 50
};
let custoPass = parseFloat(process.env.VALOR_PASS) || 10;

// --- WEBHOOK MERCADO PAGO ---
app.post('/webhook', async (req, res) => {
    const { action, data } = req.body;
    if (action === "payment.updated" && data.id) {
        try {
            const p = await payment.get({ id: data.id });
            if (p.status === 'approved') {
                const userId = p.external_reference; 
                const valor = p.transaction_amount;
                const user = await client.users.fetch(userId);
                
                if (user) {
                    const codigo = `GT-${Math.random().toString(36).toUpperCase().substring(2, 10)}`;
                    codigosGerados[codigo] = valor; 

                    const embed = new EmbedBuilder()
                        .setTitle("✅ Pagamento Aprovado!")
                        .setDescription(`Você comprou um Gift Card de **R$ ${valor.toFixed(2)}**`)
                        .addFields({ name: "Código de Resgate:", value: `\`${codigo}\`` })
                        .setColor("#00FF00")
                        .setFooter({ text: "Use este código no botão 'Resgatar Gift Card'" });
                    await user.send({ embeds: [embed] }).catch(() => console.log("DM fechada."));
                }
            }
        } catch (e) { console.error("Erro Webhook:", e.message); }
    }
    res.sendStatus(200);
});

app.listen(process.env.PORT || 10000, () => console.log(`Servidor Online`));

// --- COMANDOS ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;

    if (msg.content === '!carteira') {
        const saldo = carteiras[msg.author.id] || 0;
        return msg.reply(`💳 Seu saldo na carteira do bot: **R$ ${saldo.toFixed(2)}**`);
    }

    if (!msg.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

    // Configurar preço do passe
    if (msg.content.startsWith('!setpass')) {
        const novoPreco = parseFloat(msg.content.split(' ')[1]);
        if (isNaN(novoPreco)) return msg.reply("❌ Use: `!setpass 15.00` ");
        custoPass = novoPreco;
        msg.reply(`✅ Valor do Passe atualizado para **R$ ${custoPass.toFixed(2)}**`);
    }

    if (msg.content === '!setloja') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_comprar').setLabel('Comprar Gift Card').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_resgatar_gift').setLabel('Resgatar Gift Card').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('btn_resgatar_pass').setLabel('Resgatar Booyah Pass').setStyle(ButtonStyle.Success)
        );
        const embed = new EmbedBuilder()
            .setTitle("🛒 LOJA AUTOMÁTICA")
            .setDescription("Clique nos botões abaixo para gerenciar seus créditos e resgates.")
            .setColor("Blue");
        msg.channel.send({ embeds: [embed], components: [row] });
    }

    if (msg.content === '!saldo') {
        try {
            const res = await axios.get(`https://lhubff.com.br/api/v1/balance`, { headers: { 'Authorization': `Bearer ${process.env.LHUB_API_KEY}` } });
            const s = res.data.balance !== undefined ? res.data.balance : "Erro na resposta";
            msg.reply(`💰 **Saldo LHub:** R$ ${s}`);
        } catch (e) { msg.reply("❌ Erro ao consultar API LHub."); }
    }

    if (msg.content === '!limpar') {
        if (msg.channel.name.startsWith('resgate-')) {
            msg.reply("🧹 Fechando canal em 5 segundos...");
            setTimeout(() => msg.channel.delete(), 5000);
        }
    }
});

// --- INTERAÇÕES ---
client.on('interactionCreate', async (i) => {
    try {
        if (i.isButton()) {
            // COMPRAR
            if (i.customId === 'btn_comprar') {
                const menu = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('escolher_gt').setPlaceholder('Escolha o valor').addOptions([
                        { label: `R$ ${valoresGT.op1.toFixed(2)}`, value: `${valoresGT.op1}` },
                        { label: `R$ ${valoresGT.op2.toFixed(2)}`, value: `${valoresGT.op2}` },
                        { label: `R$ ${valoresGT.op3.toFixed(2)}`, value: `${valoresGT.op3}` }
                    ])
                );
                await i.reply({ content: "Selecione o valor do Gift Card:", components: [menu], ephemeral: true });
            }

            // RESGATAR GIFT (ABRE MODAL)
            if (i.customId === 'btn_resgatar_gift') {
                const modal = new ModalBuilder().setCustomId('modal_gift').setTitle('Resgatar Gift Card');
                const input = new TextInputBuilder().setCustomId('cod_input').setLabel('Digite o código:').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await i.showModal(modal);
            }

            // RESGATAR PASS (TICKET)
            if (i.customId === 'btn_resgatar_pass') {
                const saldo = carteiras[i.user.id] || 0;
                if (saldo < custoPass) return i.reply({ content: `❌ Saldo insuficiente (R$ ${saldo.toFixed(2)}). O passe custa R$ ${custoPass.toFixed(2)}.`, ephemeral: true });

                const ticket = await i.guild.channels.create({
                    name: `resgate-${i.user.username}`,
                    type: ChannelType.GuildText,
                    parent: process.env.CATEGORY_TICKETS,
                    permissionOverwrites: [{ id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }]
                });
                await i.reply({ content: `✅ Ticket aberto em ${ticket}`, ephemeral: true });
                await ticket.send(`Olá <@${i.user.id}>, digite o **UID** para resgate (Custo: R$ ${custoPass.toFixed(2)}):`);

                const col = ticket.createMessageCollector({ filter: m => m.author.id === i.user.id, max: 1 });
                col.on('collect', async (m) => {
                    const uid = m.content.trim();
                    try {
                        const p = await axios.get(`https://lhubapi.shardweb.app/player?uid=${uid}`);
                        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`conf_${uid}`).setLabel('Confirmar e Descontar').setStyle(ButtonStyle.Danger));
                        await ticket.send({ content: `👤 Nick: **${p.data.nickname}**\nConfirmar envio para este UID?`, components: [row] });
                    } catch { ticket.send("❌ UID não encontrado."); }
                });
            }

            // CONFIRMAÇÃO FINAL + FEEDBACK
            if (i.customId.startsWith('conf_')) {
                const uid = i.customId.split('_')[1];
                if ((carteiras[i.user.id] || 0) < custoPass) return i.reply({ content: "Saldo insuficiente.", ephemeral: true });

                await i.update({ content: "⏳ Processando...", components: [] });
                try {
                    await axios.post(`https://lhubff.com.br/api/v1/passe`, { uid }, { headers: { 'Authorization': `Bearer ${process.env.LHUB_API_KEY}` } });
                    carteiras[i.user.id] -= custoPass;
                    
                    await i.followUp("✅ **Passe Enviado!** Agora, por favor, **envie um PRINT** comprovando o recebimento para nosso canal de feedback.");
                    
                    const filter = m => m.author.id === i.user.id && m.attachments.size > 0;
                    const collector = i.channel.createMessageCollector({ filter, max: 1, time: 600000 });
                    
                    collector.on('collect', async (msgFeed) => {
                        const channelLog = client.channels.cache.get(process.env.LOG_STAFF_CHANNEL);
                        const embedFeed = new EmbedBuilder()
                            .setTitle("⭐ Novo Feedback")
                            .setDescription(`Cliente: <@${i.user.id}>\nUID: ${uid}`)
                            .setImage(msgFeed.attachments.first().url)
                            .setColor("Gold");
                        if (channelLog) channelLog.send({ embeds: [embedFeed] });
                        await msgFeed.reply("🙏 Obrigado pelo seu feedback! Canal pronto para ser limpo com `!limpar`.");
                    });
                } catch { await i.followUp("❌ Erro na API LHub."); }
            }
        }

        // SUBMIT DO MODAL
        if (i.isModalSubmit() && i.customId === 'modal_gift') {
            const cod = i.fields.getTextInputValue('cod_input').trim();
            if (codigosGerados[cod]) {
                const valor = codigosGerados[cod];
                carteiras[i.user.id] = (carteiras[i.user.id] || 0) + valor;
                delete codigosGerados[cod];
                await i.reply({ content: `✅ Código resgatado! Você recebeu **R$ ${valor.toFixed(2)}** em sua carteira.`, ephemeral: true });
            } else {
                await i.reply({ content: "❌ Código inválido ou já usado.", ephemeral: true });
            }
        }

        // SELEÇÃO DO MENU
        if (i.isStringSelectMenu() && i.customId === 'escolher_gt') {
            const valor = parseFloat(i.values[0]);
            await i.update({ content: "⏳ Gerando PIX...", components: [], ephemeral: true });
            try {
                const res = await payment.create({
                    body: { transaction_amount: valor, description: `Gift Card R$ ${valor}`, payment_method_id: 'pix', payer: { email: 'contato@loja.com' }, external_reference: i.user.id }
                });
                await i.followUp({ content: `✅ PIX: \`${res.point_of_interaction.transaction_data.qr_code}\``, ephemeral: true });
            } catch { await i.followUp({ content: "Erro MP.", ephemeral: true }); }
        }
    } catch (err) { console.error("Erro Geral:", err); }
});

client.login(process.env.DISCORD_TOKEN);
