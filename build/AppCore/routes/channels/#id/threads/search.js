"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("../../../../../electron-shim.js");
const express_1 = require("express");
const Constants_1 = __importDefault(require("../../../../Constants.js"));
const ForumPosts_1 = require("../../../../../AppUtils/ForumPosts.js");
const ValidateBotToken_1 = require("../../../../../AppUtils/ValidateBotToken.js");
const app = (0, express_1.Router)({ mergeParams: true });
const CACHE_MAX_SIZE = 200;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const mapCache = new Map();
function getOrCreateCacheEntry(cacheKey) {
    const existing = mapCache.get(cacheKey);
    if (existing && Date.now() - existing.createdAt < CACHE_TTL_MS) {
        return existing.timestamps;
    }
    // Evict expired entry or create new
    mapCache.delete(cacheKey);
    // Evict oldest entries if cache is full
    if (mapCache.size >= CACHE_MAX_SIZE) {
        const oldestKey = mapCache.keys().next().value;
        if (oldestKey)
            mapCache.delete(oldestKey);
    }
    const entry = { timestamps: [], createdAt: Date.now() };
    mapCache.set(cacheKey, entry);
    return entry.timestamps;
}
app.all("/", ValidateBotToken_1.validateBotToken, async (req, res) => {
    const channelId = req.params.id;
    const { archived, name, tag, limit, offset } = req.query;
    if (tag || name) {
        return res.send({
            threads: [],
            members: [],
            has_more: false,
            total_results: 0,
            first_messages: [],
        }); // Discord API limitation
    }
    let threads = [];
    let members = [];
    let public_has_more = false;
    const set = getOrCreateCacheEntry(`${res.locals.authenticatedBotId}:${channelId}`);
    const pageOffset = Math.max(parseInt(offset || "0", 10) || 0, 0);
    const pageLimit = Math.min(Math.max(parseInt(limit || "25", 10) || 25, 1), 100);
    const before = pageOffset > 0 ? set[pageOffset - 1] : undefined;
    if (pageOffset > 0 && before === undefined) {
        return res.status(400).send({ message: "Load previous thread pages first" });
    }
    try {
        if (archived === "true") {
            const response = await electron_1.net.fetch(`https://canary.discord.com/api/v9/channels/${channelId}/threads/archived/public?limit=${pageLimit}${before ? `&before=${new Date(before).toISOString()}` : ""}`, {
                signal: AbortSignal.timeout(10000),
                redirect: "error",
                headers: {
                    authorization: req.headers.authorization,
                    "user-agent": Constants_1.default.UserAgentDiscordBot,
                },
            });
            if (!response.ok) {
                const retryAfter = response.headers.get("retry-after");
                if (retryAfter)
                    res.setHeader("Retry-After", retryAfter);
                return res.status(response.status).send({ message: "Unable to fetch archived threads" });
            }
            const publicThread = (await response.json());
            threads = publicThread.threads || [];
            members = publicThread.members || [];
            public_has_more = publicThread.has_more === true;
        }
        for (let i = 0; i < threads.length; i++) {
            const timestamp = threads[i].thread_metadata?.archive_timestamp ?? 0;
            set[pageOffset + i] = new Date(timestamp).getTime();
        }
        const posts = await (0, ForumPosts_1.getForumPosts)(threads.map(thread => thread.id), req.headers.authorization);
        const finalData = {
            threads: threads,
            members,
            has_more: public_has_more,
            total_results: set.length,
            first_messages: Object.values(posts).flatMap(post => (post.first_message ? [post.first_message] : [])),
            owners: Object.values(posts).flatMap(post => (post.owner ? [post.owner] : [])),
        };
        res.send(finalData);
    }
    catch (error) {
        if (error instanceof ForumPosts_1.ForumPostError && error.retryAfter)
            res.setHeader("Retry-After", error.retryAfter);
        res.status(error instanceof ForumPosts_1.ForumPostError ? error.status : 502).send({
            message: "Unable to load archived threads",
        });
    }
});
exports.default = app;
//# sourceMappingURL=search.js.map