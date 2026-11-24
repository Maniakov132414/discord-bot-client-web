"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = __importDefault(require("node:crypto"));
const express_1 = require("express");
const Utils_1 = __importDefault(require("../../../../../AppUtils/Utils.js"));
const app = (0, express_1.Router)({ mergeParams: true });
app.get("/", (req, res) => {
    const randomData = node_crypto_1.default.randomBytes(16);
    res.send({
        request_id: node_crypto_1.default.createHash("md5").update(randomData).digest("hex"),
        entries: [],
        entries_hash: 0,
        expired_at: Utils_1.default.makeISODate(10),
        refresh_stale_inbox_after_ms: 3_000_000,
        refresh_token: Buffer.from(JSON.stringify({
            created_at: Utils_1.default.makeISODate(),
            content_hash: node_crypto_1.default.createHash("sha256").update(randomData).digest("base64"),
        }), "utf-8").toString("base64"),
        wait_ms_until_next_fetch: 3_000_000,
    });
});
exports.default = app;
//# sourceMappingURL=index.js.map