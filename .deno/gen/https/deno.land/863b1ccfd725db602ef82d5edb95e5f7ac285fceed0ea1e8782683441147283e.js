// Copyright 2018-2022 the oak authors. All rights reserved. MIT license.
/**
 * A collection of APIs for dealing with ETags in requests and responses.
 *
 * @module
 */ import { base64 } from "./deps.ts";
import { BODY_TYPES, isAsyncIterable, isReader } from "./util.ts";
function isFileInfo(value) {
    return Boolean(value && typeof value === "object" && "mtime" in value && "size" in value);
}
function calcStatTag(entity) {
    const mtime = entity.mtime?.getTime().toString(16) ?? "0";
    const size = entity.size.toString(16);
    return `"${size}-${mtime}"`;
}
const encoder = new TextEncoder();
async function calcEntityTag(entity) {
    if (entity.length === 0) {
        return `"0-2jmj7l5rSw0yVb/vlWAYkK/YBwk="`;
    }
    if (typeof entity === "string") {
        entity = encoder.encode(entity);
    }
    const hash = base64.encode(await crypto.subtle.digest("SHA-1", entity)).substring(0, 27);
    return `"${entity.length.toString(16)}-${hash}"`;
}
function fstat(file) {
    if ("fstat" in Deno) {
        // deno-lint-ignore no-explicit-any
        return Deno.fstat(file.rid);
    }
    return Promise.resolve(undefined);
}
/** For a given Context, try to determine the response body entity that an ETag
 * can be calculated from. */ // deno-lint-ignore no-explicit-any
export function getEntity(context) {
    const { body  } = context.response;
    if (body instanceof Deno.FsFile) {
        return fstat(body);
    }
    if (body instanceof Uint8Array) {
        return Promise.resolve(body);
    }
    if (BODY_TYPES.includes(typeof body)) {
        return Promise.resolve(String(body));
    }
    if (isAsyncIterable(body) || isReader(body)) {
        return Promise.resolve(undefined);
    }
    if (typeof body === "object" && body !== null) {
        try {
            const bodyText = JSON.stringify(body);
            return Promise.resolve(bodyText);
        } catch  {
        // We don't really care about errors here
        }
    }
    return Promise.resolve(undefined);
}
/**
 * Calculate an ETag value for an entity. If the entity is `FileInfo`, then the
 * tag will default to a _weak_ ETag.  `options.weak` overrides any default
 * behavior in generating the tag.
 *
 * @param entity A string, Uint8Array, or file info to use to generate the ETag
 * @param options
 */ export async function calculate(entity, options = {}) {
    const weak = options.weak ?? isFileInfo(entity);
    const tag = isFileInfo(entity) ? calcStatTag(entity) : await calcEntityTag(entity);
    return weak ? `W/${tag}` : tag;
}
/**
 * Create middleware that will attempt to decode the response.body into
 * something that can be used to generate an `ETag` and add the `ETag` header to
 * the response.
 */ // deno-lint-ignore no-explicit-any
