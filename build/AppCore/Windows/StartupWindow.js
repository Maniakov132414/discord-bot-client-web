"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StartupWindow = void 0;
const electron_1 = require("../../electron-shim.js");
const path_1 = __importDefault(require("path"));
const Settings_1 = require("../../shared/Settings.js");
class StartupWindow {
    window;
    state = { phase: "starting" };
    timer;
    animationDone = false;
    revealApplication;
    animationWait;
    constructor(retry, quit, mode = Settings_1.defaultSettings.startup_animation) {
        const classic = mode === "classic";
        this.animationDone = classic;
        const area = electron_1.screen.getPrimaryDisplay().workAreaSize;
        this.window = new electron_1.BrowserWindow({
            width: classic ? 300 : Math.max(940, Math.floor(area.width * 0.9)),
            height: classic ? 350 : Math.max(500, Math.floor(area.height * 0.9)),
            resizable: false,
            maximizable: false,
            frame: false,
            show: false,
            transparent: !classic,
            hasShadow: classic,
            backgroundColor: classic ? "#282b30" : "#00000000",
            title: "DiscordBotClient",
            autoHideMenuBar: true,
            webPreferences: {
                preload: path_1.default.join(__dirname, "..", "Preloads", "StartupPreload.js"),
                contextIsolation: true,
                sandbox: true,
                nodeIntegration: false,
                partition: "startup",
                backgroundThrottling: classic,
            },
        });
        const contents = this.window.webContents;
        const isOwner = (event) => event.sender === contents && event.senderFrame === contents.mainFrame;
        contents.ipc.handle("startup:get-state", event => (isOwner(event) ? this.state : undefined));
        contents.ipc.on("startup:retry", event => {
            if (isOwner(event) && this.state.phase === "error")
                retry();
        });
        contents.ipc.on("startup:quit", event => {
            if (isOwner(event))
                quit();
        });
        contents.ipc.handle("startup:artwork-credit", event => {
            if (isOwner(event))
                return electron_1.shell.openExternal("https://www.mihoyo.com/");
        });
        contents.ipc.on("startup:animation-finished", event => {
            if (!isOwner(event))
                return;
            this.animationDone = true;
            this.settleAnimation(true);
        });
        contents.ipc.on("startup:reveal", event => {
            if (!isOwner(event) || this.state.phase !== "ready")
                return;
            const reveal = this.revealApplication;
            this.revealApplication = undefined;
            reveal?.();
        });
        contents.setWindowOpenHandler(() => ({ action: "deny" }));
        contents.on("will-navigate", event => event.preventDefault());
        this.window.on("close", quit);
        this.window.on("closed", () => {
            clearTimeout(this.timer);
            this.settleAnimation(false);
        });
        this.window.once("ready-to-show", () => this.show());
        void this.window
            .loadFile(path_1.default.join(electron_1.app.getAppPath(), "assets", "startup", classic ? "classic.html" : "index.html"))
            .catch(() => {
            if (this.window.isDestroyed())
                return;
            electron_1.dialog.showErrorBox("Startup failed", "The startup screen could not be loaded. Please reinstall DiscordBotClient.");
            quit();
        });
    }
    show() {
        if (!this.window.isDestroyed())
            this.window.show();
    }
    loading() {
        this.update({ phase: "loading" });
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.fail("DBC is taking too long to start. Check your connection and try again."), 45000);
    }
    fail(message) {
        clearTimeout(this.timer);
        this.settleAnimation(false);
        this.update({ phase: "error", message });
        this.show();
    }
    update(state) {
        this.state = state;
        if (!this.window.isDestroyed())
            this.window.webContents.send("startup:state", state);
    }
    waitForAnimation(reveal) {
        if (this.window.isDestroyed() || this.state.phase === "error")
            return Promise.resolve(false);
        clearTimeout(this.timer);
        this.revealApplication = reveal;
        this.update({ phase: "ready" });
        if (this.animationDone)
            return Promise.resolve(true);
        return new Promise(resolve => {
            // Decorative renderer failures must not trap a successfully loaded application.
            this.animationWait = { resolve, timer: setTimeout(() => this.settleAnimation(true), 15000) };
        });
    }
    settleAnimation(completed) {
        const pending = this.animationWait;
        this.animationWait = undefined;
        this.revealApplication = undefined;
        if (!pending)
            return;
        clearTimeout(pending.timer);
        pending.resolve(completed);
    }
    finish() {
        clearTimeout(this.timer);
        this.settleAnimation(false);
        if (!this.window.isDestroyed())
            this.window.destroy();
    }
}
exports.StartupWindow = StartupWindow;
//# sourceMappingURL=StartupWindow.js.map