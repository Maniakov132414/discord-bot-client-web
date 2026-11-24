"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("../electron-shim.js");
const path_1 = __importDefault(require("path"));
const UserPatch_1 = __importDefault(require("../AppUtils/UserPatch.js"));
const GithubUserName = "aiko-chan-ai";
const GithubRepoName = "DiscordBotClient";
class Constants extends null {
    static BlacklistRoutes = [
        "outbound-promotions/codes",
        "science",
        "applications/public",
        "notes",
        "member-ids",
        "connections/",
        "users/@me/disable",
        "users/@me/delete",
        "users/@me/mfa",
        "users/@me/phone",
        "interaction-data",
        "member-verification",
        "cdn-cgi/challenge-platform",
        "explicit-media",
        "premium/subscriptions",
        "/ack",
        "/stripe",
        "/paypal",
        "/validate-billing-address",
        "/custom-call-sounds",
        "auth/conditional/start", // Disable WebAuthn
    ];
    static LatestStorageUpdate = 1735000000000;
    static AppName = "DiscordBotClient";
    static AppID = "DiscordBotClient";
    static iconPath = path_1.default.join(electron_1.app.getAppPath(), "assets", "icon.png");
    static icon16 = electron_1.nativeImage.createFromPath(Constants.iconPath).resize({ width: 16 });
    static icon128 = electron_1.nativeImage.createFromPath(Constants.iconPath).resize({ width: 128 });
    static DiscordBackgroundColor = "#36393f";
    static GithubRepo = `${GithubUserName}/${GithubRepoName}`;
    static UserAgentDiscordBot = `DiscordBot (https://github.com/${GithubUserName}/${GithubRepoName}, v${electron_1.app.getVersion()})`;
    static VencordExtensionPath = path_1.default.join(electron_1.app.getAppPath(), "VencordExtension");
    static DiscordHTMLPath = path_1.default.join(electron_1.app.getAppPath(), "assets", "snapshot", "index.html");
    static EditorHTMLFolderPath = path_1.default.join(electron_1.app.getAppPath(), "assets", "editor"); // Beta feature
    static DiscordGuildExperimentsPath = path_1.default.join(electron_1.app.getAppPath(), "assets", "snapshot", "guild_experiments.json");
    static DiscordUserExperimentsPath = path_1.default.join(electron_1.app.getAppPath(), "assets", "snapshot", "user_experiments.json");
    static DiscordApexExperimentsPath = path_1.default.join(electron_1.app.getAppPath(), "assets", "snapshot", "apex_experiments.json");
    static UserDefaultPatch = UserPatch_1.default["1056491867375673424"];
    static ChannelIdDefault = "1000000000000000000";
    static UserIdDefault = "1056491867375673424";
    static CustomDiscordDomain = "discord.com";
    static VerboseAPIServerLogging = true;
    // Database
    static DirectMessages = {
        name: "DMsData",
        path: "DirectMessages",
    };
    static PreloadedUserSettings = {
        name: "UserSettingsProto1",
        path: "PreloadedUserSettings",
    };
    static FrecencyUserSettings = {
        name: "UserSettingsProto2",
        path: "FrecencyUserSettings",
    };
    // Chromium Features
    static enableFeatures = [];
    static disableFeatures = [
        "CalculateNativeWinOcclusion",
        "WinRetrieveSuggestionsOnlyOnDemand",
        "HardwareMediaKeyHandling",
        "MediaSessionService",
    ];
}
exports.default = Constants;
//# sourceMappingURL=Constants.js.map