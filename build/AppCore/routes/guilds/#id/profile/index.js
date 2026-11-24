"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("../../../../../electron-shim.js");
const express_1 = require("express");
const Constants_1 = __importDefault(require("../../../../Constants.js"));
const Utils_1 = __importDefault(require("../../../../../AppUtils/Utils.js"));
const app = (0, express_1.Router)({ mergeParams: true });
// Convert Guild object to GuildProfile object
// with_counts
// Ref: https://github.com/discord-userdoccers/discord-userdoccers/pull/346
function convertGuildObjectToGuildProfileObject(guild) {
    if (!guild.id && guild.code) {
        return {
            isError: true,
            data: guild,
        };
    }
    return {
        isError: false,
        data: {
            id: guild.id,
            name: guild.name,
            icon_hash: guild.icon,
            member_count: guild.approximate_member_count,
            online_count: guild.approximate_presence_count,
            description: guild.description,
            banner_hash: guild.banner,
            game_application_ids: [],
            game_activity: {},
            tag: null,
            badge: 0,
            badge_color_primary: "#ff0000", // ?
            badge_color_secondary: "#800000", // ?
            badge_hash: null,
            traits: [],
            features: guild.features,
            visibility: 2,
            custom_banner_hash: null,
            premium_subscription_count: guild.premium_subscription_count,
            premium_tier: guild.premium_tier,
        },
    };
}
app.get("/", async (req, res) => {
    electron_1.net.fetch(`https://canary.discord.com/api/v9/guilds/${req.params.id}?with_counts=true`, {
        method: "GET",
        headers: req.headers,
    })
        .then(r => r.json())
        .then(guild => {
        const data = convertGuildObjectToGuildProfileObject(guild);
        return res.status(data.isError ? 403 : 200).send(data.data);
    })
        .catch(err => {
        console.error("Error in /guilds/:id/profile GET:", err);
        res.status(500).send({
            message: "Internal Server Error (/guilds/:id/profile)",
            code: 500,
        });
    });
});
const callbackEditCurrentGuild = (reqCallback, resCallback) => {
    const guildId = reqCallback.params.id;
    const body = {};
    if ("name" in reqCallback.body)
        body.name = reqCallback.body.name;
    if ("description" in reqCallback.body)
        body.description = reqCallback.body.description;
    if ("icon" in reqCallback.body)
        body.icon = reqCallback.body.icon;
    if ("custom_banner" in reqCallback.body)
        body.banner = reqCallback.body.custom_banner;
    electron_1.net.fetch(`https://canary.discord.com/api/v10/guilds/${guildId}`, {
        headers: {
            authorization: reqCallback.headers.authorization,
            "user-agent": Constants_1.default.UserAgentDiscordBot,
            "Content-Type": "application/json",
        },
        method: "PATCH",
        body: JSON.stringify(body),
    })
        .then(r => r.json())
        .then(guild => {
        const data = convertGuildObjectToGuildProfileObject(guild);
        return resCallback.status(data.isError ? 403 : 200).send(data.data);
    })
        .catch(err => {
        console.error("Error in /guilds/:id/profile PATCH (guild):", err);
        if (!resCallback.headersSent)
            resCallback.status(500).send({ message: "Internal Server Error", code: 500 });
    });
};
app.patch("/", async (req, res) => {
    return Utils_1.default.getDataFromRequest(req, res, callbackEditCurrentGuild);
});
const callbackEditCurrentMember = (reqCallback, resCallback) => {
    const guildId = reqCallback.params.id;
    const body = {};
    if ("nick" in reqCallback.body)
        body.nick = reqCallback.body.nick;
    if ("avatar" in reqCallback.body)
        body.avatar = reqCallback.body.avatar;
    if ("avatar_description" in reqCallback.body)
        body.avatar_description = reqCallback.body.avatar_description;
    if ("banner" in reqCallback.body)
        body.banner = reqCallback.body.banner;
    if ("bio" in reqCallback.body)
        body.bio = reqCallback.body.bio;
    electron_1.net.fetch(`https://canary.discord.com/api/v10/guilds/${guildId}/members/@me`, {
        headers: {
            authorization: reqCallback.headers.authorization,
            "user-agent": Constants_1.default.UserAgentDiscordBot,
            "Content-Type": "application/json",
        },
        method: "PATCH",
        body: JSON.stringify(body),
    })
        .then(r => r.json())
        .then(d => {
        return resCallback.send({
            guild_id: guildId,
            pronouns: "",
            bio: body.bio || "",
            banner: d.banner,
            accent_color: null,
            theme_colors: null,
            popout_animation_particle_type: null,
            emoji: null,
            profile_effect: null,
        });
    })
        .catch(err => {
        console.error("Error in /guilds/:id/profile PATCH (member):", err);
        if (!resCallback.headersSent)
            resCallback.status(500).send({ message: "Internal Server Error", code: 500 });
    });
};
app.patch("/@me", async (req, res) => {
    return Utils_1.default.getDataFromRequest(req, res, callbackEditCurrentMember);
});
// ??? WTF discord ???
app.patch("/%40me", async (req, res) => {
    return Utils_1.default.getDataFromRequest(req, res, callbackEditCurrentMember);
});
exports.default = app;
//# sourceMappingURL=index.js.map