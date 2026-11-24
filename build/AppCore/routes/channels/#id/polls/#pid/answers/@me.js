"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const app = (0, express_1.Router)({ mergeParams: true });
app.put("/", (req, res) => {
    res.status(403).send({
        message: "APIServer: Apps are not allowed to vote on polls.",
        code: 520000,
    });
});
exports.default = app;
//# sourceMappingURL=@me.js.map