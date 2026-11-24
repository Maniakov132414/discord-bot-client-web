"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const app = (0, express_1.Router)({ mergeParams: true });
app.get("/", (req, res) => {
    res.send({
        guilds: [],
        total_count: 0,
        categories: [],
    });
});
exports.default = app;
//# sourceMappingURL=search.js.map