# 🤖 Minecraft CLI Bot (BOB101)

A command-line interface Minecraft bot that you can control with your keyboard. Perfect for testing, automation, or just having fun!

## ✨ Features

- 🎮 Full keyboard control
- 💬 In-game chat support
- 🏃‍♂️ Smooth movement controls
- 🔄 Easy to set up and use

## 🚀 Quick Start

1. Make sure you have [Node.js](https://nodejs.org/) installed (version 14 or higher)
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the bot:
   ```bash
   npm start
   ```
4. Enter the server IP and bot name when prompted

## 🎮 Controls

| Key   | Action                                    |
| ----- | ----------------------------------------- |
| ↑     | Move forward                              |
| ↓     | Move backward                             |
| ←     | Move left                                 |
| →     | Move right                                |
| SHIFT | Jump                                      |
| CTRL  | Toggle sneak                              |
| T     | Open chat (Enter to send, Empty to close) |
| /     | Open inventory                            |
| E     | Exit bot                                  |

## 💬 Chat System

1. Press `T` to open the chat
2. Type your message
3. Press `Enter` to send
4. If you want to cancel, press `Enter` with an empty message

## 🔧 Technical Details

- Built with [Mineflayer](https://github.com/PrismarineJS/mineflayer)
- Supports Minecraft version 1.20.4
- Keyboard input handled through `keypress` module
- Clean CLI interface

## ⚠️ Requirements

- Node.js (14 or higher)
- Minecraft server (1.20.4)
- Network connection to the target server

## 📝 License

ISC License
