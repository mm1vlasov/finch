const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, 
    TextInputStyle, time
} = require('discord.js');
const config = require('./config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers 
    ]
});

const ROLES = {
    botManager: '1474124857443876956', 
    colonel: '1474138109376598097',    
    officer: '1474139720047919125',    
    staff: '1474130768627503309' // Роль Condition
};

const STAFF_CHANNEL_ID = '1474147428239278221';

// Функция для получения времени по МСК
const getMSKTime = () => {
    return new Date().toLocaleString("ru-RU", {timeZone: "Europe/Moscow", hour: '2-digit', minute:'2-digit', day: '2-digit', month: '2-digit', year: 'numeric'});
};

client.once('ready', () => {
    console.log(`✅ Бот запущен: ${client.user.tag}`);
    setInterval(() => updateStaffList(), 300000);
});

async function updateStaffList() {
    try {
        const guild = client.guilds.cache.first();
        if (!guild) return;
        const staffChannel = guild.channels.cache.get(STAFF_CHANNEL_ID);
        if (!staffChannel) return;

        await guild.members.fetch();

        const createEmbed = (roleId, title) => {
            const role = guild.roles.cache.get(roleId);
            const content = (role && role.members.size > 0) 
                ? role.members.map(m => `• <@${m.id}> | ${m.displayName}`).join('\n')
                : '—';
            return new EmbedBuilder().setColor('#2b2d31').setTitle(title).setDescription(content);
        };

        const embeds = [
            createEmbed(ROLES.colonel, 'Полковник'),
            createEmbed(ROLES.officer, 'Офицер'),
            createEmbed(ROLES.staff, 'Staff')
        ];

        const messages = await staffChannel.messages.fetch({ limit: 10 }).catch(() => null);
        const botMsg = messages?.find(m => m.author.id === client.user.id);

        if (botMsg) await botMsg.edit({ embeds });
        else await staffChannel.send({ embeds });
    } catch (e) { console.error("Ошибка автообновления:", e); }
}

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    
    if (['!setup', '!guide', '!update_staff'].some(cmd => message.content.startsWith(cmd))) {
        if (!message.member.roles.cache.has(ROLES.botManager)) return;
    }

    if (message.content === '!update_staff') {
        await updateStaffList();
        await message.delete().catch(() => {});
    }

    if (message.content === '!setup') {
        const embed = new EmbedBuilder().setColor('#2b2d31').setTitle('🛡️ Набор в команду').setDescription('Нажми на кнопку ниже, чтобы подать заявку.');
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('apply_button').setLabel('Подать заявку').setStyle(ButtonStyle.Primary));
        await message.channel.send({ embeds: [embed], components: [row] });
        await message.delete().catch(() => {});
    }
});

