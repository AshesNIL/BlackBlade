const { WebhookClient } = require('discord.js');

const webhookClient = new WebhookClient({ 
    id: process.env.LOGWEBHOOKID, 
    token: process.env.LOGWEBHOOKTOKEN 
});

function log(type, message, ...args) {
    // Console logging
    console.log(message, ...args);

    // Format for Discord
    const formattedMessage = `[${type}] ${message} ${args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ')}`;

    // Send to Discord
    webhookClient.send({
        content: `\`\`\`\n${formattedMessage}\n\`\`\``,
        username: 'System Logger'
    }).catch(err => console.error('Failed to send log:', err));
}

module.exports = {
    info: (...args) => log('INFO', ...args),
    warn: (...args) => log('WARN', ...args),
    error: (...args) => log('ERROR', ...args)
};