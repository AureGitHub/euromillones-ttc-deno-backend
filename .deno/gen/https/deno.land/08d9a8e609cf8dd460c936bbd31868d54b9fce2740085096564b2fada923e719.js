// Copyright 2018-2022 the oak authors. All rights reserved. MIT license.
import { base64, createHttpError, isAbsolute, join, normalize, sep, Status } from "./deps.ts";
const ENCODE_CHARS_REGEXP = /(?:[^\x21\x25\x26-\x3B\x3D\x3F-\x5B\x5D\x5F\x61-\x7A\x7E]|%(?:[^0-9A-Fa-f]|[0-9A-Fa-f][^0-9A-Fa-f]|$))+/g;
const HTAB = "\t".charCodeAt(0);
const SPACE = " ".charCodeAt(0);
const CR = "\r".charCodeAt(0);
const LF = "\n".charCodeAt(0);
const UNMATCHED_SURROGATE_PAIR_REGEXP = /(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]|[\uD800-\uDBFF]([^\uDC00-\uDFFF]|$)/g;
const UNMATCHED_SURROGATE_PAIR_REPLACE = "$1\uFFFD$2";
export const DEFAULT_CHUNK_SIZE = 16_640; // 17 Kib
/** Body types which will be coerced into strings before being sent. */ export const BODY_TYPES = [
    "string",
    "number",
    "bigint",
    "boolean",
    "symbol"
];
export function assert(cond, msg = "Assertion failed") {
    if (!cond) {
        throw new Error(msg);
    }
}
/** Safely decode a URI component, where if it fails, instead of throwing,
 * just returns the original string
 */ export function decodeComponent(text) {
    try {
        return decodeURIComponent(text);
    } catch  {
        return text;
    }
}
/** Encodes the url preventing double enconding */ export function encodeUrl(url) {
    return String(url).replace(UNMATCHED_SURROGATE_PAIR_REGEXP, UNMATCHED_SURROGATE_PAIR_REPLACE).replace(ENCODE_CHARS_REGEXP, encodeURI);
}
function bufferToHex(buffer) {
    const arr = Array.from(new Uint8Array(buffer));
    return arr.map((b)=>b.toString(16).padStart(2, "0")).join("");
}
export async function getRandomFilename(prefix = "", extension = "") {
    const buffer = await crypto.subtle.digest("SHA-1", crypto.getRandomValues(new Uint8Array(256)));
    return `${prefix}${bufferToHex(buffer)}${extension ? `.${extension}` : ""}`;
}
export async function getBoundary() {
    const buffer = await crypto.subtle.digest("SHA-1", crypto.getRandomValues(new Uint8Array(256)));
    return `oak_${bufferToHex(buffer)}`;
}
/** Guard for Async Iterables */ export function isAsyncIterable(value) {
    return typeof value === "object" && value !== null && Symbol.asyncIterator in value && // deno-lint-ignore no-explicit-any
    typeof value[Symbol.asyncIterator] === "function";
}
export function isRouterContext(value) {
    return "params" in value;
}
/** Guard for `Deno.Reader`. */ export function isReader(value) {
    return typeof value === "object" && value !== null && "read" in value && typeof value.read === "function";
}
function isCloser(value) {
    return typeof value === "object" && value != null && "close" in value && // deno-lint-ignore no-explicit-any
    typeof value["close"] === "function";
}
export function isConn(value) {
    return typeof value === "object" && value != null && "rid" in value && // deno-lint-ignore no-explicit-any
    typeof value.rid === "number" && "localAddr" in value && "remoteAddr" in value;
}
export function isListenTlsOptions(value) {
    return typeof value === "object" && value !== null && ("cert" in value || "certFile" in value) && ("key" in value || "keyFile" in value) && "port" in value;
}
/**
 * Create a `ReadableStream<Uint8Array>` from an `AsyncIterable`.
 */ export function readableStreamFromAsyncIterable(source) {
    return new ReadableStream({
        async start (controller) {
            for await (const chunk of source){
                if (BODY_TYPES.includes(typeof chunk)) {
                    controller.enqueue(encoder.encode(String(chunk)));
                } else if (chunk instanceof Uint8Array) {
                    controller.enqueue(chunk);
                } else if (ArrayBuffer.isView(chunk)) {
                    controller.enqueue(new Uint8Array(chunk.buffer));
                } else if (chunk instanceof ArrayBuffer) {
                    controller.enqueue(new Uint8Array(chunk));
                } else {
                    try {
                        controller.enqueue(encoder.encode(JSON.stringify(chunk)));
                    } catch  {
                    // we just swallow errors here
                    }
                }
            }
            controller.close();
        }
    });
}
/**
 * Create a `ReadableStream<Uint8Array>` from a `Deno.Reader`.
 *
 * When the pull algorithm is called on the stream, a chunk from the reader
 * will be read.  When `null` is returned from the reader, the stream will be
 * closed along with the reader (if it is also a `Deno.Closer`).
 *
 * An example converting a `Deno.FsFile` into a readable stream:
 *
 * ```ts
 * import { readableStreamFromReader } from "https://deno.land/std/io/mod.ts";
 *
 * const file = await Deno.open("./file.txt", { read: true });
 * const fileStream = readableStreamFromReader(file);
 * ```
 */ export function readableStreamFromReader(reader, options = {}) {
    const { autoClose =true , chunkSize =DEFAULT_CHUNK_SIZE , strategy  } = options;
    return new ReadableStream({
        async pull (controller) {
            const chunk = new Uint8Array(chunkSize);
            try {
                const read = await reader.read(chunk);
                if (read === null) {
                    if (isCloser(reader) && autoClose) {
                        reader.close();
                    }
                    controller.close();
                    return;
                }
                controller.enqueue(chunk.subarray(0, read));
            } catch (e) {
                controller.error(e);
                if (isCloser(reader)) {
                    reader.close();
                }
            }
        },
        cancel () {
            if (isCloser(reader) && autoClose) {
                reader.close();
            }
        }
    }, strategy);
}
/** Determines if a HTTP `Status` is an `ErrorStatus` (4XX or 5XX). */ export function isErrorStatus(value) {
    return [
        Status.BadRequest,
        Status.Unauthorized,
        Status.PaymentRequired,
        Status.Forbidden,
        Status.NotFound,
        Status.MethodNotAllowed,
        Status.NotAcceptable,
        Status.ProxyAuthRequired,
        Status.RequestTimeout,
        Status.Conflict,
        Status.Gone,
        Status.LengthRequired,
        Status.PreconditionFailed,
        Status.RequestEntityTooLarge,
        Status.RequestURITooLong,
        Status.UnsupportedMediaType,
        Status.RequestedRangeNotSatisfiable,
        Status.ExpectationFailed,
        Status.Teapot,
        Status.MisdirectedRequest,
        Status.UnprocessableEntity,
        Status.Locked,
        Status.FailedDependency,
        Status.UpgradeRequired,
        Status.PreconditionRequired,
        Status.TooManyRequests,
        Status.RequestHeaderFieldsTooLarge,
        Status.UnavailableForLegalReasons,
        Status.InternalServerError,
        Status.NotImplemented,
        Status.BadGateway,
        Status.ServiceUnavailable,
        Status.GatewayTimeout,
        Status.HTTPVersionNotSupported,
        Status.VariantAlsoNegotiates,
        Status.InsufficientStorage,
        Status.LoopDetected,
        Status.NotExtended,
        Status.NetworkAuthenticationRequired
    ].includes(value);
}
/** Determines if a HTTP `Status` is a `RedirectStatus` (3XX). */ export function isRedirectStatus(value) {
    return [
        Status.MultipleChoices,
        Status.MovedPermanently,
        Status.Found,
        Status.SeeOther,
        Status.UseProxy,
        Status.TemporaryRedirect,
        Status.PermanentRedirect
    ].includes(value);
}
/** Determines if a string "looks" like HTML */ export function isHtml(value) {
    return /^\s*<(?:!DOCTYPE|html|body)/i.test(value);
}
/** Returns `u8` with leading white space removed. */ export function skipLWSPChar(u8) {
    const result = new Uint8Array(u8.length);
    let j = 0;
    for(let i = 0; i < u8.length; i++){
        if (u8[i] === SPACE || u8[i] === HTAB) continue;
        result[j++] = u8[i];
    }
    return result.slice(0, j);
}
export function stripEol(value) {
    if (value[value.byteLength - 1] == LF) {
        let drop = 1;
        if (value.byteLength > 1 && value[value.byteLength - 2] === CR) {
            drop = 2;
        }
        return value.subarray(0, value.byteLength - drop);
    }
    return value;
}
/*!
 * Adapted directly from https://github.com/pillarjs/resolve-path
 * which is licensed as follows:
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Jonathan Ong <me@jongleberry.com>
 * Copyright (c) 2015-2018 Douglas Christopher Wilson <doug@somethingdoug.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * 'Software'), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */ const UP_PATH_REGEXP = /(?:^|[\\/])\.\.(?:[\\/]|$)/;
