const mineflayer = require('mineflayer');
const fs = require('fs');
const readline = require('readline');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const pvp = require('mineflayer-pvp').plugin;
const { GoalBlock, GoalNear } = goals;
const chalk = require('chalk');
const { Vec3 } = require('vec3');
const { mineflayer: mineflayerViewer } = require('prismarine-viewer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const collectBlock = require('mineflayer-collectblock').plugin;

// Process event handlers
process.setMaxListeners(20); // Increase max listeners
process.removeAllListeners('uncaughtException');
process.removeAllListeners('unhandledRejection');

process.on('uncaughtException', (error) => {
    console.error(chalk.red('Uncaught Exception:', JSON.stringify({ error: error.message }, null, 2)));
    if (error.code !== 'EADDRINUSE') { // Ignore viewer port in use errors
        sendNotification(`§c* Error: ${JSON.stringify({ error: error.message }, null, 2)}`);
    }
});

process.on('unhandledRejection', (error) => {
    console.error(chalk.red('Unhandled Rejection:', JSON.stringify({ error: error.message }, null, 2)));
    sendNotification(`§c* Error: ${JSON.stringify({ error: error.message }, null, 2)}`);
});

// Initialize readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Bot variables
let bot = null;
let loginAttempted = false;
let currentTask = null;
let isNeutral = false;
let viewerInitialized = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 30000; // 30 seconds between reconnects

// Load storage
let storage = loadStorage();

// Command cooldown system
const cooldowns = new Map();
const COOLDOWN_TIME = storage.settings.commandCooldown || 2000;

// ASCII Art
const ASCII_ART = `
╔═══════════════════════════════════════╗
║     __  __ _            ____       _  ║
║    |  \\/  (_)_ __   ___| __ )  ___| |_║
║    | |\\/| | | '_ \\ / _ \\  _ \\ / _ \\ __║
║    | |  | | | | | |  __/ |_) |  __/ |_║
║    |_|  |_|_|_| |_|\\___|____/ \\___|\\__║
║                                       ║
║           CLI Controller              ║
║         By Musa Bukhari               ║
╚═══════════════════════════════════════╝
`;

// Storage handling functions
function loadStorage() {
    try {
        return JSON.parse(fs.readFileSync('storage.json', 'utf8'));
    } catch (error) {
        const defaultStorage = {
            whitelistedPlayers: ['SupremeYT'],
            settings: {
                defaultBotName: 'BOB101',
                defaultServerIP: 'localhost:60996',
                commandCooldown: 2000
            },
            savedServers: []
        };
        saveStorage(defaultStorage);
        return defaultStorage;
    }
}

function saveStorage(data) {
    fs.writeFileSync('storage.json', JSON.stringify(data, null, 4), 'utf8');
}

// CLI Menu
function showMainMenu() {
    console.clear();
    console.log(chalk.blue(ASCII_ART));

    // Load settings from storage
    storage = loadStorage();
    const serverIP = storage.settings.defaultServerIP;
    const botName = storage.settings.defaultBotName;

    // Start bot automatically
    console.log(chalk.yellow(`Starting bot with saved settings...`));
    startBot(serverIP, botName);
}

function showServerMenu() {
    console.clear();
    console.log(chalk.yellow('Server Management:'));
    console.log(chalk.green('1. List Servers'));
    console.log(chalk.green('2. Add Server'));
    console.log(chalk.green('3. Remove Server'));
    console.log(chalk.green('4. Back to Main Menu'));

    rl.question(chalk.yellow('\nSelect an option: '), (answer) => {
        switch (answer) {
            case '1':
                listServers();
                break;
            case '2':
                addServer();
                break;
            case '3':
                removeServer();
                break;
            case '4':
                showMainMenu();
                break;
            default:
                console.log(chalk.red('Invalid option!'));
                setTimeout(showServerMenu, 1000);
        }
    });
}

function startBotPrompt() {
    console.clear();
    console.log(chalk.yellow('Starting Bot:'));

    rl.question(chalk.green('Enter server IP (or press Enter for default): '), (serverIP) => {
        const ip = serverIP || storage.settings.defaultServerIP;

        rl.question(chalk.green('Enter bot name (or press Enter for default): '), (botName) => {
            const name = botName || storage.settings.defaultBotName;
            startBot(ip, name);
        });
    });
}

function startBot(serverIP, botName) {
    try {
        if (bot) {
            bot.end();
            bot = null;
            viewerInitialized = false; // Reset viewer state
        }

        // Check reconnect attempts
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            console.log(chalk.red(`Maximum reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Waiting ${RECONNECT_DELAY / 1000} seconds before trying again.`));
            reconnectAttempts = 0;
            setTimeout(() => {
                startBot(serverIP, botName);
            }, RECONNECT_DELAY);
            return;
        }

        // Parse server IP and port
        let host = serverIP;
        let port = 25565;

        if (serverIP.includes(':')) {
            const parts = serverIP.split(':');
            host = parts[0];
            port = parseInt(parts[1]);
        }

        console.log(chalk.yellow(`Connecting to ${host}:${port} as ${botName}...`));

        bot = mineflayer.createBot({
            host: host,
            port: port,
            username: botName,
            version: '1.20.4',
            auth: 'offline',
            checkTimeoutInterval: 60000,
            closeTimeout: 240000,
            keepAlive: true,
            chatLengthLimit: 256,
            viewDistance: 'tiny', // Reduce view distance
            defaultChatPatterns: false // Disable default chat patterns
        });

        // Clear previous listeners to prevent memory leaks
        bot.removeAllListeners('error');
        bot.removeAllListeners('end');
        bot.removeAllListeners('kicked');

        // Enhanced error handling for bot
        bot.on('error', (err) => {
            console.error(chalk.red('Bot error:', JSON.stringify({ error: err.message, code: err.code }, null, 2)));
            sendNotification(`§c* Bot error: ${JSON.stringify({ error: err.message }, null, 2)}`);
            reconnectAttempts++;
        });

        bot.on('end', (reason) => {
            console.log(chalk.yellow(`Bot disconnected: ${reason}`));
            viewerInitialized = false; // Reset viewer state
            reconnectAttempts++;
            setTimeout(() => {
                startBot(serverIP, botName);
            }, RECONNECT_DELAY);
        });

        bot.on('kicked', (reason) => {
            console.log(chalk.red('Bot was kicked:', reason));
            viewerInitialized = false; // Reset viewer state
            reconnectAttempts++;
            setTimeout(() => {
                startBot(serverIP, botName);
            }, RECONNECT_DELAY);
        });

        // Reset reconnect attempts on successful spawn
        bot.once('spawn', () => {
            console.log(chalk.green(`Bot spawned! Type commands to control.`));
            reconnectAttempts = 0; // Reset counter on successful connection
            loginAttempted = false; // Reset login state

            try {
                // Load plugins
                bot.loadPlugin(pathfinder);
                bot.loadPlugin(pvp);
                bot.loadPlugin(collectBlock);

                // Initialize pathfinder
                const mcData = require('minecraft-data')(bot.version);
                const movements = new Movements(bot, mcData);
                bot.pathfinder.setMovements(movements);

                // Initialize viewer with first person mode and error handling
                if (!viewerInitialized) {
                    try {
                        mineflayerViewer(bot, {
                            port: 3001,
                            firstPerson: true,
                            viewDistance: 6,
                            version: bot.version
                        });
                        viewerInitialized = true;
                        console.log(chalk.green('POV viewer initialized at http://localhost:3001'));
                    } catch (viewerError) {
                        if (viewerError.code === 'EADDRINUSE') {
                            console.log(chalk.yellow('POV viewer port 3001 is already in use. Viewer not initialized.'));
                            sendNotification('§c* POV viewer failed to initialize: Port 3001 is already in use');
                        } else {
                            console.log(chalk.yellow('POV viewer initialization failed:', viewerError.message));
                            sendNotification(`§c* POV viewer failed to initialize: ${viewerError.message}`);
                        }
                    }
                }
            } catch (error) {
                console.error(chalk.red('Error loading plugins:', error));
                sendNotification(`§c* Error loading plugins: ${error.message}`);
            }
        });

        setupBotHandlers();
        showCommandPrompt();

    } catch (error) {
        console.error(chalk.red('Failed to start bot:', error));
        sendNotification(`§c* Failed to start bot: ${error.message}`);
        reconnectAttempts++;
        setTimeout(() => {
            startBot(serverIP, botName);
        }, RECONNECT_DELAY);
    }
}

