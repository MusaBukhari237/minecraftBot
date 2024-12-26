const mineflayer = require('mineflayer');
const readline = require('readline-sync');
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const { mineflayer: mineflayerViewer } = require('prismarine-viewer');

// Create express app and socket.io server
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Serve static files
app.use(express.static('public'));

// Bot variables
let bot = null;
let loginAttempted = false;
let viewerStarted = false;

// Start express server
const WEB_PORT = 3000;
const VIEWER_PORT = 3001;

server.listen(WEB_PORT, () => {
    console.log(`Web interface running at http://localhost:${WEB_PORT}`);
});

// Handle socket.io connections
io.on('connection', (socket) => {
    console.log('Web client connected');

    // Handle bot start
    socket.on('start', async (settings) => {
        try {
            if (bot) {
                bot.end();
                bot = null;
                viewerStarted = false;
            }

            if (!settings.serverIP) {
                throw new Error('Server IP is required');
            }

            // Create new bot
            bot = mineflayer.createBot({
                host: settings.serverIP,
                username: settings.botName || 'BOB101',
                version: '1.20.4',
                port: 25565,
                auth: 'offline'
            });

            // Reset login attempt flag
            loginAttempted = false;

            // Set up bot event handlers
            setupBotHandlers(bot, socket);

            // Start viewer when bot spawns
            bot.once('spawn', () => {
                console.log(`Bot ${bot.username} spawned!`);
                io.emit('message', `Bot ${bot.username} spawned!`);

                if (!viewerStarted) {
                    try {
                        mineflayerViewer(bot, { port: VIEWER_PORT, firstPerson: true });
                        viewerStarted = true;
                        console.log(`3D Viewer running at http://localhost:${VIEWER_PORT}`);
                    } catch (e) {
                        console.error('Failed to start viewer:', e);
                        io.emit('message', 'Warning: Failed to start 3D viewer');
                    }
                }
            });

        } catch (error) {
            console.error('Failed to start bot:', error);
            io.emit('message', 'Error: ' + error.message);
            if (bot) {
                bot.end();
                bot = null;
            }
        }
    });

    // Handle movement controls
    socket.on('control', (data) => {
        if (!bot) return;
        try {
            bot.setControlState(data.action, data.state);
        } catch (error) {
            console.error('Control error:', error);
        }
    });

    // Handle look controls
    socket.on('look', (data) => {
        if (!bot || !bot.entity) return;
        try {
            bot.look(bot.entity.yaw + data.yaw, bot.entity.pitch + data.pitch, true);
        } catch (error) {
            console.error('Look error:', error);
        }
    });

    // Handle hotbar selection
    socket.on('hotbar', (slot) => {
        if (!bot) return;
        try {
            bot.setQuickBarSlot(slot);
        } catch (error) {
            console.error('Hotbar error:', error);
        }
    });

    // Handle chat messages
    socket.on('chat', (message) => {
        if (!bot) return;
        try {
            bot.chat(message);
        } catch (error) {
            console.error('Chat error:', error);
        }
    });

    // Handle bot exit
    socket.on('exit', () => {
        if (bot) {
            bot.end();
            bot = null;
            viewerStarted = false;
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('Web client disconnected');
    });
});

function setupBotHandlers(bot, socket) {
    // Handle chat messages
    bot.on('message', (message) => {
        const msg = message.toString().toLowerCase();
        console.log('\x1b[36m%s\x1b[0m', message.toString());
        io.emit('message', message.toString());

        // Handle login/register based on server messages
        if (!loginAttempted) {
            if (msg.includes('register') || msg.includes('login') || msg.includes('password')) {
                // Try registration first
                bot.chat('/register bukhari@musa@ bukhari@musa@');
                setTimeout(() => {
                    // If already registered, try login
                    bot.chat('/login bukhari@musa@');
                }, 2000);
                loginAttempted = true;
            }
        }
    });

    // Handle errors
    bot.on('error', (err) => {
        console.error('Bot error:', err);
        io.emit('message', 'Bot error: ' + err.message);
    });

    // Handle kicks
    bot.on('kicked', (reason) => {
        console.log('Bot was kicked:', reason);
        io.emit('message', 'Bot was kicked: ' + reason);
        bot = null;
        viewerStarted = false;
    });

    // Handle health updates
    bot.on('health', () => {
        io.emit('health', {
            health: bot.health,
            food: bot.food,
            saturation: bot.foodSaturation
        });
    });

    // Handle inventory updates
    bot.on('inventoryChanged', () => {
        if (!bot.inventory) return;
        const inventory = {
            hotbar: bot.inventory.slots.slice(36, 45),
            main: bot.inventory.slots.slice(9, 36)
        };
        io.emit('inventory', inventory);
    });

    // Handle game events
    bot.on('death', () => {
        io.emit('message', 'Bot died!');
    });

    bot.on('respawn', () => {
        io.emit('message', 'Bot respawned!');
    });

    // Handle rain
    bot.on('rain', () => {
        io.emit('message', 'It started raining!');
    });

    // Handle experience updates
    bot.on('experience', () => {
        io.emit('experience', {
            level: bot.experience.level,
            points: bot.experience.points,
            progress: bot.experience.progress
        });
    });
} 