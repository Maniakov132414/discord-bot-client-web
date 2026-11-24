"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const app = (0, express_1.Router)({ mergeParams: true });
app.get("/", (req, res) => {
    res.send({
        user_sessions: [
            {
                id_hash: Buffer.from("aiko-chan-ai/DiscordBotClient", "utf8").toString("base64"),
                approx_last_used_time: new Date().toISOString(),
                client_info: {
                    os: process.platform === "win32" ? "Windows" : process.platform === "darwin" ? "macOS" : "Linux",
                    platform: "DiscordBotClient",
                    location: "Aedes Elysiae",
                },
            },
        ],
    });
});
exports.default = app;
//# sourceMappingURL=sessions.js.map