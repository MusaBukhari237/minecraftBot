# Minecraft CLI Bot

A command-line interface Minecraft bot with advanced control features and natural language processing. Developed by Musa Bukhari.

## Features

- Full CLI-based control
- Natural language command processing
- Command system via in-game messages
- Player whitelist system
- Movement and action controls
- Mining and combat capabilities
- Inventory management
- Server management
- Settings persistence

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start the bot:

```bash
npm start
```

## Main Menu

The bot features an interactive CLI menu with the following options:

1. Start Bot

   - Connect to a server
   - Choose bot name
   - Start controlling the bot

2. Manage Servers

   - List saved servers
   - Add new servers
   - Remove servers

3. Settings

   - Change default settings
   - Manage whitelist
   - Configure bot options

4. Exit

## Command System

### Command Access

- Private messages: Anyone can send commands via `/msg BOB101 <command>`
- Public messages: Only whitelisted players can use `*<command>`
- Natural Language: SupremeYT can use natural English commands
- Console: Direct control through CLI

### Basic Commands

```
up <steps>      - Move forward X steps
forward <steps> - Same as up
down <steps>    - Move backward X steps
back <steps>    - Same as down
left <steps>    - Move left X steps
right <steps>   - Move right X steps
jump <count>    - Jump X times
sneak          - Toggle sneaking
```

### Inventory Commands

```
ss <slot>       - Select hotbar slot (1-9)
slot <number>   - Same as ss
equip <item>    - Equip specified item
```

### Combat & Mining

```
kill <player>   - Find and attack specified player
mine <block>    - Find and mine specified block type
```

### Chat Commands

```
say <message>   - Send a chat message
neutral         - Stop all actions and return to neutral state
```

### Admin Commands

```
pw add <player>    - Add player to whitelist
pw remove <player> - Remove player from whitelist
pw list           - List whitelisted players
si <ip>           - Change server IP
bn <name>         - Change bot name
```

### Console Commands

```
help            - Show available commands
exit            - Return to main menu
```

### Navigation Commands

```
goto <x> <y> <z>  - Move to specific coordinates
goto <player>     - Move to a player's location
g                 - Shorthand for goto
follow <player>   - Follow a player (use again to stop)
pos               - Show current position
position          - Same as pos
come              - Bot comes to the command sender
patrol <x1> <y1> <z1> <x2> <y2> <z2> [loops] - Patrol between two points
```

## Natural Language Commands

SupremeYT can control the bot using natural English commands. Here are some examples:

### Movement

```
"go forward 10 blocks"
"move back 5 steps"
"walk left"
"go right 3 blocks"
```

### Combat

```
"attack PlayerName"
"fight that player"
"kill Enemy123"
```

### Mining

```
"mine diamond ore"
"dig some iron ore"
"mine the gold blocks"
```

### Equipment

```
"equip diamond sword"
"hold iron pickaxe"
"use wooden axe"
"select slot 5"
```

### Navigation

```
"goto 100 64 -200"          - Move to coordinates
"go to PlayerName"          - Move to player
"follow PlayerName"         - Follow a player
"where are you"            - Get bot's position
"come here"                - Bot comes to you
"patrol between 0 64 0 and 100 64 100" - Start patrolling
```

The bot will understand variations of these commands and execute the appropriate action.

## Storage System

The bot uses `storage.json` to persist:

- Whitelisted players
- Default settings
- Saved servers

Default storage.json:

```json
{
  "whitelistedPlayers": ["SupremeYT"],
  "settings": {
    "defaultBotName": "BOB101",
    "defaultServerIP": "localhost",
    "commandCooldown": 2000
  },
  "savedServers": []
}
```

## Notes

- Commands have a 2-second cooldown
- New commands override current actions
- The bot will provide feedback for all commands
- Settings are saved automatically
- Use 'neutral' command to stop all actions
- Natural language commands are only available to SupremeYT
- Public commands must start with \* and are only available to whitelisted players

## Error Handling

- Invalid commands return error messages
- Connection issues are reported
- Command errors provide feedback
- Cooldown violations are notified
- Invalid items or blocks are reported

## Security

- Whitelist system for public commands
- Admin commands restricted to SupremeYT
- Natural language processing restricted to SupremeYT
- Command cooldown to prevent spam
- Error handling for all operations

## Advanced Features

### Pathfinding

- Automatic pathfinding to coordinates
- Smart obstacle avoidance
- Player following with dynamic updates
- Patrol system between points

### Following System

- Dynamic player following
- Maintains safe distance
- Automatically stops if player is lost
- Can be toggled on/off

### Patrol System

- Patrol between two points
- Optional loop count
- Automatic path calculation
- Can be stopped with 'neutral' command

## Command Examples

1. Basic Navigation:

```
goto 100 64 -200
g PlayerName
follow Friend123
pos
```

2. Complex Patrolling:

```
patrol 100 64 100 200 64 200 5  # Patrol 5 times
patrol 0 64 0 100 64 100        # Infinite patrol
```

3. Natural Language:

```
"go to coordinates 100 64 -200"
"follow that player"
"where are you right now"
"come to my position"
"patrol between these points"
```
