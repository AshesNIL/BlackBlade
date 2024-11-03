// commands/economy.js
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');

const economyFilePath = path.join(__dirname, '../data/economy.json');
fs.ensureFileSync(economyFilePath);

// Initialize economy data
if (!fs.readFileSync(economyFilePath, 'utf-8')) {
    fs.writeJsonSync(economyFilePath, {});
}


const WORK_COOLDOWN = 3600000; // 1 hour
const workResponses = [
    { type: 'Developer', messages: ['You fixed a bug', 'You deployed an app'], rewards: [100, 500] },
    { type: 'Artist', messages: ['You sold a painting', 'You held an exhibition'], rewards: [150, 450] },
    { type: 'Chef', messages: ['You cooked a feast', 'You served a celebrity'], rewards: [200, 400] }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('economy')
        .setDescription('Economy commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('work')
                .setDescription('Work to earn coins'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('balance')
                .setDescription('Check your balance'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('rob')
                .setDescription('Rob another user')
                .addUserOption(option =>
                    option.setName('target')
                        .setDescription('User to rob')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('deposit')
                .setDescription('Deposit coins to bank')
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Amount to deposit')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('withdraw')
                .setDescription('Withdraw coins from bank')
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Amount to withdraw')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('daily')
                .setDescription('Claim daily reward'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('Show richest users')),

    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();
            const economy = fs.readJsonSync(economyFilePath);

            // Initialize user if not exists
            if (!economy[interaction.user.id]) {
                economy[interaction.user.id] = {
                    balance: 0,
                    lastWork: 0,
                    inventory: [],
                    streak: 0,
                    lastDaily: 0,
                    bankBalance: 0    // Add bank account
                };
            }

            if (subcommand === 'work') {
                const timeSinceLastWork = Date.now() - economy[interaction.user.id].lastWork;
                if (timeSinceLastWork < WORK_COOLDOWN) {
                    const timeLeft = Math.ceil((WORK_COOLDOWN - timeSinceLastWork) / 60000);
                    return interaction.reply({
                        content: `You need to wait ${timeLeft} minutes before working again!`,
                        ephemeral: true
                    });
                }

                const job = workResponses[Math.floor(Math.random() * workResponses.length)];
                const messageIndex = Math.floor(Math.random() * job.messages.length);
                const reward = Math.floor(Math.random() * (job.rewards[1] - job.rewards[0])) + job.rewards[0];

                economy[interaction.user.id].balance += reward;
                economy[interaction.user.id].lastWork = Date.now();

                const embed = new EmbedBuilder()
                    .setTitle(`${job.type} Work`)
                    .setDescription(`${job.messages[messageIndex]} and earned ${reward} coins!`)
                    .setColor('#00FF00')
                    .setFooter({ text: `Balance: ${economy[interaction.user.id].balance} coins` });

                await fs.writeJson(economyFilePath, economy);
                await interaction.reply({ embeds: [embed] });
            }

            else if (subcommand === 'balance') {
                const embed = new EmbedBuilder()
                    .setTitle('💰 Balance')
                    .setDescription(`You have ${economy[interaction.user.id].balance} coins`)
                    .setColor('#FFD700');

                await interaction.reply({ embeds: [embed] });
            }

            else if (subcommand === 'rob') {
                const target = interaction.options.getUser('target');
                if (!economy[target.id]) {
                    return interaction.reply({
                        content: 'This user has no coins to rob!',
                        ephemeral: true
                    });
                }

                const chance = Math.random();
                if (chance > 0.7) { // 30% success rate
                    const stolenAmount = Math.floor(economy[target.id].balance * 0.2); // Steal 20%
                    economy[target.id].balance -= stolenAmount;
                    economy[interaction.user.id].balance += stolenAmount;

                    const embed = new EmbedBuilder()
                        .setTitle('🦹 Successful Robbery')
                        .setDescription(`You stole ${stolenAmount} coins from ${target.username}!`)
                        .setColor('#FF0000');

                    await fs.writeJson(economyFilePath, economy);
                    await interaction.reply({ embeds: [embed] });
                } else {
                    const fine = Math.floor(economy[interaction.user.id].balance * 0.1);
                    economy[interaction.user.id].balance -= fine;

                    const embed = new EmbedBuilder()
                        .setTitle('👮 Caught!')
                        .setDescription(`You were caught and fined ${fine} coins!`)
                        .setColor('#FF0000');

                    await fs.writeJson(economyFilePath, economy);
                    await interaction.reply({ embeds: [embed] });
                }

            }
            // Add these handlers to your execute function
            else if (subcommand === 'deposit') {
                const amount = interaction.options.getInteger('amount');
                if (amount <= 0) {
                    return interaction.reply({
                        content: 'Amount must be positive!',
                        ephemeral: true
                    });
                }
                if (amount > economy[interaction.user.id].balance) {
                    return interaction.reply({
                        content: 'You don\'t have enough coins!',
                        ephemeral: true
                    });
                }

                economy[interaction.user.id].balance -= amount;
                economy[interaction.user.id].bankBalance += amount;

                const embed = new EmbedBuilder()
                    .setTitle('🏦 Deposit')
                    .setDescription(`Deposited ${amount} coins to bank`)
                    .addFields(
                        { name: 'Wallet', value: economy[interaction.user.id].balance.toString(), inline: true },
                        { name: 'Bank', value: economy[interaction.user.id].bankBalance.toString(), inline: true }
                    )
                    .setColor('#00FF00');

                await interaction.reply({ embeds: [embed] });
            }

            else if (subcommand === 'daily') {
                try {
                    const now = Date.now();
                    const lastDaily = economy[interaction.user.id].lastDaily || 0;
                    const oneDayInMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

                    // Check if 24 hours have passed
                    if (now - lastDaily < oneDayInMs) {
                        const timeLeft = oneDayInMs - (now - lastDaily);
                        const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
                        const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

                        return await interaction.reply({
                            content: `You can claim your daily reward in ${hoursLeft}h ${minutesLeft}m!`,
                            ephemeral: true
                        });
                    }

                    // Check streak
                    const streakBroken = (now - lastDaily) > (2 * oneDayInMs); // Break streak if more than 48h
                    if (streakBroken) {
                        economy[interaction.user.id].streak = 1;
                    } else {
                        economy[interaction.user.id].streak += 1;
                    }

                    // Calculate reward
                    const baseReward = 1000;
                    const streakBonus = Math.min(economy[interaction.user.id].streak * 100, 500);
                    const totalReward = baseReward + streakBonus;

                    // Update user data
                    economy[interaction.user.id].balance += totalReward;
                    economy[interaction.user.id].lastDaily = now;

                    // Save to file
                    await fs.writeJson(economyFilePath, economy);

                    const embed = new EmbedBuilder()
                        .setTitle('📅 Daily Reward')
                        .setDescription(`You received ${totalReward} coins!`)
                        .addFields(
                            { name: 'Streak', value: `${economy[interaction.user.id].streak} days`, inline: true },
                            { name: 'Streak Bonus', value: streakBonus.toString(), inline: true },
                            { name: 'New Balance', value: economy[interaction.user.id].balance.toString(), inline: true }
                        )
                        .setColor('#FFD700')
                        .setFooter({ text: `Come back in 24 hours to maintain your streak!` });

                    await interaction.reply({ embeds: [embed] });

                } catch (error) {
                    logger.error('Error in daily command:', error);
                    await interaction.reply({
                        content: 'An error occurred while processing your daily reward.',
                        ephemeral: true
                    });
                }
            }

            else if (subcommand === 'leaderboard') {
                const users = Object.entries(economy)
                    .map(([id, data]) => ({
                        id,
                        total: data.balance + data.bankBalance
                    }))
                    .sort((a, b) => b.total - a.total)
                    .slice(0, 10);

                const description = await Promise.all(users.map(async (user, index) => {
                    const member = await interaction.guild.members.fetch(user.id);
                    return `${index + 1}. ${member.user.username}: ${user.total} coins`;
                }));

                const embed = new EmbedBuilder()
                    .setTitle('💰 Richest Users')
                    .setDescription(description.join('\n'))
                    .setColor('#FFD700');

                await interaction.reply({ embeds: [embed] });
            }
        } catch (error) {
            logger.error('Error in economy command:', error);
            await interaction.reply({
                content: 'An error occurred while processing the command.',
                ephemeral: true
            });
        }
    }
};