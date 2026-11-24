"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const app = (0, express_1.Router)({ mergeParams: true });
app.get("/", (req, res) => {
    res.send({
        code: 0,
        message: "OK",
        version: globalThis.botClient.app.getVersion(),
        isBotClient: req.headers["user-agent"]?.includes("DiscordBotClient") || false,
    });
});
exports.default = app;
//# sourceMappingURL=ping.js.map