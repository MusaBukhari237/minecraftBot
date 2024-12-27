const mineflayer = require('mineflayer');
const readline = require('readline-sync');
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const { mineflayer: mineflayerViewer } = require('prismarine-viewer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const pvp = require('mineflayer-pvp').plugin;
const { GoalBlock, GoalNear } = goals;

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
let currentTask = null;
let isNeutral = false;

// Command cooldown system
const cooldowns = new Map();
const COOLDOWN_TIME = 2000; // 2 seconds cooldown

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

            // Load plugins
            bot.loadPlugin(pathfinder);
            bot.loadPlugin(pvp);

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

                // Initialize pathfinder
                const mcData = require('minecraft-data')(bot.version);
                const movements = new Movements(bot, mcData);
                bot.pathfinder.setMovements(movements);
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

function handleCommand(message, isPrivate, sender) {
    if (!bot) return;

    // Check if command is from authorized user in public chat
    if (!isPrivate && sender !== 'SupremeYT') return;
    if (!isPrivate && !message.startsWith('*')) return;

    // Remove * prefix if public message
    const cmd = isPrivate ? message : message.slice(1);
    const args = cmd.split(' ');
    const command = args[0].toLowerCase();

    // Check cooldown
    const now = Date.now();
    if (cooldowns.has(sender) && now - cooldowns.get(sender) < COOLDOWN_TIME) {
        bot.whisper(sender, 'Please wait before using another command.');
        return;
    }
    cooldowns.set(sender, now);

    // Stop current task if new command is received
    if (currentTask) {
        clearTimeout(currentTask);
        currentTask = null;
    }

    // Reset to neutral state if requested
    if (command === 'neutral') {
        stopAllActions();
        bot.whisper(sender, 'Stopped all actions and returned to neutral state.');
        return;
    }

    try {
        switch (command) {
            case 'up':
            case 'forward':
                const steps = parseInt(args[1]) || 1;
                moveInDirection('forward', steps, sender);
                break;

            case 'down':
            case 'back':
                const backSteps = parseInt(args[1]) || 1;
                moveInDirection('back', backSteps, sender);
                break;

            case 'left':
                const leftSteps = parseInt(args[1]) || 1;
                moveInDirection('left', leftSteps, sender);
                break;

            case 'right':
                const rightSteps = parseInt(args[1]) || 1;
                moveInDirection('right', rightSteps, sender);
                break;

            case 'jump':
                const jumps = parseInt(args[1]) || 1;
                performJumps(jumps, sender);
                break;

            case 'sneak':
                toggleSneak(sender);
                break;

            case 'kill':
                if (args[1]) {
                    attackPlayer(args[1], sender);
                }
                break;

            case 'mine':
                if (args[1]) {
                    mineBlocks(args[1], sender);
                }
                break;

            case 'say':
                const message = args.slice(1).join(' ');
                if (message) {
                    bot.chat(message);
                }
                break;

            default:
                bot.whisper(sender, 'Unknown command. Available commands: up, down, left, right, jump, sneak, kill, mine, say, neutral');
        }
    } catch (error) {
        bot.whisper(sender, `Error executing command: ${error.message}`);
    }
}

function moveInDirection(direction, steps, sender) {
    if (isNeutral) return;

    bot.setControlState(direction, true);
    bot.whisper(sender, `Moving ${direction} for ${steps} steps`);

    currentTask = setTimeout(() => {
        bot.setControlState(direction, false);
        bot.whisper(sender, `Finished moving ${direction}`);
        currentTask = null;
    }, steps * 250); // 250ms per step
}

function performJumps(count, sender) {
    if (isNeutral) return;

    let jumps = 0;
    bot.whisper(sender, `Performing ${count} jumps`);

    function jump() {
        if (jumps < count) {
            bot.setControlState('jump', true);
            setTimeout(() => {
                bot.setControlState('jump', false);
                jumps++;
                setTimeout(jump, 250);
            }, 250);
        } else {
            bot.whisper(sender, 'Finished jumping');
        }
    }

    jump();
}

function toggleSneak(sender) {
    if (isNeutral) return;

    const isSneaking = bot.getControlState('sneak');
    bot.setControlState('sneak', !isSneaking);
    bot.whisper(sender, `Sneak ${!isSneaking ? 'enabled' : 'disabled'}`);
}

async function attackPlayer(playerName, sender) {
    if (isNeutral) return;

    const player = bot.players[playerName];
    if (!player || !player.entity) {
        bot.whisper(sender, `Cannot find player ${playerName}`);
        return;
    }

    bot.whisper(sender, `Attacking ${playerName}`);
    await bot.pvp.attack(player.entity);
}

async function mineBlocks(blockType, sender) {
    if (isNeutral) return;

    const mcData = require('minecraft-data')(bot.version);
    const blockID = mcData.blocksByName[blockType];

    if (!blockID) {
        bot.whisper(sender, `Unknown block type: ${blockType}`);
        return;
    }

    const block = bot.findBlock({
        matching: blockID.id,
        maxDistance: 32
    });

    if (!block) {
        bot.whisper(sender, `Cannot find ${blockType} nearby`);
        return;
    }

    try {
        bot.whisper(sender, `Mining ${blockType}`);
        await bot.pathfinder.goto(new GoalBlock(block.position.x, block.position.y, block.position.z));
        await bot.dig(block);
        bot.whisper(sender, `Finished mining ${blockType}`);
    } catch (error) {
        bot.whisper(sender, `Failed to mine ${blockType}: ${error.message}`);
    }
}

function stopAllActions() {
    if (!bot) return;

    isNeutral = true;

    // Stop all movements
    bot.setControlState('forward', false);
    bot.setControlState('back', false);
    bot.setControlState('left', false);
    bot.setControlState('right', false);
    bot.setControlState('jump', false);
    bot.setControlState('sneak', false);

    // Stop pathfinder if active
    if (bot.pathfinder.isMoving()) {
        bot.pathfinder.stop();
    }

    // Stop PVP if active
    if (bot.pvp.target) {
        bot.pvp.stop();
    }

    // Clear any pending tasks
    if (currentTask) {
        clearTimeout(currentTask);
        currentTask = null;
    }

    isNeutral = false;
}

function setupBotHandlers(bot, socket) {
    // Handle chat messages with command processing
    bot.on('message', (message) => {
        const msg = message.toString().toLowerCase();
        console.log('\x1b[36m%s\x1b[0m', message.toString());
        io.emit('message', message.toString());

        // Handle login/register based on server messages
        if (!loginAttempted) {
            if (msg.includes('register') || msg.includes('login') || msg.includes('password')) {
                bot.chat('/register bukhari@musa@ bukhari@musa@');
                setTimeout(() => {
                    bot.chat('/login bukhari@musa@');
                }, 2000);
                loginAttempted = true;
            }
        }
    });

    // Handle whisper messages (private messages)
    bot.on('whisper', (username, message) => {
        handleCommand(message, true, username);
    });

    // Handle public chat messages
    bot.on('chat', (username, message) => {
        if (username === bot.username) return; // Ignore bot's own messages
        handleCommand(message, false, username);
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