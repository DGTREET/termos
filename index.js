const { Client, GatewayIntentBits, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const express = require('express');
require('dotenv').config();

// ==========================================
// 🚀 INICIALIZAÇÃO E CONFIGURAÇÕES CORE
// ==========================================
const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN || '' });
const payment = new Payment(mpClient);

const app = express();
app.use(express.json());

// ==========================================
// 🗄️ BANCO DE DADOS (MEMÓRIA) E VARIÁVEIS
// ==========================================
let carteiras = {}; 
let saldoAdmin = {}; 
let configBot = {
    canalLogs: process.env.LOG_STAFF_CHANNEL || "ID_DO_CANAL_AQUI",
    categoriaTickets: process.env.CATEGORY_TICKET || "ID_DA_CATEGORIA_AQUI",
    webhookUrl: process.env.WEBHOOK_URL || "https://seu-app.onrender.com/webhook" // Coloque o link do seu Render aqui
};

const vitrinePaginas = [
    { titulo: "🔥 BOOYAH PASS", desc: "O melhor custo benefício!\nPreço: **R$ 7,99**", img: "https://cdn.discordapp.com/attachments/1474175360793837761/1475918101026705520/IMG-20260214-WA0002.jpg?ex=699f3b58&is=699de9d8&hm=432090a0a56289f84be899381b2b35cc0bcabc68e044b516850ed4a6d2146f35&", cor: "#ffaa00" },
    { titulo: "✨️ GT GIFT ", desc: "Recarregue seu saldo no servidor para resgatar seu .\nBooyah Pass: **R$ 9,99**", img: "https://cdn.discordapp.com/attachments/1474175360793837761/1475920275483922593/Image.png.webp?ex=699f3d5e&is=699debde&hm=1333a0d441a62a7dc073b8faeaf284960be3243af0d861576d97cec6735f5be4&", cor: "#00ccff" }
];
// ==========================================
// 📡 API EXPRESS: WEBHOOK MERCADO PAGO
// ==========================================
app.post('/webhook', async (req, res) => {
    res.sendStatus(200); // Responde imediatamente ao MP para evitar timeout
    const { action, data } = req.body;
    
    if (action === "payment.updated" && data?.id) {
        try {
            const pagamento = await payment.get({ id: data.id });
            if (pagamento.status === 'approved') {
                const valor = pagamento.transaction_amount;
                const userId = pagamento.external_reference;

                if (!carteiras[userId]) carteiras[userId] = 0;
                carteiras[userId] += valor;

                const logChannel = client.channels.cache.get(configBot.canalLogs);
                if (logChannel) {
                    const embedLog = new EmbedBuilder()
                        .setTitle("✅ PAGAMENTO APROVADO")
                        .setDescription(`O sistema confirmou um pagamento via PIX.`)
                        .addFields(
                            { name: "👤 Cliente", value: `<@${userId}>`, inline: true },
                            { name: "💰 Valor", value: `R$ ${valor.toFixed(2)}`, inline: true }
                        )
                        .setColor("Green")
                        .setTimestamp();
                    logChannel.send({ embeds: [embedLog] });
                }
            }
        } catch (e) { 
            console.error("❌ Erro ao processar Webhook:", e.message); 
        }
    }
});
app.listen(process.env.PORT || 10000, () => console.log("🌐 Sistema de Webhook Online!"));

