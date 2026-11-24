/* Copyright Elysia © 2025. All rights reserved */
/**
 * DiscordBotClient Standalone Web & iOS PWA Server
 * Runs 100% of DiscordBotClient's APIServer routes, Vencord + VencordDBCPlugin,
 * Discohook Editor, and Discord Web Snapshot directly in any browser / iOS Safari PWA.
 */

import { APIApplication, ApplicationFlags, GatewayIntentBits } from "discord-api-types/v10";
import express from "express";
import fs, { readFileSync } from "fs";
import morgan from "morgan";
import os from "os";
import path from "path";
import GlobalConfig from "src/AppCore/Config";
import Constants from "src/AppCore/Constants";
import { ApplicationFlagsBitField, IntentsBitField } from "src/AppUtils/DiscordBitField";
import { registerRoutesSync } from "src/AppUtils/RegisterRoutes";
import Util from "src/AppUtils/Utils";
import { cacheValidatedBotToken } from "src/AppUtils/ValidateBotToken";

BigInt.prototype.toJSON = function () {
    return this.toString();
};

const app = express();

if (Constants.VerboseAPIServerLogging) {
    app.use(morgan("dev"));
}

// Preload experiments & default user patch for synchronous client bootstrap
const guildExperiments = JSON.parse(readFileSync(Constants.DiscordGuildExperimentsPath, "utf8"));
const userExperiments = JSON.parse(readFileSync(Constants.DiscordUserExperimentsPath, "utf8"));
const apexExperiments = JSON.parse(readFileSync(Constants.DiscordApexExperimentsPath, "utf8"));

const bootPayloadScript = `window.__DBC_BOOT__ = ${JSON.stringify({
    version: "3.10.7",
    name: Constants.AppName,
    defaultUserPatch: Constants.UserDefaultPatch,
    guildExperiments,
    userExperiments,
    apexExperiments,
})};`;

const APP_ROOT = path.resolve(__dirname, "..");

// Serve Vencord Extension bundle, Discohook Editor, and PWA Static Assets
app.use("/vencord-ext", express.static(Constants.VencordExtensionPath));
app.use("/dbc-editor", express.static(Constants.EditorHTMLFolderPath));
app.use(
    "/dbc-assets",
    express.static(path.resolve(APP_ROOT, "assets"), {
        etag: false,
        lastModified: false,
        setHeaders: (res) => {
            res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
        },
    }),
);
app.get("/manifest.json", (_req, res) => {
    res.sendFile(path.resolve(APP_ROOT, "assets", "pwa-manifest.json"));
});

