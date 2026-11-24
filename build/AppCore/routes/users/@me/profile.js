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
    if (guild_id) {
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
    // Using bio from applications/@me
    // Note:
    // There was a strange behavior that occurred:
    // The Bot’s *Description* field supports up to 400 characters and **does not handle emojis automatically**,
    // whereas the *About Me* tab in the app supports up to 190 characters and **does handle emojis automatically**.
    // As a result, in some specific cases, clicking on the *About Me* tab can trigger an error and cause it to get stuck on the popup:
    // **"Careful - you have unsaved changes!"**
    // > **Emoji handling note**: When the server has an emoji that the bot does not have access to, or if the emoji has been deleted,
    // Discord will automatically remove the emoji's ID.
    let applicationBio = null;
    try {
        const applicationData = await electron_1.net
            .fetch("https://canary.discord.com/api/v9/applications/@me", {
            headers: {
                Authorization: req.headers.authorization,
                "User-Agent": Constants_1.default.UserAgentDiscordBot,
            },
        })
            .then(resFetch => {
            return resFetch.json();
        });
        applicationBio = applicationData.description;
    }
    catch (err) {
        console.error("Error fetching application data:", err);
    }
    electron_1.net.fetch("https://canary.discord.com/api/v9/users/@me", {
        headers: {
            authorization: req.headers.authorization,
            "user-agent": Constants_1.default.UserAgentDiscordBot,
        },
    })
        .then(r => r.json())
        .then(d => res.send(Utils_1.default.ProfilePatch(d, guild_member, guild_id, applicationBio)))
        .catch(err => {
        console.error("Error fetching user profile (@me):", err);
        if (!res.headersSent)
            res.status(500).send({ message: "Internal Server Error" });
    });
});
exports.default = app;
//# sourceMappingURL=profile.js.map