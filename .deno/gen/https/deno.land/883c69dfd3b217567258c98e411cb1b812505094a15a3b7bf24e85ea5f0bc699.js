// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
// This module is browser compatible.
/**
 * Provides the {@linkcode KeyStack} class which implements the
 * {@linkcode KeyRing} interface for managing rotatable keys.
 *
 * @module
 */ import { timingSafeEqual } from "./timing_safe_equal.ts";
import * as base64url from "../encoding/base64url.ts";
const encoder = new TextEncoder();
function importKey(key) {
    if (typeof key === "string") {
        key = encoder.encode(key);
    } else if (Array.isArray(key)) {
        key = new Uint8Array(key);
    }
    return crypto.subtle.importKey("raw", key, {
        name: "HMAC",
        hash: {
            name: "SHA-256"
        }
    }, true, [
        "sign",
        "verify"
    ]);
}
function sign(data, key) {
    if (typeof data === "string") {
        data = encoder.encode(data);
    } else if (Array.isArray(data)) {
        data = Uint8Array.from(data);
    }
    return crypto.subtle.sign("HMAC", key, data);
}
/** Compare two strings, Uint8Arrays, ArrayBuffers, or arrays of numbers in a
 * way that avoids timing based attacks on the comparisons on the values.
 *
 * The function will return `true` if the values match, or `false`, if they
 * do not match.
 *
 * This was inspired by https://github.com/suryagh/tsscmp which provides a
 * timing safe string comparison to avoid timing attacks as described in
 * https://codahale.com/a-lesson-in-timing-attacks/.
 */ async function compare(a, b) {
    const key = new Uint8Array(32);
    globalThis.crypto.getRandomValues(key);
    const cryptoKey = await importKey(key);
    const ah = await sign(a, cryptoKey);
    const bh = await sign(b, cryptoKey);
    return timingSafeEqual(ah, bh);
}
/** A cryptographic key chain which allows signing of data to prevent tampering,
 * but also allows for easy key rotation without needing to re-sign the data.
 *
 * Data is signed as SHA256 HMAC.
 *
 * This was inspired by [keygrip](https://github.com/crypto-utils/keygrip/).
 *
 * ### Example
 *
 * ```ts
 * import { KeyStack } from "https://deno.land/std@$STD_VERSION/crypto/keystack.ts";
 *
 * const keyStack = new KeyStack(["hello", "world"]);
 * const digest = await keyStack.sign("some data");
 *
 * const rotatedStack = new KeyStack(["deno", "says", "hello", "world"]);
 * await rotatedStack.verify("some data", digest); // true
 * ```
 */ export class KeyStack {
    #cryptoKeys = new Map();
    #keys;
    async #toCryptoKey(key) {
        if (!this.#cryptoKeys.has(key)) {
            this.#cryptoKeys.set(key, await importKey(key));
        }
        return this.#cryptoKeys.get(key);
    }
    get length() {
        return this.#keys.length;
    }
    /** A class which accepts an array of keys that are used to sign and verify
   * data and allows easy key rotation without invalidation of previously signed
   * data.
   *
   * @param keys An iterable of keys, of which the index 0 will be used to sign
   *             data, but verification can happen against any key.
   */ constructor(keys){
        const values = Array.isArray(keys) ? keys : [
            ...keys
        ];
        if (!values.length) {
            throw new TypeError("keys must contain at least one value");
        }
        this.#keys = values;
    }
    /** Take `data` and return a SHA256 HMAC digest that uses the current 0 index
   * of the `keys` passed to the constructor.  This digest is in the form of a
   * URL safe base64 encoded string. */ async sign(data) {
        const key = await this.#toCryptoKey(this.#keys[0]);
        return base64url.encode(await sign(data, key));
    }
    /** Given `data` and a `digest`, verify that one of the `keys` provided the
   * constructor was used to generate the `digest`.  Returns `true` if one of
   * the keys was used, otherwise `false`. */ async verify(data, digest) {
        return await this.indexOf(data, digest) > -1;
    }
    /** Given `data` and a `digest`, return the current index of the key in the
   * `keys` passed the constructor that was used to generate the digest.  If no
   * key can be found, the method returns `-1`. */ async indexOf(data, digest) {
        for(let i = 0; i < this.#keys.length; i++){
            const cryptoKey = await this.#toCryptoKey(this.#keys[i]);
            if (await compare(digest, base64url.encode(await sign(data, cryptoKey)))) {
                return i;
            }
        }
        return -1;
    }
    [Symbol.for("Deno.customInspect")](inspect) {
        const { length  } = this;
        return `${this.constructor.name} ${inspect({
            length
        })}`;
    }
    [Symbol.for("nodejs.util.inspect.custom")](depth, // deno-lint-ignore no-explicit-any
    options, inspect) {
        if (depth < 0) {
            return options.stylize(`[${this.constructor.name}]`, "special");
        }
        const newOptions = Object.assign({}, options, {
            depth: options.depth === null ? null : options.depth - 1
        });
        const { length  } = this;
        return `${options.stylize(this.constructor.name, "special")} ${inspect({
            length
        }, newOptions)}`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE2MC4wL2NyeXB0by9rZXlzdGFjay50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuLy8gVGhpcyBtb2R1bGUgaXMgYnJvd3NlciBjb21wYXRpYmxlLlxuXG4vKipcbiAqIFByb3ZpZGVzIHRoZSB7QGxpbmtjb2RlIEtleVN0YWNrfSBjbGFzcyB3aGljaCBpbXBsZW1lbnRzIHRoZVxuICoge0BsaW5rY29kZSBLZXlSaW5nfSBpbnRlcmZhY2UgZm9yIG1hbmFnaW5nIHJvdGF0YWJsZSBrZXlzLlxuICpcbiAqIEBtb2R1bGVcbiAqL1xuXG5pbXBvcnQgeyB0aW1pbmdTYWZlRXF1YWwgfSBmcm9tIFwiLi90aW1pbmdfc2FmZV9lcXVhbC50c1wiO1xuaW1wb3J0ICogYXMgYmFzZTY0dXJsIGZyb20gXCIuLi9lbmNvZGluZy9iYXNlNjR1cmwudHNcIjtcblxuLyoqIFR5cGVzIG9mIGRhdGEgdGhhdCBjYW4gYmUgc2lnbmVkIGNyeXB0b2dyYXBoaWNhbGx5LiAqL1xuZXhwb3J0IHR5cGUgRGF0YSA9IHN0cmluZyB8IG51bWJlcltdIHwgQXJyYXlCdWZmZXIgfCBVaW50OEFycmF5O1xuXG4vKiogVHlwZXMgb2Yga2V5cyB0aGF0IGNhbiBiZSB1c2VkIHRvIHNpZ24gZGF0YS4gKi9cbmV4cG9ydCB0eXBlIEtleSA9IHN0cmluZyB8IG51bWJlcltdIHwgQXJyYXlCdWZmZXIgfCBVaW50OEFycmF5O1xuXG5jb25zdCBlbmNvZGVyID0gbmV3IFRleHRFbmNvZGVyKCk7XG5cbmZ1bmN0aW9uIGltcG9ydEtleShrZXk6IEtleSk6IFByb21pc2U8Q3J5cHRvS2V5PiB7XG4gIGlmICh0eXBlb2Yga2V5ID09PSBcInN0cmluZ1wiKSB7XG4gICAga2V5ID0gZW5jb2Rlci5lbmNvZGUoa2V5KTtcbiAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGtleSkpIHtcbiAgICBrZXkgPSBuZXcgVWludDhBcnJheShrZXkpO1xuICB9XG4gIHJldHVybiBjcnlwdG8uc3VidGxlLmltcG9ydEtleShcbiAgICBcInJhd1wiLFxuICAgIGtleSxcbiAgICB7XG4gICAgICBuYW1lOiBcIkhNQUNcIixcbiAgICAgIGhhc2g6IHsgbmFtZTogXCJTSEEtMjU2XCIgfSxcbiAgICB9LFxuICAgIHRydWUsXG4gICAgW1wic2lnblwiLCBcInZlcmlmeVwiXSxcbiAgKTtcbn1cblxuZnVuY3Rpb24gc2lnbihkYXRhOiBEYXRhLCBrZXk6IENyeXB0b0tleSk6IFByb21pc2U8QXJyYXlCdWZmZXI+IHtcbiAgaWYgKHR5cGVvZiBkYXRhID09PSBcInN0cmluZ1wiKSB7XG4gICAgZGF0YSA9IGVuY29kZXIuZW5jb2RlKGRhdGEpO1xuICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcbiAgICBkYXRhID0gVWludDhBcnJheS5mcm9tKGRhdGEpO1xuICB9XG4gIHJldHVybiBjcnlwdG8uc3VidGxlLnNpZ24oXCJITUFDXCIsIGtleSwgZGF0YSk7XG59XG5cbi8qKiBDb21wYXJlIHR3byBzdHJpbmdzLCBVaW50OEFycmF5cywgQXJyYXlCdWZmZXJzLCBvciBhcnJheXMgb2YgbnVtYmVycyBpbiBhXG4gKiB3YXkgdGhhdCBhdm9pZHMgdGltaW5nIGJhc2VkIGF0dGFja3Mgb24gdGhlIGNvbXBhcmlzb25zIG9uIHRoZSB2YWx1ZXMuXG4gKlxuICogVGhlIGZ1bmN0aW9uIHdpbGwgcmV0dXJuIGB0cnVlYCBpZiB0aGUgdmFsdWVzIG1hdGNoLCBvciBgZmFsc2VgLCBpZiB0aGV5XG4gKiBkbyBub3QgbWF0Y2guXG4gKlxuICogVGhpcyB3YXMgaW5zcGlyZWQgYnkgaHR0cHM6Ly9naXRodWIuY29tL3N1cnlhZ2gvdHNzY21wIHdoaWNoIHByb3ZpZGVzIGFcbiAqIHRpbWluZyBzYWZlIHN0cmluZyBjb21wYXJpc29uIHRvIGF2b2lkIHRpbWluZyBhdHRhY2tzIGFzIGRlc2NyaWJlZCBpblxuICogaHR0cHM6Ly9jb2RhaGFsZS5jb20vYS1sZXNzb24taW4tdGltaW5nLWF0dGFja3MvLlxuICovXG5hc3luYyBmdW5jdGlvbiBjb21wYXJlKGE6IERhdGEsIGI6IERhdGEpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgY29uc3Qga2V5ID0gbmV3IFVpbnQ4QXJyYXkoMzIpO1xuICBnbG9iYWxUaGlzLmNyeXB0by5nZXRSYW5kb21WYWx1ZXMoa2V5KTtcbiAgY29uc3QgY3J5cHRvS2V5ID0gYXdhaXQgaW1wb3J0S2V5KGtleSk7XG4gIGNvbnN0IGFoID0gYXdhaXQgc2lnbihhLCBjcnlwdG9LZXkpO1xuICBjb25zdCBiaCA9IGF3YWl0IHNpZ24oYiwgY3J5cHRvS2V5KTtcbiAgcmV0dXJuIHRpbWluZ1NhZmVFcXVhbChhaCwgYmgpO1xufVxuXG4vKiogQSBjcnlwdG9ncmFwaGljIGtleSBjaGFpbiB3aGljaCBhbGxvd3Mgc2lnbmluZyBvZiBkYXRhIHRvIHByZXZlbnQgdGFtcGVyaW5nLFxuICogYnV0IGFsc28gYWxsb3dzIGZvciBlYXN5IGtleSByb3RhdGlvbiB3aXRob3V0IG5lZWRpbmcgdG8gcmUtc2lnbiB0aGUgZGF0YS5cbiAqXG4gKiBEYXRhIGlzIHNpZ25lZCBhcyBTSEEyNTYgSE1BQy5cbiAqXG4gKiBUaGlzIHdhcyBpbnNwaXJlZCBieSBba2V5Z3JpcF0oaHR0cHM6Ly9naXRodWIuY29tL2NyeXB0by11dGlscy9rZXlncmlwLykuXG4gKlxuICogIyMjIEV4YW1wbGVcbiAqXG4gKiBgYGB0c1xuICogaW1wb3J0IHsgS2V5U3RhY2sgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9jcnlwdG8va2V5c3RhY2sudHNcIjtcbiAqXG4gKiBjb25zdCBrZXlTdGFjayA9IG5ldyBLZXlTdGFjayhbXCJoZWxsb1wiLCBcIndvcmxkXCJdKTtcbiAqIGNvbnN0IGRpZ2VzdCA9IGF3YWl0IGtleVN0YWNrLnNpZ24oXCJzb21lIGRhdGFcIik7XG4gKlxuICogY29uc3Qgcm90YXRlZFN0YWNrID0gbmV3IEtleVN0YWNrKFtcImRlbm9cIiwgXCJzYXlzXCIsIFwiaGVsbG9cIiwgXCJ3b3JsZFwiXSk7XG4gKiBhd2FpdCByb3RhdGVkU3RhY2sudmVyaWZ5KFwic29tZSBkYXRhXCIsIGRpZ2VzdCk7IC8vIHRydWVcbiAqIGBgYFxuICovXG5leHBvcnQgY2xhc3MgS2V5U3RhY2sge1xuICAjY3J5cHRvS2V5cyA9IG5ldyBNYXA8S2V5LCBDcnlwdG9LZXk+KCk7XG4gICNrZXlzOiBLZXlbXTtcblxuICBhc3luYyAjdG9DcnlwdG9LZXkoa2V5OiBLZXkpOiBQcm9taXNlPENyeXB0b0tleT4ge1xuICAgIGlmICghdGhpcy4jY3J5cHRvS2V5cy5oYXMoa2V5KSkge1xuICAgICAgdGhpcy4jY3J5cHRvS2V5cy5zZXQoa2V5LCBhd2FpdCBpbXBvcnRLZXkoa2V5KSk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLiNjcnlwdG9LZXlzLmdldChrZXkpITtcbiAgfVxuXG4gIGdldCBsZW5ndGgoKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy4ja2V5cy5sZW5ndGg7XG4gIH1cblxuICAvKiogQSBjbGFzcyB3aGljaCBhY2NlcHRzIGFuIGFycmF5IG9mIGtleXMgdGhhdCBhcmUgdXNlZCB0byBzaWduIGFuZCB2ZXJpZnlcbiAgICogZGF0YSBhbmQgYWxsb3dzIGVhc3kga2V5IHJvdGF0aW9uIHdpdGhvdXQgaW52YWxpZGF0aW9uIG9mIHByZXZpb3VzbHkgc2lnbmVkXG4gICAqIGRhdGEuXG4gICAqXG4gICAqIEBwYXJhbSBrZXlzIEFuIGl0ZXJhYmxlIG9mIGtleXMsIG9mIHdoaWNoIHRoZSBpbmRleCAwIHdpbGwgYmUgdXNlZCB0byBzaWduXG4gICAqICAgICAgICAgICAgIGRhdGEsIGJ1dCB2ZXJpZmljYXRpb24gY2FuIGhhcHBlbiBhZ2FpbnN0IGFueSBrZXkuXG4gICAqL1xuICBjb25zdHJ1Y3RvcihrZXlzOiBJdGVyYWJsZTxLZXk+KSB7XG4gICAgY29uc3QgdmFsdWVzID0gQXJyYXkuaXNBcnJheShrZXlzKSA/IGtleXMgOiBbLi4ua2V5c107XG4gICAgaWYgKCEodmFsdWVzLmxlbmd0aCkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJrZXlzIG11c3QgY29udGFpbiBhdCBsZWFzdCBvbmUgdmFsdWVcIik7XG4gICAgfVxuICAgIHRoaXMuI2tleXMgPSB2YWx1ZXM7XG4gIH1cblxuICAvKiogVGFrZSBgZGF0YWAgYW5kIHJldHVybiBhIFNIQTI1NiBITUFDIGRpZ2VzdCB0aGF0IHVzZXMgdGhlIGN1cnJlbnQgMCBpbmRleFxuICAgKiBvZiB0aGUgYGtleXNgIHBhc3NlZCB0byB0aGUgY29uc3RydWN0b3IuICBUaGlzIGRpZ2VzdCBpcyBpbiB0aGUgZm9ybSBvZiBhXG4gICAqIFVSTCBzYWZlIGJhc2U2NCBlbmNvZGVkIHN0cmluZy4gKi9cbiAgYXN5bmMgc2lnbihkYXRhOiBEYXRhKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBjb25zdCBrZXkgPSBhd2FpdCB0aGlzLiN0b0NyeXB0b0tleSh0aGlzLiNrZXlzWzBdKTtcbiAgICByZXR1cm4gYmFzZTY0dXJsLmVuY29kZShhd2FpdCBzaWduKGRhdGEsIGtleSkpO1xuICB9XG5cbiAgLyoqIEdpdmVuIGBkYXRhYCBhbmQgYSBgZGlnZXN0YCwgdmVyaWZ5IHRoYXQgb25lIG9mIHRoZSBga2V5c2AgcHJvdmlkZWQgdGhlXG4gICAqIGNvbnN0cnVjdG9yIHdhcyB1c2VkIHRvIGdlbmVyYXRlIHRoZSBgZGlnZXN0YC4gIFJldHVybnMgYHRydWVgIGlmIG9uZSBvZlxuICAgKiB0aGUga2V5cyB3YXMgdXNlZCwgb3RoZXJ3aXNlIGBmYWxzZWAuICovXG4gIGFzeW5jIHZlcmlmeShkYXRhOiBEYXRhLCBkaWdlc3Q6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIHJldHVybiAoYXdhaXQgdGhpcy5pbmRleE9mKGRhdGEsIGRpZ2VzdCkpID4gLTE7XG4gIH1cblxuICAvKiogR2l2ZW4gYGRhdGFgIGFuZCBhIGBkaWdlc3RgLCByZXR1cm4gdGhlIGN1cnJlbnQgaW5kZXggb2YgdGhlIGtleSBpbiB0aGVcbiAgICogYGtleXNgIHBhc3NlZCB0aGUgY29uc3RydWN0b3IgdGhhdCB3YXMgdXNlZCB0byBnZW5lcmF0ZSB0aGUgZGlnZXN0LiAgSWYgbm9cbiAgICoga2V5IGNhbiBiZSBmb3VuZCwgdGhlIG1ldGhvZCByZXR1cm5zIGAtMWAuICovXG4gIGFzeW5jIGluZGV4T2YoZGF0YTogRGF0YSwgZGlnZXN0OiBzdHJpbmcpOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy4ja2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgY3J5cHRvS2V5ID0gYXdhaXQgdGhpcy4jdG9DcnlwdG9LZXkodGhpcy4ja2V5c1tpXSk7XG4gICAgICBpZiAoXG4gICAgICAgIGF3YWl0IGNvbXBhcmUoZGlnZXN0LCBiYXNlNjR1cmwuZW5jb2RlKGF3YWl0IHNpZ24oZGF0YSwgY3J5cHRvS2V5KSkpXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIGk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiAtMTtcbiAgfVxuXG4gIFtTeW1ib2wuZm9yKFwiRGVuby5jdXN0b21JbnNwZWN0XCIpXShpbnNwZWN0OiAodmFsdWU6IHVua25vd24pID0+IHN0cmluZykge1xuICAgIGNvbnN0IHsgbGVuZ3RoIH0gPSB0aGlzO1xuICAgIHJldHVybiBgJHt0aGlzLmNvbnN0cnVjdG9yLm5hbWV9ICR7aW5zcGVjdCh7IGxlbmd0aCB9KX1gO1xuICB9XG5cbiAgW1N5bWJvbC5mb3IoXCJub2RlanMudXRpbC5pbnNwZWN0LmN1c3RvbVwiKV0oXG4gICAgZGVwdGg6IG51bWJlcixcbiAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAgIG9wdGlvbnM6IGFueSxcbiAgICBpbnNwZWN0OiAodmFsdWU6IHVua25vd24sIG9wdGlvbnM/OiB1bmtub3duKSA9PiBzdHJpbmcsXG4gICkge1xuICAgIGlmIChkZXB0aCA8IDApIHtcbiAgICAgIHJldHVybiBvcHRpb25zLnN0eWxpemUoYFske3RoaXMuY29uc3RydWN0b3IubmFtZX1dYCwgXCJzcGVjaWFsXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IG5ld09wdGlvbnMgPSBPYmplY3QuYXNzaWduKHt9LCBvcHRpb25zLCB7XG4gICAgICBkZXB0aDogb3B0aW9ucy5kZXB0aCA9PT0gbnVsbCA/IG51bGwgOiBvcHRpb25zLmRlcHRoIC0gMSxcbiAgICB9KTtcbiAgICBjb25zdCB7IGxlbmd0aCB9ID0gdGhpcztcbiAgICByZXR1cm4gYCR7b3B0aW9ucy5zdHlsaXplKHRoaXMuY29uc3RydWN0b3IubmFtZSwgXCJzcGVjaWFsXCIpfSAke1xuICAgICAgaW5zcGVjdCh7IGxlbmd0aCB9LCBuZXdPcHRpb25zKVxuICAgIH1gO1xuICB9XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsMEVBQTBFO0FBQzFFLHFDQUFxQztBQUVyQzs7Ozs7Q0FLQyxHQUVELFNBQVMsZUFBZSxRQUFRLHlCQUF5QjtBQUN6RCxZQUFZLGVBQWUsMkJBQTJCO0FBUXRELE1BQU0sVUFBVSxJQUFJO0FBRXBCLFNBQVMsVUFBVSxHQUFRLEVBQXNCO0lBQy9DLElBQUksT0FBTyxRQUFRLFVBQVU7UUFDM0IsTUFBTSxRQUFRLE1BQU0sQ0FBQztJQUN2QixPQUFPLElBQUksTUFBTSxPQUFPLENBQUMsTUFBTTtRQUM3QixNQUFNLElBQUksV0FBVztJQUN2QixDQUFDO0lBQ0QsT0FBTyxPQUFPLE1BQU0sQ0FBQyxTQUFTLENBQzVCLE9BQ0EsS0FDQTtRQUNFLE1BQU07UUFDTixNQUFNO1lBQUUsTUFBTTtRQUFVO0lBQzFCLEdBQ0EsSUFBSSxFQUNKO1FBQUM7UUFBUTtLQUFTO0FBRXRCO0FBRUEsU0FBUyxLQUFLLElBQVUsRUFBRSxHQUFjLEVBQXdCO0lBQzlELElBQUksT0FBTyxTQUFTLFVBQVU7UUFDNUIsT0FBTyxRQUFRLE1B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