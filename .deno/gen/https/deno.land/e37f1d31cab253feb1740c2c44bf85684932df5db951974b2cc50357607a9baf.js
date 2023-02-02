// Copyright 2018-2022 the oak authors. All rights reserved. MIT license.
import { assert, stripEol } from "./util.ts";
const DEFAULT_BUF_SIZE = 4096;
const MIN_BUF_SIZE = 16;
const MAX_CONSECUTIVE_EMPTY_READS = 100;
const CR = "\r".charCodeAt(0);
const LF = "\n".charCodeAt(0);
export class BufferFullError extends Error {
    name;
    constructor(partial){
        super("Buffer full");
        this.partial = partial;
        this.name = "BufferFullError";
    }
    partial;
}
/** BufReader implements buffering for a Reader object. */ export class BufReader {
    #buffer;
    #reader;
    #posRead = 0;
    #posWrite = 0;
    #eof = false;
    // Reads a new chunk into the buffer.
    async #fill() {
        // Slide existing data to beginning.
        if (this.#posRead > 0) {
            this.#buffer.copyWithin(0, this.#posRead, this.#posWrite);
            this.#posWrite -= this.#posRead;
            this.#posRead = 0;
        }
        if (this.#posWrite >= this.#buffer.byteLength) {
            throw Error("bufio: tried to fill full buffer");
        }
        // Read new data: try a limited number of times.
        for(let i = MAX_CONSECUTIVE_EMPTY_READS; i > 0; i--){
            const rr = await this.#reader.read(this.#buffer.subarray(this.#posWrite));
            if (rr === null) {
                this.#eof = true;
                return;
            }
            assert(rr >= 0, "negative read");
            this.#posWrite += rr;
            if (rr > 0) {
                return;
            }
        }
        throw new Error(`No progress after ${MAX_CONSECUTIVE_EMPTY_READS} read() calls`);
    }
    #reset(buffer, reader) {
        this.#buffer = buffer;
        this.#reader = reader;
        this.#eof = false;
    }
    constructor(rd, size = DEFAULT_BUF_SIZE){
        if (size < MIN_BUF_SIZE) {
            size = MIN_BUF_SIZE;
        }
        this.#reset(new Uint8Array(size), rd);
    }
    buffered() {
        return this.#posWrite - this.#posRead;
    }
    async readLine(strip = true) {
        let line;
        try {
            line = await this.readSlice(LF);
        } catch (err) {
            assert(err instanceof Error);
            let { partial  } = err;
            assert(partial instanceof Uint8Array, "Caught error from `readSlice()` without `partial` property");
            // Don't throw if `readSlice()` failed with `BufferFullError`, instead we
            // just return whatever is available and set the `more` flag.
            if (!(err instanceof BufferFullError)) {
                throw err;
            }
            // Handle the case where "\r\n" straddles the buffer.
            if (!this.#eof && partial.byteLength > 0 && partial[partial.byteLength - 1] === CR) {
                // Put the '\r' back on buf and drop it from line.
                // Let the next call to ReadLine check for "\r\n".
                assert(this.#posRead > 0, "Tried to rewind past start of buffer");
                this.#posRead--;
                partial = partial.subarray(0, partial.byteLength - 1);
            }
            return {
                bytes: partial,
                eol: this.#eof
            };
        }
        if (line === null) {
            return null;
        }
        if (line.byteLength === 0) {
            return {
                bytes: line,
                eol: true
            };
        }
        if (strip) {
            line = stripEol(line);
        }
        return {
            bytes: line,
            eol: true
        };
    }
    async readSlice(delim) {
        let s = 0; // search start index
        let slice;
        while(true){
            // Search buffer.
            let i = this.#buffer.subarray(this.#posRead + s, this.#posWrite).indexOf(delim);
            if (i >= 0) {
                i += s;
                slice = this.#buffer.subarray(this.#posRead, this.#posRead + i + 1);
                this.#posRead += i + 1;
                break;
            }
            // EOF?
            if (this.#eof) {
                if (this.#posRead === this.#posWrite) {
                    return null;
                }
                slice = this.#buffer.subarray(this.#posRead, this.#posWrite);
                this.#posRead = this.#posWrite;
                break;
            }
            // Buffer full?
            if (this.buffered() >= this.#buffer.byteLength) {
                this.#posRead = this.#posWrite;
                // #4521 The internal buffer should not be reused across reads because it causes corruption of data.
                const oldbuf = this.#buffer;
                const newbuf = this.#buffer.slice(0);
                this.#buffer = newbuf;
                throw new BufferFullError(oldbuf);
            }
            s = this.#posWrite - this.#posRead; // do not rescan area we scanned before
            // Buffer is not full.
            try {
                await this.#fill();
            } catch (err) {
                const e = err instanceof Error ? err : new Error("[non-object thrown]");
                e.partial = slice;
                throw err;
            }
        }
        return slice;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMS4xLjAvYnVmX3JlYWRlci50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBvYWsgYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG5cbmltcG9ydCB7IGFzc2VydCwgc3RyaXBFb2wgfSBmcm9tIFwiLi91dGlsLnRzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVhZExpbmVSZXN1bHQge1xuICBieXRlczogVWludDhBcnJheTtcbiAgZW9sOiBib29sZWFuO1xufVxuXG5jb25zdCBERUZBVUxUX0JVRl9TSVpFID0gNDA5NjtcbmNvbnN0IE1JTl9CVUZfU0laRSA9IDE2O1xuY29uc3QgTUFYX0NPTlNFQ1VUSVZFX0VNUFRZX1JFQURTID0gMTAwO1xuY29uc3QgQ1IgPSBcIlxcclwiLmNoYXJDb2RlQXQoMCk7XG5jb25zdCBMRiA9IFwiXFxuXCIuY2hhckNvZGVBdCgwKTtcblxuZXhwb3J0IGNsYXNzIEJ1ZmZlckZ1bGxFcnJvciBleHRlbmRzIEVycm9yIHtcbiAgbmFtZSA9IFwiQnVmZmVyRnVsbEVycm9yXCI7XG4gIGNvbnN0cnVjdG9yKHB1YmxpYyBwYXJ0aWFsOiBVaW50OEFycmF5KSB7XG4gICAgc3VwZXIoXCJCdWZmZXIgZnVsbFwiKTtcbiAgfVxufVxuXG4vKiogQnVmUmVhZGVyIGltcGxlbWVudHMgYnVmZmVyaW5nIGZvciBhIFJlYWRlciBvYmplY3QuICovXG5leHBvcnQgY2xhc3MgQnVmUmVhZGVyIHtcbiAgI2J1ZmZlciE6IFVpbnQ4QXJyYXk7XG4gICNyZWFkZXIhOiBEZW5vLlJlYWRlcjtcbiAgI3Bvc1JlYWQgPSAwO1xuICAjcG9zV3JpdGUgPSAwO1xuICAjZW9mID0gZmFsc2U7XG5cbiAgLy8gUmVhZHMgYSBuZXcgY2h1bmsgaW50byB0aGUgYnVmZmVyLlxuICBhc3luYyAjZmlsbCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAvLyBTbGlkZSBleGlzdGluZyBkYXRhIHRvIGJlZ2lubmluZy5cbiAgICBpZiAodGhpcy4jcG9zUmVhZCA+IDApIHtcbiAgICAgIHRoaXMuI2J1ZmZlci5jb3B5V2l0aGluKDAsIHRoaXMuI3Bvc1JlYWQsIHRoaXMuI3Bvc1dyaXRlKTtcbiAgICAgIHRoaXMuI3Bvc1dyaXRlIC09IHRoaXMuI3Bvc1JlYWQ7XG4gICAgICB0aGlzLiNwb3NSZWFkID0gMDtcbiAgICB9XG5cbiAgICBpZiAodGhpcy4jcG9zV3JpdGUgPj0gdGhpcy4jYnVmZmVyLmJ5dGVMZW5ndGgpIHtcbiAgICAgIHRocm93IEVycm9yKFwiYnVmaW86IHRyaWVkIHRvIGZpbGwgZnVsbCBidWZmZXJcIik7XG4gICAgfVxuXG4gICAgLy8gUmVhZCBuZXcgZGF0YTogdHJ5IGEgbGltaXRlZCBudW1iZXIgb2YgdGltZXMuXG4gICAgZm9yIChsZXQgaSA9IE1BWF9DT05TRUNVVElWRV9FTVBUWV9SRUFEUzsgaSA+IDA7IGktLSkge1xuICAgICAgY29uc3QgcnIgPSBhd2FpdCB0aGlzLiNyZWFkZXIucmVhZCh0aGlzLiNidWZmZXIuc3ViYXJyYXkodGhpcy4jcG9zV3JpdGUpKTtcbiAgICAgIGlmIChyciA9PT0gbnVsbCkge1xuICAgICAgICB0aGlzLiNlb2YgPSB0cnVlO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBhc3NlcnQocnIgPj0gMCwgXCJuZWdhdGl2ZSByZWFkXCIpO1xuICAgICAgdGhpcy4jcG9zV3JpdGUgKz0gcnI7XG4gICAgICBpZiAocnIgPiAwKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgTm8gcHJvZ3Jlc3MgYWZ0ZXIgJHtNQVhfQ09OU0VDVVRJVkVfRU1QVFlfUkVBRFN9IHJlYWQoKSBjYWxsc2AsXG4gICAgKTtcbiAgfVxuXG4gICNyZXNldChidWZmZXI6IFVpbnQ4QXJyYXksIHJlYWRlcjogRGVuby5SZWFkZXIpOiB2b2lkIHtcbiAgICB0aGlzLiNidWZmZXIgPSBidWZmZXI7XG4gICAgdGhpcy4jcmVhZGVyID0gcmVhZGVyO1xuICAgIHRoaXMuI2VvZiA9IGZhbHNlO1xuICB9XG5cbiAgY29uc3RydWN0b3IocmQ6IERlbm8uUmVhZGVyLCBzaXplOiBudW1iZXIgPSBERUZBVUxUX0JVRl9TSVpFKSB7XG4gICAgaWYgKHNpemUgPCBNSU5fQlVGX1NJWkUpIHtcbiAgICAgIHNpemUgPSBNSU5fQlVGX1NJWkU7XG4gICAgfVxuICAgIHRoaXMuI3Jlc2V0KG5ldyBVaW50OEFycmF5KHNpemUpLCByZCk7XG4gIH1cblxuICBidWZmZXJlZCgpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLiNwb3NXcml0ZSAtIHRoaXMuI3Bvc1JlYWQ7XG4gIH1cblxuICBhc3luYyByZWFkTGluZShcbiAgICBzdHJpcCA9IHRydWUsXG4gICk6IFByb21pc2U8eyBieXRlczogVWludDhBcnJheTsgZW9sOiBib29sZWFuIH0gfCBudWxsPiB7XG4gICAgbGV0IGxpbmU6IFVpbnQ4QXJyYXkgfCBudWxsO1xuXG4gICAgdHJ5IHtcbiAgICAgIGxpbmUgPSBhd2FpdCB0aGlzLnJlYWRTbGljZShMRik7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBhc3NlcnQoZXJyIGluc3RhbmNlb2YgRXJyb3IpO1xuICAgICAgbGV0IHsgcGFydGlhbCB9ID0gZXJyIGFzIEVycm9yICYgeyBwYXJ0aWFsPzogVWludDhBcnJheSB9O1xuICAgICAgYXNzZXJ0KFxuICAgICAgICBwYXJ0aWFsIGluc3RhbmNlb2YgVWludDhBcnJheSxcbiAgICAgICAgXCJDYXVnaHQgZXJyb3IgZnJvbSBgcmVhZFNsaWNlKClgIHdpdGhvdXQgYHBhcnRpYWxgIHByb3BlcnR5XCIsXG4gICAgICApO1xuXG4gICAgICAvLyBEb24ndCB0aHJvdyBpZiBgcmVhZFNsaWNlKClgIGZhaWxlZCB3aXRoIGBCdWZmZXJGdWxsRXJyb3JgLCBpbnN0ZWFkIHdlXG4gICAgICAvLyBqdXN0IHJldHVybiB3aGF0ZXZlciBpcyBhdmFpbGFibGUgYW5kIHNldCB0aGUgYG1vcmVgIGZsYWcuXG4gICAgICBpZiAoIShlcnIgaW5zdGFuY2VvZiBCdWZmZXJGdWxsRXJyb3IpKSB7XG4gICAgICAgIHRocm93IGVycjtcbiAgICAgIH1cblxuICAgICAgLy8gSGFuZGxlIHRoZSBjYXNlIHdoZXJlIFwiXFxyXFxuXCIgc3RyYWRkbGVzIHRoZSBidWZmZXIuXG4gICAgICBpZiAoXG4gICAgICAgICF0aGlzLiNlb2YgJiZcbiAgICAgICAgcGFydGlhbC5ieXRlTGVuZ3RoID4gMCAmJlxuICAgICAgICBwYXJ0aWFsW3BhcnRpYWwuYnl0ZUxlbmd0aCAtIDFdID09PSBDUlxuICAgICAgKSB7XG4gICAgICAgIC8vIFB1dCB0aGUgJ1xccicgYmFjayBvbiBidWYgYW5kIGRyb3AgaXQgZnJvbSBsaW5lLlxuICAgICAgICAvLyBMZXQgdGhlIG5leHQgY2FsbCB0byBSZWFkTGluZSBjaGVjayBmb3IgXCJcXHJcXG5cIi5cbiAgICAgICAgYXNzZXJ0KFxuICAgICAgICAgIHRoaXMuI3Bvc1JlYWQgPiAwLFxuICAgICAgICAgIFwiVHJpZWQgdG8gcmV3aW5kIHBhc3Qgc3RhcnQgb2YgYnVmZmVyXCIsXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuI3Bvc1JlYWQtLTtcbiAgICAgICAgcGFydGlhbCA9IHBhcnRpYWwuc3ViYXJyYXkoMCwgcGFydGlhbC5ieXRlTGVuZ3RoIC0gMSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7IGJ5dGVzOiBwYXJ0aWFsLCBlb2w6IHRoaXMuI2VvZiB9O1xuICAgIH1cblxuICAgIGlmIChsaW5lID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAobGluZS5ieXRlTGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4geyBieXRlczogbGluZSwgZW9sOiB0cnVlIH07XG4gICAgfVxuXG4gICAgaWYgKHN0cmlwKSB7XG4gICAgICBsaW5lID0gc3RyaXBFb2wobGluZSk7XG4gICAgfVxuICAgIHJldHVybiB7IGJ5dGVzOiBsaW5lLCBlb2w6IHRydWUgfTtcbiAgfVxuXG4gIGFzeW5jIHJlYWRTbGljZShkZWxpbTogbnVtYmVyKTogUHJvbWlzZTxVaW50OEFycmF5IHwgbnVsbD4ge1xuICAgIGxldCBzID0gMDsgLy8gc2VhcmNoIHN0YXJ0IGluZGV4XG4gICAgbGV0IHNsaWNlOiBVaW50OEFycmF5IHwgdW5kZWZpbmVkO1xuXG4gICAgd2hpbGUgKHRydWUpIHtcbiAgICAgIC8vIFNlYXJjaCBidWZmZXIuXG4gICAgICBsZXQgaSA9IHRoaXMuI2J1ZmZlci5zdWJhcnJheSh0aGlzLiNwb3NSZWFkICsgcywgdGhpcy4jcG9zV3JpdGUpLmluZGV4T2YoXG4gICAgICAgIGRlbGltLFxuICAgICAgKTtcbiAgICAgIGlmIChpID49IDApIHtcbiAgICAgICAgaSArPSBzO1xuICAgICAgICBzbGljZSA9IHRoaXMuI2J1ZmZlci5zdWJhcnJheSh0aGlzLiNwb3NSZWFkLCB0aGlzLiNwb3NSZWFkICsgaSArIDEpO1xuICAgICAgICB0aGlzLiNwb3NSZWFkICs9IGkgKyAxO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgLy8gRU9GP1xuICAgICAgaWYgKHRoaXMuI2VvZikge1xuICAgICAgICBpZiAodGhpcy4jcG9zUmVhZCA9PT0gdGhpcy4jcG9zV3JpdGUpIHtcbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBzbGljZSA9IHRoaXMuI2J1ZmZlci5zdWJhcnJheSh0aGlzLiNwb3NSZWFkLCB0aGlzLiNwb3NXcml0ZSk7XG4gICAgICAgIHRoaXMuI3Bvc1JlYWQgPSB0aGlzLiNwb3NXcml0ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIC8vIEJ1ZmZlciBmdWxsP1xuICAgICAgaWYgKHRoaXMuYnVmZmVyZWQoKSA+PSB0aGlzLiNidWZmZXIuYnl0ZUxlbmd0aCkge1xuICAgICAgICB0aGlzLiNwb3NSZWFkID0gdGhpcy4jcG9zV3JpdGU7XG4gICAgICAgIC8vICM0NTIxIFRoZSBpbnRlcm5hbCBidWZmZXIgc2hvdWxkIG5vdCBiZSByZXVzZWQgYWNyb3NzIHJlYWRzIGJlY2F1c2UgaXQgY2F1c2VzIGNvcnJ1cHRpb24gb2YgZGF0YS5cbiAgICAgICAgY29uc3Qgb2xkYnVmID0gdGhpcy4jYnVmZmVyO1xuICAgICAgICBjb25zdCBuZXdidWYgPSB0aGlzLiNidWZmZXIuc2xpY2UoMCk7XG4gICAgICAgIHRoaXMuI2J1ZmZlciA9IG5ld2J1ZjtcbiAgICAgICAgdGhyb3cgbmV3IEJ1ZmZlckZ1bGxFcnJvcihvbGRidWYpO1xuICAgICAgfVxuXG4gICAgICBzID0gdGhpcy4jcG9zV3JpdGUgLSB0aGlzLiNwb3NSZWFkOyAvLyBkbyBub3QgcmVzY2FuIGFyZWEgd2Ugc2Nhbm5lZCBiZWZvcmVcblxuICAgICAgLy8gQnVmZmVyIGlzIG5vdCBmdWxsLlxuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy4jZmlsbCgpO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGNvbnN0IGUgPSBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyciA6IG5ldyBFcnJvcihcIltub24tb2JqZWN0IHRocm93bl1cIik7XG4gICAgICAgIChlIGFzIEVycm9yICYgeyBwYXJ0aWFsOiB1bmtub3duIH0pLnBhcnRpYWwgPSBzbGljZTtcbiAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gc2xpY2U7XG4gIH1cbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSx5RUFBeUU7QUFFekUsU0FBUyxNQUFNLEVBQUUsUUFBUSxRQUFRLFlBQVk7QUFPN0MsTUFBTSxtQkFBbUI7QUFDekIsTUFBTSxlQUFlO0FBQ3JCLE1BQU0sOEJBQThCO0FBQ3BDLE1BQU0sS0FBSyxLQUFLLFVBQVUsQ0FBQztBQUMzQixNQUFNLEtBQUssS0FBSyxVQUFVLENBQUM7QUFFM0IsT0FBTyxNQUFNLHdCQUF3QjtJ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