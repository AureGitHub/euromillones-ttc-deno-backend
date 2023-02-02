// Copyright 2018-2022 the oak authors. All rights reserved. MIT license.
import { errors } from "./deps.ts";
const COLON = ":".charCodeAt(0);
const HTAB = "\t".charCodeAt(0);
const SPACE = " ".charCodeAt(0);
const decoder = new TextDecoder();
/** With a provided attribute pattern, return a RegExp which will match and
 * capture in the first group the value of the attribute from a header value. */ export function toParamRegExp(attributePattern, flags) {
    // deno-fmt-ignore
    return new RegExp(`(?:^|;)\\s*${attributePattern}\\s*=\\s*` + `(` + `[^";\\s][^;\\s]*` + `|` + `"(?:[^"\\\\]|\\\\"?)+"?` + `)`, flags);
}
/** Asynchronously read the headers out of body request and resolve with them as
 * a `Headers` object. */ export async function readHeaders(body) {
    const headers = {};
    let readResult = await body.readLine();
    while(readResult){
        const { bytes  } = readResult;
        if (!bytes.length) {
            return headers;
        }
        let i = bytes.indexOf(COLON);
        if (i === -1) {
            throw new errors.BadRequest(`Malformed header: ${decoder.decode(bytes)}`);
        }
        const key = decoder.decode(bytes.subarray(0, i)).trim().toLowerCase();
        if (key === "") {
            throw new errors.BadRequest("Invalid header key.");
        }
        i++;
        while(i < bytes.byteLength && (bytes[i] === SPACE || bytes[i] === HTAB)){
            i++;
        }
        const value = decoder.decode(bytes.subarray(i)).trim();
        headers[key] = value;
        readResult = await body.readLine();
    }
    throw new errors.BadRequest("Unexpected end of body reached.");
}
/** Unquotes attribute values that might be pass as part of a header. */ export function unquote(value) {
    if (value.startsWith(`"`)) {
        const parts = value.slice(1).split(`\\"`);
        for(let i = 0; i < parts.length; ++i){
            const quoteIndex = parts[i].indexOf(`"`);
            if (quoteIndex !== -1) {
                parts[i] = parts[i].slice(0, quoteIndex);
                parts.length = i + 1; // Truncates and stops the loop
            }
            parts[i] = parts[i].replace(/\\(.)/g, "$1");
        }
        value = parts.join(`"`);
    }
    return value;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMS4xLjAvaGVhZGVycy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBvYWsgYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG5cbmltcG9ydCB0eXBlIHsgQnVmUmVhZGVyIH0gZnJvbSBcIi4vYnVmX3JlYWRlci50c1wiO1xuaW1wb3J0IHsgZXJyb3JzIH0gZnJvbSBcIi4vZGVwcy50c1wiO1xuXG5jb25zdCBDT0xPTiA9IFwiOlwiLmNoYXJDb2RlQXQoMCk7XG5jb25zdCBIVEFCID0gXCJcXHRcIi5jaGFyQ29kZUF0KDApO1xuY29uc3QgU1BBQ0UgPSBcIiBcIi5jaGFyQ29kZUF0KDApO1xuXG5jb25zdCBkZWNvZGVyID0gbmV3IFRleHREZWNvZGVyKCk7XG5cbi8qKiBXaXRoIGEgcHJvdmlkZWQgYXR0cmlidXRlIHBhdHRlcm4sIHJldHVybiBhIFJlZ0V4cCB3aGljaCB3aWxsIG1hdGNoIGFuZFxuICogY2FwdHVyZSBpbiB0aGUgZmlyc3QgZ3JvdXAgdGhlIHZhbHVlIG9mIHRoZSBhdHRyaWJ1dGUgZnJvbSBhIGhlYWRlciB2YWx1ZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0b1BhcmFtUmVnRXhwKFxuICBhdHRyaWJ1dGVQYXR0ZXJuOiBzdHJpbmcsXG4gIGZsYWdzPzogc3RyaW5nLFxuKTogUmVnRXhwIHtcbiAgLy8gZGVuby1mbXQtaWdub3JlXG4gIHJldHVybiBuZXcgUmVnRXhwKFxuICAgIGAoPzpefDspXFxcXHMqJHthdHRyaWJ1dGVQYXR0ZXJufVxcXFxzKj1cXFxccypgICtcbiAgICBgKGAgK1xuICAgICAgYFteXCI7XFxcXHNdW147XFxcXHNdKmAgK1xuICAgIGB8YCArXG4gICAgICBgXCIoPzpbXlwiXFxcXFxcXFxdfFxcXFxcXFxcXCI/KStcIj9gICtcbiAgICBgKWAsXG4gICAgZmxhZ3NcbiAgKTtcbn1cblxuLyoqIEFzeW5jaHJvbm91c2x5IHJlYWQgdGhlIGhlYWRlcnMgb3V0IG9mIGJvZHkgcmVxdWVzdCBhbmQgcmVzb2x2ZSB3aXRoIHRoZW0gYXNcbiAqIGEgYEhlYWRlcnNgIG9iamVjdC4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZWFkSGVhZGVycyhcbiAgYm9keTogQnVmUmVhZGVyLFxuKTogUHJvbWlzZTxSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+PiB7XG4gIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgbGV0IHJlYWRSZXN1bHQgPSBhd2FpdCBib2R5LnJlYWRMaW5lKCk7XG4gIHdoaWxlIChyZWFkUmVzdWx0KSB7XG4gICAgY29uc3QgeyBieXRlcyB9ID0gcmVhZFJlc3VsdDtcbiAgICBpZiAoIWJ5dGVzLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIGhlYWRlcnM7XG4gICAgfVxuICAgIGxldCBpID0gYnl0ZXMuaW5kZXhPZihDT0xPTik7XG4gICAgaWYgKGkgPT09IC0xKSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkJhZFJlcXVlc3QoXG4gICAgICAgIGBNYWxmb3JtZWQgaGVhZGVyOiAke2RlY29kZXIuZGVjb2RlKGJ5dGVzKX1gLFxuICAgICAgKTtcbiAgICB9XG4gICAgY29uc3Qga2V5ID0gZGVjb2Rlci5kZWNvZGUoYnl0ZXMuc3ViYXJyYXkoMCwgaSkpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIGlmIChrZXkgPT09IFwiXCIpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuQmFkUmVxdWVzdChcIkludmFsaWQgaGVhZGVyIGtleS5cIik7XG4gICAgfVxuICAgIGkrKztcbiAgICB3aGlsZSAoaSA8IGJ5dGVzLmJ5dGVMZW5ndGggJiYgKGJ5dGVzW2ldID09PSBTUEFDRSB8fCBieXRlc1tpXSA9PT0gSFRBQikpIHtcbiAgICAgIGkrKztcbiAgICB9XG4gICAgY29uc3QgdmFsdWUgPSBkZWNvZGVyLmRlY29kZShieXRlcy5zdWJhcnJheShpKSkudHJpbSgpO1xuICAgIGhlYWRlcnNba2V5XSA9IHZhbHVlO1xuICAgIHJlYWRSZXN1bHQgPSBhd2FpdCBib2R5LnJlYWRMaW5lKCk7XG4gIH1cbiAgdGhyb3cgbmV3IGVycm9ycy5CYWRSZXF1ZXN0KFwiVW5leHBlY3RlZCBlbmQgb2YgYm9keSByZWFjaGVkLlwiKTtcbn1cblxuLyoqIFVucXVvdGVzIGF0dHJpYnV0ZSB2YWx1ZXMgdGhhdCBtaWdodCBiZSBwYXNzIGFzIHBhcnQgb2YgYSBoZWFkZXIuICovXG5leHBvcnQgZnVuY3Rpb24gdW5xdW90ZSh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgaWYgKHZhbHVlLnN0YXJ0c1dpdGgoYFwiYCkpIHtcbiAgICBjb25zdCBwYXJ0cyA9IHZhbHVlLnNsaWNlKDEpLnNwbGl0KGBcXFxcXCJgKTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBhcnRzLmxlbmd0aDsgKytpKSB7XG4gICAgICBjb25zdCBxdW90ZUluZGV4ID0gcGFydHNbaV0uaW5kZXhPZihgXCJgKTtcbiAgICAgIGlmIChxdW90ZUluZGV4ICE9PSAtMSkge1xuICAgICAgICBwYXJ0c1tpXSA9IHBhcnRzW2ldLnNsaWNlKDAsIHF1b3RlSW5kZXgpO1xuICAgICAgICBwYXJ0cy5sZW5ndGggPSBpICsgMTsgLy8gVHJ1bmNhdGVzIGFuZCBzdG9wcyB0aGUgbG9vcFxuICAgICAgfVxuICAgICAgcGFydHNbaV0gPSBwYXJ0c1tpXS5yZXBsYWNlKC9cXFxcKC4pL2csIFwiJDFcIik7XG4gICAgfVxuICAgIHZhbHVlID0gcGFydHMuam9pbihgXCJgKTtcbiAgfVxuICByZXR1cm4gdmFsdWU7XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEseUVBQXlFO0FBR3pFLFNBQVMsTUFBTSxRQUFRLFlBQVk7QUFFbkMsTUFBTSxRQUFRLElBQUksVUFBVSxDQUFDO0FBQzdCLE1BQU0sT0FBTyxLQUFLLFVBQVUsQ0FBQztBQUM3QixNQUFNLFFBQVEsSUFBSSxVQUFVLENBQUM7QUFFN0IsTUFBTSxV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