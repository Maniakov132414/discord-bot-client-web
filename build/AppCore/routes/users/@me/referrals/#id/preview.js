"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const app = (0, express_1.Router)({ mergeParams: true });
app.all("/", (req, res) => {
    res.send({
        is_eligible: false,
    });
});
exports.default = app;
//# sourceMappingURL=preview.js.map