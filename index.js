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
    leader: '1474847275715920074',
    colonel: '1474138109376598097', 
    officer: '1474139720047919125',
    staff: '1474130768627503309',
    emission: '1477776468225425518' // Роль уведомлений о выбросах
};

const ADM_ROLES = [ROLES.leader, ROLES.colonel, ROLES.officer];
const STAFF_CHANNEL_ID = '1474147428239278221';
const EMISSION_CHANNEL_ID = '1477968178234785846'; // Канал для сообщения о выбросах

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
            createEmbed(ROLES.leader, 'Лидер'),
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

    // Команда для создания сообщения о выбросах
    if (message.content === '!setup_emission') {
        if (!message.member.roles.cache.has(ROLES.botManager)) return;

        const targetChannel = message.guild.channels.cache.get(EMISSION_CHANNEL_ID);
        if (!targetChannel) return message.reply("Канал для выбросов не найден!");

        const embed = new EmbedBuilder()
            .setColor('#f1c40f')
            .setTitle('☢️ Уведомления о выбросах')
            .setDescription('Для того чтобы получать уведомления о выбросах, нажмите кнопку ниже и получите для этого специальную роль.');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('toggle_emission_role')
                .setLabel('Получать уведомления о выбросах')
                .setStyle(ButtonStyle.Success)
        );

        await targetChannel.send({ embeds: [embed], components: [row] });
        await message.delete().catch(() => {});
        return;
    }

    // Стандартные команды
    if (message.content === '!guide') {
        const guideEmbed = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle('📖 ПОЛНОЕ РУКОВОДСТВО ПО RECRUITMENT-BOT')
            .addFields(
                { name: '🟢 ДЛЯ КАНДИДАТОВ', value: 'Нажмите кнопку **"Подать заявку"** в канале набора.' },
                { name: '🔴 УПРАВЛЕНИЕ', value: 'Кнопки **Обзвон/Принять/Отклонить** под анкетами.' },
                { name: '🟦 КОМАНДЫ', value: '`!setup_emission` — создать пост с ролью выбросов.\n`!embed #канал` — конструктор сообщений.\n`!setup` — пост набора.' }
            );
        return message.channel.send({ embeds: [guideEmbed] });
    }

    if (['!setup', '!update_staff'].some(cmd => message.content.startsWith(cmd))) {
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

    if (message.content.startsWith('!embed')) {
        if (!ADM_ROLES.some(roleId => message.member.roles.cache.has(roleId)) && !message.member.roles.cache.has(ROLES.botManager)) return;
        const args = message.content.split(' ');
        const channelInput = args[1];
        if (!channelInput) return message.reply("Использование: `!embed #канал`").then(m => setTimeout(() => m.delete(), 5000));
        const channelId = channelInput.replace(/[<#>]/g, '');
        const targetChannel = message.guild.channels.cache.get(channelId);
        if (!targetChannel || !targetChannel.isTextBased()) return message.reply("❌ Канал не найден!").then(m => setTimeout(() => m.delete(), 5000));
        const embed = new EmbedBuilder().setColor('#2b2d31').setDescription(`Создание сообщения для ${targetChannel}`);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`create_embed_${targetChannel.id}`).setLabel('Настроить').setStyle(ButtonStyle.Success));
        await message.channel.send({ embeds: [embed], components: [row] });
        await message.delete().catch(() => {});
    }
});

