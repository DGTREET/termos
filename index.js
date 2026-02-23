const { Client, GatewayIntentBits, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
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

// --- SISTEMA DE WEBHOOK (MERCADO PAGO) ---
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
                    const embed = new EmbedBuilder()
                        .setTitle("✅ Pagamento Aprovado!")
                        .setDescription(`O seu pagamento de **R$ ${valor}** foi confirmado.`)
                        .addFields({ name: "Código de Resgate:", value: `\`${codigo}\`` })
                        .setColor("#00FF00");
                    
                    await user.send({ embeds: [embed] }).catch(() => console.log("DM do usuário fechada."));
                }
            }
        } catch (e) { console.error("Erro no Webhook:", e.message); }
    }
    res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor Web ativo na porta ${PORT}`));

// --- COMANDOS DO BOT ---
client.on('messageCreate', async (msg) => {
    if (!msg.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

    if (msg.content === '!setgt') {
        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('venda_gt').setPlaceholder('Escolha o valor').addOptions([
                { label: 'R$ 10', value: '10' }, { label: 'R$ 15', value: '15' }, { label: 'R$ 30', value: '30' }, { label: 'R$ 50', value: '50' }
            ])
        );
        msg.channel.send({ content: "💳 **Selecione o valor do GT Gift para comprar via PIX:**", components: [row] });
    }
    
    if (msg.content === '!setresgate') {
        const btn = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_resgate').setLabel('Resgatar Booyah Pass').setStyle(ButtonStyle.Success).setEmoji('🎫')
        );
        msg.channel.send({ content: "🎫 **Clique abaixo para abrir um ticket e resgatar o seu passe:**", components: [btn] });
    }
});

client.on('interactionCreate', async (i) => {
    if (i.isStringSelectMenu() && i.customId === 'venda_gt') {
        const valor = parseFloat(i.values[0]);
        await i.reply({ content: "⏳ Gerando o seu PIX...", ephemeral: true });
        try {
            const res = await payment.create({
                body: {
                    transaction_amount: valor,
                    description: `GT Gift R$ ${valor}`,
                    payment_method_id: 'pix',
                    payer: { email: 'cliente@lhub.com' },
                    external_reference: i.user.id
                }
            });
            const pix = res.point_of_interaction.transaction_data.qr_code;
            await i.editReply({ content: `✅ **PIX Gerado!**\n\n**Copia e Cola:**\n\`${pix}\`\n\n🕒 Após pagar, o código será enviado na sua DM automaticamente.`, ephemeral: true });
        } catch (e) { await i.editReply("❌ Erro ao gerar o pagamento. Verifique as credenciais."); }
    }

    if (i.isButton() && i.customId === 'btn_resgate') {
        const ticket = await i.guild.channels.create({
            name: `resgate-${i.user.username}`,
            type: ChannelType.GuildText,
            parent: process.env.CATEGORY_TICKETS,
            permissionOverwrites: [
                { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
            ]
        });
        await i.reply({ content: `Ticket aberto: ${ticket}`, ephemeral: true });
        await ticket.send(`Olá <@${i.user.id}>, digite o **UID** do jogador para receber o Passe:`);
        
        const col = ticket.createMessageCollector({ filter: m => m.author.id === i.user.id, max: 1 });
        col.on('collect', async (m) => {
            const uid = m.content;
            try {
                const p = await axios.post(`https://lhubapi.shardweb.app/player?uid=${uid}`);
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`conf_${uid}`).setLabel('Confirmar Nick e Enviar').setStyle(ButtonStyle.Primary));
                await ticket.send({ content: `👤 **Jogador Encontrado:**\nNick: \`${p.data.nickname}\`\nUID: \`${uid}\``, components: [row] });
            } catch { ticket.send("❌ UID não encontrado."); }
        });
    }

    if (i.isButton() && i.customId.startsWith('conf_')) {
        const uid = i.customId.split('_')[1];
        await i.update({ content: "⏳ Processando envio no site LHub...", components: [] });
        try {
            await axios.post(`https://lhubff.com.br/api/v1/passe`, { uid }, { headers: { 'Authorization': `Bearer ${process.env.LHUB_API_KEY}` } });
            await i.followUp({ content: `✅ **SUCESSO!** O Booyah Pass foi enviado para o UID ${uid}.` });
        } catch { await i.followUp("❌ Erro no envio. Verifique o saldo no site."); }
    }
});

// Relatório de Saldo (Staff) a cada 1 hora
setInterval(async () => {
    try {
        const res = await axios.get(`https://lhubff.com.br/api/v1/balance`, { headers: { 'Authorization': `Bearer ${process.env.LHUB_API_KEY}` } });
        const canal = client.channels.cache.get(process.env.LOG_STAFF_CHANNEL);
        if (canal) {
            const embed = new EmbedBuilder()
                .setTitle("📊 Status de Saldo LHub")
                .setDescription(`Saldo Atual: **R$ ${res.data.balance}**`)
                .setColor("Blue").setTimestamp();
            canal.send({ embeds: [embed] });
        }
    } catch (e) {}
}, 3600000);

client.login(process.env.DISCORD_TOKEN);

