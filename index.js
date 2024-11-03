require('dotenv').config(); // Add this at the very top
const fs = require('fs-extra');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const schedule = require('node-schedule');
const { setupReminders } = require('./commands/power.js');
const logger = require('./utils/logger.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
client.commands = new Collection();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.data.name, command);
}

const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const event = require(`./events/${file}`);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
}

const scheduleFilePath = path.join(__dirname, 'schedules.json');

client.once('ready', async () => {
    setupReminders(client);

    // Load and reschedule jobs
    const schedules = await fs.readJson(scheduleFilePath).catch(() => []);
    schedules.forEach(({ channelId, message, rule, interval }) => {
        const channel = client.channels.cache.get(channelId);
        if (channel) {
            schedule.scheduleJob(rule, function() {
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
        }
    });
});

client.login(process.env.TOKEN);