"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("../../../../electron-shim.js");
const express_1 = require("express");
const Constants_1 = __importDefault(require("../../../Constants.js"));
const app = (0, express_1.Router)({ mergeParams: true });
app.get("/", async (req, res) => {
    try {
        const r = await electron_1.net.fetch("https://canary.discord.com/api/v9/users/@me", {
            headers: {
                authorization: req.headers.authorization || "",
                "user-agent": Constants_1.default.UserAgentDiscordBot,
            },
        });
        const data = await r.json();
        if (r.ok) {
            const user = data;
            res.status(200).send({
                ...user,
                premium: true,
                premium_type: 1,
                mfa_enabled: 1,
                flags: 476111,
                public_flags: 476111,
                phone: "33550336",
                verified: true,
                nsfw_allowed: true,
                email: `${user.id}@cyrene.moe`,
                purchased_flags: 3,
            });
        }
        else {
            res.status(r.status).send(data);
        }
    }
    catch (err) {
        console.error("Error fetching /users/@me:", err);
        res.status(500).send({ message: "Internal Server Error" });
    }
});
exports.default = app;
//# sourceMappingURL=index.js.map