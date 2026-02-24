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

// BANCO DE DADOS TEMPORÁRIO E CONFIGS
let carteiras = {}; 
let codigosGerados = {}; 
let configBot = {
    valorPass: 10.00,
    op1: 10.00, op2: 30.00, op3: 50.00,
    canalLogs: process.env.LOG_STAFF_CHANNEL,
    categoriaTickets: process.env.CATEGORY_TICKETS
};

// CONFIGURAÇÃO DA VITRINE (!LOJA)
let vitrinePaginas = [
    { titulo: "🔥 BOOYAH PASS", desc: "O melhor custo benefício!\nPreço: **R$ 10,00**", img: "https://i.imgur.com/u5uP9mO.png", cor: "#ffaa00" },
    { titulo: "💎 DIAMANTES FF", desc: "Recarga rápida via ID.\n1000 Dimas: **R$ 35,00**", img: "https://i.imgur.com/vHq0M2y.png", cor: "#00ccff" }
];

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
                    const embed = new EmbedBuilder().setTitle("✅ Pagamento Aprovado!").setDescription(`Código: \`${codigo}\` (R$ ${valor.toFixed(2)})`).setColor("#00FF00");
                    await user.send({ embeds: [embed] }).catch(() => {});
                }
            }
        } catch (e) { console.error("Erro Webhook:", e.message); }
    }
    res.sendStatus(200);
});
app.listen(process.env.PORT || 10000);

// --- COMANDOS ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;

    // COMANDO !HELP
    if (msg.content === '!help' || msg.content === '!ajuda') {
        setTimeout(() => msg.delete().catch(() => {}), 1000);
        const embedHelp = new EmbedBuilder()
            .setTitle("❓ Central de Ajuda")
            .setColor("Blue")
            .addFields(
                { name: "👤 Clientes", value: "`!carteira`, `!perfil [UID]`, `!loja`" },
                { name: "🛠️ Staff", value: "`!admin`, `!setgt`, `!setticketpass`, `!setsuporte`, `!trancachat`, `!destrancarchat`" }
            );
        return msg.channel.send({ embeds: [embedHelp] });
    }

    // COMANDO !PERFIL [UID]
    if (msg.content.startsWith('!perfil')) {
        setTimeout(() => msg.delete().catch(() => {}), 1000);
        const uid = msg.content.split(' ')[1];
        if (!uid) return msg.channel.send("❌ Use: `!perfil [UID]`").then(m => setTimeout(() => m.delete(), 5000));
        try {
            const res = await axios.get(`https://lhubapi.shardweb.app/player?uid=${uid}`);
            const embed = new EmbedBuilder()
                .setTitle("🎮 Perfil do Jogador")
                .addFields({ name: "Nick", value: `\`${res.data.nickname}\``, inline: true }, { name: "UID", value: `\`${uid}\``, inline: true })
                .setColor("Purple");
            msg.channel.send({ embeds: [embed] });
        } catch { msg.channel.send("❌ UID não encontrado."); }
    }

    // COMANDO !CARTEIRA
    if (msg.content === '!carteira') {
        setTimeout(() => msg.delete().catch(() => {}), 1000);
        const saldo = carteiras[msg.author.id] || 0;
        return msg.channel.send(`<@${msg.author.id}>, seu saldo: **R$ ${saldo.toFixed(2)}**`);
    }

    // MODERAÇÃO CHAT
    if (msg.content === '!trancachat' && msg.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        msg.delete();
        await msg.channel.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: false });
        return msg.channel.send("🔒 **Chat trancado.**");
    }
    if (msg.content === '!destrancarchat' && msg.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        msg.delete();
        await msg.channel.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: true });
        return msg.channel.send("🔓 **Chat liberado.**");
    }

    // VITRINE (!LOJA)
    if (msg.content === '!loja') {
        msg.delete();
        let index = 0;
        const generateEmbed = (idx) => new EmbedBuilder()
            .setTitle(vitrinePaginas[idx].titulo).setDescription(vitrinePaginas[idx].desc)
            .setImage(vitrinePaginas[idx].img).setColor(vitrinePaginas[idx].cor)
            .setFooter({ text: `Página ${idx + 1} de ${vitrinePaginas.length}` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('loja_voltar').setEmoji('⏪').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('loja_info').setEmoji('ℹ️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('loja_seguir').setEmoji('⏩').setStyle(ButtonStyle.Secondary)
        );
        const m = await msg.channel.send({ embeds: [generateEmbed(0)], components: [row] });
        const collector = m.createMessageComponentCollector({ time: 600000 });
        collector.on('collect', async i => {
            if (i.user.id !== msg.author.id) return i.reply({ content: "Abra seu próprio !loja", ephemeral: true });
            if (i.customId === 'loja_seguir') index = (index + 1) % vitrinePaginas.length;
            else if (i.customId === 'loja_voltar') index = (index - 1 + vitrinePaginas.length) % vitrinePaginas.length;
            await i.update({ embeds: [generateEmbed(index)] });
        });
    }

    // ADMIN PANEL (!ADMIN)
    if (msg.content === '!admin' && msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
        msg.delete();
        const embed = new EmbedBuilder().setTitle("⚙️ PAINEL ADMIN").setColor("Grey");
        const r1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('adm_add').setLabel('Add Saldo').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('adm_rem').setLabel('Remover Saldo').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('adm_nome').setLabel('Nome Bot').setStyle(ButtonStyle.Secondary)
        );
        const r2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('adm_avatar').setLabel('Avatar Bot').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('adm_gift_man').setLabel('Gerar Gift').setStyle(ButtonStyle.Primary)
        );
        msg.channel.send({ embeds: [embed], components: [r1, r2] });
    }

    // SET TICKETS
    if (msg.content === '!setgt' && msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
        msg.delete();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_compra').setLabel('Comprar Gift').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_resgate_gift').setLabel('Resgatar Código').setStyle(ButtonStyle.Secondary)
        );
        msg.channel.send({ content: "💳 **COMPRAS E SALDO**", components: [row] });
    }

    if (msg.content === '!setticketpass' && msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
        msg.delete();
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_resgate_pass').setLabel('Resgatar Passe').setStyle(ButtonStyle.Success));
        msg.channel.send({ content: "🎫 **RESGATE DE PASSE**", components: [row] });
    }

    if (msg.content === '!setsuporte' && msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
        msg.delete();
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_suporte').setLabel('Abrir Suporte').setStyle(ButtonStyle.Danger));
        msg.channel.send({ content: "🎧 **SUPORTE TÉCNICO**", components: [row] });
    }

    // FECHAR TICKET COM LOGS HTML
    if (msg.content === '!fechar' && (msg.channel.name.includes('resgate-') || msg.channel.name.includes('ticket-'))) {
        msg.delete();
        const msgs = await msg.channel.messages.fetch();
        let logHtml = `<html><body style="background:#1a1a1a;color:white;font-family:sans-serif;padding:20px;"><h1>Log: ${msg.channel.name}</h1><hr>`;
        msgs.reverse().forEach(m => { logHtml += `<p><strong>${m.author.tag}:</strong> ${m.content}</p>`; });
        logHtml += `</body></html>`;
        const canal = client.channels.cache.get(configBot.canalLogs);
        if (canal) await canal.send({ content: `📁 Log: ${msg.channel.name}`, files: [new AttachmentBuilder(Buffer.from(logHtml), { name: 'log.html' })] });
        msg.channel.send("🧹 Fechando...").then(() => setTimeout(() => msg.channel.delete(), 5000));
    }
});

