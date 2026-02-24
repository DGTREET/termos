const { Client, GatewayIntentBits, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
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

// CONFIGURAÇÃO DE VALORES (Prioriza o Painel do Render/Variáveis de Ambiente)
let valoresGT = {
    op1: parseFloat(process.env.VALOR_OP1) || 10,
    op2: parseFloat(process.env.VALOR_OP2) || 30,
    op3: parseFloat(process.env.VALOR_OP3) || 50
};

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
                    const codigo = `GT-${Math.random().toString(36).toUpperCase().substring(2, 12)}`;
                    const embed = new EmbedBuilder()
                        .setTitle("✅ Pagamento Aprovado!")
                        .setDescription(`Seu pagamento de **R$ ${valor.toFixed(2)}** foi confirmado.`)
                        .addFields({ name: "Código de Resgate:", value: `\`${codigo}\`` })
                        .setColor("#00FF00")
                        .setFooter({ text: "Obrigado pela compra!" });
                    await user.send({ embeds: [embed] }).catch(() => console.log("DM fechada do usuário."));
                }
            }
        } catch (e) { console.error("Erro Webhook:", e.message); }
    }
    res.sendStatus(200);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor Web ativo na porta ${PORT}`));

// --- COMANDOS DO BOT ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;

    // Comando de Ajuda (Público)
    if (msg.content === '!ajuda') {
        const embedAjuda = new EmbedBuilder()
            .setTitle("📖 Central de Ajuda - GT Pass")
            .setDescription("Veja como utilizar nossos serviços e comandos:")
            .addFields(
                { name: "🛒 Como Comprar", value: "Use o menu no canal de vendas para gerar um PIX. O código é enviado na sua DM após o pagamento." },
                { name: "🎫 Como Resgatar", value: "Com o código em mãos, abra um ticket no botão de resgate e siga as instruções." },
                { name: "🛠️ Comandos Admin", value: "`!setgt`, `!setvalor`, `!saldo`, `!limpar`, `!setresgate`" }
            )
            .setColor("Yellow");
        return msg.reply({ embeds: [embedAjuda] });
    }

    // Filtro de Administrador
    if (!msg.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

    // COMANDO: Editar Valor (1, 2 ou 3)
    if (msg.content.startsWith('!setvalor')) {
        const args = msg.content.split(' ');
        const opcao = args[1]; 
        const novoPreco = parseFloat(args[2]);

        if (!opcao || isNaN(novoPreco)) return msg.reply("❌ Erro! Use: `!setvalor [1/2/3] [preço]`\nExemplo: `!setvalor 1 12.50` ");

        if (opcao === '1') valoresGT.op1 = novoPreco;
        else if (opcao === '2') valoresGT.op2 = novoPreco;
        else if (opcao === '3') valoresGT.op3 = novoPreco;
        else return msg.reply("❌ Opção inválida! Escolha 1, 2 ou 3.");

        msg.reply(`✅ Sucesso! A **Opção ${opcao}** agora custa **R$ ${novoPreco.toFixed(2)}**.\nUse \`!setgt\` para atualizar o painel.`);
    }

    // COMANDO: Enviar Menu de Vendas
    if (msg.content === '!setgt') {
        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('venda_gt').setPlaceholder('Selecione o valor do GT Gift').addOptions([
                { label: `GT Gift - R$ ${valoresGT.op1.toFixed(2)}`, value: `${valoresGT.op1}`, description: 'Opção 01' },
                { label: `GT Gift - R$ ${valoresGT.op2.toFixed(2)}`, value: `${valoresGT.op2}`, description: 'Opção 02' },
                { label: `GT Gift - R$ ${valoresGT.op3.toFixed(2)}`, value: `${valoresGT.op3}`, description: 'Opção 03' }
            ])
        );
        msg.channel.send({ 
            content: "💳 **PAINEL DE VENDAS AUTOMÁTICO**\nEscolha o valor desejado para receber o seu código via PIX:", 
            components: [row] 
        });
    }

    // COMANDO: Enviar Botão de Resgate (Ticket)
    if (msg.content === '!setresgate') {
        const btn = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_resgate').setLabel('Resgatar Booyah Pass').setStyle(ButtonStyle.Success)
        );
        msg.channel.send({ content: "🎫 **RESGATE DO PASSE**\nClique no botão abaixo para iniciar o processo de resgate via UID:", components: [btn] });
    }

    // COMANDO: Ver Saldo LHub na hora
    if (msg.content === '!saldo') {
        try {
            const res = await axios.get(`https://lhubff.com.br/api/v1/balance`, { 
                headers: { 'Authorization': `Bearer ${process.env.LHUB_API_KEY}` } 
            });
            msg.reply(`💰 **Saldo LHub:** R$ ${res.data.balance}`);
        } catch (e) { msg.reply("❌ Erro ao conectar com a API da LHub."); }
    }

    // COMANDO: Limpar/Fechar Ticket
    if (msg.content === '!limpar') {
        if (msg.channel.name.startsWith('resgate-')) {
            msg.reply("🧹 **Ticket finalizado.** Apagando canal em 5 segundos...");
            setTimeout(() => msg.channel.delete(), 5000);
        } else {
            msg.reply("❌ Este comando só pode ser usado dentro de um canal de ticket.");
        }
    }
});

