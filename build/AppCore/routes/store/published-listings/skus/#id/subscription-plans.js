"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const NitroData_1 = __importDefault(require("../../../../../../AppUtils/NitroData.js"));
const app = (0, express_1.Router)({ mergeParams: true });
app.get("/", (req, res) => {
    const data = NitroData_1.default[req.params.id];
    if (data) {
        res.send(data);
    }
    else {
        res.send([]);
    }
});
exports.default = app;
//# sourceMappingURL=subscription-plans.js.map