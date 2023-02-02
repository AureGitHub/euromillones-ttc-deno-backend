// Copyright 2018-2022 the oak authors. All rights reserved. MIT license.
// This was heavily influenced by
// [cookies](https://github.com/pillarjs/cookies/blob/master/index.js)
const matchCache = {};
// deno-lint-ignore no-control-regex
const FIELD_CONTENT_REGEXP = /^[\u0009\u0020-\u007e\u0080-\u00ff]+$/;
const KEY_REGEXP = /(?:^|;) *([^=]*)=[^;]*/g;
const SAME_SITE_REGEXP = /^(?:lax|none|strict)$/i;
function getPattern(name) {
    if (name in matchCache) {
        return matchCache[name];
    }
    return matchCache[name] = new RegExp(`(?:^|;) *${name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}=([^;]*)`);
}
function pushCookie(headers, cookie) {
    if (cookie.overwrite) {
        for(let i = headers.length - 1; i >= 0; i--){
            if (headers[i].indexOf(`${cookie.name}=`) === 0) {
                headers.splice(i, 1);
            }
        }
    }
    headers.push(cookie.toHeader());
}
function validateCookieProperty(key, value) {
    if (value && !FIELD_CONTENT_REGEXP.test(value)) {
        throw new TypeError(`The ${key} of the cookie (${value}) is invalid.`);
    }
}
class Cookie {
    domain;
    expires;
    httpOnly = true;
    maxAge;
    name;
    overwrite = false;
    path = "/";
    sameSite = false;
    secure = false;
    signed;
    value;
    /** A logical representation of a cookie, used to internally manage the
   * cookie instances. */ constructor(name, value, attributes){
        validateCookieProperty("name", name);
        validateCookieProperty("value", value);
        this.name = name;
        this.value = value ?? "";
        Object.assign(this, attributes);
        if (!this.value) {
            this.expires = new Date(0);
            this.maxAge = undefined;
        }
        validateCookieProperty("path", this.path);
        validateCookieProperty("domain", this.domain);
        if (this.sameSite && typeof this.sameSite === "string" && !SAME_SITE_REGEXP.test(this.sameSite)) {
            throw new TypeError(`The sameSite of the cookie ("${this.sameSite}") is invalid.`);
        }
    }
    toHeader() {
        let header = this.toString();
        if (this.maxAge) {
            this.expires = new Date(Date.now() + this.maxAge * 1000);
        }
        if (this.path) {
            header += `; path=${this.path}`;
        }
        if (this.expires) {
            header += `; expires=${this.expires.toUTCString()}`;
        }
        if (this.domain) {
            header += `; domain=${this.domain}`;
        }
        if (this.sameSite) {
            header += `; samesite=${this.sameSite === true ? "strict" : this.sameSite.toLowerCase()}`;
        }
        if (this.secure) {
            header += "; secure";
        }
        if (this.httpOnly) {
            header += "; httponly";
        }
        return header;
    }
    toString() {
        return `${this.name}=${this.value}`;
    }
}
/** An interface which allows setting and accessing cookies related to both the
 * current request and response. Each {@linkcode Context} has a property
 * `.cookies` which is an instance of this class.
 *
 * Because oak supports automatic encryption, most methods (except `.delete`)
 * are asynchronous. This is because oak leverages the Web Crypto APIs, which
 * are asynchronous by nature.
 *
 * ### Example
 *
 * ```ts
 * import { Application } from "https://deno.land/x/oak/mod.ts";
 *
 * const app = new Application();
 *
 * app.use(async (ctx) => {
 *   for await (const cookie of ctx.cookies) {
 *     // iterating over each cookie
 *   }
 *   await ctx.cookie.set("myCookie", "a value"); // setting or updating a cookie
 *   const id = await ctx.cookie.get("my-id"); // getting a value of a cookie if present
 *   ctx.cookie.delete();
 * });
 * ```
 */ export class Cookies {
    #cookieKeys;
    #keys;
    #request;
    #response;
    #secure;
    #requestKeys() {
        if (this.#cookieKeys) {
            return this.#cookieKeys;
        }
        const result = this.#cookieKeys = [];
        const header = this.#request.headers.get("cookie");
        if (!header) {
            return result;
        }
        let matches;
        while(matches = KEY_REGEXP.exec(header)){
            const [, key] = matches;
            result.push(key);
        }
        return result;
    }
    constructor(request, response, options = {}){
        const { keys , secure  } = options;
        this.#keys = keys;
        this.#request = request;
        this.#response = response;
        this.#secure = secure;
    }
    /** Set a cookie to be deleted in the response.  This is a "shortcut" to
   * `.set(name, null, options?)`. */ delete(name, options = {}) {
        this.set(name, null, options);
        return true;
    }
    /** Iterate over the request's cookies, yielding up a tuple containing the
   * key and the value.
   *
   * If there are keys set on the application, only keys and values that are
   * properly signed will be returned. */ async *entries() {
        const keys = this.#requestKeys();
        for (const key of keys){
            const value = await this.get(key);
            if (value) {
                yield [
                    key,
                    value
                ];
            }
        }
    }
    async forEach(callback, // deno-lint-ignore no-explicit-any
    thisArg = null) {
        const keys = this.#requestKeys();
        for (const key of keys){
            const value = await this.get(key);
            if (value) {
                callback.call(thisArg, key, value, this);
            }
        }
    }
    /** Get the value of a cookie from the request.
   *
   * If the cookie is signed, and the signature is invalid, the cookie will
   * be set to be deleted in the the response.  If the signature uses an "old"
   * key, the cookie will be re-signed with the current key and be added to the
   * response to be updated. */ async get(name, options = {}) {
        const signed = options.signed ?? !!this.#keys;
        const nameSig = `${name}.sig`;
        const header = this.#request.headers.get("cookie");
        if (!header) {
            return;
        }
        const match = header.match(getPattern(name));
        if (!match) {
            return;
        }
        const [, value] = match;
        if (!signed) {
            return value;
        }
        const digest = await this.get(nameSig, {
            signed: false
        });
        if (!digest) {
            return;
        }
        const data = `${name}=${value}`;
        if (!this.#keys) {
            throw new TypeError("keys required for signed cookies");
        }
        const index = await this.#keys.indexOf(data, digest);
        if (index < 0) {
            this.delete(nameSig, {
                path: "/",
                signed: false
            });
        } else {
            if (index) {
                // the key has "aged" and needs to be re-signed
                this.set(nameSig, await this.#keys.sign(data), {
                    signed: false
                });
            }
            return value;
        }
    }
    /** Iterate over the request's cookies, yielding up the keys.
   *
   * If there are keys set on the application, only the keys that are properly
   * signed will be returned. */ async *keys() {
        const keys = this.#requestKeys();
        for (const key of keys){
            const value = await this.get(key);
            if (value) {
                yield key;
            }
        }
    }
    /** Set a cookie in the response.
   *
   * If there are keys set in the application, cookies will be automatically
   * signed, unless overridden by the set options.  Cookies can be deleted by
   * setting the value to `null`. */ async set(name, value, options = {}) {
        const request = this.#request;
        const response = this.#response;
        const headers = [];
        for (const [key, value1] of response.headers.entries()){
            if (key === "set-cookie") {
                headers.push(value1);
            }
        }
        const secure = this.#secure !== undefined ? this.#secure : request.secure;
        const signed = options.signed ?? !!this.#keys;
        if (!secure && options.secure && !options.ignoreInsecure) {
            throw new TypeError("Cannot send secure cookie over unencrypted connection.");
        }
        const cookie = new Cookie(name, value, options);
        cookie.secure = options.secure ?? secure;
        pushCookie(headers, cookie);
        if (signed) {
            if (!this.#keys) {
                throw new TypeError(".keys required for signed cookies.");
            }
            cookie.value = await this.#keys.sign(cookie.toString());
            cookie.name += ".sig";
            pushCookie(headers, cookie);
        }
        response.headers.delete("Set-Cookie");
        for (const header of headers){
            response.headers.append("Set-Cookie", header);
        }
        return this;
    }
    /** Iterate over the request's cookies, yielding up each value.
   *
   * If there are keys set on the application, only the values that are
   * properly signed will be returned. */ async *values() {
        const keys = this.#requestKeys();
        for (const key of keys){
            const value = await this.get(key);
            if (value) {
                yield value;
            }
        }
    }
    /** Iterate over the request's cookies, yielding up a tuple containing the
   * key and the value.
   *
   * If there are keys set on the application, only keys and values that are
   * properly signed will be returned. */ async *[Symbol.asyncIterator]() {
        const keys = this.#requestKeys();
        for (const key of keys){
            const value = await this.get(key);
            if (value) {
                yield [
                    key,
                    value
                ];
            }
        }
    }
    [Symbol.for("Deno.customInspect")]() {
        return `${this.constructor.name} []`;
    }
    [Symbol.for("nodejs.util.inspect.custom")](depth, // deno-lint-ignore no-explicit-any
    options, inspect) {
        if (depth < 0) {
            return options.stylize(`[${this.constructor.name}]`, "special");
        }
        const newOptions = Object.assign({}, options, {
            depth: options.depth === null ? null : options.depth - 1
        });
        return `${options.stylize(this.constructor.name, "special")} ${inspect([], newOptions)}`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMS4xLjAvY29va2llcy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBvYWsgYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG5cbi8vIFRoaXMgd2FzIGhlYXZpbHkgaW5mbHVlbmNlZCBieVxuLy8gW2Nvb2tpZXNdKGh0dHBzOi8vZ2l0aHViLmNvbS9waWxsYXJqcy9jb29raWVzL2Jsb2IvbWFzdGVyL2luZGV4LmpzKVxuXG5pbXBvcnQgdHlwZSB7IEtleVN0YWNrIH0gZnJvbSBcIi4va2V5U3RhY2sudHNcIjtcbmltcG9ydCB0eXBlIHsgUmVxdWVzdCB9IGZyb20gXCIuL3JlcXVlc3QudHNcIjtcbmltcG9ydCB0eXBlIHsgUmVzcG9uc2UgfSBmcm9tIFwiLi9yZXNwb25zZS50c1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIENvb2tpZXNPcHRpb25zIHtcbiAga2V5cz86IEtleVN0YWNrO1xuICBzZWN1cmU/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENvb2tpZXNHZXRPcHRpb25zIHtcbiAgc2lnbmVkPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDb29raWVzU2V0RGVsZXRlT3B0aW9ucyB7XG4gIGRvbWFpbj86IHN0cmluZztcbiAgZXhwaXJlcz86IERhdGU7XG4gIGh0dHBPbmx5PzogYm9vbGVhbjtcbiAgLyoqIEZvciB1c2UgaW4gc2l0dWF0aW9ucyB3aGVyZSByZXF1ZXN0cyBhcmUgcHJlc2VudGVkIHRvIERlbm8gYXMgXCJpbnNlY3VyZVwiXG4gICAqIGJ1dCBhcmUgb3RoZXJ3aXNlIHNlY3VyZSBhbmQgc28gc2VjdXJlIGNvb2tpZXMgY2FuIGJlIHRyZWF0ZWQgYXMgc2VjdXJlLiAqL1xuICBpZ25vcmVJbnNlY3VyZT86IGJvb2xlYW47XG4gIG1heEFnZT86IG51bWJlcjtcbiAgb3ZlcndyaXRlPzogYm9vbGVhbjtcbiAgcGF0aD86IHN0cmluZztcbiAgc2VjdXJlPzogYm9vbGVhbjtcbiAgc2FtZVNpdGU/OiBcInN0cmljdFwiIHwgXCJsYXhcIiB8IFwibm9uZVwiIHwgYm9vbGVhbjtcbiAgc2lnbmVkPzogYm9vbGVhbjtcbn1cblxudHlwZSBDb29raWVBdHRyaWJ1dGVzID0gQ29va2llc1NldERlbGV0ZU9wdGlvbnM7XG5cbmNvbnN0IG1hdGNoQ2FjaGU6IFJlY29yZDxzdHJpbmcsIFJlZ0V4cD4gPSB7fTtcblxuLy8gZGVuby1saW50LWlnbm9yZSBuby1jb250cm9sLXJlZ2V4XG5jb25zdCBGSUVMRF9DT05URU5UX1JFR0VYUCA9IC9eW1xcdTAwMDlcXHUwMDIwLVxcdTAwN2VcXHUwMDgwLVxcdTAwZmZdKyQvO1xuY29uc3QgS0VZX1JFR0VYUCA9IC8oPzpefDspICooW149XSopPVteO10qL2c7XG5jb25zdCBTQU1FX1NJVEVfUkVHRVhQID0gL14oPzpsYXh8bm9uZXxzdHJpY3QpJC9pO1xuXG5mdW5jdGlvbiBnZXRQYXR0ZXJuKG5hbWU6IHN0cmluZyk6IFJlZ0V4cCB7XG4gIGlmIChuYW1lIGluIG1hdGNoQ2FjaGUpIHtcbiAgICByZXR1cm4gbWF0Y2hDYWNoZVtuYW1lXTtcbiAgfVxuXG4gIHJldHVybiBtYXRjaENhY2hlW25hbWVdID0gbmV3IFJlZ0V4cChcbiAgICBgKD86Xnw7KSAqJHtuYW1lLnJlcGxhY2UoL1stW1xcXXt9KCkqKz8uLFxcXFxeJHwjXFxzXS9nLCBcIlxcXFwkJlwiKX09KFteO10qKWAsXG4gICk7XG59XG5cbmZ1bmN0aW9uIHB1c2hDb29raWUoaGVhZGVyczogc3RyaW5nW10sIGNvb2tpZTogQ29va2llKTogdm9pZCB7XG4gIGlmIChjb29raWUub3ZlcndyaXRlKSB7XG4gICAgZm9yIChsZXQgaSA9IGhlYWRlcnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgIGlmIChoZWFkZXJzW2ldLmluZGV4T2YoYCR7Y29va2llLm5hbWV9PWApID09PSAwKSB7XG4gICAgICAgIGhlYWRlcnMuc3BsaWNlKGksIDEpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBoZWFkZXJzLnB1c2goY29va2llLnRvSGVhZGVyKCkpO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUNvb2tpZVByb3BlcnR5KFxuICBrZXk6IHN0cmluZyxcbiAgdmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCB8IG51bGwsXG4pOiB2b2lkIHtcbiAgaWYgKHZhbHVlICYmICFGSUVMRF9DT05URU5UX1JFR0VYUC50ZXN0KHZhbHVlKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoYFRoZSAke2tleX0gb2YgdGhlIGNvb2tpZSAoJHt2YWx1ZX0pIGlzIGludmFsaWQuYCk7XG4gIH1cbn1cblxuY2xhc3MgQ29va2llIGltcGxlbWVudHMgQ29va2llQXR0cmlidXRlcyB7XG4gIGRvbWFpbj86IHN0cmluZztcbiAgZXhwaXJlcz86IERhdGU7XG4gIGh0dHBPbmx5ID0gdHJ1ZTtcbiAgbWF4QWdlPzogbnVtYmVyO1xuICBuYW1lOiBzdHJpbmc7XG4gIG92ZXJ3cml0ZSA9IGZhbHNlO1xuICBwYXRoID0gXCIvXCI7XG4gIHNhbWVTaXRlOiBcInN0cmljdFwiIHwgXCJsYXhcIiB8IFwibm9uZVwiIHwgYm9vbGVhbiA9IGZhbHNlO1xuICBzZWN1cmUgPSBmYWxzZTtcbiAgc2lnbmVkPzogYm9vbGVhbjtcbiAgdmFsdWU6IHN0cmluZztcblxuICAvKiogQSBsb2dpY2FsIHJlcHJlc2VudGF0aW9uIG9mIGEgY29va2llLCB1c2VkIHRvIGludGVybmFsbHkgbWFuYWdlIHRoZVxuICAgKiBjb29raWUgaW5zdGFuY2VzLiAqL1xuICBjb25zdHJ1Y3RvcihcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgdmFsdWU6IHN0cmluZyB8IG51bGwsXG4gICAgYXR0cmlidXRlczogQ29va2llQXR0cmlidXRlcyxcbiAgKSB7XG4gICAgdmFsaWRhdGVDb29raWVQcm9wZXJ0eShcIm5hbWVcIiwgbmFtZSk7XG4gICAgdmFsaWRhdGVDb29raWVQcm9wZXJ0eShcInZhbHVlXCIsIHZhbHVlKTtcbiAgICB0aGlzLm5hbWUgPSBuYW1lO1xuICAgIHRoaXMudmFsdWUgPSB2YWx1ZSA/PyBcIlwiO1xuICAgIE9iamVjdC5hc3NpZ24odGhpcywgYXR0cmlidXRlcyk7XG4gICAgaWYgKCF0aGlzLnZhbHVlKSB7XG4gICAgICB0aGlzLmV4cGlyZXMgPSBuZXcgRGF0ZSgwKTtcbiAgICAgIHRoaXMubWF4QWdlID0gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIHZhbGlkYXRlQ29va2llUHJvcGVydHkoXCJwYXRoXCIsIHRoaXMucGF0aCk7XG4gICAgdmFsaWRhdGVDb29raWVQcm9wZXJ0eShcImRvbWFpblwiLCB0aGlzLmRvbWFpbik7XG4gICAgaWYgKFxuICAgICAgdGhpcy5zYW1lU2l0ZSAmJiB0eXBlb2YgdGhpcy5zYW1lU2l0ZSA9PT0gXCJzdHJpbmdcIiAmJlxuICAgICAgIVNBTUVfU0lURV9SRUdFWFAudGVzdCh0aGlzLnNhbWVTaXRlKVxuICAgICkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcbiAgICAgICAgYFRoZSBzYW1lU2l0ZSBvZiB0aGUgY29va2llIChcIiR7dGhpcy5zYW1lU2l0ZX1cIikgaXMgaW52YWxpZC5gLFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICB0b0hlYWRlcigpOiBzdHJpbmcge1xuICAgIGxldCBoZWFkZXIgPSB0aGlzLnRvU3RyaW5nKCk7XG4gICAgaWYgKHRoaXMubWF4QWdlKSB7XG4gICAgICB0aGlzLmV4cGlyZXMgPSBuZXcgRGF0ZShEYXRlLm5vdygpICsgKHRoaXMubWF4QWdlICogMTAwMCkpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLnBhdGgpIHtcbiAgICAgIGhlYWRlciArPSBgOyBwYXRoPSR7dGhpcy5wYXRofWA7XG4gICAgfVxuICAgIGlmICh0aGlzLmV4cGlyZXMpIHtcbiAgICAgIGhlYWRlciArPSBgOyBleHBpcmVzPSR7dGhpcy5leHBpcmVzLnRvVVRDU3RyaW5nKCl9YDtcbiAgICB9XG4gICAgaWYgKHRoaXMuZG9tYWluKSB7XG4gICAgICBoZWFkZXIgKz0gYDsgZG9tYWluPSR7dGhpcy5kb21haW59YDtcbiAgICB9XG4gICAgaWYgKHRoaXMuc2FtZVNpdGUpIHtcbiAgICAgIGhlYWRlciArPSBgOyBzYW1lc2l0ZT0ke1xuICAgICAgICB0aGlzLnNhbWVTaXRlID09PSB0cnVlID8gXCJzdHJpY3RcIiA6IHRoaXMuc2FtZVNpdGUudG9Mb3dlckNhc2UoKVxuICAgICAgfWA7XG4gICAgfVxuICAgIGlmICh0aGlzLnNlY3VyZSkge1xuICAgICAgaGVhZGVyICs9IFwiOyBzZWN1cmVcIjtcbiAgICB9XG4gICAgaWYgKHRoaXMuaHR0cE9ubHkpIHtcbiAgICAgIGhlYWRlciArPSBcIjsgaHR0cG9ubHlcIjtcbiAgICB9XG5cbiAgICByZXR1cm4gaGVhZGVyO1xuICB9XG5cbiAgdG9TdHJpbmcoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gYCR7dGhpcy5uYW1lfT0ke3RoaXMudmFsdWV9YDtcbiAgfVxufVxuXG4vKiogQW4gaW50ZXJmYWNlIHdoaWNoIGFsbG93cyBzZXR0aW5nIGFuZCBhY2Nlc3NpbmcgY29va2llcyByZWxhdGVkIHRvIGJvdGggdGhlXG4gKiBjdXJyZW50IHJlcXVlc3QgYW5kIHJlc3BvbnNlLiBFYWNoIHtAbGlua2NvZGUgQ29udGV4dH0gaGFzIGEgcHJvcGVydHlcbiAqIGAuY29va2llc2Agd2hpY2ggaXMgYW4gaW5zdGFuY2Ugb2YgdGhpcyBjbGFzcy5cbiAqXG4gKiBCZWNhdXNlIG9hayBzdXBwb3J0cyBhdXRvbWF0aWMgZW5jcnlwdGlvbiwgbW9zdCBtZXRob2RzIChleGNlcHQgYC5kZWxldGVgKVxuICogYXJlIGFzeW5jaHJvbm91cy4gVGhpcyBpcyBiZWNhdXNlIG9hayBsZXZlcmFnZXMgdGhlIFdlYiBDcnlwdG8gQVBJcywgd2hpY2hcbiAqIGFyZSBhc3luY2hyb25vdXMgYnkgbmF0dXJlLlxuICpcbiAqICMjIyBFeGFtcGxlXG4gKlxuICogYGBgdHNcbiAqIGltcG9ydCB7IEFwcGxpY2F0aW9uIH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrL21vZC50c1wiO1xuICpcbiAqIGNvbnN0IGFwcCA9IG5ldyBBcHBsaWNhdGlvbigpO1xuICpcbiAqIGFwcC51c2UoYXN5bmMgKGN0eCkgPT4ge1xuICogICBmb3IgYXdhaXQgKGNvbnN0IGNvb2tpZSBvZiBjdHguY29va2llcykge1xuICogICAgIC8vIGl0ZXJhdGluZyBvdmVyIGVhY2ggY29va2llXG4gKiAgIH1cbiAqICAgYXdhaXQgY3R4LmNvb2tpZS5zZXQoXCJteUNvb2tpZVwiLCBcImEgdmFsdWVcIik7IC8vIHNldHRpbmcgb3IgdXBkYXRpbmcgYSBjb29raWVcbiAqICAgY29uc3QgaWQgPSBhd2FpdCBjdHguY29va2llLmdldChcIm15LWlkXCIpOyAvLyBnZXR0aW5nIGEgdmFsdWUgb2YgYSBjb29raWUgaWYgcHJlc2VudFxuICogICBjdHguY29va2llLmRlbGV0ZSgpO1xuICogfSk7XG4gKiBgYGBcbiAqL1xuZXhwb3J0IGNsYXNzIENvb2tpZXMge1xuICAjY29va2llS2V5cz86IHN0cmluZ1tdO1xuICAja2V5cz86IEtleVN0YWNrO1xuICAjcmVxdWVzdDogUmVxdWVzdDtcbiAgI3Jlc3BvbnNlOiBSZXNwb25zZTtcbiAgI3NlY3VyZT86IGJvb2xlYW47XG5cbiAgI3JlcXVlc3RLZXlzKCk6IHN0cmluZ1tdIHtcbiAgICBpZiAodGhpcy4jY29va2llS2V5cykge1xuICAgICAgcmV0dXJuIHRoaXMuI2Nvb2tpZUtleXM7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMuI2Nvb2tpZUtleXMgPSBbXSBhcyBzdHJpbmdbXTtcbiAgICBjb25zdCBoZWFkZXIgPSB0aGlzLiNyZXF1ZXN0LmhlYWRlcnMuZ2V0KFwiY29va2llXCIpO1xuICAgIGlmICghaGVhZGVyKSB7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICBsZXQgbWF0Y2hlczogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcbiAgICB3aGlsZSAoKG1hdGNoZXMgPSBLRVlfUkVHRVhQLmV4ZWMoaGVhZGVyKSkpIHtcbiAgICAgIGNvbnN0IFssIGtleV0gPSBtYXRjaGVzO1xuICAgICAgcmVzdWx0LnB1c2goa2V5KTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHJlcXVlc3Q6IFJlcXVlc3QsXG4gICAgcmVzcG9uc2U6IFJlc3BvbnNlLFxuICAgIG9wdGlvbnM6IENvb2tpZXNPcHRpb25zID0ge30sXG4gICkge1xuICAgIGNvbnN0IHsga2V5cywgc2VjdXJlIH0gPSBvcHRpb25zO1xuICAgIHRoaXMuI2tleXMgPSBrZXlzO1xuICAgIHRoaXMuI3JlcXVlc3QgPSByZXF1ZXN0O1xuICAgIHRoaXMuI3Jlc3BvbnNlID0gcmVzcG9uc2U7XG4gICAgdGhpcy4jc2VjdXJlID0gc2VjdXJlO1xuICB9XG5cbiAgLyoqIFNldCBhIGNvb2tpZSB0byBiZSBkZWxldGVkIGluIHRoZSByZXNwb25zZS4gIFRoaXMgaXMgYSBcInNob3J0Y3V0XCIgdG9cbiAgICogYC5zZXQobmFtZSwgbnVsbCwgb3B0aW9ucz8pYC4gKi9cbiAgZGVsZXRlKG5hbWU6IHN0cmluZywgb3B0aW9uczogQ29va2llc1NldERlbGV0ZU9wdGlvbnMgPSB7fSk6IGJvb2xlYW4ge1xuICAgIHRoaXMuc2V0KG5hbWUsIG51bGwsIG9wdGlvbnMpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgLyoqIEl0ZXJhdGUgb3ZlciB0aGUgcmVxdWVzdCdzIGNvb2tpZXMsIHlpZWxkaW5nIHVwIGEgdHVwbGUgY29udGFpbmluZyB0aGVcbiAgICoga2V5IGFuZCB0aGUgdmFsdWUuXG4gICAqXG4gICAqIElmIHRoZXJlIGFyZSBrZXlzIHNldCBvbiB0aGUgYXBwbGljYXRpb24sIG9ubHkga2V5cyBhbmQgdmFsdWVzIHRoYXQgYXJlXG4gICAqIHByb3Blcmx5IHNpZ25lZCB3aWxsIGJlIHJldHVybmVkLiAqL1xuICBhc3luYyAqZW50cmllcygpOiBBc3luY0l0ZXJhYmxlSXRlcmF0b3I8W3N0cmluZywgc3RyaW5nXT4ge1xuICAgIGNvbnN0IGtleXMgPSB0aGlzLiNyZXF1ZXN0S2V5cygpO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICAgIGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5nZXQoa2V5KTtcbiAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICB5aWVsZCBba2V5LCB2YWx1ZV07XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZm9yRWFjaChcbiAgICBjYWxsYmFjazogKGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nLCBjb29raWVzOiB0aGlzKSA9PiB2b2lkLFxuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgdGhpc0FyZzogYW55ID0gbnVsbCxcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qga2V5cyA9IHRoaXMuI3JlcXVlc3RLZXlzKCk7XG4gICAgZm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuICAgICAgY29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLmdldChrZXkpO1xuICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgIGNhbGxiYWNrLmNhbGwodGhpc0FyZywga2V5LCB2YWx1ZSwgdGhpcyk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqIEdldCB0aGUgdmFsdWUgb2YgYSBjb29raWUgZnJvbSB0aGUgcmVxdWVzdC5cbiAgICpcbiAgICogSWYgdGhlIGNvb2tpZSBpcyBzaWduZWQsIGFuZCB0aGUgc2lnbmF0dXJlIGlzIGludmFsaWQsIHRoZSBjb29raWUgd2lsbFxuICAgKiBiZSBzZXQgdG8gYmUgZGVsZXRlZCBpbiB0aGUgdGhlIHJlc3BvbnNlLiAgSWYgdGhlIHNpZ25hdHVyZSB1c2VzIGFuIFwib2xkXCJcbiAgICoga2V5LCB0aGUgY29va2llIHdpbGwgYmUgcmUtc2lnbmVkIHdpdGggdGhlIGN1cnJlbnQga2V5IGFuZCBiZSBhZGRlZCB0byB0aGVcbiAgICogcmVzcG9uc2UgdG8gYmUgdXBkYXRlZC4gKi9cbiAgYXN5bmMgZ2V0KFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBvcHRpb25zOiBDb29raWVzR2V0T3B0aW9ucyA9IHt9LFxuICApOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuICAgIGNvbnN0IHNpZ25lZCA9IG9wdGlvbnMuc2lnbmVkID8/ICEhdGhpcy4ja2V5cztcbiAgICBjb25zdCBuYW1lU2lnID0gYCR7bmFtZX0uc2lnYDtcblxuICAgIGNvbnN0IGhlYWRlciA9IHRoaXMuI3JlcXVlc3QuaGVhZGVycy5nZXQoXCJjb29raWVcIik7XG4gICAgaWYgKCFoZWFkZXIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgbWF0Y2ggPSBoZWFkZXIubWF0Y2goZ2V0UGF0dGVybihuYW1lKSk7XG4gICAgaWYgKCFtYXRjaCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBbLCB2YWx1ZV0gPSBtYXRjaDtcbiAgICBpZiAoIXNpZ25lZCkge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cbiAgICBjb25zdCBkaWdlc3QgPSBhd2FpdCB0aGlzLmdldChuYW1lU2lnLCB7IHNpZ25lZDogZmFsc2UgfSk7XG4gICAgaWYgKCFkaWdlc3QpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgZGF0YSA9IGAke25hbWV9PSR7dmFsdWV9YDtcbiAgICBpZiAoIXRoaXMuI2tleXMpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJrZXlzIHJlcXVpcmVkIGZvciBzaWduZWQgY29va2llc1wiKTtcbiAgICB9XG4gICAgY29uc3QgaW5kZXggPSBhd2FpdCB0aGlzLiNrZXlzLmluZGV4T2YoZGF0YSwgZGlnZXN0KTtcblxuICAgIGlmIChpbmRleCA8IDApIHtcbiAgICAgIHRoaXMuZGVsZXRlKG5hbWVTaWcsIHsgcGF0aDogXCIvXCIsIHNpZ25lZDogZmFsc2UgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChpbmRleCkge1xuICAgICAgICAvLyB0aGUga2V5IGhhcyBcImFnZWRcIiBhbmQgbmVlZHMgdG8gYmUgcmUtc2lnbmVkXG4gICAgICAgIHRoaXMuc2V0KG5hbWVTaWcsIGF3YWl0IHRoaXMuI2tleXMuc2lnbihkYXRhKSwgeyBzaWduZWQ6IGZhbHNlIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIC8qKiBJdGVyYXRlIG92ZXIgdGhlIHJlcXVlc3QncyBjb29raWVzLCB5aWVsZGluZyB1cCB0aGUga2V5cy5cbiAgICpcbiAgICogSWYgdGhlcmUgYXJlIGtleXMgc2V0IG9uIHRoZSBhcHBsaWNhdGlvbiwgb25seSB0aGUga2V5cyB0aGF0IGFyZSBwcm9wZXJseVxuICAgKiBzaWduZWQgd2lsbCBiZSByZXR1cm5lZC4gKi9cbiAgYXN5bmMgKmtleXMoKTogQXN5bmNJdGVyYWJsZUl0ZXJhdG9yPHN0cmluZz4ge1xuICAgIGNvbnN0IGtleXMgPSB0aGlzLiNyZXF1ZXN0S2V5cygpO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICAgIGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5nZXQoa2V5KTtcbiAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICB5aWVsZCBrZXk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqIFNldCBhIGNvb2tpZSBpbiB0aGUgcmVzcG9uc2UuXG4gICAqXG4gICAqIElmIHRoZXJlIGFyZSBrZXlzIHNldCBpbiB0aGUgYXBwbGljYXRpb24sIGNvb2tpZXMgd2lsbCBiZSBhdXRvbWF0aWNhbGx5XG4gICAqIHNpZ25lZCwgdW5sZXNzIG92ZXJyaWRkZW4gYnkgdGhlIHNldCBvcHRpb25zLiAgQ29va2llcyBjYW4gYmUgZGVsZXRlZCBieVxuICAgKiBzZXR0aW5nIHRoZSB2YWx1ZSB0byBgbnVsbGAuICovXG4gIGFzeW5jIHNldChcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgdmFsdWU6IHN0cmluZyB8IG51bGwsXG4gICAgb3B0aW9uczogQ29va2llc1NldERlbGV0ZU9wdGlvbnMgPSB7fSxcbiAgKTogUHJvbWlzZTx0aGlzPiB7XG4gICAgY29uc3QgcmVxdWVzdCA9IHRoaXMuI3JlcXVlc3Q7XG4gICAgY29uc3QgcmVzcG9uc2UgPSB0aGlzLiNyZXNwb25zZTtcbiAgICBjb25zdCBoZWFkZXJzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHJlc3BvbnNlLmhlYWRlcnMuZW50cmllcygpKSB7XG4gICAgICBpZiAoa2V5ID09PSBcInNldC1jb29raWVcIikge1xuICAgICAgICBoZWFkZXJzLnB1c2godmFsdWUpO1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBzZWN1cmUgPSB0aGlzLiNzZWN1cmUgIT09IHVuZGVmaW5lZCA/IHRoaXMuI3NlY3VyZSA6IHJlcXVlc3Quc2VjdXJlO1xuICAgIGNvbnN0IHNpZ25lZCA9IG9wdGlvbnMuc2lnbmVkID8/ICEhdGhpcy4ja2V5cztcblxuICAgIGlmICghc2VjdXJlICYmIG9wdGlvbnMuc2VjdXJlICYmICFvcHRpb25zLmlnbm9yZUluc2VjdXJlKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFxuICAgICAgICBcIkNhbm5vdCBzZW5kIHNlY3VyZSBjb29raWUgb3ZlciB1bmVuY3J5cHRlZCBjb25uZWN0aW9uLlwiLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBjb29raWUgPSBuZXcgQ29va2llKG5hbWUsIHZhbHVlLCBvcHRpb25zKTtcbiAgICBjb29raWUuc2VjdXJlID0gb3B0aW9ucy5zZWN1cmUgPz8gc2VjdXJlO1xuICAgIHB1c2hDb29raWUoaGVhZGVycywgY29va2llKTtcblxuICAgIGlmIChzaWduZWQpIHtcbiAgICAgIGlmICghdGhpcy4ja2V5cykge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiLmtleXMgcmVxdWlyZWQgZm9yIHNpZ25lZCBjb29raWVzLlwiKTtcbiAgICAgIH1cbiAgICAgIGNvb2tpZS52YWx1ZSA9IGF3YWl0IHRoaXMuI2tleXMuc2lnbihjb29raWUudG9TdHJpbmcoKSk7XG4gICAgICBjb29raWUubmFtZSArPSBcIi5zaWdcIjtcbiAgICAgIHB1c2hDb29raWUoaGVhZGVycywgY29va2llKTtcbiAgICB9XG5cbiAgICByZXNwb25zZS5oZWFkZXJzLmRlbGV0ZShcIlNldC1Db29raWVcIik7XG4gICAgZm9yIChjb25zdCBoZWFkZXIgb2YgaGVhZGVycykge1xuICAgICAgcmVzcG9uc2UuaGVhZGVycy5hcHBlbmQoXCJTZXQtQ29va2llXCIsIGhlYWRlcik7XG4gICAgfVxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqIEl0ZXJhdGUgb3ZlciB0aGUgcmVxdWVzdCdzIGNvb2tpZXMsIHlpZWxkaW5nIHVwIGVhY2ggdmFsdWUuXG4gICAqXG4gICAqIElmIHRoZXJlIGFyZSBrZXlzIHNldCBvbiB0aGUgYXBwbGljYXRpb24sIG9ubHkgdGhlIHZhbHVlcyB0aGF0IGFyZVxuICAgKiBwcm9wZXJseSBzaWduZWQgd2lsbCBiZSByZXR1cm5lZC4gKi9cbiAgYXN5bmMgKnZhbHVlcygpOiBBc3luY0l0ZXJhYmxlSXRlcmF0b3I8c3RyaW5nPiB7XG4gICAgY29uc3Qga2V5cyA9IHRoaXMuI3JlcXVlc3RLZXlzKCk7XG4gICAgZm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuICAgICAgY29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLmdldChrZXkpO1xuICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgIHlpZWxkIHZhbHVlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKiBJdGVyYXRlIG92ZXIgdGhlIHJlcXVlc3QncyBjb29raWVzLCB5aWVsZGluZyB1cCBhIHR1cGxlIGNvbnRhaW5pbmcgdGhlXG4gICAqIGtleSBhbmQgdGhlIHZhbHVlLlxuICAgKlxuICAgKiBJZiB0aGVyZSBhcmUga2V5cyBzZXQgb24gdGhlIGFwcGxpY2F0aW9uLCBvbmx5IGtleXMgYW5kIHZhbHVlcyB0aGF0IGFyZVxuICAgKiBwcm9wZXJseSBzaWduZWQgd2lsbCBiZSByZXR1cm5lZC4gKi9cbiAgYXN5bmMgKltTeW1ib2wuYXN5bmNJdGVyYXRvcl0oKTogQXN5bmNJdGVyYWJsZUl0ZXJhdG9yPFtzdHJpbmcsIHN0cmluZ10+IHtcbiAgICBjb25zdCBrZXlzID0gdGhpcy4jcmVxdWVzdEtleXMoKTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgICBjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMuZ2V0KGtleSk7XG4gICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgeWllbGQgW2tleSwgdmFsdWVdO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIFtTeW1ib2wuZm9yKFwiRGVuby5jdXN0b21JbnNwZWN0XCIpXSgpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5jb25zdHJ1Y3Rvci5uYW1lfSBbXWA7XG4gIH1cblxuICBbU3ltYm9sLmZvcihcIm5vZGVqcy51dGlsLmluc3BlY3QuY3VzdG9tXCIpXShcbiAgICBkZXB0aDogbnVtYmVyLFxuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgb3B0aW9uczogYW55LFxuICAgIGluc3BlY3Q6ICh2YWx1ZTogdW5rbm93biwgb3B0aW9ucz86IHVua25vd24pID0+IHN0cmluZyxcbiAgKSB7XG4gICAgaWYgKGRlcHRoIDwgMCkge1xuICAgICAgcmV0dXJuIG9wdGlvbnMuc3R5bGl6ZShgWyR7dGhpcy5jb25zdHJ1Y3Rvci5uYW1lfV1gLCBcInNwZWNpYWxcIik7XG4gICAgfVxuXG4gICAgY29uc3QgbmV3T3B0aW9ucyA9IE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIHtcbiAgICAgIGRlcHRoOiBvcHRpb25zLmRlcHRoID09PSBudWxsID8gbnVsbCA6IG9wdGlvbnMuZGVwdGggLSAxLFxuICAgIH0pO1xuICAgIHJldHVybiBgJHtvcHRpb25zLnN0eWxpemUodGhpcy5jb25zdHJ1Y3Rvci5uYW1lLCBcInNwZWNpYWxcIil9ICR7XG4gICAgICBpbnNwZWN0KFtdLCBuZXdPcHRpb25zKVxuICAgIH1gO1xuICB9XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEseUVBQXlFO0FBRXpFLGlDQUFpQztBQUNqQyxzRUFBc0U7QUFnQ3RFLE1BQU0sYUFBcUMsQ0FBQztBQUU1QyxvQ0FBb0M7QUFDcEMsTUFBTSx1QkFBdUI7QUFDN0IsTUFBTSxhQUFhO0FBQ25CLE1BQU0sbUJBQW1CO0FBRXpCLFNBQVMsV0FBVyxJQUFZLEVBQVU7SUFDeEMsSUFBSSxRQUFRLFlBQVk7UUFDdEIsT0FBTyxVQUFVLENBQUMsS0FBSztJQUN6QixDQUFDO0lBRUQsT0FBTyxVQUFVLENBQUMsS0FBSyxHQUFHLElBQUksT0FDNUIsQ0FBQyxTQUFTLEVBQUUsS0FBSyxPQUFPLENBQUMsNEJBQTRCLFFBQVEsUUFBUSxDQUFDO0FBRTFFO0FBRUEsU0FBUyxXQUFXLE9BQWlCLEVBQUUsTUFBYyxFQUFRO0lBQzNELElBQUksT0FBTyxTQUFTLEVBQUU7UUFDcEIsSUFBSyxJQUFJLElBQUksUUFBUSxNQUFNLEdBQUcsR0FBRyxLQUFLLEdBQUcsSUFBSztZQUM1QyxJQUFJLE9BQU8sQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBRSxPQUFPLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxHQUFHO2dCQUMvQyxRQUFRLE1BQU0sQ0FBQyxHQUFHO1lBQ3BCLENBQUM7UUFDSDtJQUNGLENBQUM7SUFDRCxRQUFRLElBQUksQ0FBQyxPQUFPLFFBQVE7QUFDOUI7QUFFQSxTQUFTLHVCQUNQLEdBQVcsRUFDWCxLQUFnQyxFQUMxQjtJQUNOLElBQUksU0FBUyxDQUFDLHFCQUFxQixJQUFJLENBQUMsUUFBUTtRQUM5QyxNQUFNLElBQUksVUFBVSxDQUFDLElBQUksRUFBRSxJQUFJLGdCQUFnQixFQUFFLE1BQU0sYUFBYSxDQUFDLEVBQUU7SUFDekUsQ0FBQztBQUNIO0FBRUEsTUFBTTtJQUNKLE9B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