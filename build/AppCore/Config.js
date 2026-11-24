"use strict";
/* Copyright Elysia © 2025. All rights reserved */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalConfig = void 0;
const crypto_1 = require("crypto");
const electron_1 = require("../electron-shim.js");
const fs_1 = __importDefault(require("fs"));
const ini_1 = require("ini");
const path_1 = __importDefault(require("path"));
const Settings_1 = require("../shared/Settings");
class GlobalConfig {
    config = Object.freeze({ ...Settings_1.defaultSettings });
    jsonPath;
    iniPath;
    warning;
    readOnly = false;
    constructor(directory = electron_1.app.getPath("userData")) {
        this.jsonPath = path_1.default.join(directory, "config.json");
        this.iniPath = path_1.default.join(directory, "config.ini");
        try {
            // Read directly: only ENOENT permits migration, never permissions or other IO errors.
            let json;
            try {
                json = fs_1.default.readFileSync(this.jsonPath, "utf8");
            }
            catch (error) {
                if (error.code !== "ENOENT")
                    throw error;
            }
            if (json !== undefined) {
                const document = JSON.parse(json);
                if (!document || typeof document !== "object" || Array.isArray(document)) {
                    throw new Error("Invalid configuration document.");
                }
                const envelope = document;
                if (envelope.version !== 1)
                    throw new Error("Unsupported configuration version.");
                if (Object.keys(envelope).some(key => key !== "version" && key !== "settings")) {
                    throw new Error("Unsupported configuration document keys.");
                }
                this.config = Object.freeze(this.withDefaults(envelope.settings));
                return;
            }
            let settings = { ...Settings_1.defaultSettings };
            try {
                settings = this.importIni(fs_1.default.readFileSync(this.iniPath, "utf8"));
            }
            catch (error) {
                if (error.code !== "ENOENT")
                    throw error;
            }
            this.save(settings);
        }
        catch (error) {
            this.readOnly = true;
            this.warning = `Settings could not be loaded or migrated. The original file has been preserved; defaults are active. ${error instanceof Error ? error.message : "Unknown error."}`;
        }
    }
    snapshot() {
        return {
            settings: { ...this.config },
            readOnly: this.readOnly,
            ...(this.warning ? { warning: this.warning } : {}),
        };
    }
    save(value) {
        if (this.readOnly)
            throw new Error(this.warning || "Settings are read-only.");
        const candidate = (0, Settings_1.validateSettings)(value);
        const temporaryPath = `${this.jsonPath}.${(0, crypto_1.randomUUID)()}.tmp`;
        try {
            fs_1.default.mkdirSync(path_1.default.dirname(this.jsonPath), { recursive: true });
            fs_1.default.writeFileSync(temporaryPath, `${JSON.stringify({ version: 1, settings: candidate }, null, 4)}\n`, {
                encoding: "utf8",
                flag: "wx",
                mode: 0o600,
            });
            fs_1.default.renameSync(temporaryPath, this.jsonPath);
        }
        catch (error) {
            try {
                fs_1.default.unlinkSync(temporaryPath);
            }
            catch {
                // No temporary file may have been created.
            }
            throw error;
        }
        // Publish only after the complete candidate has replaced the durable file.
        this.config = Object.freeze(candidate);
        return this.snapshot();
    }
    withDefaults(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error("Invalid stored settings.");
        }
        return (0, Settings_1.validateSettings)({ ...Settings_1.defaultSettings, ...value });
    }
    importIni(source) {
        // ini.parse tolerates malformed lines and drops dangerous keys; check syntax first.
        const seen = new Set();
        for (const raw of source.split(/\r?\n/)) {
            const line = raw.trim();
            if (!line || /^[;#]/.test(line))
                continue;
            const match = /^([^=]+)=/.exec(line);
            const key = match?.[1].trim();
            if (!key || !Object.hasOwn(Settings_1.defaultSettings, key) || seen.has(key)) {
                throw new Error("Invalid or unsupported legacy INI setting.");
            }
            seen.add(key);
        }
        const values = (0, ini_1.parse)(source);
        for (const key of Object.keys(values)) {
            const value = values[key];
            if (typeof value !== "string")
                continue;
            const definition = Settings_1.settingsDefinitions.find(setting => setting.key === key);
            if (definition?.type === "boolean" && /^(true|false)$/i.test(value)) {
                values[key] = value.toLowerCase() === "true";
            }
            else if (definition?.type === "number" && value.trim() !== "" && Number.isFinite(Number(value))) {
                values[key] = Number(value);
            }
        }
        return this.withDefaults(values);
    }
}
exports.GlobalConfig = GlobalConfig;
exports.default = new GlobalConfig();
//# sourceMappingURL=Config.js.map