"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntentsBitField = void 0;
// Originally from Discord.js
const v10_1 = require("discord-api-types/v10");
const BitField_1 = require("./BitField");
/**
 * Data structure that makes it easy to calculate intents.
 *
 * @extends {BitField}
 */
class IntentsBitField extends BitField_1.BitField {
    /**
     * Numeric WebSocket intents
     *
     * @type {GatewayIntentBits}
     * @memberof IntentsBitField
     */
    static Flags = v10_1.GatewayIntentBits;
    static getIntents(...removeIntents) {
        const allIntents = Object.values(v10_1.GatewayIntentBits).filter(v => typeof v === "number");
        let intents = allIntents.reduce((acc, bit) => acc | bit, 0);
        for (const remove of removeIntents) {
            intents &= ~remove;
        }
        return intents;
    }
}
exports.IntentsBitField = IntentsBitField;
/**
 * @name IntentsBitField
 * @kind constructor
 * @memberof IntentsBitField
 * @param {IntentsResolvable} [bits=0] Bit(s) to read from
 */
/**
 * Data that can be resolved to give a permission number. This can be:
 * - A string (see {@link IntentsBitField.Flags})
 * - An intents flag
 * - An instance of {@link IntentsBitField}
 * - An array of IntentsResolvable
 *
 * @typedef {string|number|IntentsBitField|IntentsResolvable[]} IntentsResolvable
 */
//# sourceMappingURL=Intents.js.map