// ==========================================
// 💬 EVENTO: LEITURA DE MENSAGENS E COMANDOS
// ==========================================
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    const limpar = () => msg.delete().catch(() => {});

    // 📌 COMANDO: !HELP
    if (msg.content === '!help') {
        limpar();
        const embed = new EmbedBuilder()
            .setTitle("🤖 Sistema Guardian - Central de Comandos")
            .setDescription("Navegue pelos módulos de automação disponíveis:")
            .addFields(
                { name: "🛒 Módulo Cliente", value: "`!carteira` - Gestão financeira e estornos\n`!loja` - Catálogo de produtos\n`!perfil [UID]` - Consulta de conta FF", inline: false },
                { name: "⚙️ Módulo Administrativo", value: "`!admin` - Painel de controle\n`!setgt` - Terminal de PIX\n`!setpass` - Terminal do Passe\n`!setsuporte` - Terminal de Tickets", inline: false }
            )
            .setColor("#2b2d31")
            .setThumbnail(client.user.displayAvatarURL());
        return msg.channel.send({ embeds: [embed] });
    }

    // 📌 COMANDO: !CARTEIRA
    if (msg.content === '!carteira') {
        limpar();
        const saldo = (carteiras[msg.author.id] || 0).toFixed(2);
        const embed = new EmbedBuilder()
            .setTitle("💳 Terminal Financeiro")
            .setDescription(`Olá, <@${msg.author.id}>. Este é o seu saldo atual e verificado no sistema:\n\n# R$ ${saldo}`)
            .setColor("#f1c40f")
            .setFooter({ text: "Transações seguras via Mercado Pago" });
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_reembolso').setLabel('Solicitar Reembolso').setStyle(ButtonStyle.Danger).setEmoji('💸')
        );
        return msg.channel.send({ embeds: [embed], components: [row] });
    }

    // 📌 COMANDO: !LOJA
    if (msg.content === '!loja') {
        limpar();
        const genEmbed = (idx) => new EmbedBuilder()
            .setTitle(vitrinePaginas[idx].titulo)
            .setDescription(vitrinePaginas[idx].desc)
            .setImage(vitrinePaginas[idx].img)
            .setColor(vitrinePaginas[idx].cor)
            .setFooter({ text: `Catálogo Guardian • Página ${idx + 1} de ${vitrinePaginas.length}` });
            
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('loja_prev').setEmoji('⏪').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('loja_next').setEmoji('⏩').setStyle(ButtonStyle.Secondary)
        );
        return msg.channel.send({ embeds: [genEmbed(0)], components: [row] });
    }

    // 📌 COMANDO: !PERFIL
    if (msg.content.startsWith('!perfil')) {
        limpar();
        const uid = msg.content.split(' ')[1];
        if (!uid) return msg.channel.send("⚠️ **Sintaxe incorreta.** Use: `!perfil [UID]`");
        
        const aguardeMsg = await msg.channel.send("⏳ Conectando aos servidores da Garena...");
        try {
            const resApi = await axios.get(`https://lhubapi.shardweb.app/player?uid=${uid}`);
            const data = resApi.data.basicInfo;
            const embed = new EmbedBuilder()
                .setTitle("🎮 Dados da Conta Free Fire")
                .addFields(
                    { name: "👤 Nickname", value: `\`${data.nickname || 'NÃO ENCONTRADO'}\``, inline: true },
                    { name: "🆔 UID", value: `\`${uid}\``, inline: true },
                    { name: "🆙 Nível", value: `\`${data.level || '---'}\``, inline: true }
                )
                .setColor("#9b59b6")
                .setTimestamp();
            await aguardeMsg.edit({ content: null, embeds: [embed] });
        } catch { 
            await aguardeMsg.edit("❌ **Falha na conexão.** Não foi possível localizar este UID."); 
        }
    }

    // 📌 COMANDOS: SETUP STAFF
    if (msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
        if (msg.content === '!setgt') {
            limpar();
            const embed = new EmbedBuilder().setTitle("⚡ Adicionar Saldo").setDescription("Clique no botão abaixo para gerar um PIX automático e recarregar sua carteira. O saldo cai na hora!").setColor("#2b2d31");
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_buy').setLabel('Gerar PIX').setStyle(ButtonStyle.Primary).setEmoji('💠'));
            return msg.channel.send({ embeds: [embed], components: [row] });
        }
        if (msg.content === '!setpass') {
            limpar();
            const embed = new EmbedBuilder().setTitle("🎟️ Resgate de Booyah Pass").setDescription("Use seu saldo para resgatar o passe da temporada de forma automatizada.\n\n**Valor:** `R$ 10,00`").setColor("#2b2d31");
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_resgatar_pass').setLabel('Resgatar Agora').setStyle(ButtonStyle.Success).setEmoji('🔥'));
            return msg.channel.send({ embeds: [embed], components: [row] });
        }
        if (msg.content === '!setsuporte') {
            limpar();
            const embed = new EmbedBuilder().setTitle("🎧 Central de Atendimento").setDescription("Precisa de ajuda com uma compra, bug ou tem alguma dúvida? Abra um ticket.").setColor("#2b2d31");
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('abrir_ticket').setLabel('Solicitar Suporte').setStyle(ButtonStyle.Primary).setEmoji('📩'));
            return msg.channel.send({ embeds: [embed], components: [row] });
        }
        if (msg.content === '!admin') {
            limpar();
            const embed = new EmbedBuilder().setTitle("⚙️ Console Administrativo").setDescription("Gerenciamento do Bot Guardian.").setColor("#2b2d31");
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('adm_add').setLabel('Adicionar Saldo').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('adm_rem').setLabel('Remover Saldo').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('adm_config').setLabel('Ajustes do Bot').setStyle(ButtonStyle.Secondary)
            );
            return msg.channel.send({ embeds: [embed], components: [row] });
        }
    }
});

