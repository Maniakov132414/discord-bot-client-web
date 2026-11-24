"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
const snowflake_1 = require("@sapphire/snowflake");
const express_1 = require("express");
const app = (0, express_1.Router)({ mergeParams: true });
app.all("/", (req, res) => {
    res.send({
        id: snowflake_1.DiscordSnowflake.generate().toString(),
        invoice_items: [
            {
                id: snowflake_1.DiscordSnowflake.generate().toString(),
                amount: 9999,
                discounts: [],
                subscription_plan_id: "511651885459963904",
                subscription_plan_price: 9999,
                quantity: 1,
                proration: false,
                tenant_metadata: {},
            },
        ],
        total: 9999,
        subtotal: 9999,
        currency: "usd",
        tax: 0,
        tax_inclusive: true,
        subscription_period_start: new Date().toISOString(),
        subscription_period_end: new Date(Date.now() + 31536000000).toISOString(),
    });
});
exports.default = app;
//# sourceMappingURL=preview.js.map