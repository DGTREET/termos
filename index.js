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

let carteiras = {}; 
let codigosGerados = {}; 
let configBot = {
    valorPass: parseFloat(process.env.VALOR_PASS) || 10,
    op1: parseFloat(process.env.VALOR_OP1) || 10,
    op2: parseFloat(process.env.VALOR_OP2) || 30,
    op3: parseFloat(process.env.VALOR_OP3) || 50,
    canalFeedback: process.env.LOG_STAFF_CHANNEL,
    categoriaTickets: process.env.CATEGORY_TICKETS
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

app.listen(process.env.PORT || 10000);

// --- COMANDOS ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;

    // COMANDO !perfil [UID]
    if (msg.content.startsWith('!perfil')) {
        setTimeout(() => msg.delete().catch(() => {}), 1000);
        const args = msg.content.split(' ');
        const uid = args[1];

        if (!uid) return msg.channel.send(`❌ <@${msg.author.id}>, use: \`!perfil [UID]\``).then(m => setTimeout(() => m.delete(), 5000));

        try {
            const res = await axios.get(`https://lhubapi.shardweb.app/player?uid=${uid}`);
            const player = res.data;

            if (!player || !player.nickname) throw new Error();

            const embedPerfil = new EmbedBuilder()
                .setTitle("🎮 Perfil do Jogador")
                .setThumbnail(msg.author.displayAvatarURL())
                .addFields(
                    { name: "👤 Nickname", value: `\`${player.nickname}\``, inline: true },
                    { name: "🆔 UID", value: `\`${uid}\``, inline: true }
                )
                .setColor("#5865F2")
                .setFooter({ text: "Consulta realizada com sucesso!" })
                .setTimestamp();

            return msg.channel.send({ embeds: [embedPerfil] });
        } catch (error) {
            return msg.channel.send("❌ Não consegui encontrar informações para este UID. Verifique se o número está correto.").then(m => setTimeout(() => m.delete(), 5000));
        }
    }

    // COMANDO !help / !ajuda
    if (msg.content === '!help' || msg.content === '!ajuda') {
        setTimeout(() => msg.delete().catch(() => {}), 1000);
        const embedHelp = new EmbedBuilder()
            .setTitle("❓ Central de Comandos")
            .setColor("#0099ff")
            .addFields(
                { name: "👤 Clientes", value: "`!carteira` - Vê seu saldo.\n`!perfil [UID]` - Consulta um ID.\n`!help` - Mostra esta mensagem." },
                { name: "🛠️ Staff", value: "`!setloja` - Envia o painel principal.\n`!config [pass/op1/op2/op3] [valor]` - Ajusta preços.\n`!gerargift [valor]` - Cria código manual.\n`!setsaldo @user [valor]` - Edita carteira.\n`!saldo` - Vê saldo na LHub.\n`!limpar` - Fecha o ticket." }
            );
        return msg.channel.send({ embeds: [embedHelp] });
    }

    if (msg.content === '!carteira') {
        setTimeout(() => msg.delete().catch(() => {}), 1000);
        const saldo = carteiras[msg.author.id] || 0;
        return msg.channel.send(`<@${msg.author.id}>, seu saldo é: **R$ ${saldo.toFixed(2)}**`);
    }

    // Filtro Admin
    if (!msg.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

    if (msg.content === '!setloja') {
        setTimeout(() => msg.delete().catch(() => {}), 1000);
        const embedLoja = new EmbedBuilder()
            .setTitle("🏪 GT PASS - LOJA AUTOMÁTICA")
            .setDescription("Escolha uma opção para iniciar:")
            .setColor("#5865F2");
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_loja_comprar').setLabel('Comprar Gift').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_loja_resgatar_gift').setLabel('Resgatar Gift').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('btn_loja_resgatar_pass').setLabel('Resgatar Passe').setStyle(ButtonStyle.Success)
        );
        msg.channel.send({ embeds: [embedLoja], components: [row] });
    }

    if (msg.content.startsWith('!config') || msg.content.startsWith('!gerargift') || msg.content.startsWith('!setsaldo') || msg.content === '!saldo') {
        setTimeout(() => msg.delete().catch(() => {}), 1000);
        
        if (msg.content.startsWith('!config')) {
            const args = msg.content.split(' ');
            const tipo = args[1]; const valor = parseFloat(args[2]);
            if (tipo === 'pass') configBot.valorPass = valor;
            else if (tipo === 'op1') configBot.op1 = valor;
            else if (tipo === 'op2') configBot.op2 = valor;
            else if (tipo === 'op3') configBot.op3 = valor;
            msg.channel.send(`✅ **${tipo}** alterado para R$ ${valor.toFixed(2)}`).then(m => setTimeout(() => m.delete(), 5000));
        }

        if (msg.content.startsWith('!gerargift')) {
            const valor = parseFloat(msg.content.split(' ')[1]);
            const novoCod = `ADMIN-${Math.random().toString(36).toUpperCase().substring(2, 8)}`;
            codigosGerados[novoCod] = valor;
            msg.channel.send(`🎁 Gift Manual: \`${novoCod}\` (R$ ${valor.toFixed(2)})`);
        }
        
        if (msg.content === '!saldo') {
            try {
                const res = await axios.get(`https://lhubff.com.br/api/v1/balance`, { headers: { 'Authorization': `Bearer ${process.env.LHUB_API_KEY}` } });
                msg.channel.send(`💰 Saldo LHub: R$ ${res.data.balance || 0}`).then(m => setTimeout(() => m.delete(), 10000));
            } catch { msg.channel.send("❌ Erro API."); }
        }
    }

    if (msg.content === '!limpar') {
        setTimeout(() => msg.delete().catch(() => {}), 1000);
        if (msg.channel.name.includes('resgate-')) {
            msg.channel.send("🧹 Fechando em 5 segundos...");
            setTimeout(() => msg.channel.delete(), 5000);
        }
    }
});

