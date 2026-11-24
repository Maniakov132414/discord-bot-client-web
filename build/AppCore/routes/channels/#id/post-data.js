"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ForumPosts_1 = require("../../../../AppUtils/ForumPosts.js");
const ValidateBotToken_1 = require("../../../../AppUtils/ValidateBotToken.js");
const app = (0, express_1.Router)({ mergeParams: true });
app.post("/", ValidateBotToken_1.validateBotToken, (0, express_1.json)({ limit: "32kb" }), async (req, res) => {
    const ids = req.body?.thread_ids;
    if (!Array.isArray(ids) ||
        ids.length > 100 ||
        ids.some(id => typeof id !== "string" || !/^[1-9]\d{16,19}$/.test(id))) {
        return res.status(400).send({ message: "Expected up to 100 thread IDs" });
    }
    try {
        return res.send({ threads: await (0, ForumPosts_1.getForumPosts)([...new Set(ids)], req.headers.authorization) });
    }
    catch (error) {
        if (error instanceof ForumPosts_1.ForumPostError && error.retryAfter)
            res.setHeader("Retry-After", error.retryAfter);
        return res
            .status(error instanceof ForumPosts_1.ForumPostError ? error.status : 502)
            .send({ message: "Unable to fetch forum post previews" });
    }
});
exports.default = app;
//# sourceMappingURL=post-data.js.map