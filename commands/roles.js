const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');

// Define role mappings
const ROLES = {
    region: [
        { label: 'NA', roleId: '1302391318000959568', emoji: '🌎' },
        { label: 'EU', roleId: '1302391088719593632', emoji: '🌍' },
        { label: 'AFRICA', roleId: '1302413834556014675', emoji: '🌍' },
        { label: 'ASIA', roleId: '1302391317288190064', emoji: '🌏' }
    ],
    pets: [
        { label: 'Dog', roleId: '1302408498944151712', emoji: '🐕' },
        { label: 'Cat', roleId: '1302401546239082506', emoji: '🐈' },
        { label: 'Horse', roleId: '1302408199189827654', emoji: '🐎' },
        { label: 'Bird', roleId: '1302413025734824006', emoji: '🦜' }
    ]
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roles')
        .setDescription('Create role selection menu')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of roles to set up')
                .setRequired(true)
                .addChoices(
                    { name: 'Region', value: 'region' },
                    { name: 'Pets', value: 'pets' }
                )),

    async execute(interaction) {
        try {
            // Check bot permissions
            if (!interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
                return await interaction.reply({
                    content: 'I need Manage Roles permission to create role menus!',
                    ephemeral: true
                });
            }

            const type = interaction.options.getString('type');
            const roles = ROLES[type];

            const embed = new EmbedBuilder()
                .setTitle(`${type === 'region' ? '🌍 Region' : '🐾 Pet'} Selection`)
                .setDescription('Click a button to toggle the role!')
                .setColor('#00AAFF');

            const row = new ActionRowBuilder();

            roles.forEach(role => {
                const button = new ButtonBuilder()
                    .setCustomId(`role_${type}_${role.label.toLowerCase()}`)
                    .setLabel(role.label)
                    .setEmoji(role.emoji)
                    .setStyle(ButtonStyle.Primary);

                row.addComponents(button);
            });

            await interaction.reply({
                embeds: [embed],
                components: [row]
            });

        } catch (error) {
            console.error('Error in roles command:', error);
            await interaction.reply({
                content: 'An error occurred setting up the role menu.',
                ephemeral: true
            });
        }
    },

    // Add button handler
    async handleButton(interaction) {
        try {
            const [_, type, roleLabel] = interaction.customId.split('_');
            const roleConfig = ROLES[type].find(r => r.label.toLowerCase() === roleLabel);

            if (!roleConfig) {
                console.error(`Role config not found for ${roleLabel}`);
                return await interaction.reply({
                    content: 'Role configuration not found.',
                    ephemeral: true
                });
            }

            const role = interaction.guild.roles.cache.get(roleConfig.roleId);
            if (!role) {
                console.error(`Role not found with ID ${roleConfig.roleId}`);
                return await interaction.reply({
                    content: 'Role not found in server.',
                    ephemeral: true
                });
            }

            const hasRole = interaction.member.roles.cache.has(role.id);
            await interaction.member.roles[hasRole ? 'remove' : 'add'](role);

            await interaction.reply({
                content: `${hasRole ? 'Removed' : 'Added'} ${role.name} role!`,
                ephemeral: true
            });

        } catch (error) {
            console.error('Error handling role button:', error);
            await interaction.reply({
                content: 'Failed to update role.',
                ephemeral: true
            });
        }
    }
};