function showCommandPrompt() {
    rl.question(chalk.cyan('> '), (command) => {
        if (command.toLowerCase() === 'exit') {
            if (bot) bot.end();
            process.exit();
            return;
        }

        if (command.toLowerCase() === 'help') {
            showHelp();
            showCommandPrompt();
            return;
        }

        handleCommand(command, true, 'CONSOLE');
        showCommandPrompt();
    });
}

function showHelp() {
    console.log(chalk.yellow('\nAvailable Commands:'));
    console.log(chalk.green('Movement:'));
    console.log('  up <steps>      - Move forward X steps');
    console.log('  down <steps>    - Move backward X steps');
    console.log('  left <steps>    - Move left X steps');
    console.log('  right <steps>   - Move right X steps');
    console.log('  jump <count>    - Jump X times');
    console.log('  sneak          - Toggle sneaking');

    console.log(chalk.green('\nCombat & Mining:'));
    console.log('  kill <player>   - Attack specified player');
    console.log('  mine <block>    - Find and mine specified block');

    console.log(chalk.green('\nAdmin Commands:'));
    console.log('  pw add <player>    - Add player to whitelist');
    console.log('  pw remove <player> - Remove player from whitelist');
    console.log('  pw list           - List whitelisted players');
    console.log('  si <ip>           - Change default server IP');
    console.log('  bn <name>         - Change default bot name');

    console.log(chalk.green('\nOther Commands:'));
    console.log('  say <message>   - Send chat message');
    console.log('  neutral        - Stop all actions');
    console.log('  help           - Show this help');
    console.log('  exit           - Return to main menu\n');
}

