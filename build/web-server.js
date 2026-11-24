"use strict";
/* Copyright Elysia © 2025. All rights reserved */
/**
 * DiscordBotClient Standalone Web & iOS PWA Server
 * Runs 100% of DiscordBotClient's APIServer routes, Vencord + VencordDBCPlugin,
 * Discohook Editor, and Discord Web Snapshot directly in any browser / iOS Safari PWA.
 */
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
const v10_1 = require("discord-api-types/v10");
const express_1 = __importDefault(require("express"));
const fs_1 = __importStar(require("fs"));
const morgan_1 = __importDefault(require("morgan"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const Config_1 = __importDefault(require("./AppCore/Config.js"));
const Constants_1 = __importDefault(require("./AppCore/Constants.js"));
const DiscordBitField_1 = require("./AppUtils/DiscordBitField/index.js");
const RegisterRoutes_1 = require("./AppUtils/RegisterRoutes.js");
const Utils_1 = __importDefault(require("./AppUtils/Utils.js"));
const ValidateBotToken_1 = require("./AppUtils/ValidateBotToken.js");
BigInt.prototype.toJSON = function () {
    return this.toString();
};
const app = (0, express_1.default)();
if (Constants_1.default.VerboseAPIServerLogging) {
    app.use((0, morgan_1.default)("dev"));
}
// Preload experiments & default user patch for synchronous client bootstrap
const guildExperiments = JSON.parse((0, fs_1.readFileSync)(Constants_1.default.DiscordGuildExperimentsPath, "utf8"));
const userExperiments = JSON.parse((0, fs_1.readFileSync)(Constants_1.default.DiscordUserExperimentsPath, "utf8"));
const apexExperiments = JSON.parse((0, fs_1.readFileSync)(Constants_1.default.DiscordApexExperimentsPath, "utf8"));
const bootPayloadScript = `window.__DBC_BOOT__ = ${JSON.stringify({
    version: "3.10.7",
    name: Constants_1.default.AppName,
    defaultUserPatch: Constants_1.default.UserDefaultPatch,
    guildExperiments,
    userExperiments,
    apexExperiments,
})};`;
const APP_ROOT = path_1.default.resolve(__dirname, "..");
// Serve Vencord Extension bundle, Discohook Editor, and PWA Static Assets (Disable caching on Vencord & dbc-assets so updates apply immediately)
app.use("/vencord-ext", express_1.default.static(Constants_1.default.VencordExtensionPath, {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    },
}));
app.use("/dbc-editor", express_1.default.static(Constants_1.default.EditorHTMLFolderPath));
app.use("/dbc-assets", express_1.default.static(path_1.default.resolve(APP_ROOT, "assets"), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    },
}));
app.get("/manifest.json", (_req, res) => {
    res.sendFile(path_1.default.resolve(APP_ROOT, "assets", "pwa-manifest.json"));
});
app.get("/download-deploy-zip", (_req, res) => {
    const zipPath = path_1.default.resolve(APP_ROOT, "..", "DiscordBotClient-Web-Deploy.zip");
    if (fs_1.default.existsSync(zipPath)) {
        res.download(zipPath, "DiscordBotClient-Web-Deploy.zip");
    }
    else {
        res.status(404).send("ZIP file is still being generated, please refresh in a few seconds.");
    }
});
// Passive Service Worker to clean up any previously cached sw.js on localhost:3080 without forcing page reloads
app.get("/sw.js", (_req, res) => {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.send(`
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
  );
});
`);
});
// Web Bridge endpoint replacing ipcMain.handle(IPCEvent.GetBotInfo) from IPCManager.ts
app.post("/dbc-bridge/get-bot-info", express_1.default.json(), async (req, res) => {
    try {
        let token = req.body?.token;
        // On Vercel (@vercel/node), req.body may already be a string or Buffer if not parsed by express.json()
        if (!token && typeof req.body === "string") {
            try {
                token = JSON.parse(req.body)?.token;
            }
            catch {
                // ignore
            }
        }
        else if (!token && Buffer.isBuffer(req.body)) {
            try {
                token = JSON.parse(req.body.toString("utf8"))?.token;
            }
            catch {
                // ignore
            }
        }
        if (typeof token !== "string" || token.length > 512) {
            return res.json({ success: false, message: "Invalid bot token." });
        }
        token = token
            .trim()
            .replace(/^Bot\s+/i, "")
            .trim();
        const discordRes = await fetch("https://canary.discord.com/api/v9/applications/@me?with_counts=true", {
            headers: {
                Authorization: `Bot ${token}`,
                "User-Agent": Constants_1.default.UserAgentDiscordBot,
            },
            signal: AbortSignal.timeout(8000),
        });
        if (!discordRes.ok) {
            const errData = (await discordRes.json().catch(() => null));
            const errorMsg = errData?.message || discordRes.statusText || `HTTP ${discordRes.status}`;
            throw new Error(`Discord API Error [${discordRes.status}]: ${errorMsg}`);
        }
        const data = (await discordRes.json());
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
        (0, ValidateBotToken_1.cacheValidatedBotToken)(data.bot?.id ?? data.id, token);
        const allShards = Math.ceil((data.bot_approximate_guild_count ?? data.approximate_guild_count ?? 0) /
            Number(Config_1.default.config.guilds_per_shard)) || 1;
        return res.json({
            success: true,
            data,
            intents: DiscordBitField_1.IntentsBitField.getIntents(...Array.from(skipIntents)),
            allShards,
        });
    }
    catch (e) {
        return res.json({
            success: false,
            message: e?.message || String(e),
        });
    }
});
/**
 * Prepare patched Discord HTML Snapshot:
 * - Rewrites API_ENDPOINT & WEBAPP_ENDPOINT to current host so all REST calls go through APIServer
 * - Injects iOS PWA meta tags & manifest
 * - Injects __DBC_BOOT__, dbc-web-bridge.js, Vencord.js, Vencord.css, and dbc-mobile.css
 */
