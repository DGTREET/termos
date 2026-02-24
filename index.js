const { Client, GatewayIntentBits, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const axios = require('axios');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const express = require('express');
require('dotenv').config();

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ] 
});

const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const payment = new Payment(mpClient);
const app = express();
app.use(express.json());

// BANCO DE DADOS TEMPORÁRIO
let carteiras = {}; 
let codigosGerados = {}; 

// CONFIGURAÇÕES INICIAIS (Puxa do Render ou usa padrão)
let valoresGT = {
    op1: parseFloat(process.env.VALOR_OP1) || 10,
    op2: parseFloat(process.env.VALOR_OP2) || 30,
    op3: parseFloat(process.env.VALOR_OP3) || 50
};
let custoPass = parseFloat(process.env.VALOR_PASS) || 10; // Valor do Passe configurável

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
                        .setFooter({ text: "Resgate esse código no botão 'Resgatar Gift Card' da loja." });
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
    if (msg.author.bot) return;

    if (msg.content === '!carteira') {
        const saldo = carteiras[msg.author.id] || 0;
        return msg.reply(`💳 Seu saldo na carteira: **R$ ${saldo.toFixed(2)}**`);
    }

    if (!msg.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

    // COMANDO: Configurar valor do Passe
    if (msg.content.startsWith('!setpass')) {
        const novoValor = parseFloat(msg.content.split(' ')[1]);
        if (isNaN(novoValor)) return msg.reply("❌ Use: `!setpass [valor]` (Ex: !setpass 12.50)");
        custoPass = novoValor;
        msg.reply(`✅ Valor do resgate do Passe atualizado para: **R$ ${custoPass.toFixed(2)}**`);
    }

    if (msg.content === '!setloja') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_comprar').setLabel('Comprar Gift Card').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_resgatar_gift').setLabel('Resgatar Gift Card').setStyle(ButtonStyle.Warning),
            new ButtonBuilder().setCustomId('btn_resgatar_pass').setLabel('Resgatar Booyah Pass').setStyle(ButtonStyle.Success)
        );
        const embed = new EmbedBuilder()
            .setTitle("🛒 LOJA GT PASS")
            .setDescription("Siga os passos abaixo:\n\n1️⃣ **Comprar**: Gere um PIX e receba o código na DM.\n2️⃣ **Resgatar Gift**: Use o código da DM para por saldo no bot.\n3️⃣ **Resgatar Pass**: Use o saldo do bot para enviar o passe via UID.")
            .setColor("#2f3136");
        msg.channel.send({ embeds: [embed], components: [row] });
    }

    if (msg.content === '!saldo') { 
        try {
            const res = await axios.get(`https://lhubff.com.br/api/v1/balance`, { headers: { 'Authorization': `Bearer ${process.env.LHUB_API_KEY}` } });
            msg.reply(`💰 **Saldo LHub:** R$ ${res.data.balance || 0}`);
        } catch (e) { msg.reply("❌ Erro ao consultar API."); }
    }
});

