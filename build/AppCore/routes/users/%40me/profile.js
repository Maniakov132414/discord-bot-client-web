"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callbackEditCurrentUser = void 0;
const electron_1 = require("../../../../electron-shim.js");
const express_1 = require("express");
const Constants_1 = __importDefault(require("../../../Constants.js"));
const Utils_1 = __importDefault(require("../../../../AppUtils/Utils.js"));
const app = (0, express_1.Router)({ mergeParams: true });
const callbackEditCurrentUser = (reqCallback, resCallback) => {
    const body = {};
    if ("banner" in reqCallback.body)
        body.banner = reqCallback.body.banner;
    electron_1.net.fetch("https://canary.discord.com/api/v10/users/@me", {
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
            guild_id: null,
            pronouns: "",
            bio: null,
            banner: d.banner,
            accent_color: null,
            theme_colors: null,
            popout_animation_particle_type: null,
            emoji: null,
            profile_effect: null,
        });
    })
        .catch(err => {
        console.error("Error in /users/@me/profile PATCH (user):", err);
        if (!resCallback.headersSent)
            resCallback.status(500).send({ message: "Internal Server Error", code: 500 });
    });
};
exports.callbackEditCurrentUser = callbackEditCurrentUser;
app.patch("/", async (req, res) => {
    return Utils_1.default.getDataFromRequest(req, res, exports.callbackEditCurrentUser);
});
exports.default = app;
//# sourceMappingURL=profile.js.map