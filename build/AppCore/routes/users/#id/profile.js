"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("../../../../electron-shim.js");
const express_1 = require("express");
const Constants_1 = __importDefault(require("../../../Constants.js"));
const Utils_1 = __importDefault(require("../../../../AppUtils/Utils.js"));
const app = (0, express_1.Router)({ mergeParams: true });
app.get("/", async (req, res) => {
    const { guild_id } = req.query;
    let guild_member = null;
    const botId = Utils_1.default.getIDFromToken(req.headers.authorization);
    const isCurrentUser = req.params.id === botId;
    if (guild_id) {
        if (isCurrentUser) {
            // ??? https://canary.discord.com/api/v9/users/@me/guilds/${guild_id}/member
            const body = {
                avatar_decoration_id: null,
            };
            // ??? monkey patching
            guild_member = await electron_1.net
                .fetch(`https://canary.discord.com/api/v10/guilds/${guild_id}/members/@me`, {
                headers: {
                    authorization: req.headers.authorization,
                    "user-agent": Constants_1.default.UserAgentDiscordBot,
                    "Content-Type": "application/json",
                },
                method: "PATCH",
                body: JSON.stringify(body),
            })
                .then(r => r.json());
        }
        else {
            guild_member = await electron_1.net
                .fetch(`https://canary.discord.com/api/v9/guilds/${guild_id}/members/${req.params.id}`, {
                headers: {
                    authorization: req.headers.authorization,
                    "user-agent": Constants_1.default.UserAgentDiscordBot,
                },
            })
                .then(r => r.json())
                .catch(() => null);
        }
    }
    let bio = null;
    if (isCurrentUser) {
        // Using bio from applications/@me
        try {
            const applicationData = await electron_1.net
                .fetch("https://canary.discord.com/api/v9/applications/@me", {
                headers: {
                    Authorization: req.headers.authorization,
                    "User-Agent": Constants_1.default.UserAgentDiscordBot,
                },
            })
                .then(resF => {
                return resF.json();
            });
            bio = applicationData.description;
        }
        catch (err) {
            console.error("Error fetching application data:", err);
        }
    }
    electron_1.net.fetch("https://canary.discord.com/api/v9/users/" + req.params.id, {
        headers: {
            authorization: req.headers.authorization,
            "user-agent": Constants_1.default.UserAgentDiscordBot,
        },
    })
        .then(r => r.json())
        .then(d => res.send(Utils_1.default.ProfilePatch(d, guild_member, guild_id ?? null, bio)))
        .catch(err => {
        console.error("Error fetching user profile (/:id):", err);
        if (!res.headersSent)
            res.status(500).send({ message: "Internal Server Error" });
    });
});
app.patch("/", (req, res) => {
    req.url = "/api/v9/users/@me";
    return Utils_1.default.proxy(req, res);
});
exports.default = app;
//# sourceMappingURL=profile.js.map