// ==========================================
// 🕹️ EVENTO: TRATAMENTO DE INTERAÇÕES (BOTÕES/MODAIS)
// ==========================================
client.on('interactionCreate', async (i) => {
    
    // --- 💠 GERAÇÃO DE PIX ---
    if (i.customId === 'btn_buy') {
        await i.deferReply({ ephemeral: true });
        try {
            const res = await payment.create({
                body: { 
                    transaction_amount: 10.00, 
                    description: `Guardian Saldo - ${i.user.username}`, 
                    payment_method_id: 'pix', 
                    payer: { email: 'contato@guardian.com' }, 
                    external_reference: i.user.id, 
                    notification_url: configBot.webhookUrl 
                }
            });
            const embed = new EmbedBuilder()
                .setTitle("💠 Fatura Gerada com Sucesso")
                .setDescription("Copie o código **Pix Copia e Cola** abaixo. O saldo será entregue automaticamente em até 10 segundos após o pagamento.")
                .addFields({ name: "Pix Copia e Cola:", value: `\`${res.point_of_interaction.transaction_data.qr_code}\`` })
                .setColor("Green");
                
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Pagar no Site Geração').setURL(res.point_of_interaction.transaction_data.ticket_url).setStyle(ButtonStyle.Link));
            return i.editReply({ embeds: [embed], components: [row] });
        } catch (e) { 
            return i.editReply("❌ **Erro no Gateway de Pagamento.** Tente novamente mais tarde."); 
        }
    }

    // --- 🔥 RESGATE DE PASSE ---
    if (i.customId === 'btn_resgatar_pass') {
        const saldoAtual = carteiras[i.user.id] || 0;
        if (saldoAtual < 10.00) {
            return i.reply({ content: `❌ **Operação Recusada.** Seu saldo é de \`R$ ${saldoAtual.toFixed(2)}\`. Você precisa de pelo menos \`R$ 10,00\`.`, ephemeral: true });
        }

        carteiras[i.user.id] -= 10.00;
        
        const logChannel = client.channels.cache.get(configBot.canalLogs);
        if (logChannel) {
            const embedLog = new EmbedBuilder()
                .setTitle("🎫 ALERTA DE RESGATE - BOOYAH PASS")
                .addFields(
                    { name: "👤 Cliente", value: `<@${i.user.id}>` },
                    { name: "💰 Restante na Carteira", value: `R$ ${carteiras[i.user.id].toFixed(2)}` }
                ).setColor("#ffaa00").setFooter({ text: "Staff, proceda com o envio via ID." });
            logChannel.send({ content: "||@here||", embeds: [embedLog] });
        }
        return i.reply({ content: "✅ **Transação Aprovada!** Foram descontados R$ 10,00 da sua carteira. A nossa equipe já foi notificada para providenciar seu passe. Fique atento às suas DMs ou abra um ticket se necessário.", ephemeral: true });
    }

    // --- 💸 REEMBOLSO ---
    if (i.customId === 'btn_reembolso') {
        const reembolsavel = (carteiras[i.user.id] || 0) - (saldoAdmin[i.user.id] || 0);
        if (reembolsavel <= 0) return i.reply({ content: "❌ **Acesso Negado.** Você não possui saldo passível de estorno (Saldos concedidos pela Staff não são reembolsáveis).", ephemeral: true });
        
        carteiras[i.user.id] -= reembolsavel;
        const logChannel = client.channels.cache.get(configBot.canalLogs);
        if (logChannel) logChannel.send(`💸 **SOLICITAÇÃO DE ESTORNO**\n👤 Cliente: <@${i.user.id}>\n💰 Valor a devolver: **R$ ${reembolsavel.toFixed(2)}**`);
        
        return i.reply({ content: `✅ **Estorno de R$ ${reembolsavel.toFixed(2)} solicitado.** A Staff analisará sua transação no Mercado Pago.`, ephemeral: true });
    }

    // --- 🛒 PAGINAÇÃO DA LOJA ---
    if (i.customId === 'loja_next' || i.customId === 'loja_prev') {
        let idx = parseInt(i.message.embeds[0].footer.text.split(' ')[3]) - 1;
        idx = i.customId === 'loja_next' ? (idx + 1) % vitrinePaginas.length : (idx - 1 + vitrinePaginas.length) % vitrinePaginas.length;
        
        const newEmbed = EmbedBuilder.from(i.message.embeds[0])
            .setTitle(vitrinePaginas[idx].titulo).setDescription(vitrinePaginas[idx].desc).setImage(vitrinePaginas[idx].img).setColor(vitrinePaginas[idx].cor)
            .setFooter({ text: `Catálogo Guardian • Página ${idx + 1} de ${vitrinePaginas.length}` });
        return i.update({ embeds: [newEmbed] });
    }

    // --- 📩 SISTEMA DE TICKETS ---
    if (i.customId === 'abrir_ticket') {
        await i.deferReply({ ephemeral: true });
        try {
            const canalExistente = i.guild.channels.cache.find(c => c.name === `ticket-${i.user.username.toLowerCase()}`);
            if (canalExistente) return i.editReply({ content: `⚠️ Você já tem um atendimento em andamento: ${canalExistente}` });

            const parentId = configBot.categoriaTickets !== "ID_DA_CATEGORIA_AQUI" ? configBot.categoriaTickets : null;
            const c = await i.guild.channels.create({
                name: `ticket-${i.user.username}`, 
                type: ChannelType.GuildText,
                parent: parentId,
                permissionOverwrites: [
                    { id: i.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }
                ]
            });

            const embedTicket = new EmbedBuilder().setTitle("Atendimento Iniciado").setDescription(`Olá, ${i.user}! Descreva detalhadamente sua solicitação para agilizar o suporte.`).setColor("#2b2d31");
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('fechar_ticket').setLabel('Encerrar Atendimento').setStyle(ButtonStyle.Danger).setEmoji('🔒'));
            
            await c.send({ content: `${i.user}`, embeds: [embedTicket], components: [row] });
            return i.editReply({ content: `✅ **Ticket de Suporte criado:** ${c}` });
        } catch (err) {
            console.error(err);
            return i.editReply({ content: "❌ **Erro interno.** O bot não tem permissões para criar canais ou a ID da categoria está incorreta." });
        }
    }

    if (i.customId === 'fechar_ticket') {
        await i.reply("🔒 Gerando transcrição e encerrando protocolo...");
        try {
            const msgs = await i.channel.messages.fetch();
            let logHtml = `<html><body style="background:#1e1e24;color:#fff;font-family:sans-serif;padding:20px;"><h2>Protocolo: ${i.channel.name}</h2><hr/>`;
            msgs.reverse().forEach(m => logHtml += `<p><b style="color:#00ccff;">${m.author.tag}:</b> ${m.content}</p>`);
            logHtml += `</body></html>`;

            const logCh = client.channels.cache.get(configBot.canalLogs);
            if (logCh) await logCh.send({ files: [new AttachmentBuilder(Buffer.from(logHtml), { name: `transcript-${i.channel.name}.html` })] });
            
            setTimeout(() => i.channel.delete().catch(()=>{}), 4000);
        } catch(e) { console.error(e); }
    }

    // --- ⚙️ MODAIS ADMINISTRATIVOS ---
    if (i.customId === 'adm_add' || i.customId === 'adm_rem' || i.customId === 'adm_config') {
        const modal = new ModalBuilder().setCustomId('mod_' + i.customId).setTitle('Console Administrativo');
        const in1 = new TextInputBuilder().setCustomId('in1').setLabel('ID (Usuário ou Canal de Log)').setStyle(TextInputStyle.Short);
        const in2 = new TextInputBuilder().setCustomId('in2').setLabel('Valor ou ID Categoria Tickets').setStyle(TextInputStyle.Short);
        modal.addComponents(new ActionRowBuilder().addComponents(in1), new ActionRowBuilder().addComponents(in2));
        return i.showModal(modal);
    }

    if (i.isModalSubmit()) {
        const v1 = i.fields.getTextInputValue('in1').trim();
        const v2 = i.fields.getTextInputValue('in2').replace(',', '.').trim();
        
        if (i.customId === 'mod_adm_add') { 
            carteiras[v1] = (carteiras[v1] || 0) + parseFloat(v2); 
            saldoAdmin[v1] = (saldoAdmin[v1] || 0) + parseFloat(v2); // Impede reembolso desse valor
        }
        if (i.customId === 'mod_adm_rem') { 
            carteiras[v1] = Math.max(0, (carteiras[v1] || 0) - parseFloat(v2)); 
        }
        if (i.customId === 'mod_adm_config') { 
            configBot.canalLogs = v1; 
            configBot.categoriaTickets = v2; 
        }
        return i.reply({ content: "✅ **Configuração executada com sucesso no sistema!**", ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);
