const wol = require('wake_on_lan');
const MACADDRESS = process.env.MACADDRESS;

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'poweron') {
        wol.wake(MACADDRESS);
        await interaction.reply({
            content: 'PCを起動しました。',
            ephemeral: true
        });
    }
});