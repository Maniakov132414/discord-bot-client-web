"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const app = (0, express_1.Router)({ mergeParams: true });
app.get("/", (req, res) => {
    res.send([
        {
            id: "",
            name: "",
            interval: 1,
            interval_count: 1,
            tax_inclusive: true,
            sku_id: "",
            fallback_price: 499,
            fallback_currency: "eur",
            currency: "eur",
            price: 4199,
            price_tier: null,
        },
    ]);
});
exports.default = app;
//# sourceMappingURL=subscription-plans.js.map