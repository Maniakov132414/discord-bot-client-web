"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const app = (0, express_1.Router)({ mergeParams: true });
app.get("/", (req, res) => {
    res.send({ user_affinities: [], inverse_user_affinities: [] });
});
exports.default = app;
//# sourceMappingURL=users.js.map