// Handle bot events
function setupBotHandlers() {
    bot.once('spawn', () => {
        console.log(chalk.green(`Bot spawned! Type commands to control.`));
    });

    bot.on('message', (message, position, jsonMsg) => {
        // Get formatted message with sender name if available
        let formattedMsg = message.toString();
        console.log(chalk.blue(`[CHAT] ${JSON.stringify({ message: formattedMsg }, null, 2)}`));

        // Check for verification messages
        const msg = message.toString().toLowerCase();
        if (msg.includes('verify') || msg.includes('robot') || msg.includes('click the iron')) {
            sendNotification('§e* Robot verification requested');
            // The chest should already be opened, handleRobotCheck will be triggered by windowOpen event
        }

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

        console.log(chalk.yellow(`[CHAT] ${username}: ${message}`)); // Log all chat messages

        // Handle whisper messages in the format "✉ Player -> me: command"
        if (message.includes('-> me:')) {
            const parts = message.split('-> me:');
            if (parts.length === 2) {
                const senderName = parts[0].replace('✉ ', '').trim();
                const command = parts[1].trim();
                console.log(chalk.yellow(`[WHISPER] ${senderName}: ${command}`));
                handleCommand(command, true, senderName);
                return;
            }
        }

        // Handle commands with * prefix for whitelisted players
        if (message.startsWith('*')) {
            console.log(chalk.yellow(`[COMMAND] ${username} issued command: ${message}`));
            if (storage.whitelistedPlayers.includes(username)) {
                const cmd = message.slice(1).trim(); // Remove * and trim
                handleCommand(cmd, false, username);
            } else {
                bot.chat(`/msg ${username} You are not whitelisted to use bot commands.`);
            }
            return;
        }

        // Handle natural language commands from SupremeYT
        if (username === 'SupremeYT' && !message.startsWith('*')) {
            handleNaturalCommand(message, username);
        }
    });

    bot.on('error', (err) => {
        console.error(chalk.red('Bot error:', JSON.stringify({ error: err.message, code: err.code }, null, 2)));
        sendNotification(`§c* Bot error: ${JSON.stringify({ error: err.message }, null, 2)}`);
    });

    bot.on('kicked', (reason) => {
        console.log(chalk.red('Bot was kicked:', reason));
        bot = null;
        setTimeout(showMainMenu, 3000);
    });

    // Add this function for handling robot check
    async function handleRobotCheck() {
        try {
            // Wait for chest window to be ready
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Find iron ingot in the chest
            const window = bot.currentWindow;
            if (!window) {
                console.log(chalk.red('No window open for robot check'));
                return;
            }

            // Look for iron ingot in the chest slots
            const ironIngot = window.slots.find(item =>
                item &&
                item.name &&
                item.name.toLowerCase().includes('iron_ingot')
            );

            if (!ironIngot) {
                console.log(chalk.red('Could not find iron ingot in chest'));
                return;
            }

            // Click the iron ingot
            await bot.clickWindow(ironIngot.slot, 0, 0);
            console.log(chalk.green('Successfully clicked iron ingot for robot verification'));
            sendNotification('§a* Completed robot verification');

        } catch (error) {
            console.error(chalk.red('Error during robot check:', error));
            sendNotification(`§c* Failed robot verification: ${error.message}`);
        }
    }

    // Add window handling to bot setup
    bot.on('windowOpen', (window) => {
        console.log(chalk.yellow(`Window opened: ${window.type}`));
        if (window.type === 'minecraft:generic_9x6' || window.type === 'minecraft:generic_9x3') {
            handleRobotCheck().catch(console.error);
        }
    });
}

