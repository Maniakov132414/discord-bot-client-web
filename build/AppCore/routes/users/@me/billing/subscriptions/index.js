"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const snowflake_1 = require("@sapphire/snowflake");
const express_1 = require("express");
const Utils_1 = __importDefault(require("../../../../../../AppUtils/Utils.js"));
const app = (0, express_1.Router)({ mergeParams: true });
app.get("/", (req, res) => {
    res.send([
        {
            id: snowflake_1.DiscordSnowflake.generate().toString(),
            type: 1,
            created_at: new Date().toISOString(),
            canceled_at: null,
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(Date.now() + 31536000000).toISOString(),
            status: 1,
            payment_source_id: null,
            payment_gateway: 3,
            payment_gateway_plan_id: "premium_tier_2_yearly",
            payment_gateway_subscription_id: "540000000000000",
            items: [
                {
                    id: snowflake_1.DiscordSnowflake.generate().toString(),
                    plan_id: "511651885459963904",
                    quantity: 1,
                },
            ],
            currency: "usd",
            country_code: null,
            user_id: Utils_1.default.getIDFromToken(req.headers.authorization),
            pause_ends_at: null,
            use_storekit_resubscribe: false,
            streak_started_at: new Date(Date.now() - 31536000000).toISOString(),
            metadata: {},
            price: null,
        },
    ]);
});
exports.default = app;
//# sourceMappingURL=index.js.map