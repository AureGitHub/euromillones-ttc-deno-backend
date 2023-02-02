// Copyright 2018-2022 the oak authors. All rights reserved. MIT license.
import { concat, contentType, copyBytes, createHttpError, Status } from "./deps.ts";
import { calculate } from "./etag.ts";
import { assert, DEFAULT_CHUNK_SIZE } from "./util.ts";
const ETAG_RE = /(?:W\/)?"[ !#-\x7E\x80-\xFF]+"/;
/** Determine, by the value of an `If-Range` header, if a `Range` header should
 * be applied to a request, returning `true` if it should or otherwise
 * `false`. */ export async function ifRange(value, mtime, entity) {
    if (value) {
        const matches = value.match(ETAG_RE);
        if (matches) {
            const [match] = matches;
            if (await calculate(entity) === match) {
                return true;
            }
        } else {
            return new Date(value).getTime() >= mtime;
        }
    }
    return false;
}
export function parseRange(value, size) {
    const ranges = [];
    const [unit, rangesStr] = value.split("=");
    if (unit !== "bytes") {
        throw createHttpError(Status.RequestedRangeNotSatisfiable);
    }
    for (const range of rangesStr.split(/\s*,\s+/)){
        const item = range.split("-");
        if (item.length !== 2) {
            throw createHttpError(Status.RequestedRangeNotSatisfiable);
        }
        const [startStr, endStr] = item;
        let start;
        let end;
        try {
            if (startStr === "") {
                start = size - parseInt(endStr, 10) - 1;
                end = size - 1;
            } else if (endStr === "") {
                start = parseInt(startStr, 10);
                end = size - 1;
            } else {
                start = parseInt(startStr, 10);
                end = parseInt(endStr, 10);
            }
        } catch  {
            throw createHttpError();
        }
        if (start < 0 || start >= size || end < 0 || end >= size || start > end) {
            throw createHttpError(Status.RequestedRangeNotSatisfiable);
        }
        ranges.push({
            start,
            end
        });
    }
    return ranges;
}
/** A reader  */ async function readRange(file, range) {
    let length = range.end - range.start + 1;
    assert(length);
    await file.seek(range.start, Deno.SeekMode.Start);
    const result = new Uint8Array(length);
    let off = 0;
    while(length){
        const p = new Uint8Array(Math.min(length, DEFAULT_CHUNK_SIZE));
        const nread = await file.read(p);
        assert(nread !== null, "Unexpected EOF encountered when reading a range.");
        assert(nread > 0, "Unexpected read of 0 bytes while reading a range.");
        copyBytes(p, result, off);
        off += nread;
        length -= nread;
        assert(length >= 0, "Unexpected length remaining.");
    }
    return result;
}
const encoder = new TextEncoder();
/** A class that takes a file (either a Deno.FsFile or Uint8Array) and bytes
 * and streams the ranges as a multi-part encoded HTTP body.
 *
 * This is specifically used by the `.send()` functionality to fulfill range
 * requests it receives, and could be used by others when trying to deal with
 * range requests, but is generally a low level API that most users of oak
 * would not need to worry about. */ export class MultiPartStream extends ReadableStream {
    #contentLength;
    #postscript;
    #preamble;
    constructor(file, type, ranges, size, boundary){
        super({
            pull: async (controller)=>{
                const range = ranges.shift();
                if (!range) {
                    controller.enqueue(this.#postscript);
                    controller.close();
                    if (!(file instanceof Uint8Array)) {
                        file.close();
                    }
                    return;
                }
                let bytes;
                if (file instanceof Uint8Array) {
                    bytes = file.subarray(range.start, range.end + 1);
                } else {
                    bytes = await readRange(file, range);
                }
                const rangeHeader = encoder.encode(`Content-Range: ${range.start}-${range.end}/${size}\n\n`);
                controller.enqueue(concat(this.#preamble, rangeHeader, bytes));
            }
        });
        const resolvedType = contentType(type);
        if (!resolvedType) {
            throw new TypeError(`Could not resolve media type for "${type}"`);
        }
        this.#preamble = encoder.encode(`\n--${boundary}\nContent-Type: ${resolvedType}\n`);
        this.#postscript = encoder.encode(`\n--${boundary}--\n`);
        this.#contentLength = ranges.reduce((prev, { start , end  })=>{
            return prev + this.#preamble.length + String(start).length + String(end).length + String(size).length + 20 + (end - start);
        }, this.#postscript.length);
    }
    /** The content length of the entire streamed body. */ contentLength() {
        return this.#contentLength;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMS4xLjAvcmFuZ2UudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IDIwMTgtMjAyMiB0aGUgb2FrIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuXG5pbXBvcnQge1xuICBjb25jYXQsXG4gIGNvbnRlbnRUeXBlLFxuICBjb3B5Qnl0ZXMsXG4gIGNyZWF0ZUh0dHBFcnJvcixcbiAgU3RhdHVzLFxufSBmcm9tIFwiLi9kZXBzLnRzXCI7XG5pbXBvcnQgeyBjYWxjdWxhdGUgfSBmcm9tIFwiLi9ldGFnLnRzXCI7XG5pbXBvcnQgdHlwZSB7IEZpbGVJbmZvIH0gZnJvbSBcIi4vZXRhZy50c1wiO1xuaW1wb3J0IHsgYXNzZXJ0LCBERUZBVUxUX0NIVU5LX1NJWkUgfSBmcm9tIFwiLi91dGlsLnRzXCI7XG5cbmNvbnN0IEVUQUdfUkUgPSAvKD86V1xcLyk/XCJbICEjLVxceDdFXFx4ODAtXFx4RkZdK1wiLztcblxuZXhwb3J0IGludGVyZmFjZSBCeXRlUmFuZ2Uge1xuICBzdGFydDogbnVtYmVyO1xuICBlbmQ6IG51bWJlcjtcbn1cblxuLyoqIERldGVybWluZSwgYnkgdGhlIHZhbHVlIG9mIGFuIGBJZi1SYW5nZWAgaGVhZGVyLCBpZiBhIGBSYW5nZWAgaGVhZGVyIHNob3VsZFxuICogYmUgYXBwbGllZCB0byBhIHJlcXVlc3QsIHJldHVybmluZyBgdHJ1ZWAgaWYgaXQgc2hvdWxkIG9yIG90aGVyd2lzZVxuICogYGZhbHNlYC4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBpZlJhbmdlKFxuICB2YWx1ZTogc3RyaW5nLFxuICBtdGltZTogbnVtYmVyLFxuICBlbnRpdHk6IFVpbnQ4QXJyYXkgfCBGaWxlSW5mbyxcbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuICBpZiAodmFsdWUpIHtcbiAgICBjb25zdCBtYXRjaGVzID0gdmFsdWUubWF0Y2goRVRBR19SRSk7XG4gICAgaWYgKG1hdGNoZXMpIHtcbiAgICAgIGNvbnN0IFttYXRjaF0gPSBtYXRjaGVzO1xuICAgICAgaWYgKGF3YWl0IGNhbGN1bGF0ZShlbnRpdHkpID09PSBtYXRjaCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG5ldyBEYXRlKHZhbHVlKS5nZXRUaW1lKCkgPj0gbXRpbWU7XG4gICAgfVxuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlUmFuZ2UodmFsdWU6IHN0cmluZywgc2l6ZTogbnVtYmVyKTogQnl0ZVJhbmdlW10ge1xuICBjb25zdCByYW5nZXM6IEJ5dGVSYW5nZVtdID0gW107XG4gIGNvbnN0IFt1bml0LCByYW5nZXNTdHJdID0gdmFsdWUuc3BsaXQoXCI9XCIpO1xuICBpZiAodW5pdCAhPT0gXCJieXRlc1wiKSB7XG4gICAgdGhyb3cgY3JlYXRlSHR0cEVycm9yKFN0YXR1cy5SZXF1ZXN0ZWRSYW5nZU5vdFNhdGlzZmlhYmxlKTtcbiAgfVxuICBmb3IgKGNvbnN0IHJhbmdlIG9mIHJhbmdlc1N0ci5zcGxpdCgvXFxzKixcXHMrLykpIHtcbiAgICBjb25zdCBpdGVtID0gcmFuZ2Uuc3BsaXQoXCItXCIpO1xuICAgIGlmIChpdGVtLmxlbmd0aCAhPT0gMikge1xuICAgICAgdGhyb3cgY3JlYXRlSHR0cEVycm9yKFN0YXR1cy5SZXF1ZXN0ZWRSYW5nZU5vdFNhdGlzZmlhYmxlKTtcbiAgICB9XG4gICAgY29uc3QgW3N0YXJ0U3RyLCBlbmRTdHJdID0gaXRlbTtcbiAgICBsZXQgc3RhcnQ6IG51bWJlcjtcbiAgICBsZXQgZW5kOiBudW1iZXI7XG4gICAgdHJ5IHtcbiAgICAgIGlmIChzdGFydFN0ciA9PT0gXCJcIikge1xuICAgICAgICBzdGFydCA9IHNpemUgLSBwYXJzZUludChlbmRTdHIsIDEwKSAtIDE7XG4gICAgICAgIGVuZCA9IHNpemUgLSAxO1xuICAgICAgfSBlbHNlIGlmIChlbmRTdHIgPT09IFwiXCIpIHtcbiAgICAgICAgc3RhcnQgPSBwYXJzZUludChzdGFydFN0ciwgMTApO1xuICAgICAgICBlbmQgPSBzaXplIC0gMTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0YXJ0ID0gcGFyc2VJbnQoc3RhcnRTdHIsIDEwKTtcbiAgICAgICAgZW5kID0gcGFyc2VJbnQoZW5kU3RyLCAxMCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCB7XG4gICAgICB0aHJvdyBjcmVhdGVIdHRwRXJyb3IoKTtcbiAgICB9XG4gICAgaWYgKHN0YXJ0IDwgMCB8fCBzdGFydCA+PSBzaXplIHx8IGVuZCA8IDAgfHwgZW5kID49IHNpemUgfHwgc3RhcnQgPiBlbmQpIHtcbiAgICAgIHRocm93IGNyZWF0ZUh0dHBFcnJvcihTdGF0dXMuUmVxdWVzdGVkUmFuZ2VOb3RTYXRpc2ZpYWJsZSk7XG4gICAgfVxuICAgIHJhbmdlcy5wdXNoKHsgc3RhcnQsIGVuZCB9KTtcbiAgfVxuICByZXR1cm4gcmFuZ2VzO1xufVxuXG4vKiogQSByZWFkZXIgICovXG5hc3luYyBmdW5jdGlvbiByZWFkUmFuZ2UoXG4gIGZpbGU6IERlbm8uUmVhZGVyICYgRGVuby5TZWVrZXIsXG4gIHJhbmdlOiBCeXRlUmFuZ2UsXG4pOiBQcm9taXNlPFVpbnQ4QXJyYXk+IHtcbiAgbGV0IGxlbmd0aCA9IHJhbmdlLmVuZCAtIHJhbmdlLnN0YXJ0ICsgMTtcbiAgYXNzZXJ0KGxlbmd0aCk7XG4gIGF3YWl0IGZpbGUuc2VlayhyYW5nZS5zdGFydCwgRGVuby5TZWVrTW9kZS5TdGFydCk7XG4gIGNvbnN0IHJlc3VsdCA9IG5ldyBVaW50OEFycmF5KGxlbmd0aCk7XG4gIGxldCBvZmYgPSAwO1xuICB3aGlsZSAobGVuZ3RoKSB7XG4gICAgY29uc3QgcCA9IG5ldyBVaW50OEFycmF5KE1hdGgubWluKGxlbmd0aCwgREVGQVVMVF9DSFVOS19TSVpFKSk7XG4gICAgY29uc3QgbnJlYWQgPSBhd2FpdCBmaWxlLnJlYWQocCk7XG4gICAgYXNzZXJ0KG5yZWFkICE9PSBudWxsLCBcIlVuZXhwZWN0ZWQgRU9GIGVuY291bnRlcmVkIHdoZW4gcmVhZGluZyBhIHJhbmdlLlwiKTtcbiAgICBhc3NlcnQobnJlYWQgPiAwLCBcIlVuZXhwZWN0ZWQgcmVhZCBvZiAwIGJ5dGVzIHdoaWxlIHJlYWRpbmcgYSByYW5nZS5cIik7XG4gICAgY29weUJ5dGVzKHAsIHJlc3VsdCwgb2ZmKTtcbiAgICBvZmYgKz0gbnJlYWQ7XG4gICAgbGVuZ3RoIC09IG5yZWFkO1xuICAgIGFzc2VydChsZW5ndGggPj0gMCwgXCJVbmV4cGVjdGVkIGxlbmd0aCByZW1haW5pbmcuXCIpO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmNvbnN0IGVuY29kZXIgPSBuZXcgVGV4dEVuY29kZXIoKTtcblxuLyoqIEEgY2xhc3MgdGhhdCB0YWtlcyBhIGZpbGUgKGVpdGhlciBhIERlbm8uRnNGaWxlIG9yIFVpbnQ4QXJyYXkpIGFuZCBieXRlc1xuICogYW5kIHN0cmVhbXMgdGhlIHJhbmdlcyBhcyBhIG11bHRpLXBhcnQgZW5jb2RlZCBIVFRQIGJvZHkuXG4gKlxuICogVGhpcyBpcyBzcGVjaWZpY2FsbHkgdXNlZCBieSB0aGUgYC5zZW5kKClgIGZ1bmN0aW9uYWxpdHkgdG8gZnVsZmlsbCByYW5nZVxuICogcmVxdWVzdHMgaXQgcmVjZWl2ZXMsIGFuZCBjb3VsZCBiZSB1c2VkIGJ5IG90aGVycyB3aGVuIHRyeWluZyB0byBkZWFsIHdpdGhcbiAqIHJhbmdlIHJlcXVlc3RzLCBidXQgaXMgZ2VuZXJhbGx5IGEgbG93IGxldmVsIEFQSSB0aGF0IG1vc3QgdXNlcnMgb2Ygb2FrXG4gKiB3b3VsZCBub3QgbmVlZCB0byB3b3JyeSBhYm91dC4gKi9cbmV4cG9ydCBjbGFzcyBNdWx0aVBhcnRTdHJlYW0gZXh0ZW5kcyBSZWFkYWJsZVN0cmVhbTxVaW50OEFycmF5PiB7XG4gICNjb250ZW50TGVuZ3RoOiBudW1iZXI7XG4gICNwb3N0c2NyaXB0OiBVaW50OEFycmF5O1xuICAjcHJlYW1ibGU6IFVpbnQ4QXJyYXk7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgZmlsZTogKERlbm8uUmVhZGVyICYgRGVuby5TZWVrZXIgJiBEZW5vLkNsb3NlcikgfCBVaW50OEFycmF5LFxuICAgIHR5cGU6IHN0cmluZyxcbiAgICByYW5nZXM6IEJ5dGVSYW5nZVtdLFxuICAgIHNpemU6IG51bWJlcixcbiAgICBib3VuZGFyeTogc3RyaW5nLFxuICApIHtcbiAgICBzdXBlcih7XG4gICAgICBwdWxsOiBhc3luYyAoY29udHJvbGxlcikgPT4ge1xuICAgICAgICBjb25zdCByYW5nZSA9IHJhbmdlcy5zaGlmdCgpO1xuICAgICAgICBpZiAoIXJhbmdlKSB7XG4gICAgICAgICAgY29udHJvbGxlci5lbnF1ZXVlKHRoaXMuI3Bvc3RzY3JpcHQpO1xuICAgICAgICAgIGNvbnRyb2xsZXIuY2xvc2UoKTtcbiAgICAgICAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVWludDhBcnJheSkpIHtcbiAgICAgICAgICAgIGZpbGUuY2xvc2UoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGxldCBieXRlczogVWludDhBcnJheTtcbiAgICAgICAgaWYgKGZpbGUgaW5zdGFuY2VvZiBVaW50OEFycmF5KSB7XG4gICAgICAgICAgYnl0ZXMgPSBmaWxlLnN1YmFycmF5KHJhbmdlLnN0YXJ0LCByYW5nZS5lbmQgKyAxKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBieXRlcyA9IGF3YWl0IHJlYWRSYW5nZShmaWxlLCByYW5nZSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmFuZ2VIZWFkZXIgPSBlbmNvZGVyLmVuY29kZShcbiAgICAgICAgICBgQ29udGVudC1SYW5nZTogJHtyYW5nZS5zdGFydH0tJHtyYW5nZS5lbmR9LyR7c2l6ZX1cXG5cXG5gLFxuICAgICAgICApO1xuICAgICAgICBjb250cm9sbGVyLmVucXVldWUoY29uY2F0KHRoaXMuI3ByZWFtYmxlLCByYW5nZUhlYWRlciwgYnl0ZXMpKTtcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCByZXNvbHZlZFR5cGUgPSBjb250ZW50VHlwZSh0eXBlKTtcbiAgICBpZiAoIXJlc29sdmVkVHlwZSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihgQ291bGQgbm90IHJlc29sdmUgbWVkaWEgdHlwZSBmb3IgXCIke3R5cGV9XCJgKTtcbiAgICB9XG4gICAgdGhpcy4jcHJlYW1ibGUgPSBlbmNvZGVyLmVuY29kZShcbiAgICAgIGBcXG4tLSR7Ym91bmRhcnl9XFxuQ29udGVudC1UeXBlOiAke3Jlc29sdmVkVHlwZX1cXG5gLFxuICAgICk7XG5cbiAgICB0aGlzLiNwb3N0c2NyaXB0ID0gZW5jb2Rlci5lbmNvZGUoYFxcbi0tJHtib3VuZGFyeX0tLVxcbmApO1xuICAgIHRoaXMuI2NvbnRlbnRMZW5ndGggPSByYW5nZXMucmVkdWNlKFxuICAgICAgKHByZXYsIHsgc3RhcnQsIGVuZCB9KTogbnVtYmVyID0+IHtcbiAgICAgICAgcmV0dXJuIHByZXYgKyB0aGlzLiNwcmVhbWJsZS5sZW5ndGggKyBTdHJpbmcoc3RhcnQpLmxlbmd0aCArXG4gICAgICAgICAgU3RyaW5nKGVuZCkubGVuZ3RoICsgU3RyaW5nKHNpemUpLmxlbmd0aCArIDIwICsgKGVuZCAtIHN0YXJ0KTtcbiAgICAgIH0sXG4gICAgICB0aGlzLiNwb3N0c2NyaXB0Lmxlbmd0aCxcbiAgICApO1xuICB9XG5cbiAgLyoqIFRoZSBjb250ZW50IGxlbmd0aCBvZiB0aGUgZW50aXJlIHN0cmVhbWVkIGJvZHkuICovXG4gIGNvbnRlbnRMZW5ndGgoKSB7XG4gICAgcmV0dXJuIHRoaXMuI2NvbnRlbnRMZW5ndGg7XG4gIH1cbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSx5RUFBeUU7QUFFekUsU0FDRSxNQUFNLEVBQ04sV0FBVyxFQUNYLFNBQVMsRUFDVCxlQUFlLEVBQ2YsTUFBTSxRQUNELFlBQVk7QUFDbkIsU0FBUyxTQUFTLFFBQVEs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