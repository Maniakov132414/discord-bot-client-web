"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const express_1 = require("express");
const app = (0, express_1.Router)({ mergeParams: true });
app.get("/", (req, res) => {
    res.send({
        request_id: (0, node_crypto_1.randomUUID)(),
        decisions: [],
    });
});
exports.default = app;
//# sourceMappingURL=get-decisions.js.map