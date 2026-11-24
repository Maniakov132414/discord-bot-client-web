"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscordBotClient = void 0;
const electron_1 = require("../electron-shim.js");
const electron_context_menu_1 = __importDefault(require("electron-context-menu"));
const electron_log_1 = require("electron-log");
const electron_updater_1 = require("electron-updater");
const events_1 = __importDefault(require("events"));
const path_1 = __importDefault(require("path"));
const APIServer_1 = __importStar(require("./APIServer"));
const Config_1 = __importDefault(require("./Config"));
const Constants_1 = __importDefault(require("./Constants"));
const IPCManager_1 = require("./IPCManager");
const MessageEditorWindow_1 = require("./Windows/MessageEditorWindow");
const SettingsWindow_1 = require("./Windows/SettingsWindow");
const StartupWindow_1 = require("./Windows/StartupWindow");
class DiscordBotClient extends events_1.default {
    logger = (0, electron_log_1.scope)(Constants_1.default.AppName);
    #shouldQuitApp = false;
    startupWindow;
    appWindow;
    // Discord currently lives in the app window; callers must target its contents explicitly.
    discordWebContents;
    tray;
    port;
    customDiscordSession;
    childWindows = new Map();
    settingsWindow;
    config = Config_1.default;
    ipcMain = electron_1.ipcMain;
    constructor() {
        super();
        this.logger.log("App starting...");
        void this.initApp().catch(error => this.startupFailed(error));
    }
    initTray(menu) {
        if (!this.tray) {
            this.tray = new electron_1.Tray(Constants_1.default.icon16);
        }
        this.tray.setToolTip(`${Constants_1.default.AppName} v${electron_1.app.getVersion()}`);
        this.tray.on("click", () => {
            this.showApp();
        });
        this.tray.setContextMenu(menu);
    }
    setupTray() {
        const menu = electron_1.Menu.buildFromTemplate([
            {
                label: `${Constants_1.default.AppName} v${electron_1.app.getVersion()}`,
                icon: Constants_1.default.icon16,
                enabled: false,
            },
            {
                type: "separator",
            },
            {
                label: "Check for Updates...",
                type: "normal",
                click: () => {
                    this.checkingForUpdates(true);
                },
            },
            {
                label: "Github Repository",
                type: "normal",
                click: () => electron_1.shell.openExternal(`https://github.com/${Constants_1.default.GithubRepo}`),
            },
            {
                type: "separator",
            },
            {
                label: "Reload",
                click: () => {
                    this.discordWebContents.reload();
                },
            },
            {
                label: "Relaunch",
                click: () => this.relaunch(),
            },
            {
                label: "Settings",
                click: () => {
                    this.openSettingsWindow();
                },
            },
            {
                label: "Delete all application data and relaunch",
                click: async () => {
                    const result = await electron_1.dialog.showMessageBox(this.appWindow, {
                        type: "warning",
                        buttons: ["Cancel", "Delete and Relaunch"],
                        defaultId: 0,
                        cancelId: 0,
                        title: "Confirm Data Deletion",
                        message: "Are you sure you want to delete all application data?",
                        detail: "The following data will be permanently deleted:\n" +
                            "\n• Discord HTTP request cache" +
                            "\n• Data stored in session cache (cleared by clearCache)" +
                            "\n• Data stored in browser storage (cleared by clearStorageData)" +
                            "\n• Local databases: PrivateChannel, UserSetting, Frequency" +
                            "\n\nAll saved settings and cached data will be lost. This action cannot be undone.",
                    });
                    if (result.response === 1) {
                        try {
                            await this.discordSession.clearCache();
                            await this.discordSession.flushStorageData();
                            await this.discordSession.clearStorageData({
                                storages: [
                                    "cookies",
                                    "filesystem",
                                    "indexdb",
                                    "localstorage",
                                    "shadercache",
                                    "serviceworkers",
                                    "cachestorage",
                                ],
                            });
                            this.relaunch();
                        }
                        catch (err) {
                            console.error("Failed to clear app data:", err);
                        }
                    }
                    else {
                        console.log("User canceled data deletion.");
                    }
                },
            },
            {
                label: "Toggle DevTools",
                click: () => {
                    this.discordWebContents.toggleDevTools();
                },
            },
            {
                type: "separator",
            },
            {
                label: "Quit",
                click: () => this.quit(),
            },
        ]);
        this.initTray(menu);
    }
    async initApp() {
        this.port = await (0, APIServer_1.default)();
        electron_1.app.setAppUserModelId(Constants_1.default.AppID);
        const enabledFeatures = new Set(electron_1.app.commandLine.getSwitchValue("enable-features").split(","));
        const disabledFeatures = new Set(electron_1.app.commandLine.getSwitchValue("disable-features").split(","));
        electron_1.app.commandLine.appendSwitch("host-rules", `MAP ${Constants_1.default.CustomDiscordDomain} 127.0.0.1:${this.port}`);
        // Vesktop
        // Disable renderer backgrounding to prevent the app from unloading when in the background
        // https://github.com/electron/electron/issues/2822
        // https://github.com/GoogleChrome/chrome-launcher/blob/5a27dd574d47a75fec0fb50f7b774ebf8a9791ba/docs/chrome-flags-for-tools.md#task-throttling
        electron_1.app.commandLine.appendSwitch("disable-renderer-backgrounding");
        electron_1.app.commandLine.appendSwitch("disable-background-timer-throttling");
        electron_1.app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
        // Keep direct connections by default; opt in to the OS proxy after restart.
        if (!this.config.config.use_system_proxy)
            electron_1.app.commandLine.appendSwitch("no-proxy-server");
        // Enable & Disable Chromium Features
        Constants_1.default.enableFeatures.forEach(feature => {
            enabledFeatures.add(feature);
        });
        Constants_1.default.disableFeatures.forEach(feature => {
            disabledFeatures.add(feature);
        });
        const enabledFeaturesArray = Array.from(enabledFeatures).filter(Boolean);
        const disabledFeaturesArray = Array.from(disabledFeatures).filter(Boolean);
        if (enabledFeaturesArray.length) {
            electron_1.app.commandLine.appendSwitch("enable-features", enabledFeaturesArray.join(","));
            this.logger.log("Enabled Chromium features:", enabledFeaturesArray.join(", "));
        }
        if (disabledFeaturesArray.length) {
            electron_1.app.commandLine.appendSwitch("disable-features", disabledFeaturesArray.join(","));
            this.logger.log("Disabled Chromium features:", disabledFeaturesArray.join(", "));
        }
        // App Event
        electron_1.app.on("window-all-closed", () => {
            if (process.platform !== "darwin")
                this.quit();
        });
        electron_1.app.on("before-quit", event => {
            // MacOS: Set flag to really quit app
            this.#shouldQuitApp = true;
            this.logger.info("App closing...");
            this.logger.info("=".repeat(50));
        });
        electron_1.app.on("second-instance", (event, commandLine, workingDirectory, additionalData) => {
            this.showApp();
        });
        // Patch UserAgent (Switch Plan B SDP > Unified Plan)
        electron_1.app.userAgentFallback = electron_1.app.userAgentFallback.replace(/Electron\/[\d.]+/, "");
        // Handle second instance
        const gotTheLock = electron_1.app.requestSingleInstanceLock();
        if (!gotTheLock) {
            this.logger.debug("Second Instance detected. Quit app...");
            this.#shouldQuitApp = true;
            electron_1.app.quit();
        }
        else {
            void electron_1.app
                .whenReady()
                .then(async () => {
                this.startupWindow = new StartupWindow_1.StartupWindow(() => this.relaunch(), () => this.quit(), this.config.config.startup_animation);
                this.logger.info("Creating session...");
                this.customDiscordSession = electron_1.session.fromPartition("persist:elysia_dbc");
                this.customDiscordSession.setCertificateVerifyProc(({ hostname, certificate }, callback) => {
                    // Never load the real remote site into DBC if a system proxy bypasses host-rules.
                    if (hostname === Constants_1.default.CustomDiscordDomain) {
                        return callback((0, APIServer_1.isLocalServerCertificate)(certificate.data) ? 0 : -2);
                    }
                    if (hostname === "localhost" && (0, APIServer_1.isLocalServerCertificate)(certificate.data))
                        return callback(0);
                    callback(-3);
                });
                const dnsProvider = this.config.config.doh_provider;
                const dohServers = {
                    cloudflare: "https://cloudflare-dns.com/dns-query",
                    google: "https://dns.google/dns-query",
                    quad9: "https://dns.quad9.net/dns-query",
                };
                const dohServer = dohServers[dnsProvider];
                electron_1.app.configureHostResolver({
                    enableBuiltInResolver: dnsProvider !== "off",
                    secureDnsMode: dnsProvider === "off" ? "off" : "automatic",
                    enableHappyEyeballs: true,
                    ...(dohServer ? { secureDnsServers: [dohServer] } : {}),
                });
                if (this.config.config.auto_check_updates)
                    void this.checkingForUpdates(false);
                await this.createWindow();
                electron_1.app.on("activate", () => {
                    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
                        void this.createWindow().catch(error => this.startupFailed(error));
                    }
                    else {
                        this.showApp();
                    }
                });
            })
                .catch(error => this.startupFailed(error));
        }
        // Create context menu
        (0, electron_context_menu_1.default)({
            showLearnSpelling: false,
            showSearchWithGoogle: false,
            showCopyImageAddress: true,
            showInspectElement: true,
            showSaveImage: true,
            showSaveImageAs: true,
            showSaveVideo: true,
            showSaveVideoAs: true,
        });
        (0, IPCManager_1.setupIPCEvents)(this);
    }
    get discordSession() {
        if (this.customDiscordSession) {
            return this.customDiscordSession;
        }
        else {
            return electron_1.session.defaultSession;
        }
    }
    async sessionPatch() {
        // Disable stripe.com
        this.discordSession.webRequest.onBeforeRequest({
            urls: ["https://*.stripe.com/*"],
        }, (details, callback) => {
            // Cancel all requests to stripe.com
            callback({
                cancel: true,
            });
        });
        /*
        // Rule 1: Remove all CSP headers
        this.discordSession.webRequest.onHeadersReceived(
            { urls: ["<all_urls>"], types: ["mainFrame", "subFrame"] },
            (details, callback) => {
                if (!details.responseHeaders) {
                    return callback({ responseHeaders: details.responseHeaders });
                }
                // Remove both CSP and CSP-report-only
                delete details.responseHeaders["content-security-policy"];
                delete details.responseHeaders["Content-Security-Policy"];
                delete details.responseHeaders["content-security-policy-report-only"];
                delete details.responseHeaders["Content-Security-Policy-Report-Only"];
                callback({ responseHeaders: details.responseHeaders });
            },
        );
        */
        // Rule 2: Force CSS content-type on GitHub raw URLs
        this.discordSession.webRequest.onHeadersReceived({
            urls: ["https://raw.githubusercontent.com/*"],
            types: ["stylesheet"],
        }, (details, callback) => {
            if (!details.responseHeaders) {
                return callback({ responseHeaders: details.responseHeaders });
            }
            const url = new URL(details.url);
            if (url.pathname.endsWith(".css")) {
                // Override Content-Type
                details.responseHeaders["content-type"] = ["text/css"];
            }
            callback({ responseHeaders: details.responseHeaders });
        });
        // Load Vencord-Web Extension
        const extension = await this.discordSession.extensions.loadExtension(Constants_1.default.VencordExtensionPath);
        this.logger.info(`Loaded Vencord Extension v${extension.version} from ${Constants_1.default.VencordExtensionPath}`);
    }
    async createWindow() {
        this.setupTray();
        const primaryDisplay = electron_1.screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.workAreaSize;
        // Create the browser window.
        this.appWindow = new electron_1.BrowserWindow({
            show: false,
            width: Math.floor(width * 0.9),
            height: Math.floor(height * 0.9),
            minWidth: 940,
            minHeight: 500,
            icon: Constants_1.default.icon128,
            webPreferences: {
                webSecurity: true,
                sandbox: true,
                contextIsolation: true,
                nodeIntegration: false,
                preload: path_1.default.join(__dirname, "Preloads", "ElectronPreload.js"),
                session: this.discordSession,
            },
            backgroundColor: "#36393f",
            titleBarStyle: "hidden",
            frame: false,
            title: Constants_1.default.AppName,
            trafficLightPosition: { x: 10, y: 10 },
        });
        this.discordWebContents = this.appWindow.webContents;
        // BrowserWindow Event
        this.appWindow.on("close", event => {
            if (!this.#shouldQuitApp) {
                event.preventDefault();
                this.appWindow.hide();
            }
        });
        this.appWindow.on("focus", () => {
            this.appWindow.flashFrame(false);
        });
        this.startupWindow?.loading();
        const contents = this.discordWebContents;
        contents.on("did-fail-load", (_event, code, _description, _url, isMainFrame) => {
            if (isMainFrame && code !== -3 && this.startupWindow) {
                this.startupWindow.fail("Could not load DBC. Check your connection and try again.");
            }
        });
        contents.on("render-process-gone", () => {
            if (this.startupWindow)
                this.startupWindow.fail("DBC stopped while starting. Please try again.");
        });
        await this.sessionPatch();
        this.logger.info(`Electron UserData: ${electron_1.app.getPath("userData")}`);
        const mainOrigin = new URL(`https://${Constants_1.default.CustomDiscordDomain}`).origin;
        const isMainOrigin = (url) => {
            try {
                return new URL(url).origin === mainOrigin;
            }
            catch {
                return false;
            }
        };
        const allowedPermissions = ["fullscreen", "clipboard-sanitized-write", "loopback-network"];
        this.discordSession.setPermissionRequestHandler((requester, permission, callback, details) => {
            if (!("requestingUrl" in details) || !isMainOrigin(details.requestingUrl)) {
                return callback(false);
            }
            if (permission === "notifications") {
                return callback(true);
            }
            if (requester !== contents || !details.isMainFrame) {
                return callback(false);
            }
            if (allowedPermissions.includes(permission)) {
                return callback(true);
            }
            if (permission !== "media" ||
                !("mediaTypes" in details) ||
                !details.mediaTypes?.includes("audio") ||
                details.mediaTypes.includes("video")) {
                return callback(false);
            }
            if (process.platform === "darwin") {
                void electron_1.systemPreferences.askForMediaAccess("microphone").then(callback, () => callback(false));
            }
            else {
                callback(true);
            }
        });
        this.discordSession.setPermissionCheckHandler((requester, permission, origin, details) => {
            if (!isMainOrigin(origin))
                return false;
            if (permission === "notifications")
                return true;
            if (requester !== contents || !details.isMainFrame)
                return false;
            if (allowedPermissions.includes(permission)) {
                return true;
            }
            if (permission === "media") {
                if (details.mediaType !== "audio")
                    return false;
                if (process.platform === "darwin") {
                    const status = electron_1.systemPreferences.getMediaAccessStatus("microphone");
                    return status !== "denied" && status !== "restricted";
                }
                return true;
            }
            return false;
        });
        contents.on("will-navigate", (event, url) => {
            if (!isMainOrigin(url))
                event.preventDefault();
        });
        // Discord popout
        this.discordWebContents.setWindowOpenHandler(({ url }) => {
            this.logger.log("WindowOpenHandler", url);
            switch (url) {
                case "about:blank":
                    return {
                        action: "allow",
                        overrideBrowserWindowOptions: {
                            icon: Constants_1.default.icon128,
                            frame: true,
                            autoHideMenuBar: true,
                            width: 1080,
                            height: 720,
                            webPreferences: {
                                webSecurity: true,
                                sandbox: true,
                                contextIsolation: true,
                                nodeIntegration: false,
                            },
                        },
                    };
                case "https://discord.com/popout":
                case "https://ptb.discord.com/popout":
                case "https://canary.discord.com/popout":
                case `https://localhost:${this.port}/popout`:
                    return {
                        action: "allow",
                        overrideBrowserWindowOptions: {
                            icon: Constants_1.default.icon128,
                            frame: true,
                            autoHideMenuBar: true,
                            width: 1080,
                            height: 720,
                            // titleBarStyle: "hidden",
                            webPreferences: {
                                webSecurity: true,
                                sandbox: true,
                                contextIsolation: true,
                                nodeIntegration: false,
                            },
                        },
                    };
            }
            if ([
                "https://checkout.paypal.com/web",
                "https://discord.com/connections",
                "https://ptb.discord.com/connections",
                "https://canary.discord.com/connections",
                `https://localhost:${this.port}/connections`,
            ].some(e => url.includes(e))) {
                return { action: "deny" };
            }
            let protocolHandle;
            try {
                protocolHandle = new URL(url).protocol;
            }
            catch {
                return { action: "deny" };
            }
            switch (protocolHandle) {
                case "http:":
                case "https:":
                case "mailto:":
                case "steam:":
                case "spotify:":
                    electron_1.shell.openExternal(url);
            }
            return { action: "deny" };
        });
        // WebContents Event
        this.discordWebContents
            .on("did-create-window", (window, details) => {
            window.show();
            window.webContents.on("will-navigate", (event, url) => {
                if (!(0, IPCManager_1.isAllowedPopoutURL)(url, this.port))
                    event.preventDefault();
            });
            window.on("closed", () => {
                this.childWindows.delete(details.frameName);
            });
            this.childWindows.get(details.frameName)?.close();
            this.childWindows.set(details.frameName, window);
        })
            .on("did-start-loading", () => {
            this.appWindow.setProgressBar(2, { mode: "indeterminate" });
        })
            .on("did-stop-loading", () => {
            this.appWindow.setTitle(Constants_1.default.AppName);
            this.appWindow.setProgressBar(-1);
        });
        // Like Vesktop, only a successful navigation promise completes startup.
        await contents.loadURL(`https://${Constants_1.default.CustomDiscordDomain}`);
        if (this.#shouldQuitApp || contents.isDestroyed())
            return;
        if (this.startupWindow &&
            !(await this.startupWindow.waitForAnimation(() => {
                if (!this.#shouldQuitApp && !contents.isDestroyed())
                    this.appWindow.showInactive();
            }))) {
            return;
        }
        if (this.#shouldQuitApp || contents.isDestroyed())
            return;
        this.appWindow.show();
        this.startupWindow?.finish();
        this.startupWindow = undefined;
        if (!electron_1.app.isPackaged)
            contents.openDevTools();
    }
    showApp() {
        if (this.startupWindow) {
            this.startupWindow.show();
        }
        else if (this.appWindow && !this.appWindow.isDestroyed()) {
            this.appWindow.show();
            this.appWindow.setSkipTaskbar(false);
        }
    }
    async startupFailed(error) {
        if (this.#shouldQuitApp)
            return;
        this.logger.error("Startup failed", error);
        await electron_1.app.whenReady();
        this.startupWindow ??= new StartupWindow_1.StartupWindow(() => this.relaunch(), () => this.quit(), this.config.config.startup_animation);
        this.startupWindow.fail("Unable to start DiscordBotClient. Please try again.");
    }
    showNotification(options, callback) {
        const notif = new electron_1.Notification(options);
        function handleClick() {
            notif.close();
            if (callback && typeof callback === "function")
                callback();
        }
        if (callback && typeof callback === "function")
            notif.once("click", handleClick);
        setTimeout(() => {
            notif.close();
            notif.removeListener("click", handleClick);
        }, 15000).unref();
        notif.show();
    }
    checkingForUpdates(forceEmitted = false) {
        if (!electron_1.app.isPackaged) {
            // autoUpdater.forceDevUpdateConfig = true; // ! Test
            if (forceEmitted) {
                this.showNotification({
                    title: "Update Manager",
                    body: "Auto-updates are disabled in development mode.",
                    silent: false,
                });
            }
            return Promise.resolve(false);
        }
        electron_updater_1.autoUpdater.logger = (0, electron_log_1.scope)("AutoUpdater");
        electron_updater_1.autoUpdater.disableWebInstaller = true;
        // Auto download only on Windows and Linux
        // Mac requires code signing for auto-update to work properly
        electron_updater_1.autoUpdater.autoDownload = process.platform !== "darwin";
        electron_updater_1.autoUpdater.removeAllListeners();
        return new Promise(resolve => {
            electron_updater_1.autoUpdater.on("update-available", info => {
                const releaseUrl = `https://github.com/${Constants_1.default.GithubRepo}/releases/tag/v${info.version}`;
                if (process.platform === "darwin") {
                    this.showNotification({
                        title: `New version available: ${info.version}`,
                        body: "Please download the new version manually (MacOS)",
                        silent: false,
                    }, () => {
                        electron_1.shell.openExternal(releaseUrl);
                    });
                    resolve(true);
                    return;
                }
                this.showNotification({
                    title: "Update Manager",
                    body: `A new version (${info.version}) is available and is being downloaded in the background.`,
                    silent: false,
                }, () => {
                    electron_1.shell.openExternal(releaseUrl);
                });
            });
            electron_updater_1.autoUpdater.on("update-not-available", info => {
                if (forceEmitted) {
                    this.showNotification({
                        title: "Update Manager",
                        body: `You are using the latest version (v${electron_1.app.getVersion()})`,
                        silent: false,
                    });
                }
                resolve(true);
            });
            electron_updater_1.autoUpdater.on("error", err => {
                // Only log error, show notification if forced
                this.logger.error("Error in auto-updater: " + err);
                if (forceEmitted) {
                    this.showNotification({
                        title: "Update Manager",
                        body: `Error checking for updates: ${err.message}`,
                        silent: false,
                    }, () => {
                        electron_1.shell.openExternal(`https://github.com/${Constants_1.default.GithubRepo}/releases`);
                    });
                }
                resolve(false);
            });
            electron_updater_1.autoUpdater.on("download-progress", progressObj => {
                const percent = Math.round(progressObj.percent);
                this.logger.debug(`Downloaded ${percent}%`);
                if (this.tray && !this.tray.isDestroyed()) {
                    this.tray.setToolTip(`${Constants_1.default.AppName} v${electron_1.app.getVersion()} - Downloading: ${percent}%`);
                }
            });
            electron_updater_1.autoUpdater.on("update-downloaded", info => {
                if (this.tray && !this.tray.isDestroyed()) {
                    this.tray.setToolTip(`${Constants_1.default.AppName} v${electron_1.app.getVersion()}`);
                }
                electron_1.dialog
                    .showMessageBox(this.appWindow, {
                    type: "info",
                    title: "Update Ready",
                    message: `Version ${info.version} has been downloaded. Restart the application to apply the updates?`,
                    buttons: ["Restart", "Later"],
                })
                    .then(returnValue => {
                    if (returnValue.response === 0)
                        electron_updater_1.autoUpdater.quitAndInstall(true, true);
                });
                resolve(true);
            });
            electron_updater_1.autoUpdater.checkForUpdates();
        });
    }
    relaunch() {
        this.#shouldQuitApp = true;
        electron_1.app.relaunch();
        electron_1.app.quit();
    }
    quit() {
        this.#shouldQuitApp = true;
        electron_1.app.quit();
    }
    openSettingsWindow() {
        if (this.settingsWindow && !this.settingsWindow.window.isDestroyed()) {
            this.settingsWindow.show();
            return;
        }
        this.settingsWindow = new SettingsWindow_1.SettingsWindow(this.config);
        this.settingsWindow.window.on("closed", () => {
            this.settingsWindow = undefined;
        });
    }
    openDiscordMessageEditorWindow() {
        new MessageEditorWindow_1.MessageEditorWindow(this.appWindow, this.discordWebContents);
    }
    get app() {
        return electron_1.app;
    }
}
exports.DiscordBotClient = DiscordBotClient;
//# sourceMappingURL=index.js.map