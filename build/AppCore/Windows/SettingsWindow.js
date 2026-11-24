"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsWindow = void 0;
const electron_1 = require("../../electron-shim.js");
const path_1 = __importDefault(require("path"));
const url_1 = require("url");
class SettingsWindow {
    window;
    constructor(config) {
        const htmlPath = path_1.default.join(electron_1.app.getAppPath(), "build", "Renderer", "Settings", "index.html");
        const pageURL = (0, url_1.pathToFileURL)(htmlPath).href;
        this.window = new electron_1.BrowserWindow({
            width: 840,
            height: 620,
            minWidth: 720,
            minHeight: 480,
            show: false,
            title: "DiscordBotClient — Settings",
            backgroundColor: "#202020",
            autoHideMenuBar: true,
            icon: path_1.default.join(electron_1.app.getAppPath(), "assets", "icon.png"),
            webPreferences: {
                preload: path_1.default.join(__dirname, "..", "Preloads", "SettingsPreload.js"),
                sandbox: true,
                contextIsolation: true,
                nodeIntegration: false,
                webSecurity: true,
                partition: "settings",
            },
        });
        const contents = this.window.webContents;
        const authorize = (event) => {
            if (event.sender !== contents ||
                event.senderFrame !== contents.mainFrame ||
                event.senderFrame.url !== pageURL) {
                throw new Error("Settings request is not authorized.");
            }
        };
        contents.ipc.handle("settings:get", event => {
            authorize(event);
            return config.snapshot();
        });
        contents.ipc.handle("settings:save", (event, value) => {
            authorize(event);
            config.save(value);
            return config.snapshot();
        });
        contents.setWindowOpenHandler(() => ({ action: "deny" }));
        contents.on("will-navigate", event => event.preventDefault());
        contents.on("will-frame-navigate", event => event.preventDefault());
        contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
        contents.session.setPermissionCheckHandler(() => false);
        // React guards unsaved edits; the native dialog covers the titlebar and OS close shortcuts.
        contents.on("will-prevent-unload", event => {
            const choice = electron_1.dialog.showMessageBoxSync(this.window, {
                type: "question",
                title: "Unsaved settings",
                message: "Discard your unsaved settings?",
                buttons: ["Keep editing", "Discard changes"],
                defaultId: 0,
                cancelId: 0,
            });
            if (choice === 1)
                event.preventDefault();
        });
        this.window.once("ready-to-show", () => this.show());
        void this.window.loadFile(htmlPath).catch(() => {
            if (this.window.isDestroyed())
                return;
            electron_1.dialog.showErrorBox("Settings could not open", "The local Settings interface is missing or could not load. Rebuild or reinstall DiscordBotClient.");
            this.window.destroy();
        });
    }
    show() {
        if (this.window.isDestroyed())
            return;
        if (this.window.isMinimized())
            this.window.restore();
        this.window.show();
        this.window.focus();
    }
}
exports.SettingsWindow = SettingsWindow;
//# sourceMappingURL=SettingsWindow.js.map