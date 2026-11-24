"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const app = (0, express_1.Router)({ mergeParams: true });
app.all("/", (req, res) => {
    res.send({
        application_commands: [],
        applications: [],
        cursor: null,
    });
});
exports.default = app;
//# sourceMappingURL=search.js.map