// Command handling functions
function handleCommand(message, isPrivate, sender) {
    if (!bot) return;

    console.log(chalk.yellow(`[COMMAND] ${sender} ${isPrivate ? '(private)' : '(public)'}: ${message}`));

    const args = message.split(' ');
    const command = args[0].toLowerCase();

    // Check cooldown for non-console users
    if (sender !== 'CONSOLE') {
        const now = Date.now();
        if (cooldowns.has(sender) && now - cooldowns.get(sender) < COOLDOWN_TIME) {
            sendFeedback(sender, 'Please wait before using another command.');
            return;
        }
        cooldowns.set(sender, now);
    }

    // Stop current task if new command is received
    if (currentTask) {
        clearTimeout(currentTask);
        currentTask = null;
    }

    // Reset to neutral state if requested
    if (command === 'neutral') {
        stopAllActions();
        sendFeedback(sender, 'Stopped all actions and returned to neutral state.');
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
                } else {
                    sendFeedback(sender, 'Usage: mine <block_type>');
                }
                break;

            case 'say':
                const message = args.slice(1).join(' ');
                if (message) {
                    bot.chat(message);
                    sendFeedback(sender, `Message sent: ${message}`);
                }
                break;

            case 'pw':
                if (sender !== 'SupremeYT' && sender !== 'CONSOLE') {
                    sendFeedback(sender, 'Only SupremeYT can manage the whitelist.');
                    return;
                }

                const action = args[1]?.toLowerCase();
                const targetPlayer = args[2];

                switch (action) {
                    case 'add':
                        if (!targetPlayer) {
                            sendFeedback(sender, 'Usage: pw add <player>');
                            return;
                        }
                        if (!storage.whitelistedPlayers.includes(targetPlayer)) {
                            storage.whitelistedPlayers.push(targetPlayer);
                            saveStorage(storage);
                            sendFeedback(sender, `Added ${targetPlayer} to whitelist.`);
                        } else {
                            sendFeedback(sender, `${targetPlayer} is already whitelisted.`);
                        }
                        break;

                    case 'remove':
                        if (!targetPlayer) {
                            sendFeedback(sender, 'Usage: pw remove <player>');
                            return;
                        }
                        if (targetPlayer === 'SupremeYT') {
                            sendFeedback(sender, 'Cannot remove SupremeYT from whitelist.');
                            return;
                        }
                        const index = storage.whitelistedPlayers.indexOf(targetPlayer);
                        if (index > -1) {
                            storage.whitelistedPlayers.splice(index, 1);
                            saveStorage(storage);
                            sendFeedback(sender, `Removed ${targetPlayer} from whitelist.`);
                        } else {
                            sendFeedback(sender, `${targetPlayer} is not whitelisted.`);
                        }
                        break;

                    case 'list':
                        sendFeedback(sender, `Whitelisted players: ${storage.whitelistedPlayers.join(', ')}`);
                        break;

                    default:
                        sendFeedback(sender, 'Usage: pw <add|remove|list> [player]');
                }
                break;

            case 'si':
                if (sender !== 'SupremeYT' && sender !== 'CONSOLE') {
                    sendFeedback(sender, 'Only SupremeYT can change server IP.');
                    return;
                }
                const newIP = args[1];
                if (!newIP) {
                    sendFeedback(sender, 'Usage: si <new-ip>');
                    return;
                }
                storage.settings.defaultServerIP = newIP;
                saveStorage(storage);
                sendFeedback(sender, `Server IP updated to: ${newIP}`);
                break;

            case 'bn':
                if (sender !== 'SupremeYT' && sender !== 'CONSOLE') {
                    sendFeedback(sender, 'Only SupremeYT can change bot name.');
                    return;
                }
                const newName = args[1];
                if (!newName) {
                    sendFeedback(sender, 'Usage: bn <new-name>');
                    return;
                }
                storage.settings.defaultBotName = newName;
                saveStorage(storage);
                sendFeedback(sender, `Bot name updated to: ${newName} (Will take effect on next bot start)`);
                break;

            case 'ss':
            case 'slot':
                const slotNum = parseInt(args[1]);
                if (isNaN(slotNum) || slotNum < 1 || slotNum > 9) {
                    sendFeedback(sender, 'Please specify a valid slot number (1-9)');
                    return;
                }
                bot.setQuickBarSlot(slotNum - 1);
                sendFeedback(sender, `Selected hotbar slot ${slotNum}`);
                break;

            case 'goto':
            case 'g':
                if (args.length < 2) {
                    sendFeedback(sender, 'Usage: goto <x> <y> <z> OR goto <player>');
                    return;
                }
                if (args.length === 2) {
                    // Goto player
                    const playerName = args[1];
                    gotoPlayer(playerName, sender);
                } else {
                    // Goto coordinates
                    const currentPos = bot.entity.position;
                    const x = parseCoordinate(args[1], currentPos.x);
                    const y = parseCoordinate(args[2], currentPos.y);
                    const z = parseCoordinate(args[3], currentPos.z);

                    if (isNaN(x) || isNaN(y) || isNaN(z)) {
                        sendFeedback(sender, 'Invalid coordinates. Use numbers or ~ for relative coordinates.');
                        return;
                    }
                    gotoCoordinates(x, y, z, sender);
                }
                break;

            case 'follow':
                if (args.length < 2) {
                    sendFeedback(sender, 'Usage: follow <player>');
                    return;
                }
                followPlayer(args[1], sender);
                break;

            case 'pos':
            case 'position':
                const pos = bot.entity.position;
                sendFeedback(sender, `Current position: x=${Math.floor(pos.x)}, y=${Math.floor(pos.y)}, z=${Math.floor(pos.z)}`);
                break;

            case 'come':
                if (!bot.players[sender] || !bot.players[sender].entity) {
                    sendFeedback(sender, 'Cannot find your position.');
                    return;
                }
                const playerPos = bot.players[sender].entity.position;
                gotoCoordinates(playerPos.x, playerPos.y, playerPos.z, sender);
                break;

            case 'patrol':
                if (args.length < 7) {
                    sendFeedback(sender, 'Usage: patrol <x1> <y1> <z1> <x2> <y2> <z2> [loops]');
                    return;
                }
                const currentPos = bot.entity.position;
                const points = [
                    {
                        x: parseCoordinate(args[1], currentPos.x),
                        y: parseCoordinate(args[2], currentPos.y),
                        z: parseCoordinate(args[3], currentPos.z)
                    },
                    {
                        x: parseCoordinate(args[4], currentPos.x),
                        y: parseCoordinate(args[5], currentPos.y),
                        z: parseCoordinate(args[6], currentPos.z)
                    }
                ];
                const loops = parseInt(args[7]) || Infinity;
                startPatrol(points, loops, sender);
                break;

            case 'pov':
                capturePOV(sender);
                break;

            case 'notify':
                if (args[1]?.toLowerCase() === 'on') {
                    notificationsEnabled = true;
                    sendFeedback(sender, 'Notifications enabled');
                } else if (args[1]?.toLowerCase() === 'off') {
                    notificationsEnabled = false;
                    sendFeedback(sender, 'Notifications disabled');
                } else {
                    sendFeedback(sender, 'Usage: notify <on|off>');
                }
                break;

            case 'ai':
                if (args.length < 2) {
                    sendFeedback(sender, 'Usage: ai <natural language command>');
                    return;
                }
                const aiCommand = args.slice(1).join(' ');
                processAICommand(aiCommand, sender);
                break;

            case 'stop':
                bot.collectBlock.stop();
                sendFeedback(sender, 'Stopped current mining operation');
                break;

            case 'findblock':
                if (args[1]) {
                    const mcData = require('minecraft-data')(bot.version);
                    const blockType = args[1];
                    const blockID = mcData.blocksByName[blockType];

                    if (!blockID) {
                        sendFeedback(sender, `Unknown block type: ${blockType}`);
                        return;
                    }

                    const block = bot.findBlock({
                        matching: blockID.id,
                        maxDistance: 64,
                        count: 1
                    });

                    if (block) {
                        sendFeedback(sender, `Found ${blockType} at ${block.position.x}, ${block.position.y}, ${block.position.z}`);
                        sendNotification(`§e* Bot found ${blockType} at ${block.position.x}, ${block.position.y}, ${block.position.z}`);
                    } else {
                        sendFeedback(sender, `Could not find ${blockType} within 64 blocks`);
                    }
                } else {
                    sendFeedback(sender, 'Usage: findblock <block_type>');
                }
                break;

            default:
                sendFeedback(sender, 'Unknown command. Type "help" for available commands.');
        }
    } catch (error) {
        sendFeedback(sender, `Error executing command: ${error.message}`);
    }
}

