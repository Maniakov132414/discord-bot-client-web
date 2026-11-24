"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApplicationFlagsBitField = void 0;
// Originally from Discord.js
const v10_1 = require("discord-api-types/v10");
const BitField_1 = require("./BitField");
/**
 * Data structure that makes it easy to interact with an {@link Application#flags} bitfield.
 * @extends {BitField}
 */
class ApplicationFlagsBitField extends BitField_1.BitField {
    /**
     * Numeric application flags.
     *
     * @type {ApplicationFlags}
     * @memberof ApplicationFlagsBitField
     */
    static Flags = v10_1.ApplicationFlags;
}
exports.ApplicationFlagsBitField = ApplicationFlagsBitField;
/**
 * @name ApplicationFlagsBitField
 * @kind constructor
 * @memberof ApplicationFlagsBitField
 * @param {BitFieldResolvable} [bits=0] Bit(s) to read from
 */
/**
 * Bitfield of the packed bits
 *
 * @type {number}
 * @name ApplicationFlagsBitField#bitfield
 */
/**
 * Data that can be resolved to give an application flag bit field. This can be:
 * - A string (see {@link ApplicationFlagsBitField.Flags})
 * - An application flag
 * - An instance of ApplicationFlagsBitField
 * - An Array of ApplicationFlagsResolvable
 *
 * @typedef {string|number|ApplicationFlagsBitField|ApplicationFlagsResolvable[]} ApplicationFlagsResolvable
 */
//# sourceMappingURL=ApplicationFlags.js.map