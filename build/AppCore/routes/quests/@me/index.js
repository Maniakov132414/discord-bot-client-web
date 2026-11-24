"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const app = (0, express_1.Router)({ mergeParams: true });
app.get("/", (req, res) => {
    res.send({
        quests: [],
        excluded_quests: [],
        quest_enrollment_blocked_until: null,
    });
});
exports.default = app;
//# sourceMappingURL=index.js.map