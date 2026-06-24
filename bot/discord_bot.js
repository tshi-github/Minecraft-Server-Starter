const {
    ActionRowBuilder, 
    ButtonBuilder,
    ButtonStyle,
    Client,
    GatewayIntentBits,
} = require('discord.js');

const client = new.Client({ intents: [GatewayIntentBits.Guilds] });

const TOKEN = process.env.TOKEN;

client.once('ready', async () => {

    const channel = await client.channels.fetch(TOKEN);

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('poweron')
                .setLabel('PC起動')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('startserver')
                .setLabel('サーバー起動')
                .setStyle(ButtonStyle.Primary),
        );

    channel.send({ content: 'Minecraft Server Controls',
        components: [row] 
    });

})

client.login(TOKEN)