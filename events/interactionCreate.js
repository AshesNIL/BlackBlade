const { Collection } = require('discord.js');
const cooldowns = new Collection();
const logger = require('../utils/logger');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        try {
            // Handle different interaction types
            if (interaction.isCommand()) {
                return handleCommand(interaction, client);
            }
            
            if (interaction.isButton()) {
                return handleButton(interaction, client);
            }

            if (interaction.isSelectMenu()) {
                return handleSelectMenu(interaction, client);
            }

            if (interaction.isModalSubmit()) {
                return handleModalSubmit(interaction, client);
            }
        } catch (error) {
            console.error('Interaction Error:', error);
            const errorMessage = 'An unexpected error occurred!';
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    },
};

async function handleCommand(interaction, client) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    // Check cooldowns
    if (!cooldowns.has(command.data.name)) {
        cooldowns.set(command.data.name, new Collection());
    }

    const timestamps = cooldowns.get(command.data.name);
    const cooldownAmount = (command.cooldown || 3) * 1000;
    const now = Date.now();

    if (timestamps.has(interaction.user.id)) {
        const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;

        if (now < expirationTime) {
            const timeLeft = (expirationTime - now) / 1000;
            return interaction.reply({
                content: `Please wait ${timeLeft.toFixed(1)} more seconds before using \`${command.data.name}\``,
                ephemeral: true
            });
        }
    }

    timestamps.set(interaction.user.id, now);
    setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

    // Execute command
    try {
        await command.execute(interaction);
    } catch (error) {
        console.error('Command Error:', error);
        const errorMessage = `Error executing ${interaction.commandName}!`;
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    }
}

async function handleButton(interaction, client) {
    if (interaction.customId.startsWith('role_')) {
        const roles = require('../commands/roles');
        await roles.handleButton(interaction);
    }
    // Add other button handlers here
}

async function handleSelectMenu(interaction, client) {
    // Handle select menus
    const selectMenuHandler = client.selectMenus.get(interaction.customId);
    if (selectMenuHandler) {
        await selectMenuHandler.execute(interaction);
    }
}

async function handleModalSubmit(interaction, client) {
    // Handle modal submissions
    const modalHandler = client.modals.get(interaction.customId);
    if (modalHandler) {
        await modalHandler.execute(interaction);
    }
}