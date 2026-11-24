"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBotToken = void 0;
exports.cacheValidatedBotToken = cacheValidatedBotToken;
const crypto_1 = require("crypto");
const electron_1 = require("../electron-shim.js");
const Constants_1 = __importDefault(require("../AppCore/Constants.js"));
const Utils_1 = __importDefault(require("./Utils"));
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const tokenCache = new Map();
function hashToken(token) {
    return (0, crypto_1.createHash)("sha256")
        .update(token
        .trim()
        .replace(/^Bot\s+/i, "")
        .trim())
        .digest();
}
// Call only after Discord has authenticated this token and returned its identity.
function cacheValidatedBotToken(botId, token) {
    if (typeof botId !== "string" || !/^\d+$/.test(botId))
        return;
    tokenCache.delete(botId);
    if (tokenCache.size >= 100)
        tokenCache.delete(tokenCache.keys().next().value);
    tokenCache.set(botId, { hash: hashToken(token), expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
}
const validateBotToken = async (req, res, next) => {
    const { authorization } = req.headers;
    if (!authorization) {
        res.status(401).send({ message: "Missing bot token" });
        return;
    }
    // Decoding is only a cache lookup hint; the full credential must match.
    const cachedId = Utils_1.default.getIDFromToken(authorization);
    const cached = cachedId && tokenCache.get(cachedId);
    if (cached && cached.expiresAt > Date.now() && (0, crypto_1.timingSafeEqual)(cached.hash, hashToken(authorization))) {
        res.locals.authenticatedBotId = cachedId;
        next();
        return;
    }
    try {
        const response = await electron_1.net.fetch("https://canary.discord.com/api/v10/users/@me", {
            headers: { authorization, "user-agent": Constants_1.default.UserAgentDiscordBot },
            signal: AbortSignal.timeout(10000),
            redirect: "error",
        });
        if (!response.ok) {
            const retryAfter = response.headers.get("retry-after");
            if (response.status === 429 && retryAfter)
                res.setHeader("Retry-After", retryAfter);
            res.status(response.status).send({ message: "Bot token validation failed" });
            return;
        }
        const user = (await response.json());
        if (!user || typeof user.id !== "string" || !/^\d+$/.test(user.id) || user.bot !== true) {
            res.status(403).send({ message: "Expected a valid bot account" });
            return;
        }
        res.locals.authenticatedBotId = user.id;
        cacheValidatedBotToken(user.id, authorization);
    }
    catch {
        res.status(502).send({ message: "Unable to validate bot token" });
        return;
    }
    next();
};
exports.validateBotToken = validateBotToken;
//# sourceMappingURL=ValidateBotToken.js.map