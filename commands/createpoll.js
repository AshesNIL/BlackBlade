const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const logger = require('../utils/logger');

// Validate image URL
function isValidImageUrl(string) {
    try {
        new URL(string);
        return string.match(/\.(jpg|jpeg|png|gif|webp)$/i);
    } catch (_) {
        return false;
    }
}

// Helper function to create a cleaner progress bar
function createProgressBar(percentage) {
    const filledChar = '■'; // Solid block
    const emptyChar = '□';  // Empty block
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    return `${filledChar.repeat(filled)}${emptyChar.repeat(empty)}`;
}

// Helper function to wait between retries
async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to retry failed operations
async function retry(fn, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i === retries - 1) throw err;
            await wait(delay);
        }
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('createpoll')
        .setDescription('Create a poll with optional images')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('The poll question')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('options')
                .setDescription('Comma-separated list of options')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('images')
                .setDescription('Comma-separated image URLs (optional)')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Poll duration in minutes (0 for no limit)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('multiple')
                .setDescription('Allow multiple choices')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('anonymous')
                .setDescription('Hide voter names')
                .setRequired(false)),

    async execute(interaction) {
        try {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                return await interaction.reply({
                    content: 'You do not have permission to create polls.',
                    ephemeral: true
                });
            }

            const question = interaction.options.getString('question');
            const options = interaction.options.getString('options').split(',');
            const imageUrls = interaction.options.getString('images')?.split(',') || [];
            const duration = interaction.options.getInteger('duration') || 0;
            const isMultiple = interaction.options.getBoolean('multiple') || false;
            const isAnonymous = interaction.options.getBoolean('anonymous') || false;

            if (options.length < 2 || options.length > 10) {
                return await interaction.reply({
                    content: 'Please provide between 2 and 10 options.',
                    ephemeral: true
                });
            }

            if (imageUrls.length > 0) {
                if (imageUrls.length !== options.length) {
                    return await interaction.reply({
                        content: 'Number of images must match number of options.',
                        ephemeral: true
                    });
                }

                const invalidUrls = imageUrls.filter(url => url && !isValidImageUrl(url.trim()));
                if (invalidUrls.length > 0) {
                    return await interaction.reply({
                        content: 'Invalid image URL(s). Must end with .jpg, .jpeg, .png, .gif, or .webp',
                        ephemeral: true
                    });
                }
            }

            await interaction.deferReply();

            const votes = new Map();
            options.forEach((_, index) => votes.set(index, new Set()));

            const additionalEmbeds = [];
            const embed = new EmbedBuilder()
                .setTitle(`📊 ${question}`)
                .setColor('#00AAFF');

            if (isMultiple) {
                embed.setDescription('*Multiple choices allowed*');
            }

            options.forEach((option, index) => {
                const imageUrl = imageUrls[index]?.trim();
                const progressBar = createProgressBar(0);
                let fieldValue = `${option.trim()}\n${progressBar} 0% (0)`;

                if (imageUrl) {
                    if (index === 0) {
                        embed.setImage(imageUrl);
                        fieldValue += '\n[Image Above]';
                    } else {
                        const imageEmbed = new EmbedBuilder()
                            .setImage(imageUrl)
                            .setColor('#00AAFF');
                        additionalEmbeds.push(imageEmbed);
                        fieldValue += '\n[See Image Below]';
                    }
                }

                embed.addFields({
                    name: `Option ${index + 1}`,
                    value: fieldValue,
                    inline: false
                });
            });

            embed.setFooter({
                text: `Created by ${interaction.user.tag} • ${duration ? `Ends in ${duration}min` : 'No time limit'}`
            });

            const message = await interaction.editReply({
                embeds: [embed, ...additionalEmbeds],
                fetchReply: true
            });

            for (let i = 0; i < options.length; i++) {
                await retry(async () => {
                    await message.react(`${i + 1}️⃣`);
                    await wait(1500);
                }, 3, 2000);
            }

            const filter = (reaction, user) => {
                return !user.bot &&
                    reaction.emoji.name.match(/[1-9]️⃣|🔟/);
            };

            const collector = message.createReactionCollector({
                filter,
                time: duration * 60000 || undefined
            });

            collector.on('collect', async (reaction, user) => {
                const index = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'].indexOf(reaction.emoji.name);
                
                if (!isMultiple) {
                    votes.forEach((voters, voteIndex) => {
                        if (voteIndex !== index) {
                            voters.delete(user.id);
                            const r = message.reactions.cache.get(['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'][voteIndex]);
                            if (r && r.users.cache.has(user.id)) r.users.remove(user.id);
                        }
                    });
                }
                
                votes.get(index).add(user.id);

                const totalVotes = Array.from(votes.values())
                    .reduce((sum, voters) => sum + voters.size, 0);

                const updatedEmbed = new EmbedBuilder()
                    .setTitle(`📊 ${question}`)
                    .setColor('#00AAFF');

                if (isMultiple) {
                    updatedEmbed.setDescription('*Multiple choices allowed*');
                }

                options.forEach((option, idx) => {
                    const imageUrl = imageUrls[idx]?.trim();
                    const voteCount = votes.get(idx)?.size || 0;
                    const percentage = totalVotes ? (voteCount / totalVotes * 100) : 0;
                    
                    const progressBar = createProgressBar(percentage);
                    const voteText = `${progressBar} ${percentage.toFixed(1)}% (${voteCount})`;

                    let fieldValue = `${option.trim()}\n${voteText}`;
                    if (!isAnonymous && voteCount > 0) {
                        const voters = Array.from(votes.get(idx))
                            .slice(0, 3)
                            .map(id => `<@${id}>`)
                            .join(', ');
                        fieldValue += voteCount > 3 ? `\nVoters: ${voters}...` : `\nVoters: ${voters}`;
                    }

                    if (imageUrl) {
                        if (idx === 0) {
                            updatedEmbed.setImage(imageUrl);
                            fieldValue += '\n[Image Above]';
                        } else {
                            fieldValue += '\n[See Image Below]';
                        }
                    }

                    updatedEmbed.addFields({
                        name: `Option ${idx + 1}`,
                        value: fieldValue,
                        inline: false
                    });
                });

                updatedEmbed.setFooter({
                    text: `Created by ${interaction.user.tag} • ${duration ? `Ends in ${duration}min` : 'No time limit'}`
                });

                await message.edit({ embeds: [updatedEmbed, ...additionalEmbeds] });
            });

            collector.on('remove', async (reaction, user) => {
                const index = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'].indexOf(reaction.emoji.name);
                votes.get(index).delete(user.id);

                const totalVotes = Array.from(votes.values())
                    .reduce((sum, voters) => sum + voters.size, 0);

                const updatedEmbed = new EmbedBuilder()
                    .setTitle(`📊 ${question}`)
                    .setColor('#00AAFF');

                if (isMultiple) {
                    updatedEmbed.setDescription('*Multiple choices allowed*');
                }

                options.forEach((option, idx) => {
                    const imageUrl = imageUrls[idx]?.trim();
                    const voteCount = votes.get(idx)?.size || 0;
                    const percentage = totalVotes ? (voteCount / totalVotes * 100) : 0;
                    
                    const progressBar = createProgressBar(percentage);
                    const voteText = `${progressBar} ${percentage.toFixed(1)}% (${voteCount})`;

                    let fieldValue = `${option.trim()}\n${voteText}`;
                    if (!isAnonymous && voteCount > 0) {
                        const voters = Array.from(votes.get(idx))
                            .slice(0, 3)
                            .map(id => `<@${id}>`)
                            .join(', ');
                        fieldValue += voteCount > 3 ? `\nVoters: ${voters}...` : `\nVoters: ${voters}`;
                    }

                    if (imageUrl) {
                        if (idx === 0) {
                            updatedEmbed.setImage(imageUrl);
                            fieldValue += '\n[Image Above]';
                        } else {
                            fieldValue += '\n[See Image Below]';
                        }
                    }

                    updatedEmbed.addFields({
                        name: `Option ${idx + 1}`,
                        value: fieldValue,
                        inline: false
                    });
                });

                updatedEmbed.setFooter({
                    text: `Created by ${interaction.user.tag} • ${duration ? `Ends in ${duration}min` : 'No time limit'}`
                });

                await message.edit({ embeds: [updatedEmbed, ...additionalEmbeds] });
            });

            collector.on('end', async () => {
                if (duration) {
                    const finalEmbed = EmbedBuilder.from(message.embeds[0])
                        .setTitle(`📊 [ENDED] ${question}`)
                        .setColor('#808080');
                    
                    await message.edit({ embeds: [finalEmbed, ...additionalEmbeds] });
                    await message.reactions.removeAll();
                }
            });

        } catch (error) {
            logger.error('Error in createpoll command:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while creating the poll.',
                    ephemeral: true
                });
            } else if (interaction.deferred) {
                await interaction.editReply({
                    content: 'An error occurred while creating the poll.'
                });
            }
        }
    },
};