client.on('interactionCreate', async (interaction) => {
    
    // ВЫДАЧА РОЛИ ВЫБРОСОВ (Toggle система)
    if (interaction.isButton() && interaction.customId === 'toggle_emission_role') {
        const role = interaction.guild.roles.cache.get(ROLES.emission);
        if (!role) return interaction.reply({ content: "Роль не найдена на сервере!", ephemeral: true });

        if (interaction.member.roles.cache.has(ROLES.emission)) {
            await interaction.member.roles.remove(role);
            return interaction.reply({ content: "✅ Вы больше не будете получать уведомления о выбросах.", ephemeral: true });
        } else {
            await interaction.member.roles.add(role);
            return interaction.reply({ content: "✅ Вам выдана роль! Теперь вы будете получать уведомления о выбросах.", ephemeral: true });
        }
    }

    // Подать заявку
    if (interaction.isButton() && interaction.customId === 'apply_button') {
        const modal = new ModalBuilder().setCustomId('apply_modal').setTitle('Заявление в клан');
        const fields = [
            { id: 'nickname', label: 'Ваш игровой никнейм?', style: TextInputStyle.Short },
            { id: 'bio', label: 'Ваша Био и Броня с заточкой:', style: TextInputStyle.Paragraph },
            { id: 'stats', label: 'Приведа в жире (без бустов):', style: TextInputStyle.Short },
            { id: 'weapon', label: 'Оружие и снайперка с заточкой:', style: TextInputStyle.Short },
            { id: 'online', label: 'Ваш онлайн на КВ (Пример: 3/3):', style: TextInputStyle.Short }
        ].map(f => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setStyle(f.style).setRequired(true)));
        modal.addComponents(...fields);
        return await interaction.showModal(modal);
    }

    // Модалка Embed
    if (interaction.isButton() && interaction.customId.startsWith('create_embed_')) {
        const channelId = interaction.customId.split('_')[2];
        const modal = new ModalBuilder().setCustomId(`embed_modal_${channelId}`).setTitle('Создание сообщения');
        const fields = [
            { id: 'title', label: 'Заголовок:', style: TextInputStyle.Short, req: true },
            { id: 'desc', label: 'Описание (текст):', style: TextInputStyle.Paragraph, req: true },
            { id: 'color', label: 'Цвет (HEX, например #ff0000):', style: TextInputStyle.Short, req: false },
            { id: 'image', label: 'Ссылка на картинку (URL):', style: TextInputStyle.Short, req: false }
        ].map(f => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setStyle(f.style).setRequired(f.req)));
        modal.addComponents(...fields);
        return await interaction.showModal(modal);
    }

    // Отправка заявки
    if (interaction.isModalSubmit() && interaction.customId === 'apply_modal') {
        await interaction.deferReply({ ephemeral: true });
        const embed = new EmbedBuilder().setColor('#2b2d31').setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() }).setTitle('— • Заявка на Condition')
            .setDescription(`🔹 **Пользователь:** <@${interaction.user.id}>\n🔹 **Игровой ник:** \`${interaction.fields.getTextInputValue('nickname')}\`\n🔹 **Время (МСК):** \`${getMSKTime()}\``)
            .addFields(
                { name: '┃ Игровой никнейм:', value: `\`\`\`${interaction.fields.getTextInputValue('nickname')}\`\`\`` },
                { name: '┃ Основная броня:', value: `\`\`\`${interaction.fields.getTextInputValue('bio')}\`\`\`` },
                { name: '┃ Приведа:', value: `\`\`\`${interaction.fields.getTextInputValue('stats')}\`\`\`` },
                { name: '┃ Оружие и снайперка:', value: `\`\`\`${interaction.fields.getTextInputValue('weapon')}\`\`\`` },
                { name: '┃ Онлайн на КВ:', value: `\`\`\`${interaction.fields.getTextInputValue('online')}\`\`\`` }
            );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`call_${interaction.user.id}`).setLabel('Обзвон').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`accept_${interaction.user.id}`).setLabel('Принять').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reject_${interaction.user.id}`).setLabel('Отклонить').setStyle(ButtonStyle.Danger)
        );
        const channel = interaction.guild.channels.cache.get(config.channels.activeApps);
        if (channel) await channel.send({ content: `<@&${ROLES.leader}> <@&${ROLES.colonel}> <@&${ROLES.officer}>`, embeds: [embed], components: [row] });
        return await interaction.editReply({ content: 'Заявка отправлена!' });
    }

    // Отправка Embed
    if (interaction.isModalSubmit() && interaction.customId.startsWith('embed_modal_')) {
        const channelId = interaction.customId.split('_')[2];
        const targetChannel = interaction.guild.channels.cache.get(channelId);
        const colorInput = interaction.fields.getTextInputValue('color');
        const userEmbed = new EmbedBuilder()
            .setTitle(interaction.fields.getTextInputValue('title')).setDescription(interaction.fields.getTextInputValue('desc'))
            .setColor(colorInput.startsWith('#') ? colorInput : '#2b2d31')
            .setFooter({ text: `Отправил: ${interaction.user.tag}` });
        const img = interaction.fields.getTextInputValue('image');
        if (img && img.startsWith('http')) userEmbed.setImage(img);
        if (targetChannel) await targetChannel.send({ embeds: [userEmbed] });
        await interaction.message.delete().catch(() => {});
        return await interaction.reply({ content: '✅ Отправлено!', ephemeral: true });
    }

    // Кнопки админки
    if (interaction.isButton() && (interaction.customId.startsWith('call_') || interaction.customId.startsWith('accept_') || interaction.customId.startsWith('reject_'))) {
        if (!ADM_ROLES.some(roleId => interaction.member.roles.cache.has(roleId))) return interaction.reply({ content: '❌ Доступ только руководству.', ephemeral: true });
        const [action, userId] = interaction.customId.split('_');
        const targetUser = await client.users.fetch(userId).catch(() => null);

        if (action === 'call') {
            await interaction.deferReply({ ephemeral: true });
            const callEmbed = new EmbedBuilder().setColor('#ffaa00').setTitle('🔊 Вызов на обзвон').setDescription(`Привет, <@${userId}>! Твоя заявка рассмотрена.\nЗайди в каналы:\n🎙️ <#${config.channels.interview1}>\n🎙️ <#${config.channels.interview2}>`);
            const callChan = interaction.guild.channels.cache.get(config.channels.call);
            if (callChan) await callChan.send({ content: `<@${userId}>`, embeds: [callEmbed] });
            if (targetUser) await targetUser.send({ embeds: [callEmbed] }).catch(() => {});
            return await interaction.editReply({ content: 'Кандидат вызван.' });
        }

        if (action === 'accept') {
            await interaction.deferReply({ ephemeral: true });
            const member = await interaction.guild.members.fetch(userId).catch(() => null);
            if (member) await member.roles.add(ROLES.staff).catch(() => {});
            if (targetUser) await targetUser.send({ embeds: [new EmbedBuilder().setColor('#43b581').setTitle('🎉 Вы приняты!').setDescription('Твоя заявка в клан одобрена!')] }).catch(() => {});
            const archChan = interaction.guild.channels.cache.get(config.channels.archive);
            if (archChan) await archChan.send({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor('#43b581').addFields({ name: '┃ Статус:', value: `✅ Принят в \`${getMSKTime()}\`` })] });
            await interaction.message.delete().catch(() => {});
            return await interaction.editReply({ content: 'Принят.' });
        }

        if (action === 'reject') {
            const modal = new ModalBuilder().setCustomId(`reject_modal_${userId}`).setTitle('Причина отказа');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Причина:').setStyle(TextInputStyle.Paragraph).setRequired(true)));
            return await interaction.showModal(modal);
        }
    }

    // Модалка отказа
    if (interaction.isModalSubmit() && interaction.customId.startsWith('reject_modal_')) {
        await interaction.deferReply({ ephemeral: true });
        const userId = interaction.customId.split('_')[2];
        const reason = interaction.fields.getTextInputValue('reason');
        const targetUser = await client.users.fetch(userId).catch(() => null);
        if (targetUser) await targetUser.send({ embeds: [new EmbedBuilder().setColor('#f04747').setTitle('📌 Ответ по заявке').setDescription(`К сожалению, отказ. Причина: ${reason}`)] }).catch(() => {});
        const channel = interaction.guild.channels.cache.get(config.channels.activeApps);
        const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
        const appMsg = messages?.find(m => m.embeds[0]?.description?.includes(userId));
        if (appMsg) {
            const archChan = interaction.guild.channels.cache.get(config.channels.archive);
            if (archChan) await archChan.send({ embeds: [EmbedBuilder.from(appMsg.embeds[0]).setColor('#f04747').addFields({ name: '┃ Отказ:', value: reason })] });
            await appMsg.delete().catch(() => {});
        }
        return await interaction.editReply({ content: `Отклонено.` });
    }
});

client.login(process.env.TOKEN || config.token);