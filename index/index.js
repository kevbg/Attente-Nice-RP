require('dotenv').config();

const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus,
    getVoiceConnection
} = require('@discordjs/voice');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID;
const TEXT_CHANNEL_ID = process.env.TEXT_CHANNEL_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;

let player;

function playMusic(connection) {
    player = createAudioPlayer();
    const resource = createAudioResource(path.join(__dirname, 'attente.mp3'));
    
    player.play(resource);
    connection.subscribe(player);

    player.on(AudioPlayerStatus.Idle, () => {
        const guild = client.guilds.cache.get(GUILD_ID);
        const channel = guild?.channels.cache.get(VOICE_CHANNEL_ID);
        if (channel && hasHumanMembers(channel)) {
            playMusic(connection);
        }
    });
}

function hasHumanMembers(channel) {
    return channel.members.some(member => !member.user.bot);
}

client.once('ready', () => {
    console.log(`Bot connecté en tant que ${client.user.tag}`);
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    if (oldState.channelId !== VOICE_CHANNEL_ID && newState.channelId !== VOICE_CHANNEL_ID) {
        return;
    }

    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return;

    const channel = guild.channels.cache.get(VOICE_CHANNEL_ID);
    if (!channel) return;

    const textChannel = guild.channels.cache.get(TEXT_CHANNEL_ID);
    const humansPresent = hasHumanMembers(channel);
    let connection = getVoiceConnection(GUILD_ID);

    if (newState.channelId === VOICE_CHANNEL_ID && oldState.channelId !== VOICE_CHANNEL_ID) {
        const member = newState.member;
        if (member.user.bot) return;

        if (!connection) {
            connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator,
                selfDeaf: true
            });
            playMusic(connection);
        }

        if (textChannel) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('take_charge')
                    .setLabel('Prise en charge')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅')
            );

            await textChannel.send({
                content: `<@&${STAFF_ROLE_ID}> Un membre (${member}) attend dans le salon **Attente Staff** ! Merci de bien vouloir vous en occuper !`,
                components: [row]
            });
        }
    }

    if (!humansPresent && connection) {
        if (player) player.stop();
        connection.destroy();
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'take_charge') {
        const staffMember = interaction.user;
        const guild = client.guilds.cache.get(GUILD_ID);
        const channel = guild?.channels.cache.get(VOICE_CHANNEL_ID);

        const waitingMembers = channel ? channel.members.filter(m => !m.user.bot) : null;

        if (waitingMembers && waitingMembers.size > 0) {
            for (const [id, waitingMember] of waitingMembers) {
                try {
                    await waitingMember.send(
                        `Bonjour ${waitingMember.user.username}, ton attente a été prise en charge par **${staffMember.username}**. Un membre du staff va arriver sous peu !`
                    );
                } catch (err) {
                    console.log(`Impossible d'envoyer un MP à ${waitingMember.user.tag} (MP fermés).`);
                }
            }
        }

        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('take_charge_done')
                .setLabel(`Pris en charge par ${staffMember.username}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );

        await interaction.update({
            content: `✅ L'attente a été prise en charge par ${staffMember} !`,
            components: [disabledRow]
        });
    }
});

client.login(TOKEN);