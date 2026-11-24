"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLocalServerCertificate = isLocalServerCertificate;
exports.default = startAppServer;
const crypto_1 = require("crypto");
const electron_log_1 = require("electron-log");
const express_1 = __importDefault(require("express"));
const fs_1 = require("fs");
const https_1 = __importDefault(require("https"));
const morgan_1 = __importDefault(require("morgan"));
const path_1 = __importDefault(require("path"));
const RegisterRoutes_1 = require("../AppUtils/RegisterRoutes.js");
const Utils_1 = __importDefault(require("../AppUtils/Utils.js"));
const Constants_1 = __importDefault(require("./Constants"));
const logger = (0, electron_log_1.scope)("APIServer");
const app = (0, express_1.default)();
if (Constants_1.default.VerboseAPIServerLogging) {
    app.use((0, morgan_1.default)("dev", {
        stream: {
            write: msg => logger.info(msg.replace(/\n/g, "")),
        },
    }));
}
const HttpsOptions = Utils_1.default.generateSelfSignedCertificate();
const localCertificate = new crypto_1.X509Certificate(HttpsOptions.cert);
/** Trust only the certificate generated for this process, never other invalid HTTPS certificates. */
function isLocalServerCertificate(data) {
    try {
        return localCertificate.raw.equals(new crypto_1.X509Certificate(data).raw);
    }
    catch {
        return false;
    }
}
const server = https_1.default.createServer({
    key: HttpsOptions.private,
    cert: HttpsOptions.cert,
}, app);
const ignoreHeaders = ["cookie", "sec-", "referer", "origin", "authorization", "host"];
// Handle headers
app.all("*", function (req, res, next) {
    req.originalHeaders = req.headers;
    const headers = {};
    Object.keys(req.headers).forEach(key => {
        if (!ignoreHeaders.some(prefix => key.toLowerCase().startsWith(prefix))) {
            headers[key] = req.headers[key];
        }
    });
    if (req.headers.authorization) {
        if (!req.headers.authorization.toLowerCase().startsWith("bot ")) {
            headers.authorization = `Bot ${req.headers.authorization.trim()}`;
        }
        else {
            headers.authorization = req.headers.authorization.trim();
        }
        headers["user-agent"] = Constants_1.default.UserAgentDiscordBot;
    }
    req.headers = headers;
    next();
});
(0, RegisterRoutes_1.registerRoutesSync)(app, path_1.default.resolve(__dirname, "routes"), ["/api/v10", "/api/v9", "/api"]);
app.all("/developers/*", (req, res) => {
    return res.redirect("/app");
});
// Other
app.use((req, res, next) => {
    if (req.originalUrl.endsWith(".map"))
        return res.status(404).send();
    if (Constants_1.default.BlacklistRoutes.some(_ => req.originalUrl.includes(_))) {
        return res.status(403).send({
            message: "APIServer: Bots cannot use this endpoint",
            code: 20001,
        });
    }
    // API routes
    if (req.originalUrl.includes("/api/"))
        return Utils_1.default.proxy(req, res);
    // Main page
    if (["/", "/app", "/login"].includes(req.path) || ["/channels/"].some(s => req.path.startsWith(s))) {
        logger.log("Serving Discord HTML for route:", req.path);
        return res.send((0, fs_1.readFileSync)(Constants_1.default.DiscordHTMLPath, "utf8"));
    }
    // Other routes
    req.headers = req.originalHeaders;
    return Utils_1.default.proxy(req, res);
});
async function startAppServer() {
    return new Promise((resolve, reject) => {
        const callback = () => {
            const address = server.address();
            resolve(address.port);
            logger.log(`API Server listening on https://127.0.0.1:${address.port}`);
        };
        server.listen(0, "127.0.0.1").once("listening", callback);
        server.on("error", reject);
    });
}
//# sourceMappingURL=APIServer.js.map