app.get("/download-deploy-zip", (_req, res) => {
    const zipPath = path.resolve(APP_ROOT, "..", "DiscordBotClient-Web-Deploy.zip");
    if (fs.existsSync(zipPath)) {
        res.download(zipPath, "DiscordBotClient-Web-Deploy.zip");
    } else {
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
app.post("/dbc-bridge/get-bot-info", express.json(), async (req, res) => {
    try {
        let token = req.body?.token;
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
                "User-Agent": Constants.UserAgentDiscordBot,
            },
        });

        if (!discordRes.ok) {
            const errData = (await discordRes.json().catch(() => null)) as { message?: string } | null;
            const errorMsg = errData?.message || discordRes.statusText || `HTTP ${discordRes.status}`;
            throw new Error(`Discord API Error [${discordRes.status}]: ${errorMsg}`);
        }

        const data = (await discordRes.json()) as APIApplication & { bot_approximate_guild_count?: number };
        const applicationFlags = new ApplicationFlagsBitField(data.flags);
        const skipIntents = new Set<GatewayIntentBits>([
            GatewayIntentBits.GuildPresences,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.MessageContent,
        ]);

        if (
            applicationFlags.has(ApplicationFlags.GatewayPresence) ||
            applicationFlags.has(ApplicationFlags.GatewayPresenceLimited)
        ) {
            skipIntents.delete(GatewayIntentBits.GuildPresences);
        }
        if (
            applicationFlags.has(ApplicationFlags.GatewayGuildMembers) ||
            applicationFlags.has(ApplicationFlags.GatewayGuildMembersLimited)
        ) {
            skipIntents.delete(GatewayIntentBits.GuildMembers);
        }
        if (
            applicationFlags.has(ApplicationFlags.GatewayMessageContent) ||
            applicationFlags.has(ApplicationFlags.GatewayMessageContentLimited)
        ) {
            skipIntents.delete(GatewayIntentBits.MessageContent);
        }

        cacheValidatedBotToken(data.bot?.id ?? data.id, token);

        const allShards =
            Math.ceil(
                (data.bot_approximate_guild_count ?? data.approximate_guild_count ?? 0) /
                    Number(GlobalConfig.config.guilds_per_shard),
            ) || 1;

        return res.json({
            success: true,
            data,
            intents: IntentsBitField.getIntents(...Array.from(skipIntents)),
            allShards,
        });
    } catch (e: any) {
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
function buildPatchedDiscordHTML (): string {
    let html = readFileSync(Constants.DiscordHTMLPath, "utf8");

    // 1. Remove Cloudflare challenge iframe script at bottom if present
    html = html.replace(/<script[^>]*>\s*\(function\(\)\s*\{\s*function c\(\)[\s\S]*?<\/script>/i, "");

    // 2. Strip nonce attributes so browser allows our injected Vencord & Web Bridge scripts
    html = html.replace(/\snonce="[^"]*"/g, "");

    // 3. Point GLOBAL_ENV endpoints to current origin (APIServer) and disable domain migration redirect
    html = html.replace(
        '"API_ENDPOINT": "//discord.com/api"',
        '"API_ENDPOINT": "//" + window.location.host + "/api"',
    );
    html = html.replace(
        '"WEBAPP_ENDPOINT": "//discord.com"',
        '"WEBAPP_ENDPOINT": "//" + window.location.host',
    );
    html = html.replace(
        '"ASSET_ENDPOINT": "//discord.com"',
        '"ASSET_ENDPOINT": "//" + window.location.host',
    );
    html = html.replace('"API_PROTOCOL": "https:"', '"API_PROTOCOL": window.location.protocol');
    html = html.replace(
        '"PRIMARY_DOMAIN": "discord.com"',
        '"PRIMARY_DOMAIN": window.location.host',
    );
    html = html.replace(
        '"MIGRATION_DESTINATION_ORIGIN": "https://discord.com"',
        '"MIGRATION_DESTINATION_ORIGIN": window.location.origin',
    );

    // 4. Inject iOS Safari PWA tags, Vencord bundle, Web Bridge, and Mobile CSS right after <head>
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
    <link rel="stylesheet" href="/vencord-ext/dist/Vencord.css">
    <link rel="stylesheet" href="/dbc-assets/dbc-mobile.css">

    <!-- DiscordBotClient Web Bridge & Vencord Runtime (Must execute BEFORE Discord bundles) -->
    <script>${bootPayloadScript}</script>
    <script src="/dbc-assets/dbc-web-bridge.js"></script>
    <script src="/vencord-ext/dist/Vencord.js"></script>`;

    html = html.replace("<head>", injection);
    return html;
}

const patchedDiscordHTML = buildPatchedDiscordHTML();

const ignoreHeaders = ["cookie", "sec-", "referer", "origin", "authorization", "host"];

// Handle headers (Identical to APIServer.ts)
app.all("*", function (req, _res, next) {
    req.originalHeaders = req.headers;
    const headers: typeof req.headers = {};
    Object.keys(req.headers).forEach(key => {
        if (!ignoreHeaders.some(prefix => key.toLowerCase().startsWith(prefix))) {
            headers[key] = req.headers[key];
        }
    });
    if (req.headers.authorization) {
        if (!req.headers.authorization.toLowerCase().startsWith("bot ")) {
            headers.authorization = `Bot ${req.headers.authorization.trim()}`;
        } else {
            headers.authorization = req.headers.authorization.trim();
        }
        headers["user-agent"] = Constants.UserAgentDiscordBot;
    }
    req.headers = headers;
    next();
});

// Register all 80+ DiscordBotClient custom API routes (/api/v10, /api/v9, /api)
registerRoutesSync(app, path.resolve(__dirname, "AppCore", "routes"), ["/api/v10", "/api/v9", "/api"]);

// Disk + memory cache for Discord's immutable hashed assets (/assets/*.js|css|wasm|woff2|svg|png...)
// Uses /tmp on Vercel (read-only filesystem) or .cache/assets locally.
const ASSET_CACHE_DIR = process.env.VERCEL
    ? path.join(os.tmpdir(), "dbc-assets-cache")
    : path.resolve(APP_ROOT, ".cache", "assets");
try {
    fs.mkdirSync(ASSET_CACHE_DIR, { recursive: true });
} catch {
    // ignore if read-only
}
const inflight = new Map<string, Promise<{ buf: Buffer; type: string } | null>>();

function fetchAsset (name: string) {
    let p = inflight.get(name);
    if (p) return p;
    p = (async () => {
        const file = path.join(ASSET_CACHE_DIR, name);
        const typeFile = file + ".type";
        try {
            if (fs.existsSync(file) && fs.existsSync(typeFile)) {
                return { buf: fs.readFileSync(file), type: fs.readFileSync(typeFile, "utf8") };
            }
        } catch {
            // fallback to network fetch
        }
        const r = await fetch(`https://canary.discord.com/assets/${name}`);
        if (!r.ok) return null;
        const buf = Buffer.from(await r.arrayBuffer());
        const type = r.headers.get("content-type") || "application/octet-stream";
        try {
            fs.writeFileSync(file, buf);
            fs.writeFileSync(typeFile, type);
        } catch {
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
    if (!/^[\w.-]+$/.test(name) || name.endsWith(".map")) return res.status(404).end();
    try {
        const asset = await fetchAsset(name);
        if (!asset) return next();
        res.setHeader("Content-Type", asset.type);
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return res.send(asset.buf);
    } catch {
        return next();
    }
});

app.all("/developers/*", (_req, res) => {
    return res.redirect("/app");
});

// Main fallback & Discord asset/API proxy (Identical to APIServer.ts)
app.use((req, res) => {
    if (req.originalUrl.endsWith(".map")) return res.status(404).send();
    if (Constants.BlacklistRoutes.some(_ => req.originalUrl.includes(_))) {
        return res.status(403).send({
            message: "APIServer: Bots cannot use this endpoint",
            code: 20001,
        });
    }
    // API routes
    if (req.originalUrl.includes("/api/")) return Util.proxy(req, res);
    // Main page (disable ETag/304 caching so updated GLOBAL_ENV is always served fresh)
    if (["/", "/app", "/login"].includes(req.path) || ["/channels/"].some(s => req.path.startsWith(s))) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
        return res.send(patchedDiscordHTML);
    }
    // Proxy Discord JS/CSS/font assets from discord.com
    req.headers = req.originalHeaders;
    return Util.proxy(req, res);
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

export default app;
module.exports = app;
