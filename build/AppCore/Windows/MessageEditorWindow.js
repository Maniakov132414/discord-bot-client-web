"use strict";
/* Copyright Elysia © 2026. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageEditorWindow = void 0;
const crypto_1 = require("crypto");
const electron_1 = require("../../electron-shim.js");
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
const url_1 = require("url");
const Constants_1 = __importDefault(require("../Constants"));
const scheme = "dbc-editor";
const editorURL = `${scheme}://app/`;
// Register all application schemes together before app.ready; Electron accepts this call only once.
electron_1.protocol.registerSchemesAsPrivileged([
    {
        scheme,
        privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
    },
]);
class MessageEditorWindow {
    window;
    constructor(parent, recipient) {
        const editorSession = electron_1.session.fromPartition(`editor:${(0, crypto_1.randomUUID)()}`);
        editorSession.protocol.handle(scheme, async (request) => {
            if (request.method !== "GET")
                return new Response(null, { status: 405 });
            try {
                const url = new URL(request.url);
                if (url.host !== "app" || url.username || url.password)
                    return new Response(null, { status: 403 });
                const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
                if (/[\\:\0]/.test(pathname))
                    return new Response(null, { status: 403 });
                const directory = await (0, promises_1.realpath)(Constants_1.default.EditorHTMLFolderPath);
                const filename = await (0, promises_1.realpath)(path_1.default.resolve(directory, `.${pathname}`));
                const relative = path_1.default.relative(directory, filename);
                // Check canonical paths too, so symlinks cannot expose files outside the editor bundle.
                if (!relative ||
                    relative === ".." ||
                    relative.startsWith(`..${path_1.default.sep}`) ||
                    path_1.default.isAbsolute(relative)) {
                    return new Response(null, { status: 403 });
                }
                return await electron_1.net.fetch((0, url_1.pathToFileURL)(filename).href);
            }
            catch {
                return new Response(null, { status: 404 });
            }
        });
        this.window = new electron_1.BrowserWindow({
            width: 1080,
            height: 720,
            minWidth: 800,
            minHeight: 600,
            parent,
            modal: true,
            show: false,
            icon: Constants_1.default.icon128,
            title: "DiscordBotClient — Message Editor",
            autoHideMenuBar: true,
            webPreferences: {
                session: editorSession,
                preload: path_1.default.join(__dirname, "..", "Preloads", "MessageEditorPreload.js"),
                sandbox: true,
                contextIsolation: true,
                nodeIntegration: false,
                webSecurity: true,
            },
        });
        const contents = this.window.webContents;
        const isOwner = (event) => event.sender === contents &&
            event.senderFrame === contents.mainFrame &&
            event.senderFrame.url === editorURL;
        const ready = (event) => {
            if (!isOwner(event) || recipient.isDestroyed())
                return;
            contents.ipc.removeListener("app:message_editor_ready" /* IPCEvent.MessageEditorReactReady */, ready);
            const { port1, port2 } = new electron_1.MessageChannelMain();
            contents.postMessage("app:message_editor_receive_port" /* IPCEvent.MessageEditorReceivePort */, null, [port2]);
            recipient.postMessage("app:main_receive_editor_port" /* IPCEvent.MainAppReceiveEditorPort */, null, [port1]);
        };
        contents.ipc.on("app:message_editor_ready" /* IPCEvent.MessageEditorReactReady */, ready);
        contents.ipc.on("app:message_editor_close" /* IPCEvent.MessageEditorClose */, event => {
            if (isOwner(event))
                this.window.close();
        });
        contents.setWindowOpenHandler(() => ({ action: "deny" }));
        contents.on("will-navigate", event => event.preventDefault());
        contents.on("will-frame-navigate", event => event.preventDefault());
        this.window.on("closed", () => editorSession.protocol.unhandle(scheme));
        this.window.once("ready-to-show", () => this.window.show());
        void this.window.loadURL(editorURL).catch(() => {
            if (this.window.isDestroyed())
                return;
            electron_1.dialog.showErrorBox("Message Editor could not open", "The editor files are missing or could not load. Rebuild or reinstall DiscordBotClient.");
            this.window.destroy();
        });
    }
}
exports.MessageEditorWindow = MessageEditorWindow;
//# sourceMappingURL=MessageEditorWindow.js.map