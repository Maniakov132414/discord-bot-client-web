"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("../../electron-shim.js");
const express_1 = require("express");
const app = (0, express_1.Router)({ mergeParams: true });
app.get("/*", (req, res) => {
    electron_1.net.fetch("https://canary.discord.com/popout")
        .then(r => r.text())
        .then(t => res.send(t))
        .catch(err => {
        console.error("Error fetching popout:", err);
        if (!res.headersSent)
            res.status(502).send("Failed to fetch popout page");
    });
});
exports.default = app;
//# sourceMappingURL=popout.js.map