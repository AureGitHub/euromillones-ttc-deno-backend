import { date } from "../deps.ts";
import { parseArray } from "./array_parser.ts";
// Datetime parsing based on:
// https://github.com/bendrucker/postgres-date/blob/master/index.js
// Copyright (c) Ben Drucker <bvdrucker@gmail.com> (bendrucker.me). MIT License.
const BACKSLASH_BYTE_VALUE = 92;
const BC_RE = /BC$/;
const DATETIME_RE = /^(\d{1,})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,})?/;
const HEX = 16;
const HEX_PREFIX_REGEX = /^\\x/;
const TIMEZONE_RE = /([Z+-])(\d{2})?:?(\d{2})?:?(\d{2})?/;
export function decodeBigint(value) {
    return BigInt(value);
}
export function decodeBigintArray(value) {
    return parseArray(value, (x)=>BigInt(x));
}
export function decodeBoolean(value) {
    return value[0] === "t";
}
export function decodeBooleanArray(value) {
    return parseArray(value, (x)=>x[0] === "t");
}
export function decodeBox(value) {
    const [a, b] = value.match(/\(.*?\)/g) || [];
    return {
        a: decodePoint(a),
        b: decodePoint(b)
    };
}
export function decodeBoxArray(value) {
    return parseArray(value, decodeBox, ";");
}
export function decodeBytea(byteaStr) {
    if (HEX_PREFIX_REGEX.test(byteaStr)) {
        return decodeByteaHex(byteaStr);
    } else {
        return decodeByteaEscape(byteaStr);
    }
}
export function decodeByteaArray(value) {
    return parseArray(value, decodeBytea);
}
function decodeByteaEscape(byteaStr) {
    const bytes = [];
    let i = 0;
    let k = 0;
    while(i < byteaStr.length){
        if (byteaStr[i] !== "\\") {
            bytes.push(byteaStr.charCodeAt(i));
            ++i;
        } else {
            if (/[0-7]{3}/.test(byteaStr.substr(i + 1, 3))) {
                bytes.push(parseInt(byteaStr.substr(i + 1, 3), 8));
                i += 4;
            } else {
                let backslashes = 1;
                while(i + backslashes < byteaStr.length && byteaStr[i + backslashes] === "\\"){
                    backslashes++;
                }
                for(k = 0; k < Math.floor(backslashes / 2); ++k){
                    bytes.push(BACKSLASH_BYTE_VALUE);
                }
                i += Math.floor(backslashes / 2) * 2;
            }
        }
    }
    return new Uint8Array(bytes);
}
function decodeByteaHex(byteaStr) {
    const bytesStr = byteaStr.slice(2);
    const bytes = new Uint8Array(bytesStr.length / 2);
    for(let i = 0, j = 0; i < bytesStr.length; i += 2, j++){
        bytes[j] = parseInt(bytesStr[i] + bytesStr[i + 1], HEX);
    }
    return bytes;
}
export function decodeCircle(value) {
    const [point, radius] = value.substring(1, value.length - 1).split(/,(?![^(]*\))/);
    return {
        point: decodePoint(point),
        radius: radius
    };
}
export function decodeCircleArray(value) {
    return parseArray(value, decodeCircle);
}
export function decodeDate(dateStr) {
    // there are special `infinity` and `-infinity`
    // cases representing out-of-range dates
    if (dateStr === "infinity") {
        return Number(Infinity);
    } else if (dateStr === "-infinity") {
        return Number(-Infinity);
    }
    return date.parse(dateStr, "yyyy-MM-dd");
}
export function decodeDateArray(value) {
    return parseArray(value, decodeDate);
}
export function decodeDatetime(dateStr) {
    /**
   * Postgres uses ISO 8601 style date output by default:
   * 1997-12-17 07:37:16-08
   */ const matches = DATETIME_RE.exec(dateStr);
    if (!matches) {
        return decodeDate(dateStr);
    }
    const isBC = BC_RE.test(dateStr);
    const year = parseInt(matches[1], 10) * (isBC ? -1 : 1);
    // remember JS dates are 0-based
    const month = parseInt(matches[2], 10) - 1;
    const day = parseInt(matches[3], 10);
    const hour = parseInt(matches[4], 10);
    const minute = parseInt(matches[5], 10);
    const second = parseInt(matches[6], 10);
    // ms are written as .007
    const msMatch = matches[7];
    const ms = msMatch ? 1000 * parseFloat(msMatch) : 0;
    let date;
    const offset = decodeTimezoneOffset(dateStr);
    if (offset === null) {
        date = new Date(year, month, day, hour, minute, second, ms);
    } else {
        // This returns miliseconds from 1 January, 1970, 00:00:00,
        // adding decoded timezone offset will construct proper date object.
        const utc = Date.UTC(year, month, day, hour, minute, second, ms);
        date = new Date(utc + offset);
    }
    // use `setUTCFullYear` because if date is from first
    // century `Date`'s compatibility for millenium bug
    // would set it as 19XX
    date.setUTCFullYear(year);
    return date;
}
export function decodeDatetimeArray(value) {
    return parseArray(value, decodeDatetime);
}
export function decodeInt(value) {
    return parseInt(value, 10);
}
// deno-lint-ignore no-explicit-any
export function decodeIntArray(value) {
    if (!value) return null;
    return parseArray(value, decodeInt);
}
export function decodeJson(value) {
    return JSON.parse(value);
}
export function decodeJsonArray(value) {
    return parseArray(value, JSON.parse);
}
export function decodeLine(value) {
    const [a, b, c] = value.substring(1, value.length - 1).split(",");
    return {
        a: a,
        b: b,
        c: c
    };
}
export function decodeLineArray(value) {
    return parseArray(value, decodeLine);
}
export function decodeLineSegment(value) {
    const [a, b] = value.substring(1, value.length - 1).match(/\(.*?\)/g) || [];
    return {
        a: decodePoint(a),
        b: decodePoint(b)
    };
}
export function decodeLineSegmentArray(value) {
    return parseArray(value, decodeLineSegment);
}
export function decodePath(value) {
    // Split on commas that are not inside parantheses
    // since encapsulated commas are separators for the point coordinates
    const points = value.substring(1, value.length - 1).split(/,(?![^(]*\))/);
    return points.map(decodePoint);
}
export function decodePathArray(value) {
    return parseArray(value, decodePath);
}
export function decodePoint(value) {
    const [x, y] = value.substring(1, value.length - 1).split(",");
    if (Number.isNaN(parseFloat(x)) || Number.isNaN(parseFloat(y))) {
        throw new Error(`Invalid point value: "${Number.isNaN(parseFloat(x)) ? x : y}"`);
    }
    return {
        x: x,
        y: y
    };
}
export function decodePointArray(value) {
    return parseArray(value, decodePoint);
}
export function decodePolygon(value) {
    return decodePath(value);
}
export function decodePolygonArray(value) {
    return parseArray(value, decodePolygon);
}
export function decodeStringArray(value) {
    if (!value) return null;
    return parseArray(value, (value)=>value);
}
/**
 * Decode numerical timezone offset from provided date string.
 *
 * Matched these kinds:
 * - `Z (UTC)`
 * - `-05`
 * - `+06:30`
 * - `+06:30:10`
 *
 * Returns offset in miliseconds.
 */ function decodeTimezoneOffset(dateStr) {
    // get rid of date part as TIMEZONE_RE would match '-MM` part
    const timeStr = dateStr.split(" ")[1];
    const matches = TIMEZONE_RE.exec(timeStr);
    if (!matches) {
        return null;
    }
    const type = matches[1];
    if (type === "Z") {
        // Zulu timezone === UTC === 0
        return 0;
    }
    // in JS timezone offsets are reversed, ie. timezones
    // that are "positive" (+01:00) are represented as negative
    // offsets and vice-versa
    const sign = type === "-" ? 1 : -1;
    const hours = parseInt(matches[2], 10);
    const minutes = parseInt(matches[3] || "0", 10);
    const seconds = parseInt(matches[4] || "0", 10);
    const offset = hours * 3600 + minutes * 60 + seconds;
    return sign * offset * 1000;
}
export function decodeTid(value) {
    const [x, y] = value.substring(1, value.length - 1).split(",");
    return [
        BigInt(x),
        BigInt(y)
    ];
}
export function decodeTidArray(value) {
    return parseArray(value, decodeTid);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvcG9zdGdyZXNAdjAuMTcuMC9xdWVyeS9kZWNvZGVycy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBkYXRlIH0gZnJvbSBcIi4uL2RlcHMudHNcIjtcbmltcG9ydCB7IHBhcnNlQXJyYXkgfSBmcm9tIFwiLi9hcnJheV9wYXJzZXIudHNcIjtcbmltcG9ydCB0eXBlIHtcbiAgQm94LFxuICBDaXJjbGUsXG4gIEZsb2F0OCxcbiAgTGluZSxcbiAgTGluZVNlZ21lbnQsXG4gIFBhdGgsXG4gIFBvaW50LFxuICBQb2x5Z29uLFxuICBUSUQsXG59IGZyb20gXCIuL3R5cGVzLnRzXCI7XG5cbi8vIERhdGV0aW1lIHBhcnNpbmcgYmFzZWQgb246XG4vLyBodHRwczovL2dpdGh1Yi5jb20vYmVuZHJ1Y2tlci9wb3N0Z3Jlcy1kYXRlL2Jsb2IvbWFzdGVyL2luZGV4LmpzXG4vLyBDb3B5cmlnaHQgKGMpIEJlbiBEcnVja2VyIDxidmRydWNrZXJAZ21haWwuY29tPiAoYmVuZHJ1Y2tlci5tZSkuIE1JVCBMaWNlbnNlLlxuY29uc3QgQkFDS1NMQVNIX0JZVEVfVkFMVUUgPSA5MjtcbmNvbnN0IEJDX1JFID0gL0JDJC87XG5jb25zdCBEQVRFVElNRV9SRSA9XG4gIC9eKFxcZHsxLH0pLShcXGR7Mn0pLShcXGR7Mn0pIChcXGR7Mn0pOihcXGR7Mn0pOihcXGR7Mn0pKFxcLlxcZHsxLH0pPy87XG5jb25zdCBIRVggPSAxNjtcbmNvbnN0IEhFWF9QUkVGSVhfUkVHRVggPSAvXlxcXFx4LztcbmNvbnN0IFRJTUVaT05FX1JFID0gLyhbWistXSkoXFxkezJ9KT86PyhcXGR7Mn0pPzo/KFxcZHsyfSk/LztcblxuZXhwb3J0IGZ1bmN0aW9uIGRlY29kZUJpZ2ludCh2YWx1ZTogc3RyaW5nKTogQmlnSW50IHtcbiAgcmV0dXJuIEJpZ0ludCh2YWx1ZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWNvZGVCaWdpbnRBcnJheSh2YWx1ZTogc3RyaW5nKSB7XG4gIHJldHVybiBwYXJzZUFycmF5KHZhbHVlLCAoeCkgPT4gQmlnSW50KHgpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlY29kZUJvb2xlYW4odmFsdWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICByZXR1cm4gdmFsdWVbMF0gPT09IFwidFwiO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVjb2RlQm9vbGVhbkFycmF5KHZhbHVlOiBzdHJpbmcpIHtcbiAgcmV0dXJuIHBhcnNlQXJyYXkodmFsdWUsICh4KSA9PiB4WzBdID09PSBcInRcIik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWNvZGVCb3godmFsdWU6IHN0cmluZyk6IEJveCB7XG4gIGNvbnN0IFthLCBiXSA9IHZhbHVlLm1hdGNoKC9cXCguKj9cXCkvZykgfHwgW107XG5cbiAgcmV0dXJuIHtcbiAgICBhOiBkZWNvZGVQb2ludChhKSxcbiAgICBiOiBkZWNvZGVQb2ludChiKSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlY29kZUJveEFycmF5KHZhbHVlOiBzdHJpbmcpIHtcbiAgcmV0dXJuIHBhcnNlQXJyYXkodmFsdWUsIGRlY29kZUJveCwgXCI7XCIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVjb2RlQnl0ZWEoYnl0ZWFTdHI6IHN0cmluZyk6IFVpbnQ4QXJyYXkge1xuICBpZiAoSEVYX1BSRUZJWF9SRUdFWC50ZXN0KGJ5dGVhU3RyKSkge1xuICAgIHJldHVybiBkZWNvZGVCeXRlYUhleChieXRlYVN0cik7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGRlY29kZUJ5dGVhRXNjYXBlKGJ5dGVhU3RyKTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVjb2RlQnl0ZWFBcnJheSh2YWx1ZTogc3RyaW5nKTogdW5rbm93bltdIHtcbiAgcmV0dXJuIHBhcnNlQXJyYXkodmFsdWUsIGRlY29kZUJ5dGVhKTtcbn1cblxuZnVuY3Rpb24gZGVjb2RlQnl0ZWFFc2NhcGUoYnl0ZWFTdHI6IHN0cmluZyk6IFVpbnQ4QXJyYXkge1xuICBjb25zdCBieXRlcyA9IFtdO1xuICBsZXQgaSA9IDA7XG4gIGxldCBrID0gMDtcbiAgd2hpbGUgKGkgPCBieXRlYVN0ci5sZW5ndGgpIHtcbiAgICBpZiAoYnl0ZWFTdHJbaV0gIT09IFwiXFxcXFwiKSB7XG4gICAgICBieXRlcy5wdXNoKGJ5dGVhU3RyLmNoYXJDb2RlQXQoaSkpO1xuICAgICAgKytpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoL1swLTddezN9Ly50ZXN0KGJ5dGVhU3RyLnN1YnN0cihpICsgMSwgMykpKSB7XG4gICAgICAgIGJ5dGVzLnB1c2gocGFyc2VJbnQoYnl0ZWFTdHIuc3Vic3RyKGkgKyAxLCAzKSwgOCkpO1xuICAgICAgICBpICs9IDQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsZXQgYmFja3NsYXNoZXMgPSAxO1xuICAgICAgICB3aGlsZSAoXG4gICAgICAgICAgaSArIGJhY2tzbGFzaGVzIDwgYnl0ZWFTdHIubGVuZ3RoICYmXG4gICAgICAgICAgYnl0ZWFTdHJbaSArIGJhY2tzbGFzaGVzXSA9PT0gXCJcXFxcXCJcbiAgICAgICAgKSB7XG4gICAgICAgICAgYmFja3NsYXNoZXMrKztcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGsgPSAwOyBrIDwgTWF0aC5mbG9vcihiYWNrc2xhc2hlcyAvIDIpOyArK2spIHtcbiAgICAgICAgICBieXRlcy5wdXNoKEJBQ0tTTEFTSF9CWVRFX1ZBTFVFKTtcbiAgICAgICAgfVxuICAgICAgICBpICs9IE1hdGguZmxvb3IoYmFja3NsYXNoZXMgLyAyKSAqIDI7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBuZXcgVWludDhBcnJheShieXRlcyk7XG59XG5cbmZ1bmN0aW9uIGRlY29kZUJ5dGVhSGV4KGJ5dGVhU3RyOiBzdHJpbmcpOiBVaW50OEFycmF5IHtcbiAgY29uc3QgYnl0ZXNTdHIgPSBieXRlYVN0ci5zbGljZSgyKTtcbiAgY29uc3QgYnl0ZXMgPSBuZXcgVWludDhBcnJheShieXRlc1N0ci5sZW5ndGggLyAyKTtcbiAgZm9yIChsZXQgaSA9IDAsIGogPSAwOyBpIDwgYnl0ZXNTdHIubGVuZ3RoOyBpICs9IDIsIGorKykge1xuICAgIGJ5dGVzW2pdID0gcGFyc2VJbnQoYnl0ZXNTdHJbaV0gKyBieXRlc1N0cltpICsgMV0sIEhFWCk7XG4gIH1cbiAgcmV0dXJuIGJ5dGVzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVjb2RlQ2lyY2xlKHZhbHVlOiBzdHJpbmcpOiBDaXJjbGUge1xuICBjb25zdCBbcG9pbnQsIHJhZGl1c10gPSB2YWx1ZS5zdWJzdHJpbmcoMSwgdmFsdWUubGVuZ3RoIC0gMSkuc3BsaXQoXG4gICAgLywoPyFbXihdKlxcKSkvLFxuICApIGFzIFtzdHJpbmcsIEZsb2F0OF07XG5cbiAgcmV0dXJuIHtcbiAgICBwb2ludDogZGVjb2RlUG9pbnQocG9pbnQpLFxuICAgIHJhZGl1czogcmFkaXVzLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVjb2RlQ2lyY2xlQXJyYXkodmFsdWU6IHN0cmluZykge1xuICByZXR1cm4gcGFyc2VBcnJheSh2YWx1ZSwgZGVjb2RlQ2lyY2xlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlY29kZURhdGUoZGF0ZVN0cjogc3RyaW5nKTogRGF0ZSB8IG51bWJlciB7XG4gIC8vIHRoZXJlIGFyZSBzcGVjaWFsIGBpbmZpbml0eWAgYW5kIGAtaW5maW5pdHlgXG4gIC8vIGNhc2VzIHJlcHJlc2VudGluZyBvdXQtb2YtcmFuZ2UgZGF0ZXNcbiAgaWYgKGRhdGVTdHIgPT09IFwiaW5maW5pdHlcIikge1xuICAgIHJldHVybiBOdW1iZXIoSW5maW5pdHkpO1xuICB9IGVsc2UgaWYgKGRhdGVTdHIgPT09IFwiLWluZmluaXR5XCIpIHtcbiAgICByZXR1cm4gTnVtYmVyKC1JbmZpbml0eSk7XG4gIH1cblxuICByZXR1cm4gZGF0ZS5wYXJzZShkYXRlU3RyLCBcInl5eXktTU0tZGRcIik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWNvZGVEYXRlQXJyYXkodmFsdWU6IHN0cmluZykge1xuICByZXR1cm4gcGFyc2VBcnJheSh2YWx1ZSwgZGVjb2RlRGF0ZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWNvZGVEYXRldGltZShkYXRlU3RyOiBzdHJpbmcpOiBudW1iZXIgfCBEYXRlIHtcbiAgLyoqXG4gICAqIFBvc3RncmVzIHVzZXMgSVNPIDg2MDEgc3R5bGUgZGF0ZSBvdXRwdXQgYnkgZGVmYXVsdDpcbiAgICogMTk5Ny0xMi0xNyAwNzozNzoxNi0wOFxuICAgKi9cblxuICBjb25zdCBtYXRjaGVzID0gREFURVRJTUVfUkUuZXhlYyhkYXRlU3RyKTtcblxuICBpZiAoIW1hdGNoZXMpIHtcbiAgICByZXR1cm4gZGVjb2RlRGF0ZShkYXRlU3RyKTtcbiAgfVxuXG4gIGNvbnN0IGlzQkMgPSBCQ19SRS50ZXN0KGRhdGVTdHIpO1xuXG4gIGNvbnN0IHllYXIgPSBwYXJzZUludChtYXRjaGVzWzFdLCAxMCkgKiAoaXNCQyA/IC0xIDogMSk7XG4gIC8vIHJlbWVtYmVyIEpTIGRhdGVzIGFyZSAwLWJhc2VkXG4gIGNvbnN0IG1vbnRoID0gcGFyc2VJbnQobWF0Y2hlc1syXSwgMTApIC0gMTtcbiAgY29uc3QgZGF5ID0gcGFyc2VJbnQobWF0Y2hlc1szXSwgMTApO1xuICBjb25zdCBob3VyID0gcGFyc2VJbnQobWF0Y2hlc1s0XSwgMTApO1xuICBjb25zdCBtaW51dGUgPSBwYXJzZUludChtYXRjaGVzWzVdLCAxMCk7XG4gIGNvbnN0IHNlY29uZCA9IHBhcnNlSW50KG1hdGNoZXNbNl0sIDEwKTtcbiAgLy8gbXMgYXJlIHdyaXR0ZW4gYXMgLjAwN1xuICBjb25zdCBtc01hdGNoID0gbWF0Y2hlc1s3XTtcbiAgY29uc3QgbXMgPSBtc01hdGNoID8gMTAwMCAqIHBhcnNlRmxvYXQobXNNYXRjaCkgOiAwO1xuXG4gIGxldCBkYXRlOiBEYXRlO1xuXG4gIGNvbnN0IG9mZnNldCA9IGRlY29kZVRpbWV6b25lT2Zmc2V0KGRhdGVTdHIpO1xuICBpZiAob2Zmc2V0ID09PSBudWxsKSB7XG4gICAgZGF0ZSA9IG5ldyBEYXRlKHllYXIsIG1vbnRoLCBkYXksIGhvdXIsIG1pbnV0ZSwgc2Vjb25kLCBtcyk7XG4gIH0gZWxzZSB7XG4gICAgLy8gVGhpcyByZXR1cm5zIG1pbGlzZWNvbmRzIGZyb20gMSBKYW51YXJ5LCAxOTcwLCAwMDowMDowMCxcbiAgICAvLyBhZGRpbmcgZGVjb2RlZCB0aW1lem9uZSBvZmZzZXQgd2lsbCBjb25zdHJ1Y3QgcHJvcGVyIGRhdGUgb2JqZWN0LlxuICAgIGNvbnN0IHV0YyA9IERhdGUuVVRDKHllYXIsIG1vbnRoLCBkYXksIGhvdXIsIG1pbnV0ZSwgc2Vjb25kLCBtcyk7XG4gICAgZGF0ZSA9IG5ldyBEYXRlKHV0YyArIG9mZnNldCk7XG4gIH1cblxuICAvLyB1c2UgYHNldFVUQ0Z1bGxZZWFyYCBiZWNhdXNlIGlmIGRhdGUgaXMgZnJvbSBmaXJzdFxuICAvLyBjZW50dXJ5IGBEYXRlYCdzIGNvbXBhdGliaWxpdHkgZm9yIG1pbGxlbml1bSBidWdcbiAgLy8gd291bGQgc2V0IGl0IGFzIDE5WFhcbiAgZGF0ZS5zZXRVVENGdWxsWWVhcih5ZWFyKTtcbiAgcmV0dXJuIGRhdGU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWNvZGVEYXRldGltZUFycmF5KHZhbHVlOiBzdHJpbmcpIHtcbiAgcmV0dXJuIHBhcnNlQXJyYXkodmFsdWUsIGRlY29kZURhdGV0aW1lKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlY29kZUludCh2YWx1ZTogc3RyaW5nKTogbnVtYmVyIHtcbiAgcmV0dXJuIHBhcnNlSW50KHZhbHVlLCAxMCk7XG59XG5cbi8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG5leHBvcnQgZnVuY3Rpb24gZGVjb2RlSW50QXJyYXkodmFsdWU6IHN0cmluZyk6IGFueSB7XG4gIGlmICghdmFsdWUpIHJldHVybiBudWxsO1xuICByZXR1cm4gcGFyc2VBcnJheSh2YWx1ZSwgZGVjb2RlSW50KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlY29kZUpzb24odmFsdWU6IHN0cmluZyk6IHVua25vd24ge1xuICByZXR1cm4gSlNPTi5wYXJzZSh2YWx1ZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWNvZGVKc29uQXJyYXkodmFsdWU6IHN0cmluZyk6IHVua25vd25bXSB7XG4gIHJldHVybiBwYXJzZUFycmF5KHZhbHVlLCBKU09OLnBhcnNlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlY29kZUxpbmUodmFsdWU6IHN0cmluZyk6IExpbmUge1xuICBjb25zdCBbYSwgYiwgY10gPSB2YWx1ZS5zdWJzdHJpbmcoMSwgdmFsdWUubGVuZ3RoIC0gMSkuc3BsaXQoXCIsXCIpIGFzIFtcbiAgICBGbG9hdDgsXG4gICAgRmxvYXQ4LFxuICAgIEZsb2F0OCxcbiAgXTtcblxuICByZXR1cm4ge1xuICAgIGE6IGEsXG4gICAgYjogYixcbiAgICBjOiBjLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVjb2RlTGluZUFycmF5KHZhbHVlOiBzdHJpbmcpIHtcbiAgcmV0dXJuIHBhcnNlQXJyYXkodmFsdWUsIGRlY29kZUxpbmUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVjb2RlTGluZVNlZ21lbnQodmFsdWU6IHN0cmluZyk6IExpbmVTZWdtZW50IHtcbiAgY29uc3QgW2EsIGJdID0gdmFsdWVcbiAgICAuc3Vic3RyaW5nKDEsIHZhbHVlLmxlbmd0aCAtIDEpXG4gICAgLm1hdGNoKC9cXCguKj9cXCkvZykgfHwgW107XG5cbiAgcmV0dXJuIHtcbiAgICBhOiBkZWNvZGVQb2ludChhKSxcbiAgICBiOiBkZWNvZGVQb2ludChiKSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlY29kZUxpbmVTZWdtZW50QXJyYXkodmFsdWU6IHN0cmluZykge1xuICByZXR1cm4gcGFyc2VBcnJheSh2YWx1ZSwgZGVjb2RlTGluZVNlZ21lbnQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVjb2RlUGF0aCh2YWx1ZTogc3RyaW5nKTogUGF0aCB7XG4gIC8vIFNwbGl0IG9uIGNvbW1hcyB0aGF0IGFyZSBub3QgaW5zaWRlIHBhcmFudGhlc2VzXG4gIC8vIHNpbmNlIGVuY2Fwc3VsYXRlZCBjb21tYXMgYXJlIHNlcGFyYXRvcnMgZm9yIHRoZSBwb2ludCBjb29yZGluYXRlc1xuICBjb25zdCBwb2ludHMgPSB2YWx1ZS5zdWJzdHJpbmcoMSwgdmFsdWUubGVuZ3RoIC0gMSkuc3BsaXQoLywoPyFbXihdKlxcKSkvKTtcblxuICByZXR1cm4gcG9pbnRzLm1hcChkZWNvZGVQb2ludCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWNvZGVQYXRoQXJyYXkodmFsdWU6IHN0cmluZykge1xuICByZXR1cm4gcGFyc2VBcnJheSh2YWx1ZSwgZGVjb2RlUGF0aCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWNvZGVQb2ludCh2YWx1ZTogc3RyaW5nKTogUG9pbnQge1xuICBjb25zdCBbeCwgeV0gPSB2YWx1ZS5zdWJzdHJpbmcoMSwgdmFsdWUubGVuZ3RoIC0gMSkuc3BsaXQoXCIsXCIpIGFzIFtcbiAgICBGbG9hdDgsXG4gICAgRmxvYXQ4LFxuICBdO1xuXG4gIGlmIChOdW1iZXIuaXNOYU4ocGFyc2VGbG9hdCh4KSkgfHwgTnVtYmVyLmlzTmFOKHBhcnNlRmxvYXQoeSkpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgYEludmFsaWQgcG9pbnQgdmFsdWU6IFwiJHtOdW1iZXIuaXNOYU4ocGFyc2VGbG9hdCh4KSkgPyB4IDogeX1cImAsXG4gICAgKTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgeDogeCxcbiAgICB5OiB5LFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVjb2RlUG9pbnRBcnJheSh2YWx1ZTogc3RyaW5nKSB7XG4gIHJldHVybiBwYXJzZUFycmF5KHZhbHVlLCBkZWNvZGVQb2ludCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWNvZGVQb2x5Z29uKHZhbHVlOiBzdHJpbmcpOiBQb2x5Z29uIHtcbiAgcmV0dXJuIGRlY29kZVBhdGgodmFsdWUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVjb2RlUG9seWdvbkFycmF5KHZhbHVlOiBzdHJpbmcpIHtcbiAgcmV0dXJuIHBhcnNlQXJyYXkodmFsdWUsIGRlY29kZVBvbHlnb24pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVjb2RlU3RyaW5nQXJyYXkodmFsdWU6IHN0cmluZykge1xuICBpZiAoIXZhbHVlKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHBhcnNlQXJyYXkodmFsdWUsICh2YWx1ZSkgPT4gdmFsdWUpO1xufVxuXG4vKipcbiAqIERlY29kZSBudW1lcmljYWwgdGltZXpvbmUgb2Zmc2V0IGZyb20gcHJvdmlkZWQgZGF0ZSBzdHJpbmcuXG4gKlxuICogTWF0Y2hlZCB0aGVzZSBraW5kczpcbiAqIC0gYFogKFVUQylgXG4gKiAtIGAtMDVgXG4gKiAtIGArMDY6MzBgXG4gKiAtIGArMDY6MzA6MTBgXG4gKlxuICogUmV0dXJucyBvZmZzZXQgaW4gbWlsaXNlY29uZHMuXG4gKi9cbmZ1bmN0aW9uIGRlY29kZVRpbWV6b25lT2Zmc2V0KGRhdGVTdHI6IHN0cmluZyk6IG51bGwgfCBudW1iZXIge1xuICAvLyBnZXQgcmlkIG9mIGRhdGUgcGFydCBhcyBUSU1FWk9ORV9SRSB3b3VsZCBtYXRjaCAnLU1NYCBwYXJ0XG4gIGNvbnN0IHRpbWVTdHIgPSBkYXRlU3RyLnNwbGl0KFwiIFwiKVsxXTtcbiAgY29uc3QgbWF0Y2hlcyA9IFRJTUVaT05FX1JFLmV4ZWModGltZVN0cik7XG5cbiAgaWYgKCFtYXRjaGVzKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBjb25zdCB0eXBlID0gbWF0Y2hlc1sxXTtcblxuICBpZiAodHlwZSA9PT0gXCJaXCIpIHtcbiAgICAvLyBadWx1IHRpbWV6b25lID09PSBVVEMgPT09IDBcbiAgICByZXR1cm4gMDtcbiAgfVxuXG4gIC8vIGluIEpTIHRpbWV6b25lIG9mZnNldHMgYXJlIHJldmVyc2VkLCBpZS4gdGltZXpvbmVzXG4gIC8vIHRoYXQgYXJlIFwicG9zaXRpdmVcIiAoKzAxOjAwKSBhcmUgcmVwcmVzZW50ZWQgYXMgbmVnYXRpdmVcbiAgLy8gb2Zmc2V0cyBhbmQgdmljZS12ZXJzYVxuICBjb25zdCBzaWduID0gdHlwZSA9PT0gXCItXCIgPyAxIDogLTE7XG5cbiAgY29uc3QgaG91cnMgPSBwYXJzZUludChtYXRjaGVzWzJdLCAxMCk7XG4gIGNvbnN0IG1pbnV0ZXMgPSBwYXJzZUludChtYXRjaGVzWzNdIHx8IFwiMFwiLCAxMCk7XG4gIGNvbnN0IHNlY29uZHMgPSBwYXJzZUludChtYXRjaGVzWzRdIHx8IFwiMFwiLCAxMCk7XG5cbiAgY29uc3Qgb2Zmc2V0ID0gaG91cnMgKiAzNjAwICsgbWludXRlcyAqIDYwICsgc2Vjb25kcztcblxuICByZXR1cm4gc2lnbiAqIG9mZnNldCAqIDEwMDA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWNvZGVUaWQodmFsdWU6IHN0cmluZyk6IFRJRCB7XG4gIGNvbnN0IFt4LCB5XSA9IHZhbHVlLnN1YnN0cmluZygxLCB2YWx1ZS5sZW5ndGggLSAxKS5zcGxpdChcIixcIik7XG5cbiAgcmV0dXJuIFtCaWdJbnQoeCksIEJpZ0ludCh5KV07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWNvZGVUaWRBcnJheSh2YWx1ZTogc3RyaW5nKSB7XG4gIHJldHVybiBwYXJzZUFycmF5KHZhbHVlLCBkZWNvZGVUaWQpO1xufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFNBQVMsSUFBSSxRQUFRLGFBQWE7QUFDbEMsU0FBUyxVQUFVLFFBQVEsb0JBQW9CO0FBYS9DLDZCQUE2QjtBQUM3QixtRUFBbUU7QUFDbkUsZ0ZBQWdGO0FBQ2hGLE1BQU0sdUJBQXVCO0FBQzdCLE1BQU0sUUFBUTtBQUNkLE1BQU0sY0FDSjtBQUNGLE1BQU0sTUFBTTtBQUNaLE1BQU0sbUJBQW1CO0FBQ3pCLE1BQU0sY0FBYztBQUVwQixPQUFPLFNBQVMsYUFBYSxLQUFhLEVBQVU7SUFDbEQsT0FBTyxPQUFP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