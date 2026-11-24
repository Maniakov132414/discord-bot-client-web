"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const app = (0, express_1.Router)({ mergeParams: true });
app.get("/", (req, res) => {
    res.send({
        referrals_remaining: 0,
        sent_user_ids: [],
        refresh_at: null,
        has_eligible_friends: true,
        recipient_status: {},
        is_eligible_for_incentive: false,
        is_qualified_for_incentive: false,
        referral_incentive_status: 0,
    });
});
exports.default = app;
//# sourceMappingURL=eligibility.js.map