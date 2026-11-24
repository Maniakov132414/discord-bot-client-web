"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const app = (0, express_1.Router)({ mergeParams: true });
app.put("/", (req, res) => {
    res.status(403).send({
        message: "APIServer: User is not eligible to join this server.",
        code: 150023,
    });
});
exports.default = app;
//# sourceMappingURL=index.js.map