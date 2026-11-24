"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForumPostError = void 0;
exports.getForumPosts = getForumPosts;
const electron_1 = require("../electron-shim.js");
const Constants_1 = __importDefault(require("../AppCore/Constants.js"));
class ForumPostError extends Error {
    status;
    retryAfter;
    constructor(status, retryAfter = null) {
        super("Unable to fetch forum post previews");
        this.status = status;
        this.retryAfter = retryAfter;
    }
}
exports.ForumPostError = ForumPostError;
async function getForumPosts(threadIds, authorization) {
    const threads = {};
    // Forum starter messages have the same ID as their thread. Bound parallel REST requests.
    for (let offset = 0; offset < threadIds.length; offset += 4) {
        await Promise.all(threadIds.slice(offset, offset + 4).map(async (threadId) => {
            const response = await electron_1.net.fetch(`https://canary.discord.com/api/v9/channels/${threadId}/messages/${threadId}`, {
                headers: { authorization, "user-agent": Constants_1.default.UserAgentDiscordBot },
                signal: AbortSignal.timeout(10000),
                redirect: "error",
            });
            const body = await response.json();
            // Only Unknown Message means deleted; permissions, rate limits and missing channels must remain errors.
            if (!response.ok && !(response.status === 404 && body.code === 10008)) {
                throw new ForumPostError(response.status, response.headers.get("retry-after"));
            }
            const message = response.ok ? body : null;
            if (message && (message.id !== threadId || message.channel_id !== threadId || !message.author)) {
                throw new ForumPostError(502);
            }
            threads[threadId] = { first_message: message, owner: message?.author ?? null };
        }));
    }
    return threads;
}
//# sourceMappingURL=ForumPosts.js.map