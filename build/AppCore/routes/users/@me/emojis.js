"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("../../../../electron-shim.js");
const express_1 = require("express");
const Constants_1 = __importDefault(require("../../../Constants.js"));
const ValidateBotToken_1 = require("../../../../AppUtils/ValidateBotToken.js");
const app = (0, express_1.Router)({ mergeParams: true });
const EMOJI_CACHE_MAX_SIZE = 100;
const EMOJI_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cacheMap = new Map();
/**
 * Evict expired entries from cache to prevent memory leaks
 */
function evictExpiredEntries() {
    const now = Date.now();
    for (const [key, entry] of cacheMap) {
        if (entry.timeout <= now) {
            cacheMap.delete(key);
        }
    }
}
app.get("/", ValidateBotToken_1.validateBotToken, (req, res) => {
    const id = res.locals.authenticatedBotId;
    const cached = cacheMap.get(id);
    if (cached && cached.timeout > Date.now()) {
        return res.send(cached.data);
    }
    // Evict expired entries periodically
    evictExpiredEntries();
    // Evict oldest if cache is full
    if (cacheMap.size >= EMOJI_CACHE_MAX_SIZE) {
        const oldestKey = cacheMap.keys().next().value;
        if (oldestKey)
            cacheMap.delete(oldestKey);
    }
    electron_1.net.fetch(`https://canary.discord.com/api/v9/applications/${id}/emojis`, {
        headers: {
            authorization: req.headers.authorization,
            "user-agent": Constants_1.default.UserAgentDiscordBot,
        },
    })
        .then(r => r.json())
        .then(r => {
        const emojis = r.items.map(emoji => ({
            roles: [],
            require_colons: emoji.require_colons,
            name: emoji.name,
            managed: false,
            id: emoji.id,
            available: true,
            animated: emoji.animated,
            allNamesString: `:${emoji.name}:`,
            guildId: "0",
            type: 1,
        }));
        cacheMap.set(id, {
            timeout: Date.now() + EMOJI_CACHE_TTL_MS,
            data: r.items,
        });
        res.send(r.items);
    })
        .catch(err => {
        console.error("Error fetching emojis:", err);
        res.send([]);
    });
});
exports.default = app;
//# sourceMappingURL=emojis.js.map