"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const app = (0, express_1.Router)({ mergeParams: true });
app.get("/", (req, res) => {
    res.send({
        classifications: [],
        guild_classifications: [],
        account_standing: {
            state: 100,
        },
    });
});
exports.default = app;
//# sourceMappingURL=index.js.map