// --- INTERAÇÕES ---
client.on('interactionCreate', async (i) => {
    if (!i.guild) return;

    if (i.customId === 'btn_loja_comprar') {
        const menu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('selecionar_valor_compra').setPlaceholder('Selecione o valor').addOptions([
                { label: `R$ ${configBot.op1.toFixed(2)}`, value: `${configBot.op1}` },
                { label: `R$ ${configBot.op2.toFixed(2)}`, value: `${configBot.op2}` },
                { label: `R$ ${configBot.op3.toFixed(2)}`, value: `${configBot.op3}` }
            ])
        );
        await i.reply({ content: "Selecione o valor do Gift Card:", components: [menu], ephemeral: true });
    }

    if (i.isStringSelectMenu() && i.customId === 'selecionar_valor_compra') {
        const valor = parseFloat(i.values[0]);
        await i.update({ content: "⏳ Gerando PIX...", components: [] });
        try {
            const res = await payment.create({
                body: { transaction_amount: valor, description: `Gift Card R$ ${valor}`, payment_method_id: 'pix', payer: { email: 'vendas@gt.com' }, external_reference: i.user.id }
            });
            await i.followUp({ content: `✅ PIX Gerado: \`${res.point_of_interaction.transaction_data.qr_code}\``, ephemeral: true });
        } catch { await i.followUp({ content: "Erro MP.", ephemeral: true }); }
    }

    if (i.customId === 'btn_loja_resgatar_gift') {
        const modal = new ModalBuilder().setCustomId('modal_gift').setTitle('Resgate de Saldo');
        const input = new TextInputBuilder().setCustomId('cod').setLabel('Código GT:').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId === 'modal_gift') {
        const cod = i.fields.getTextInputValue('cod').trim();
        if (codigosGerados[cod]) {
            const v = codigosGerados[cod];
            carteiras[i.user.id] = (carteiras[i.user.id] || 0) + v;
            delete codigosGerados[cod];
            await i.reply({ content: `✅ Resgatado: R$ ${v.toFixed(2)}. Saldo: R$ ${carteiras[i.user.id].toFixed(2)}`, ephemeral: true });
        } else {
            await i.reply({ content: "❌ Código inválido.", ephemeral: true });
        }
    }

    if (i.customId === 'btn_loja_resgatar_pass') {
        const saldo = carteiras[i.user.id] || 0;
        if (saldo < configBot.valorPass) return i.reply({ content: `❌ Saldo insuficiente (R$ ${saldo.toFixed(2)}).`, ephemeral: true });

        const ticket = await i.guild.channels.create({
            name: `🎫-resgate-${i.user.username}`,
            type: ChannelType.GuildText,
            parent: configBot.categoriaTickets,
            permissionOverwrites: [{ id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }]
        });
        await i.reply({ content: `✅ Ticket: ${ticket}`, ephemeral: true });
        await ticket.send(`Olá <@${i.user.id}>! Digite o **UID** do jogador para o resgate:`);

        const col = ticket.createMessageCollector({ filter: m => m.author.id === i.user.id, max: 1 });
        col.on('collect', async (m) => {
            const uid = m.content.trim();
            try {
                const p = await axios.get(`https://lhubapi.shardweb.app/player?uid=${uid}`);
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`conf_${uid}`).setLabel('Confirmar Envio').setStyle(ButtonStyle.Success));
                await ticket.send({ content: `👤 Nick: **${p.data.nickname}**\nConfirma o envio do passe?`, components: [row] });
            } catch { ticket.send("❌ UID não encontrado."); }
        });
    }

    if (i.customId.startsWith('conf_')) {
        const uid = i.customId.split('_')[1];
        await i.update({ content: "⏳ Enviando...", components: [] });
        try {
            await axios.post(`https://lhubff.com.br/api/v1/passe`, { uid }, { headers: { 'Authorization': `Bearer ${process.env.LHUB_API_KEY}` } });
            carteiras[i.user.id] -= configBot.valorPass;
            await i.followUp("✅ **Enviado!** Mande um **PRINT** para finalizar.");
            
            const filter = m => m.author.id === i.user.id && m.attachments.size > 0;
            const collector = i.channel.createMessageCollector({ filter, max: 1, time: 600000 });
            collector.on('collect', async (msgImg) => {
                const logChan = client.channels.cache.get(configBot.canalFeedback);
                if (logChan) logChan.send({ content: `🌟 Feedback de <@${i.user.id}> (UID: ${uid})`, files: [msgImg.attachments.first().url] });
                await msgImg.reply("🙏 Feedback recebido! Use `!limpar`.");
            });
        } catch { await i.followUp("❌ Erro LHub."); }
    }
});

