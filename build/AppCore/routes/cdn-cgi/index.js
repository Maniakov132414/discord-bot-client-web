"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const app = (0, express_1.Router)({ mergeParams: true });
app.all("*", (req, res) => {
    res.status(204).end();
});
exports.default = app;
//# sourceMappingURL=index.js.map