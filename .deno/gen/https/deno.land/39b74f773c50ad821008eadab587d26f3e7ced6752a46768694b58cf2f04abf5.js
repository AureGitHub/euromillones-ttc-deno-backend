// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
/** Supporting functions for media_types that do not make part of the public
 * API.
 *
 * @module
 * @private
 */ export function consumeToken(v) {
    const notPos = indexOf(v, isNotTokenChar);
    if (notPos == -1) {
        return [
            v,
            ""
        ];
    }
    if (notPos == 0) {
        return [
            "",
            v
        ];
    }
    return [
        v.slice(0, notPos),
        v.slice(notPos)
    ];
}
export function consumeValue(v) {
    if (!v) {
        return [
            "",
            v
        ];
    }
    if (v[0] !== `"`) {
        return consumeToken(v);
    }
    let value = "";
    for(let i = 1; i < v.length; i++){
        const r = v[i];
        if (r === `"`) {
            return [
                value,
                v.slice(i + 1)
            ];
        }
        if (r === "\\" && i + 1 < v.length && isTSpecial(v[i + 1])) {
            value += v[i + 1];
            i++;
            continue;
        }
        if (r === "\r" || r === "\n") {
            return [
                "",
                v
            ];
        }
        value += v[i];
    }
    return [
        "",
        v
    ];
}
export function consumeMediaParam(v) {
    let rest = v.trimStart();
    if (!rest.startsWith(";")) {
        return [
            "",
            "",
            v
        ];
    }
    rest = rest.slice(1);
    rest = rest.trimStart();
    let param;
    [param, rest] = consumeToken(rest);
    param = param.toLowerCase();
    if (!param) {
        return [
            "",
            "",
            v
        ];
    }
    rest = rest.slice(1);
    rest = rest.trimStart();
    const [value, rest2] = consumeValue(rest);
    if (value == "" && rest2 === rest) {
        return [
            "",
            "",
            v
        ];
    }
    rest = rest2;
    return [
        param,
        value,
        rest
    ];
}
export function decode2331Encoding(v) {
    const sv = v.split(`'`, 3);
    if (sv.length !== 3) {
        return undefined;
    }
    const charset = sv[0].toLowerCase();
    if (!charset) {
        return undefined;
    }
    if (charset != "us-ascii" && charset != "utf-8") {
        return undefined;
    }
    const encv = decodeURI(sv[2]);
    if (!encv) {
        return undefined;
    }
    return encv;
}
function indexOf(s, fn) {
    let i = -1;
    for (const v of s){
        i++;
        if (fn(v)) {
            return i;
        }
    }
    return -1;
}
export function isIterator(obj) {
    if (obj == null) {
        return false;
    }
    // deno-lint-ignore no-explicit-any
    return typeof obj[Symbol.iterator] === "function";
}
export function isToken(s) {
    if (!s) {
        return false;
    }
    return indexOf(s, isNotTokenChar) < 0;
}
function isNotTokenChar(r) {
    return !isTokenChar(r);
}
function isTokenChar(r) {
    const code = r.charCodeAt(0);
    return code > 0x20 && code < 0x7f && !isTSpecial(r);
}
function isTSpecial(r) {
    return `()<>@,;:\\"/[]?=`.includes(r[0]);
}
const CHAR_CODE_SPACE = " ".charCodeAt(0);
const CHAR_CODE_TILDE = "~".charCodeAt(0);
export function needsEncoding(s) {
    for (const b of s){
        const charCode = b.charCodeAt(0);
        if ((charCode < CHAR_CODE_SPACE || charCode > CHAR_CODE_TILDE) && b !== "\t") {
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE1Mi4wL21lZGlhX3R5cGVzL191dGlsLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAyMDE4LTIwMjIgdGhlIERlbm8gYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG5cbi8qKiBTdXBwb3J0aW5nIGZ1bmN0aW9ucyBmb3IgbWVkaWFfdHlwZXMgdGhhdCBkbyBub3QgbWFrZSBwYXJ0IG9mIHRoZSBwdWJsaWNcbiAqIEFQSS5cbiAqXG4gKiBAbW9kdWxlXG4gKiBAcHJpdmF0ZVxuICovXG5cbmV4cG9ydCBmdW5jdGlvbiBjb25zdW1lVG9rZW4odjogc3RyaW5nKTogW3Rva2VuOiBzdHJpbmcsIHJlc3Q6IHN0cmluZ10ge1xuICBjb25zdCBub3RQb3MgPSBpbmRleE9mKHYsIGlzTm90VG9rZW5DaGFyKTtcbiAgaWYgKG5vdFBvcyA9PSAtMSkge1xuICAgIHJldHVybiBbdiwgXCJcIl07XG4gIH1cbiAgaWYgKG5vdFBvcyA9PSAwKSB7XG4gICAgcmV0dXJuIFtcIlwiLCB2XTtcbiAgfVxuICByZXR1cm4gW3Yuc2xpY2UoMCwgbm90UG9zKSwgdi5zbGljZShub3RQb3MpXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbnN1bWVWYWx1ZSh2OiBzdHJpbmcpOiBbdmFsdWU6IHN0cmluZywgcmVzdDogc3RyaW5nXSB7XG4gIGlmICghdikge1xuICAgIHJldHVybiBbXCJcIiwgdl07XG4gIH1cbiAgaWYgKHZbMF0gIT09IGBcImApIHtcbiAgICByZXR1cm4gY29uc3VtZVRva2VuKHYpO1xuICB9XG4gIGxldCB2YWx1ZSA9IFwiXCI7XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgdi5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHIgPSB2W2ldO1xuICAgIGlmIChyID09PSBgXCJgKSB7XG4gICAgICByZXR1cm4gW3ZhbHVlLCB2LnNsaWNlKGkgKyAxKV07XG4gICAgfVxuICAgIGlmIChyID09PSBcIlxcXFxcIiAmJiBpICsgMSA8IHYubGVuZ3RoICYmIGlzVFNwZWNpYWwodltpICsgMV0pKSB7XG4gICAgICB2YWx1ZSArPSB2W2kgKyAxXTtcbiAgICAgIGkrKztcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAociA9PT0gXCJcXHJcIiB8fCByID09PSBcIlxcblwiKSB7XG4gICAgICByZXR1cm4gW1wiXCIsIHZdO1xuICAgIH1cbiAgICB2YWx1ZSArPSB2W2ldO1xuICB9XG4gIHJldHVybiBbXCJcIiwgdl07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb25zdW1lTWVkaWFQYXJhbShcbiAgdjogc3RyaW5nLFxuKTogW2tleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nLCByZXN0OiBzdHJpbmddIHtcbiAgbGV0IHJlc3QgPSB2LnRyaW1TdGFydCgpO1xuICBpZiAoIXJlc3Quc3RhcnRzV2l0aChcIjtcIikpIHtcbiAgICByZXR1cm4gW1wiXCIsIFwiXCIsIHZdO1xuICB9XG4gIHJlc3QgPSByZXN0LnNsaWNlKDEpO1xuICByZXN0ID0gcmVzdC50cmltU3RhcnQoKTtcbiAgbGV0IHBhcmFtOiBzdHJpbmc7XG4gIFtwYXJhbSwgcmVzdF0gPSBjb25zdW1lVG9rZW4ocmVzdCk7XG4gIHBhcmFtID0gcGFyYW0udG9Mb3dlckNhc2UoKTtcbiAgaWYgKCFwYXJhbSkge1xuICAgIHJldHVybiBbXCJcIiwgXCJcIiwgdl07XG4gIH1cbiAgcmVzdCA9IHJlc3Quc2xpY2UoMSk7XG4gIHJlc3QgPSByZXN0LnRyaW1TdGFydCgpO1xuICBjb25zdCBbdmFsdWUsIHJlc3QyXSA9IGNvbnN1bWVWYWx1ZShyZXN0KTtcbiAgaWYgKHZhbHVlID09IFwiXCIgJiYgcmVzdDIgPT09IHJlc3QpIHtcbiAgICByZXR1cm4gW1wiXCIsIFwiXCIsIHZdO1xuICB9XG4gIHJlc3QgPSByZXN0MjtcbiAgcmV0dXJuIFtwYXJhbSwgdmFsdWUsIHJlc3RdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVjb2RlMjMzMUVuY29kaW5nKHY6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IHN2ID0gdi5zcGxpdChgJ2AsIDMpO1xuICBpZiAoc3YubGVuZ3RoICE9PSAzKSB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuICBjb25zdCBjaGFyc2V0ID0gc3ZbMF0udG9Mb3dlckNhc2UoKTtcbiAgaWYgKCFjaGFyc2V0KSB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuICBpZiAoY2hhcnNldCAhPSBcInVzLWFzY2lpXCIgJiYgY2hhcnNldCAhPSBcInV0Zi04XCIpIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG4gIGNvbnN0IGVuY3YgPSBkZWNvZGVVUkkoc3ZbMl0pO1xuICBpZiAoIWVuY3YpIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG4gIHJldHVybiBlbmN2O1xufVxuXG5mdW5jdGlvbiBpbmRleE9mPFQ+KHM6IEl0ZXJhYmxlPFQ+LCBmbjogKHM6IFQpID0+IGJvb2xlYW4pOiBudW1iZXIge1xuICBsZXQgaSA9IC0xO1xuICBmb3IgKGNvbnN0IHYgb2Ygcykge1xuICAgIGkrKztcbiAgICBpZiAoZm4odikpIHtcbiAgICAgIHJldHVybiBpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gLTE7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0l0ZXJhdG9yPFQ+KG9iajogdW5rbm93bik6IG9iaiBpcyBJdGVyYWJsZTxUPiB7XG4gIGlmIChvYmogPT0gbnVsbCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICByZXR1cm4gdHlwZW9mIChvYmogYXMgYW55KVtTeW1ib2wuaXRlcmF0b3JdID09PSBcImZ1bmN0aW9uXCI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1Rva2VuKHM6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBpZiAoIXMpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIGluZGV4T2YocywgaXNOb3RUb2tlbkNoYXIpIDwgMDtcbn1cblxuZnVuY3Rpb24gaXNOb3RUb2tlbkNoYXIocjogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiAhaXNUb2tlbkNoYXIocik7XG59XG5cbmZ1bmN0aW9uIGlzVG9rZW5DaGFyKHI6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBjb25zdCBjb2RlID0gci5jaGFyQ29kZUF0KDApO1xuICByZXR1cm4gY29kZSA+IDB4MjAgJiYgY29kZSA8IDB4N2YgJiYgIWlzVFNwZWNpYWwocik7XG59XG5cbmZ1bmN0aW9uIGlzVFNwZWNpYWwocjogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiBgKCk8PkAsOzpcXFxcXCIvW10/PWAuaW5jbHVkZXMoclswXSk7XG59XG5cbmNvbnN0IENIQVJfQ09ERV9TUEFDRSA9IFwiIFwiLmNoYXJDb2RlQXQoMCk7XG5jb25zdCBDSEFSX0NPREVfVElMREUgPSBcIn5cIi5jaGFyQ29kZUF0KDApO1xuXG5leHBvcnQgZnVuY3Rpb24gbmVlZHNFbmNvZGluZyhzOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgZm9yIChjb25zdCBiIG9mIHMpIHtcbiAgICBjb25zdCBjaGFyQ29kZSA9IGIuY2hhckNvZGVBdCgwKTtcbiAgICBpZiAoXG4gICAgICAoY2hhckNvZGUgPCBDSEFSX0NPREVfU1BBQ0UgfHwgY2hhckNvZGUgPiBDSEFSX0NPREVfVElMREUpICYmIGIgIT09IFwiXFx0XCJcbiAgICApIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsMEVBQTBFO0FBRTFFOzs7OztDQUtDLEdBRUQsT0FBTyxTQUFTLGFBQWEsQ0FBUyxFQUFpQztJQUNyRSxNQUFNLFNBQVMsUUFBUSxHQUFHO0lBQzFCLElBQUksVUFBVSxDQUFDLEdBQUc7UUFDaEIsT0FBTztZQUFDO1lBQUc7U0FBRztJQUNoQixDQUFDO0lBQ0QsSUFB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