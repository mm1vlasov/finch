const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, 
    TextInputStyle, time, Partials
} = require('discord.js');
const cron = require('node-cron');
const config = require('./config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers 
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// --- КОНФИГУРАЦИЯ ID ---
const ROLES = {
    botManager: '1474124857443876956', 
    leader: '1474847275715920074', 
    colonel: '1474138109376598097', 
    officer: '1474139720047919125', 
    staff: '1474130768627503309',
    emission: '1477776468225425518' // Роль для уведомлений о выбросах
};

const CHANNELS = {
    staffList: '1474147428239278221',
    kvNotice: '1474137748628836444', 
    kvVoice: '1474135459633430600',
    activeApps: config.channels.activeApps, 
    archive: config.channels.archive,
    call: '1474124765299081288', // Канал для публичного вызова на обзвон
    emissionSetup: '1477968178234785846' // Канал для настройки роли выбросов
};

const ADM_ROLES = [ROLES.leader, ROLES.colonel, ROLES.officer];
const COMMAND_ACCESS = [ROLES.leader, ROLES.colonel];

const getMSKTime = () => new Date().toLocaleString("ru-RU", {timeZone: "Europe/Moscow", hour: '2-digit', minute:'2-digit', day: '2-digit', month: '2-digit', year: 'numeric'});

// --- МОНИТОРИНГ СОСТАВА ---
async function updateStaffList() {
    try {
        const guild = client.guilds.cache.first();
        if (!guild) return;
        const staffChannel = guild.channels.cache.get(CHANNELS.staffList);
        if (!staffChannel) return;

        await guild.members.fetch();
        const createEmbed = (roleId, title) => {
            const role = guild.roles.cache.get(roleId);
            const content = (role && role.members.size > 0) 
                ? role.members.map(m => `• <@${m.id}> | ${m.displayName}`).join('\n') : '—';
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
    } catch (e) { console.error(e); }
}

// --- АВТОМАТИЗАЦИЯ КВ ---
async function sendKVNotice(manualGuild = null) {
    const guild = manualGuild || client.guilds.cache.first();
    if (!guild) return;
    const channel = guild.channels.cache.get(CHANNELS.kvNotice);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setColor('#cc0000')
        .setTitle('⚔️ ОБЩИЙ СБОР НА КЛАНОВЫЕ ВОЙНЫ')
        .setDescription(`Бойцы, пора в бой! Собираемся в голосовом канале.\n\n📍 **Место:** [ЗАЙТИ В ГОЛОСОВОЙ КАНАЛ](https://discord.com/channels/${guild.id}/${CHANNELS.kvVoice})`)
        .addFields({ name: '⏰ Время:', value: '`19:30 МСК`' })
        .setTimestamp();

    await channel.send({ content: `<@&${ROLES.staff}>`, embeds: [embed] });
}

client.once('ready', () => {
    console.log(`✅ Бот запущен: ${client.user.tag}`);
    cron.schedule('30 19 * * 4,5,6', () => sendKVNotice(), { scheduled: true, timezone: "Europe/Moscow" });
    setInterval(updateStaffList, 300000);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const commands = ['!guide', '!setup', '!update_staff', '!embed', '!собрание', '!сбор_кв', '!emission_setup'];
    if (commands.some(cmd => message.content.startsWith(cmd))) {
        if (!COMMAND_ACCESS.some(r => message.member.roles.cache.has(r))) return;
    }

    // Настройка канала выбросов
    if (message.content === '!emission_setup') {
        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('☢️ Уведомления о выбросах')
            .setDescription('Для того чтобы получать уведомления о выбросах, нажмите кнопку ниже и получите для этого специальную роль.');
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('get_emission_role')
                .setLabel('Получить уведомления о выбросах')
                .setStyle(ButtonStyle.Secondary)
        );

        await message.channel.send({ embeds: [embed], components: [row] });
        await message.delete().catch(() => {});
    }

    if (message.content === '!guide') {
        const guide = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('📖 ПОЛНОЕ РУКОВОДСТВО ПО БОТУ')
            .setDescription('Этот бот автоматизирует прием в клан и помогает создавать объявления.')
            .addFields(
                { name: '🟢 ДЛЯ КАНДИДАТОВ', value: 'Нажмите синюю кнопку **"Подать заявку"** в канале набора и заполните анкету. Бот сам напишет вам в ЛС, если заявку рассмотрят.' },
                { name: '🔴 УПРАВЛЕНИЕ ЗАЯВКАМИ', value: '• **Обзвон**: вызов в ЛС и канал <#1474124765299081288>.\n• **Принять**: выдача роли и архив.\n• **Отклонить**: указание причины.' },
                { name: '🟦 КОМАНДЫ', value: '`!setup` — кнопка набора\n`!сбор_кв` — анонс КВ\n`!собрание #канал` — создать опрос\n`!emission_setup` — создать пост с ролью выбросов' }
            );
        return message.channel.send({ embeds: [guide] });
    }

    if (message.content === '!setup') {
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('apply_button').setLabel('Подать заявку').setStyle(ButtonStyle.Primary));
        await message.channel.send({ embeds: [new EmbedBuilder().setTitle('🛡️ Набор в команду').setDescription('Нажми на кнопку ниже, чтобы подать заявку.').setColor('#2b2d31')], components: [row] });
        await message.delete().catch(() => {});
    }

    if (message.content === '!update_staff') {
        await updateStaffList();
        await message.delete().catch(() => {});
    }

    if (message.content === '!сбор_кв') {
        await sendKVNotice(message.guild);
        await message.delete().catch(() => {});
    }

    if (message.content.startsWith('!собрание')) {
        const channelId = message.content.split(' ')[1]?.replace(/[<#>]/g, '');
        const target = message.guild.channels.cache.get(channelId);
        if (!target) return message.reply("Укажите канал!");
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`setup_meeting_${target.id}`).setLabel('Настроить').setStyle(ButtonStyle.Primary));
        await message.channel.send({ embeds: [new EmbedBuilder().setDescription(`Настройка для ${target}`)], components: [row] });
    }
});

