"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTrustedAppFrame = isTrustedAppFrame;
exports.isAllowedPopoutURL = isAllowedPopoutURL;
exports.setupIPCEvents = setupIPCEvents;
const v10_1 = require("discord-api-types/v10");
const electron_1 = require("../electron-shim.js");
const DiscordBitField_1 = require("../AppUtils/DiscordBitField/index.js");
const Experiments_1 = require("../AppUtils/Experiments.js");
const ValidateBotToken_1 = require("../AppUtils/ValidateBotToken.js");
const Constants_1 = __importDefault(require("./Constants"));
function isTrustedAppFrame(event, contents) {
    if (!contents || event.sender !== contents || event.senderFrame !== contents.mainFrame)
        return false;
    try {
        return new URL(event.senderFrame.url).origin === `https://${Constants_1.default.CustomDiscordDomain}`;
    }
    catch {
        return false;
    }
}
function isAllowedPopoutURL(url, port) {
    if (url === "about:blank")
        return true;
    try {
        const parsed = new URL(url);
        return (parsed.pathname === "/popout" &&
            [
                "https://discord.com",
                "https://ptb.discord.com",
                "https://canary.discord.com",
                `https://localhost:${port}`,
            ].includes(parsed.origin));
    }
    catch {
        return false;
    }
}
function setupIPCEvents(mainApp) {
    const getWindow = (event, frameName) => {
        if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame)
            return;
        if (isTrustedAppFrame(event, mainApp.discordWebContents)) {
            return frameName ? mainApp.childWindows.get(frameName) : mainApp.appWindow;
        }
        const senderWindow = electron_1.BrowserWindow.fromWebContents(event.sender);
        if (!senderWindow || ![...mainApp.childWindows.values()].includes(senderWindow))
            return;
        if (isAllowedPopoutURL(event.senderFrame.url, mainApp.port))
            return senderWindow;
    };
    mainApp.ipcMain
        .on("app:window:minimize" /* IPCEvent.Minimize */, (event, frameName) => {
        getWindow(event, frameName)?.minimize();
    })
        .on("app:window:maximize" /* IPCEvent.Maximize */, (event, frameName) => {
        const win = getWindow(event, frameName);
        if (!win)
            return;
        if (win.isMaximized()) {
            win.restore();
        }
        else {
            win.maximize();
        }
    })
        .on("app:window:close" /* IPCEvent.Close */, (event, frameName) => {
        const win = getWindow(event, frameName);
        if (!win)
            return;
        if (win === mainApp.appWindow)
            win.hide();
        else
            win.close();
    })
        .on("app:window:focus" /* IPCEvent.Focus */, (event, frameName) => {
        const win = getWindow(event, frameName);
        if (!win)
            return;
        if (win === mainApp.appWindow && !frameName)
            return mainApp.showApp();
        // this.appWindow.focus();
        win.show();
        win.setSkipTaskbar(false);
    })
        .on("app:window:flash_frame" /* IPCEvent.FlashFrame */, (event, flag) => {
        if (!getWindow(event) ||
            !mainApp.appWindow ||
            mainApp.appWindow.isDestroyed() ||
            (flag && mainApp.appWindow.isFocused())) {
            return;
        }
        mainApp.appWindow.flashFrame(flag);
    })
        .on("app:request_close_window" /* IPCEvent.RequestCloseWindow */, event => {
        getWindow(event)?.close();
    });
    mainApp.ipcMain.handle("app:preload:get_bot_info" /* IPCEvent.GetBotInfo */, (event, token) => {
        if (!isTrustedAppFrame(event, mainApp.discordWebContents))
            throw new Error("Unauthorized IPC sender.");
        if (typeof token !== "string" || token.length > 512)
            throw new Error("Invalid bot token.");
        token = token
            .trim()
            .replace(/^Bot\s+/i, "")
            .trim();
        return mainApp.discordSession
            .fetch("https://canary.discord.com/api/v9/applications/@me?with_counts=true", {
            headers: {
                Authorization: `Bot ${token}`,
                "User-Agent": Constants_1.default.UserAgentDiscordBot,
            },
        })
            .then(async (res) => {
            if (!res.ok) {
                const errData = (await res.json().catch(() => null));
                const errorMsg = errData?.message || res.statusText || `HTTP ${res.status}`;
                throw new Error(`Discord API Error [${res.status}]: ${errorMsg}`);
            }
            return res.json();
        })
            .then(data => {
            const applicationFlags = new DiscordBitField_1.ApplicationFlagsBitField(data.flags);
            const skipIntents = new Set([
                v10_1.GatewayIntentBits.GuildPresences,
                v10_1.GatewayIntentBits.GuildMembers,
                v10_1.GatewayIntentBits.MessageContent,
            ]);
            if (applicationFlags.has(v10_1.ApplicationFlags.GatewayPresence) ||
                applicationFlags.has(v10_1.ApplicationFlags.GatewayPresenceLimited)) {
                skipIntents.delete(v10_1.GatewayIntentBits.GuildPresences);
            }
            if (applicationFlags.has(v10_1.ApplicationFlags.GatewayGuildMembers) ||
                applicationFlags.has(v10_1.ApplicationFlags.GatewayGuildMembersLimited)) {
                skipIntents.delete(v10_1.GatewayIntentBits.GuildMembers);
            }
            if (applicationFlags.has(v10_1.ApplicationFlags.GatewayMessageContent) ||
                applicationFlags.has(v10_1.ApplicationFlags.GatewayMessageContentLimited)) {
                skipIntents.delete(v10_1.GatewayIntentBits.MessageContent);
            }
            if (skipIntents.has(v10_1.GatewayIntentBits.MessageContent) &&
                !mainApp.config.config.suppress_intent_warning) {
                electron_1.dialog.showErrorBox("MessageContent is required", "You need to enable the MessageContent intent in the application settings.\nIf you want to permanently suppress this warning, change the application settings (accessible from the tray menu via right-click)");
                throw new Error("MESSAGE_CONTENT is required.");
            }
            (0, ValidateBotToken_1.cacheValidatedBotToken)(data.bot?.id ?? data.id, token);
            return {
                success: true,
                data,
                intents: DiscordBitField_1.IntentsBitField.getIntents(...Array.from(skipIntents)),
                allShards: Math.ceil((data.bot_approximate_guild_count ??
                    // Old field, it reflects the number of guilds that have added this application as an intergration
                    data.approximate_guild_count ??
                    0) / Number(mainApp.config.config.guilds_per_shard)) || 1,
            };
        })
            .catch(e => {
            return {
                success: false,
                message: e.message,
            };
        });
    });
    mainApp.ipcMain.handle("app:request_open_message_editor_window" /* IPCEvent.RequestOpenMessageEditorWindow */, event => {
        if (!isTrustedAppFrame(event, mainApp.discordWebContents))
            throw new Error("Unauthorized IPC sender.");
        return mainApp.openDiscordMessageEditorWindow();
    });
    mainApp.ipcMain
        .on("app:preload:get_version" /* IPCEvent.GetVersion */, event => {
        event.returnValue = isTrustedAppFrame(event, mainApp.discordWebContents) ? electron_1.app.getVersion() : null;
    })
        .on("app:preload:get_name" /* IPCEvent.GetName */, event => {
        event.returnValue = isTrustedAppFrame(event, mainApp.discordWebContents) ? electron_1.app.getName() : null;
    })
        .on("app:preload:get_experiment" /* IPCEvent.GetExperiment */, (event, type, botId, allData) => {
        if (!isTrustedAppFrame(event, mainApp.discordWebContents)) {
            event.returnValue = null;
        }
        else if (type === "user") {
            event.returnValue = (0, Experiments_1.UserExperiment)(allData, botId);
        }
        else if (type === "guild") {
            event.returnValue = (0, Experiments_1.GuildExperiment)();
        }
        else if (type === "apex") {
            event.returnValue = (0, Experiments_1.ApexExperiment)(botId);
        }
        else {
            event.returnValue = null;
        }
    })
        .on("app:preload:get_default_user_patch" /* IPCEvent.GetDefaultUserPatch */, event => {
        event.returnValue = isTrustedAppFrame(event, mainApp.discordWebContents)
            ? Constants_1.default.UserDefaultPatch
            : null;
    });
}
//# sourceMappingURL=IPCManager.js.map