client.on('interactionCreate', async (interaction) => {
    
    // 1. ОТКРЫТИЕ МОДАЛКИ
    if (interaction.isButton() && interaction.customId === 'apply_button') {
        const modal = new ModalBuilder().setCustomId('apply_modal').setTitle('Заявление в клан');
        const fields = [
            { id: 'nickname', label: 'Ваш игровой никнейм?', style: TextInputStyle.Short },
            { id: 'bio', label: 'Укажите свою Био и Боевую броню с заточкой:', style: TextInputStyle.Paragraph },
            { id: 'stats', label: 'Укажите приведу в жир сборке без бустов:', style: TextInputStyle.Short },
            { id: 'weapon', label: 'Какое оружие и снайперка с заточкой:', style: TextInputStyle.Short },
            { id: 'online', label: 'Укажите свой онлайн на КВ: (Пример: 3/3, 4/4)', style: TextInputStyle.Short }
        ].map(f => new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setStyle(f.style).setRequired(true)
        ));
        modal.addComponents(...fields);
        return await interaction.showModal(modal);
    }

    // 2. ОБРАБОТКА АНКЕТЫ
    if (interaction.isModalSubmit() && interaction.customId === 'apply_modal') {
        await interaction.deferReply({ ephemeral: true });

        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
            .setTitle('— • Заявка на Condition')
            .setDescription(
                `🔹 **Пользователь:** <@${interaction.user.id}>\n` +
                `🔹 **Игровой ник:** \`${interaction.fields.getTextInputValue('nickname')}\`\n` +
                `🔹 **ID:** \`${interaction.user.id}\`\n` +
                `🔹 **Присоединился:** ${time(interaction.member.joinedAt, 'D')}\n` +
                `🔹 **Время подачи (МСК):** \`${getMSKTime()}\``
            )
            .addFields(
                { name: '┃ Игровой никнейм:', value: `\`\`\`${interaction.fields.getTextInputValue('nickname')}\`\`\`` },
                { name: '┃ Основная броня:', value: `\`\`\`${interaction.fields.getTextInputValue('bio')}\`\`\`` },
                { name: '┃ Приведа:', value: `\`\`\`${interaction.fields.getTextInputValue('stats')}\`\`\`` },
                { name: '┃ Оружие и снайперка:', value: `\`\`\`${interaction.fields.getTextInputValue('weapon')}\`\`\`` },
                { name: '┃ Онлайн на КВ:', value: `\`\`\`${interaction.fields.getTextInputValue('online')}\`\`\`` }
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`call_${interaction.user.id}`).setLabel('Вызвать на обзвон').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`accept_${interaction.user.id}`).setLabel('Принять').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reject_${interaction.user.id}`).setLabel('Отклонить').setStyle(ButtonStyle.Danger)
        );

        const channel = interaction.guild.channels.cache.get(config.channels.activeApps);
        if (channel) await channel.send({ content: `<@&${ROLES.colonel}>`, embeds: [embed], components: [row] });
        return await interaction.editReply({ content: 'Ваша заявка успешно отправлена!' });
    }

    // 3. УПРАВЛЕНИЕ ЗАЯВКАМИ
    if (interaction.isButton() && (interaction.customId.startsWith('call_') || interaction.customId.startsWith('accept_') || interaction.customId.startsWith('reject_'))) {
        if (!interaction.member.roles.cache.has(ROLES.colonel)) return interaction.reply({ content: '❌ Доступ только для Полковников.', ephemeral: true });

        const [action, userId] = interaction.customId.split('_');
        const targetUser = await client.users.fetch(userId).catch(() => null);

        if (action === 'call') {
            await interaction.deferReply({ ephemeral: true });
            const callEmbed = new EmbedBuilder()
                .setColor('#ffaa00')
                .setTitle('🔊 Приглашение на обзвон')
                .setDescription(`Привет, <@${userId}>! Твоя заявка рассмотрена.\n\nМы приглашаем тебя на обзвон. Пожалуйста, зайди в любой из доступных каналов ниже, когда будешь готов:\n\n🎙️ <#${config.channels.interview1}> | Обзвон #1\n🎙️ <#${config.channels.interview2}> | Обзвон #2\n\n**Время вызова (МСК):** \`${getMSKTime()}\`\n\n**Ожидаем тебя!**`);

            const callChan = interaction.guild.channels.cache.get(config.channels.call);
            if (callChan) await callChan.send({ content: `<@${userId}>`, embeds: [callEmbed] });
            if (targetUser) await targetUser.send({ embeds: [callEmbed] }).catch(() => {});
            return await interaction.editReply({ content: 'Кандидат вызван.' });
        }

        if (action === 'accept') {
            await interaction.deferReply({ ephemeral: true });
            
            const member = await interaction.guild.members.fetch(userId).catch(() => null);
            if (member) {
                await member.roles.add(ROLES.staff).catch(err => console.error("Ошибка роли:", err));
            }

            if (targetUser) {
                const dm = new EmbedBuilder().setColor('#43b581').setTitle('🎉 Вы приняты!').setDescription(`Здравствуйте! Ваша заявка в **Condition** была одобрена! Вам выдана роль.`);
                await targetUser.send({ embeds: [dm] }).catch(() => {});
            }
            
            const archChan = interaction.guild.channels.cache.get(config.channels.archive);
            const archEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor('#43b581')
                .addFields({ name: '┃ Статус:', value: `✅ Принят в \`${getMSKTime()}\`` })
                .setFooter({ text: `Принял: ${interaction.user.tag}` });
            
            if (archChan) await archChan.send({ embeds: [archEmbed] });
            await interaction.message.delete().catch(() => {});
            return await interaction.editReply({ content: 'Принято.' });
        }

        if (action === 'reject') {
            const modal = new ModalBuilder().setCustomId(`reject_modal_${userId}`).setTitle('Отклонение заявки');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Укажите причину отказа:').setStyle(TextInputStyle.Paragraph).setRequired(true)));
            return await interaction.showModal(modal);
        }
    }

    // 4. ОБРАБОТКА МОДАЛКИ ОТКЛОНЕНИЯ
    if (interaction.isModalSubmit() && interaction.customId.startsWith('reject_modal_')) {
        await interaction.deferReply({ ephemeral: true });
        const userId = interaction.customId.split('_')[2];
        const reason = interaction.fields.getTextInputValue('reason');
        const targetUser = await client.users.fetch(userId).catch(() => null);

        if (targetUser) {
            const dm = new EmbedBuilder().setColor('#f04747').setTitle('📌 Ответ по заявке').setDescription(`Здравствуйте. К сожалению, ваша заявка была отклонена.\n\n**Причина:**\n> ${reason}\n\n**Время (МСК):** \`${getMSKTime()}\``);
            await targetUser.send({ embeds: [dm] }).catch(() => {});
        }

        const channel = interaction.guild.channels.cache.get(config.channels.activeApps);
        const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
        const appMsg = messages?.find(m => m.embeds[0]?.description?.includes(userId));

        if (appMsg) {
            const archEmbed = EmbedBuilder.from(appMsg.embeds[0])
                .setColor('#f04747')
                .addFields(
                    { name: '┃ Причина отклонения:', value: reason },
                    { name: '┃ Время отказа (МСК):', value: `\`${getMSKTime()}\`` }
                )
                .setFooter({ text: `Отклонил: ${interaction.user.tag}` });
            
            const archChan = interaction.guild.channels.cache.get(config.channels.archive);
            if (archChan) await archChan.send({ embeds: [archEmbed] });
            await appMsg.delete().catch(() => {});
        }
        return await interaction.editReply({ content: `Отклонено.` });
    }
});

client.login(process.env.TOKEN || config.token);