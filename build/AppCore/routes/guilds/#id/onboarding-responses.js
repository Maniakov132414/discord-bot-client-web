"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Utils_1 = __importDefault(require("../../../../AppUtils/Utils.js"));
const app = (0, express_1.Router)({ mergeParams: true });
const callback = (req, res) => {
    const BotToken = req.headers.authorization;
    const uid = Utils_1.default.getIDFromToken(BotToken);
    const data = {
        ...req.body,
        guild_id: req.params.id,
        user_id: uid,
    };
    res.status(200).send(data);
};
app.post("/", (req, res) => {
    return Utils_1.default.getDataFromRequest(req, res, callback);
});
app.put("/", (req, res) => {
    return Utils_1.default.getDataFromRequest(req, res, callback);
});
exports.default = app;
//# sourceMappingURL=onboarding-responses.js.map