function buildPatchedDiscordHTML() {
    let html = (0, fs_1.readFileSync)(Constants_1.default.DiscordHTMLPath, "utf8");
    // 1. Remove Cloudflare challenge iframe script at bottom if present
    html = html.replace(/<script[^>]*>\s*\(function\(\)\s*\{\s*function c\(\)[\s\S]*?<\/script>/i, "");
    // 2. Strip nonce attributes so browser allows our injected Vencord & Web Bridge scripts
    html = html.replace(/\snonce="[^"]*"/g, "");
    // 2b. Strip any pre-existing viewport meta tags so only our strict mobile viewport applies
    html = html.replace(/<meta[^>]*viewport[^>]*>/gi, "");
    // 2c. Strip redundant preloads of hundreds of unused desktop chunks so mobile Safari doesn't choke on 500+ parallel requests
    html = html.replace(/<link\s+as="script"\s+href="\/assets\/(?!(web\.f86c748842ee176f|585600\.85ec39628d89fab2|41814\.16b66adbca89c196)\.js)[^"]+"\s+rel="preload">\s*/g, "");
    // 3. Point GLOBAL_ENV endpoints to current origin (APIServer) and disable domain migration redirect
    html = html.replace('"API_ENDPOINT": "//discord.com/api"', '"API_ENDPOINT": "//" + window.location.host + "/api"');
    html = html.replace('"WEBAPP_ENDPOINT": "//discord.com"', '"WEBAPP_ENDPOINT": "//" + window.location.host');
    html = html.replace('"ASSET_ENDPOINT": "//discord.com"', '"ASSET_ENDPOINT": "//" + window.location.host');
    html = html.replace('"API_PROTOCOL": "https:"', '"API_PROTOCOL": window.location.protocol');
    html = html.replace('"PRIMARY_DOMAIN": "discord.com"', '"PRIMARY_DOMAIN": window.location.host');
    html = html.replace('"MIGRATION_DESTINATION_ORIGIN": "https://discord.com"', '"MIGRATION_DESTINATION_ORIGIN": window.location.origin');
    // 4. Disable Discord's inline FAST CONNECT script in index.html so it doesn't open an unpatched zlib-stream WebSocket before Vencord loads
    html = html.replace("if (null != window.WebSocket &&", "if (false && null != window.WebSocket &&");
    const buildTs = Date.now();
    // 5. Inject iOS Safari PWA tags, Vencord bundle, Web Bridge, and Mobile CSS right after <head>
    const injection = `<head>
    <!-- iOS Safari PWA & Mobile Viewport -->
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="BotClient">
    <link rel="manifest" href="/manifest.json">
    <link rel="apple-touch-icon" href="/dbc-assets/icon.png">
    <link rel="icon" type="image/png" href="/dbc-assets/icon.png">

    <!-- Vencord & Mobile Styles -->
    <link rel="stylesheet" href="/vencord-ext/dist/Vencord.css?v=${buildTs}">
    <link rel="stylesheet" href="/dbc-assets/dbc-mobile.css?v=${buildTs}">

    <!-- DiscordBotClient Web Bridge & Vencord Runtime (Must execute BEFORE Discord bundles) -->
    <script>${bootPayloadScript}</script>
    <script src="/dbc-assets/dbc-web-bridge.js?v=${buildTs}"></script>
    <script src="/vencord-ext/dist/Vencord.js?v=${buildTs}"></script>`;
    html = html.replace("<head>", injection);
    return html;
}
const patchedDiscordHTML = buildPatchedDiscordHTML();
const ignoreHeaders = ["cookie", "sec-", "referer", "origin", "authorization", "host"];
// Handle headers (Identical to APIServer.ts)
app.all("*", function (req, _res, next) {
    req.originalHeaders = req.headers;
    const headers = {};
    Object.keys(req.headers).forEach(key => {
        if (!ignoreHeaders.some(prefix => key.toLowerCase().startsWith(prefix))) {
            headers[key] = req.headers[key];
        }
    });
    if (req.headers.authorization) {
        if (!req.headers.authorization.toLowerCase().startsWith("bot ")) {
            headers.authorization = `Bot ${req.headers.authorization.trim()}`;
        }
        else {
            headers.authorization = req.headers.authorization.trim();
        }
        headers["user-agent"] = Constants_1.default.UserAgentDiscordBot;
    }
    req.headers = headers;
    next();
});
// Register all 80+ DiscordBotClient custom API routes (/api/v10, /api/v9, /api)
(0, RegisterRoutes_1.registerRoutesSync)(app, path_1.default.resolve(__dirname, "AppCore", "routes"), ["/api/v10", "/api/v9", "/api"]);
// Parse JSON for our bridge endpoint AFTER registerRoutesSync so Util.getDataFromRequest on /api/* streams remains untouched
app.use("/dbc-bridge", express_1.default.json());
// Disk + memory cache for Discord's immutable hashed assets (/assets/*.js|css|wasm|woff2|svg|png...)
// Uses /tmp on Vercel (read-only filesystem) or .cache/assets locally.
const ASSET_CACHE_DIR = process.env.VERCEL
    ? path_1.default.join(os_1.default.tmpdir(), "dbc-assets-cache")
    : path_1.default.resolve(APP_ROOT, ".cache", "assets");
try {
    fs_1.default.mkdirSync(ASSET_CACHE_DIR, { recursive: true });
}
catch {
    // ignore if read-only
}
const inflight = new Map();
function fetchAsset(name) {
    let p = inflight.get(name);
    if (p)
        return p;
    p = (async () => {
        const file = path_1.default.join(ASSET_CACHE_DIR, name);
        const typeFile = file + ".type";
        try {
            if (fs_1.default.existsSync(file) && fs_1.default.existsSync(typeFile)) {
                return { buf: fs_1.default.readFileSync(file), type: fs_1.default.readFileSync(typeFile, "utf8") };
            }
        }
        catch {
            // fallback to network fetch
        }
        const r = await fetch(`https://canary.discord.com/assets/${name}`);
        if (!r.ok)
            return null;
        const buf = Buffer.from(await r.arrayBuffer());
        const type = r.headers.get("content-type") || "application/octet-stream";
        try {
            fs_1.default.writeFileSync(file, buf);
            fs_1.default.writeFileSync(typeFile, type);
        }
        catch {
            // ignore write error on restricted fs
        }
        return { buf, type };
    })().finally(() => inflight.delete(name));
    inflight.set(name, p);
    return p;
}
app.get("/assets/version.:channel.json", (_req, res) => {
    res.json({
        hash: "7f7c08c79473d1dfb12023bff0a35a6f9097c383",
        required_action: null,
    });
});
app.get("/assets/:name", async (req, res, next) => {
    const { name } = req.params;
    if (!/^[\w.-]+$/.test(name) || name.endsWith(".map"))
        return res.status(404).end();
    try {
        const asset = await fetchAsset(name);
        if (!asset)
            return next();
        res.setHeader("Content-Type", asset.type);
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return res.send(asset.buf);
    }
    catch {
        return next();
    }
});
app.all("/developers/*", (_req, res) => {
    return res.redirect("/app");
});
// Main fallback & Discord asset/API proxy (Identical to APIServer.ts)
app.use((req, res) => {
    if (req.originalUrl.endsWith(".map"))
        return res.status(404).send();
    if (Constants_1.default.BlacklistRoutes.some(_ => req.originalUrl.includes(_))) {
        return res.status(403).send({
            message: "APIServer: Bots cannot use this endpoint",
            code: 20001,
        });
    }
    // API routes
    if (req.originalUrl.includes("/api/"))
        return Utils_1.default.proxy(req, res);
    // Main page (disable ETag/304 caching so updated GLOBAL_ENV is always served fresh)
    if (["/", "/app", "/login"].includes(req.path) || ["/channels/"].some(s => req.path.startsWith(s))) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
        return res.send(patchedDiscordHTML);
    }
    // Proxy Discord JS/CSS/font assets from discord.com
    req.headers = req.originalHeaders;
    return Utils_1.default.proxy(req, res);
});
const PORT = Number(process.env.PORT) || 3080;
if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`\n============================================================`);
        console.log(`🚀 DiscordBotClient (Full Repo Web & iOS PWA) is running!`);
        console.log(`👉 URL: http://localhost:${PORT}`);
        console.log(`============================================================\n`);
    });
}
exports.default = app;
module.exports = app;
//# sourceMappingURL=web-server.js.map