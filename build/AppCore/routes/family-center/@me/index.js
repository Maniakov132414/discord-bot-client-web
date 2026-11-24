"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const app = (0, express_1.Router)({ mergeParams: true });
app.get("/", (req, res) => {
    res.send({
        linked_users: [],
        users: [],
        teen_audit_log: null,
        age_group: "adult",
    });
});
exports.default = app;
//# sourceMappingURL=index.js.map