client.login(process.env.DISCORD_TOKEN);
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

let carteiras = {}; 
let codigosGerados = {}; 
let configBot = {
    valorPass: parseFloat(process.env.VALOR_PASS) || 10,
    op1: parseFloat(process.env.VALOR_OP1) || 10,
    op2: parseFloat(process.env.VALOR_OP2) || 30,
    op3: parseFloat(process.env.VALOR_OP3) || 50,
    canalFeedback: process.env.LOG_STAFF_CHANNEL,
    categoriaTickets: process.env.CATEGORY_TICKETS
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

app.listen(process.env.PORT || 10000);

// --- COMANDOS ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;

    // COMANDO !perfil [UID]
    if (msg.content.startsWith('!perfil')) {
        setTimeout(() => msg.delete().catch(() => {}), 1000);
        const args = msg.content.split(' ');
        const uid = args[1];

        if (!uid) return msg.channel.send(`❌ <@${msg.author.id}>, use: \`!perfil [UID]\``).then(m => setTimeout(() => m.delete(), 5000));

        try {
            const res = await axios.get(`https://lhubapi.shardweb.app/player?uid=${uid}`);
            const player = res.data;

            if (!player || !player.nickname) throw new Error();

            const embedPerfil = new EmbedBuilder()
                .setTitle("🎮 Perfil do Jogador")
                .setThumbnail(msg.author.displayAvatarURL())
                .addFields(
                    { name: "👤 Nickname", value: `\`${player.nickname}\``, inline: true },
                    { name: "🆔 UID", value: `\`${uid}\``, inline: true }
                )
                .setColor("#5865F2")
                .setFooter({ text: "Consulta realizada com sucesso!" })
                .setTimestamp();

            return msg.channel.send({ embeds: [embedPerfil] });
        } catch (error) {
            return msg.channel.send("❌ Não consegui encontrar informações para este UID. Verifique se o número está correto.").then(m => setTimeout(() => m.delete(), 5000));
        }
    }

    // COMANDO !help / !ajuda
    if (msg.content === '!help' || msg.content === '!ajuda') {
        setTimeout(() => msg.delete().catch(() => {}), 1000);
        const embedHelp = new EmbedBuilder()
            .setTitle("❓ Central de Comandos")
            .setColor("#0099ff")
            .addFields(
                { name: "👤 Clientes", value: "`!carteira` - Vê seu saldo.\n`!perfil [UID]` - Consulta um ID.\n`!help` - Mostra esta mensagem." },
                { name: "🛠️ Staff", value: "`!setloja` - Envia o painel principal.\n`!config [pass/op1/op2/op3] [valor]` - Ajusta preços.\n`!gerargift [valor]` - Cria código manual.\n`!setsaldo @user [valor]` - Edita carteira.\n`!saldo` - Vê saldo na LHub.\n`!limpar` - Fecha o ticket." }
            );
        return msg.channel.send({ embeds: [embedHelp] });
    }

    if (msg.content === '!carteira') {
        setTimeout(() => msg.delete().catch(() => {}), 1000);
        const saldo = carteiras[msg.author.id] || 0;
        return msg.channel.send(`<@${msg.author.id}>, seu saldo é: **R$ ${saldo.toFixed(2)}**`);
    }

    // Filtro Admin
    if (!msg.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

    if (msg.content === '!setloja') {
        setTimeout(() => msg.delete().catch(() => {}), 1000);
        const embedLoja = new EmbedBuilder()
            .setTitle("🏪 GT PASS - LOJA AUTOMÁTICA")
            .setDescription("Escolha uma opção para iniciar:")
            .setColor("#5865F2");
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_loja_comprar').setLabel('Comprar Gift').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_loja_resgatar_gift').setLabel('Resgatar Gift').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('btn_loja_resgatar_pass').setLabel('Resgatar Passe').setStyle(ButtonStyle.Success)
        );
        msg.channel.send({ embeds: [embedLoja], components: [row] });
    }

    if (msg.content.startsWith('!config') || msg.content.startsWith('!gerargift') || msg.content.startsWith('!setsaldo') || msg.content === '!saldo') {
        setTimeout(() => msg.delete().catch(() => {}), 1000);
        
        if (msg.content.startsWith('!config')) {
            const args = msg.content.split(' ');
            const tipo = args[1]; const valor = parseFloat(args[2]);
            if (tipo === 'pass') configBot.valorPass = valor;
            else if (tipo === 'op1') configBot.op1 = valor;
            else if (tipo === 'op2') configBot.op2 = valor;
            else if (tipo === 'op3') configBot.op3 = valor;
            msg.channel.send(`✅ **${tipo}** alterado para R$ ${valor.toFixed(2)}`).then(m => setTimeout(() => m.delete(), 5000));
        }

        if (msg.content.startsWith('!gerargift')) {
            const valor = parseFloat(msg.content.split(' ')[1]);
            const novoCod = `ADMIN-${Math.random().toString(36).toUpperCase().substring(2, 8)}`;
            codigosGerados[novoCod] = valor;
            msg.channel.send(`🎁 Gift Manual: \`${novoCod}\` (R$ ${valor.toFixed(2)})`);
        }
        
        if (msg.content === '!saldo') {
            try {
                const res = await axios.get(`https://lhubff.com.br/api/v1/balance`, { headers: { 'Authorization': `Bearer ${process.env.LHUB_API_KEY}` } });
                msg.channel.send(`💰 Saldo LHub: R$ ${res.data.balance || 0}`).then(m => setTimeout(() => m.delete(), 10000));
            } catch { msg.channel.send("❌ Erro API."); }
        }
    }

    if (msg.content === '!limpar') {
        setTimeout(() => msg.delete().catch(() => {}), 1000);
        if (msg.channel.name.includes('resgate-')) {
            msg.channel.send("🧹 Fechando em 5 segundos...");
            setTimeout(() => msg.channel.delete(), 5000);
        }
    }
});

