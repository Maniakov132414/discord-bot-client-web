"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Constants_1 = __importDefault(require("../../../Constants.js"));
const Utils_1 = __importDefault(require("../../../../AppUtils/Utils.js"));
const app = (0, express_1.Router)({ mergeParams: true });
app.get("/", (req, res) => {
    res.send(Utils_1.default.ProfilePatch(Constants_1.default.UserDefaultPatch, null, null, "<:woaaah:1303344038681772063> https://github.com/sponsors/aiko-chan-ai"));
});
exports.default = app;
//# sourceMappingURL=profile.js.map