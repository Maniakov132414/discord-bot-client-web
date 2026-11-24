"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_protos_1 = require("discord-protos");
const express_1 = require("express");
const IPCManager_1 = require("../../../IPCManager.js");
const Utils_1 = __importDefault(require("../../../../AppUtils/Utils.js"));
const ValidateBotToken_1 = require("../../../../AppUtils/ValidateBotToken.js");
const app = (0, express_1.Router)({ mergeParams: true });
app.use(ValidateBotToken_1.validateBotToken);
/**
 * Wait for an IPC event matching a specific uid (correlation ID).
 * This avoids race conditions when multiple requests arrive simultaneously
 * by filtering on the uid so each request only gets its own response.
 */
function waitForSettingsEvent(emitter, eventName, uid, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const onEvent = (event, botId, settings) => {
            if (botId !== uid || !(0, IPCManager_1.isTrustedAppFrame)(event, globalThis.botClient.discordWebContents))
                return;
            clearTimeout(timer);
            emitter.removeListener(eventName, onEvent);
            resolve([event, botId, settings]);
        };
        const timer = setTimeout(() => {
            emitter.removeListener(eventName, onEvent);
            reject(new Error(`Timeout waiting for "${eventName}" (uid=${uid}) after ${timeoutMs}ms`));
        }, timeoutMs);
        emitter.on(eventName, onEvent);
    });
}
app.all("/1", async (req, res) => {
    const uid = res.locals.authenticatedBotId;
    try {
        const promise = waitForSettingsEvent(globalThis.botClient.ipcMain, "app:preload:get_preloaded_user_settings_response" /* IPCEvent.GetPreloadedUserSettingsResponse */, uid);
        // Request user settings from database
        globalThis.botClient.discordWebContents.send("app:preload:get_preloaded_user_settings" /* IPCEvent.GetPreloadedUserSettings */, uid);
        // [event, botId, settings]
        const userSettingEvent = await promise;
        const userSettings = await discord_protos_1.PreloadedUserSettings.fromBase64(userSettingEvent[2]);
        if (req.method.toUpperCase() === "GET") {
            return res.send({
                settings: userSettingEvent[2],
            });
        }
        const callback = async (reqC, resC) => {
            /**
             * @type {PreloadedUserSettings}
             */
            const decoded = discord_protos_1.PreloadedUserSettings.fromBase64(reqC.body?.settings || "");
            for (const key of Object.keys(decoded)) {
                // eslint-disable-next-line
                userSettings[key] = decoded[key];
            }
            const base64 = discord_protos_1.PreloadedUserSettings.toBase64(userSettings);
            await globalThis.botClient.discordWebContents.send("app:preload:set_preloaded_user_settings" /* IPCEvent.SetPreloadedUserSettings */, uid, base64);
            return resC.send({
                settings: base64,
            });
        };
        return Utils_1.default.getDataFromRequest(req, res, callback);
    }
    catch (err) {
        console.error("Error in settings-proto /1:", err);
        if (!res.headersSent) {
            return res.status(500).send({ settings: "" });
        }
    }
});
app.all("/2", async (req, res) => {
    const uid = res.locals.authenticatedBotId;
    try {
        const promise = waitForSettingsEvent(globalThis.botClient.ipcMain, "app:preload:get_frecency_user_settings_response" /* IPCEvent.GetFrecencyUserSettingsResponse */, uid);
        // Request user settings from database
        globalThis.botClient.discordWebContents.send("app:preload:get_frecency_user_settings" /* IPCEvent.GetFrecencyUserSettings */, uid);
        // [event, botId, settings]
        const userSettingEvent = await promise;
        const userSettings = await discord_protos_1.FrecencyUserSettings.fromBase64(userSettingEvent[2]);
        if (req.method.toUpperCase() === "GET") {
            return res.send({
                settings: userSettingEvent[2],
            });
        }
        const callback = async (reqC, resC) => {
            /**
             * @type {FrecencyUserSettings}
             */
            const decoded = discord_protos_1.FrecencyUserSettings.fromBase64(reqC.body?.settings || "");
            for (const key of Object.keys(decoded)) {
                // eslint-disable-next-line
                userSettings[key] = decoded[key];
            }
            const base64 = discord_protos_1.FrecencyUserSettings.toBase64(userSettings);
            await globalThis.botClient.discordWebContents.send("app:preload:set_frecency_user_settings" /* IPCEvent.SetFrecencyUserSettings */, uid, base64);
            return resC.send({
                settings: base64,
            });
        };
        return Utils_1.default.getDataFromRequest(req, res, callback);
    }
    catch (err) {
        console.error("Error in settings-proto /2:", err);
        if (!res.headersSent) {
            return res.status(500).send({ settings: "" });
        }
    }
});
exports.default = app;
//# sourceMappingURL=settings-proto.js.map