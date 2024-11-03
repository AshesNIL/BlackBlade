const logger = require('../utils/logger');

module.exports = {
    name: 'guildMemberAdd',
    async execute(member) {
        logger.info('guildMemberAdd event triggered');

        const welcomeMessages = [
            `🎉 Welcome to the server, ${member}! We're thrilled to have you here! 🎉`,
            `👋 Hey ${member}, welcome aboard! Feel free to introduce yourself!`,
            `✨ A wild ${member} appeared! Welcome to our community! ✨`,
            `🎊 Hooray! ${member} just joined the party! 🎊`,
            `🚀 Welcome, ${member}! Fasten your seatbelt and enjoy the ride! 🚀`
        ];

        const welcomeMessage = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
        logger.info(`Selected welcome message: ${welcomeMessage}`);

        const channel = member.guild.channels.cache.find(ch => ch.id === '1295090150178553988');
        if (channel) {
            logger.info(`Found channel: ${channel.name}`);
            channel.send(welcomeMessage);
        } else {
            logger.error('Welcome channel not found');
        }

        // Define array of role IDs to assign
        const roleIds = [
            '1302392750649638943', // First role
            '1295090149671305296',      // Replace with actual role IDs
            '1302393183795286077',
            '1302413300264337549',
            '1302437814570586182'
        ];

        // Assign multiple roles
        for (const roleId of roleIds) {
            const role = member.guild.roles.cache.find(role => role.id === roleId);
            if (role) {
                try {
                    await member.roles.add(role);
                    logger.info(`Assigned role: ${role.name} to member: ${member.user.tag}`);
                } catch (error) {
                    logger.error(`Failed to assign role ${role.name}:`, error);
                }
            } else {
                logger.warn(`Role not found: ${roleId}`);
            }
        }
    },
};