function moveInDirection(direction, steps, sender) {
    if (isNeutral) return;

    sendNotification(`§e* Bot is moving ${direction} for ${steps} steps`);
    bot.setControlState(direction, true);
    sendFeedback(sender, `Moving ${direction} for ${steps} steps`);

    currentTask = setTimeout(() => {
        bot.setControlState(direction, false);
        sendFeedback(sender, `Finished moving ${direction}`);
        sendNotification(`§e* Bot finished moving ${direction}`);
        currentTask = null;
    }, steps * 250);
}

function performJumps(count, sender) {
    if (isNeutral) return;

    let jumps = 0;
    sendFeedback(sender, `Performing ${count} jumps`);

    function jump() {
        if (jumps < count) {
            bot.setControlState('jump', true);
            setTimeout(() => {
                bot.setControlState('jump', false);
                jumps++;
                setTimeout(jump, 250);
            }, 250);
        } else {
            sendFeedback(sender, 'Finished jumping');
        }
    }

    jump();
}

function toggleSneak(sender) {
    if (isNeutral) return;

    const isSneaking = bot.getControlState('sneak');
    bot.setControlState('sneak', !isSneaking);
    sendFeedback(sender, `Sneak ${!isSneaking ? 'enabled' : 'disabled'}`);
}

async function attackPlayer(playerName, sender) {
    if (isNeutral) return;

    const player = bot.players[playerName];
    if (!player || !player.entity) {
        sendFeedback(sender, `Cannot find player ${playerName}`);
        return;
    }

    sendNotification(`§c* Bot is attacking ${playerName}`);
    sendFeedback(sender, `Attacking ${playerName}`);
    await bot.pvp.attack(player.entity);
}