export function resolvePath(rootPath, relativePath) {
    let path = relativePath;
    let root = rootPath;
    // root is optional, similar to root.resolve
    if (relativePath === undefined) {
        path = rootPath;
        root = ".";
    }
    if (path == null) {
        throw new TypeError("Argument relativePath is required.");
    }
    // containing NULL bytes is malicious
    if (path.includes("\0")) {
        throw createHttpError(400, "Malicious Path");
    }
    // path should never be absolute
    if (isAbsolute(path)) {
        throw createHttpError(400, "Malicious Path");
    }
    // path outside root
    if (UP_PATH_REGEXP.test(normalize("." + sep + path))) {
        throw createHttpError(403);
    }
    // join the relative path
    return normalize(join(root, path));
}
/** A utility class that transforms "any" chunk into an `Uint8Array`. */ export class Uint8ArrayTransformStream extends TransformStream {
    constructor(){
        const init = {
            async transform (chunk, controller) {
                chunk = await chunk;
                switch(typeof chunk){
                    case "object":
                        if (chunk === null) {
                            controller.terminate();
                        } else if (ArrayBuffer.isView(chunk)) {
                            controller.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
                        } else if (Array.isArray(chunk) && chunk.every((value)=>typeof value === "number")) {
                            controller.enqueue(new Uint8Array(chunk));
                        } else if (typeof chunk.valueOf === "function" && chunk.valueOf() !== chunk) {
                            this.transform(chunk.valueOf(), controller);
                        } else if ("toJSON" in chunk) {
                            this.transform(JSON.stringify(chunk), controller);
                        }
                        break;
                    case "symbol":
                        controller.error(new TypeError("Cannot transform a symbol to a Uint8Array"));
                        break;
                    case "undefined":
                        controller.error(new TypeError("Cannot transform undefined to a Uint8Array"));
                        break;
                    default:
                        controller.enqueue(this.encoder.encode(String(chunk)));
                }
            },
            encoder: new TextEncoder()
        };
        super(init);
    }
}
const replacements = {
    "/": "_",
    "+": "-",
    "=": ""
};
const encoder = new TextEncoder();
export function encodeBase64Safe(data) {
    return base64.encode(data).replace(/\/|\+|=/g, (c)=>replacements[c]);
}
export function isNode() {
    return "process" in globalThis && "global" in globalThis;
}
export function importKey(key) {
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
export function sign(data, key) {
    if (typeof data === "string") {
        data = encoder.encode(data);
    } else if (Array.isArray(data)) {
        data = Uint8Array.from(data);
    }
    return crypto.subtle.sign("HMAC", key, data);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMS4xLjAvdXRpbC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBvYWsgYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG5cbmltcG9ydCB0eXBlIHsgU3RhdGUgfSBmcm9tIFwiLi9hcHBsaWNhdGlvbi50c1wiO1xuaW1wb3J0IHR5cGUgeyBDb250ZXh0IH0gZnJvbSBcIi4vY29udGV4dC50c1wiO1xuaW1wb3J0IHtcbiAgYmFzZTY0LFxuICBjcmVhdGVIdHRwRXJyb3IsXG4gIGlzQWJzb2x1dGUsXG4gIGpvaW4sXG4gIG5vcm1hbGl6ZSxcbiAgc2VwLFxuICBTdGF0dXMsXG59IGZyb20gXCIuL2RlcHMudHNcIjtcbmltcG9ydCB0eXBlIHsgUm91dGVQYXJhbXMsIFJvdXRlckNvbnRleHQgfSBmcm9tIFwiLi9yb3V0ZXIudHNcIjtcbmltcG9ydCB0eXBlIHsgRGF0YSwgRXJyb3JTdGF0dXMsIEtleSwgUmVkaXJlY3RTdGF0dXMgfSBmcm9tIFwiLi90eXBlcy5kLnRzXCI7XG5cbmNvbnN0IEVOQ09ERV9DSEFSU19SRUdFWFAgPVxuICAvKD86W15cXHgyMVxceDI1XFx4MjYtXFx4M0JcXHgzRFxceDNGLVxceDVCXFx4NURcXHg1RlxceDYxLVxceDdBXFx4N0VdfCUoPzpbXjAtOUEtRmEtZl18WzAtOUEtRmEtZl1bXjAtOUEtRmEtZl18JCkpKy9nO1xuY29uc3QgSFRBQiA9IFwiXFx0XCIuY2hhckNvZGVBdCgwKTtcbmNvbnN0IFNQQUNFID0gXCIgXCIuY2hhckNvZGVBdCgwKTtcbmNvbnN0IENSID0gXCJcXHJcIi5jaGFyQ29kZUF0KDApO1xuY29uc3QgTEYgPSBcIlxcblwiLmNoYXJDb2RlQXQoMCk7XG5jb25zdCBVTk1BVENIRURfU1VSUk9HQVRFX1BBSVJfUkVHRVhQID1cbiAgLyhefFteXFx1RDgwMC1cXHVEQkZGXSlbXFx1REMwMC1cXHVERkZGXXxbXFx1RDgwMC1cXHVEQkZGXShbXlxcdURDMDAtXFx1REZGRl18JCkvZztcbmNvbnN0IFVOTUFUQ0hFRF9TVVJST0dBVEVfUEFJUl9SRVBMQUNFID0gXCIkMVxcdUZGRkQkMlwiO1xuZXhwb3J0IGNvbnN0IERFRkFVTFRfQ0hVTktfU0laRSA9IDE2XzY0MDsgLy8gMTcgS2liXG5cbi8qKiBCb2R5IHR5cGVzIHdoaWNoIHdpbGwgYmUgY29lcmNlZCBpbnRvIHN0cmluZ3MgYmVmb3JlIGJlaW5nIHNlbnQuICovXG5leHBvcnQgY29uc3QgQk9EWV9UWVBFUyA9IFtcInN0cmluZ1wiLCBcIm51bWJlclwiLCBcImJpZ2ludFwiLCBcImJvb2xlYW5cIiwgXCJzeW1ib2xcIl07XG5cbmV4cG9ydCBmdW5jdGlvbiBhc3NlcnQoY29uZDogdW5rbm93biwgbXNnID0gXCJBc3NlcnRpb24gZmFpbGVkXCIpOiBhc3NlcnRzIGNvbmQge1xuICBpZiAoIWNvbmQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IobXNnKTtcbiAgfVxufVxuXG4vKiogU2FmZWx5IGRlY29kZSBhIFVSSSBjb21wb25lbnQsIHdoZXJlIGlmIGl0IGZhaWxzLCBpbnN0ZWFkIG9mIHRocm93aW5nLFxuICoganVzdCByZXR1cm5zIHRoZSBvcmlnaW5hbCBzdHJpbmdcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRlY29kZUNvbXBvbmVudCh0ZXh0OiBzdHJpbmcpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KHRleHQpO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gdGV4dDtcbiAgfVxufVxuXG4vKiogRW5jb2RlcyB0aGUgdXJsIHByZXZlbnRpbmcgZG91YmxlIGVuY29uZGluZyAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVuY29kZVVybCh1cmw6IHN0cmluZykge1xuICByZXR1cm4gU3RyaW5nKHVybClcbiAgICAucmVwbGFjZShVTk1BVENIRURfU1VSUk9HQVRFX1BBSVJfUkVHRVhQLCBVTk1BVENIRURfU1VSUk9HQVRFX1BBSVJfUkVQTEFDRSlcbiAgICAucmVwbGFjZShFTkNPREVfQ0hBUlNfUkVHRVhQLCBlbmNvZGVVUkkpO1xufVxuXG5mdW5jdGlvbiBidWZmZXJUb0hleChidWZmZXI6IEFycmF5QnVmZmVyKTogc3RyaW5nIHtcbiAgY29uc3QgYXJyID0gQXJyYXkuZnJvbShuZXcgVWludDhBcnJheShidWZmZXIpKTtcbiAgcmV0dXJuIGFyci5tYXAoKGIpID0+IGIudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsIFwiMFwiKSkuam9pbihcIlwiKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFJhbmRvbUZpbGVuYW1lKFxuICBwcmVmaXggPSBcIlwiLFxuICBleHRlbnNpb24gPSBcIlwiLFxuKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgY29uc3QgYnVmZmVyID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5kaWdlc3QoXG4gICAgXCJTSEEtMVwiLFxuICAgIGNyeXB0by5nZXRSYW5kb21WYWx1ZXMobmV3IFVpbnQ4QXJyYXkoMjU2KSksXG4gICk7XG4gIHJldHVybiBgJHtwcmVmaXh9JHtidWZmZXJUb0hleChidWZmZXIpfSR7ZXh0ZW5zaW9uID8gYC4ke2V4dGVuc2lvbn1gIDogXCJcIn1gO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Qm91bmRhcnkoKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgY29uc3QgYnVmZmVyID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5kaWdlc3QoXG4gICAgXCJTSEEtMVwiLFxuICAgIGNyeXB0by5nZXRSYW5kb21WYWx1ZXMobmV3IFVpbnQ4QXJyYXkoMjU2KSksXG4gICk7XG4gIHJldHVybiBgb2FrXyR7YnVmZmVyVG9IZXgoYnVmZmVyKX1gO1xufVxuXG4vKiogR3VhcmQgZm9yIEFzeW5jIEl0ZXJhYmxlcyAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzQXN5bmNJdGVyYWJsZShcbiAgdmFsdWU6IHVua25vd24sXG4pOiB2YWx1ZSBpcyBBc3luY0l0ZXJhYmxlPHVua25vd24+IHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gXCJvYmplY3RcIiAmJiB2YWx1ZSAhPT0gbnVsbCAmJlxuICAgIFN5bWJvbC5hc3luY0l0ZXJhdG9yIGluIHZhbHVlICYmXG4gICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICB0eXBlb2YgKHZhbHVlIGFzIGFueSlbU3ltYm9sLmFzeW5jSXRlcmF0b3JdID09PSBcImZ1bmN0aW9uXCI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1JvdXRlckNvbnRleHQ8XG4gIFIgZXh0ZW5kcyBzdHJpbmcsXG4gIFAgZXh0ZW5kcyBSb3V0ZVBhcmFtczxSPixcbiAgUyBleHRlbmRzIFN0YXRlLFxuPihcbiAgdmFsdWU6IENvbnRleHQ8Uz4sXG4pOiB2YWx1ZSBpcyBSb3V0ZXJDb250ZXh0PFIsIFAsIFM+IHtcbiAgcmV0dXJuIFwicGFyYW1zXCIgaW4gdmFsdWU7XG59XG5cbi8qKiBHdWFyZCBmb3IgYERlbm8uUmVhZGVyYC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc1JlYWRlcih2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIERlbm8uUmVhZGVyIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gXCJvYmplY3RcIiAmJiB2YWx1ZSAhPT0gbnVsbCAmJiBcInJlYWRcIiBpbiB2YWx1ZSAmJlxuICAgIHR5cGVvZiAodmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLnJlYWQgPT09IFwiZnVuY3Rpb25cIjtcbn1cblxuZnVuY3Rpb24gaXNDbG9zZXIodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBEZW5vLkNsb3NlciB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09IFwib2JqZWN0XCIgJiYgdmFsdWUgIT0gbnVsbCAmJiBcImNsb3NlXCIgaW4gdmFsdWUgJiZcbiAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAgIHR5cGVvZiAodmFsdWUgYXMgUmVjb3JkPHN0cmluZywgYW55PilbXCJjbG9zZVwiXSA9PT0gXCJmdW5jdGlvblwiO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNDb25uKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgRGVuby5Db25uIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gXCJvYmplY3RcIiAmJiB2YWx1ZSAhPSBudWxsICYmIFwicmlkXCIgaW4gdmFsdWUgJiZcbiAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAgIHR5cGVvZiAodmFsdWUgYXMgYW55KS5yaWQgPT09IFwibnVtYmVyXCIgJiYgXCJsb2NhbEFkZHJcIiBpbiB2YWx1ZSAmJlxuICAgIFwicmVtb3RlQWRkclwiIGluIHZhbHVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNMaXN0ZW5UbHNPcHRpb25zKFxuICB2YWx1ZTogdW5rbm93bixcbik6IHZhbHVlIGlzIERlbm8uTGlzdGVuVGxzT3B0aW9ucyB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09IFwib2JqZWN0XCIgJiYgdmFsdWUgIT09IG51bGwgJiZcbiAgICAoXCJjZXJ0XCIgaW4gdmFsdWUgfHwgXCJjZXJ0RmlsZVwiIGluIHZhbHVlKSAmJlxuICAgIChcImtleVwiIGluIHZhbHVlIHx8IFwia2V5RmlsZVwiIGluIHZhbHVlKSAmJiBcInBvcnRcIiBpbiB2YWx1ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZWFkYWJsZVN0cmVhbUZyb21SZWFkZXJPcHRpb25zIHtcbiAgLyoqIElmIHRoZSBgcmVhZGVyYCBpcyBhbHNvIGEgYERlbm8uQ2xvc2VyYCwgYXV0b21hdGljYWxseSBjbG9zZSB0aGUgYHJlYWRlcmBcbiAgICogd2hlbiBgRU9GYCBpcyBlbmNvdW50ZXJlZCwgb3IgYSByZWFkIGVycm9yIG9jY3Vycy5cbiAgICpcbiAgICogRGVmYXVsdHMgdG8gYHRydWVgLiAqL1xuICBhdXRvQ2xvc2U/OiBib29sZWFuO1xuXG4gIC8qKiBUaGUgc2l6ZSBvZiBjaHVua3MgdG8gYWxsb2NhdGUgdG8gcmVhZCwgdGhlIGRlZmF1bHQgaXMgfjE2S2lCLCB3aGljaCBpc1xuICAgKiB0aGUgbWF4aW11bSBzaXplIHRoYXQgRGVubyBvcGVyYXRpb25zIGNhbiBjdXJyZW50bHkgc3VwcG9ydC4gKi9cbiAgY2h1bmtTaXplPzogbnVtYmVyO1xuXG4gIC8qKiBUaGUgcXVldWluZyBzdHJhdGVneSB0byBjcmVhdGUgdGhlIGBSZWFkYWJsZVN0cmVhbWAgd2l0aC4gKi9cbiAgc3RyYXRlZ3k/OiB7IGhpZ2hXYXRlck1hcms/OiBudW1iZXIgfCB1bmRlZmluZWQ7IHNpemU/OiB1bmRlZmluZWQgfTtcbn1cblxuLyoqXG4gKiBDcmVhdGUgYSBgUmVhZGFibGVTdHJlYW08VWludDhBcnJheT5gIGZyb20gYW4gYEFzeW5jSXRlcmFibGVgLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVhZGFibGVTdHJlYW1Gcm9tQXN5bmNJdGVyYWJsZShcbiAgc291cmNlOiBBc3luY0l0ZXJhYmxlPHVua25vd24+LFxuKTogUmVhZGFibGVTdHJlYW08VWludDhBcnJheT4ge1xuICByZXR1cm4gbmV3IFJlYWRhYmxlU3RyZWFtKHtcbiAgICBhc3luYyBzdGFydChjb250cm9sbGVyKSB7XG4gICAgICBmb3IgYXdhaXQgKGNvbnN0IGNodW5rIG9mIHNvdXJjZSkge1xuICAgICAgICBpZiAoQk9EWV9UWVBFUy5pbmNsdWRlcyh0eXBlb2YgY2h1bmspKSB7XG4gICAgICAgICAgY29udHJvbGxlci5lbnF1ZXVlKGVuY29kZXIuZW5jb2RlKFN0cmluZyhjaHVuaykpKTtcbiAgICAgICAgfSBlbHNlIGlmIChjaHVuayBpbnN0YW5jZW9mIFVpbnQ4QXJyYXkpIHtcbiAgICAgICAgICBjb250cm9sbGVyLmVucXVldWUoY2h1bmspO1xuICAgICAgICB9IGVsc2UgaWYgKEFycmF5QnVmZmVyLmlzVmlldyhjaHVuaykpIHtcbiAgICAgICAgICBjb250cm9sbGVyLmVucXVldWUobmV3IFVpbnQ4QXJyYXkoY2h1bmsuYnVmZmVyKSk7XG4gICAgICAgIH0gZWxzZSBpZiAoY2h1bmsgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikge1xuICAgICAgICAgIGNvbnRyb2xsZXIuZW5xdWV1ZShuZXcgVWludDhBcnJheShjaHVuaykpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb250cm9sbGVyLmVucXVldWUoZW5jb2Rlci5lbmNvZGUoSlNPTi5zdHJpbmdpZnkoY2h1bmspKSk7XG4gICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAvLyB3ZSBqdXN0IHN3YWxsb3cgZXJyb3JzIGhlcmVcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGNvbnRyb2xsZXIuY2xvc2UoKTtcbiAgICB9LFxuICB9KTtcbn1cblxuLyoqXG4gKiBDcmVhdGUgYSBgUmVhZGFibGVTdHJlYW08VWludDhBcnJheT5gIGZyb20gYSBgRGVuby5SZWFkZXJgLlxuICpcbiAqIFdoZW4gdGhlIHB1bGwgYWxnb3JpdGhtIGlzIGNhbGxlZCBvbiB0aGUgc3RyZWFtLCBhIGNodW5rIGZyb20gdGhlIHJlYWRlclxuICogd2lsbCBiZSByZWFkLiAgV2hlbiBgbnVsbGAgaXMgcmV0dXJuZWQgZnJvbSB0aGUgcmVhZGVyLCB0aGUgc3RyZWFtIHdpbGwgYmVcbiAqIGNsb3NlZCBhbG9uZyB3aXRoIHRoZSByZWFkZXIgKGlmIGl0IGlzIGFsc28gYSBgRGVuby5DbG9zZXJgKS5cbiAqXG4gKiBBbiBleGFtcGxlIGNvbnZlcnRpbmcgYSBgRGVuby5Gc0ZpbGVgIGludG8gYSByZWFkYWJsZSBzdHJlYW06XG4gKlxuICogYGBgdHNcbiAqIGltcG9ydCB7IHJlYWRhYmxlU3RyZWFtRnJvbVJlYWRlciB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGQvaW8vbW9kLnRzXCI7XG4gKlxuICogY29uc3QgZmlsZSA9IGF3YWl0IERlbm8ub3BlbihcIi4vZmlsZS50eHRcIiwgeyByZWFkOiB0cnVlIH0pO1xuICogY29uc3QgZmlsZVN0cmVhbSA9IHJlYWRhYmxlU3RyZWFtRnJvbVJlYWRlcihmaWxlKTtcbiAqIGBgYFxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVhZGFibGVTdHJlYW1Gcm9tUmVhZGVyKFxuICByZWFkZXI6IERlbm8uUmVhZGVyIHwgKERlbm8uUmVhZGVyICYgRGVuby5DbG9zZXIpLFxuICBvcHRpb25zOiBSZWFkYWJsZVN0cmVhbUZyb21SZWFkZXJPcHRpb25zID0ge30sXG4pOiBSZWFkYWJsZVN0cmVhbTxVaW50OEFycmF5PiB7XG4gIGNvbnN0IHtcbiAgICBhdXRvQ2xvc2UgPSB0cnVlLFxuICAgIGNodW5rU2l6ZSA9IERFRkFVTFRfQ0hVTktfU0laRSxcbiAgICBzdHJhdGVneSxcbiAgfSA9IG9wdGlvbnM7XG5cbiAgcmV0dXJuIG5ldyBSZWFkYWJsZVN0cmVhbSh7XG4gICAgYXN5bmMgcHVsbChjb250cm9sbGVyKSB7XG4gICAgICBjb25zdCBjaHVuayA9IG5ldyBVaW50OEFycmF5KGNodW5rU2l6ZSk7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCByZWFkID0gYXdhaXQgcmVhZGVyLnJlYWQoY2h1bmspO1xuICAgICAgICBpZiAocmVhZCA9PT0gbnVsbCkge1xuICAgICAgICAgIGlmIChpc0Nsb3NlcihyZWFkZXIpICYmIGF1dG9DbG9zZSkge1xuICAgICAgICAgICAgcmVhZGVyLmNsb3NlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnRyb2xsZXIuY2xvc2UoKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29udHJvbGxlci5lbnF1ZXVlKGNodW5rLnN1YmFycmF5KDAsIHJlYWQpKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29udHJvbGxlci5lcnJvcihlKTtcbiAgICAgICAgaWYgKGlzQ2xvc2VyKHJlYWRlcikpIHtcbiAgICAgICAgICByZWFkZXIuY2xvc2UoKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgY2FuY2VsKCkge1xuICAgICAgaWYgKGlzQ2xvc2VyKHJlYWRlcikgJiYgYXV0b0Nsb3NlKSB7XG4gICAgICAgIHJlYWRlci5jbG9zZSgpO1xuICAgICAgfVxuICAgIH0sXG4gIH0sIHN0cmF0ZWd5KTtcbn1cblxuLyoqIERldGVybWluZXMgaWYgYSBIVFRQIGBTdGF0dXNgIGlzIGFuIGBFcnJvclN0YXR1c2AgKDRYWCBvciA1WFgpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzRXJyb3JTdGF0dXModmFsdWU6IFN0YXR1cyk6IHZhbHVlIGlzIEVycm9yU3RhdHVzIHtcbiAgcmV0dXJuIFtcbiAgICBTdGF0dXMuQmFkUmVxdWVzdCxcbiAgICBTdGF0dXMuVW5hdXRob3JpemVkLFxuICAgIFN0YXR1cy5QYXltZW50UmVxdWlyZWQsXG4gICAgU3RhdHVzLkZvcmJpZGRlbixcbiAgICBTdGF0dXMuTm90Rm91bmQsXG4gICAgU3RhdHVzLk1ldGhvZE5vdEFsbG93ZWQsXG4gICAgU3RhdHVzLk5vdEFjY2VwdGFibGUsXG4gICAgU3RhdHVzLlByb3h5QXV0aFJlcXVpcmVkLFxuICAgIFN0YXR1cy5SZXF1ZXN0VGltZW91dCxcbiAgICBTdGF0dXMuQ29uZmxpY3QsXG4gICAgU3RhdHVzLkdvbmUsXG4gICAgU3RhdHVzLkxlbmd0aFJlcXVpcmVkLFxuICAgIFN0YXR1cy5QcmVjb25kaXRpb25GYWlsZWQsXG4gICAgU3RhdHVzLlJlcXVlc3RFbnRpdHlUb29MYXJnZSxcbiAgICBTdGF0dXMuUmVxdWVzdFVSSVRvb0xvbmcsXG4gICAgU3RhdHVzLlVuc3VwcG9ydGVkTWVkaWFUeXBlLFxuICAgIFN0YXR1cy5SZXF1ZXN0ZWRSYW5nZU5vdFNhdGlzZmlhYmxlLFxuICAgIFN0YXR1cy5FeHBlY3RhdGlvbkZhaWxlZCxcbiAgICBTdGF0dXMuVGVhcG90LFxuICAgIFN0YXR1cy5NaXNkaXJlY3RlZFJlcXVlc3QsXG4gICAgU3RhdHVzLlVucHJvY2Vzc2FibGVFbnRpdHksXG4gICAgU3RhdHVzLkxvY2tlZCxcbiAgICBTdGF0dXMuRmFpbGVkRGVwZW5kZW5jeSxcbiAgICBTdGF0dXMuVXBncmFkZVJlcXVpcmVkLFxuICAgIFN0YXR1cy5QcmVjb25kaXRpb25SZXF1aXJlZCxcbiAgICBTdGF0dXMuVG9vTWFueVJlcXVlc3RzLFxuICAgIFN0YXR1cy5SZXF1ZXN0SGVhZGVyRmllbGRzVG9vTGFyZ2UsXG4gICAgU3RhdHVzLlVuYXZhaWxhYmxlRm9yTGVnYWxSZWFzb25zLFxuICAgIFN0YXR1cy5JbnRlcm5hbFNlcnZlckVycm9yLFxuICAgIFN0YXR1cy5Ob3RJbXBsZW1lbnRlZCxcbiAgICBTdGF0dXMuQmFkR2F0ZXdheSxcbiAgICBTdGF0dXMuU2VydmljZVVuYXZhaWxhYmxlLFxuICAgIFN0YXR1cy5HYXRld2F5VGltZW91dCxcbiAgICBTdGF0dXMuSFRUUFZlcnNpb25Ob3RTdXBwb3J0ZWQsXG4gICAgU3RhdHVzLlZhcmlhbnRBbHNvTmVnb3RpYXRlcyxcbiAgICBTdGF0dXMuSW5zdWZmaWNpZW50U3RvcmFnZSxcbiAgICBTdGF0dXMuTG9vcERldGVjdGVkLFxuICAgIFN0YXR1cy5Ob3RFeHRlbmRlZCxcbiAgICBTdGF0dXMuTmV0d29ya0F1dGhlbnRpY2F0aW9uUmVxdWlyZWQsXG4gIF0uaW5jbHVkZXModmFsdWUpO1xufVxuXG4vKiogRGV0ZXJtaW5lcyBpZiBhIEhUVFAgYFN0YXR1c2AgaXMgYSBgUmVkaXJlY3RTdGF0dXNgICgzWFgpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzUmVkaXJlY3RTdGF0dXModmFsdWU6IFN0YXR1cyk6IHZhbHVlIGlzIFJlZGlyZWN0U3RhdHVzIHtcbiAgcmV0dXJuIFtcbiAgICBTdGF0dXMuTXVsdGlwbGVDaG9pY2VzLFxuICAgIFN0YXR1cy5Nb3ZlZFBlcm1hbmVudGx5LFxuICAgIFN0YXR1cy5Gb3VuZCxcbiAgICBTdGF0dXMuU2VlT3RoZXIsXG4gICAgU3RhdHVzLlVzZVByb3h5LFxuICAgIFN0YXR1cy5UZW1wb3JhcnlSZWRpcmVjdCxcbiAgICBTdGF0dXMuUGVybWFuZW50UmVkaXJlY3QsXG4gIF0uaW5jbHVkZXModmFsdWUpO1xufVxuXG4vKiogRGV0ZXJtaW5lcyBpZiBhIHN0cmluZyBcImxvb2tzXCIgbGlrZSBIVE1MICovXG5leHBvcnQgZnVuY3Rpb24gaXNIdG1sKHZhbHVlOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgcmV0dXJuIC9eXFxzKjwoPzohRE9DVFlQRXxodG1sfGJvZHkpL2kudGVzdCh2YWx1ZSk7XG59XG5cbi8qKiBSZXR1cm5zIGB1OGAgd2l0aCBsZWFkaW5nIHdoaXRlIHNwYWNlIHJlbW92ZWQuICovXG5leHBvcnQgZnVuY3Rpb24gc2tpcExXU1BDaGFyKHU4OiBVaW50OEFycmF5KTogVWludDhBcnJheSB7XG4gIGNvbnN0IHJlc3VsdCA9IG5ldyBVaW50OEFycmF5KHU4Lmxlbmd0aCk7XG4gIGxldCBqID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB1OC5sZW5ndGg7IGkrKykge1xuICAgIGlmICh1OFtpXSA9PT0gU1BBQ0UgfHwgdThbaV0gPT09IEhUQUIpIGNvbnRpbnVlO1xuICAgIHJlc3VsdFtqKytdID0gdThbaV07XG4gIH1cbiAgcmV0dXJuIHJlc3VsdC5zbGljZSgwLCBqKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0cmlwRW9sKHZhbHVlOiBVaW50OEFycmF5KTogVWludDhBcnJheSB7XG4gIGlmICh2YWx1ZVt2YWx1ZS5ieXRlTGVuZ3RoIC0gMV0gPT0gTEYpIHtcbiAgICBsZXQgZHJvcCA9IDE7XG4gICAgaWYgKHZhbHVlLmJ5dGVMZW5ndGggPiAxICYmIHZhbHVlW3ZhbHVlLmJ5dGVMZW5ndGggLSAyXSA9PT0gQ1IpIHtcbiAgICAgIGRyb3AgPSAyO1xuICAgIH1cbiAgICByZXR1cm4gdmFsdWUuc3ViYXJyYXkoMCwgdmFsdWUuYnl0ZUxlbmd0aCAtIGRyb3ApO1xuICB9XG4gIHJldHVybiB2YWx1ZTtcbn1cblxuLyohXG4gKiBBZGFwdGVkIGRpcmVjdGx5IGZyb20gaHR0cHM6Ly9naXRodWIuY29tL3BpbGxhcmpzL3Jlc29sdmUtcGF0aFxuICogd2hpY2ggaXMgbGljZW5zZWQgYXMgZm9sbG93czpcbiAqXG4gKiBUaGUgTUlUIExpY2Vuc2UgKE1JVClcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgSm9uYXRoYW4gT25nIDxtZUBqb25nbGViZXJyeS5jb20+XG4gKiBDb3B5cmlnaHQgKGMpIDIwMTUtMjAxOCBEb3VnbGFzIENocmlzdG9waGVyIFdpbHNvbiA8ZG91Z0Bzb21ldGhpbmdkb3VnLmNvbT5cbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmdcbiAqIGEgY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuICogJ1NvZnR3YXJlJyksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuICogd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuICogZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvXG4gKiBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG9cbiAqIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZVxuICogaW5jbHVkZWQgaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEICdBUyBJUycsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsXG4gKiBFWFBSRVNTIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0ZcbiAqIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC5cbiAqIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULFxuICogVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEVcbiAqIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuICovXG5cbmNvbnN0IFVQX1BBVEhfUkVHRVhQID0gLyg/Ol58W1xcXFwvXSlcXC5cXC4oPzpbXFxcXC9dfCQpLztcblxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVQYXRoKHJlbGF0aXZlUGF0aDogc3RyaW5nKTogc3RyaW5nO1xuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVQYXRoKHJvb3RQYXRoOiBzdHJpbmcsIHJlbGF0aXZlUGF0aDogc3RyaW5nKTogc3RyaW5nO1xuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVQYXRoKHJvb3RQYXRoOiBzdHJpbmcsIHJlbGF0aXZlUGF0aD86IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBwYXRoID0gcmVsYXRpdmVQYXRoO1xuICBsZXQgcm9vdCA9IHJvb3RQYXRoO1xuXG4gIC8vIHJvb3QgaXMgb3B0aW9uYWwsIHNpbWlsYXIgdG8gcm9vdC5yZXNvbHZlXG4gIGlmIChyZWxhdGl2ZVBhdGggPT09IHVuZGVmaW5lZCkge1xuICAgIHBhdGggPSByb290UGF0aDtcbiAgICByb290ID0gXCIuXCI7XG4gIH1cblxuICBpZiAocGF0aCA9PSBudWxsKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkFyZ3VtZW50IHJlbGF0aXZlUGF0aCBpcyByZXF1aXJlZC5cIik7XG4gIH1cblxuICAvLyBjb250YWluaW5nIE5VTEwgYnl0ZXMgaXMgbWFsaWNpb3VzXG4gIGlmIChwYXRoLmluY2x1ZGVzKFwiXFwwXCIpKSB7XG4gICAgdGhyb3cgY3JlYXRlSHR0cEVycm9yKDQwMCwgXCJNYWxpY2lvdXMgUGF0aFwiKTtcbiAgfVxuXG4gIC8vIHBhdGggc2hvdWxkIG5ldmVyIGJlIGFic29sdXRlXG4gIGlmIChpc0Fic29sdXRlKHBhdGgpKSB7XG4gICAgdGhyb3cgY3JlYXRlSHR0cEVycm9yKDQwMCwgXCJNYWxpY2lvdXMgUGF0aFwiKTtcbiAgfVxuXG4gIC8vIHBhdGggb3V0c2lkZSByb290XG4gIGlmIChVUF9QQVRIX1JFR0VYUC50ZXN0KG5vcm1hbGl6ZShcIi5cIiArIHNlcCArIHBhdGgpKSkge1xuICAgIHRocm93IGNyZWF0ZUh0dHBFcnJvcig0MDMpO1xuICB9XG5cbiAgLy8gam9pbiB0aGUgcmVsYXRpdmUgcGF0aFxuICByZXR1cm4gbm9ybWFsaXplKGpvaW4ocm9vdCwgcGF0aCkpO1xufVxuXG4vKiogQSB1dGlsaXR5IGNsYXNzIHRoYXQgdHJhbnNmb3JtcyBcImFueVwiIGNodW5rIGludG8gYW4gYFVpbnQ4QXJyYXlgLiAqL1xuZXhwb3J0IGNsYXNzIFVpbnQ4QXJyYXlUcmFuc2Zvcm1TdHJlYW1cbiAgZXh0ZW5kcyBUcmFuc2Zvcm1TdHJlYW08dW5rbm93biwgVWludDhBcnJheT4ge1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBjb25zdCBpbml0ID0ge1xuICAgICAgYXN5bmMgdHJhbnNmb3JtKFxuICAgICAgICBjaHVuazogdW5rbm93bixcbiAgICAgICAgY29udHJvbGxlcjogVHJhbnNmb3JtU3RyZWFtRGVmYXVsdENvbnRyb2xsZXI8VWludDhBcnJheT4sXG4gICAgICApIHtcbiAgICAgICAgY2h1bmsgPSBhd2FpdCBjaHVuaztcbiAgICAgICAgc3dpdGNoICh0eXBlb2YgY2h1bmspIHtcbiAgICAgICAgICBjYXNlIFwib2JqZWN0XCI6XG4gICAgICAgICAgICBpZiAoY2h1bmsgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgY29udHJvbGxlci50ZXJtaW5hdGUoKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoQXJyYXlCdWZmZXIuaXNWaWV3KGNodW5rKSkge1xuICAgICAgICAgICAgICBjb250cm9sbGVyLmVucXVldWUoXG4gICAgICAgICAgICAgICAgbmV3IFVpbnQ4QXJyYXkoXG4gICAgICAgICAgICAgICAgICBjaHVuay5idWZmZXIsXG4gICAgICAgICAgICAgICAgICBjaHVuay5ieXRlT2Zmc2V0LFxuICAgICAgICAgICAgICAgICAgY2h1bmsuYnl0ZUxlbmd0aCxcbiAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICAgICAgQXJyYXkuaXNBcnJheShjaHVuaykgJiZcbiAgICAgICAgICAgICAgY2h1bmsuZXZlcnkoKHZhbHVlKSA9PiB0eXBlb2YgdmFsdWUgPT09IFwibnVtYmVyXCIpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgY29udHJvbGxlci5lbnF1ZXVlKG5ldyBVaW50OEFycmF5KGNodW5rKSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICAgICB0eXBlb2YgY2h1bmsudmFsdWVPZiA9PT0gXCJmdW5jdGlvblwiICYmIGNodW5rLnZhbHVlT2YoKSAhPT0gY2h1bmtcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICB0aGlzLnRyYW5zZm9ybShjaHVuay52YWx1ZU9mKCksIGNvbnRyb2xsZXIpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChcInRvSlNPTlwiIGluIGNodW5rKSB7XG4gICAgICAgICAgICAgIHRoaXMudHJhbnNmb3JtKEpTT04uc3RyaW5naWZ5KGNodW5rKSwgY29udHJvbGxlcik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIFwic3ltYm9sXCI6XG4gICAgICAgICAgICBjb250cm9sbGVyLmVycm9yKFxuICAgICAgICAgICAgICBuZXcgVHlwZUVycm9yKFwiQ2Fubm90IHRyYW5zZm9ybSBhIHN5bWJvbCB0byBhIFVpbnQ4QXJyYXlcIiksXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBcInVuZGVmaW5lZFwiOlxuICAgICAgICAgICAgY29udHJvbGxlci5lcnJvcihcbiAgICAgICAgICAgICAgbmV3IFR5cGVFcnJvcihcIkNhbm5vdCB0cmFuc2Zvcm0gdW5kZWZpbmVkIHRvIGEgVWludDhBcnJheVwiKSxcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgY29udHJvbGxlci5lbnF1ZXVlKHRoaXMuZW5jb2Rlci5lbmNvZGUoU3RyaW5nKGNodW5rKSkpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgZW5jb2RlcjogbmV3IFRleHRFbmNvZGVyKCksXG4gICAgfTtcbiAgICBzdXBlcihpbml0KTtcbiAgfVxufVxuXG5jb25zdCByZXBsYWNlbWVudHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIFwiL1wiOiBcIl9cIixcbiAgXCIrXCI6IFwiLVwiLFxuICBcIj1cIjogXCJcIixcbn07XG5cbmNvbnN0IGVuY29kZXIgPSBuZXcgVGV4dEVuY29kZXIoKTtcblxuZXhwb3J0IGZ1bmN0aW9uIGVuY29kZUJhc2U2NFNhZmUoZGF0YTogc3RyaW5nIHwgQXJyYXlCdWZmZXIpOiBzdHJpbmcge1xuICByZXR1cm4gYmFzZTY0LmVuY29kZShkYXRhKS5yZXBsYWNlKC9cXC98XFwrfD0vZywgKGMpID0+IHJlcGxhY2VtZW50c1tjXSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc05vZGUoKTogYm9vbGVhbiB7XG4gIHJldHVybiBcInByb2Nlc3NcIiBpbiBnbG9iYWxUaGlzICYmIFwiZ2xvYmFsXCIgaW4gZ2xvYmFsVGhpcztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGltcG9ydEtleShrZXk6IEtleSk6IFByb21pc2U8Q3J5cHRvS2V5PiB7XG4gIGlmICh0eXBlb2Yga2V5ID09PSBcInN0cmluZ1wiKSB7XG4gICAga2V5ID0gZW5jb2Rlci5lbmNvZGUoa2V5KTtcbiAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGtleSkpIHtcbiAgICBrZXkgPSBuZXcgVWludDhBcnJheShrZXkpO1xuICB9XG4gIHJldHVybiBjcnlwdG8uc3VidGxlLmltcG9ydEtleShcbiAgICBcInJhd1wiLFxuICAgIGtleSxcbiAgICB7XG4gICAgICBuYW1lOiBcIkhNQUNcIixcbiAgICAgIGhhc2g6IHsgbmFtZTogXCJTSEEtMjU2XCIgfSxcbiAgICB9LFxuICAgIHRydWUsXG4gICAgW1wic2lnblwiLCBcInZlcmlmeVwiXSxcbiAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNpZ24oZGF0YTogRGF0YSwga2V5OiBDcnlwdG9LZXkpOiBQcm9taXNlPEFycmF5QnVmZmVyPiB7XG4gIGlmICh0eXBlb2YgZGF0YSA9PT0gXCJzdHJpbmdcIikge1xuICAgIGRhdGEgPSBlbmNvZGVyLmVuY29kZShkYXRhKTtcbiAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgZGF0YSA9IFVpbnQ4QXJyYXkuZnJvbShkYXRhKTtcbiAgfVxuICByZXR1cm4gY3J5cHRvLnN1YnRsZS5zaWduKFwiSE1BQ1wiLCBrZXksIGRhdGEpO1xufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLHlFQUF5RTtBQUl6RSxTQUNFLE1BQU0sRUFDTixlQUFlLEVBQ2YsVUFBVSxFQUNWLElBQUksRUFDSixTQUFTLEVBQ1QsR0FBRyxFQUNILE1BQU0sUUFDRCxZQUFZO0FBSW5CLE1BQU0sc0JBQ0o7QUFDRixNQUFNLE9BQU8sS0FBSyxVQUFVLENBQUM7QUFDN0IsTUFBTSxRQUFRLElBQUksVUFBVSxDQUFDO0FBQzdCLE1B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