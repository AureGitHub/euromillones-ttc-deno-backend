// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
// This module is browser compatible.
import { bgGreen, bgRed, bold, gray, green, red, white } from "../fmt/colors.ts";
export var DiffType;
(function(DiffType) {
    DiffType["removed"] = "removed";
    DiffType["common"] = "common";
    DiffType["added"] = "added";
})(DiffType || (DiffType = {}));
const REMOVED = 1;
const COMMON = 2;
const ADDED = 3;
function createCommon(A, B, reverse) {
    const common = [];
    if (A.length === 0 || B.length === 0) return [];
    for(let i = 0; i < Math.min(A.length, B.length); i += 1){
        if (A[reverse ? A.length - i - 1 : i] === B[reverse ? B.length - i - 1 : i]) {
            common.push(A[reverse ? A.length - i - 1 : i]);
        } else {
            return common;
        }
    }
    return common;
}
/**
 * Renders the differences between the actual and expected values
 * @param A Actual value
 * @param B Expected value
 */ export function diff(A, B) {
    const prefixCommon = createCommon(A, B);
    const suffixCommon = createCommon(A.slice(prefixCommon.length), B.slice(prefixCommon.length), true).reverse();
    A = suffixCommon.length ? A.slice(prefixCommon.length, -suffixCommon.length) : A.slice(prefixCommon.length);
    B = suffixCommon.length ? B.slice(prefixCommon.length, -suffixCommon.length) : B.slice(prefixCommon.length);
    const swapped = B.length > A.length;
    [A, B] = swapped ? [
        B,
        A
    ] : [
        A,
        B
    ];
    const M = A.length;
    const N = B.length;
    if (!M && !N && !suffixCommon.length && !prefixCommon.length) return [];
    if (!N) {
        return [
            ...prefixCommon.map((c)=>({
                    type: DiffType.common,
                    value: c
                })),
            ...A.map((a)=>({
                    type: swapped ? DiffType.added : DiffType.removed,
                    value: a
                })),
            ...suffixCommon.map((c)=>({
                    type: DiffType.common,
                    value: c
                }))
        ];
    }
    const offset = N;
    const delta = M - N;
    const size = M + N + 1;
    const fp = Array.from({
        length: size
    }, ()=>({
            y: -1,
            id: -1
        }));
    /**
   * INFO:
   * This buffer is used to save memory and improve performance.
   * The first half is used to save route and last half is used to save diff
   * type.
   * This is because, when I kept new uint8array area to save type,performance
   * worsened.
   */ const routes = new Uint32Array((M * N + size + 1) * 2);
    const diffTypesPtrOffset = routes.length / 2;
    let ptr = 0;
    let p = -1;
    function backTrace(A, B, current, swapped) {
        const M = A.length;
        const N = B.length;
        const result = [];
        let a = M - 1;
        let b = N - 1;
        let j = routes[current.id];
        let type = routes[current.id + diffTypesPtrOffset];
        while(true){
            if (!j && !type) break;
            const prev = j;
            if (type === REMOVED) {
                result.unshift({
                    type: swapped ? DiffType.removed : DiffType.added,
                    value: B[b]
                });
                b -= 1;
            } else if (type === ADDED) {
                result.unshift({
                    type: swapped ? DiffType.added : DiffType.removed,
                    value: A[a]
                });
                a -= 1;
            } else {
                result.unshift({
                    type: DiffType.common,
                    value: A[a]
                });
                a -= 1;
                b -= 1;
            }
            j = routes[prev];
            type = routes[prev + diffTypesPtrOffset];
        }
        return result;
    }
    function createFP(slide, down, k, M) {
        if (slide && slide.y === -1 && down && down.y === -1) {
            return {
                y: 0,
                id: 0
            };
        }
        if (down && down.y === -1 || k === M || (slide && slide.y) > (down && down.y) + 1) {
            const prev = slide.id;
            ptr++;
            routes[ptr] = prev;
            routes[ptr + diffTypesPtrOffset] = ADDED;
            return {
                y: slide.y,
                id: ptr
            };
        } else {
            const prev1 = down.id;
            ptr++;
            routes[ptr] = prev1;
            routes[ptr + diffTypesPtrOffset] = REMOVED;
            return {
                y: down.y + 1,
                id: ptr
            };
        }
    }
    function snake(k, slide, down, _offset, A, B) {
        const M = A.length;
        const N = B.length;
        if (k < -N || M < k) return {
            y: -1,
            id: -1
        };
        const fp = createFP(slide, down, k, M);
        while(fp.y + k < M && fp.y < N && A[fp.y + k] === B[fp.y]){
            const prev = fp.id;
            ptr++;
            fp.id = ptr;
            fp.y += 1;
            routes[ptr] = prev;
            routes[ptr + diffTypesPtrOffset] = COMMON;
        }
        return fp;
    }
    while(fp[delta + offset].y < N){
        p = p + 1;
        for(let k = -p; k < delta; ++k){
            fp[k + offset] = snake(k, fp[k - 1 + offset], fp[k + 1 + offset], offset, A, B);
        }
        for(let k1 = delta + p; k1 > delta; --k1){
            fp[k1 + offset] = snake(k1, fp[k1 - 1 + offset], fp[k1 + 1 + offset], offset, A, B);
        }
        fp[delta + offset] = snake(delta, fp[delta - 1 + offset], fp[delta + 1 + offset], offset, A, B);
    }
    return [
        ...prefixCommon.map((c)=>({
                type: DiffType.common,
                value: c
            })),
        ...backTrace(A, B, fp[delta + offset], swapped),
        ...suffixCommon.map((c)=>({
                type: DiffType.common,
                value: c
            }))
    ];
}
/**
 * Renders the differences between the actual and expected strings
 * Partially inspired from https://github.com/kpdecker/jsdiff
 * @param A Actual string
 * @param B Expected string
 */ export function diffstr(A, B) {
    function unescape(string) {
        // unescape invisible characters.
        // ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String#escape_sequences
        return string.replaceAll("\b", "\\b").replaceAll("\f", "\\f").replaceAll("\t", "\\t").replaceAll("\v", "\\v").replaceAll(/\r\n|\r|\n/g, (str)=>str === "\r" ? "\\r" : str === "\n" ? "\\n\n" : "\\r\\n\r\n");
    }
    function tokenize(string, { wordDiff =false  } = {}) {
        if (wordDiff) {
            // Split string on whitespace symbols
            const tokens = string.split(/([^\S\r\n]+|[()[\]{}'"\r\n]|\b)/);
            // Extended Latin character set
            const words = /^[a-zA-Z\u{C0}-\u{FF}\u{D8}-\u{F6}\u{F8}-\u{2C6}\u{2C8}-\u{2D7}\u{2DE}-\u{2FF}\u{1E00}-\u{1EFF}]+$/u;
            // Join boundary splits that we do not consider to be boundaries and merge empty strings surrounded by word chars
            for(let i = 0; i < tokens.length - 1; i++){
                if (!tokens[i + 1] && tokens[i + 2] && words.test(tokens[i]) && words.test(tokens[i + 2])) {
                    tokens[i] += tokens[i + 2];
                    tokens.splice(i + 1, 2);
                    i--;
                }
            }
            return tokens.filter((token)=>token);
        } else {
            // Split string on new lines symbols
            const tokens1 = [], lines = string.split(/(\n|\r\n)/);
            // Ignore final empty token when text ends with a newline
            if (!lines[lines.length - 1]) {
                lines.pop();
            }
            // Merge the content and line separators into single tokens
            for(let i1 = 0; i1 < lines.length; i1++){
                if (i1 % 2) {
                    tokens1[tokens1.length - 1] += lines[i1];
                } else {
                    tokens1.push(lines[i1]);
                }
            }
            return tokens1;
        }
    }
    // Create details by filtering relevant word-diff for current line
    // and merge "space-diff" if surrounded by word-diff for cleaner displays
    function createDetails(line, tokens) {
        return tokens.filter(({ type  })=>type === line.type || type === DiffType.common).map((result, i, t)=>{
            if (result.type === DiffType.common && t[i - 1] && t[i - 1]?.type === t[i + 1]?.type && /\s+/.test(result.value)) {
                result.type = t[i - 1].type;
            }
            return result;
        });
    }
    // Compute multi-line diff
    const diffResult = diff(tokenize(`${unescape(A)}\n`), tokenize(`${unescape(B)}\n`));
    const added = [], removed = [];
    for (const result of diffResult){
        if (result.type === DiffType.added) {
            added.push(result);
        }
        if (result.type === DiffType.removed) {
            removed.push(result);
        }
    }
    // Compute word-diff
    const aLines = added.length < removed.length ? added : removed;
    const bLines = aLines === removed ? added : removed;
    for (const a of aLines){
        let tokens = [], b;
        // Search another diff line with at least one common token
        while(bLines.length){
            b = bLines.shift();
            tokens = diff(tokenize(a.value, {
                wordDiff: true
            }), tokenize(b?.value ?? "", {
                wordDiff: true
            }));
            if (tokens.some(({ type , value  })=>type === DiffType.common && value.trim().length)) {
                break;
            }
        }
        // Register word-diff details
        a.details = createDetails(a, tokens);
        if (b) {
            b.details = createDetails(b, tokens);
        }
    }
    return diffResult;
}
/**
 * Colors the output of assertion diffs
 * @param diffType Difference type, either added or removed
 */ function createColor(diffType, { background =false  } = {}) {
    switch(diffType){
        case DiffType.added:
            return (s)=>background ? bgGreen(white(s)) : green(bold(s));
        case DiffType.removed:
            return (s)=>background ? bgRed(white(s)) : red(bold(s));
        default:
            return white;
    }
}
/**
 * Prefixes `+` or `-` in diff output
 * @param diffType Difference type, either added or removed
 */ function createSign(diffType) {
    switch(diffType){
        case DiffType.added:
            return "+   ";
        case DiffType.removed:
            return "-   ";
        default:
            return "    ";
    }
}
export function buildMessage(diffResult, { stringDiff =false  } = {}) {
    const messages = [], diffMessages = [];
    messages.push("");
    messages.push("");
    messages.push(`    ${gray(bold("[Diff]"))} ${red(bold("Actual"))} / ${green(bold("Expected"))}`);
    messages.push("");
    messages.push("");
    diffResult.forEach((result)=>{
        const c = createColor(result.type);
        const line = result.details?.map((detail)=>detail.type !== DiffType.common ? createColor(detail.type, {
                background: true
            })(detail.value) : detail.value).join("") ?? result.value;
        diffMessages.push(c(`${createSign(result.type)}${line}`));
    });
    messages.push(...stringDiff ? [
        diffMessages.join("")
    ] : diffMessages);
    messages.push("");
    return messages;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE1Mi4wL3Rlc3RpbmcvX2RpZmYudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IDIwMTgtMjAyMiB0aGUgRGVubyBhdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLiBNSVQgbGljZW5zZS5cbi8vIFRoaXMgbW9kdWxlIGlzIGJyb3dzZXIgY29tcGF0aWJsZS5cblxuaW1wb3J0IHtcbiAgYmdHcmVlbixcbiAgYmdSZWQsXG4gIGJvbGQsXG4gIGdyYXksXG4gIGdyZWVuLFxuICByZWQsXG4gIHdoaXRlLFxufSBmcm9tIFwiLi4vZm10L2NvbG9ycy50c1wiO1xuXG5pbnRlcmZhY2UgRmFydGhlc3RQb2ludCB7XG4gIHk6IG51bWJlcjtcbiAgaWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGVudW0gRGlmZlR5cGUge1xuICByZW1vdmVkID0gXCJyZW1vdmVkXCIsXG4gIGNvbW1vbiA9IFwiY29tbW9uXCIsXG4gIGFkZGVkID0gXCJhZGRlZFwiLFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIERpZmZSZXN1bHQ8VD4ge1xuICB0eXBlOiBEaWZmVHlwZTtcbiAgdmFsdWU6IFQ7XG4gIGRldGFpbHM/OiBBcnJheTxEaWZmUmVzdWx0PFQ+Pjtcbn1cblxuY29uc3QgUkVNT1ZFRCA9IDE7XG5jb25zdCBDT01NT04gPSAyO1xuY29uc3QgQURERUQgPSAzO1xuXG5mdW5jdGlvbiBjcmVhdGVDb21tb248VD4oQTogVFtdLCBCOiBUW10sIHJldmVyc2U/OiBib29sZWFuKTogVFtdIHtcbiAgY29uc3QgY29tbW9uID0gW107XG4gIGlmIChBLmxlbmd0aCA9PT0gMCB8fCBCLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IE1hdGgubWluKEEubGVuZ3RoLCBCLmxlbmd0aCk7IGkgKz0gMSkge1xuICAgIGlmIChcbiAgICAgIEFbcmV2ZXJzZSA/IEEubGVuZ3RoIC0gaSAtIDEgOiBpXSA9PT0gQltyZXZlcnNlID8gQi5sZW5ndGggLSBpIC0gMSA6IGldXG4gICAgKSB7XG4gICAgICBjb21tb24ucHVzaChBW3JldmVyc2UgPyBBLmxlbmd0aCAtIGkgLSAxIDogaV0pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gY29tbW9uO1xuICAgIH1cbiAgfVxuICByZXR1cm4gY29tbW9uO1xufVxuXG4vKipcbiAqIFJlbmRlcnMgdGhlIGRpZmZlcmVuY2VzIGJldHdlZW4gdGhlIGFjdHVhbCBhbmQgZXhwZWN0ZWQgdmFsdWVzXG4gKiBAcGFyYW0gQSBBY3R1YWwgdmFsdWVcbiAqIEBwYXJhbSBCIEV4cGVjdGVkIHZhbHVlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkaWZmPFQ+KEE6IFRbXSwgQjogVFtdKTogQXJyYXk8RGlmZlJlc3VsdDxUPj4ge1xuICBjb25zdCBwcmVmaXhDb21tb24gPSBjcmVhdGVDb21tb24oQSwgQik7XG4gIGNvbnN0IHN1ZmZpeENvbW1vbiA9IGNyZWF0ZUNvbW1vbihcbiAgICBBLnNsaWNlKHByZWZpeENvbW1vbi5sZW5ndGgpLFxuICAgIEIuc2xpY2UocHJlZml4Q29tbW9uLmxlbmd0aCksXG4gICAgdHJ1ZSxcbiAgKS5yZXZlcnNlKCk7XG4gIEEgPSBzdWZmaXhDb21tb24ubGVuZ3RoXG4gICAgPyBBLnNsaWNlKHByZWZpeENvbW1vbi5sZW5ndGgsIC1zdWZmaXhDb21tb24ubGVuZ3RoKVxuICAgIDogQS5zbGljZShwcmVmaXhDb21tb24ubGVuZ3RoKTtcbiAgQiA9IHN1ZmZpeENvbW1vbi5sZW5ndGhcbiAgICA/IEIuc2xpY2UocHJlZml4Q29tbW9uLmxlbmd0aCwgLXN1ZmZpeENvbW1vbi5sZW5ndGgpXG4gICAgOiBCLnNsaWNlKHByZWZpeENvbW1vbi5sZW5ndGgpO1xuICBjb25zdCBzd2FwcGVkID0gQi5sZW5ndGggPiBBLmxlbmd0aDtcbiAgW0EsIEJdID0gc3dhcHBlZCA/IFtCLCBBXSA6IFtBLCBCXTtcbiAgY29uc3QgTSA9IEEubGVuZ3RoO1xuICBjb25zdCBOID0gQi5sZW5ndGg7XG4gIGlmICghTSAmJiAhTiAmJiAhc3VmZml4Q29tbW9uLmxlbmd0aCAmJiAhcHJlZml4Q29tbW9uLmxlbmd0aCkgcmV0dXJuIFtdO1xuICBpZiAoIU4pIHtcbiAgICByZXR1cm4gW1xuICAgICAgLi4ucHJlZml4Q29tbW9uLm1hcChcbiAgICAgICAgKGMpOiBEaWZmUmVzdWx0PHR5cGVvZiBjPiA9PiAoeyB0eXBlOiBEaWZmVHlwZS5jb21tb24sIHZhbHVlOiBjIH0pLFxuICAgICAgKSxcbiAgICAgIC4uLkEubWFwKFxuICAgICAgICAoYSk6IERpZmZSZXN1bHQ8dHlwZW9mIGE+ID0+ICh7XG4gICAgICAgICAgdHlwZTogc3dhcHBlZCA/IERpZmZUeXBlLmFkZGVkIDogRGlmZlR5cGUucmVtb3ZlZCxcbiAgICAgICAgICB2YWx1ZTogYSxcbiAgICAgICAgfSksXG4gICAgICApLFxuICAgICAgLi4uc3VmZml4Q29tbW9uLm1hcChcbiAgICAgICAgKGMpOiBEaWZmUmVzdWx0PHR5cGVvZiBjPiA9PiAoeyB0eXBlOiBEaWZmVHlwZS5jb21tb24sIHZhbHVlOiBjIH0pLFxuICAgICAgKSxcbiAgICBdO1xuICB9XG4gIGNvbnN0IG9mZnNldCA9IE47XG4gIGNvbnN0IGRlbHRhID0gTSAtIE47XG4gIGNvbnN0IHNpemUgPSBNICsgTiArIDE7XG4gIGNvbnN0IGZwOiBGYXJ0aGVzdFBvaW50W10gPSBBcnJheS5mcm9tKFxuICAgIHsgbGVuZ3RoOiBzaXplIH0sXG4gICAgKCkgPT4gKHsgeTogLTEsIGlkOiAtMSB9KSxcbiAgKTtcbiAgLyoqXG4gICAqIElORk86XG4gICAqIFRoaXMgYnVmZmVyIGlzIHVzZWQgdG8gc2F2ZSBtZW1vcnkgYW5kIGltcHJvdmUgcGVyZm9ybWFuY2UuXG4gICAqIFRoZSBmaXJzdCBoYWxmIGlzIHVzZWQgdG8gc2F2ZSByb3V0ZSBhbmQgbGFzdCBoYWxmIGlzIHVzZWQgdG8gc2F2ZSBkaWZmXG4gICAqIHR5cGUuXG4gICAqIFRoaXMgaXMgYmVjYXVzZSwgd2hlbiBJIGtlcHQgbmV3IHVpbnQ4YXJyYXkgYXJlYSB0byBzYXZlIHR5cGUscGVyZm9ybWFuY2VcbiAgICogd29yc2VuZWQuXG4gICAqL1xuICBjb25zdCByb3V0ZXMgPSBuZXcgVWludDMyQXJyYXkoKE0gKiBOICsgc2l6ZSArIDEpICogMik7XG4gIGNvbnN0IGRpZmZUeXBlc1B0ck9mZnNldCA9IHJvdXRlcy5sZW5ndGggLyAyO1xuICBsZXQgcHRyID0gMDtcbiAgbGV0IHAgPSAtMTtcblxuICBmdW5jdGlvbiBiYWNrVHJhY2U8VD4oXG4gICAgQTogVFtdLFxuICAgIEI6IFRbXSxcbiAgICBjdXJyZW50OiBGYXJ0aGVzdFBvaW50LFxuICAgIHN3YXBwZWQ6IGJvb2xlYW4sXG4gICk6IEFycmF5PHtcbiAgICB0eXBlOiBEaWZmVHlwZTtcbiAgICB2YWx1ZTogVDtcbiAgfT4ge1xuICAgIGNvbnN0IE0gPSBBLmxlbmd0aDtcbiAgICBjb25zdCBOID0gQi5sZW5ndGg7XG4gICAgY29uc3QgcmVzdWx0ID0gW107XG4gICAgbGV0IGEgPSBNIC0gMTtcbiAgICBsZXQgYiA9IE4gLSAxO1xuICAgIGxldCBqID0gcm91dGVzW2N1cnJlbnQuaWRdO1xuICAgIGxldCB0eXBlID0gcm91dGVzW2N1cnJlbnQuaWQgKyBkaWZmVHlwZXNQdHJPZmZzZXRdO1xuICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICBpZiAoIWogJiYgIXR5cGUpIGJyZWFrO1xuICAgICAgY29uc3QgcHJldiA9IGo7XG4gICAgICBpZiAodHlwZSA9PT0gUkVNT1ZFRCkge1xuICAgICAgICByZXN1bHQudW5zaGlmdCh7XG4gICAgICAgICAgdHlwZTogc3dhcHBlZCA/IERpZmZUeXBlLnJlbW92ZWQgOiBEaWZmVHlwZS5hZGRlZCxcbiAgICAgICAgICB2YWx1ZTogQltiXSxcbiAgICAgICAgfSk7XG4gICAgICAgIGIgLT0gMTtcbiAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gQURERUQpIHtcbiAgICAgICAgcmVzdWx0LnVuc2hpZnQoe1xuICAgICAgICAgIHR5cGU6IHN3YXBwZWQgPyBEaWZmVHlwZS5hZGRlZCA6IERpZmZUeXBlLnJlbW92ZWQsXG4gICAgICAgICAgdmFsdWU6IEFbYV0sXG4gICAgICAgIH0pO1xuICAgICAgICBhIC09IDE7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN1bHQudW5zaGlmdCh7IHR5cGU6IERpZmZUeXBlLmNvbW1vbiwgdmFsdWU6IEFbYV0gfSk7XG4gICAgICAgIGEgLT0gMTtcbiAgICAgICAgYiAtPSAxO1xuICAgICAgfVxuICAgICAgaiA9IHJvdXRlc1twcmV2XTtcbiAgICAgIHR5cGUgPSByb3V0ZXNbcHJldiArIGRpZmZUeXBlc1B0ck9mZnNldF07XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVGUChcbiAgICBzbGlkZTogRmFydGhlc3RQb2ludCxcbiAgICBkb3duOiBGYXJ0aGVzdFBvaW50LFxuICAgIGs6IG51bWJlcixcbiAgICBNOiBudW1iZXIsXG4gICk6IEZhcnRoZXN0UG9pbnQge1xuICAgIGlmIChzbGlkZSAmJiBzbGlkZS55ID09PSAtMSAmJiBkb3duICYmIGRvd24ueSA9PT0gLTEpIHtcbiAgICAgIHJldHVybiB7IHk6IDAsIGlkOiAwIH07XG4gICAgfVxuICAgIGlmIChcbiAgICAgIChkb3duICYmIGRvd24ueSA9PT0gLTEpIHx8XG4gICAgICBrID09PSBNIHx8XG4gICAgICAoc2xpZGUgJiYgc2xpZGUueSkgPiAoZG93biAmJiBkb3duLnkpICsgMVxuICAgICkge1xuICAgICAgY29uc3QgcHJldiA9IHNsaWRlLmlkO1xuICAgICAgcHRyKys7XG4gICAgICByb3V0ZXNbcHRyXSA9IHByZXY7XG4gICAgICByb3V0ZXNbcHRyICsgZGlmZlR5cGVzUHRyT2Zmc2V0XSA9IEFEREVEO1xuICAgICAgcmV0dXJuIHsgeTogc2xpZGUueSwgaWQ6IHB0ciB9O1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBwcmV2ID0gZG93bi5pZDtcbiAgICAgIHB0cisrO1xuICAgICAgcm91dGVzW3B0cl0gPSBwcmV2O1xuICAgICAgcm91dGVzW3B0ciArIGRpZmZUeXBlc1B0ck9mZnNldF0gPSBSRU1PVkVEO1xuICAgICAgcmV0dXJuIHsgeTogZG93bi55ICsgMSwgaWQ6IHB0ciB9O1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNuYWtlPFQ+KFxuICAgIGs6IG51bWJlcixcbiAgICBzbGlkZTogRmFydGhlc3RQb2ludCxcbiAgICBkb3duOiBGYXJ0aGVzdFBvaW50LFxuICAgIF9vZmZzZXQ6IG51bWJlcixcbiAgICBBOiBUW10sXG4gICAgQjogVFtdLFxuICApOiBGYXJ0aGVzdFBvaW50IHtcbiAgICBjb25zdCBNID0gQS5sZW5ndGg7XG4gICAgY29uc3QgTiA9IEIubGVuZ3RoO1xuICAgIGlmIChrIDwgLU4gfHwgTSA8IGspIHJldHVybiB7IHk6IC0xLCBpZDogLTEgfTtcbiAgICBjb25zdCBmcCA9IGNyZWF0ZUZQKHNsaWRlLCBkb3duLCBrLCBNKTtcbiAgICB3aGlsZSAoZnAueSArIGsgPCBNICYmIGZwLnkgPCBOICYmIEFbZnAueSArIGtdID09PSBCW2ZwLnldKSB7XG4gICAgICBjb25zdCBwcmV2ID0gZnAuaWQ7XG4gICAgICBwdHIrKztcbiAgICAgIGZwLmlkID0gcHRyO1xuICAgICAgZnAueSArPSAxO1xuICAgICAgcm91dGVzW3B0cl0gPSBwcmV2O1xuICAgICAgcm91dGVzW3B0ciArIGRpZmZUeXBlc1B0ck9mZnNldF0gPSBDT01NT047XG4gICAgfVxuICAgIHJldHVybiBmcDtcbiAgfVxuXG4gIHdoaWxlIChmcFtkZWx0YSArIG9mZnNldF0ueSA8IE4pIHtcbiAgICBwID0gcCArIDE7XG4gICAgZm9yIChsZXQgayA9IC1wOyBrIDwgZGVsdGE7ICsraykge1xuICAgICAgZnBbayArIG9mZnNldF0gPSBzbmFrZShcbiAgICAgICAgayxcbiAgICAgICAgZnBbayAtIDEgKyBvZmZzZXRdLFxuICAgICAgICBmcFtrICsgMSArIG9mZnNldF0sXG4gICAgICAgIG9mZnNldCxcbiAgICAgICAgQSxcbiAgICAgICAgQixcbiAgICAgICk7XG4gICAgfVxuICAgIGZvciAobGV0IGsgPSBkZWx0YSArIHA7IGsgPiBkZWx0YTsgLS1rKSB7XG4gICAgICBmcFtrICsgb2Zmc2V0XSA9IHNuYWtlKFxuICAgICAgICBrLFxuICAgICAgICBmcFtrIC0gMSArIG9mZnNldF0sXG4gICAgICAgIGZwW2sgKyAxICsgb2Zmc2V0XSxcbiAgICAgICAgb2Zmc2V0LFxuICAgICAgICBBLFxuICAgICAgICBCLFxuICAgICAgKTtcbiAgICB9XG4gICAgZnBbZGVsdGEgKyBvZmZzZXRdID0gc25ha2UoXG4gICAgICBkZWx0YSxcbiAgICAgIGZwW2RlbHRhIC0gMSArIG9mZnNldF0sXG4gICAgICBmcFtkZWx0YSArIDEgKyBvZmZzZXRdLFxuICAgICAgb2Zmc2V0LFxuICAgICAgQSxcbiAgICAgIEIsXG4gICAgKTtcbiAgfVxuICByZXR1cm4gW1xuICAgIC4uLnByZWZpeENvbW1vbi5tYXAoXG4gICAgICAoYyk6IERpZmZSZXN1bHQ8dHlwZW9mIGM+ID0+ICh7IHR5cGU6IERpZmZUeXBlLmNvbW1vbiwgdmFsdWU6IGMgfSksXG4gICAgKSxcbiAgICAuLi5iYWNrVHJhY2UoQSwgQiwgZnBbZGVsdGEgKyBvZmZzZXRdLCBzd2FwcGVkKSxcbiAgICAuLi5zdWZmaXhDb21tb24ubWFwKFxuICAgICAgKGMpOiBEaWZmUmVzdWx0PHR5cGVvZiBjPiA9PiAoeyB0eXBlOiBEaWZmVHlwZS5jb21tb24sIHZhbHVlOiBjIH0pLFxuICAgICksXG4gIF07XG59XG5cbi8qKlxuICogUmVuZGVycyB0aGUgZGlmZmVyZW5jZXMgYmV0d2VlbiB0aGUgYWN0dWFsIGFuZCBleHBlY3RlZCBzdHJpbmdzXG4gKiBQYXJ0aWFsbHkgaW5zcGlyZWQgZnJvbSBodHRwczovL2dpdGh1Yi5jb20va3BkZWNrZXIvanNkaWZmXG4gKiBAcGFyYW0gQSBBY3R1YWwgc3RyaW5nXG4gKiBAcGFyYW0gQiBFeHBlY3RlZCBzdHJpbmdcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRpZmZzdHIoQTogc3RyaW5nLCBCOiBzdHJpbmcpIHtcbiAgZnVuY3Rpb24gdW5lc2NhcGUoc3RyaW5nOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIC8vIHVuZXNjYXBlIGludmlzaWJsZSBjaGFyYWN0ZXJzLlxuICAgIC8vIHJlZjogaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvU3RyaW5nI2VzY2FwZV9zZXF1ZW5jZXNcbiAgICByZXR1cm4gc3RyaW5nXG4gICAgICAucmVwbGFjZUFsbChcIlxcYlwiLCBcIlxcXFxiXCIpXG4gICAgICAucmVwbGFjZUFsbChcIlxcZlwiLCBcIlxcXFxmXCIpXG4gICAgICAucmVwbGFjZUFsbChcIlxcdFwiLCBcIlxcXFx0XCIpXG4gICAgICAucmVwbGFjZUFsbChcIlxcdlwiLCBcIlxcXFx2XCIpXG4gICAgICAucmVwbGFjZUFsbCggLy8gZG9lcyBub3QgcmVtb3ZlIGxpbmUgYnJlYWtzXG4gICAgICAgIC9cXHJcXG58XFxyfFxcbi9nLFxuICAgICAgICAoc3RyKSA9PiBzdHIgPT09IFwiXFxyXCIgPyBcIlxcXFxyXCIgOiBzdHIgPT09IFwiXFxuXCIgPyBcIlxcXFxuXFxuXCIgOiBcIlxcXFxyXFxcXG5cXHJcXG5cIixcbiAgICAgICk7XG4gIH1cblxuICBmdW5jdGlvbiB0b2tlbml6ZShzdHJpbmc6IHN0cmluZywgeyB3b3JkRGlmZiA9IGZhbHNlIH0gPSB7fSk6IHN0cmluZ1tdIHtcbiAgICBpZiAod29yZERpZmYpIHtcbiAgICAgIC8vIFNwbGl0IHN0cmluZyBvbiB3aGl0ZXNwYWNlIHN5bWJvbHNcbiAgICAgIGNvbnN0IHRva2VucyA9IHN0cmluZy5zcGxpdCgvKFteXFxTXFxyXFxuXSt8WygpW1xcXXt9J1wiXFxyXFxuXXxcXGIpLyk7XG4gICAgICAvLyBFeHRlbmRlZCBMYXRpbiBjaGFyYWN0ZXIgc2V0XG4gICAgICBjb25zdCB3b3JkcyA9XG4gICAgICAgIC9eW2EtekEtWlxcdXtDMH0tXFx1e0ZGfVxcdXtEOH0tXFx1e0Y2fVxcdXtGOH0tXFx1ezJDNn1cXHV7MkM4fS1cXHV7MkQ3fVxcdXsyREV9LVxcdXsyRkZ9XFx1ezFFMDB9LVxcdXsxRUZGfV0rJC91O1xuXG4gICAgICAvLyBKb2luIGJvdW5kYXJ5IHNwbGl0cyB0aGF0IHdlIGRvIG5vdCBjb25zaWRlciB0byBiZSBib3VuZGFyaWVzIGFuZCBtZXJnZSBlbXB0eSBzdHJpbmdzIHN1cnJvdW5kZWQgYnkgd29yZCBjaGFyc1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAhdG9rZW5zW2kgKyAxXSAmJiB0b2tlbnNbaSArIDJdICYmIHdvcmRzLnRlc3QodG9rZW5zW2ldKSAmJlxuICAgICAgICAgIHdvcmRzLnRlc3QodG9rZW5zW2kgKyAyXSlcbiAgICAgICAgKSB7XG4gICAgICAgICAgdG9rZW5zW2ldICs9IHRva2Vuc1tpICsgMl07XG4gICAgICAgICAgdG9rZW5zLnNwbGljZShpICsgMSwgMik7XG4gICAgICAgICAgaS0tO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gdG9rZW5zLmZpbHRlcigodG9rZW4pID0+IHRva2VuKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gU3BsaXQgc3RyaW5nIG9uIG5ldyBsaW5lcyBzeW1ib2xzXG4gICAgICBjb25zdCB0b2tlbnMgPSBbXSwgbGluZXMgPSBzdHJpbmcuc3BsaXQoLyhcXG58XFxyXFxuKS8pO1xuXG4gICAgICAvLyBJZ25vcmUgZmluYWwgZW1wdHkgdG9rZW4gd2hlbiB0ZXh0IGVuZHMgd2l0aCBhIG5ld2xpbmVcbiAgICAgIGlmICghbGluZXNbbGluZXMubGVuZ3RoIC0gMV0pIHtcbiAgICAgICAgbGluZXMucG9wKCk7XG4gICAgICB9XG5cbiAgICAgIC8vIE1lcmdlIHRoZSBjb250ZW50IGFuZCBsaW5lIHNlcGFyYXRvcnMgaW50byBzaW5nbGUgdG9rZW5zXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChpICUgMikge1xuICAgICAgICAgIHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV0gKz0gbGluZXNbaV07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdG9rZW5zLnB1c2gobGluZXNbaV0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gdG9rZW5zO1xuICAgIH1cbiAgfVxuXG4gIC8vIENyZWF0ZSBkZXRhaWxzIGJ5IGZpbHRlcmluZyByZWxldmFudCB3b3JkLWRpZmYgZm9yIGN1cnJlbnQgbGluZVxuICAvLyBhbmQgbWVyZ2UgXCJzcGFjZS1kaWZmXCIgaWYgc3Vycm91bmRlZCBieSB3b3JkLWRpZmYgZm9yIGNsZWFuZXIgZGlzcGxheXNcbiAgZnVuY3Rpb24gY3JlYXRlRGV0YWlscyhcbiAgICBsaW5lOiBEaWZmUmVzdWx0PHN0cmluZz4sXG4gICAgdG9rZW5zOiBBcnJheTxEaWZmUmVzdWx0PHN0cmluZz4+LFxuICApIHtcbiAgICByZXR1cm4gdG9rZW5zLmZpbHRlcigoeyB0eXBlIH0pID0+XG4gICAgICB0eXBlID09PSBsaW5lLnR5cGUgfHwgdHlwZSA9PT0gRGlmZlR5cGUuY29tbW9uXG4gICAgKS5tYXAoKHJlc3VsdCwgaSwgdCkgPT4ge1xuICAgICAgaWYgKFxuICAgICAgICAocmVzdWx0LnR5cGUgPT09IERpZmZUeXBlLmNvbW1vbikgJiYgKHRbaSAtIDFdKSAmJlxuICAgICAgICAodFtpIC0gMV0/LnR5cGUgPT09IHRbaSArIDFdPy50eXBlKSAmJiAvXFxzKy8udGVzdChyZXN1bHQudmFsdWUpXG4gICAgICApIHtcbiAgICAgICAgcmVzdWx0LnR5cGUgPSB0W2kgLSAxXS50eXBlO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIENvbXB1dGUgbXVsdGktbGluZSBkaWZmXG4gIGNvbnN0IGRpZmZSZXN1bHQgPSBkaWZmKFxuICAgIHRva2VuaXplKGAke3VuZXNjYXBlKEEpfVxcbmApLFxuICAgIHRva2VuaXplKGAke3VuZXNjYXBlKEIpfVxcbmApLFxuICApO1xuXG4gIGNvbnN0IGFkZGVkID0gW10sIHJlbW92ZWQgPSBbXTtcbiAgZm9yIChjb25zdCByZXN1bHQgb2YgZGlmZlJlc3VsdCkge1xuICAgIGlmIChyZXN1bHQudHlwZSA9PT0gRGlmZlR5cGUuYWRkZWQpIHtcbiAgICAgIGFkZGVkLnB1c2gocmVzdWx0KTtcbiAgICB9XG4gICAgaWYgKHJlc3VsdC50eXBlID09PSBEaWZmVHlwZS5yZW1vdmVkKSB7XG4gICAgICByZW1vdmVkLnB1c2gocmVzdWx0KTtcbiAgICB9XG4gIH1cblxuICAvLyBDb21wdXRlIHdvcmQtZGlmZlxuICBjb25zdCBhTGluZXMgPSBhZGRlZC5sZW5ndGggPCByZW1vdmVkLmxlbmd0aCA/IGFkZGVkIDogcmVtb3ZlZDtcbiAgY29uc3QgYkxpbmVzID0gYUxpbmVzID09PSByZW1vdmVkID8gYWRkZWQgOiByZW1vdmVkO1xuICBmb3IgKGNvbnN0IGEgb2YgYUxpbmVzKSB7XG4gICAgbGV0IHRva2VucyA9IFtdIGFzIEFycmF5PERpZmZSZXN1bHQ8c3RyaW5nPj4sXG4gICAgICBiOiB1bmRlZmluZWQgfCBEaWZmUmVzdWx0PHN0cmluZz47XG4gICAgLy8gU2VhcmNoIGFub3RoZXIgZGlmZiBsaW5lIHdpdGggYXQgbGVhc3Qgb25lIGNvbW1vbiB0b2tlblxuICAgIHdoaWxlIChiTGluZXMubGVuZ3RoKSB7XG4gICAgICBiID0gYkxpbmVzLnNoaWZ0KCk7XG4gICAgICB0b2tlbnMgPSBkaWZmKFxuICAgICAgICB0b2tlbml6ZShhLnZhbHVlLCB7IHdvcmREaWZmOiB0cnVlIH0pLFxuICAgICAgICB0b2tlbml6ZShiPy52YWx1ZSA/PyBcIlwiLCB7IHdvcmREaWZmOiB0cnVlIH0pLFxuICAgICAgKTtcbiAgICAgIGlmIChcbiAgICAgICAgdG9rZW5zLnNvbWUoKHsgdHlwZSwgdmFsdWUgfSkgPT5cbiAgICAgICAgICB0eXBlID09PSBEaWZmVHlwZS5jb21tb24gJiYgdmFsdWUudHJpbSgpLmxlbmd0aFxuICAgICAgICApXG4gICAgICApIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIC8vIFJlZ2lzdGVyIHdvcmQtZGlmZiBkZXRhaWxzXG4gICAgYS5kZXRhaWxzID0gY3JlYXRlRGV0YWlscyhhLCB0b2tlbnMpO1xuICAgIGlmIChiKSB7XG4gICAgICBiLmRldGFpbHMgPSBjcmVhdGVEZXRhaWxzKGIsIHRva2Vucyk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGRpZmZSZXN1bHQ7XG59XG5cbi8qKlxuICogQ29sb3JzIHRoZSBvdXRwdXQgb2YgYXNzZXJ0aW9uIGRpZmZzXG4gKiBAcGFyYW0gZGlmZlR5cGUgRGlmZmVyZW5jZSB0eXBlLCBlaXRoZXIgYWRkZWQgb3IgcmVtb3ZlZFxuICovXG5mdW5jdGlvbiBjcmVhdGVDb2xvcihcbiAgZGlmZlR5cGU6IERpZmZUeXBlLFxuICB7IGJhY2tncm91bmQgPSBmYWxzZSB9ID0ge30sXG4pOiAoczogc3RyaW5nKSA9PiBzdHJpbmcge1xuICBzd2l0Y2ggKGRpZmZUeXBlKSB7XG4gICAgY2FzZSBEaWZmVHlwZS5hZGRlZDpcbiAgICAgIHJldHVybiAoczogc3RyaW5nKTogc3RyaW5nID0+XG4gICAgICAgIGJhY2tncm91bmQgPyBiZ0dyZWVuKHdoaXRlKHMpKSA6IGdyZWVuKGJvbGQocykpO1xuICAgIGNhc2UgRGlmZlR5cGUucmVtb3ZlZDpcbiAgICAgIHJldHVybiAoczogc3RyaW5nKTogc3RyaW5nID0+IGJhY2tncm91bmQgPyBiZ1JlZCh3aGl0ZShzKSkgOiByZWQoYm9sZChzKSk7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB3aGl0ZTtcbiAgfVxufVxuXG4vKipcbiAqIFByZWZpeGVzIGArYCBvciBgLWAgaW4gZGlmZiBvdXRwdXRcbiAqIEBwYXJhbSBkaWZmVHlwZSBEaWZmZXJlbmNlIHR5cGUsIGVpdGhlciBhZGRlZCBvciByZW1vdmVkXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZVNpZ24oZGlmZlR5cGU6IERpZmZUeXBlKTogc3RyaW5nIHtcbiAgc3dpdGNoIChkaWZmVHlwZSkge1xuICAgIGNhc2UgRGlmZlR5cGUuYWRkZWQ6XG4gICAgICByZXR1cm4gXCIrICAgXCI7XG4gICAgY2FzZSBEaWZmVHlwZS5yZW1vdmVkOlxuICAgICAgcmV0dXJuIFwiLSAgIFwiO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gXCIgICAgXCI7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkTWVzc2FnZShcbiAgZGlmZlJlc3VsdDogUmVhZG9ubHlBcnJheTxEaWZmUmVzdWx0PHN0cmluZz4+LFxuICB7IHN0cmluZ0RpZmYgPSBmYWxzZSB9ID0ge30sXG4pOiBzdHJpbmdbXSB7XG4gIGNvbnN0IG1lc3NhZ2VzOiBzdHJpbmdbXSA9IFtdLCBkaWZmTWVzc2FnZXM6IHN0cmluZ1tdID0gW107XG4gIG1lc3NhZ2VzLnB1c2goXCJcIik7XG4gIG1lc3NhZ2VzLnB1c2goXCJcIik7XG4gIG1lc3NhZ2VzLnB1c2goXG4gICAgYCAgICAke2dyYXkoYm9sZChcIltEaWZmXVwiKSl9ICR7cmVkKGJvbGQoXCJBY3R1YWxcIikpfSAvICR7XG4gICAgICBncmVlbihib2xkKFwiRXhwZWN0ZWRcIikpXG4gICAgfWAsXG4gICk7XG4gIG1lc3NhZ2VzLnB1c2goXCJcIik7XG4gIG1lc3NhZ2VzLnB1c2goXCJcIik7XG4gIGRpZmZSZXN1bHQuZm9yRWFjaCgocmVzdWx0OiBEaWZmUmVzdWx0PHN0cmluZz4pOiB2b2lkID0+IHtcbiAgICBjb25zdCBjID0gY3JlYXRlQ29sb3IocmVzdWx0LnR5cGUpO1xuICAgIGNvbnN0IGxpbmUgPSByZXN1bHQuZGV0YWlscz8ubWFwKChkZXRhaWwpID0+XG4gICAgICBkZXRhaWwudHlwZSAhPT0gRGlmZlR5cGUuY29tbW9uXG4gICAgICAgID8gY3JlYXRlQ29sb3IoZGV0YWlsLnR5cGUsIHsgYmFja2dyb3VuZDogdHJ1ZSB9KShkZXRhaWwudmFsdWUpXG4gICAgICAgIDogZGV0YWlsLnZhbHVlXG4gICAgKS5qb2luKFwiXCIpID8/IHJlc3VsdC52YWx1ZTtcbiAgICBkaWZmTWVzc2FnZXMucHVzaChjKGAke2NyZWF0ZVNpZ24ocmVzdWx0LnR5cGUpfSR7bGluZX1gKSk7XG4gIH0pO1xuICBtZXNzYWdlcy5wdXNoKC4uLihzdHJpbmdEaWZmID8gW2RpZmZNZXNzYWdlcy5qb2luKFwiXCIpXSA6IGRpZmZNZXNzYWdlcykpO1xuICBtZXNzYWdlcy5wdXNoKFwiXCIpO1xuXG4gIHJldHVybiBtZXNzYWdlcztcbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSwwRUFBMEU7QUFDMUUscUNBQXFDO0FBRXJDLFNBQ0UsT0FBTyxFQUNQLEtBQUssRUFDTCxJQUFJLEVBQ0osSUFBSSxFQUNKLEtBQUssRUFDTCxHQUFHLEVBQ0gsS0FBSyxRQUNBLG1CQUFtQjtXQU9uQjtVQUFLLFFBQVE7SUFBUixTQUNWLGFBQUE7SUFEVSxTQUVWLFlBQUE7SUFGVSxTQUdWLFdBQUE7R0FIVSxhQUFBO0FBWVosTUFBTSxVQUFVO0FBQ2hCLE1BQU0sU0FBUztBQUNmLE1BQU0sUUFBUTtBQUVkLFNBQVMsYUFBZ0IsQ0FBTSxFQUFFLENBQU0sRUFBRSxPQUFpQixFQUFPO0lBQy9ELE1BQU0sU0FBUyxFQUFFO0lBQ2pCLElBQUksRUFBRSxNQUFNLEtBQUssS0FBSyxFQUFFLE1BQU0sS0FBSyxHQUFHLE9BQU8sRUFBRTtJQUMvQyxJQUFLLElBQUksSUFBSSxHQUFHLElBQUksS0FBSyxHQUFHLENBQUMsRUFBRSxNQUFNLEVBQUUsRUFBRSxNQUFNLEdBQUcsS0FBSyxFQUFHO1FBQ3hELElBQ0UsQ0FBQyxDQUFDLFVBQVUsRUFBRSxNQUFNLEdBQUcsSUFBSSxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxVQUFVLEVBQUUsTUFBTSxHQUFHLElB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