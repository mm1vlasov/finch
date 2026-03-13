const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, 
    TextInputStyle, time, Partials
} = require('discord.js');
const cron = require('node-cron');
const config = require('./config.json');
const fs = require('fs');

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
    emission: '1477776468225425518',
    fullAccess: '1474138927261814807' // Новая роль с полным доступом
};

const CHANNELS = {
    staffList: '1474147428239278221',
    kvNotice: '1474137748628836444', 
    kvVoice: '1474135459633430600',
    activeApps: config.channels.activeApps, 
    archive: config.channels.archive,
    call: '1474124765299081288',
    emissionSetup: '1477968178234785846'
};

const ADM_ROLES = [ROLES.leader, ROLES.colonel, ROLES.officer, ROLES.fullAccess];
const COMMAND_ACCESS = [ROLES.leader, ROLES.colonel, ROLES.fullAccess];

const getMSKTime = () => new Date().toLocaleString("ru-RU", {timeZone: "Europe/Moscow", hour: '2-digit', minute:'2-digit', day: '2-digit', month: '2-digit', year: 'numeric'});

// --- НАСТРОЙКИ СБОРА КВ ---

let kvJob = null;

let KV_SETTINGS = {
    days: [4,5,6],
    time: "19:30",
    voice: CHANNELS.kvVoice
};

if (fs.existsSync('./kv_settings.json')) {
    KV_SETTINGS = JSON.parse(fs.readFileSync('./kv_settings.json'));
}

function saveKVSettings(){
    fs.writeFileSync('./kv_settings.json', JSON.stringify(KV_SETTINGS,null,2));
}

function createKVCron(){

    if(kvJob) kvJob.stop();

    const [hour,minute] = KV_SETTINGS.time.split(':');

    const days = KV_SETTINGS.days.join(',');

    kvJob = cron.schedule(`${minute} ${hour} * * ${days}`, () => {
        sendKVNotice();
    },{
        scheduled:true,
        timezone:"Europe/Moscow"
    });

}

