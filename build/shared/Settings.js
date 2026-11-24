"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultSettings = exports.settingsDefinitions = void 0;
exports.validateSetting = validateSetting;
exports.validateSettings = validateSettings;
exports.settingsDefinitions = [
    {
        key: "settings_theme",
        displayName: "Theme",
        description: "Only affects this window.",
        type: "select",
        defaultValue: "system",
        options: [
            { label: "System", value: "system" },
            { label: "Dark", value: "dark" },
            { label: "Light", value: "light" },
        ],
    },
    {
        key: "startup_animation",
        displayName: "Startup animation",
        description: "Applies after restarting DBC.",
        type: "select",
        defaultValue: "modern",
        options: [
            { label: "Modern (default)", value: "modern" },
            { label: "Discord Style", value: "classic" },
        ],
    },
    {
        key: "doh_provider",
        displayName: "DNS over HTTPS",
        description: "Prefer encrypted DNS with system DNS fallback. Applies after restarting DBC.",
        type: "select",
        defaultValue: "off",
        options: [
            { label: "Off (system DNS)", value: "off" },
            { label: "Automatic", value: "automatic" },
            { label: "Cloudflare", value: "cloudflare" },
            { label: "Google", value: "google" },
            { label: "Quad9", value: "quad9" },
        ],
    },
    {
        key: "use_system_proxy",
        displayName: "Use system proxy",
        description: "Follow OS proxy settings for network requests. The proxy must bypass discord.com so DBC can reach its local page. Applies after restarting DBC.",
        type: "boolean",
        defaultValue: false,
    },
    {
        key: "guilds_per_shard",
        displayName: "Guilds per shard",
        description: "Target servers per shard. Used to calculate shard count at your next login.",
        type: "number",
        defaultValue: 100,
        min: 1,
        max: Number.MAX_SAFE_INTEGER,
        integer: true,
    },
    {
        key: "suppress_intent_warning",
        displayName: "Skip message content intent check",
        description: "Allow login without the Message Content intent enabled.",
        type: "boolean",
        defaultValue: false,
    },
    {
        key: "generate_fake_profile",
        displayName: "Generate local profiles",
        description: "Add simulated profile details in DBC. Actual profiles are unchanged.",
        type: "boolean",
        defaultValue: true,
    },
    {
        key: "auto_check_updates",
        displayName: "Check for updates automatically",
        description: "Check for new DBC versions at startup. Manual checks remain available.",
        type: "boolean",
        defaultValue: true,
    },
    {
        key: "cache_assets",
        displayName: "Cache assets",
        description: "Reserved for compatibility; currently has no effect.",
        type: "boolean",
        defaultValue: false,
        hidden: true,
    },
];
exports.defaultSettings = Object.freeze(Object.fromEntries(exports.settingsDefinitions.map(definition => [definition.key, definition.defaultValue])));
/** Shared by the form and IPC validation; never coerces input. */
function validateSetting(definition, value) {
    switch (definition.type) {
        case "boolean":
            return typeof value === "boolean" ? undefined : "Must be a boolean.";
        case "string":
            return typeof value === "string" ? undefined : "Must be text.";
        case "select":
            return typeof value === "string" && definition.options.some(option => option.value === value)
                ? undefined
                : "Choose one of the available options.";
        case "number":
            if (typeof value !== "number" || !Number.isFinite(value))
                return "Must be a finite number.";
            if (definition.integer && !Number.isSafeInteger(value))
                return "Must be a safe whole number.";
            if (definition.min !== undefined && value < definition.min)
                return `Must be at least ${definition.min}.`;
            if (definition.max !== undefined && value > definition.max)
                return `Must be at most ${definition.max}.`;
            return undefined;
    }
}
function isPlainObject(value) {
    return (!!value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null));
}
/** Validate the full IPC payload without coercion or accepting extra properties. */
function validateSettings(value) {
    if (!isPlainObject(value))
        throw new Error("Settings must be a plain object.");
    const keys = Reflect.ownKeys(value);
    if (keys.length !== exports.settingsDefinitions.length ||
        keys.some(key => typeof key !== "string" || !Object.hasOwn(exports.defaultSettings, key))) {
        throw new Error("Settings must contain only the supported settings keys.");
    }
    return Object.fromEntries(exports.settingsDefinitions.map(definition => {
        const fieldValue = value[definition.key];
        const error = validateSetting(definition, fieldValue);
        if (error)
            throw new Error(`${definition.key}: ${error}`);
        return [definition.key, fieldValue];
    }));
}
//# sourceMappingURL=Settings.js.map