// --- INTERAÇÕES ---
client.on('interactionCreate', async (i) => {
    if (!i.guild) return;

    if (i.customId === 'adm_add' || i.customId === 'adm_rem') {
        const modal = new ModalBuilder().setCustomId(i.customId).setTitle('Gerenciar Saldo');
        const u = new TextInputBuilder().setCustomId('u').setLabel('ID do Usuário').setStyle(TextInputStyle.Short).setRequired(true);
        const v = new TextInputBuilder().setCustomId('v').setLabel('Valor').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(u), new ActionRowBuilder().addComponents(v));
        return i.showModal(modal);
    }

    if (i.customId === 'adm_nome') {
        const m = new ModalBuilder().setCustomId('mod_nome').setTitle('Nome Bot');
        const n = new TextInputBuilder().setCustomId('n').setLabel('Novo Nome').setStyle(TextInputStyle.Short).setRequired(true);
        m.addComponents(new ActionRowBuilder().addComponents(n));
        return i.showModal(m);
    }

    if (i.customId === 'btn_resgate_pass') {
        const saldo = carteiras[i.user.id] || 0;
        if (saldo < configBot.valorPass) return i.reply({ content: `❌ Saldo insuficiente (R$ ${saldo.toFixed(2)}). Recarregue no canal de compras!`, ephemeral: true });
        const t = await i.guild.channels.create({
            name: `resgate-${i.user.username}`, type: ChannelType.GuildText, parent: configBot.categoriaTickets,
            permissionOverwrites: [{ id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }]
        });
        await i.reply({ content: `✅ Ticket: ${t}`, ephemeral: true });
        await t.send(`Olá <@${i.user.id}>! Digite o **UID**:`);
        const col = t.createMessageCollector({ filter: m => m.author.id === i.user.id, max: 1 });
        col.on('collect', async (m) => {
            const uid = m.content.trim();
            try {
                const p = await axios.get(`https://lhubapi.shardweb.app/player?uid=${uid}`);
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`confirm_${uid}`).setLabel('Confirmar').setStyle(ButtonStyle.Success));
                await t.send({ content: `Nick: **${p.data.nickname}**\nConfirma o envio?`, components: [row] });
            } catch { t.send("❌ Erro UID."); }
        });
    }

    if (i.customId === 'btn_suporte') {
        const t = await i.guild.channels.create({
            name: `ticket-${i.user.username}`, type: ChannelType.GuildText, parent: configBot.categoriaTickets,
            permissionOverwrites: [{ id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }]
        });
        await i.reply({ content: `✅ Suporte: ${t}`, ephemeral: true });
        await t.send(`🎧 <@${i.user.id}>, como podemos ajudar?`);
    }

    if (i.isModalSubmit()) {
        const uid = i.fields.getTextInputValue('u');
        const val = parseFloat(i.fields.getTextInputValue('v')?.replace(',', '.') || 0);
        if (i.customId === 'adm_add') {
            carteiras[uid] = (carteiras[uid] || 0) + val;
            await i.reply({ content: `✅ Saldo de <@${uid}>: R$ ${carteiras[uid].toFixed(2)}`, ephemeral: true });
        } else if (i.customId === 'adm_rem') {
            carteiras[uid] = Math.max(0, (carteiras[uid] || 0) - val);
            await i.reply({ content: `✅ Saldo de <@${uid}>: R$ ${carteiras[uid].toFixed(2)}`, ephemeral: true });
        } else if (i.customId === 'mod_nome') {
            await client.user.setUsername(i.fields.getTextInputValue('n'));
            await i.reply({ content: "✅ Nome alterado!", ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