// --- INTERAÇÕES ---
client.on('interactionCreate', async (i) => {
    if (!i.guild) return;

    if (i.customId === 'btn_loja_comprar') {
        const menu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('selecionar_valor_compra').setPlaceholder('Selecione o valor').addOptions([
                { label: `R$ ${configBot.op1.toFixed(2)}`, value: `${configBot.op1}` },
                { label: `R$ ${configBot.op2.toFixed(2)}`, value: `${configBot.op2}` },
                { label: `R$ ${configBot.op3.toFixed(2)}`, value: `${configBot.op3}` }
            ])
        );
        await i.reply({ content: "Selecione o valor do Gift Card:", components: [menu], ephemeral: true });
    }

    if (i.isStringSelectMenu() && i.customId === 'selecionar_valor_compra') {
        const valor = parseFloat(i.values[0]);
        await i.update({ content: "⏳ Gerando PIX...", components: [] });
        try {
            const res = await payment.create({
                body: { transaction_amount: valor, description: `Gift Card R$ ${valor}`, payment_method_id: 'pix', payer: { email: 'vendas@gt.com' }, external_reference: i.user.id }
            });
            await i.followUp({ content: `✅ PIX Gerado: \`${res.point_of_interaction.transaction_data.qr_code}\``, ephemeral: true });
        } catch { await i.followUp({ content: "Erro MP.", ephemeral: true }); }
    }

    if (i.customId === 'btn_loja_resgatar_gift') {
        const modal = new ModalBuilder().setCustomId('modal_gift').setTitle('Resgate de Saldo');
        const input = new TextInputBuilder().setCustomId('cod').setLabel('Código GT:').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await i.showModal(modal);
    }

    if (i.isModalSubmit() && i.customId === 'modal_gift') {
        const cod = i.fields.getTextInputValue('cod').trim();
        if (codigosGerados[cod]) {
            const v = codigosGerados[cod];
            carteiras[i.user.id] = (carteiras[i.user.id] || 0) + v;
            delete codigosGerados[cod];
            await i.reply({ content: `✅ Resgatado: R$ ${v.toFixed(2)}. Saldo: R$ ${carteiras[i.user.id].toFixed(2)}`, ephemeral: true });
        } else {
            await i.reply({ content: "❌ Código inválido.", ephemeral: true });
        }
    }

    if (i.customId === 'btn_loja_resgatar_pass') {
        const saldo = carteiras[i.user.id] || 0;
        if (saldo < configBot.valorPass) return i.reply({ content: `❌ Saldo insuficiente (R$ ${saldo.toFixed(2)}).`, ephemeral: true });

        const ticket = await i.guild.channels.create({
            name: `🎫-resgate-${i.user.username}`,
            type: ChannelType.GuildText,
            parent: configBot.categoriaTickets,
            permissionOverwrites: [{ id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }]
        });
        await i.reply({ content: `✅ Ticket: ${ticket}`, ephemeral: true });
        await ticket.send(`Olá <@${i.user.id}>! Digite o **UID** do jogador para o resgate:`);

        const col = ticket.createMessageCollector({ filter: m => m.author.id === i.user.id, max: 1 });
        col.on('collect', async (m) => {
            const uid = m.content.trim();
            try {
                const p = await axios.get(`https://lhubapi.shardweb.app/player?uid=${uid}`);
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`conf_${uid}`).setLabel('Confirmar Envio').setStyle(ButtonStyle.Success));
                await ticket.send({ content: `👤 Nick: **${p.data.nickname}**\nConfirma o envio do passe?`, components: [row] });
            } catch { ticket.send("❌ UID não encontrado."); }
        });
    }

    if (i.customId.startsWith('conf_')) {
        const uid = i.customId.split('_')[1];
        await i.update({ content: "⏳ Enviando...", components: [] });
        try {
            await axios.post(`https://lhubff.com.br/api/v1/passe`, { uid }, { headers: { 'Authorization': `Bearer ${process.env.LHUB_API_KEY}` } });
            carteiras[i.user.id] -= configBot.valorPass;
            await i.followUp("✅ **Enviado!** Mande um **PRINT** para finalizar.");
            
            const filter = m => m.author.id === i.user.id && m.attachments.size > 0;
            const collector = i.channel.createMessageCollector({ filter, max: 1, time: 600000 });
            collector.on('collect', async (msgImg) => {
                const logChan = client.channels.cache.get(configBot.canalFeedback);
                if (logChan) logChan.send({ content: `🌟 Feedback de <@${i.user.id}> (UID: ${uid})`, files: [msgImg.attachments.first().url] });
                await msgImg.reply("🙏 Feedback recebido! Use `!limpar`.");
            });
        } catch { await i.followUp("❌ Erro LHub."); }
    }
});

client.login(process.env.DISCORD_TOKEN);
