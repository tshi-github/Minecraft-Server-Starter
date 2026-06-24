const wol = require('wake_on_lan');

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'poweron') {
        wol.wake('9C-6B-00-E1-E7-16');
        await interaction.reply({
            content: 'PCを起動しました。',
            ephemeral: true
        });
    }
});