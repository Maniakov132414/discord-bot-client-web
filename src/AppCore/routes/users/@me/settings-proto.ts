/* Copyright Elysia © 2025. All rights reserved */
/**
 * Web-compatible User Settings Proto fallback route.
 * Note: VencordDBCPlugin handles settings-proto directly in IndexedDB via settingsProtoPatch,
 * so this route simply returns an empty base64 proto payload if ever called directly.
 */

import { Router } from "express";
import { validateBotToken } from "src/AppUtils/ValidateBotToken";

const app = Router({ mergeParams: true });
app.use(validateBotToken);

app.all("/1", (_req, res) => {
    res.send({ settings: "" });
});

app.all("/2", (_req, res) => {
    res.send({ settings: "" });
});

export default app;
