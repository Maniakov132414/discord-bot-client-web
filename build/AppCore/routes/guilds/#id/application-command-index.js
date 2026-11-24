"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
const snowflake_1 = require("@sapphire/snowflake");
const express_1 = require("express");
const app = (0, express_1.Router)({ mergeParams: true });
app.get("/", (req, res) => {
    res.send({
        applications: [],
        application_commands: [],
        version: snowflake_1.DiscordSnowflake.generate().toString(),
    });
});
exports.default = app;
//# sourceMappingURL=application-command-index.js.map