"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const SystemMessages_1 = require("../../../../AppUtils/SystemMessages.js");
const app = (0, express_1.Router)({ mergeParams: true });
app.all("/", async (req, res) => {
    switch (req.method.toLowerCase()) {
        case "delete":
        case "patch":
        case "post": {
            return res.status(403).send({
                message: "APIServer: Cannot send messages to this user",
                code: 50007,
            });
        }
        default: {
            const SystemMessages = await (0, SystemMessages_1.GetSystemMessage)();
            return res.send(SystemMessages);
        }
    }
});
app.all("/*", (req, res) => {
    res.status(404).send();
});
exports.default = app;
//# sourceMappingURL=messages.js.map