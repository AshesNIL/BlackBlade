const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs-extra');
const path = require('path');
const schedule = require('node-schedule');
const logger = require('../utils/logger');

const membersFilePath = path.join(__dirname, '../data/members.json');
const powerHistoryFilePath = path.join(__dirname, '../data/powerHistory.json');

// Ensure data files exist
fs.ensureDirSync(path.join(__dirname, '../data'));
fs.ensureFileSync(membersFilePath);
fs.ensureFileSync(powerHistoryFilePath);
if (!fs.readFileSync(membersFilePath, 'utf-8')) fs.writeJsonSync(membersFilePath, {});
if (!fs.readFileSync(powerHistoryFilePath, 'utf-8')) fs.writeJsonSync(powerHistoryFilePath, {});

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function calculateGrowth(oldPower, newPower) {
    const difference = newPower - oldPower;
    const percentage = ((difference / oldPower) * 100).toFixed(2);
    const arrow = difference > 0 ? '↑' : difference < 0 ? '↓' : '→';
    return `${arrow} ${formatNumber(Math.abs(difference))} (${percentage}%)`;
}

function formatDate(date) {
    return new Date(date).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('power')
        .setDescription('Manage power level information')
        .addSubcommand(subcommand =>
            subcommand
                .setName('update')
                .setDescription('Update your power level')
                .addIntegerOption(option =>
                    option.setName('power')
                        .setDescription('Your current power level')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('history')
                .setDescription('View your power progression'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('check')
                .setDescription('Check power level of another member (Admin only)')
                .addUserOption(option =>
                    option.setName('member')
                        .setDescription('Member to check')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('Show alliance power rankings'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('analytics')
                .setDescription('View alliance growth statistics')
                .addStringOption(option =>
                    option.setName('period')
                        .setDescription('Time period')
                        .addChoices(
                            { name: 'Weekly', value: 'week' },
                            { name: 'Monthly', value: 'month' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('goal')
                .setDescription('Set/view power goals')
                .addIntegerOption(option =>
                    option.setName('target')
                        .setDescription('Target power level')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('export')
                .setDescription('Export power history to CSV (Admin only)')),

    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'update') {
                const power = interaction.options.getInteger('power');
                const timestamp = new Date().toISOString();
                const userId = interaction.user.id;

                const members = fs.readJsonSync(membersFilePath);
                const powerHistory = fs.readJsonSync(powerHistoryFilePath);

                // Initialize if first update
                if (!powerHistory[userId]) powerHistory[userId] = [];

                const oldPower = members[userId]?.current_power || power;
                const growthText = members[userId] ? calculateGrowth(oldPower, power) : 'First update!';

                members[userId] = {
                    discord_name: interaction.user.tag,
                    current_power: power,
                    last_updated: timestamp
                };

                powerHistory[userId].push({ power, timestamp });

                await fs.writeJson(membersFilePath, members);
                await fs.writeJson(powerHistoryFilePath, powerHistory);

                const embed = new EmbedBuilder()
                    .setTitle('🔄 Power Updated')
                    .setColor('#00FF00')
                    .addFields(
                        { name: 'New Power', value: formatNumber(power), inline: true },
                        { name: 'Growth', value: growthText, inline: true },
                        { name: 'Time', value: formatDate(timestamp), inline: true }
                    )
                    .setFooter({ text: 'Use /power history to view your progression' });

                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
            else if (subcommand === 'history') {
                const userId = interaction.user.id;
                const powerHistory = fs.readJsonSync(powerHistoryFilePath);
                const userHistory = powerHistory[userId] || [];

                const embed = new EmbedBuilder()
                    .setTitle('📊 Power Level History')
                    .setColor('#0099FF');

                if (userHistory.length === 0) {
                    embed.setDescription('No power history found. Use `/power update` to start tracking!');
                } else {
                    const sortedHistory = userHistory
                        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                        .slice(0, 5);

                    const firstPower = sortedHistory[sortedHistory.length - 1].power;
                    const latestPower = sortedHistory[0].power;
                    const totalGrowth = calculateGrowth(firstPower, latestPower);

                    embed.addFields(
                        { name: 'Current Power', value: formatNumber(latestPower), inline: true },
                        { name: 'Total Growth', value: totalGrowth, inline: true },
                        { name: 'Updates', value: userHistory.length.toString(), inline: true }
                    );

                    const historyText = sortedHistory.map(entry => {
                        return `\`${formatDate(entry.timestamp)}\`: ${formatNumber(entry.power)}`;
                    }).join('\n');

                    embed.addFields({ name: 'Recent Updates', value: historyText });
                }

                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
            // Add this in the execute function after the history subcommand
            else if (subcommand === 'check') {
                // Check admin permissions
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                    return await interaction.reply({
                        content: 'You do not have permission to check other members\' power levels.',
                        ephemeral: true
                    });
                }

                const targetUser = interaction.options.getUser('member');
                const members = fs.readJsonSync(membersFilePath);
                const powerHistory = fs.readJsonSync(powerHistoryFilePath);

                const memberData = members[targetUser.id];
                const userHistory = powerHistory[targetUser.id] || [];

                const embed = new EmbedBuilder()
                    .setTitle(`📊 Power Level - ${targetUser.tag}`)
                    .setColor('#0099FF')
                    .setThumbnail(targetUser.displayAvatarURL());

                if (!memberData || userHistory.length === 0) {
                    embed.setDescription('No power history found for this member.');
                } else {
                    const sortedHistory = userHistory
                        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                        .slice(0, 5);

                    const firstPower = sortedHistory[sortedHistory.length - 1].power;
                    const latestPower = sortedHistory[0].power;
                    const totalGrowth = calculateGrowth(firstPower, latestPower);

                    embed.addFields(
                        { name: 'Current Power', value: formatNumber(memberData.current_power), inline: true },
                        { name: 'Total Growth', value: totalGrowth, inline: true },
                        { name: 'Last Updated', value: formatDate(memberData.last_updated), inline: true }
                    );

                    const historyText = sortedHistory.map(entry => {
                        return `\`${formatDate(entry.timestamp)}\`: ${formatNumber(entry.power)}`;
                    }).join('\n');

                    embed.addFields({ name: 'Recent Updates', value: historyText });

                    const daysSinceUpdate = Math.floor(
                        (new Date() - new Date(memberData.last_updated)) / (1000 * 60 * 60 * 24)
                    );
                    embed.setFooter({ text: `Last update was ${daysSinceUpdate} days ago` });
                }

                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
            // Add these handlers in the execute function after existing subcommands

            else if (subcommand === 'leaderboard') {
                const members = fs.readJsonSync(membersFilePath);

                // Sort members by power
                const sortedMembers = Object.entries(members)
                    .sort(([, a], [, b]) => b.current_power - a.current_power);

                const embed = new EmbedBuilder()
                    .setTitle('🏆 Alliance Power Rankings')
                    .setColor('#FFD700')
                    .setTimestamp();

                const rankings = sortedMembers.map(([userId, data], index) => {
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                    return `${medal} <@${userId}> - ${formatNumber(data.current_power)}`;
                }).join('\n');

                embed.setDescription(rankings || 'No rankings available.');
                await interaction.reply({ embeds: [embed] });
            }

            else if (subcommand === 'analytics') {
                const period = interaction.options.getString('period');
                const powerHistory = fs.readJsonSync(powerHistoryFilePath);
                const members = fs.readJsonSync(membersFilePath);

                const cutoffDate = new Date();
                if (period === 'week') {
                    cutoffDate.setDate(cutoffDate.getDate() - 7);
                } else {
                    cutoffDate.setMonth(cutoffDate.getMonth() - 1);
                }

                let totalGrowth = 0;
                let highestGrowth = { userId: null, growth: 0 };
                let memberGrowth = [];

                Object.entries(powerHistory).forEach(([userId, history]) => {
                    const sortedHistory = history
                        .filter(entry => new Date(entry.timestamp) >= cutoffDate)
                        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

                    if (sortedHistory.length >= 2) {
                        const growth = sortedHistory[sortedHistory.length - 1].power - sortedHistory[0].power;
                        totalGrowth += growth;
                        memberGrowth.push({ userId, growth });

                        if (growth > highestGrowth.growth) {
                            highestGrowth = { userId, growth };
                        }
                    }
                });

                const embed = new EmbedBuilder()
                    .setTitle(`📈 Alliance Growth Analytics - ${period === 'week' ? 'Weekly' : 'Monthly'}`)
                    .setColor('#00FF00')
                    .addFields(
                        { name: 'Total Growth', value: formatNumber(totalGrowth), inline: true },
                        { name: 'Top Grower', value: highestGrowth.userId ? `<@${highestGrowth.userId}> (+${formatNumber(highestGrowth.growth)})` : 'N/A', inline: true },
                        { name: 'Active Members', value: memberGrowth.length.toString(), inline: true }
                    );

                await interaction.reply({ embeds: [embed] });
            }

            else if (subcommand === 'goal') {
                const target = interaction.options.getInteger('target');
                const userId = interaction.user.id;
                const members = fs.readJsonSync(membersFilePath);
                const memberData = members[userId];

                if (!memberData) {
                    return await interaction.reply({
                        content: 'Please update your power level first using `/power update`',
                        ephemeral: true
                    });
                }

                if (target) {
                    memberData.power_goal = target;
                    await fs.writeJson(membersFilePath, members);

                    const remaining = target - memberData.current_power;
                    const percentage = ((memberData.current_power / target) * 100).toFixed(1);

                    const embed = new EmbedBuilder()
                        .setTitle('🎯 Power Goal Set')
                        .setColor('#9B59B6')
                        .addFields(
                            { name: 'Current Power', value: formatNumber(memberData.current_power), inline: true },
                            { name: 'Goal', value: formatNumber(target), inline: true },
                            { name: 'Remaining', value: formatNumber(remaining), inline: true },
                            { name: 'Progress', value: `${percentage}%`, inline: true }
                        );

                    await interaction.reply({ embeds: [embed], ephemeral: true });
                } else {
                    if (!memberData.power_goal) {
                        return await interaction.reply({
                            content: 'No power goal set. Use `/power goal <target>` to set one.',
                            ephemeral: true
                        });
                    }

                    const remaining = memberData.power_goal - memberData.current_power;
                    const percentage = ((memberData.current_power / memberData.power_goal) * 100).toFixed(1);

                    const embed = new EmbedBuilder()
                        .setTitle('🎯 Power Goal Progress')
                        .setColor('#9B59B6')
                        .addFields(
                            { name: 'Current Power', value: formatNumber(memberData.current_power), inline: true },
                            { name: 'Goal', value: formatNumber(memberData.power_goal), inline: true },
                            { name: 'Remaining', value: formatNumber(remaining), inline: true },
                            { name: 'Progress', value: `${percentage}%`, inline: true }
                        );

                    await interaction.reply({ embeds: [embed], ephemeral: true });
                }
            }

            else if (subcommand === 'export') {
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                    return await interaction.reply({
                        content: 'You do not have permission to export data.',
                        ephemeral: true
                    });
                }

                const members = fs.readJsonSync(membersFilePath);
                const powerHistory = fs.readJsonSync(powerHistoryFilePath);

                let csv = 'Discord ID,Discord Name,Current Power,Last Updated,Power History\n';

                Object.entries(members).forEach(([userId, data]) => {
                    const history = powerHistory[userId] || [];
                    const historyStr = history
                        .map(entry => `${entry.power}@${entry.timestamp}`)
                        .join('|');

                    csv += `${userId},${data.discord_name},${data.current_power},${data.last_updated},"${historyStr}"\n`;
                });

                const filePath = path.join(__dirname, '../data/power_export.csv');
                await fs.writeFile(filePath, csv);

                await interaction.reply({
                    content: 'Power history exported to CSV',
                    files: [filePath],
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Error in power command:', error);
            await interaction.reply({
                content: 'An error occurred while processing the command.',
                ephemeral: true
            });
        }
    }
};

function setupPowerReminders(client) {
    schedule.scheduleJob('0 15 * * 1', async () => {
        try {
            const members = fs.readJsonSync(membersFilePath);
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const outdatedMembers = Object.entries(members).filter(([userId, data]) => {
                const lastUpdate = new Date(data.last_updated);
                return lastUpdate < sevenDaysAgo;
            });

            if (outdatedMembers.length > 0) {
                const reminderChannel = client.channels.cache.find(
                    channel => channel.name === 'power-updates'
                );

                if (reminderChannel) {
                    const embed = new EmbedBuilder()
                        .setTitle('⚠️ Power Update Reminder')
                        .setDescription('The following members need to update their power level:')
                        .setColor('#FFD700')
                        .setTimestamp();

                    const memberList = outdatedMembers
                        .map(([userId, data]) => {
                            const daysSinceUpdate = Math.floor(
                                (new Date() - new Date(data.last_updated)) / (1000 * 60 * 60 * 24)
                            );
                            return `<@${userId}> (Last update: ${formatDate(data.last_updated)} - ${daysSinceUpdate} days ago)`;
                        })
                        .join('\n');

                    embed.addFields({ name: 'Members', value: memberList });

                    await reminderChannel.send({
                        content: outdatedMembers.map(([userId]) => `<@${userId}>`).join(' '),
                        embeds: [embed]
                    });
                }
            }

        } catch (error) {
            console.error('Error sending power update reminders:', error);
        }
    });
}


module.exports.setupReminders = setupPowerReminders;