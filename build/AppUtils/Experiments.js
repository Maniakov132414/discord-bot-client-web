"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserExperiment = UserExperiment;
exports.GuildExperiment = GuildExperiment;
exports.ApexExperiment = ApexExperiment;
const fs_1 = require("fs");
const murmurhash_1 = require("murmurhash");
const Constants_1 = __importDefault(require("../AppCore/Constants.js"));
const bucketReplacement = JSON.parse((0, fs_1.readFileSync)(Constants_1.default.DiscordUserExperimentsPath, "utf8"));
const apexExperiment = JSON.parse((0, fs_1.readFileSync)(Constants_1.default.DiscordApexExperimentsPath, "utf8"));
const disabledBuckets = [
    "2023-03_pomelo_debounce_delay",
    "2023-04_pomelo_attempt",
    "2023-04_pomelo_suggestions",
    "2023-03_pomelo",
];
// id -> bucket
const forceEnabledBuckets = {
// "2025-06_dave_for_browser": 2, // Enable
};
function buildUserExperiment(obj, botId) {
    const dataFromBucket = bucketReplacement[obj.id];
    if (!dataFromBucket)
        return null;
    if (disabledBuckets.includes(obj.id))
        return null;
    const hash = (0, murmurhash_1.v3)(obj.id);
    const { revision } = dataFromBucket;
    let { bucket } = dataFromBucket;
    if (forceEnabledBuckets[obj.id] !== undefined) {
        bucket = forceEnabledBuckets[obj.id];
    }
    const override = forceEnabledBuckets[obj.id] !== undefined || dataFromBucket.override === true ? 0 : -1;
    const { population } = dataFromBucket;
    const hash_result = dataFromBucket.hashResult ?? (0, murmurhash_1.v3)(`${obj.id}:${botId}`) % 10000;
    const aa_mode = Number(dataFromBucket.aaMode);
    const trigger_debugging = Number(dataFromBucket.triggerDebuggingEnabled);
    const arr = [hash, revision, bucket, override, population, hash_result, aa_mode, trigger_debugging];
    if (dataFromBucket.holdoutName) {
        arr.push(dataFromBucket.holdoutName);
        arr.push(dataFromBucket.holdoutRevision);
        arr.push(dataFromBucket.holdoutBucket);
    }
    else {
        arr.push(null, null, null);
    }
    return arr;
}
function UserExperiment(allData, botId) {
    try {
        // Raw READY assignments include experiments that have not registered a client module yet.
        if (Array.isArray(bucketReplacement))
            return structuredClone(bucketReplacement);
        return allData.map(obj => buildUserExperiment(obj, botId)).filter(x => x);
    }
    catch {
        return [];
    }
}
// Cache guild experiments to avoid reading file on every call
let cachedGuildExperiments = null;
function GuildExperiment() {
    if (!cachedGuildExperiments) {
        cachedGuildExperiments = JSON.parse((0, fs_1.readFileSync)(Constants_1.default.DiscordGuildExperimentsPath, "utf8"));
    }
    return cachedGuildExperiments;
}
function ApexExperiment(botId) {
    return {
        assignments: {
            "1": {
                [botId]: structuredClone(apexExperiment),
            },
        },
    };
}
//# sourceMappingURL=Experiments.js.map