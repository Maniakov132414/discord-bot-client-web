"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = __importDefault(require("node:crypto"));
const electron_1 = require("../../../../../electron-shim.js");
const express_1 = require("express");
const Constants_1 = __importDefault(require("../../../../Constants.js"));
const app = (0, express_1.Router)({ mergeParams: true });
app.get("/", async (req, res) => {
    const salt = Math.random().toString();
    const hash = node_crypto_1.default
        .createHash("md5")
        .update(salt + "elysia")
        .digest("hex");
    let { channel_id } = req.query;
    const { max_id, min_id } = req.query;
    let messages = [];
    channel_id ??= req.params.id;
    if (channel_id) {
        messages = await electron_1.net
            .fetch("https://canary.discord.com/api/v9/channels/" +
            channel_id +
            `/messages?limit=25${max_id ? "&before=" + max_id : ""}${min_id ? "&after=" + min_id : ""}`, {
            headers: {
                authorization: req.headers.authorization,
                "user-agent": Constants_1.default.UserAgentDiscordBot,
            },
        })
            .then(r => r.json())
            .catch(() => []);
    }
    return res.status(200).send({
        analytics_id: hash,
        doing_deep_historical_index: false,
        total_results: messages.length,
        messages: messages.map(m => {
            return [{ ...m, hit: true }];
        }),
    });
});
exports.default = app;
//# sourceMappingURL=search.js.map