async function mineBlocks(blockType, sender) {
    if (isNeutral) return;

    const mcData = require('minecraft-data')(bot.version);
    const blockID = mcData.blocksByName[blockType];

    if (!blockID) {
        sendFeedback(sender, `Unknown block type: ${blockType}`);
        return;
    }

    try {
        sendNotification(`§e* Bot is searching for ${blockType}`);
        sendFeedback(sender, `Searching for ${blockType}`);

        // Find the nearest block
        const block = bot.findBlock({
            matching: blockID.id,
            maxDistance: 64,
            count: 1
        });

        if (!block) {
            sendFeedback(sender, `Cannot find ${blockType} within 64 blocks`);
            return;
        }

        sendNotification(`§e* Bot found ${blockType} at ${block.position.x}, ${block.position.y}, ${block.position.z}`);

        // Collect the block
        await bot.collectBlock.collect(block);

        sendNotification(`§e* Bot successfully mined ${blockType}`);
        sendFeedback(sender, `Successfully mined ${blockType}`);

    } catch (error) {
        sendFeedback(sender, `Failed to mine ${blockType}: ${error.message}`);
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

    // Stop following
    stopFollowing('CONSOLE');

    // Stop patrolling
    stopPatrol('CONSOLE');

    // Clear any pending tasks
    if (currentTask) {
        clearTimeout(currentTask);
        currentTask = null;
    }

    isNeutral = false;
}

function sendFeedback(sender, message) {
    try {
        if (sender === 'CONSOLE') {
            console.log(chalk.green(`[BOT] ${JSON.stringify({ message }, null, 2)}`));
            if (notificationsEnabled && bot && bot.entity) {
                bot.chat(`§b[Console] ${JSON.stringify({ message }, null, 2)}`);
            }
        } else if (bot && bot.entity) {
            bot.chat(`/msg ${sender} ${message}`);
            console.log(chalk.green(`[BOT -> ${sender}] ${JSON.stringify({ message }, null, 2)}`));
        } else {
            console.log(chalk.yellow(`[QUEUED MESSAGE -> ${sender}] ${JSON.stringify({ message }, null, 2)}`));
        }
    } catch (error) {
        console.error(chalk.red('Error sending feedback:', JSON.stringify({ error: error.message }, null, 2)));
    }
}

// Natural language command processing
function handleNaturalCommand(message, sender) {
    const msg = message.toLowerCase();

    // Movement patterns
    if (msg.includes('go') || msg.includes('move') || msg.includes('walk')) {
        if (msg.includes('forward') || msg.includes('ahead')) {
            const steps = extractNumber(msg) || 5;
            handleCommand(`up ${steps}`, false, sender);
        } else if (msg.includes('back') || msg.includes('backward')) {
            const steps = extractNumber(msg) || 5;
            handleCommand(`down ${steps}`, false, sender);
        } else if (msg.includes('left')) {
            const steps = extractNumber(msg) || 5;
            handleCommand(`left ${steps}`, false, sender);
        } else if (msg.includes('right')) {
            const steps = extractNumber(msg) || 5;
            handleCommand(`right ${steps}`, false, sender);
        }
    }

    // Combat patterns
    else if (msg.includes('attack') || msg.includes('fight') || msg.includes('kill')) {
        const target = extractPlayerName(msg);
        if (target) {
            handleCommand(`kill ${target}`, false, sender);
        }
    }

    // Mining patterns
    else if (msg.includes('mine') || msg.includes('dig')) {
        const block = extractBlockType(msg);
        if (block) {
            handleCommand(`mine ${block}`, false, sender);
        }
    }

    // Equipment/Inventory patterns
    else if (msg.includes('equip') || msg.includes('hold') || msg.includes('use')) {
        const item = extractItemName(msg);
        if (item) {
            equipItem(item, sender);
        }
    }

    // Slot selection
    else if (msg.includes('slot') || msg.includes('select')) {
        const slot = extractNumber(msg);
        if (slot !== null) {
            handleCommand(`ss ${slot}`, false, sender);
        }
    }

    // Goto patterns
    else if (msg.includes('goto') || msg.includes('go to')) {
        const target = extractPlayerName(msg);
        if (target) {
            handleCommand(`goto ${target}`, false, sender);
        } else {
            const coords = extractCoordinates(msg);
            if (coords) {
                handleCommand(`goto ${coords.x} ${coords.y} ${coords.z}`, false, sender);
            }
        }
    }
    else if (msg.includes('follow')) {
        const target = extractPlayerName(msg);
        if (target) {
            handleCommand(`follow ${target}`, false, sender);
        }
    }
    else if (msg.includes('patrol')) {
        const coords = extractAllCoordinates(msg);
        if (coords.length >= 2) {
            const [p1, p2] = coords;
            handleCommand(`patrol ${p1.x} ${p1.y} ${p1.z} ${p2.x} ${p2.y} ${p2.z}`, false, sender);
        }
    }
    else if (msg.includes('position') || msg.includes('where') || msg.includes('coords')) {
        handleCommand('pos', false, sender);
    }
    else if (msg.includes('come') || msg.includes('come here') || msg.includes('come to me')) {
        handleCommand('come', false, sender);
    }
}

// Add these new functions to handle inventory and equipment
function equipItem(itemName, sender) {
    if (!bot.inventory) {
        sendFeedback(sender, 'Inventory not accessible');
        return;
    }

    const items = {
        'sword': /sword$/i,
        'pickaxe': /pickaxe$/i,
        'axe': /^axe$/i,
        'shovel': /shovel$/i,
        'bow': /^bow$/i,
        'shield': /shield$/i,
        // Add more item patterns
    };

    // Find item in inventory
    let item = null;
    if (items[itemName]) {
        item = bot.inventory.items().find(i => i.name.match(items[itemName]));
    } else {
        item = bot.inventory.items().find(i => i.name.includes(itemName));
    }

    if (!item) {
        sendFeedback(sender, `Could not find ${itemName} in inventory`);
        return;
    }

    // Equip the item
    bot.equip(item, 'hand')
        .then(() => sendFeedback(sender, `Equipped ${item.name}`))
        .catch(err => sendFeedback(sender, `Failed to equip ${item.name}: ${err.message}`));
}

// Utility functions for natural language processing
function extractNumber(text) {
    const matches = text.match(/\d+/);
    return matches ? parseInt(matches[0]) : null;
}

function extractPlayerName(text) {
    const words = text.split(' ');
    for (const word of words) {
        if (bot.players[word]) {
            return word;
        }
    }
    return null;
}

function extractBlockType(text) {
    const mcData = require('minecraft-data')(bot.version);
    const blockNames = Object.keys(mcData.blocksByName);

    // Common block name patterns
    const patterns = {
        'diamond ore': 'diamond_ore',
        'iron ore': 'iron_ore',
        'gold ore': 'gold_ore',
        'stone': 'stone',
        'dirt': 'dirt',
        'wood': 'oak_log',
        // Add more patterns
    };

    // Check for exact matches in patterns
    for (const [pattern, blockName] of Object.entries(patterns)) {
        if (text.includes(pattern)) {
            return blockName;
        }
    }

    // Check for block names in the text
    for (const blockName of blockNames) {
        if (text.includes(blockName.replace('_', ' '))) {
            return blockName;
        }
    }

    return null;
}

function extractItemName(text) {
    const mcData = require('minecraft-data')(bot.version);
    const itemNames = Object.keys(mcData.itemsByName);

    // Common item name patterns
    const patterns = {
        'diamond sword': 'diamond_sword',
        'iron sword': 'iron_sword',
        'wooden sword': 'wooden_sword',
        'pickaxe': 'iron_pickaxe',
        'axe': 'iron_axe',
        // Add more patterns
    };

    // Check patterns first
    for (const [pattern, itemName] of Object.entries(patterns)) {
        if (text.includes(pattern)) {
            return itemName;
        }
    }

    // Check for item names in the text
    for (const itemName of itemNames) {
        if (text.includes(itemName.replace('_', ' '))) {
            return itemName;
        }
    }

    return null;
}

// Add these new functions for navigation
async function gotoCoordinates(x, y, z, sender) {
    if (isNeutral) return;

    try {
        sendNotification(`§e* Bot is moving to coordinates: ${x}, ${y}, ${z}`);
        sendFeedback(sender, `Moving to coordinates: ${x}, ${y}, ${z}`);
        await bot.pathfinder.goto(new GoalBlock(x, y, z));
        sendFeedback(sender, 'Reached destination!');
        sendNotification(`§e* Bot reached its destination`);
    } catch (error) {
        sendFeedback(sender, `Failed to reach coordinates: ${error.message}`);
    }
}

async function gotoPlayer(playerName, sender) {
    if (isNeutral) return;

    const player = bot.players[playerName];
    if (!player || !player.entity) {
        sendFeedback(sender, `Cannot find player ${playerName}`);
        return;
    }

    try {
        const pos = player.entity.position;
        sendNotification(`§e* Bot is moving to ${playerName}'s location`);
        sendFeedback(sender, `Moving to ${playerName}'s location`);
        await bot.pathfinder.goto(new GoalNear(pos.x, pos.y, pos.z, 2));
        sendFeedback(sender, `Reached ${playerName}!`);
        sendNotification(`§e* Bot reached ${playerName}`);
    } catch (error) {
        sendFeedback(sender, `Failed to reach ${playerName}: ${error.message}`);
    }
}

let followingPlayer = null;
let followingInterval = null;

function followPlayer(playerName, sender) {
    if (isNeutral) return;

    if (followingPlayer === playerName) {
        stopFollowing(sender);
        return;
    }

    const player = bot.players[playerName];
    if (!player || !player.entity) {
        sendFeedback(sender, `Cannot find player ${playerName}`);
        return;
    }

    followingPlayer = playerName;
    sendNotification(`§e* Bot is now following ${playerName}`);
    sendFeedback(sender, `Now following ${playerName}`);

    if (followingInterval) clearInterval(followingInterval);
    followingInterval = setInterval(async () => {
        if (!bot.players[playerName]?.entity || isNeutral) {
            stopFollowing(sender);
            return;
        }

        const pos = bot.players[playerName].entity.position;
        try {
            await bot.pathfinder.goto(new GoalNear(pos.x, pos.y, pos.z, 2));
        } catch (error) {
            // Ignore pathfinding errors during following
        }
    }, 1000);
}

function stopFollowing(sender) {
    if (followingInterval) {
        clearInterval(followingInterval);
        followingInterval = null;
    }
    if (followingPlayer) {
        sendFeedback(sender, `Stopped following ${followingPlayer}`);
        followingPlayer = null;
    }
}

let patrolling = false;
let patrolInterval = null;

async function startPatrol(points, loops, sender) {
    if (isNeutral) return;
    if (patrolling) {
        stopPatrol(sender);
        return;
    }

    patrolling = true;
    let currentLoop = 0;
    let currentPoint = 0;

    sendFeedback(sender, `Starting patrol between points for ${loops === Infinity ? 'infinite' : loops} loops`);

    async function patrolStep() {
        if (!patrolling || isNeutral || (loops !== Infinity && currentLoop >= loops)) {
            stopPatrol(sender);
            return;
        }

        const point = points[currentPoint];
        try {
            await bot.pathfinder.goto(new GoalBlock(point.x, point.y, point.z));
            currentPoint = (currentPoint + 1) % points.length;
            if (currentPoint === 0) currentLoop++;

            if (patrolling) setTimeout(patrolStep, 1000);
        } catch (error) {
            sendFeedback(sender, `Patrol error: ${error.message}`);
            stopPatrol(sender);
        }
    }

    patrolStep();
}

function stopPatrol(sender) {
    patrolling = false;
    if (patrolInterval) {
        clearInterval(patrolInterval);
        patrolInterval = null;
    }
    sendFeedback(sender, 'Stopped patrolling');
}

// Add these new utility functions
function extractCoordinates(text) {
    // Support for relative coordinates in natural language
    const matches = text.match(/(~-?\d*|~|\d+)\s+(~-?\d*|~|\d+)\s+(~-?\d*|~|\d+)/);
    if (matches) {
        const currentPos = bot.entity.position;
        return {
            x: parseCoordinate(matches[1], currentPos.x),
            y: parseCoordinate(matches[2], currentPos.y),
            z: parseCoordinate(matches[3], currentPos.z)
        };
    }
    return null;
}

function extractAllCoordinates(text) {
    const coords = [];
    const regex = /(~-?\d*|~|\d+)\s+(~-?\d*|~|\d+)\s+(~-?\d*|~|\d+)/g;
    let match;
    const currentPos = bot.entity.position;

    while ((match = regex.exec(text)) !== null) {
        coords.push({
            x: parseCoordinate(match[1], currentPos.x),
            y: parseCoordinate(match[2], currentPos.y),
            z: parseCoordinate(match[3], currentPos.z)
        });
    }

    return coords;
}

// Update coordinate parsing to support relative coordinates
function parseCoordinate(coord, currentValue) {
    if (coord === '~') return Math.floor(currentValue);
    if (coord.startsWith('~')) {
        const offset = parseInt(coord.slice(1)) || 0;
        return Math.floor(currentValue + offset);
    }
    return parseInt(coord);
}

// Add these new functions for POV capture
async function capturePOV(sender) {
    try {
        if (!viewerInitialized) {
            try {
                mineflayerViewer(bot, {
                    port: 3001,
                    firstPerson: true,
                    viewDistance: 6,
                    version: bot.version
                });
                viewerInitialized = true;
                sendFeedback(sender, 'View your POV at http://localhost:3001');
            } catch (viewerError) {
                if (viewerError.code === 'EADDRINUSE') {
                    sendFeedback(sender, 'POV viewer is already running at http://localhost:3001');
                } else {
                    sendFeedback(sender, `Failed to initialize POV viewer: ${viewerError.message}`);
                }
            }
        } else {
            sendFeedback(sender, 'View your POV at http://localhost:3001');
        }
    } catch (error) {
        sendFeedback(sender, `POV viewer error: ${error.message}`);
    }
}

// Add these global variables
let notificationsEnabled = true;
const genAI = new GoogleGenerativeAI("AIzaSyDMu26wN8tIwPJjt2DBPlsIG0JnVwF86pU");

// Add this function for notifications
function sendNotification(message) {
    try {
        if (notificationsEnabled && bot && bot.entity) {
            if (message.includes('§')) {
                bot.chat(message);
                console.log(chalk.cyan(`[NOTIFY] ${JSON.stringify({ message }, null, 2)}`));
            } else {
                bot.chat(`§b${message}`);
                console.log(chalk.cyan(`[NOTIFY] ${JSON.stringify({ message: `§b${message}` }, null, 2)}`));
            }
        }
    } catch (error) {
        console.error(chalk.red('Error sending notification:', JSON.stringify({ error: error.message }, null, 2)));
    }
}

// Add the AI command processing function
async function processAICommand(command, sender) {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

        const understandingPrompt = `Given this Minecraft bot command: "${command}"
        Explain in ONE SHORT LINE how you understand this command and what the bot should do.
        Example input: "find diamonds and mine them"
        Example output: Bot should locate and mine diamond ore blocks.`;

        const understanding = await model.generateContent(understandingPrompt);
        const understood = understanding.response.text().trim();
        console.log(chalk.magenta(`[AI] ${JSON.stringify({ understanding: understood }, null, 2)}`));
        sendNotification(`§d* Understanding: ${JSON.stringify({ command: understood }, null, 2)}`);

        const actionPrompt = `Given this Minecraft bot command: "${command}"
        Convert it into one or more of these available commands:
        - Movement: up/forward, down/back, left, right, jump, sneak
        - Combat: kill <player>
        - Mining: mine <block>
        - Chat: say <message>
        - Navigation: goto <x> <y> <z>, goto <player>, follow <player>, pos/position, come
        - Patrol: patrol <x1> <y1> <z1> <x2> <y2> <z2> [loops]
        - Inventory: ss/slot <1-9>, equip <item>
        
        Return ONLY the commands to execute, one per line.
        Example input: "find diamonds and mine them"
        Example output:
        mine diamond_ore
        
        DO NOT include any explanations, just the commands.`;

        const result = await model.generateContent(actionPrompt);
        const commands = result.response.text().trim().split('\n');

        console.log(chalk.magenta(`[AI] ${JSON.stringify({
            planned_actions: commands,
            count: commands.length
        }, null, 2)}`));

        sendNotification(`§d* Planning to execute: ${JSON.stringify({
            actions: commands,
            count: commands.length
        }, null, 2)}`);

        for (const cmd of commands) {
            if (cmd.trim()) {
                console.log(chalk.magenta(`[AI] ${JSON.stringify({ executing: cmd }, null, 2)}`));
                sendFeedback(sender, `Executing: ${JSON.stringify({ command: cmd }, null, 2)}`);
                handleCommand(cmd.trim(), false, sender);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    } catch (error) {
        console.error(chalk.red('AI error:', JSON.stringify({ error: error.message }, null, 2)));
        sendFeedback(sender, `AI processing error: ${JSON.stringify({ error: error.message }, null, 2)}`);
    }
}

// Start the application
if (require.main === module) {
    console.clear();
    console.log(chalk.blue(ASCII_ART));
    console.log(chalk.green('Starting Minecraft Bot...'));

    // Load settings and start bot
    storage = loadStorage();
    const serverIP = storage.settings.defaultServerIP;
    const botName = storage.settings.defaultBotName;

    // Log startup info
    console.log(chalk.yellow(JSON.stringify({
        event: "startup",
        settings: {
            server: serverIP,
            bot_name: botName,
            whitelisted_players: storage.whitelistedPlayers
        }
    }, null, 2)));

    // Start the bot
    startBot(serverIP, botName);
}

// Export for external use
module.exports = {
    bot,
    storage,
    saveStorage,
    loadStorage
}; 