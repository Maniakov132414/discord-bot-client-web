"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const app = (0, express_1.Router)({ mergeParams: true });
app.post("/", (req, res) => {
    res.send({
        integration_ids_with_app_commands: [],
    });
});
exports.default = app;
//# sourceMappingURL=migrate-command-scope.js.map