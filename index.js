const { Client, GatewayIntentBits, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const axios = require('axios');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const express = require('express');
require('dotenv').config();

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN || 'TOKEN_VAZIO' });
const payment = new Payment(mpClient);
const app = express();
app.use(express.json());

// BANCO DE DADOS TEMPORÁRIO
let carteiras = {}; 
let codigosGerados = {}; 
let configBot = {
    valorPass: parseFloat(process.env.VALOR_PASS) || 10.00,
    op1: parseFloat(process.env.VALOR_OP1) || 10.00,
    op2: parseFloat(process.env.VALOR_OP2) || 30.00,
    op3: parseFloat(process.env.VALOR_OP3) || 50.00,
    canalFeedback: process.env.LOG_STAFF_CHANNEL || 'ID_DO_CANAL',
    categoriaTickets: process.env.CATEGORY_TICKETS || 'ID_DA_CATEGORIA'
};

// --- WEBHOOK ---
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
                        .setDescription(`Seu código: \`${codigo}\` (R$ ${valor.toFixed(2)})`)
                        .setColor("#00FF00");
                    await user.send({ embeds: [embed] }).catch(() => {});
                }
            }
        } catch (e) { console.error("Erro Webhook:", e.message); }
    }
    res.sendStatus(200);
});

app.listen(process.env.PORT || 10000, () => console.log("Servidor Online"));

// --- COMANDOS ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;

    // COMANDO !perfil
    if (msg.content.startsWith('!perfil')) {
        setTimeout(() => msg.delete().catch(() => {}), 1000);
        const uid = msg.content.split(' ')[1];
        if (!uid) return msg.channel.send("❌ Use: `!perfil [UID]`").then(m => setTimeout(() => m.delete(), 5000));

        try {
            const res = await axios.get(`https://lhubapi.shardweb.app/player?uid=${uid}`);
            const embed = new EmbedBuilder()
                .setTitle("🎮 Perfil Encontrado")
                .addFields({ name: "👤 Nick", value: `\`${res.data.nickname}\``, inline: true }, { name: "🆔 UID", value: `\`${uid}\``, inline: true })
                .setColor("#5865F2");
            msg.channel.send({ embeds: [embed] });
        } catch { msg.channel.send("❌ UID não encontrado."); }
    }

    // COMANDO !help
    if (msg.content === '!help') {
        setTimeout(() => msg.delete().catch(() => {}), 1000);
        const embed = new EmbedBuilder()
            .setTitle("❓ Ajuda")
            .addFields(
                { name: "👤 Clientes", value: "`!carteira`, `!perfil [UID]`, `!help`" },
                { name: "🛠️ Admin", value: "`!setloja`, `!config [pass/op1] [valor]`, `!saldo`, `!limpar`" }
            ).setColor("Blue");
        msg.channel.send({ embeds: [embed] });
    }

    if (!msg.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

    if (msg.content === '!setloja') {
        setTimeout(() => msg.delete().catch(() => {}), 1000);
        const embed = new EmbedBuilder().setTitle("🏪 LOJA GT PASS").setDescription("Selecione uma opção:").setColor("#5865F2");
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_loja_comprar').setLabel('Comprar Gift').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_loja_resgatar_gift').setLabel('Resgatar Gift').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('btn_loja_resgatar_pass').setLabel('Resgatar Passe').setStyle(ButtonStyle.Success)
        );
        msg.channel.send({ embeds: [embed], components: [row] });
    }

    if (msg.content === '!limpar' && msg.channel.name.includes('resgate-')) {
        msg.channel.delete();
    }
});

// --- INTERAÇÕES ---
client.on('interactionCreate', async (i) => {
    if (!i.guild) return;

    try {
        if (i.customId === 'btn_loja_comprar') {
            const menu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('sel_compra').setPlaceholder('Escolha o valor').addOptions([
                    { label: `R$ ${configBot.op1.toFixed(2)}`, value: `${configBot.op1}` },
                    { label: `R$ ${configBot.op2.toFixed(2)}`, value: `${configBot.op2}` }
                ])
            );
            await i.reply({ content: "Escolha o valor:", components: [menu], ephemeral: true });
        }

        if (i.customId === 'btn_loja_resgatar_gift') {
            const modal = new ModalBuilder().setCustomId('mod_gift').setTitle('Resgatar');
            const input = new TextInputBuilder().setCustomId('c').setLabel('Código:').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await i.showModal(modal);
        }

        if (i.isModalSubmit() && i.customId === 'mod_gift') {
            const cod = i.fields.getTextInputValue('c').trim();
            if (codigosGerados[cod]) {
                const v = codigosGerados[cod];
                carteiras[i.user.id] = (carteiras[i.user.id] || 0) + v;
                delete codigosGerados[cod];
                await i.reply({ content: `✅ R$ ${v.toFixed(2)} adicionados!`, ephemeral: true });
            } else { await i.reply({ content: "❌ Inválido.", ephemeral: true }); }
        }

        if (i.customId === 'btn_loja_resgatar_pass') {
            const saldo = carteiras[i.user.id] || 0;
            if (saldo < configBot.valorPass) return i.reply({ content: "Saldo insuficiente.", ephemeral: true });

            const ticket = await i.guild.channels.create({
                name: `resgate-${i.user.username}`,
                type: ChannelType.GuildText,
                parent: configBot.categoriaTickets,
                permissionOverwrites: [{ id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }]
            });
            await i.reply({ content: `✅ Ticket: ${ticket}`, ephemeral: true });
            await ticket.send(`Olá <@${i.user.id}>! Digite o **UID** do jogador:`);

            const col = ticket.createMessageCollector({ filter: m => m.author.id === i.user.id, max: 1 });
            col.on('collect', async (m) => {
                const uid = m.content.trim();
                try {
                    const p = await axios.get(`https://lhubapi.shardweb.app/player?uid=${uid}`);
                    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`conf_${uid}`).setLabel('Confirmar').setStyle(ButtonStyle.Success));
                    await ticket.send({ content: `👤 Nick: **${p.data.nickname}**\nConfirma o envio?`, components: [row] });
                } catch { ticket.send("❌ UID inválido."); }
            });
        }

        if (i.customId && i.customId.startsWith('conf_')) {
            const uid = i.customId.split('_')[1];
            await i.update({ content: "⏳ Enviando...", components: [] });
            try {
                await axios.post(`https://lhubff.com.br/api/v1/passe`, { uid }, { headers: { 'Authorization': `Bearer ${process.env.LHUB_API_KEY}` } });
                carteiras[i.user.id] -= configBot.valorPass;
                await i.followUp("✅ **Sucesso!** Mande o PRINT e use `!limpar`.");
            } catch { await i.followUp("❌ Erro LHub."); }
        }
    } catch (e) { console.error(e); }
});

client.login(process.env.DISCORD_TOKEN);
