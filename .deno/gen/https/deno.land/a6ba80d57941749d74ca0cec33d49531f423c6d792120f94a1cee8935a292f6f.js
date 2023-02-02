/*!
 * Adapted from koa-send at https://github.com/koajs/send and which is licensed
 * with the MIT license.
 */ import { calculate, ifNoneMatch } from "./etag.ts";
import { basename, createHttpError, extname, LimitedReader, parse, readAll, Status } from "./deps.ts";
import { ifRange, MultiPartStream, parseRange } from "./range.ts";
import { assert, decodeComponent, getBoundary, resolvePath } from "./util.ts";
const MAXBUFFER_DEFAULT = 1_048_576; // 1MiB;
// this will be lazily set as it needs to be done asynchronously and we want to
// avoid top level await
let boundary;
function isHidden(path) {
    const pathArr = path.split("/");
    for (const segment of pathArr){
        if (segment[0] === "." && segment !== "." && segment !== "..") {
            return true;
        }
        return false;
    }
}
async function exists(path) {
    try {
        return (await Deno.stat(path)).isFile;
    } catch  {
        return false;
    }
}
async function getEntity(path, mtime, stats, maxbuffer, response) {
    let body;
    let entity;
    const file = await Deno.open(path, {
        read: true
    });
    if (stats.size < maxbuffer) {
        const buffer = await readAll(file);
        file.close();
        body = entity = buffer;
    } else {
        response.addResource(file.rid);
        body = file;
        entity = {
            mtime: new Date(mtime),
            size: stats.size
        };
    }
    return [
        body,
        entity
    ];
}
async function sendRange(response, body, range, size) {
    const ranges = parseRange(range, size);
    if (ranges.length === 0) {
        throw createHttpError(Status.RequestedRangeNotSatisfiable);
    }
    response.status = Status.PartialContent;
    if (ranges.length === 1) {
        const [byteRange] = ranges;
        response.headers.set("Content-Length", String(byteRange.end - byteRange.start + 1));
        response.headers.set("Content-Range", `bytes ${byteRange.start}-${byteRange.end}/${size}`);
        if (body instanceof Uint8Array) {
            response.body = body.slice(byteRange.start, byteRange.end + 1);
        } else {
            await body.seek(byteRange.start, Deno.SeekMode.Start);
            response.body = new LimitedReader(body, byteRange.end - byteRange.start + 1);
        }
    } else {
        assert(response.type);
        if (!boundary) {
            boundary = await getBoundary();
        }
        response.headers.set("content-type", `multipart/byteranges; boundary=${boundary}`);
        const multipartBody = new MultiPartStream(body, response.type, ranges, size, boundary);
        response.headers.set("content-length", String(multipartBody.contentLength()));
        response.body = multipartBody;
    }
}
/** Asynchronously fulfill a response with a file from the local file
 * system.
 *
 * Requires Deno read permission for the `root` directory. */ export async function send(// deno-lint-ignore no-explicit-any
{ request , response  }, path, options = {
    root: ""
}) {
    const { brotli =true , contentTypes ={} , extensions , format =true , gzip =true , hidden =false , immutable =false , index , maxbuffer =MAXBUFFER_DEFAULT , maxage =0 , root  } = options;
    const trailingSlash = path[path.length - 1] === "/";
    path = decodeComponent(path.substr(parse(path).root.length));
    if (index && trailingSlash) {
        path += index;
    }
    if (!hidden && isHidden(path)) {
        throw createHttpError(403);
    }
    path = resolvePath(root, path);
    let encodingExt = "";
    if (brotli && request.acceptsEncodings("br", "identity") === "br" && await exists(`${path}.br`)) {
        path = `${path}.br`;
        response.headers.set("Content-Encoding", "br");
        response.headers.delete("Content-Length");
        encodingExt = ".br";
    } else if (gzip && request.acceptsEncodings("gzip", "identity") === "gzip" && await exists(`${path}.gz`)) {
        path = `${path}.gz`;
        response.headers.set("Content-Encoding", "gzip");
        response.headers.delete("Content-Length");
        encodingExt = ".gz";
    }
    if (extensions && !/\.[^/]*$/.exec(path)) {
        for (let ext of extensions){
            if (!/^\./.exec(ext)) {
                ext = `.${ext}`;
            }
            if (await exists(`${path}${ext}`)) {
                path += ext;
                break;
            }
        }
    }
    let stats;
    try {
        stats = await Deno.stat(path);
        if (stats.isDirectory) {
            if (format && index) {
                path += `/${index}`;
                stats = await Deno.stat(path);
            } else {
                return;
            }
        }
    } catch (err) {
        if (err instanceof Deno.errors.NotFound) {
            throw createHttpError(404, err.message);
        }
        // TODO(@kitsonk) remove when https://github.com/denoland/node_deno_shims/issues/87 resolved
        if (err instanceof Error && err.message.startsWith("ENOENT:")) {
            throw createHttpError(404, err.message);
        }
        throw createHttpError(500, err instanceof Error ? err.message : "[non-error thrown]");
    }
    let mtime = null;
    if (response.headers.has("Last-Modified")) {
        mtime = new Date(response.headers.get("Last-Modified")).getTime();
    } else if (stats.mtime) {
        // Round down to second because it's the precision of the UTC string.
        mtime = stats.mtime.getTime();
        mtime -= mtime % 1000;
        response.headers.set("Last-Modified", new Date(mtime).toUTCString());
    }
    if (!response.headers.has("Cache-Control")) {
        const directives = [
            `max-age=${maxage / 1000 | 0}`
        ];
        if (immutable) {
            directives.push("immutable");
        }
        response.headers.set("Cache-Control", directives.join(","));
    }
    if (!response.type) {
        response.type = encodingExt !== "" ? extname(basename(path, encodingExt)) : contentTypes[extname(path)] ?? extname(path);
    }
    let entity = null;
    let body = null;
    if (request.headers.has("If-None-Match") && mtime) {
        [body, entity] = await getEntity(path, mtime, stats, maxbuffer, response);
        if (!await ifNoneMatch(request.headers.get("If-None-Match"), entity)) {
            response.headers.set("ETag", await calculate(entity));
            response.status = 304;
            return path;
        }
    }
    if (request.headers.has("If-Modified-Since") && mtime) {
        const ifModifiedSince = new Date(request.headers.get("If-Modified-Since"));
        if (ifModifiedSince.getTime() >= mtime) {
            response.status = 304;
            return path;
        }
    }
    if (!body || !entity) {
        [body, entity] = await getEntity(path, mtime ?? 0, stats, maxbuffer, response);
    }
    if (request.headers.has("If-Range") && mtime && await ifRange(request.headers.get("If-Range"), mtime, entity) && request.headers.has("Range")) {
        await sendRange(response, body, request.headers.get("Range"), stats.size);
        return path;
    }
    if (request.headers.has("Range")) {
        await sendRange(response, body, request.headers.get("Range"), stats.size);
        return path;
    }
    response.headers.set("Content-Length", String(stats.size));
    response.body = body;
    if (!response.headers.has("ETag")) {
        response.headers.set("ETag", await calculate(entity));
    }
    if (!response.headers.has("Accept-Ranges")) {
        response.headers.set("Accept-Ranges", "bytes");
    }
    return path;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMS4xLjAvc2VuZC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKiFcbiAqIEFkYXB0ZWQgZnJvbSBrb2Etc2VuZCBhdCBodHRwczovL2dpdGh1Yi5jb20va29hanMvc2VuZCBhbmQgd2hpY2ggaXMgbGljZW5zZWRcbiAqIHdpdGggdGhlIE1JVCBsaWNlbnNlLlxuICovXG5cbmltcG9ydCB0eXBlIHsgQ29udGV4dCB9IGZyb20gXCIuL2NvbnRleHQudHNcIjtcbmltcG9ydCB7IGNhbGN1bGF0ZSwgRmlsZUluZm8sIGlmTm9uZU1hdGNoIH0gZnJvbSBcIi4vZXRhZy50c1wiO1xuaW1wb3J0IHtcbiAgYmFzZW5hbWUsXG4gIGNyZWF0ZUh0dHBFcnJvcixcbiAgZXh0bmFtZSxcbiAgTGltaXRlZFJlYWRlcixcbiAgcGFyc2UsXG4gIHJlYWRBbGwsXG4gIFN0YXR1cyxcbn0gZnJvbSBcIi4vZGVwcy50c1wiO1xuaW1wb3J0IHsgaWZSYW5nZSwgTXVsdGlQYXJ0U3RyZWFtLCBwYXJzZVJhbmdlIH0gZnJvbSBcIi4vcmFuZ2UudHNcIjtcbmltcG9ydCB0eXBlIHsgUmVzcG9uc2UgfSBmcm9tIFwiLi9yZXNwb25zZS50c1wiO1xuaW1wb3J0IHsgYXNzZXJ0LCBkZWNvZGVDb21wb25lbnQsIGdldEJvdW5kYXJ5LCByZXNvbHZlUGF0aCB9IGZyb20gXCIuL3V0aWwudHNcIjtcblxuY29uc3QgTUFYQlVGRkVSX0RFRkFVTFQgPSAxXzA0OF81NzY7IC8vIDFNaUI7XG5cbi8vIHRoaXMgd2lsbCBiZSBsYXppbHkgc2V0IGFzIGl0IG5lZWRzIHRvIGJlIGRvbmUgYXN5bmNocm9ub3VzbHkgYW5kIHdlIHdhbnQgdG9cbi8vIGF2b2lkIHRvcCBsZXZlbCBhd2FpdFxubGV0IGJvdW5kYXJ5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2VuZE9wdGlvbnMge1xuICAvKiogVHJ5IHRvIHNlcnZlIHRoZSBicm90bGkgdmVyc2lvbiBvZiBhIGZpbGUgYXV0b21hdGljYWxseSB3aGVuIGJyb3RsaSBpc1xuICAgKiBzdXBwb3J0ZWQgYnkgYSBjbGllbnQgYW5kIGlmIHRoZSByZXF1ZXN0ZWQgZmlsZSB3aXRoIGAuYnJgIGV4dGVuc2lvblxuICAgKiBleGlzdHMuIChkZWZhdWx0cyB0byBgdHJ1ZWApICovXG4gIGJyb3RsaT86IGJvb2xlYW47XG5cbiAgLyoqIEEgcmVjb3JkIG9mIGV4dGVuc2lvbnMgYW5kIGNvbnRlbnQgdHlwZXMgdGhhdCBzaG91bGQgYmUgdXNlZCB3aGVuXG4gICAqIGRldGVybWluaW5nIHRoZSBjb250ZW50IG9mIGEgZmlsZSBiZWluZyBzZXJ2ZWQuIEJ5IGRlZmF1bHQsIHRoZVxuICAgKiBbYG1lZGlhX3R5cGVgXShodHRwczovL2dpdGh1Yi5jb20vb2Frc2VydmVyL21lZGlhX3R5cGVzLykgZGF0YWJhc2UgaXMgdXNlZFxuICAgKiB0byBtYXAgYW4gZXh0ZW5zaW9uIHRvIHRoZSBzZXJ2ZWQgY29udGVudC10eXBlLiBUaGUga2V5cyBvZiB0aGUgbWFwIGFyZVxuICAgKiBleHRlbnNpb25zLCBhbmQgdmFsdWVzIGFyZSB0aGUgY29udGVudCB0eXBlcyB0byB1c2UuIFRoZSBjb250ZW50IHR5cGUgY2FuXG4gICAqIGJlIGEgcGFydGlhbCBjb250ZW50IHR5cGUsIHdoaWNoIHdpbGwgYmUgcmVzb2x2ZWQgdG8gYSBmdWxsIGNvbnRlbnQgdHlwZVxuICAgKiBoZWFkZXIuXG4gICAqXG4gICAqIEFueSBleHRlbnNpb25zIG1hdGNoZWQgd2lsbCBvdmVycmlkZSB0aGUgZGVmYXVsdCBiZWhhdmlvci4gS2V5IHNob3VsZFxuICAgKiBpbmNsdWRlIHRoZSBsZWFkaW5nIGRvdCAoZS5nLiBgLmV4dGAgaW5zdGVhZCBvZiBqdXN0IGBleHRgKS5cbiAgICpcbiAgICogIyMjIEV4YW1wbGVcbiAgICpcbiAgICogYGBgdHNcbiAgICogYXBwLnVzZSgoY3R4KSA9PiB7XG4gICAqICAgcmV0dXJuIHNlbmQoY3R4LCBjdHgucmVxdWVzdC51cmwucGF0aG5hbWUsIHtcbiAgICogICAgIGNvbnRlbnRUeXBlczoge1xuICAgKiAgICAgICBcIi5pbXBvcnRtYXBcIjogXCJhcHBsaWNhdGlvbi9pbXBvcnRtYXAranNvblwiXG4gICAqICAgICB9LFxuICAgKiAgICAgcm9vdDogXCIuXCIsXG4gICAqICAgfSlcbiAgICogfSk7XG4gICAqIGBgYFxuICAgKi9cbiAgY29udGVudFR5cGVzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcblxuICAvKiogVHJ5IHRvIG1hdGNoIGV4dGVuc2lvbnMgZnJvbSBwYXNzZWQgYXJyYXkgdG8gc2VhcmNoIGZvciBmaWxlIHdoZW4gbm9cbiAgICogZXh0ZW5zaW9uIGlzIHN1ZmZpY2VkIGluIFVSTC4gRmlyc3QgZm91bmQgaXMgc2VydmVkLiAoZGVmYXVsdHMgdG9cbiAgICogYHVuZGVmaW5lZGApICovXG4gIGV4dGVuc2lvbnM/OiBzdHJpbmdbXTtcblxuICAvKiogSWYgYHRydWVgLCBmb3JtYXQgdGhlIHBhdGggdG8gc2VydmUgc3RhdGljIGZpbGUgc2VydmVycyBhbmQgbm90IHJlcXVpcmUgYVxuICAgKiB0cmFpbGluZyBzbGFzaCBmb3IgZGlyZWN0b3JpZXMsIHNvIHRoYXQgeW91IGNhbiBkbyBib3RoIGAvZGlyZWN0b3J5YCBhbmRcbiAgICogYC9kaXJlY3RvcnkvYC4gKGRlZmF1bHRzIHRvIGB0cnVlYCkgKi9cbiAgZm9ybWF0PzogYm9vbGVhbjtcblxuICAvKiogVHJ5IHRvIHNlcnZlIHRoZSBnemlwcGVkIHZlcnNpb24gb2YgYSBmaWxlIGF1dG9tYXRpY2FsbHkgd2hlbiBnemlwIGlzXG4gICAqIHN1cHBvcnRlZCBieSBhIGNsaWVudCBhbmQgaWYgdGhlIHJlcXVlc3RlZCBmaWxlIHdpdGggYC5nemAgZXh0ZW5zaW9uXG4gICAqIGV4aXN0cy4gKGRlZmF1bHRzIHRvIGB0cnVlYCkuICovXG4gIGd6aXA/OiBib29sZWFuO1xuXG4gIC8qKiBBbGxvdyB0cmFuc2ZlciBvZiBoaWRkZW4gZmlsZXMuIChkZWZhdWx0cyB0byBgZmFsc2VgKSAqL1xuICBoaWRkZW4/OiBib29sZWFuO1xuXG4gIC8qKiBUZWxsIHRoZSBicm93c2VyIHRoZSByZXNvdXJjZSBpcyBpbW11dGFibGUgYW5kIGNhbiBiZSBjYWNoZWRcbiAgICogaW5kZWZpbml0ZWx5LiAoZGVmYXVsdHMgdG8gYGZhbHNlYCkgKi9cbiAgaW1tdXRhYmxlPzogYm9vbGVhbjtcblxuICAvKiogTmFtZSBvZiB0aGUgaW5kZXggZmlsZSB0byBzZXJ2ZSBhdXRvbWF0aWNhbGx5IHdoZW4gdmlzaXRpbmcgdGhlIHJvb3RcbiAgICogbG9jYXRpb24uIChkZWZhdWx0cyB0byBub25lKSAqL1xuICBpbmRleD86IHN0cmluZztcblxuICAvKiogQnJvd3NlciBjYWNoZSBtYXgtYWdlIGluIG1pbGxpc2Vjb25kcy4gKGRlZmF1bHRzIHRvIGAwYCkgKi9cbiAgbWF4YWdlPzogbnVtYmVyO1xuXG4gIC8qKiBBIHNpemUgaW4gYnl0ZXMgd2hlcmUgaWYgdGhlIGZpbGUgaXMgbGVzcyB0aGFuIHRoaXMgc2l6ZSwgdGhlIGZpbGUgd2lsbFxuICAgKiBiZSByZWFkIGludG8gbWVtb3J5IGJ5IHNlbmQgaW5zdGVhZCBvZiByZXR1cm5pbmcgYSBmaWxlIGhhbmRsZS4gIEZpbGVzIGxlc3NcbiAgICogdGhhbiB0aGUgYnl0ZSBzaXplIHdpbGwgc2VuZCBhbiBcInN0cm9uZ1wiIGBFVGFnYCBoZWFkZXIgd2hpbGUgdGhvc2UgbGFyZ2VyXG4gICAqIHRoYW4gdGhlIGJ5dGVzIHNpemUgd2lsbCBvbmx5IGJlIGFibGUgdG8gc2VuZCBhIFwid2Vha1wiIGBFVGFnYCBoZWFkZXIgKGFzXG4gICAqIHRoZXkgY2Fubm90IGhhc2ggdGhlIGNvbnRlbnRzIG9mIHRoZSBmaWxlKS4gKGRlZmF1bHRzIHRvIDFNaUIpXG4gICAqL1xuICBtYXhidWZmZXI/OiBudW1iZXI7XG5cbiAgLyoqIFJvb3QgZGlyZWN0b3J5IHRvIHJlc3RyaWN0IGZpbGUgYWNjZXNzLiAqL1xuICByb290OiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGlzSGlkZGVuKHBhdGg6IHN0cmluZykge1xuICBjb25zdCBwYXRoQXJyID0gcGF0aC5zcGxpdChcIi9cIik7XG4gIGZvciAoY29uc3Qgc2VnbWVudCBvZiBwYXRoQXJyKSB7XG4gICAgaWYgKHNlZ21lbnRbMF0gPT09IFwiLlwiICYmIHNlZ21lbnQgIT09IFwiLlwiICYmIHNlZ21lbnQgIT09IFwiLi5cIikge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBleGlzdHMocGF0aDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIChhd2FpdCBEZW5vLnN0YXQocGF0aCkpLmlzRmlsZTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldEVudGl0eShcbiAgcGF0aDogc3RyaW5nLFxuICBtdGltZTogbnVtYmVyLFxuICBzdGF0czogRGVuby5GaWxlSW5mbyxcbiAgbWF4YnVmZmVyOiBudW1iZXIsXG4gIHJlc3BvbnNlOiBSZXNwb25zZSxcbik6IFByb21pc2U8W1VpbnQ4QXJyYXkgfCBEZW5vLkZzRmlsZSwgVWludDhBcnJheSB8IEZpbGVJbmZvXT4ge1xuICBsZXQgYm9keTogVWludDhBcnJheSB8IERlbm8uRnNGaWxlO1xuICBsZXQgZW50aXR5OiBVaW50OEFycmF5IHwgRmlsZUluZm87XG4gIGNvbnN0IGZpbGUgPSBhd2FpdCBEZW5vLm9wZW4ocGF0aCwgeyByZWFkOiB0cnVlIH0pO1xuICBpZiAoc3RhdHMuc2l6ZSA8IG1heGJ1ZmZlcikge1xuICAgIGNvbnN0IGJ1ZmZlciA9IGF3YWl0IHJlYWRBbGwoZmlsZSk7XG4gICAgZmlsZS5jbG9zZSgpO1xuICAgIGJvZHkgPSBlbnRpdHkgPSBidWZmZXI7XG4gIH0gZWxzZSB7XG4gICAgcmVzcG9uc2UuYWRkUmVzb3VyY2UoZmlsZS5yaWQpO1xuICAgIGJvZHkgPSBmaWxlO1xuICAgIGVudGl0eSA9IHtcbiAgICAgIG10aW1lOiBuZXcgRGF0ZShtdGltZSEpLFxuICAgICAgc2l6ZTogc3RhdHMuc2l6ZSxcbiAgICB9O1xuICB9XG4gIHJldHVybiBbYm9keSwgZW50aXR5XTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gc2VuZFJhbmdlKFxuICByZXNwb25zZTogUmVzcG9uc2UsXG4gIGJvZHk6IFVpbnQ4QXJyYXkgfCBEZW5vLkZzRmlsZSxcbiAgcmFuZ2U6IHN0cmluZyxcbiAgc2l6ZTogbnVtYmVyLFxuKSB7XG4gIGNvbnN0IHJhbmdlcyA9IHBhcnNlUmFuZ2UocmFuZ2UsIHNpemUpO1xuICBpZiAocmFuZ2VzLmxlbmd0aCA9PT0gMCkge1xuICAgIHRocm93IGNyZWF0ZUh0dHBFcnJvcihTdGF0dXMuUmVxdWVzdGVkUmFuZ2VOb3RTYXRpc2ZpYWJsZSk7XG4gIH1cbiAgcmVzcG9uc2Uuc3RhdHVzID0gU3RhdHVzLlBhcnRpYWxDb250ZW50O1xuICBpZiAocmFuZ2VzLmxlbmd0aCA9PT0gMSkge1xuICAgIGNvbnN0IFtieXRlUmFuZ2VdID0gcmFuZ2VzO1xuICAgIHJlc3BvbnNlLmhlYWRlcnMuc2V0KFxuICAgICAgXCJDb250ZW50LUxlbmd0aFwiLFxuICAgICAgU3RyaW5nKGJ5dGVSYW5nZS5lbmQgLSBieXRlUmFuZ2Uuc3RhcnQgKyAxKSxcbiAgICApO1xuICAgIHJlc3BvbnNlLmhlYWRlcnMuc2V0KFxuICAgICAgXCJDb250ZW50LVJhbmdlXCIsXG4gICAgICBgYnl0ZXMgJHtieXRlUmFuZ2Uuc3RhcnR9LSR7Ynl0ZVJhbmdlLmVuZH0vJHtzaXplfWAsXG4gICAgKTtcbiAgICBpZiAoYm9keSBpbnN0YW5jZW9mIFVpbnQ4QXJyYXkpIHtcbiAgICAgIHJlc3BvbnNlLmJvZHkgPSBib2R5LnNsaWNlKGJ5dGVSYW5nZS5zdGFydCwgYnl0ZVJhbmdlLmVuZCArIDEpO1xuICAgIH0gZWxzZSB7XG4gICAgICBhd2FpdCBib2R5LnNlZWsoYnl0ZVJhbmdlLnN0YXJ0LCBEZW5vLlNlZWtNb2RlLlN0YXJ0KTtcbiAgICAgIHJlc3BvbnNlLmJvZHkgPSBuZXcgTGltaXRlZFJlYWRlcihcbiAgICAgICAgYm9keSxcbiAgICAgICAgYnl0ZVJhbmdlLmVuZCAtIGJ5dGVSYW5nZS5zdGFydCArIDEsXG4gICAgICApO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBhc3NlcnQocmVzcG9uc2UudHlwZSk7XG4gICAgaWYgKCFib3VuZGFyeSkge1xuICAgICAgYm91bmRhcnkgPSBhd2FpdCBnZXRCb3VuZGFyeSgpO1xuICAgIH1cbiAgICByZXNwb25zZS5oZWFkZXJzLnNldChcbiAgICAgIFwiY29udGVudC10eXBlXCIsXG4gICAgICBgbXVsdGlwYXJ0L2J5dGVyYW5nZXM7IGJvdW5kYXJ5PSR7Ym91bmRhcnl9YCxcbiAgICApO1xuICAgIGNvbnN0IG11bHRpcGFydEJvZHkgPSBuZXcgTXVsdGlQYXJ0U3RyZWFtKFxuICAgICAgYm9keSxcbiAgICAgIHJlc3BvbnNlLnR5cGUsXG4gICAgICByYW5nZXMsXG4gICAgICBzaXplLFxuICAgICAgYm91bmRhcnksXG4gICAgKTtcbiAgICByZXNwb25zZS5oZWFkZXJzLnNldChcbiAgICAgIFwiY29udGVudC1sZW5ndGhcIixcbiAgICAgIFN0cmluZyhtdWx0aXBhcnRCb2R5LmNvbnRlbnRMZW5ndGgoKSksXG4gICAgKTtcbiAgICByZXNwb25zZS5ib2R5ID0gbXVsdGlwYXJ0Qm9keTtcbiAgfVxufVxuXG4vKiogQXN5bmNocm9ub3VzbHkgZnVsZmlsbCBhIHJlc3BvbnNlIHdpdGggYSBmaWxlIGZyb20gdGhlIGxvY2FsIGZpbGVcbiAqIHN5c3RlbS5cbiAqXG4gKiBSZXF1aXJlcyBEZW5vIHJlYWQgcGVybWlzc2lvbiBmb3IgdGhlIGByb290YCBkaXJlY3RvcnkuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2VuZChcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgeyByZXF1ZXN0LCByZXNwb25zZSB9OiBDb250ZXh0PGFueT4sXG4gIHBhdGg6IHN0cmluZyxcbiAgb3B0aW9uczogU2VuZE9wdGlvbnMgPSB7IHJvb3Q6IFwiXCIgfSxcbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG4gIGNvbnN0IHtcbiAgICBicm90bGkgPSB0cnVlLFxuICAgIGNvbnRlbnRUeXBlcyA9IHt9LFxuICAgIGV4dGVuc2lvbnMsXG4gICAgZm9ybWF0ID0gdHJ1ZSxcbiAgICBnemlwID0gdHJ1ZSxcbiAgICBoaWRkZW4gPSBmYWxzZSxcbiAgICBpbW11dGFibGUgPSBmYWxzZSxcbiAgICBpbmRleCxcbiAgICBtYXhidWZmZXIgPSBNQVhCVUZGRVJfREVGQVVMVCxcbiAgICBtYXhhZ2UgPSAwLFxuICAgIHJvb3QsXG4gIH0gPSBvcHRpb25zO1xuICBjb25zdCB0cmFpbGluZ1NsYXNoID0gcGF0aFtwYXRoLmxlbmd0aCAtIDFdID09PSBcIi9cIjtcbiAgcGF0aCA9IGRlY29kZUNvbXBvbmVudChwYXRoLnN1YnN0cihwYXJzZShwYXRoKS5yb290Lmxlbmd0aCkpO1xuICBpZiAoaW5kZXggJiYgdHJhaWxpbmdTbGFzaCkge1xuICAgIHBhdGggKz0gaW5kZXg7XG4gIH1cblxuICBpZiAoIWhpZGRlbiAmJiBpc0hpZGRlbihwYXRoKSkge1xuICAgIHRocm93IGNyZWF0ZUh0dHBFcnJvcig0MDMpO1xuICB9XG5cbiAgcGF0aCA9IHJlc29sdmVQYXRoKHJvb3QsIHBhdGgpO1xuXG4gIGxldCBlbmNvZGluZ0V4dCA9IFwiXCI7XG4gIGlmIChcbiAgICBicm90bGkgJiZcbiAgICByZXF1ZXN0LmFjY2VwdHNFbmNvZGluZ3MoXCJiclwiLCBcImlkZW50aXR5XCIpID09PSBcImJyXCIgJiZcbiAgICAoYXdhaXQgZXhpc3RzKGAke3BhdGh9LmJyYCkpXG4gICkge1xuICAgIHBhdGggPSBgJHtwYXRofS5icmA7XG4gICAgcmVzcG9uc2UuaGVhZGVycy5zZXQoXCJDb250ZW50LUVuY29kaW5nXCIsIFwiYnJcIik7XG4gICAgcmVzcG9uc2UuaGVhZGVycy5kZWxldGUoXCJDb250ZW50LUxlbmd0aFwiKTtcbiAgICBlbmNvZGluZ0V4dCA9IFwiLmJyXCI7XG4gIH0gZWxzZSBpZiAoXG4gICAgZ3ppcCAmJlxuICAgIHJlcXVlc3QuYWNjZXB0c0VuY29kaW5ncyhcImd6aXBcIiwgXCJpZGVudGl0eVwiKSA9PT0gXCJnemlwXCIgJiZcbiAgICAoYXdhaXQgZXhpc3RzKGAke3BhdGh9Lmd6YCkpXG4gICkge1xuICAgIHBhdGggPSBgJHtwYXRofS5nemA7XG4gICAgcmVzcG9uc2UuaGVhZGVycy5zZXQoXCJDb250ZW50LUVuY29kaW5nXCIsIFwiZ3ppcFwiKTtcbiAgICByZXNwb25zZS5oZWFkZXJzLmRlbGV0ZShcIkNvbnRlbnQtTGVuZ3RoXCIpO1xuICAgIGVuY29kaW5nRXh0ID0gXCIuZ3pcIjtcbiAgfVxuXG4gIGlmIChleHRlbnNpb25zICYmICEvXFwuW14vXSokLy5leGVjKHBhdGgpKSB7XG4gICAgZm9yIChsZXQgZXh0IG9mIGV4dGVuc2lvbnMpIHtcbiAgICAgIGlmICghL15cXC4vLmV4ZWMoZXh0KSkge1xuICAgICAgICBleHQgPSBgLiR7ZXh0fWA7XG4gICAgICB9XG4gICAgICBpZiAoYXdhaXQgZXhpc3RzKGAke3BhdGh9JHtleHR9YCkpIHtcbiAgICAgICAgcGF0aCArPSBleHQ7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGxldCBzdGF0czogRGVuby5GaWxlSW5mbztcbiAgdHJ5IHtcbiAgICBzdGF0cyA9IGF3YWl0IERlbm8uc3RhdChwYXRoKTtcblxuICAgIGlmIChzdGF0cy5pc0RpcmVjdG9yeSkge1xuICAgICAgaWYgKGZvcm1hdCAmJiBpbmRleCkge1xuICAgICAgICBwYXRoICs9IGAvJHtpbmRleH1gO1xuICAgICAgICBzdGF0cyA9IGF3YWl0IERlbm8uc3RhdChwYXRoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGlmIChlcnIgaW5zdGFuY2VvZiBEZW5vLmVycm9ycy5Ob3RGb3VuZCkge1xuICAgICAgdGhyb3cgY3JlYXRlSHR0cEVycm9yKDQwNCwgZXJyLm1lc3NhZ2UpO1xuICAgIH1cbiAgICAvLyBUT0RPKEBraXRzb25rKSByZW1vdmUgd2hlbiBodHRwczovL2dpdGh1Yi5jb20vZGVub2xhbmQvbm9kZV9kZW5vX3NoaW1zL2lzc3Vlcy84NyByZXNvbHZlZFxuICAgIGlmIChlcnIgaW5zdGFuY2VvZiBFcnJvciAmJiBlcnIubWVzc2FnZS5zdGFydHNXaXRoKFwiRU5PRU5UOlwiKSkge1xuICAgICAgdGhyb3cgY3JlYXRlSHR0cEVycm9yKDQwNCwgZXJyLm1lc3NhZ2UpO1xuICAgIH1cbiAgICB0aHJvdyBjcmVhdGVIdHRwRXJyb3IoXG4gICAgICA1MDAsXG4gICAgICBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogXCJbbm9uLWVycm9yIHRocm93bl1cIixcbiAgICApO1xuICB9XG5cbiAgbGV0IG10aW1lOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgaWYgKHJlc3BvbnNlLmhlYWRlcnMuaGFzKFwiTGFzdC1Nb2RpZmllZFwiKSkge1xuICAgIG10aW1lID0gbmV3IERhdGUocmVzcG9uc2UuaGVhZGVycy5nZXQoXCJMYXN0LU1vZGlmaWVkXCIpISkuZ2V0VGltZSgpO1xuICB9IGVsc2UgaWYgKHN0YXRzLm10aW1lKSB7XG4gICAgLy8gUm91bmQgZG93biB0byBzZWNvbmQgYmVjYXVzZSBpdCdzIHRoZSBwcmVjaXNpb24gb2YgdGhlIFVUQyBzdHJpbmcuXG4gICAgbXRpbWUgPSBzdGF0cy5tdGltZS5nZXRUaW1lKCk7XG4gICAgbXRpbWUgLT0gbXRpbWUgJSAxMDAwO1xuICAgIHJlc3BvbnNlLmhlYWRlcnMuc2V0KFwiTGFzdC1Nb2RpZmllZFwiLCBuZXcgRGF0ZShtdGltZSkudG9VVENTdHJpbmcoKSk7XG4gIH1cblxuICBpZiAoIXJlc3BvbnNlLmhlYWRlcnMuaGFzKFwiQ2FjaGUtQ29udHJvbFwiKSkge1xuICAgIGNvbnN0IGRpcmVjdGl2ZXMgPSBbYG1heC1hZ2U9JHsobWF4YWdlIC8gMTAwMCkgfCAwfWBdO1xuICAgIGlmIChpbW11dGFibGUpIHtcbiAgICAgIGRpcmVjdGl2ZXMucHVzaChcImltbXV0YWJsZVwiKTtcbiAgICB9XG4gICAgcmVzcG9uc2UuaGVhZGVycy5zZXQoXCJDYWNoZS1Db250cm9sXCIsIGRpcmVjdGl2ZXMuam9pbihcIixcIikpO1xuICB9XG4gIGlmICghcmVzcG9uc2UudHlwZSkge1xuICAgIHJlc3BvbnNlLnR5cGUgPSBlbmNvZGluZ0V4dCAhPT0gXCJcIlxuICAgICAgPyBleHRuYW1lKGJhc2VuYW1lKHBhdGgsIGVuY29kaW5nRXh0KSlcbiAgICAgIDogY29udGVudFR5cGVzW2V4dG5hbWUocGF0aCldID8/IGV4dG5hbWUocGF0aCk7XG4gIH1cblxuICBsZXQgZW50aXR5OiBVaW50OEFycmF5IHwgRmlsZUluZm8gfCBudWxsID0gbnVsbDtcbiAgbGV0IGJvZHk6IFVpbnQ4QXJyYXkgfCBEZW5vLkZzRmlsZSB8IG51bGwgPSBudWxsO1xuXG4gIGlmIChyZXF1ZXN0LmhlYWRlcnMuaGFzKFwiSWYtTm9uZS1NYXRjaFwiKSAmJiBtdGltZSkge1xuICAgIFtib2R5LCBlbnRpdHldID0gYXdhaXQgZ2V0RW50aXR5KHBhdGgsIG10aW1lLCBzdGF0cywgbWF4YnVmZmVyLCByZXNwb25zZSk7XG4gICAgaWYgKCFhd2FpdCBpZk5vbmVNYXRjaChyZXF1ZXN0LmhlYWRlcnMuZ2V0KFwiSWYtTm9uZS1NYXRjaFwiKSEsIGVudGl0eSkpIHtcbiAgICAgIHJlc3BvbnNlLmhlYWRlcnMuc2V0KFwiRVRhZ1wiLCBhd2FpdCBjYWxjdWxhdGUoZW50aXR5KSk7XG4gICAgICByZXNwb25zZS5zdGF0dXMgPSAzMDQ7XG4gICAgICByZXR1cm4gcGF0aDtcbiAgICB9XG4gIH1cblxuICBpZiAocmVxdWVzdC5oZWFkZXJzLmhhcyhcIklmLU1vZGlmaWVkLVNpbmNlXCIpICYmIG10aW1lKSB7XG4gICAgY29uc3QgaWZNb2RpZmllZFNpbmNlID0gbmV3IERhdGUocmVxdWVzdC5oZWFkZXJzLmdldChcIklmLU1vZGlmaWVkLVNpbmNlXCIpISk7XG4gICAgaWYgKGlmTW9kaWZpZWRTaW5jZS5nZXRUaW1lKCkgPj0gbXRpbWUpIHtcbiAgICAgIHJlc3BvbnNlLnN0YXR1cyA9IDMwNDtcbiAgICAgIHJldHVybiBwYXRoO1xuICAgIH1cbiAgfVxuXG4gIGlmICghYm9keSB8fCAhZW50aXR5KSB7XG4gICAgW2JvZHksIGVudGl0eV0gPSBhd2FpdCBnZXRFbnRpdHkoXG4gICAgICBwYXRoLFxuICAgICAgbXRpbWUgPz8gMCxcbiAgICAgIHN0YXRzLFxuICAgICAgbWF4YnVmZmVyLFxuICAgICAgcmVzcG9uc2UsXG4gICAgKTtcbiAgfVxuXG4gIGlmIChcbiAgICByZXF1ZXN0LmhlYWRlcnMuaGFzKFwiSWYtUmFuZ2VcIikgJiYgbXRpbWUgJiZcbiAgICBhd2FpdCBpZlJhbmdlKHJlcXVlc3QuaGVhZGVycy5nZXQoXCJJZi1SYW5nZVwiKSEsIG10aW1lLCBlbnRpdHkpICYmXG4gICAgcmVxdWVzdC5oZWFkZXJzLmhhcyhcIlJhbmdlXCIpXG4gICkge1xuICAgIGF3YWl0IHNlbmRSYW5nZShyZXNwb25zZSwgYm9keSwgcmVxdWVzdC5oZWFkZXJzLmdldChcIlJhbmdlXCIpISwgc3RhdHMuc2l6ZSk7XG4gICAgcmV0dXJuIHBhdGg7XG4gIH1cblxuICBpZiAocmVxdWVzdC5oZWFkZXJzLmhhcyhcIlJhbmdlXCIpKSB7XG4gICAgYXdhaXQgc2VuZFJhbmdlKHJlc3BvbnNlLCBib2R5LCByZXF1ZXN0LmhlYWRlcnMuZ2V0KFwiUmFuZ2VcIikhLCBzdGF0cy5zaXplKTtcbiAgICByZXR1cm4gcGF0aDtcbiAgfVxuXG4gIHJlc3BvbnNlLmhlYWRlcnMuc2V0KFwiQ29udGVudC1MZW5ndGhcIiwgU3RyaW5nKHN0YXRzLnNpemUpKTtcbiAgcmVzcG9uc2UuYm9keSA9IGJvZHk7XG5cbiAgaWYgKCFyZXNwb25zZS5oZWFkZXJzLmhhcyhcIkVUYWdcIikpIHtcbiAgICByZXNwb25zZS5oZWFkZXJzLnNldChcIkVUYWdcIiwgYXdhaXQgY2FsY3VsYXRlKGVudGl0eSkpO1xuICB9XG5cbiAgaWYgKCFyZXNwb25zZS5oZWFkZXJzLmhhcyhcIkFjY2VwdC1SYW5nZXNcIikpIHtcbiAgICByZXNwb25zZS5oZWFkZXJzLnNldChcIkFjY2VwdC1SYW5nZXNcIiwgXCJieXRlc1wiKTtcbiAgfVxuXG4gIHJldHVybiBwYXRoO1xufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Q0FHQyxHQUVELEFBQ0EsU0FBUyxTQUFTLEVBQVksV0FBVyxRQUFRLFlBQVk7QUFDN0QsU0FDRSxRQUFRLEVBQ1IsZUFBZSxFQUNmLE9BQU8sRUFDUCxhQUFhLEVBQ2IsS0FBSyxFQUNMLE9BQU8sRUFDUCxNQUFNLFFBQ0QsWUFBWTtBQUNuQixTQUFTLE9BQU8sRUFBRSxlQUFlLEVBQUUsVUFBVSxRQUFRLGFBQWE7QUFFbEUsU0FBUyxNQUFNLEVBQUUsZUFBZSxFQUFFLFdBQVcsRUFBRSxXQUFXLFFBQVEsWUFBWTtBQUU5RSxNQUFNLG9CQUFvQixXQUFXLFFBQVE7QUFFN0MsK0VBQStFO0FBQy9FLHdCQUF3QjtBQUN4QixJQUFJO0FBMkVKLFNBQVMsU0FBUyxJQUFZLEVBQUU7SUFDOUIsTUFBTSxVQUFVLEtBQUssS0FBSyxDQUFDO0lBQzNCLEtBQUssTUFBTSxXQUFXLFFBQVM7UUFDN0IsSUFBSSxPQUFPLENBQUMsRUFBRSxLQUFLLE9BQU8sWUFBWSxPQUFPLFlBQVksTUFBTTtZQUM3RCxPQUFPLElBQUk7UUFDYixDQUFDO1FBQ0QsT0FBTyxLQUFLO0lBQ2Q7QUFDRjtBQUVBLGVBQWUsT0FBTyxJQUFZLEVBQW9CO0lBQ3BELElBQUk7UUFDRixPQUFPLENBQUMsTUFBTSxLQUFLLElBQUksQ0FBQyxLQUFLLEVBQUUsTUFBTTtJQUN2QyxFQUFFLE9BQU07UUFDTixPQUFPLEtBQUs7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