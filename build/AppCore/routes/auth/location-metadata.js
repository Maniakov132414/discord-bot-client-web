"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const app = (0, express_1.Router)({ mergeParams: true });
app.get("/", (req, res) => {
    res.send({
        consent_required: false,
        country_code: "VN",
        promotional_email_opt_in: {
            required: true,
            pre_checked: false,
        },
    });
});
exports.default = app;
//# sourceMappingURL=location-metadata.js.map