// --- INTERAÇÕES ---
client.on('interactionCreate', async (i) => {
    
    // COMPRAR GIFT CARD
    if (i.isButton() && i.customId === 'btn_comprar') {
        const menu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('escolher_gt').setPlaceholder('Selecione o valor').addOptions([
                { label: `R$ ${valoresGT.op1}`, value: `${valoresGT.op1}` },
                { label: `R$ ${valoresGT.op2}`, value: `${valoresGT.op2}` },
                { label: `R$ ${valoresGT.op3}`, value: `${valoresGT.op3}` }
            ])
        );
        await i.reply({ content: "Selecione o valor desejado:", components: [menu], ephemeral: true });
    }

    if (i.isStringSelectMenu() && i.customId === 'escolher_gt') {
        const valor = parseFloat(i.values[0]);
        await i.update({ content: "⏳ Gerando PIX...", components: [], ephemeral: true });
        try {
            const res = await payment.create({
                body: { transaction_amount: valor, description: `Gift Card R$ ${valor}`, payment_method_id: 'pix', payer: { email: 'vendas@gtpass.com' }, external_reference: i.user.id }
            });
            await i.followUp({ content: `✅ **PIX Gerado!** Copie o código abaixo:\n\n\`${res.point_of_interaction.transaction_data.qr_code}\``, ephemeral: true });
        } catch (e) { await i.followUp({ content: "❌ Erro no Mercado Pago.", ephemeral: true }); }
    }

    // MODAL DE RESGATE DO GIFT (CÓDIGO DM -> SALDO BOT)
    if (i.isButton() && i.customId === 'btn_resgatar_gift') {
        const modal = new ModalBuilder().setCustomId('modal_gift').setTitle('Resgatar Gift Card');
        const input = new TextInputBuilder().setCustomId('cod_input').setLabel('Cole o código (GT-...) recebido na DM:').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId === 'modal_gift') {
        const cod = i.fields.getTextInputValue('cod_input').trim();
        if (codigosGerados[cod]) {
            const valor = codigosGerados[cod];
            carteiras[i.user.id] = (carteiras[i.user.id] || 0) + valor;
            delete codigosGerados[cod];
            await i.reply({ content: `✅ Sucesso! **R$ ${valor.toFixed(2)}** adicionados à sua carteira do bot.\nSaldo atual: **R$ ${carteiras[i.user.id].toFixed(2)}**`, ephemeral: true });
        } else {
            await i.reply({ content: "❌ Código inválido ou já utilizado.", ephemeral: true });
        }
    }

    // RESGATE DO PASSE (SALDO BOT -> SITE LHUB)
    if (i.isButton() && i.customId === 'btn_resgatar_pass') {
        const saldo = carteiras[i.user.id] || 0;
        if (saldo < custoPass) return i.reply({ content: `❌ Saldo insuficiente. O passe custa R$ ${custoPass.toFixed(2)}. Seu saldo: R$ ${saldo.toFixed(2)}`, ephemeral: true });

        const ticket = await i.guild.channels.create({
            name: `resgate-${i.user.username}`,
            type: ChannelType.GuildText,
            parent: process.env.CATEGORY_TICKETS,
            permissionOverwrites: [{ id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }]
        });
        await i.reply({ content: `✅ Ticket aberto: ${ticket}`, ephemeral: true });
        await ticket.send(`Olá <@${i.user.id}>, digite o **UID** para o envio (Custo: R$ ${custoPass.toFixed(2)}):`);

        const col = ticket.createMessageCollector({ filter: m => m.author.id === i.user.id, max: 1 });
        col.on('collect', async (m) => {
            const uid = m.content.trim();
            try {
                const p = await axios.get(`https://lhubapi.shardweb.app/player?uid=${uid}`);
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`confpass_${uid}`).setLabel('Confirmar e Pagar com Saldo').setStyle(ButtonStyle.Danger));
                await ticket.send({ content: `👤 Nick: **${p.data.nickname}**\n🆔 UID: **${uid}**\nDeseja confirmar o resgate?`, components: [row] });
            } catch { ticket.send("❌ UID inválido."); }
        });
    }

    // FINALIZAÇÃO E FEEDBACK
    if (i.isButton() && i.customId.startsWith('confpass_')) {
        const uid = i.customId.split('_')[1];
        if ((carteiras[i.user.id] || 0) < custoPass) return i.reply({ content: "Erro: Saldo sumiu.", ephemeral: true });

        await i.update({ content: "⏳ Enviando pedido para a LHub...", components: [] });
        try {
            await axios.post(`https://lhubff.com.br/api/v1/passe`, { uid }, { headers: { 'Authorization': `Bearer ${process.env.LHUB_API_KEY}` } });
            carteiras[i.user.id] -= custoPass;

            await i.followUp("✅ **Passe enviado com sucesso!**");
            
            // PEDIDO DE FEEDBACK
            const filter = m => m.author.id === i.user.id && (m.attachments.size > 0);
            await i.channel.send("📸 Para finalizar, **envie uma imagem/print** provando que o item chegou para ganharmos confiança!");
            
            const collector = i.channel.createMessageCollector({ filter, max: 1, time: 300000 });
            collector.on('collect', async (m) => {
                const canalFeedback = i.guild.channels.cache.get(process.env.LOG_STAFF_CHANNEL); // Canal de logs/feedback
                const embedFeedback = new EmbedBuilder()
                    .setTitle("🌟 NOVO FEEDBACK")
                    .setDescription(`Cliente: <@${i.user.id}>\nProduto: Booyah Pass\nStatus: Entregue`)
                    .setImage(m.attachments.first().url)
                    .setColor("Gold");
                
                if (canalFeedback) canalFeedback.send({ embeds: [embedFeedback] });
                await m.reply("🙏 Obrigado pelo feedback! Use `!limpar` para fechar o ticket.");
            });

        } catch { await i.followUp("❌ Erro no site LHub. Verifique seu saldo na plataforma."); }
    }
});

client.login(process.env.DISCORD_TOKEN);