// --- PROCESSAMENTO DE INTERAÇÕES ---
client.on('interactionCreate', async (i) => {
    // 1. Seleção no Menu de Vendas (Gerar PIX)
    if (i.isStringSelectMenu() && i.customId === 'venda_gt') {
        const valor = parseFloat(i.values[0]);
        await i.reply({ content: "⏳ Gerando seu PIX, por favor aguarde...", ephemeral: true });
        try {
            const res = await payment.create({
                body: {
                    transaction_amount: valor,
                    description: `Compra GT Gift R$ ${valor.toFixed(2)}`,
                    payment_method_id: 'pix',
                    payer: { email: 'contato@vendas.com' },
                    external_reference: i.user.id
                }
            });
            const pix = res.point_of_interaction.transaction_data.qr_code;
            await i.editReply({ 
                content: `✅ **PIX GERADO (R$ ${valor.toFixed(2)})**\n\nUtilize o código Copia e Cola abaixo:\n\`${pix}\`\n\n⚠️ **Aviso:** O código de resgate será enviado automaticamente na sua **DM** assim que o pagamento for aprovado.`, 
                ephemeral: true 
            });
        } catch (e) { 
            console.error(e);
            await i.editReply("❌ Houve um erro ao gerar o pagamento. Tente novamente mais tarde."); 
        }
    }

    // 2. Clique no Botão de Resgate (Abrir Ticket)
    if (i.isButton() && i.customId === 'btn_resgate') {
        const ticket = await i.guild.channels.create({
            name: `resgate-${i.user.username}`,
            type: ChannelType.GuildText,
            parent: process.env.CATEGORY_TICKETS, // ID da categoria no .env
            permissionOverwrites: [
                { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
            ]
        });
        await i.reply({ content: `✅ Ticket de resgate aberto em ${ticket}`, ephemeral: true });
        await ticket.send(`Olá <@${i.user.id}>! Por favor, digite apenas o **UID** do jogador que receberá o passe:`);
        
        // Coletor para o UID
        const col = ticket.createMessageCollector({ filter: m => m.author.id === i.user.id, max: 1 });
        col.on('collect', async (m) => {
            const uid = m.content;
            try {
                const p = await axios.post(`https://lhubapi.shardweb.app/player?uid=${uid}`);
                const confirm = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`conf_${uid}`).setLabel('Confirmar Nick e Enviar').setStyle(ButtonStyle.Primary)
                );
                await ticket.send({ 
                    content: `🔍 **Dados Encontrados:**\n👤 Nick: **${p.data.nickname}**\n🆔 UID: **${uid}**\n\nConfirma o envio para esta conta?`, 
                    components: [confirm] 
                });
            } catch { 
                ticket.send("❌ UID não encontrado ou sistema da API offline. Verifique o número e tente novamente."); 
            }
        });
    }

    // 3. Confirmar Nick e Finalizar no Site LHub
    if (i.isButton() && i.customId.startsWith('conf_')) {
        const uid = i.customId.split('_')[1];
        await i.update({ content: "⏳ Processando envio no site lhubff.com.br...", components: [] });
        try {
            await axios.post(`https://lhubff.com.br/api/v1/passe`, { uid }, { 
                headers: { 'Authorization': `Bearer ${process.env.LHUB_API_KEY}` } 
            });
            await i.followUp({ content: "✅ **SUCESSO!** O Booyah Pass foi enviado para a conta. Digite `!limpar` para fechar este ticket." });
        } catch { 
            await i.followUp("❌ Erro ao finalizar a compra. Verifique se você tem saldo suficiente na LHub."); 
        }
    }
});

client.login(process.env.DISCORD_TOKEN);