// --- МОНИТОРИНГ СОСТАВА (ИСПРАВЛЕНО) ---
async function updateStaffList() {
    try {
        const guild = client.guilds.cache.first();
        if (!guild) return;
        const staffChannel = guild.channels.cache.get(CHANNELS.staffList);
        if (!staffChannel) return;

        await guild.members.fetch();

        // Списки для распределения
        const list = {
            leader: [],
            colonel: [],
            officer: [],
            staff: []
        };

        // Проходим по всем участникам и определяем их в ОДНУ высшую категорию
        guild.members.cache.forEach(member => {
            if (member.user.bot) return;

            if (member.roles.cache.has(ROLES.leader)) {
                list.leader.push(`• <@${member.id}> | ${member.displayName}`);
            } else if (member.roles.cache.has(ROLES.colonel)) {
                list.colonel.push(`• <@${member.id}> | ${member.displayName}`);
            } else if (member.roles.cache.has(ROLES.officer)) {
                list.officer.push(`• <@${member.id}> | ${member.displayName}`);
            } else if (member.roles.cache.has(ROLES.staff)) {
                list.staff.push(`• <@${member.id}> | ${member.displayName}`);
            }
        });

        const createEmbed = (title, membersArray) => {
            const content = membersArray.length > 0 ? membersArray.join('\n') : '—';
            return new EmbedBuilder().setColor('#2b2d31').setTitle(title).setDescription(content);
        };

        const embeds = [
            createEmbed('Лидер', list.leader),
            createEmbed('Полковник', list.colonel),
            createEmbed('Офицер', list.officer),
            createEmbed('Участники клана', list.staff)
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

    const channel = guild.channels.cache.get('1474137748628836444');
    if (!channel) return console.log("❌ Канал КВ не найден");

    const embed = new EmbedBuilder()
        .setColor('#cc0000')
        .setTitle('⚔️ ОБЩИЙ СБОР НА КЛАНОВЫЕ ВОЙНЫ')
        .setDescription(
            `Бойцы, пора в бой! Собираемся в голосовом канале.\n\n` +
            `📍 **Место:** https://discord.com/channels/${guild.id}/${KV_SETTINGS.voice}`
        )
        .addFields({ name: '⏰ Время:', value: `\`${KV_SETTINGS.time} МСК\`` })
        .setTimestamp();

    await channel.send({
        content: `<@&${ROLES.staff}>`,
        embeds: [embed]
    });

}

client.once('ready', () => {
    console.log(`✅ Бот запущен: ${client.user.tag}`);

    createKVCron();
    updateStaffList();

    setInterval(updateStaffList, 300000);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const commands = ['!admin', '!guide', '!setup', '!update_staff', '!embed', '!собрание', '!сбор_кв', '!emission_setup'];
    if (commands.some(cmd => message.content.startsWith(cmd))) {
        if (!COMMAND_ACCESS.some(r => message.member.roles.cache.has(r))) return;
    }

    if (message.content === '!admin') {
        const adminEmbed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('🛡️ Панель управления')
            .setDescription('Выберите необходимое действие. Доступно только для Лидера и Полковника.');

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('adm_create_meeting').setLabel('Создать собрание').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('adm_kv_alert').setLabel('Сбор на КВ').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('adm_update_staff').setLabel('Обновить состав').setStyle(ButtonStyle.Secondary)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('adm_create_embed').setLabel('Создать Embed').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('adm_kv_setup').setLabel('Настроить КВ').setStyle(ButtonStyle.Secondary)
        );

        await message.channel.send({ embeds: [adminEmbed], components: [row1, row2] });
        await message.delete().catch(() => {});
    }

    if (message.content === '!emission_setup') {
        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('☢️ Уведомления о выбросах')
            .setDescription('Для того чтобы получать уведомления о выбросах, нажмите кнопку ниже и получите для этого специальную роль. Если вы уже имеете эту роль, то нажмите кнопку чтобы её отключить.');
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('get_emission_role')
                .setLabel('Включить или выключить уведомления о выбросах')
                .setStyle(ButtonStyle.Secondary)
        );

        await message.channel.send({ embeds: [embed], components: [row] });
        await message.delete().catch(() => {});
    }

    if (message.content === '!guide') {
        const guide = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('📖 ПОЛНОЕ РУКОВОДСТВО ПО ИСПОЛЬЗОВАНИЮ')
            .setDescription('Ниже приведена подробная инструкция по всем функциям бота. Команды работают только у **Лидеров** и **Полковников**.')
            .addFields(
                { 
                    name: '🛡️ СИСТЕМА НАБОРА (RECRUITMENT)', 
                    value: 
                    '**1. Создание кнопки:**\n' +
                    'Напишите `!setup` в канале, где люди должны подавать заявки. Бот создаст сообщение с синей кнопкой "Подать заявку".\n\n' +
                    '**2. Управление кандидатом (в канале заявок):**\n' +
                    'Когда придет заявка, под ней будет 3 кнопки:\n' +
                    '• `Вызвать на обзвон` — бот тегнет чела в канале вызова и напишет ему в ЛС.\n' +
                    '• `Принять` — бот выдаст роль Staff, поздравит в ЛС и перенесет заявку в архив.\n' +
                    '• `Отклонить` — откроется окно, введите причину. Бот напишет её челу в ЛС и удалит заявку в архив.'
                },
                { 
                    name: '📢 СОБРАНИЯ И ОПРОСЫ', 
                    value: 
                    '**Как создать опрос:**\n' +
                    'Введите `!собрание #канал`. Например: `!собрание #флудилка`.\n' +
                    '1. Появится сообщение с кнопкой "Настроить". Нажмите её.\n' +
                    '2. Введите дату, время и тему в появившемся окне.\n' +
                    '3. Бот отправит красивый анонс в указанный канал и тегнет роль Staff.\n' +
                    '4. Люди смогут нажимать "Буду" или "Не буду", а бот составит список.'
                },
                { 
                    name: '🖼️ СОЗДАНИЕ КРАСИВЫХ СООБЩЕНИЙ (EMBED)', 
                    value: 
                    '**Как пользоваться:**\n' +
                    'Напишите `!embed #канал`. Например: `!embed #новости`.\n' +
                    '1. Нажмите "Настроить Embed".\n' +
                    '2. Заполните поля (Заголовок, Текст, Цвет в HEX формате вроде #ff0000, ссылку на картинку).\n' +
                    '3. Бот отправит это сообщение от своего имени в тот канал.'
                },
                { 
                    name: '☢️ ВЫБРОСЫ И УВЕДОМЛЕНИЯ', 
                    value: 
                    '**Команда:** `!emission_setup`.\n' +
                    'Создает пост, где участники могут сами нажать на кнопку, чтобы получить или снять роль <@&1477776468225425518>.'
                },
                { 
                    name: '🛠️ ДОПОЛНИТЕЛЬНО', 
                    value: 
                    '• `!сбор_кв` — моментальный анонс сбора на КВ в 19:30 (обычно бот делает это сам по расписанию ЧТ-СБ).\n' +
                    '• `!update_staff` — принудительно обновить список состава в канале мониторинга.'
                },
                {
                    name: '🔑 ДОСТУПЫ',
                    value: 
                    '• **Команды (!):** Только Лидер и Полковник.\n' +
                    '• **Кнопки в заявках:** Лидер, Полковник, Офицер.'
                }
            )
            .setFooter({ text: 'Если бот не реагирует, проверьте, есть ли у вас нужная роль.' });
        
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

    if (message.content.startsWith('!embed')) {
        const channelId = message.content.split(' ')[1]?.replace(/[<#>]/g, '');
        const targetChannel = message.guild.channels.cache.get(channelId);

        if (!targetChannel) return message.reply("❌ Укажите корректный канал: `!embed #канал`").then(m => setTimeout(() => m.delete(), 5000));

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`setup_embed_${targetChannel.id}`).setLabel('Настроить Embed').setStyle(ButtonStyle.Primary)
        );

        await message.channel.send({ content: `Настройка сообщения для канала ${targetChannel}`, components: [row] });
        await message.delete().catch(() => {});
    }
});

client.on('interactionCreate', async (interaction) => {
    
    if (interaction.isButton() && interaction.customId.startsWith('adm_')) {
        if (!COMMAND_ACCESS.some(r => interaction.member.roles.cache.has(r))) {
            return interaction.reply({ content: '❌ Нет доступа.', ephemeral: true });
        }

        switch (interaction.customId) {
            case 'adm_kv_setup': {
                const modal = new ModalBuilder()
                    .setCustomId('kv_setup_modal')
                    .setTitle('Настройка сбора КВ');

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('days')
                            .setLabel('Дни недели (1-7)')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('time')
                            .setLabel('Время МСК')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('voice')
                            .setLabel('ID голосового канала')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    )
                );

                return interaction.showModal(modal);
            }
            case 'adm_update_staff':
                await updateStaffList();
                return interaction.reply({ content: '✅ Состав обновлен.', ephemeral: true });
            case 'adm_create_meeting': {
                const modal = new ModalBuilder()
                    .setCustomId('adm_modal_chan_meeting')
                    .setTitle('Выбор канала для собрания');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('chan_id')
                            .setLabel('Введите ID канала или упомяните его')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    )
                );
                return interaction.showModal(modal);
            }
            case 'adm_create_embed': {
                const modal = new ModalBuilder()
                    .setCustomId('adm_modal_chan_embed')
                    .setTitle('Выбор канала для Embed');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('chan_id')
                            .setLabel('Введите ID канала или упомяните его')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    )
                );
                return interaction.showModal(modal);
            }
            case 'adm_kv_alert': {
                await interaction.deferReply({ ephemeral: true });
                await sendKVNotice(interaction.guild);
                return interaction.editReply('✅ Анонс сбора на КВ отправлен.');
            }
            default:
                return interaction.reply({ content: '❌ Неизвестная команда панели.', ephemeral: true });
        }
    }

    // --- СОХРАНЕНИЕ НАСТРОЕК КВ ---
    if (interaction.isModalSubmit() && interaction.customId === 'kv_setup_modal') {
        const days = interaction.fields.getTextInputValue('days');
        const time = interaction.fields.getTextInputValue('time');
        const voice = interaction.fields.getTextInputValue('voice');

        KV_SETTINGS.days = days.split(',').map(d => parseInt(d.trim(), 10)).filter(n => Number.isFinite(n));
        KV_SETTINGS.time = time;
        KV_SETTINGS.voice = voice;

        saveKVSettings();
        createKVCron();

        return interaction.reply({
            content: `✅ Настройки КВ сохранены

📅 Дни: ${days}
⏰ Время: ${time}
🔊 Канал: ${voice}`,
            ephemeral: true
        });
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('adm_modal_chan_')) {
        const channelInput = interaction.fields.getTextInputValue('chan_id').replace(/[<#>]/g, '');
        const target = interaction.guild.channels.cache.get(channelInput);
        if (!target) return interaction.reply({ content: '❌ Канал не найден.', ephemeral: true });

        if (interaction.customId === 'adm_modal_chan_meeting') {
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`setup_meeting_${target.id}`).setLabel('Перейти к настройке').setStyle(ButtonStyle.Primary));
            return interaction.reply({ content: `Настройка собрания для канала ${target}`, components: [row], ephemeral: true });
        }

        if (interaction.customId === 'adm_modal_chan_embed') {
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`setup_embed_${target.id}`).setLabel('Перейти к настройке').setStyle(ButtonStyle.Primary));
            return interaction.reply({ content: `Настройка Embed для канала ${target}`, components: [row], ephemeral: true });
        }
    }

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

    if (interaction.isButton() && interaction.customId.startsWith('setup_embed_')) {
        const channelId = interaction.customId.split('_')[2];
        const modal = new ModalBuilder().setCustomId(`embed_modal_${channelId}`).setTitle('Создание Embed сообщения');

        const rows = [
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Заголовок').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Описание').setStyle(TextInputStyle.Paragraph).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('color').setLabel('Цвет (HEX, например: #ff0000)').setStyle(TextInputStyle.Short).setPlaceholder('#2b2d31').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('image').setLabel('Ссылка на фото (URL)').setStyle(TextInputStyle.Short).setRequired(false))
        ];

        modal.addComponents(...rows);
        return await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('embed_modal_')) {
        const chanId = interaction.customId.split('_')[2];
        const targetChan = interaction.guild.channels.cache.get(chanId);
        
        if (!targetChan) return interaction.reply({ content: 'Канал не найден!', ephemeral: true });

        const title = interaction.fields.getTextInputValue('title');
        const desc = interaction.fields.getTextInputValue('desc');
        const color = interaction.fields.getTextInputValue('color') || '#2b2d31';
        const image = interaction.fields.getTextInputValue('image');

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(desc)
            .setColor(color.startsWith('#') ? color : '#2b2d31');

        if (image && image.startsWith('http')) embed.setImage(image);

        await targetChan.send({ embeds: [embed] });
        return await interaction.reply({ content: `✅ Сообщение отправлено в ${targetChan}`, ephemeral: true });
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
                .setDescription(`Привет, <@${userId}>! Твоя заявка рассмотрена.\n\nМы приглашаем тебя на обзвон. Пожалуйста, зайди в голосовой канал, когда будешь готов.\n\n🎙️ <#1474125719557636249>\n🎙️ <#1474133242834849792>\n\n**Время вызова (МСК):** \`${getMSKTime()}\``)
                .setFooter({ text: 'Recruitment System' });

            const callChan = interaction.guild.channels.cache.get(CHANNELS.call);
            if (callChan) await callChan.send({ content: `<@${userId}>`, embeds: [callEmbed] });
            if (targetUser) await targetUser.send({ embeds: [callEmbed] }).catch(() => {});

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
                    .setDescription(`Твоя заявка в клан **RENESSEANCE** была одобрена!`)
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
                .setDescription(`К сожалению, твоя заявка была отклонена.\n\n**Причина:** \`${reason}\``);
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
        
        await chan.send({ content: `<@&${ROLES.staff}>`, embeds: [embed], components: [row] });
        await interaction.reply({ content: 'Собрание создано!', ephemeral: true });
    }
});

process.on("unhandledRejection", err => {
    console.error("UNHANDLED PROMISE:", err);
});

process.on("uncaughtException", err => {
    console.error("UNCAUGHT EXCEPTION:", err);
});

client.login(process.env.TOKEN || config.token);