client.on('interactionCreate', async (interaction) => {
    
    // --- ВЫДАЧА РОЛИ ВЫБРОСОВ ---
    if (interaction.isButton() && interaction.customId === 'get_emission_role') {
        const member = interaction.member;
        if (member.roles.cache.has(ROLES.emission)) {
            await member.roles.remove(ROLES.emission);
            return await interaction.reply({ content: 'Роль уведомлений о выбросах удалена.', ephemeral: true });
        } else {
            await member.roles.add(ROLES.emission);
            return await interaction.reply({ content: 'Роль уведомлений о выбросах выдана!', ephemeral: true });
        }
    }

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

    if (interaction.isModalSubmit() && interaction.customId === 'apply_modal') {
        await interaction.deferReply({ ephemeral: true });

        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
            .setTitle('— • Заявка в клан RENESSEANCE')
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

        const channel = interaction.guild.channels.cache.get(CHANNELS.activeApps);
        if (channel) await channel.send({ content: `<@&${ROLES.leader}> <@&${ROLES.colonel}> <@&${ROLES.officer}>`, embeds: [embed], components: [row] });
        return await interaction.editReply({ content: 'Ваша заявка успешно отправлена!' });
    }

    if (interaction.isButton() && (interaction.customId.startsWith('call_') || interaction.customId.startsWith('accept_') || interaction.customId.startsWith('reject_'))) {
        if (!ADM_ROLES.some(roleId => interaction.member.roles.cache.has(roleId))) {
            return interaction.reply({ content: '❌ Доступ только для Руководства.', ephemeral: true });
        }

        const [action, userId] = interaction.customId.split('_');
        const targetUser = await client.users.fetch(userId).catch(() => null);

        if (action === 'call') {
            await interaction.deferReply({ ephemeral: true });
            
            const callEmbed = new EmbedBuilder()
                .setColor('#f1c40f')
                .setAuthor({ name: 'RENESSEANCE', iconURL: interaction.guild.iconURL() })
                .setTitle('🔊 Приглашение на обзвон')
                .setDescription(`Привет, <@${userId}>! Твоя заявка рассмотрена.\n\nМы приглашаем тебя на обзвон. Пожалуйста, зайди в любой из доступных каналов ниже, когда будешь готов:\n\n🎙️ <#1474135459633430600> | Обзвон #1\n🎙️ <#1474135459633430600> | Обзвон #2\n\n**Время вызова (МСК):** \`${getMSKTime()}\`\n\n**Ожидаем тебя!**`)
                .setFooter({ text: 'Recruitment System' });

            // Отправка в специальный канал
            const callChan = interaction.guild.channels.cache.get(CHANNELS.call);
            if (callChan) await callChan.send({ content: `<@${userId}>`, embeds: [callEmbed] });

            // Отправка в ЛС
            if (targetUser) await targetUser.send({ embeds: [callEmbed] }).catch(() => console.log('ЛС пользователя закрыто'));

            return await interaction.editReply('Кандидат вызван.');
        }

        if (action === 'accept') {
            await interaction.deferReply({ ephemeral: true });
            const member = await interaction.guild.members.fetch(userId).catch(() => null);
            if (member) await member.roles.add(ROLES.staff);
            
            if (targetUser) {
                const acceptDM = new EmbedBuilder()
                    .setColor('#2ecc71')
                    .setTitle('🎉 Поздравляем!')
                    .setDescription(`Твоя заявка в клан **RENESSEANCE** была одобрена!\nТебе выдана роль <@&${ROLES.staff}>. Ознакомься с правилами и информационными каналами.`)
                    .setTimestamp();
                await targetUser.send({ embeds: [acceptDM] }).catch(() => {});
            }

            const archChan = interaction.guild.channels.cache.get(CHANNELS.archive);
            if (archChan) {
                const archEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor('#43b581')
                    .addFields({ name: '┃ Статус:', value: `✅ Принят в \`${getMSKTime()}\`` })
                    .setFooter({ text: `Принял: ${interaction.user.tag}` });
                await archChan.send({ embeds: [archEmbed] });
            }
            await interaction.message.delete().catch(() => {});
            return await interaction.editReply('Принято.');
        }

        if (action === 'reject') {
            const modal = new ModalBuilder().setCustomId(`reject_modal_${userId}`).setTitle('Причина отказа');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Причина отказа:').setStyle(TextInputStyle.Paragraph).setRequired(true)));
            return await interaction.showModal(modal);
        }
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('reject_modal_')) {
        await interaction.deferReply({ ephemeral: true });
        const userId = interaction.customId.split('_')[2];
        const reason = interaction.fields.getTextInputValue('reason');
        const targetUser = await client.users.fetch(userId).catch(() => null);

        if (targetUser) {
            const rejectDM = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('Ответ по заявке')
                .setDescription(`К сожалению, твоя заявка в клан **RENESSEANCE** была отклонена.\n\n**Причина:** \`${reason}\``)
                .setFooter({ text: 'Попробуйте подать заявку позже.' });
            await targetUser.send({ embeds: [rejectDM] }).catch(() => {});
        }
        
        const archChan = interaction.guild.channels.cache.get(CHANNELS.archive);
        if (archChan && interaction.message) {
            const archEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor('#f04747')
                .addFields({ name: '┃ Причина:', value: reason })
                .setFooter({ text: `Отклонил: ${interaction.user.tag}` });
            await archChan.send({ embeds: [archEmbed] });
        }
        if (interaction.message) await interaction.message.delete().catch(() => {});
        return await interaction.editReply('Отказано.');
    }

    // Логика собраний
    if (interaction.isButton() && (interaction.customId === 'meeting_yes' || interaction.customId === 'meeting_no')) {
        const embed = EmbedBuilder.from(interaction.message.embeds[0]);
        const fields = embed.data.fields;
        let yesList = fields[3].value === '—' ? [] : fields[3].value.split(', ');
        let noList = fields[4].value === '—' ? [] : fields[4].value.split(', ');
        const userMention = `<@${interaction.user.id}>`;
        yesList = yesList.filter(u => u !== userMention);
        noList = noList.filter(u => u !== userMention);
        if (interaction.customId === 'meeting_yes') yesList.push(userMention);
        else noList.push(userMention);
        fields[3].value = yesList.length > 0 ? yesList.join(', ') : '—';
        fields[4].value = noList.length > 0 ? noList.join(', ') : '—';
        await interaction.update({ embeds: [embed] });
    }

    if (interaction.isButton() && interaction.customId.startsWith('setup_meeting_')) {
        const channelId = interaction.customId.split('_')[2];
        const modal = new ModalBuilder().setCustomId(`meeting_modal_${channelId}`).setTitle('Детали собрания');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('d').setLabel("Дата").setStyle(TextInputStyle.Short)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t').setLabel("Время").setStyle(TextInputStyle.Short)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('top').setLabel("Тема").setStyle(TextInputStyle.Paragraph))
        );
        await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('meeting_modal_')) {
        const chanId = interaction.customId.split('_')[2];
        const chan = interaction.guild.channels.cache.get(chanId);
        const embed = new EmbedBuilder().setColor('#e74c3c').setTitle('📢 ВНИМАНИЕ: СОБРАНИЕ').addFields(
            { name: '📅 Дата:', value: interaction.fields.getTextInputValue('d'), inline: true },
            { name: '⏰ Время:', value: interaction.fields.getTextInputValue('t'), inline: true },
            { name: '📝 Тема:', value: interaction.fields.getTextInputValue('top') },
            { name: '✅ Будут:', value: '—' },
            { name: '❌ Не будут:', value: '—' }
        );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('meeting_yes').setLabel('Буду').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('meeting_no').setLabel('Не буду').setStyle(ButtonStyle.Danger)
        );
        
        // Тегается роль 1474130768627503309 вместо everyone
        await chan.send({ content: `<@&1474130768627503309>`, embeds: [embed], components: [row] });
        await interaction.reply({ content: 'Собрание создано!', ephemeral: true });
    }
});

client.login(process.env.TOKEN || config.token);