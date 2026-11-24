"use strict";
/* Copyright Elysia © 2025. All rights reserved */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserFlagsBitField = void 0;
// Originally from Discord.js
const v10_1 = require("discord-api-types/v10");
const BitField_1 = require("./BitField");
/**
 * Data structure that makes it easy to interact with a {@link User#flags} bitfield.
 *
 * @extends {BitField}
 */
class UserFlagsBitField extends BitField_1.BitField {
    /**
     * Numeric user flags.
     *
     * @type {UserFlags}
     * @memberof UserFlagsBitField
     */
    static Flags = v10_1.UserFlags;
}
exports.UserFlagsBitField = UserFlagsBitField;
/**
 * @name UserFlagsBitField
 * @kind constructor
 * @memberof UserFlagsBitField
 * @param {BitFieldResolvable} [bits=0] Bit(s) to read from
 */
/**
 * Bitfield of the packed bits
 *
 * @type {number}
 * @name UserFlagsBitField#bitfield
 */
//# sourceMappingURL=UserFlags.js.map