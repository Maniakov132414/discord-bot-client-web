"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const snowflake_1 = require("@sapphire/snowflake");
const electron_1 = require("../../../../../electron-shim.js");
const express_1 = require("express");
const Constants_1 = __importDefault(require("../../../../Constants.js"));
const app = (0, express_1.Router)({ mergeParams: true });
function createFakeBoost(guildId) {
    const botId = snowflake_1.DiscordSnowflake.generate().toString();
    return {
        id: snowflake_1.DiscordSnowflake.generate().toString(),
        user_id: botId,
        guild_id: guildId,
        ended: false,
        pause_ends_at: null,
        user: {
            id: botId,
            username: "elysia",
            global_name: "DiscordBotClient",
            avatar: null,
            avatar_decoration_data: null,
            collectibles: null,
            discriminator: "0",
            public_flags: 0,
            primary_guild: null,
            clan: null,
        },
    };
}
app.get("/", (req, res) => {
    return electron_1.net
        .fetch("https://canary.discord.com/api/v9/guilds/" + req.params.id, {
        headers: {
            authorization: req.headers.authorization,
            "user-agent": Constants_1.default.UserAgentDiscordBot,
        },
    })
        .then(r => r.json())
        .then(object => {
        if (object.premium_subscription_count && object.premium_subscription_count > 0) {
            const data = [];
            const guildId = req.params.id;
            for (let i = 0; i < object.premium_subscription_count; i++) {
                data.push(createFakeBoost(guildId));
            }
            res.send(data);
        }
        else {
            res.send([]);
        }
    })
        .catch(() => {
        res.send([]);
    });
});
exports.default = app;
//# sourceMappingURL=subscriptions.js.map