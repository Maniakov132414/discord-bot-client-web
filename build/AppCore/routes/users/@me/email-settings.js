"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const app = (0, express_1.Router)({ mergeParams: true });
app.get("/", (req, res) => {
    res.send({
        categories: {
            social: true,
            communication: true,
            recommendations_and_events: false,
            tips: false,
            updates_and_announcements: false,
        },
        initialized: true,
    });
});
exports.default = app;
//# sourceMappingURL=email-settings.js.map