// Copyright 2018-2022 the oak authors. All rights reserved. MIT license.
import { RequestBody } from "./body.ts";
import { accepts, acceptsEncodings, acceptsLanguages } from "./deps.ts";
/** An interface which provides information about the current request. The
 * instance related to the current request is available on the
 * {@linkcode Context}'s `.request` property.
 *
 * The interface contains several properties to get information about the
 * request as well as several methods, which include content negotiation and
 * the ability to decode a request body.
 */ export class Request {
    #body;
    #proxy;
    #secure;
    #serverRequest;
    #url;
    #getRemoteAddr() {
        return this.#serverRequest.remoteAddr ?? "";
    }
    /** Is `true` if the request might have a body, otherwise `false`.
   *
   * **WARNING** this is an unreliable API. In HTTP/2 in many situations you
   * cannot determine if a request has a body or not unless you attempt to read
   * the body, due to the streaming nature of HTTP/2. As of Deno 1.16.1, for
   * HTTP/1.1, Deno also reflects that behaviour.  The only reliable way to
   * determine if a request has a body or not is to attempt to read the body.
   */ get hasBody() {
        return this.#body.has();
    }
    /** The `Headers` supplied in the request. */ get headers() {
        return this.#serverRequest.headers;
    }
    /** Request remote address. When the application's `.proxy` is true, the
   * `X-Forwarded-For` will be used to determine the requesting remote address.
   */ get ip() {
        return (this.#proxy ? this.ips[0] : this.#getRemoteAddr()) ?? "";
    }
    /** When the application's `.proxy` is `true`, this will be set to an array of
   * IPs, ordered from upstream to downstream, based on the value of the header
   * `X-Forwarded-For`.  When `false` an empty array is returned. */ get ips() {
        return this.#proxy ? (this.#serverRequest.headers.get("x-forwarded-for") ?? this.#getRemoteAddr()).split(/\s*,\s*/) : [];
    }
    /** The HTTP Method used by the request. */ get method() {
        return this.#serverRequest.method;
    }
    /** Shortcut to `request.url.protocol === "https:"`. */ get secure() {
        return this.#secure;
    }
    /** Set to the value of the _original_ Deno server request. */ get originalRequest() {
        return this.#serverRequest;
    }
    /** A parsed URL for the request which complies with the browser standards.
   * When the application's `.proxy` is `true`, this value will be based off of
   * the `X-Forwarded-Proto` and `X-Forwarded-Host` header values if present in
   * the request. */ get url() {
        if (!this.#url) {
            const serverRequest = this.#serverRequest;
            if (!this.#proxy) {
                // between 1.9.0 and 1.9.1 the request.url of the native HTTP started
                // returning the full URL, where previously it only returned the path
                // so we will try to use that URL here, but default back to old logic
                // if the URL isn't valid.
                try {
                    if (serverRequest.rawUrl) {
                        this.#url = new URL(serverRequest.rawUrl);
                        return this.#url;
                    }
                } catch  {
                // we don't care about errors here
                }
            }
            let proto;
            let host;
            if (this.#proxy) {
                proto = serverRequest.headers.get("x-forwarded-proto")?.split(/\s*,\s*/, 1)[0] ?? "http";
                host = serverRequest.headers.get("x-forwarded-host") ?? serverRequest.headers.get("host") ?? "";
            } else {
                proto = this.#secure ? "https" : "http";
                host = serverRequest.headers.get("host") ?? "";
            }
            try {
                this.#url = new URL(`${proto}://${host}${serverRequest.url}`);
            } catch  {
                throw new TypeError(`The server request URL of "${proto}://${host}${serverRequest.url}" is invalid.`);
            }
        }
        return this.#url;
    }
    constructor(serverRequest, { proxy =false , secure =false , jsonBodyReviver  } = {}){
        this.#proxy = proxy;
        this.#secure = secure;
        this.#serverRequest = serverRequest;
        this.#body = new RequestBody(serverRequest.getBody(), serverRequest.headers, jsonBodyReviver);
    }
    accepts(...types) {
        if (!this.#serverRequest.headers.has("Accept")) {
            return types.length ? types[0] : [
                "*/*"
            ];
        }
        if (types.length) {
            return accepts(this.#serverRequest, ...types);
        }
        return accepts(this.#serverRequest);
    }
    acceptsEncodings(...encodings) {
        if (!this.#serverRequest.headers.has("Accept-Encoding")) {
            return encodings.length ? encodings[0] : [
                "*"
            ];
        }
        if (encodings.length) {
            return acceptsEncodings(this.#serverRequest, ...encodings);
        }
        return acceptsEncodings(this.#serverRequest);
    }
    acceptsLanguages(...langs) {
        if (!this.#serverRequest.headers.get("Accept-Language")) {
            return langs.length ? langs[0] : [
                "*"
            ];
        }
        if (langs.length) {
            return acceptsLanguages(this.#serverRequest, ...langs);
        }
        return acceptsLanguages(this.#serverRequest);
    }
    /** Access the body of the request. This is a method, because there are
   * several options which can be provided which can influence how the body is
   * handled. */ body(options = {}) {
        return this.#body.get(options);
    }
    [Symbol.for("Deno.customInspect")](inspect) {
        const { hasBody , headers , ip , ips , method , secure , url  } = this;
        return `${this.constructor.name} ${inspect({
            hasBody,
            headers,
            ip,
            ips,
            method,
            secure,
            url: url.toString()
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
        const { hasBody , headers , ip , ips , method , secure , url  } = this;
        return `${options.stylize(this.constructor.name, "special")} ${inspect({
            hasBody,
            headers,
            ip,
            ips,
            method,
            secure,
            url
        }, newOptions)}`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMS4xLjAvcmVxdWVzdC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBvYWsgYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG5cbmltcG9ydCB0eXBlIHtcbiAgQm9keSxcbiAgQm9keUJ5dGVzLFxuICBCb2R5Rm9ybSxcbiAgQm9keUZvcm1EYXRhLFxuICBCb2R5SnNvbixcbiAgQm9keU9wdGlvbnMsXG4gIEJvZHlSZWFkZXIsXG4gIEJvZHlTdHJlYW0sXG4gIEJvZHlUZXh0LFxufSBmcm9tIFwiLi9ib2R5LnRzXCI7XG5pbXBvcnQgeyBSZXF1ZXN0Qm9keSB9IGZyb20gXCIuL2JvZHkudHNcIjtcbmltcG9ydCB7IGFjY2VwdHMsIGFjY2VwdHNFbmNvZGluZ3MsIGFjY2VwdHNMYW5ndWFnZXMgfSBmcm9tIFwiLi9kZXBzLnRzXCI7XG5pbXBvcnQgdHlwZSB7IEhUVFBNZXRob2RzLCBTZXJ2ZXJSZXF1ZXN0IH0gZnJvbSBcIi4vdHlwZXMuZC50c1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIE9ha1JlcXVlc3RPcHRpb25zIHtcbiAganNvbkJvZHlSZXZpdmVyPzogKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bikgPT4gdW5rbm93bjtcbiAgcHJveHk/OiBib29sZWFuO1xuICBzZWN1cmU/OiBib29sZWFuO1xufVxuXG4vKiogQW4gaW50ZXJmYWNlIHdoaWNoIHByb3ZpZGVzIGluZm9ybWF0aW9uIGFib3V0IHRoZSBjdXJyZW50IHJlcXVlc3QuIFRoZVxuICogaW5zdGFuY2UgcmVsYXRlZCB0byB0aGUgY3VycmVudCByZXF1ZXN0IGlzIGF2YWlsYWJsZSBvbiB0aGVcbiAqIHtAbGlua2NvZGUgQ29udGV4dH0ncyBgLnJlcXVlc3RgIHByb3BlcnR5LlxuICpcbiAqIFRoZSBpbnRlcmZhY2UgY29udGFpbnMgc2V2ZXJhbCBwcm9wZXJ0aWVzIHRvIGdldCBpbmZvcm1hdGlvbiBhYm91dCB0aGVcbiAqIHJlcXVlc3QgYXMgd2VsbCBhcyBzZXZlcmFsIG1ldGhvZHMsIHdoaWNoIGluY2x1ZGUgY29udGVudCBuZWdvdGlhdGlvbiBhbmRcbiAqIHRoZSBhYmlsaXR5IHRvIGRlY29kZSBhIHJlcXVlc3QgYm9keS5cbiAqL1xuZXhwb3J0IGNsYXNzIFJlcXVlc3Qge1xuICAjYm9keTogUmVxdWVzdEJvZHk7XG4gICNwcm94eTogYm9vbGVhbjtcbiAgI3NlY3VyZTogYm9vbGVhbjtcbiAgI3NlcnZlclJlcXVlc3Q6IFNlcnZlclJlcXVlc3Q7XG4gICN1cmw/OiBVUkw7XG5cbiAgI2dldFJlbW90ZUFkZHIoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy4jc2VydmVyUmVxdWVzdC5yZW1vdGVBZGRyID8/IFwiXCI7XG4gIH1cblxuICAvKiogSXMgYHRydWVgIGlmIHRoZSByZXF1ZXN0IG1pZ2h0IGhhdmUgYSBib2R5LCBvdGhlcndpc2UgYGZhbHNlYC5cbiAgICpcbiAgICogKipXQVJOSU5HKiogdGhpcyBpcyBhbiB1bnJlbGlhYmxlIEFQSS4gSW4gSFRUUC8yIGluIG1hbnkgc2l0dWF0aW9ucyB5b3VcbiAgICogY2Fubm90IGRldGVybWluZSBpZiBhIHJlcXVlc3QgaGFzIGEgYm9keSBvciBub3QgdW5sZXNzIHlvdSBhdHRlbXB0IHRvIHJlYWRcbiAgICogdGhlIGJvZHksIGR1ZSB0byB0aGUgc3RyZWFtaW5nIG5hdHVyZSBvZiBIVFRQLzIuIEFzIG9mIERlbm8gMS4xNi4xLCBmb3JcbiAgICogSFRUUC8xLjEsIERlbm8gYWxzbyByZWZsZWN0cyB0aGF0IGJlaGF2aW91ci4gIFRoZSBvbmx5IHJlbGlhYmxlIHdheSB0b1xuICAgKiBkZXRlcm1pbmUgaWYgYSByZXF1ZXN0IGhhcyBhIGJvZHkgb3Igbm90IGlzIHRvIGF0dGVtcHQgdG8gcmVhZCB0aGUgYm9keS5cbiAgICovXG4gIGdldCBoYXNCb2R5KCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLiNib2R5LmhhcygpO1xuICB9XG5cbiAgLyoqIFRoZSBgSGVhZGVyc2Agc3VwcGxpZWQgaW4gdGhlIHJlcXVlc3QuICovXG4gIGdldCBoZWFkZXJzKCk6IEhlYWRlcnMge1xuICAgIHJldHVybiB0aGlzLiNzZXJ2ZXJSZXF1ZXN0LmhlYWRlcnM7XG4gIH1cblxuICAvKiogUmVxdWVzdCByZW1vdGUgYWRkcmVzcy4gV2hlbiB0aGUgYXBwbGljYXRpb24ncyBgLnByb3h5YCBpcyB0cnVlLCB0aGVcbiAgICogYFgtRm9yd2FyZGVkLUZvcmAgd2lsbCBiZSB1c2VkIHRvIGRldGVybWluZSB0aGUgcmVxdWVzdGluZyByZW1vdGUgYWRkcmVzcy5cbiAgICovXG4gIGdldCBpcCgpOiBzdHJpbmcge1xuICAgIHJldHVybiAodGhpcy4jcHJveHkgPyB0aGlzLmlwc1swXSA6IHRoaXMuI2dldFJlbW90ZUFkZHIoKSkgPz8gXCJcIjtcbiAgfVxuXG4gIC8qKiBXaGVuIHRoZSBhcHBsaWNhdGlvbidzIGAucHJveHlgIGlzIGB0cnVlYCwgdGhpcyB3aWxsIGJlIHNldCB0byBhbiBhcnJheSBvZlxuICAgKiBJUHMsIG9yZGVyZWQgZnJvbSB1cHN0cmVhbSB0byBkb3duc3RyZWFtLCBiYXNlZCBvbiB0aGUgdmFsdWUgb2YgdGhlIGhlYWRlclxuICAgKiBgWC1Gb3J3YXJkZWQtRm9yYC4gIFdoZW4gYGZhbHNlYCBhbiBlbXB0eSBhcnJheSBpcyByZXR1cm5lZC4gKi9cbiAgZ2V0IGlwcygpOiBzdHJpbmdbXSB7XG4gICAgcmV0dXJuIHRoaXMuI3Byb3h5XG4gICAgICA/ICh0aGlzLiNzZXJ2ZXJSZXF1ZXN0LmhlYWRlcnMuZ2V0KFwieC1mb3J3YXJkZWQtZm9yXCIpID8/XG4gICAgICAgIHRoaXMuI2dldFJlbW90ZUFkZHIoKSkuc3BsaXQoL1xccyosXFxzKi8pXG4gICAgICA6IFtdO1xuICB9XG5cbiAgLyoqIFRoZSBIVFRQIE1ldGhvZCB1c2VkIGJ5IHRoZSByZXF1ZXN0LiAqL1xuICBnZXQgbWV0aG9kKCk6IEhUVFBNZXRob2RzIHtcbiAgICByZXR1cm4gdGhpcy4jc2VydmVyUmVxdWVzdC5tZXRob2QgYXMgSFRUUE1ldGhvZHM7XG4gIH1cblxuICAvKiogU2hvcnRjdXQgdG8gYHJlcXVlc3QudXJsLnByb3RvY29sID09PSBcImh0dHBzOlwiYC4gKi9cbiAgZ2V0IHNlY3VyZSgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy4jc2VjdXJlO1xuICB9XG5cbiAgLyoqIFNldCB0byB0aGUgdmFsdWUgb2YgdGhlIF9vcmlnaW5hbF8gRGVubyBzZXJ2ZXIgcmVxdWVzdC4gKi9cbiAgZ2V0IG9yaWdpbmFsUmVxdWVzdCgpOiBTZXJ2ZXJSZXF1ZXN0IHtcbiAgICByZXR1cm4gdGhpcy4jc2VydmVyUmVxdWVzdDtcbiAgfVxuXG4gIC8qKiBBIHBhcnNlZCBVUkwgZm9yIHRoZSByZXF1ZXN0IHdoaWNoIGNvbXBsaWVzIHdpdGggdGhlIGJyb3dzZXIgc3RhbmRhcmRzLlxuICAgKiBXaGVuIHRoZSBhcHBsaWNhdGlvbidzIGAucHJveHlgIGlzIGB0cnVlYCwgdGhpcyB2YWx1ZSB3aWxsIGJlIGJhc2VkIG9mZiBvZlxuICAgKiB0aGUgYFgtRm9yd2FyZGVkLVByb3RvYCBhbmQgYFgtRm9yd2FyZGVkLUhvc3RgIGhlYWRlciB2YWx1ZXMgaWYgcHJlc2VudCBpblxuICAgKiB0aGUgcmVxdWVzdC4gKi9cbiAgZ2V0IHVybCgpOiBVUkwge1xuICAgIGlmICghdGhpcy4jdXJsKSB7XG4gICAgICBjb25zdCBzZXJ2ZXJSZXF1ZXN0ID0gdGhpcy4jc2VydmVyUmVxdWVzdDtcbiAgICAgIGlmICghdGhpcy4jcHJveHkpIHtcbiAgICAgICAgLy8gYmV0d2VlbiAxLjkuMCBhbmQgMS45LjEgdGhlIHJlcXVlc3QudXJsIG9mIHRoZSBuYXRpdmUgSFRUUCBzdGFydGVkXG4gICAgICAgIC8vIHJldHVybmluZyB0aGUgZnVsbCBVUkwsIHdoZXJlIHByZXZpb3VzbHkgaXQgb25seSByZXR1cm5lZCB0aGUgcGF0aFxuICAgICAgICAvLyBzbyB3ZSB3aWxsIHRyeSB0byB1c2UgdGhhdCBVUkwgaGVyZSwgYnV0IGRlZmF1bHQgYmFjayB0byBvbGQgbG9naWNcbiAgICAgICAgLy8gaWYgdGhlIFVSTCBpc24ndCB2YWxpZC5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBpZiAoc2VydmVyUmVxdWVzdC5yYXdVcmwpIHtcbiAgICAgICAgICAgIHRoaXMuI3VybCA9IG5ldyBVUkwoc2VydmVyUmVxdWVzdC5yYXdVcmwpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuI3VybDtcbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIC8vIHdlIGRvbid0IGNhcmUgYWJvdXQgZXJyb3JzIGhlcmVcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbGV0IHByb3RvOiBzdHJpbmc7XG4gICAgICBsZXQgaG9zdDogc3RyaW5nO1xuICAgICAgaWYgKHRoaXMuI3Byb3h5KSB7XG4gICAgICAgIHByb3RvID0gc2VydmVyUmVxdWVzdFxuICAgICAgICAgIC5oZWFkZXJzLmdldChcIngtZm9yd2FyZGVkLXByb3RvXCIpPy5zcGxpdCgvXFxzKixcXHMqLywgMSlbMF0gPz9cbiAgICAgICAgICBcImh0dHBcIjtcbiAgICAgICAgaG9zdCA9IHNlcnZlclJlcXVlc3QuaGVhZGVycy5nZXQoXCJ4LWZvcndhcmRlZC1ob3N0XCIpID8/XG4gICAgICAgICAgc2VydmVyUmVxdWVzdC5oZWFkZXJzLmdldChcImhvc3RcIikgPz8gXCJcIjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHByb3RvID0gdGhpcy4jc2VjdXJlID8gXCJodHRwc1wiIDogXCJodHRwXCI7XG4gICAgICAgIGhvc3QgPSBzZXJ2ZXJSZXF1ZXN0LmhlYWRlcnMuZ2V0KFwiaG9zdFwiKSA/PyBcIlwiO1xuICAgICAgfVxuICAgICAgdHJ5IHtcbiAgICAgICAgdGhpcy4jdXJsID0gbmV3IFVSTChgJHtwcm90b306Ly8ke2hvc3R9JHtzZXJ2ZXJSZXF1ZXN0LnVybH1gKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFxuICAgICAgICAgIGBUaGUgc2VydmVyIHJlcXVlc3QgVVJMIG9mIFwiJHtwcm90b306Ly8ke2hvc3R9JHtzZXJ2ZXJSZXF1ZXN0LnVybH1cIiBpcyBpbnZhbGlkLmAsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0aGlzLiN1cmw7XG4gIH1cblxuICBjb25zdHJ1Y3RvcihcbiAgICBzZXJ2ZXJSZXF1ZXN0OiBTZXJ2ZXJSZXF1ZXN0LFxuICAgIHsgcHJveHkgPSBmYWxzZSwgc2VjdXJlID0gZmFsc2UsIGpzb25Cb2R5UmV2aXZlciB9OiBPYWtSZXF1ZXN0T3B0aW9ucyA9IHt9LFxuICApIHtcbiAgICB0aGlzLiNwcm94eSA9IHByb3h5O1xuICAgIHRoaXMuI3NlY3VyZSA9IHNlY3VyZTtcbiAgICB0aGlzLiNzZXJ2ZXJSZXF1ZXN0ID0gc2VydmVyUmVxdWVzdDtcbiAgICB0aGlzLiNib2R5ID0gbmV3IFJlcXVlc3RCb2R5KFxuICAgICAgc2VydmVyUmVxdWVzdC5nZXRCb2R5KCksXG4gICAgICBzZXJ2ZXJSZXF1ZXN0LmhlYWRlcnMsXG4gICAgICBqc29uQm9keVJldml2ZXIsXG4gICAgKTtcbiAgfVxuXG4gIC8qKiBSZXR1cm5zIGFuIGFycmF5IG9mIG1lZGlhIHR5cGVzLCBhY2NlcHRlZCBieSB0aGUgcmVxdWVzdG9yLCBpbiBvcmRlciBvZlxuICAgKiBwcmVmZXJlbmNlLiAgSWYgdGhlcmUgYXJlIG5vIGVuY29kaW5ncyBzdXBwbGllZCBieSB0aGUgcmVxdWVzdG9yLFxuICAgKiB0aGVuIGFjY2VwdGluZyBhbnkgaXMgaW1wbGllZCBpcyByZXR1cm5lZC5cbiAgICovXG4gIGFjY2VwdHMoKTogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG4gIC8qKiBGb3IgYSBnaXZlbiBzZXQgb2YgbWVkaWEgdHlwZXMsIHJldHVybiB0aGUgYmVzdCBtYXRjaCBhY2NlcHRlZCBieSB0aGVcbiAgICogcmVxdWVzdG9yLiAgSWYgdGhlcmUgYXJlIG5vIGVuY29kaW5nIHRoYXQgbWF0Y2gsIHRoZW4gdGhlIG1ldGhvZCByZXR1cm5zXG4gICAqIGB1bmRlZmluZWRgLlxuICAgKi9cbiAgYWNjZXB0cyguLi50eXBlczogc3RyaW5nW10pOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gIGFjY2VwdHMoLi4udHlwZXM6IHN0cmluZ1tdKTogc3RyaW5nIHwgc3RyaW5nW10gfCB1bmRlZmluZWQge1xuICAgIGlmICghdGhpcy4jc2VydmVyUmVxdWVzdC5oZWFkZXJzLmhhcyhcIkFjY2VwdFwiKSkge1xuICAgICAgcmV0dXJuIHR5cGVzLmxlbmd0aCA/IHR5cGVzWzBdIDogW1wiKi8qXCJdO1xuICAgIH1cbiAgICBpZiAodHlwZXMubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gYWNjZXB0cyh0aGlzLiNzZXJ2ZXJSZXF1ZXN0LCAuLi50eXBlcyk7XG4gICAgfVxuICAgIHJldHVybiBhY2NlcHRzKHRoaXMuI3NlcnZlclJlcXVlc3QpO1xuICB9XG5cbiAgLyoqIFJldHVybnMgYW4gYXJyYXkgb2YgZW5jb2RpbmdzLCBhY2NlcHRlZCBieSB0aGUgcmVxdWVzdG9yLCBpbiBvcmRlciBvZlxuICAgKiBwcmVmZXJlbmNlLiAgSWYgdGhlcmUgYXJlIG5vIGVuY29kaW5ncyBzdXBwbGllZCBieSB0aGUgcmVxdWVzdG9yLFxuICAgKiB0aGVuIGBbXCIqXCJdYCBpcyByZXR1cm5lZCwgbWF0Y2hpbmcgYW55LlxuICAgKi9cbiAgYWNjZXB0c0VuY29kaW5ncygpOiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcbiAgLyoqIEZvciBhIGdpdmVuIHNldCBvZiBlbmNvZGluZ3MsIHJldHVybiB0aGUgYmVzdCBtYXRjaCBhY2NlcHRlZCBieSB0aGVcbiAgICogcmVxdWVzdG9yLiAgSWYgdGhlcmUgYXJlIG5vIGVuY29kaW5ncyB0aGF0IG1hdGNoLCB0aGVuIHRoZSBtZXRob2QgcmV0dXJuc1xuICAgKiBgdW5kZWZpbmVkYC5cbiAgICpcbiAgICogKipOT1RFOioqIFlvdSBzaG91bGQgYWx3YXlzIHN1cHBseSBgaWRlbnRpdHlgIGFzIG9uZSBvZiB0aGUgZW5jb2RpbmdzXG4gICAqIHRvIGVuc3VyZSB0aGF0IHRoZXJlIGlzIGEgbWF0Y2ggd2hlbiB0aGUgYEFjY2VwdC1FbmNvZGluZ2AgaGVhZGVyIGlzIHBhcnRcbiAgICogb2YgdGhlIHJlcXVlc3QuXG4gICAqL1xuICBhY2NlcHRzRW5jb2RpbmdzKC4uLmVuY29kaW5nczogc3RyaW5nW10pOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gIGFjY2VwdHNFbmNvZGluZ3MoLi4uZW5jb2RpbmdzOiBzdHJpbmdbXSk6IHN0cmluZ1tdIHwgc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgICBpZiAoIXRoaXMuI3NlcnZlclJlcXVlc3QuaGVhZGVycy5oYXMoXCJBY2NlcHQtRW5jb2RpbmdcIikpIHtcbiAgICAgIHJldHVybiBlbmNvZGluZ3MubGVuZ3RoID8gZW5jb2RpbmdzWzBdIDogW1wiKlwiXTtcbiAgICB9XG4gICAgaWYgKGVuY29kaW5ncy5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBhY2NlcHRzRW5jb2RpbmdzKHRoaXMuI3NlcnZlclJlcXVlc3QsIC4uLmVuY29kaW5ncyk7XG4gICAgfVxuICAgIHJldHVybiBhY2NlcHRzRW5jb2RpbmdzKHRoaXMuI3NlcnZlclJlcXVlc3QpO1xuICB9XG5cbiAgLyoqIFJldHVybnMgYW4gYXJyYXkgb2YgbGFuZ3VhZ2VzLCBhY2NlcHRlZCBieSB0aGUgcmVxdWVzdG9yLCBpbiBvcmRlciBvZlxuICAgKiBwcmVmZXJlbmNlLiAgSWYgdGhlcmUgYXJlIG5vIGxhbmd1YWdlcyBzdXBwbGllZCBieSB0aGUgcmVxdWVzdG9yLFxuICAgKiBgW1wiKlwiXWAgaXMgcmV0dXJuZWQsIGluZGljYXRpbmcgYW55IGxhbmd1YWdlIGlzIGFjY2VwdGVkLlxuICAgKi9cbiAgYWNjZXB0c0xhbmd1YWdlcygpOiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcbiAgLyoqIEZvciBhIGdpdmVuIHNldCBvZiBsYW5ndWFnZXMsIHJldHVybiB0aGUgYmVzdCBtYXRjaCBhY2NlcHRlZCBieSB0aGVcbiAgICogcmVxdWVzdG9yLiAgSWYgdGhlcmUgYXJlIG5vIGxhbmd1YWdlcyB0aGF0IG1hdGNoLCB0aGVuIHRoZSBtZXRob2QgcmV0dXJuc1xuICAgKiBgdW5kZWZpbmVkYC4gKi9cbiAgYWNjZXB0c0xhbmd1YWdlcyguLi5sYW5nczogc3RyaW5nW10pOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gIGFjY2VwdHNMYW5ndWFnZXMoLi4ubGFuZ3M6IHN0cmluZ1tdKTogc3RyaW5nW10gfCBzdHJpbmcgfCB1bmRlZmluZWQge1xuICAgIGlmICghdGhpcy4jc2VydmVyUmVxdWVzdC5oZWFkZXJzLmdldChcIkFjY2VwdC1MYW5ndWFnZVwiKSkge1xuICAgICAgcmV0dXJuIGxhbmdzLmxlbmd0aCA/IGxhbmdzWzBdIDogW1wiKlwiXTtcbiAgICB9XG4gICAgaWYgKGxhbmdzLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIGFjY2VwdHNMYW5ndWFnZXModGhpcy4jc2VydmVyUmVxdWVzdCwgLi4ubGFuZ3MpO1xuICAgIH1cbiAgICByZXR1cm4gYWNjZXB0c0xhbmd1YWdlcyh0aGlzLiNzZXJ2ZXJSZXF1ZXN0KTtcbiAgfVxuXG4gIGJvZHkob3B0aW9uczogQm9keU9wdGlvbnM8XCJieXRlc1wiPik6IEJvZHlCeXRlcztcbiAgYm9keShvcHRpb25zOiBCb2R5T3B0aW9uczxcImZvcm1cIj4pOiBCb2R5Rm9ybTtcbiAgYm9keShvcHRpb25zOiBCb2R5T3B0aW9uczxcImZvcm0tZGF0YVwiPik6IEJvZHlGb3JtRGF0YTtcbiAgYm9keShvcHRpb25zOiBCb2R5T3B0aW9uczxcImpzb25cIj4pOiBCb2R5SnNvbjtcbiAgYm9keShvcHRpb25zOiBCb2R5T3B0aW9uczxcInJlYWRlclwiPik6IEJvZHlSZWFkZXI7XG4gIGJvZHkob3B0aW9uczogQm9keU9wdGlvbnM8XCJzdHJlYW1cIj4pOiBCb2R5U3RyZWFtO1xuICBib2R5KG9wdGlvbnM6IEJvZHlPcHRpb25zPFwidGV4dFwiPik6IEJvZHlUZXh0O1xuICBib2R5KG9wdGlvbnM/OiBCb2R5T3B0aW9ucyk6IEJvZHk7XG4gIC8qKiBBY2Nlc3MgdGhlIGJvZHkgb2YgdGhlIHJlcXVlc3QuIFRoaXMgaXMgYSBtZXRob2QsIGJlY2F1c2UgdGhlcmUgYXJlXG4gICAqIHNldmVyYWwgb3B0aW9ucyB3aGljaCBjYW4gYmUgcHJvdmlkZWQgd2hpY2ggY2FuIGluZmx1ZW5jZSBob3cgdGhlIGJvZHkgaXNcbiAgICogaGFuZGxlZC4gKi9cbiAgYm9keShvcHRpb25zOiBCb2R5T3B0aW9ucyA9IHt9KTogQm9keSB8IEJvZHlSZWFkZXIgfCBCb2R5U3RyZWFtIHtcbiAgICByZXR1cm4gdGhpcy4jYm9keS5nZXQob3B0aW9ucyk7XG4gIH1cblxuICBbU3ltYm9sLmZvcihcIkRlbm8uY3VzdG9tSW5zcGVjdFwiKV0oaW5zcGVjdDogKHZhbHVlOiB1bmtub3duKSA9PiBzdHJpbmcpIHtcbiAgICBjb25zdCB7IGhhc0JvZHksIGhlYWRlcnMsIGlwLCBpcHMsIG1ldGhvZCwgc2VjdXJlLCB1cmwgfSA9IHRoaXM7XG4gICAgcmV0dXJuIGAke3RoaXMuY29uc3RydWN0b3IubmFtZX0gJHtcbiAgICAgIGluc3BlY3Qoe1xuICAgICAgICBoYXNCb2R5LFxuICAgICAgICBoZWFkZXJzLFxuICAgICAgICBpcCxcbiAgICAgICAgaXBzLFxuICAgICAgICBtZXRob2QsXG4gICAgICAgIHNlY3VyZSxcbiAgICAgICAgdXJsOiB1cmwudG9TdHJpbmcoKSxcbiAgICAgIH0pXG4gICAgfWA7XG4gIH1cblxuICBbU3ltYm9sLmZvcihcIm5vZGVqcy51dGlsLmluc3BlY3QuY3VzdG9tXCIpXShcbiAgICBkZXB0aDogbnVtYmVyLFxuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgb3B0aW9uczogYW55LFxuICAgIGluc3BlY3Q6ICh2YWx1ZTogdW5rbm93biwgb3B0aW9ucz86IHVua25vd24pID0+IHN0cmluZyxcbiAgKSB7XG4gICAgaWYgKGRlcHRoIDwgMCkge1xuICAgICAgcmV0dXJuIG9wdGlvbnMuc3R5bGl6ZShgWyR7dGhpcy5jb25zdHJ1Y3Rvci5uYW1lfV1gLCBcInNwZWNpYWxcIik7XG4gICAgfVxuXG4gICAgY29uc3QgbmV3T3B0aW9ucyA9IE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIHtcbiAgICAgIGRlcHRoOiBvcHRpb25zLmRlcHRoID09PSBudWxsID8gbnVsbCA6IG9wdGlvbnMuZGVwdGggLSAxLFxuICAgIH0pO1xuICAgIGNvbnN0IHsgaGFzQm9keSwgaGVhZGVycywgaXAsIGlwcywgbWV0aG9kLCBzZWN1cmUsIHVybCB9ID0gdGhpcztcbiAgICByZXR1cm4gYCR7b3B0aW9ucy5zdHlsaXplKHRoaXMuY29uc3RydWN0b3IubmFtZSwgXCJzcGVjaWFsXCIpfSAke1xuICAgICAgaW5zcGVjdChcbiAgICAgICAgeyBoYXNCb2R5LCBoZWFkZXJzLCBpcCwgaXBzLCBtZXRob2QsIHNlY3VyZSwgdXJsIH0sXG4gICAgICAgIG5ld09wdGlvbnMsXG4gICAgICApXG4gICAgfWA7XG4gIH1cbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSx5RUFBeUU7QUFhekUsU0FBUyxXQUFXLFFBQVEsWUFBWTtBQUN4QyxTQUFTLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxnQkFBZ0IsUUFBUSxZQUFZO0FBU3hFOzs7Ozs7O0NBT0MsR0FDRCxPQUFPLE1BQU07SUFDWCxDQUFDLElBQUksQ0FBYztJQUNuQixDQUFDLEtBQUssQ0FBVTtJQUNoQixDQUFDLE1BQU0sQ0FBVTtJQUNqQixDQUFDLGFBQWEsQ0FBZ0I7SUFDOUIsQ0FBQyxHQUFHLENBQU87SUFFWCxDQUFDLGFBQWEsR0FBVztRQUN2QixPQUFPLElBQUksQ0FBQyxDQUFDLGFBQWEsQ0FBQyxVQUFVLElBQUk7SUFDM0M7SUFFQTs7Ozs7OztHQU9DLEdBQ0QsSUFBSSxVQUFtQjtRQUNyQixPQUFPLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxH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