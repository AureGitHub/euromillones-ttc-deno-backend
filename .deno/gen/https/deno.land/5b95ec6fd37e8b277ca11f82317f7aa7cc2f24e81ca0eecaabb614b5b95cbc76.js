// Copyright 2018-2022 the oak authors. All rights reserved. MIT license.
// This was inspired by [keygrip](https://github.com/crypto-utils/keygrip/)
// which allows signing of data (cookies) to prevent tampering, but also allows
// for easy key rotation without needing to resign the data.
import { timingSafeEqual } from "./deps.ts";
import { encodeBase64Safe, importKey, sign } from "./util.ts";
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
export class KeyStack {
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
   * @param keys An array of keys, of which the index 0 will be used to sign
   *             data, but verification can happen against any key.
   */ constructor(keys){
        if (!(0 in keys)) {
            throw new TypeError("keys must contain at least one value");
        }
        this.#keys = keys;
    }
    /** Take `data` and return a SHA256 HMAC digest that uses the current 0 index
   * of the `keys` passed to the constructor.  This digest is in the form of a
   * URL safe base64 encoded string. */ async sign(data) {
        const key = await this.#toCryptoKey(this.#keys[0]);
        return encodeBase64Safe(await sign(data, key));
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
            if (await compare(digest, encodeBase64Safe(await sign(data, cryptoKey)))) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMS4xLjAva2V5U3RhY2sudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IDIwMTgtMjAyMiB0aGUgb2FrIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuXG4vLyBUaGlzIHdhcyBpbnNwaXJlZCBieSBba2V5Z3JpcF0oaHR0cHM6Ly9naXRodWIuY29tL2NyeXB0by11dGlscy9rZXlncmlwLylcbi8vIHdoaWNoIGFsbG93cyBzaWduaW5nIG9mIGRhdGEgKGNvb2tpZXMpIHRvIHByZXZlbnQgdGFtcGVyaW5nLCBidXQgYWxzbyBhbGxvd3Ncbi8vIGZvciBlYXN5IGtleSByb3RhdGlvbiB3aXRob3V0IG5lZWRpbmcgdG8gcmVzaWduIHRoZSBkYXRhLlxuXG5pbXBvcnQgeyB0aW1pbmdTYWZlRXF1YWwgfSBmcm9tIFwiLi9kZXBzLnRzXCI7XG5pbXBvcnQgeyBlbmNvZGVCYXNlNjRTYWZlLCBpbXBvcnRLZXksIHNpZ24gfSBmcm9tIFwiLi91dGlsLnRzXCI7XG5pbXBvcnQgdHlwZSB7IERhdGEsIEtleSB9IGZyb20gXCIuL3R5cGVzLmQudHNcIjtcblxuLyoqIENvbXBhcmUgdHdvIHN0cmluZ3MsIFVpbnQ4QXJyYXlzLCBBcnJheUJ1ZmZlcnMsIG9yIGFycmF5cyBvZiBudW1iZXJzIGluIGFcbiAqIHdheSB0aGF0IGF2b2lkcyB0aW1pbmcgYmFzZWQgYXR0YWNrcyBvbiB0aGUgY29tcGFyaXNvbnMgb24gdGhlIHZhbHVlcy5cbiAqXG4gKiBUaGUgZnVuY3Rpb24gd2lsbCByZXR1cm4gYHRydWVgIGlmIHRoZSB2YWx1ZXMgbWF0Y2gsIG9yIGBmYWxzZWAsIGlmIHRoZXlcbiAqIGRvIG5vdCBtYXRjaC5cbiAqXG4gKiBUaGlzIHdhcyBpbnNwaXJlZCBieSBodHRwczovL2dpdGh1Yi5jb20vc3VyeWFnaC90c3NjbXAgd2hpY2ggcHJvdmlkZXMgYVxuICogdGltaW5nIHNhZmUgc3RyaW5nIGNvbXBhcmlzb24gdG8gYXZvaWQgdGltaW5nIGF0dGFja3MgYXMgZGVzY3JpYmVkIGluXG4gKiBodHRwczovL2NvZGFoYWxlLmNvbS9hLWxlc3Nvbi1pbi10aW1pbmctYXR0YWNrcy8uXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGNvbXBhcmUoYTogRGF0YSwgYjogRGF0YSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICBjb25zdCBrZXkgPSBuZXcgVWludDhBcnJheSgzMik7XG4gIGdsb2JhbFRoaXMuY3J5cHRvLmdldFJhbmRvbVZhbHVlcyhrZXkpO1xuICBjb25zdCBjcnlwdG9LZXkgPSBhd2FpdCBpbXBvcnRLZXkoa2V5KTtcbiAgY29uc3QgYWggPSBhd2FpdCBzaWduKGEsIGNyeXB0b0tleSk7XG4gIGNvbnN0IGJoID0gYXdhaXQgc2lnbihiLCBjcnlwdG9LZXkpO1xuICByZXR1cm4gdGltaW5nU2FmZUVxdWFsKGFoLCBiaCk7XG59XG5cbmV4cG9ydCBjbGFzcyBLZXlTdGFjayB7XG4gICNjcnlwdG9LZXlzID0gbmV3IE1hcDxLZXksIENyeXB0b0tleT4oKTtcbiAgI2tleXM6IEtleVtdO1xuXG4gIGFzeW5jICN0b0NyeXB0b0tleShrZXk6IEtleSk6IFByb21pc2U8Q3J5cHRvS2V5PiB7XG4gICAgaWYgKCF0aGlzLiNjcnlwdG9LZXlzLmhhcyhrZXkpKSB7XG4gICAgICB0aGlzLiNjcnlwdG9LZXlzLnNldChrZXksIGF3YWl0IGltcG9ydEtleShrZXkpKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuI2NyeXB0b0tleXMuZ2V0KGtleSkhO1xuICB9XG5cbiAgZ2V0IGxlbmd0aCgpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLiNrZXlzLmxlbmd0aDtcbiAgfVxuXG4gIC8qKiBBIGNsYXNzIHdoaWNoIGFjY2VwdHMgYW4gYXJyYXkgb2Yga2V5cyB0aGF0IGFyZSB1c2VkIHRvIHNpZ24gYW5kIHZlcmlmeVxuICAgKiBkYXRhIGFuZCBhbGxvd3MgZWFzeSBrZXkgcm90YXRpb24gd2l0aG91dCBpbnZhbGlkYXRpb24gb2YgcHJldmlvdXNseSBzaWduZWRcbiAgICogZGF0YS5cbiAgICpcbiAgICogQHBhcmFtIGtleXMgQW4gYXJyYXkgb2Yga2V5cywgb2Ygd2hpY2ggdGhlIGluZGV4IDAgd2lsbCBiZSB1c2VkIHRvIHNpZ25cbiAgICogICAgICAgICAgICAgZGF0YSwgYnV0IHZlcmlmaWNhdGlvbiBjYW4gaGFwcGVuIGFnYWluc3QgYW55IGtleS5cbiAgICovXG4gIGNvbnN0cnVjdG9yKGtleXM6IEtleVtdKSB7XG4gICAgaWYgKCEoMCBpbiBrZXlzKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcImtleXMgbXVzdCBjb250YWluIGF0IGxlYXN0IG9uZSB2YWx1ZVwiKTtcbiAgICB9XG4gICAgdGhpcy4ja2V5cyA9IGtleXM7XG4gIH1cblxuICAvKiogVGFrZSBgZGF0YWAgYW5kIHJldHVybiBhIFNIQTI1NiBITUFDIGRpZ2VzdCB0aGF0IHVzZXMgdGhlIGN1cnJlbnQgMCBpbmRleFxuICAgKiBvZiB0aGUgYGtleXNgIHBhc3NlZCB0byB0aGUgY29uc3RydWN0b3IuICBUaGlzIGRpZ2VzdCBpcyBpbiB0aGUgZm9ybSBvZiBhXG4gICAqIFVSTCBzYWZlIGJhc2U2NCBlbmNvZGVkIHN0cmluZy4gKi9cbiAgYXN5bmMgc2lnbihkYXRhOiBEYXRhKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBjb25zdCBrZXkgPSBhd2FpdCB0aGlzLiN0b0NyeXB0b0tleSh0aGlzLiNrZXlzWzBdKTtcbiAgICByZXR1cm4gZW5jb2RlQmFzZTY0U2FmZShhd2FpdCBzaWduKGRhdGEsIGtleSkpO1xuICB9XG5cbiAgLyoqIEdpdmVuIGBkYXRhYCBhbmQgYSBgZGlnZXN0YCwgdmVyaWZ5IHRoYXQgb25lIG9mIHRoZSBga2V5c2AgcHJvdmlkZWQgdGhlXG4gICAqIGNvbnN0cnVjdG9yIHdhcyB1c2VkIHRvIGdlbmVyYXRlIHRoZSBgZGlnZXN0YC4gIFJldHVybnMgYHRydWVgIGlmIG9uZSBvZlxuICAgKiB0aGUga2V5cyB3YXMgdXNlZCwgb3RoZXJ3aXNlIGBmYWxzZWAuICovXG4gIGFzeW5jIHZlcmlmeShkYXRhOiBEYXRhLCBkaWdlc3Q6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIHJldHVybiAoYXdhaXQgdGhpcy5pbmRleE9mKGRhdGEsIGRpZ2VzdCkpID4gLTE7XG4gIH1cblxuICAvKiogR2l2ZW4gYGRhdGFgIGFuZCBhIGBkaWdlc3RgLCByZXR1cm4gdGhlIGN1cnJlbnQgaW5kZXggb2YgdGhlIGtleSBpbiB0aGVcbiAgICogYGtleXNgIHBhc3NlZCB0aGUgY29uc3RydWN0b3IgdGhhdCB3YXMgdXNlZCB0byBnZW5lcmF0ZSB0aGUgZGlnZXN0LiAgSWYgbm9cbiAgICoga2V5IGNhbiBiZSBmb3VuZCwgdGhlIG1ldGhvZCByZXR1cm5zIGAtMWAuICovXG4gIGFzeW5jIGluZGV4T2YoZGF0YTogRGF0YSwgZGlnZXN0OiBzdHJpbmcpOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy4ja2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgY3J5cHRvS2V5ID0gYXdhaXQgdGhpcy4jdG9DcnlwdG9LZXkodGhpcy4ja2V5c1tpXSk7XG4gICAgICBpZiAoXG4gICAgICAgIGF3YWl0IGNvbXBhcmUoZGlnZXN0LCBlbmNvZGVCYXNlNjRTYWZlKGF3YWl0IHNpZ24oZGF0YSwgY3J5cHRvS2V5KSkpXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIGk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiAtMTtcbiAgfVxuXG4gIFtTeW1ib2wuZm9yKFwiRGVuby5jdXN0b21JbnNwZWN0XCIpXShpbnNwZWN0OiAodmFsdWU6IHVua25vd24pID0+IHN0cmluZykge1xuICAgIGNvbnN0IHsgbGVuZ3RoIH0gPSB0aGlzO1xuICAgIHJldHVybiBgJHt0aGlzLmNvbnN0cnVjdG9yLm5hbWV9ICR7aW5zcGVjdCh7IGxlbmd0aCB9KX1gO1xuICB9XG5cbiAgW1N5bWJvbC5mb3IoXCJub2RlanMudXRpbC5pbnNwZWN0LmN1c3RvbVwiKV0oXG4gICAgZGVwdGg6IG51bWJlcixcbiAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAgIG9wdGlvbnM6IGFueSxcbiAgICBpbnNwZWN0OiAodmFsdWU6IHVua25vd24sIG9wdGlvbnM/OiB1bmtub3duKSA9PiBzdHJpbmcsXG4gICkge1xuICAgIGlmIChkZXB0aCA8IDApIHtcbiAgICAgIHJldHVybiBvcHRpb25zLnN0eWxpemUoYFske3RoaXMuY29uc3RydWN0b3IubmFtZX1dYCwgXCJzcGVjaWFsXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IG5ld09wdGlvbnMgPSBPYmplY3QuYXNzaWduKHt9LCBvcHRpb25zLCB7XG4gICAgICBkZXB0aDogb3B0aW9ucy5kZXB0aCA9PT0gbnVsbCA/IG51bGwgOiBvcHRpb25zLmRlcHRoIC0gMSxcbiAgICB9KTtcbiAgICBjb25zdCB7IGxlbmd0aCB9ID0gdGhpcztcbiAgICByZXR1cm4gYCR7b3B0aW9ucy5zdHlsaXplKHRoaXMuY29uc3RydWN0b3IubmFtZSwgXCJzcGVjaWFsXCIpfSAke1xuICAgICAgaW5zcGVjdCh7IGxlbmd0aCB9LCBuZXdPcHRpb25zKVxuICAgIH1gO1xuICB9XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEseUVBQXlFO0FBRXpFLDJFQUEyRTtBQUMzRSwrRUFBK0U7QUFDL0UsNERBQTREO0FBRTVELFNBQVMsZUFBZSxRQUFRLFlBQVk7QUFDNUMsU0FBUyxnQkFBZ0IsRUFBRSxTQUFTLEVBQUUsSUFBSSxRQUFRLFlBQVk7QUFHOUQ7Ozs7Ozs7OztDQVNDLEdBQ0QsZUFBZSxRQUFRLENBQU8sRUFBRSxDQUFPLEVBQW9CO0lBQ3pELE1BQU0sTUFBTSxJQUFJLFdBQVc7SUFDM0IsV0FBVyxNQUFNLENBQUMsZUFBZSxDQUFDO0lBQ2xDLE1BQU0sWUFBWSxNQUFNLFVBQVU7SUFDbEMsTUFBTSxLQUFLLE1BQU0sS0FBSyxH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