export function factory(options) {
    return async function etag(context, next) {
        await next();
        if (!context.response.headers.has("ETag")) {
            const entity = await getEntity(context);
            if (entity) {
                context.response.headers.set("ETag", await calculate(entity, options));
            }
        }
    };
}
/**
 * A helper function that takes the value from the `If-Match` header and an
 * entity and returns `true` if the `ETag` for the entity matches the supplied
 * value, otherwise `false`.
 *
 * See MDN's [`If-Match`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Match)
 * article for more information on how to use this function.
 */ export async function ifMatch(value, entity, options = {}) {
    const etag = await calculate(entity, options);
    // Weak tags cannot be matched and return false.
    if (etag.startsWith("W/")) {
        return false;
    }
    if (value.trim() === "*") {
        return true;
    }
    const tags = value.split(/\s*,\s*/);
    return tags.includes(etag);
}
/**
 * A helper function that takes the value from the `If-No-Match` header and
 * an entity and returns `false` if the `ETag` for the entity matches the
 * supplied value, otherwise `false`.
 *
 * See MDN's [`If-None-Match`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-None-Match)
 * article for more information on how to use this function.
 */ export async function ifNoneMatch(value, entity, options = {}) {
    if (value.trim() === "*") {
        return false;
    }
    const etag = await calculate(entity, options);
    const tags = value.split(/\s*,\s*/);
    return !tags.includes(etag);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMS4xLjAvZXRhZy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBvYWsgYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG5cbi8qKlxuICogQSBjb2xsZWN0aW9uIG9mIEFQSXMgZm9yIGRlYWxpbmcgd2l0aCBFVGFncyBpbiByZXF1ZXN0cyBhbmQgcmVzcG9uc2VzLlxuICpcbiAqIEBtb2R1bGVcbiAqL1xuXG5pbXBvcnQgdHlwZSB7IFN0YXRlIH0gZnJvbSBcIi4vYXBwbGljYXRpb24udHNcIjtcbmltcG9ydCB0eXBlIHsgQ29udGV4dCB9IGZyb20gXCIuL2NvbnRleHQudHNcIjtcbmltcG9ydCB7IGJhc2U2NCB9IGZyb20gXCIuL2RlcHMudHNcIjtcbmltcG9ydCB0eXBlIHsgTWlkZGxld2FyZSB9IGZyb20gXCIuL21pZGRsZXdhcmUudHNcIjtcbmltcG9ydCB7IEJPRFlfVFlQRVMsIGlzQXN5bmNJdGVyYWJsZSwgaXNSZWFkZXIgfSBmcm9tIFwiLi91dGlsLnRzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRVRhZ09wdGlvbnMge1xuICAvKiogT3ZlcnJpZGUgdGhlIGRlZmF1bHQgYmVoYXZpb3Igb2YgY2FsY3VsYXRpbmcgdGhlIGBFVGFnYCwgZWl0aGVyIGZvcmNpbmdcbiAgICogYSB0YWcgdG8gYmUgbGFiZWxsZWQgd2VhayBvciBub3QuICovXG4gIHdlYWs/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIEp1c3QgdGhlIHBhcnQgb2YgYERlbm8uRmlsZUluZm9gIHRoYXQgaXMgcmVxdWlyZWQgdG8gY2FsY3VsYXRlIGFuIGBFVGFnYCxcbiAqIHNvIHBhcnRpYWwgb3IgdXNlciBnZW5lcmF0ZWQgZmlsZSBpbmZvcm1hdGlvbiBjYW4gYmUgcGFzc2VkLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIEZpbGVJbmZvIHtcbiAgbXRpbWU6IERhdGUgfCBudWxsO1xuICBzaXplOiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIGlzRmlsZUluZm8odmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBGaWxlSW5mbyB7XG4gIHJldHVybiBCb29sZWFuKFxuICAgIHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gXCJvYmplY3RcIiAmJiBcIm10aW1lXCIgaW4gdmFsdWUgJiYgXCJzaXplXCIgaW4gdmFsdWUsXG4gICk7XG59XG5cbmZ1bmN0aW9uIGNhbGNTdGF0VGFnKGVudGl0eTogRmlsZUluZm8pOiBzdHJpbmcge1xuICBjb25zdCBtdGltZSA9IGVudGl0eS5tdGltZT8uZ2V0VGltZSgpLnRvU3RyaW5nKDE2KSA/PyBcIjBcIjtcbiAgY29uc3Qgc2l6ZSA9IGVudGl0eS5zaXplLnRvU3RyaW5nKDE2KTtcblxuICByZXR1cm4gYFwiJHtzaXplfS0ke210aW1lfVwiYDtcbn1cblxuY29uc3QgZW5jb2RlciA9IG5ldyBUZXh0RW5jb2RlcigpO1xuXG5hc3luYyBmdW5jdGlvbiBjYWxjRW50aXR5VGFnKGVudGl0eTogc3RyaW5nIHwgVWludDhBcnJheSk6IFByb21pc2U8c3RyaW5nPiB7XG4gIGlmIChlbnRpdHkubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIGBcIjAtMmptajdsNXJTdzB5VmIvdmxXQVlrSy9ZQndrPVwiYDtcbiAgfVxuXG4gIGlmICh0eXBlb2YgZW50aXR5ID09PSBcInN0cmluZ1wiKSB7XG4gICAgZW50aXR5ID0gZW5jb2Rlci5lbmNvZGUoZW50aXR5KTtcbiAgfVxuXG4gIGNvbnN0IGhhc2ggPSBiYXNlNjQuZW5jb2RlKGF3YWl0IGNyeXB0by5zdWJ0bGUuZGlnZXN0KFwiU0hBLTFcIiwgZW50aXR5KSlcbiAgICAuc3Vic3RyaW5nKDAsIDI3KTtcblxuICByZXR1cm4gYFwiJHtlbnRpdHkubGVuZ3RoLnRvU3RyaW5nKDE2KX0tJHtoYXNofVwiYDtcbn1cblxuZnVuY3Rpb24gZnN0YXQoZmlsZTogRGVuby5Gc0ZpbGUpOiBQcm9taXNlPERlbm8uRmlsZUluZm8gfCB1bmRlZmluZWQ+IHtcbiAgaWYgKFwiZnN0YXRcIiBpbiBEZW5vKSB7XG4gICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICByZXR1cm4gKERlbm8gYXMgYW55KS5mc3RhdChmaWxlLnJpZCk7XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xufVxuXG4vKiogRm9yIGEgZ2l2ZW4gQ29udGV4dCwgdHJ5IHRvIGRldGVybWluZSB0aGUgcmVzcG9uc2UgYm9keSBlbnRpdHkgdGhhdCBhbiBFVGFnXG4gKiBjYW4gYmUgY2FsY3VsYXRlZCBmcm9tLiAqL1xuLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbmV4cG9ydCBmdW5jdGlvbiBnZXRFbnRpdHk8UyBleHRlbmRzIFN0YXRlID0gUmVjb3JkPHN0cmluZywgYW55Pj4oXG4gIGNvbnRleHQ6IENvbnRleHQ8Uz4sXG4pOiBQcm9taXNlPHN0cmluZyB8IFVpbnQ4QXJyYXkgfCBEZW5vLkZpbGVJbmZvIHwgdW5kZWZpbmVkPiB7XG4gIGNvbnN0IHsgYm9keSB9ID0gY29udGV4dC5yZXNwb25zZTtcbiAgaWYgKGJvZHkgaW5zdGFuY2VvZiBEZW5vLkZzRmlsZSkge1xuICAgIHJldHVybiBmc3RhdChib2R5KTtcbiAgfVxuICBpZiAoYm9keSBpbnN0YW5jZW9mIFVpbnQ4QXJyYXkpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGJvZHkpO1xuICB9XG4gIGlmIChCT0RZX1RZUEVTLmluY2x1ZGVzKHR5cGVvZiBib2R5KSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoU3RyaW5nKGJvZHkpKTtcbiAgfVxuICBpZiAoaXNBc3luY0l0ZXJhYmxlKGJvZHkpIHx8IGlzUmVhZGVyKGJvZHkpKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuICB9XG4gIGlmICh0eXBlb2YgYm9keSA9PT0gXCJvYmplY3RcIiAmJiBib2R5ICE9PSBudWxsKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGJvZHlUZXh0ID0gSlNPTi5zdHJpbmdpZnkoYm9keSk7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGJvZHlUZXh0KTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIFdlIGRvbid0IHJlYWxseSBjYXJlIGFib3V0IGVycm9ycyBoZXJlXG4gICAgfVxuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcbn1cblxuLyoqXG4gKiBDYWxjdWxhdGUgYW4gRVRhZyB2YWx1ZSBmb3IgYW4gZW50aXR5LiBJZiB0aGUgZW50aXR5IGlzIGBGaWxlSW5mb2AsIHRoZW4gdGhlXG4gKiB0YWcgd2lsbCBkZWZhdWx0IHRvIGEgX3dlYWtfIEVUYWcuICBgb3B0aW9ucy53ZWFrYCBvdmVycmlkZXMgYW55IGRlZmF1bHRcbiAqIGJlaGF2aW9yIGluIGdlbmVyYXRpbmcgdGhlIHRhZy5cbiAqXG4gKiBAcGFyYW0gZW50aXR5IEEgc3RyaW5nLCBVaW50OEFycmF5LCBvciBmaWxlIGluZm8gdG8gdXNlIHRvIGdlbmVyYXRlIHRoZSBFVGFnXG4gKiBAcGFyYW0gb3B0aW9uc1xuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY2FsY3VsYXRlKFxuICBlbnRpdHk6IHN0cmluZyB8IFVpbnQ4QXJyYXkgfCBGaWxlSW5mbyxcbiAgb3B0aW9uczogRVRhZ09wdGlvbnMgPSB7fSxcbik6IFByb21pc2U8c3RyaW5nPiB7XG4gIGNvbnN0IHdlYWsgPSBvcHRpb25zLndlYWsgPz8gaXNGaWxlSW5mbyhlbnRpdHkpO1xuICBjb25zdCB0YWcgPSBpc0ZpbGVJbmZvKGVudGl0eSlcbiAgICA/IGNhbGNTdGF0VGFnKGVudGl0eSlcbiAgICA6IGF3YWl0IGNhbGNFbnRpdHlUYWcoZW50aXR5KTtcblxuICByZXR1cm4gd2VhayA/IGBXLyR7dGFnfWAgOiB0YWc7XG59XG5cbi8qKlxuICogQ3JlYXRlIG1pZGRsZXdhcmUgdGhhdCB3aWxsIGF0dGVtcHQgdG8gZGVjb2RlIHRoZSByZXNwb25zZS5ib2R5IGludG9cbiAqIHNvbWV0aGluZyB0aGF0IGNhbiBiZSB1c2VkIHRvIGdlbmVyYXRlIGFuIGBFVGFnYCBhbmQgYWRkIHRoZSBgRVRhZ2AgaGVhZGVyIHRvXG4gKiB0aGUgcmVzcG9uc2UuXG4gKi9cbi8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG5leHBvcnQgZnVuY3Rpb24gZmFjdG9yeTxTIGV4dGVuZHMgU3RhdGUgPSBSZWNvcmQ8c3RyaW5nLCBhbnk+PihcbiAgb3B0aW9ucz86IEVUYWdPcHRpb25zLFxuKTogTWlkZGxld2FyZTxTPiB7XG4gIHJldHVybiBhc3luYyBmdW5jdGlvbiBldGFnKGNvbnRleHQ6IENvbnRleHQ8Uz4sIG5leHQpIHtcbiAgICBhd2FpdCBuZXh0KCk7XG4gICAgaWYgKCFjb250ZXh0LnJlc3BvbnNlLmhlYWRlcnMuaGFzKFwiRVRhZ1wiKSkge1xuICAgICAgY29uc3QgZW50aXR5ID0gYXdhaXQgZ2V0RW50aXR5KGNvbnRleHQpO1xuICAgICAgaWYgKGVudGl0eSkge1xuICAgICAgICBjb250ZXh0LnJlc3BvbnNlLmhlYWRlcnMuc2V0KFwiRVRhZ1wiLCBhd2FpdCBjYWxjdWxhdGUoZW50aXR5LCBvcHRpb25zKSk7XG4gICAgICB9XG4gICAgfVxuICB9O1xufVxuXG4vKipcbiAqIEEgaGVscGVyIGZ1bmN0aW9uIHRoYXQgdGFrZXMgdGhlIHZhbHVlIGZyb20gdGhlIGBJZi1NYXRjaGAgaGVhZGVyIGFuZCBhblxuICogZW50aXR5IGFuZCByZXR1cm5zIGB0cnVlYCBpZiB0aGUgYEVUYWdgIGZvciB0aGUgZW50aXR5IG1hdGNoZXMgdGhlIHN1cHBsaWVkXG4gKiB2YWx1ZSwgb3RoZXJ3aXNlIGBmYWxzZWAuXG4gKlxuICogU2VlIE1ETidzIFtgSWYtTWF0Y2hgXShodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9IVFRQL0hlYWRlcnMvSWYtTWF0Y2gpXG4gKiBhcnRpY2xlIGZvciBtb3JlIGluZm9ybWF0aW9uIG9uIGhvdyB0byB1c2UgdGhpcyBmdW5jdGlvbi5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGlmTWF0Y2goXG4gIHZhbHVlOiBzdHJpbmcsXG4gIGVudGl0eTogc3RyaW5nIHwgVWludDhBcnJheSB8IEZpbGVJbmZvLFxuICBvcHRpb25zOiBFVGFnT3B0aW9ucyA9IHt9LFxuKTogUHJvbWlzZTxib29sZWFuPiB7XG4gIGNvbnN0IGV0YWcgPSBhd2FpdCBjYWxjdWxhdGUoZW50aXR5LCBvcHRpb25zKTtcbiAgLy8gV2VhayB0YWdzIGNhbm5vdCBiZSBtYXRjaGVkIGFuZCByZXR1cm4gZmFsc2UuXG4gIGlmIChldGFnLnN0YXJ0c1dpdGgoXCJXL1wiKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAodmFsdWUudHJpbSgpID09PSBcIipcIikge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIGNvbnN0IHRhZ3MgPSB2YWx1ZS5zcGxpdCgvXFxzKixcXHMqLyk7XG4gIHJldHVybiB0YWdzLmluY2x1ZGVzKGV0YWcpO1xufVxuXG4vKipcbiAqIEEgaGVscGVyIGZ1bmN0aW9uIHRoYXQgdGFrZXMgdGhlIHZhbHVlIGZyb20gdGhlIGBJZi1Oby1NYXRjaGAgaGVhZGVyIGFuZFxuICogYW4gZW50aXR5IGFuZCByZXR1cm5zIGBmYWxzZWAgaWYgdGhlIGBFVGFnYCBmb3IgdGhlIGVudGl0eSBtYXRjaGVzIHRoZVxuICogc3VwcGxpZWQgdmFsdWUsIG90aGVyd2lzZSBgZmFsc2VgLlxuICpcbiAqIFNlZSBNRE4ncyBbYElmLU5vbmUtTWF0Y2hgXShodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9IVFRQL0hlYWRlcnMvSWYtTm9uZS1NYXRjaClcbiAqIGFydGljbGUgZm9yIG1vcmUgaW5mb3JtYXRpb24gb24gaG93IHRvIHVzZSB0aGlzIGZ1bmN0aW9uLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaWZOb25lTWF0Y2goXG4gIHZhbHVlOiBzdHJpbmcsXG4gIGVudGl0eTogc3RyaW5nIHwgVWludDhBcnJheSB8IEZpbGVJbmZvLFxuICBvcHRpb25zOiBFVGFnT3B0aW9ucyA9IHt9LFxuKTogUHJvbWlzZTxib29sZWFuPiB7XG4gIGlmICh2YWx1ZS50cmltKCkgPT09IFwiKlwiKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNvbnN0IGV0YWcgPSBhd2FpdCBjYWxjdWxhdGUoZW50aXR5LCBvcHRpb25zKTtcbiAgY29uc3QgdGFncyA9IHZhbHVlLnNwbGl0KC9cXHMqLFxccyovKTtcbiAgcmV0dXJuICF0YWdzLmluY2x1ZGVzKGV0YWcpO1xufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLHlFQUF5RTtBQUV6RTs7OztDQUlDLEdBRUQsQUFFQSxTQUFTLE1BQU0sUUFBUSxZQUFZO0FBRW5DLFNBQVMsVUFBVSxFQUFFLGVBQWUsRUFBRSxRQUFRLFFBQVEsWUFBWTtBQWlCbEUsU0FBUyxXQUFXLEtBQWMsRUFBcUI7SUFDckQsT0FBTyxRQUNMLFNBQVMsT0FBTyxVQUFVLFlBQVksV0FBVyxTQUFTLFVBQVU7QUFFeEU7QUFFQSxTQUFTLFlBQVksTUFBZ0IsRUFBVTtJQUM3QyxNQUFNLFFBQVEsT0FBTyxLQUFLLEVBQUUsVUFBVSxRQUFRLENBQUMsT0FBTztJQUN0RCxNQUFNLE9BQU8sT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDO0lBRWxDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUM7QUFDN0I7QUFFQSxNQUFNLFVBQVUsSUFBSTtBQUVwQixlQUFlLGNBQWMsTUFBMkIsRUFBbUI7SUFDekUsSUFBSSxPQUFPLE1BQU0sS0FBSyxHQUFHO1FBQ3ZCLE9BQU8sQ0FBQyxnQ0FBZ0MsQ0FBQztJQUMzQyxDQUFDO0lBRUQsSUFBSSxPQUFPLFdBQVcsVUFBVTtRQUM5QixTQUFTLFFBQVEsTUFBTSxDQUFDO0lBQzFCLENBQUM7SUFFRCxNQUFNLE9BQU8sT0FBTyxNQUFN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