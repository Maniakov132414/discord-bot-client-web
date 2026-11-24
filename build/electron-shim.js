"use strict";
/* Copyright Elysia © 2025. All rights reserved */
/**
 * Web Compatibility Polyfill for Electron APIs (net, app, nativeImage)
 * Allows DiscordBotClient's 80+ APIServer routes and utilities to run directly in Node.js without Electron.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.net = exports.dialog = exports.nativeImage = exports.app = void 0;
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const url_1 = require("url");
const APP_ROOT = path_1.default.resolve(__dirname, "..");
const WRITABLE_BASE = process.env.VERCEL ? path_1.default.join(os_1.default.tmpdir(), "dbc-userdata") : path_1.default.join(APP_ROOT, ".userdata");
const pkgPath = path_1.default.resolve(APP_ROOT, "package.json");
let appVersion = "3.10.7";
let appName = "DiscordBotClient";
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require(pkgPath);
    appVersion = pkg.version || appVersion;
    appName = pkg.productName || pkg.name || appName;
}
catch {
    // fallback defaults
}
exports.app = {
    getAppPath: () => APP_ROOT,
    getPath: (name) => path_1.default.resolve(WRITABLE_BASE, name),
    getVersion: () => appVersion,
    getName: () => appName,
    isReady: () => true,
    isPackaged: false,
};
exports.nativeImage = {
    createFromPath: (_p) => ({
        resize: (_opts) => ({}),
    }),
};
exports.dialog = {
    showErrorBox: (title, content) => {
        console.warn(`[Dialog ErrorBox] ${title}: ${content}`);
    },
};
exports.net = {
    fetch: (input, init) => {
        return globalThis.fetch(input, init);
    },
    request: (options) => {
        const parsedUrl = new url_1.URL(options.url);
        const isHttps = parsedUrl.protocol === "https:";
        const transport = isHttps ? https_1.default : http_1.default;
        const headers = {};
        let reqInstance = null;
        const responseListeners = [];
        const errorListeners = [];
        const bodyChunks = [];
        let ended = false;
        const ensureRequest = () => {
            if (reqInstance)
                return reqInstance;
            reqInstance = transport.request(parsedUrl, {
                method: options.method || "GET",
                headers,
            }, (nodeRes) => {
                const wrappedRes = Object.assign(nodeRes, {
                    statusCode: nodeRes.statusCode || 200,
                    headers: nodeRes.headers,
                });
                responseListeners.forEach((cb) => cb(wrappedRes));
            });
            reqInstance.on("error", (err) => {
                errorListeners.forEach((cb) => cb(err));
            });
            return reqInstance;
        };
        const wrapper = {
            chunkedEncoding: false,
            setHeader(key, value) {
                headers[key] = value;
            },
            on(event, listener) {
                if (event === "response") {
                    responseListeners.push(listener);
                }
                else if (event === "error") {
                    errorListeners.push(listener);
                }
                return wrapper;
            },
            write(chunk) {
                const r = ensureRequest();
                return r.write(chunk);
            },
            end(chunk) {
                if (ended)
                    return;
                ended = true;
                const r = ensureRequest();
                if (bodyChunks.length > 0) {
                    for (const c of bodyChunks)
                        r.write(c);
                }
                if (chunk)
                    r.end(chunk);
                else
                    r.end();
            },
            // Support req.pipe(electronReq) from Express
            once(event, listener) {
                const r = ensureRequest();
                r.once(event, listener);
                return wrapper;
            },
            emit(event, ...args) {
                const r = ensureRequest();
                return r.emit(event, ...args);
            },
            removeListener(event, listener) {
                const r = ensureRequest();
                r.removeListener(event, listener);
                return wrapper;
            },
            writable: true,
        };
        return wrapper;
    },
};
//# sourceMappingURL=electron-shim.js.map