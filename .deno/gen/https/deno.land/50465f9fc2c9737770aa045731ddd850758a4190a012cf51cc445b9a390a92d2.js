// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
/**
 * {@linkcode encode} and {@linkcode decode} for
 * [base64 URL safe](https://en.wikipedia.org/wiki/Base64#URL_applications) encoding.
 *
 * This module is browser compatible.
 *
 * @module
 */ import * as base64 from "./base64.ts";
/*
 * Some variants allow or require omitting the padding '=' signs:
 * https://en.wikipedia.org/wiki/Base64#The_URL_applications
 * @param base64url
 */ function addPaddingToBase64url(base64url) {
    if (base64url.length % 4 === 2) return base64url + "==";
    if (base64url.length % 4 === 3) return base64url + "=";
    if (base64url.length % 4 === 1) {
        throw new TypeError("Illegal base64url string!");
    }
    return base64url;
}
function convertBase64urlToBase64(b64url) {
    if (!/^[-_A-Z0-9]*?={0,2}$/i.test(b64url)) {
        // Contains characters not part of base64url spec.
        throw new TypeError("Failed to decode base64url: invalid character");
    }
    return addPaddingToBase64url(b64url).replace(/\-/g, "+").replace(/_/g, "/");
}
function convertBase64ToBase64url(b64) {
    return b64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
/**
 * Encodes a given ArrayBuffer or string into a base64url representation
 * @param data
 */ export function encode(data) {
    return convertBase64ToBase64url(base64.encode(data));
}
/**
 * Converts given base64url encoded data back to original
 * @param b64url
 */ export function decode(b64url) {
    return base64.decode(convertBase64urlToBase64(b64url));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE2MC4wL2VuY29kaW5nL2Jhc2U2NHVybC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuXG4vKipcbiAqIHtAbGlua2NvZGUgZW5jb2RlfSBhbmQge0BsaW5rY29kZSBkZWNvZGV9IGZvclxuICogW2Jhc2U2NCBVUkwgc2FmZV0oaHR0cHM6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQmFzZTY0I1VSTF9hcHBsaWNhdGlvbnMpIGVuY29kaW5nLlxuICpcbiAqIFRoaXMgbW9kdWxlIGlzIGJyb3dzZXIgY29tcGF0aWJsZS5cbiAqXG4gKiBAbW9kdWxlXG4gKi9cblxuaW1wb3J0ICogYXMgYmFzZTY0IGZyb20gXCIuL2Jhc2U2NC50c1wiO1xuXG4vKlxuICogU29tZSB2YXJpYW50cyBhbGxvdyBvciByZXF1aXJlIG9taXR0aW5nIHRoZSBwYWRkaW5nICc9JyBzaWduczpcbiAqIGh0dHBzOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0Jhc2U2NCNUaGVfVVJMX2FwcGxpY2F0aW9uc1xuICogQHBhcmFtIGJhc2U2NHVybFxuICovXG5mdW5jdGlvbiBhZGRQYWRkaW5nVG9CYXNlNjR1cmwoYmFzZTY0dXJsOiBzdHJpbmcpOiBzdHJpbmcge1xuICBpZiAoYmFzZTY0dXJsLmxlbmd0aCAlIDQgPT09IDIpIHJldHVybiBiYXNlNjR1cmwgKyBcIj09XCI7XG4gIGlmIChiYXNlNjR1cmwubGVuZ3RoICUgNCA9PT0gMykgcmV0dXJuIGJhc2U2NHVybCArIFwiPVwiO1xuICBpZiAoYmFzZTY0dXJsLmxlbmd0aCAlIDQgPT09IDEpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiSWxsZWdhbCBiYXNlNjR1cmwgc3RyaW5nIVwiKTtcbiAgfVxuICByZXR1cm4gYmFzZTY0dXJsO1xufVxuXG5mdW5jdGlvbiBjb252ZXJ0QmFzZTY0dXJsVG9CYXNlNjQoYjY0dXJsOiBzdHJpbmcpOiBzdHJpbmcge1xuICBpZiAoIS9eWy1fQS1aMC05XSo/PXswLDJ9JC9pLnRlc3QoYjY0dXJsKSkge1xuICAgIC8vIENvbnRhaW5zIGNoYXJhY3RlcnMgbm90IHBhcnQgb2YgYmFzZTY0dXJsIHNwZWMuXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkZhaWxlZCB0byBkZWNvZGUgYmFzZTY0dXJsOiBpbnZhbGlkIGNoYXJhY3RlclwiKTtcbiAgfVxuICByZXR1cm4gYWRkUGFkZGluZ1RvQmFzZTY0dXJsKGI2NHVybCkucmVwbGFjZSgvXFwtL2csIFwiK1wiKS5yZXBsYWNlKC9fL2csIFwiL1wiKTtcbn1cblxuZnVuY3Rpb24gY29udmVydEJhc2U2NFRvQmFzZTY0dXJsKGI2NDogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIGI2NC5yZXBsYWNlKC89L2csIFwiXCIpLnJlcGxhY2UoL1xcKy9nLCBcIi1cIikucmVwbGFjZSgvXFwvL2csIFwiX1wiKTtcbn1cblxuLyoqXG4gKiBFbmNvZGVzIGEgZ2l2ZW4gQXJyYXlCdWZmZXIgb3Igc3RyaW5nIGludG8gYSBiYXNlNjR1cmwgcmVwcmVzZW50YXRpb25cbiAqIEBwYXJhbSBkYXRhXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlbmNvZGUoZGF0YTogQXJyYXlCdWZmZXIgfCBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gY29udmVydEJhc2U2NFRvQmFzZTY0dXJsKGJhc2U2NC5lbmNvZGUoZGF0YSkpO1xufVxuXG4vKipcbiAqIENvbnZlcnRzIGdpdmVuIGJhc2U2NHVybCBlbmNvZGVkIGRhdGEgYmFjayB0byBvcmlnaW5hbFxuICogQHBhcmFtIGI2NHVybFxuICovXG5leHBvcnQgZnVuY3Rpb24gZGVjb2RlKGI2NHVybDogc3RyaW5nKTogVWludDhBcnJheSB7XG4gIHJldHVybiBiYXNlNjQuZGVjb2RlKGNvbnZlcnRCYXNlNjR1cmxUb0Jhc2U2NChiNjR1cmwpKTtcbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSwwRUFBMEU7QUFFMUU7Ozs7Ozs7Q0FPQyxHQUVELFlBQVksWUFBWSxjQUFjO0FBRXRDOzs7O0NBSUMsR0FDRCxTQUFTLHNCQUFzQixTQUFpQixFQUFVO0lBQ3hELElBQUksVUFBVSxNQUFNLEdBQUcsTUFBTSxHQUFHLE9BQU8sWUFBWTtJQUNuRCxJQUFJLFVBQVUsTUFBTSxHQUFHLE1BQU0sR0FBRyxPQUFPLFlBQVk7SUFDbkQsSUFBSSxVQUFVLE1BQU0sR0FBRyxNQUFNLEdBQUc7UUFDOUIsTUFBTSxJQUFJLFVBQVUsNkJBQTZCO0lBQ25ELENBQUM7SUFDRCxPQUFPO0FBQ1Q7QUFFQSxTQUFTLHlCQUF5QixNQUFjLEVBQVU7SUFDeEQsSUFBSSxDQUFDLHdCQUF3QixJQUFJLENBQUMsU0FBUztRQUN6QyxrREFBa0Q7UUFDbEQsTUFBTSxJQUFJLFVBQVUsaURBQWlEO0lBQ3ZFLENBQUM7SUFDRCxPQUFPLHNCQUFzQixRQUFRLE9BQU8sQ0FBQyxPQUFPLEtBQUssT0FBTyxDQUFDLE1BQU07QUFDekU7QUFFQSxTQUFTLHlCQUF5QixHQUFXLEVBQVU7SUFDckQsT0FBTyxJQUFJLE9BQU8sQ0FBQyxNQUFNLElBQUksT0FBTyxDQUFDLE9BQU8sS0FBSyxPQUFPLENBQUMsT0FBTztBQUNsRTtBQUVBOzs7Q0FHQyxHQUNELE9BQU8sU0FBUyxPQUFPLElBQTBCLEVBQVU7SUFDekQsT0FBTyx5QkFBeUIsT0FBTyxNQUFNLENBQUM7QUFDaEQsQ0FBQztBQUVEOzs7Q0FHQyxHQUNELE9BQU8sU0FBUyxPQUFPLE1BQWMsRUFBYztJQUNqRCxPQUFPLE9BQU8sTUFBTSxDQUFDLHlCQUF5QjtBQUNoRCxDQUFDIn0=