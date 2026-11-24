"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("../electron-shim.js");
const multer_1 = __importDefault(require("multer"));
const selfsigned_1 = __importDefault(require("selfsigned"));
const Config_1 = __importDefault(require("../AppCore/Config.js"));
const Constants_1 = __importDefault(require("../AppCore/Constants.js"));
const DiscordBitField_1 = require("./DiscordBitField");
const UserBadges_1 = require("./UserBadges");
class Util {
    static ProfilePatch(userData, guildMember = null, guildId = null, injectUserBio = null) {
        const fakeBio = "<a:shiggy:1162436090775470160> Based on the cutest Discord client mod :3";
        const flags = new DiscordBitField_1.UserFlagsBitField(userData.flags);
        const badges = [];
        flags.toArray().map(element => {
            // @ts-expect-error TS7053
            if (UserBadges_1.BadgesBasedUserDataAndExtends[element]) {
                // @ts-expect-error TS7053
                badges.push(UserBadges_1.BadgesBasedUserDataAndExtends[element]);
            }
        });
        if (userData.id !== Constants_1.default.UserIdDefault && Config_1.default.config.generate_fake_profile) {
            if (userData.bot) {
                badges.push(UserBadges_1.BadgesBasedUserDataAndExtends.BotCommands, UserBadges_1.BadgesBasedUserDataAndExtends.ApplicationAutomod, UserBadges_1.BadgesBasedUserDataAndExtends.ApplicationGuildSubscription);
            }
            else {
                badges.push(UserBadges_1.BadgesBasedUserDataAndExtends.PremiumDefault, UserBadges_1.BadgesBasedUserDataAndExtends.GuildBooster(9), UserBadges_1.BadgesBasedUserDataAndExtends.PremiumTenureV2(60), UserBadges_1.BadgesBasedUserDataAndExtends.LegacyUsername, UserBadges_1.BadgesBasedUserDataAndExtends.QuestCompleted, UserBadges_1.BadgesBasedUserDataAndExtends.AprilFools2026, UserBadges_1.BadgesBasedUserDataAndExtends.Gifting);
            }
        }
        /*
        // https://github.com/discord/discord-api-docs/issues/6623
        if (userData.premium_type > 0) {
            badges.push(UserBadges.PREMIUM_DEFAULT);
            if (userData.premium_type == 2) {
                badges.push(UserBadges.GUILD_BOOSTER_LEVEL(9));
            }
            // Ruby
            badges.push(UserBadges.PREMIUM_TENURE(60));
        }
        */
        if (!injectUserBio && Config_1.default.config.generate_fake_profile) {
            injectUserBio = fakeBio;
        }
        let guildMemberProfileBio = null;
        if (guildMember && "bio" in guildMember && guildMember.bio) {
            guildMemberProfileBio = guildMember.bio;
        }
        else if (injectUserBio) {
            guildMemberProfileBio = injectUserBio;
        }
        return {
            application_role_connections: [],
            badges,
            connected_accounts: [],
            guild_badges: [],
            guild_member: guildMember,
            guild_member_profile: guildMember && {
                guild_id: guildId,
                pronouns: "",
                bio: guildMemberProfileBio,
                banner: guildMember.banner,
                accent_color: null,
                theme_colors: null,
                popout_animation_particle_type: null,
                emoji: null,
                profile_effect: null,
            },
            legacy_username: null,
            mutual_friends: [],
            mutual_friends_count: 0,
            mutual_guilds: [],
            premium_since: Config_1.default.config.generate_fake_profile ? "2016-12-22T00:00:00.000000+00:00" : null,
            premium_guild_since: Config_1.default.config.generate_fake_profile ? "2016-12-22T00:00:00.000000+00:00" : null,
            // Force enable Nitro features (Bot)
            premium_type: userData.bot ? 2 : userData.premium_type,
            profile_themes_experiment_bucket: 4,
            user: userData,
            user_profile: {
                accent_color: userData.accent_color,
                banner: userData.banner,
                bio: injectUserBio,
                collectibles: [],
                emoji: null,
                popout_animation_particle_type: null,
                profile_effect: null,
                pronouns: null,
                theme_colors: null,
            },
            widgets: [],
            wishlist_settings: {},
        };
    }
    static getIDFromToken(token = "") {
        if (!token)
            return null;
        token = token.replace(/^(Bot|Bearer)\s*/i, "");
        const parts = token.split(".");
        if (parts.length < 2)
            return null; // Token must have at least 2 parts (id.secret)
        try {
            const decoded = Buffer.from(parts[0], "base64").toString();
            // Discord user/bot IDs are numeric (snowflakes)
            if (!decoded || !/^\d+$/.test(decoded))
                return null;
            return decoded;
        }
        catch {
            return null;
        }
    }
    static getDataFromRequest(req, res, 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback) {
        const contentType = (req.headers["content-type"] || "").toLowerCase();
        // check content-type
        if (!contentType.includes("application/json")) {
            // If Vercel already pre-parsed non-JSON body onto req.body and consumed stream, avoid hanging
            if (req.readableEnded && req.body !== undefined && !Buffer.isBuffer(req.body)) {
                return callback(req, res);
            }
            return (0, multer_1.default)().any()(req, res, function (err) {
                if (err) {
                    console.error("Multer Error:", err);
                }
                callback(req, res);
            });
        }
        // Handle pre-buffered / pre-parsed body on serverless runtimes (e.g. @vercel/node)
        if (Buffer.isBuffer(req.body)) {
            const rawStr = req.body.toString("utf8");
            req.rawBody = rawStr;
            try {
                req.body = rawStr ? JSON.parse(rawStr) : undefined;
            }
            catch (e) {
                req.body = undefined;
                console.error("JSON Parse Error:", e);
            }
            return callback(req, res);
        }
        if (typeof req.body === "string") {
            req.rawBody = req.body;
            try {
                req.body = req.body ? JSON.parse(req.body) : undefined;
            }
            catch (e) {
                req.body = undefined;
                console.error("JSON Parse Error:", e);
            }
            return callback(req, res);
        }
        if (req.body !== undefined && typeof req.body === "object" && req.body !== null) {
            req.rawBody = JSON.stringify(req.body);
            return callback(req, res);
        }
        if (req.readableEnded) {
            req.rawBody = "";
            return callback(req, res);
        }
        let data = "";
        req.on("data", function (chunk) {
            data += chunk;
        });
        req.on("end", function () {
            req.rawBody = data;
            if (data) {
                try {
                    req.body = JSON.parse(data);
                }
                catch (e) {
                    req.body = undefined;
                    console.error("JSON Parse Error:", e);
                }
            }
            callback(req, res);
        });
    }
    /**
     * Create a ISO Date string
     * Ex: 2024-12-25T14:14:53.033000+00:00
     * @param {number} addYear
     * @returns
     */
    static makeISODate(addYear = 0) {
        const date = new Date();
        date.setFullYear(date.getFullYear() + addYear);
        return date.toISOString().replace("Z", "000+00:00");
    }
    /**
     * Create a ISO Date string without milliseconds
     * Ex: 2024-12-25T14:18:15+00:00
     * @param {number} addYear
     * @returns
     */
    static makeISODateWithoutMilliseconds(addYear = 0) {
        const date = new Date();
        date.setFullYear(date.getFullYear() + addYear);
        return date.toISOString().replace(/\.\d+Z/, "+00:00");
    }
    /**
     * Compares two version strings and determines if `versionB` is newer than `versionA`.
     * Supports version strings in the format `major.minor.patch` with an optional prefix 'v'.
     *
     * @param versionA - The current version (e.g., "v1.2.3" or "1.2.3").
     * @param versionB - The new version to check (e.g., "v1.3.0" or "1.3.0").
     * @returns `true` if `versionB` is newer than `versionA`, otherwise `false`.
     */
    static isNewerVersion(versionA, versionB) {
        const normalizeVersion = (version) => version.replace(/^v/, "");
        const parseVersion = (version) => {
            const parts = version.split(".").map(Number);
            if (parts.length !== 3 || parts.some(isNaN)) {
                throw new Error(`Invalid version format: ${version}`);
            }
            return parts;
        };
        const [vA, vB] = [normalizeVersion(versionA), normalizeVersion(versionB)].map(parseVersion);
        for (let i = 0; i < 3; i++) {
            if (vB[i] > vA[i])
                return true;
            if (vB[i] < vA[i])
                return false;
        }
        return false;
    }
    static async proxy(req, res) {
        void electron_1.net;
        try {
            const targetUrl = `https://canary.discord.com${req.originalUrl}`;
            // 1. Copy headers (Express -> Fetch)
            const skipHeaders = [
                "host",
                "connection",
                "content-length",
                "transfer-encoding",
                "upgrade",
                "origin",
                "cookie",
                "referer",
                "accept-encoding",
            ];
            const outHeaders = {};
            Object.entries(req.headers).forEach(([key, value]) => {
                const lowerKey = key.toLowerCase();
                if (value && !skipHeaders.includes(lowerKey) && !lowerKey.startsWith("sec-")) {
                    outHeaders[key] = Array.isArray(value) ? value.join(", ") : String(value);
                }
            });
            outHeaders["Origin"] = "https://discord.com";
            outHeaders["Referer"] = "https://discord.com/";
            // 2. Safely read request body across both standard Node streams and Vercel serverless pre-buffered requests
            const method = req.method.toUpperCase();
            const canHaveBody = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
            let bodyBuffer;
            if (canHaveBody) {
                if (Buffer.isBuffer(req.body)) {
                    bodyBuffer = req.body;
                }
                else if (typeof req.body === "string") {
                    bodyBuffer = Buffer.from(req.body, "utf8");
                }
                else if (typeof req.rawBody === "string" && req.rawBody.length > 0) {
                    bodyBuffer = Buffer.from(req.rawBody, "utf8");
                }
                else if (req.body !== undefined && typeof req.body === "object" && req.body !== null) {
                    bodyBuffer = Buffer.from(JSON.stringify(req.body), "utf8");
                }
                else if (!req.readableEnded &&
                    (parseInt(req.headers["content-length"] ?? "0", 10) > 0 ||
                        Boolean(req.headers["transfer-encoding"]))) {
                    const chunks = [];
                    for await (const chunk of req) {
                        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                    }
                    if (chunks.length > 0) {
                        bodyBuffer = Buffer.concat(chunks);
                    }
                }
            }
            const upstreamRes = await fetch(targetUrl, {
                method,
                headers: outHeaders,
                body: bodyBuffer && bodyBuffer.length > 0 ? new Uint8Array(bodyBuffer) : undefined,
                redirect: "manual",
            });
            res.status(upstreamRes.status);
            // Node fetch automatically decompresses response body, so omit content-encoding & content-length
            const skipResHeaders = ["content-encoding", "content-length", "transfer-encoding", "connection"];
            upstreamRes.headers.forEach((value, key) => {
                if (!skipResHeaders.includes(key.toLowerCase())) {
                    try {
                        res.setHeader(key, value);
                    }
                    catch {
                        // ignore invalid header
                    }
                }
            });
            const resBuf = Buffer.from(await upstreamRes.arrayBuffer());
            return res.send(resBuf);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("Proxy request error:", err);
            if (!res.headersSent) {
                return res.status(502).send({ error: msg });
            }
        }
    }
    static generateSelfSignedCertificate() {
        return selfsigned_1.default.generate([{ name: "commonName", value: "localhost" }], {
            days: 3650,
            keySize: 2048,
            algorithm: "sha256",
            extensions: [
                {
                    name: "basicConstraints",
                    cA: false,
                },
                {
                    name: "subjectAltName",
                    altNames: [
                        {
                            type: 2, // DNS
                            value: "localhost",
                        },
                        {
                            type: 7, // IP
                            ip: "127.0.0.1",
                        },
                    ],
                },
            ],
        });
    }
}
exports.default = Util;
//# sourceMappingURL=Utils.js.map