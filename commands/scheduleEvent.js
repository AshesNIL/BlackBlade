const { SlashCommandBuilder } = require('@discordjs/builders');
const schedule = require('node-schedule');
const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');

const scheduleFilePath = path.join(__dirname, 'schedules.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('scheduleevent')
        .setDescription('Schedules a recurring warning message')
        .addStringOption(option => 
            option.setName('channel')
                .setDescription('The channel ID to send the message to')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('message')
                .setDescription('The warning message to send')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('hour')
                .setDescription('The hour of the day to send the message (0-23)')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('minute')
                .setDescription('The minute of the hour to send the message (0-59)')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('interval')
                .setDescription('The interval in days to send the message')
                .setRequired(true)),
    async execute(interaction) {
        const channelId = interaction.options.getString('channel');
        const message = interaction.options.getString('message');
        const hour = interaction.options.getInteger('hour');
        const minute = interaction.options.getInteger('minute');
        const interval = interaction.options.getInteger('interval');
        const channel = interaction.guild.channels.cache.get(channelId);

        // Check if the user has the required permissions
        if (!interaction.member.permissions.has('MANAGE_GUILD')) {
            return interaction.reply({ content: 'You do not have permission to create polls.', ephemeral: true });
        }
        
        if (!channel) {
            return interaction.reply({ content: 'Channel not found!', ephemeral: true });
        }

        const rule = new schedule.RecurrenceRule();
        rule.hour = hour;
        rule.minute = minute;
        rule.second = 0;
        rule.tz = 'Etc/UTC'; // Optional: Set the timezone to UTC

        // Schedule the job to run every day at the specified time
        const job = schedule.scheduleJob(rule, function() {
            const now = new Date();
            const startDate = new Date('2024-11-2'); // Set a start date
            const diffTime = Math.abs(now - startDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            logger.info(`Current Date: ${now}`);
            logger.info(`Start Date: ${startDate}`);
            logger.info(`Difference in Days: ${diffDays}`);
            logger.info(`Should send message: ${diffDays % interval === 0}`);

            if (diffDays % interval === 0) {
                channel.send(message);
                logger.info(`Message sent to channel ${channelId}`);
            } else {
                logger.warn(`Message not sent, waiting for the next interval.`);
            }
        });

        // Save the schedule to a file
        const schedules = await fs.readJson(scheduleFilePath).catch(() => []);
        schedules.push({ channelId, message, rule, interval });
        await fs.writeJson(scheduleFilePath, schedules);

        await interaction.reply({ content: `Scheduled a recurring warning message every ${interval} days at ${hour}:${minute} UTC`, ephemeral: true });
    },
};