"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const app = (0, express_1.Router)({ mergeParams: true });
app.get("/", (req, res) => {
    return res.redirect("https://github.com/aiko-chan-ai/DiscordBotClient/releases");
});
exports.default = app;
//# sourceMappingURL=download.js.map