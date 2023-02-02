// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
/** A collection of HTTP errors and utilities.
 *
 * The export {@linkcode errors} contains an individual class that extends
 * {@linkcode HttpError} which makes handling HTTP errors in a structured way.
 *
 * The function {@linkcode createHttpError} provides a way to create instances
 * of errors in a factory pattern.
 *
 * The function {@linkcode isHttpError} is a type guard that will narrow a value
 * to an `HttpError` instance.
 *
 * ### Examples
 *
 * ```ts
 * import { errors, isHttpError } from "https://deno.land/std@$STD_VERSION/http/http_errors.ts";
 *
 * try {
 *   throw new errors.NotFound();
 * } catch (e) {
 *   if (isHttpError(e)) {
 *     const response = new Response(e.message, { status: e.status });
 *   } else {
 *     throw e;
 *   }
 * }
 * ```
 *
 * ```ts
 * import { createHttpError } from "https://deno.land/std@$STD_VERSION/http/http_errors.ts";
 * import { Status } from "https://deno.land/std@$STD_VERSION/http/http_status.ts";
 *
 * try {
 *   throw createHttpError(
 *     Status.BadRequest,
 *     "The request was bad.",
 *     { expose: false }
 *   );
 * } catch (e) {
 *   // handle errors
 * }
 * ```
 *
 * @module
 */ import { isClientErrorStatus, Status, STATUS_TEXT } from "./http_status.ts";
const ERROR_STATUS_MAP = {
    "BadRequest": 400,
    "Unauthorized": 401,
    "PaymentRequired": 402,
    "Forbidden": 403,
    "NotFound": 404,
    "MethodNotAllowed": 405,
    "NotAcceptable": 406,
    "ProxyAuthRequired": 407,
    "RequestTimeout": 408,
    "Conflict": 409,
    "Gone": 410,
    "LengthRequired": 411,
    "PreconditionFailed": 412,
    "RequestEntityTooLarge": 413,
    "RequestURITooLong": 414,
    "UnsupportedMediaType": 415,
    "RequestedRangeNotSatisfiable": 416,
    "ExpectationFailed": 417,
    "Teapot": 418,
    "MisdirectedRequest": 421,
    "UnprocessableEntity": 422,
    "Locked": 423,
    "FailedDependency": 424,
    "UpgradeRequired": 426,
    "PreconditionRequired": 428,
    "TooManyRequests": 429,
    "RequestHeaderFieldsTooLarge": 431,
    "UnavailableForLegalReasons": 451,
    "InternalServerError": 500,
    "NotImplemented": 501,
    "BadGateway": 502,
    "ServiceUnavailable": 503,
    "GatewayTimeout": 504,
    "HTTPVersionNotSupported": 505,
    "VariantAlsoNegotiates": 506,
    "InsufficientStorage": 507,
    "LoopDetected": 508,
    "NotExtended": 510,
    "NetworkAuthenticationRequired": 511
};
/** The base class that all derivative HTTP extend, providing a `status` and an
 * `expose` property. */ export class HttpError extends Error {
    #status = Status.InternalServerError;
    #expose;
    #headers;
    constructor(message = "Http Error", options){
        super(message, options);
        this.#expose = options?.expose === undefined ? isClientErrorStatus(this.status) : options.expose;
        if (options?.headers) {
            this.#headers = new Headers(options.headers);
        }
    }
    /** A flag to indicate if the internals of the error, like the stack, should
   * be exposed to a client, or if they are "private" and should not be leaked.
   * By default, all client errors are `true` and all server errors are
   * `false`. */ get expose() {
        return this.#expose;
    }
    /** The optional headers object that is set on the error. */ get headers() {
        return this.#headers;
    }
    /** The error status that is set on the error. */ get status() {
        return this.#status;
    }
}
function createHttpErrorConstructor(status) {
    const name = `${Status[status]}Error`;
    const ErrorCtor = class extends HttpError {
        constructor(message = STATUS_TEXT[status], options){
            super(message, options);
            Object.defineProperty(this, "name", {
                configurable: true,
                enumerable: false,
                value: name,
                writable: true
            });
        }
        get status() {
            return status;
        }
    };
    return ErrorCtor;
}
/** A map of HttpErrors that are unique instances for each HTTP error status
 * code.
 *
 * ### Example
 *
 * ```ts
 * import { errors } from "https://deno.land/std@$STD_VERSION/http/http_errors.ts";
 *
 * throw new errors.InternalServerError("Ooops!");
 * ```
 */ export const errors = {};
for (const [key, value] of Object.entries(ERROR_STATUS_MAP)){
    errors[key] = createHttpErrorConstructor(value);
}
/** Create an instance of an HttpError based on the status code provided. */ export function createHttpError(status = Status.InternalServerError, message, options) {
    return new errors[Status[status]](message, options);
}
/** A type guard that determines if the value is an HttpError or not. */ export function isHttpError(value) {
    return value instanceof HttpError;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE1Mi4wL2h0dHAvaHR0cF9lcnJvcnMudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IDIwMTgtMjAyMiB0aGUgRGVubyBhdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLiBNSVQgbGljZW5zZS5cblxuLyoqIEEgY29sbGVjdGlvbiBvZiBIVFRQIGVycm9ycyBhbmQgdXRpbGl0aWVzLlxuICpcbiAqIFRoZSBleHBvcnQge0BsaW5rY29kZSBlcnJvcnN9IGNvbnRhaW5zIGFuIGluZGl2aWR1YWwgY2xhc3MgdGhhdCBleHRlbmRzXG4gKiB7QGxpbmtjb2RlIEh0dHBFcnJvcn0gd2hpY2ggbWFrZXMgaGFuZGxpbmcgSFRUUCBlcnJvcnMgaW4gYSBzdHJ1Y3R1cmVkIHdheS5cbiAqXG4gKiBUaGUgZnVuY3Rpb24ge0BsaW5rY29kZSBjcmVhdGVIdHRwRXJyb3J9IHByb3ZpZGVzIGEgd2F5IHRvIGNyZWF0ZSBpbnN0YW5jZXNcbiAqIG9mIGVycm9ycyBpbiBhIGZhY3RvcnkgcGF0dGVybi5cbiAqXG4gKiBUaGUgZnVuY3Rpb24ge0BsaW5rY29kZSBpc0h0dHBFcnJvcn0gaXMgYSB0eXBlIGd1YXJkIHRoYXQgd2lsbCBuYXJyb3cgYSB2YWx1ZVxuICogdG8gYW4gYEh0dHBFcnJvcmAgaW5zdGFuY2UuXG4gKlxuICogIyMjIEV4YW1wbGVzXG4gKlxuICogYGBgdHNcbiAqIGltcG9ydCB7IGVycm9ycywgaXNIdHRwRXJyb3IgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9odHRwL2h0dHBfZXJyb3JzLnRzXCI7XG4gKlxuICogdHJ5IHtcbiAqICAgdGhyb3cgbmV3IGVycm9ycy5Ob3RGb3VuZCgpO1xuICogfSBjYXRjaCAoZSkge1xuICogICBpZiAoaXNIdHRwRXJyb3IoZSkpIHtcbiAqICAgICBjb25zdCByZXNwb25zZSA9IG5ldyBSZXNwb25zZShlLm1lc3NhZ2UsIHsgc3RhdHVzOiBlLnN0YXR1cyB9KTtcbiAqICAgfSBlbHNlIHtcbiAqICAgICB0aHJvdyBlO1xuICogICB9XG4gKiB9XG4gKiBgYGBcbiAqXG4gKiBgYGB0c1xuICogaW1wb3J0IHsgY3JlYXRlSHR0cEVycm9yIH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAkU1REX1ZFUlNJT04vaHR0cC9odHRwX2Vycm9ycy50c1wiO1xuICogaW1wb3J0IHsgU3RhdHVzIH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAkU1REX1ZFUlNJT04vaHR0cC9odHRwX3N0YXR1cy50c1wiO1xuICpcbiAqIHRyeSB7XG4gKiAgIHRocm93IGNyZWF0ZUh0dHBFcnJvcihcbiAqICAgICBTdGF0dXMuQmFkUmVxdWVzdCxcbiAqICAgICBcIlRoZSByZXF1ZXN0IHdhcyBiYWQuXCIsXG4gKiAgICAgeyBleHBvc2U6IGZhbHNlIH1cbiAqICAgKTtcbiAqIH0gY2F0Y2ggKGUpIHtcbiAqICAgLy8gaGFuZGxlIGVycm9yc1xuICogfVxuICogYGBgXG4gKlxuICogQG1vZHVsZVxuICovXG5cbmltcG9ydCB7XG4gIHR5cGUgRXJyb3JTdGF0dXMsXG4gIGlzQ2xpZW50RXJyb3JTdGF0dXMsXG4gIFN0YXR1cyxcbiAgU1RBVFVTX1RFWFQsXG59IGZyb20gXCIuL2h0dHBfc3RhdHVzLnRzXCI7XG5cbmNvbnN0IEVSUk9SX1NUQVRVU19NQVAgPSB7XG4gIFwiQmFkUmVxdWVzdFwiOiA0MDAsXG4gIFwiVW5hdXRob3JpemVkXCI6IDQwMSxcbiAgXCJQYXltZW50UmVxdWlyZWRcIjogNDAyLFxuICBcIkZvcmJpZGRlblwiOiA0MDMsXG4gIFwiTm90Rm91bmRcIjogNDA0LFxuICBcIk1ldGhvZE5vdEFsbG93ZWRcIjogNDA1LFxuICBcIk5vdEFjY2VwdGFibGVcIjogNDA2LFxuICBcIlByb3h5QXV0aFJlcXVpcmVkXCI6IDQwNyxcbiAgXCJSZXF1ZXN0VGltZW91dFwiOiA0MDgsXG4gIFwiQ29uZmxpY3RcIjogNDA5LFxuICBcIkdvbmVcIjogNDEwLFxuICBcIkxlbmd0aFJlcXVpcmVkXCI6IDQxMSxcbiAgXCJQcmVjb25kaXRpb25GYWlsZWRcIjogNDEyLFxuICBcIlJlcXVlc3RFbnRpdHlUb29MYXJnZVwiOiA0MTMsXG4gIFwiUmVxdWVzdFVSSVRvb0xvbmdcIjogNDE0LFxuICBcIlVuc3VwcG9ydGVkTWVkaWFUeXBlXCI6IDQxNSxcbiAgXCJSZXF1ZXN0ZWRSYW5nZU5vdFNhdGlzZmlhYmxlXCI6IDQxNixcbiAgXCJFeHBlY3RhdGlvbkZhaWxlZFwiOiA0MTcsXG4gIFwiVGVhcG90XCI6IDQxOCxcbiAgXCJNaXNkaXJlY3RlZFJlcXVlc3RcIjogNDIxLFxuICBcIlVucHJvY2Vzc2FibGVFbnRpdHlcIjogNDIyLFxuICBcIkxvY2tlZFwiOiA0MjMsXG4gIFwiRmFpbGVkRGVwZW5kZW5jeVwiOiA0MjQsXG4gIFwiVXBncmFkZVJlcXVpcmVkXCI6IDQyNixcbiAgXCJQcmVjb25kaXRpb25SZXF1aXJlZFwiOiA0MjgsXG4gIFwiVG9vTWFueVJlcXVlc3RzXCI6IDQyOSxcbiAgXCJSZXF1ZXN0SGVhZGVyRmllbGRzVG9vTGFyZ2VcIjogNDMxLFxuICBcIlVuYXZhaWxhYmxlRm9yTGVnYWxSZWFzb25zXCI6IDQ1MSxcbiAgXCJJbnRlcm5hbFNlcnZlckVycm9yXCI6IDUwMCxcbiAgXCJOb3RJbXBsZW1lbnRlZFwiOiA1MDEsXG4gIFwiQmFkR2F0ZXdheVwiOiA1MDIsXG4gIFwiU2VydmljZVVuYXZhaWxhYmxlXCI6IDUwMyxcbiAgXCJHYXRld2F5VGltZW91dFwiOiA1MDQsXG4gIFwiSFRUUFZlcnNpb25Ob3RTdXBwb3J0ZWRcIjogNTA1LFxuICBcIlZhcmlhbnRBbHNvTmVnb3RpYXRlc1wiOiA1MDYsXG4gIFwiSW5zdWZmaWNpZW50U3RvcmFnZVwiOiA1MDcsXG4gIFwiTG9vcERldGVjdGVkXCI6IDUwOCxcbiAgXCJOb3RFeHRlbmRlZFwiOiA1MTAsXG4gIFwiTmV0d29ya0F1dGhlbnRpY2F0aW9uUmVxdWlyZWRcIjogNTExLFxufSBhcyBjb25zdDtcblxuZXhwb3J0IHR5cGUgRXJyb3JTdGF0dXNLZXlzID0ga2V5b2YgdHlwZW9mIEVSUk9SX1NUQVRVU19NQVA7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSHR0cEVycm9yT3B0aW9ucyBleHRlbmRzIEVycm9yT3B0aW9ucyB7XG4gIGV4cG9zZT86IGJvb2xlYW47XG4gIGhlYWRlcnM/OiBIZWFkZXJzSW5pdDtcbn1cblxuLyoqIFRoZSBiYXNlIGNsYXNzIHRoYXQgYWxsIGRlcml2YXRpdmUgSFRUUCBleHRlbmQsIHByb3ZpZGluZyBhIGBzdGF0dXNgIGFuZCBhblxuICogYGV4cG9zZWAgcHJvcGVydHkuICovXG5leHBvcnQgY2xhc3MgSHR0cEVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICAjc3RhdHVzOiBFcnJvclN0YXR1cyA9IFN0YXR1cy5JbnRlcm5hbFNlcnZlckVycm9yO1xuICAjZXhwb3NlOiBib29sZWFuO1xuICAjaGVhZGVycz86IEhlYWRlcnM7XG4gIGNvbnN0cnVjdG9yKFxuICAgIG1lc3NhZ2UgPSBcIkh0dHAgRXJyb3JcIixcbiAgICBvcHRpb25zPzogSHR0cEVycm9yT3B0aW9ucyxcbiAgKSB7XG4gICAgc3VwZXIobWVzc2FnZSwgb3B0aW9ucyk7XG4gICAgdGhpcy4jZXhwb3NlID0gb3B0aW9ucz8uZXhwb3NlID09PSB1bmRlZmluZWRcbiAgICAgID8gaXNDbGllbnRFcnJvclN0YXR1cyh0aGlzLnN0YXR1cylcbiAgICAgIDogb3B0aW9ucy5leHBvc2U7XG4gICAgaWYgKG9wdGlvbnM/LmhlYWRlcnMpIHtcbiAgICAgIHRoaXMuI2hlYWRlcnMgPSBuZXcgSGVhZGVycyhvcHRpb25zLmhlYWRlcnMpO1xuICAgIH1cbiAgfVxuICAvKiogQSBmbGFnIHRvIGluZGljYXRlIGlmIHRoZSBpbnRlcm5hbHMgb2YgdGhlIGVycm9yLCBsaWtlIHRoZSBzdGFjaywgc2hvdWxkXG4gICAqIGJlIGV4cG9zZWQgdG8gYSBjbGllbnQsIG9yIGlmIHRoZXkgYXJlIFwicHJpdmF0ZVwiIGFuZCBzaG91bGQgbm90IGJlIGxlYWtlZC5cbiAgICogQnkgZGVmYXVsdCwgYWxsIGNsaWVudCBlcnJvcnMgYXJlIGB0cnVlYCBhbmQgYWxsIHNlcnZlciBlcnJvcnMgYXJlXG4gICAqIGBmYWxzZWAuICovXG4gIGdldCBleHBvc2UoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuI2V4cG9zZTtcbiAgfVxuICAvKiogVGhlIG9wdGlvbmFsIGhlYWRlcnMgb2JqZWN0IHRoYXQgaXMgc2V0IG9uIHRoZSBlcnJvci4gKi9cbiAgZ2V0IGhlYWRlcnMoKTogSGVhZGVycyB8IHVuZGVmaW5lZCB7XG4gICAgcmV0dXJuIHRoaXMuI2hlYWRlcnM7XG4gIH1cbiAgLyoqIFRoZSBlcnJvciBzdGF0dXMgdGhhdCBpcyBzZXQgb24gdGhlIGVycm9yLiAqL1xuICBnZXQgc3RhdHVzKCk6IEVycm9yU3RhdHVzIHtcbiAgICByZXR1cm4gdGhpcy4jc3RhdHVzO1xuICB9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUh0dHBFcnJvckNvbnN0cnVjdG9yKHN0YXR1czogRXJyb3JTdGF0dXMpOiB0eXBlb2YgSHR0cEVycm9yIHtcbiAgY29uc3QgbmFtZSA9IGAke1N0YXR1c1tzdGF0dXNdfUVycm9yYDtcbiAgY29uc3QgRXJyb3JDdG9yID0gY2xhc3MgZXh0ZW5kcyBIdHRwRXJyb3Ige1xuICAgIGNvbnN0cnVjdG9yKFxuICAgICAgbWVzc2FnZSA9IFNUQVRVU19URVhUW3N0YXR1c10sXG4gICAgICBvcHRpb25zPzogSHR0cEVycm9yT3B0aW9ucyxcbiAgICApIHtcbiAgICAgIHN1cGVyKG1lc3NhZ2UsIG9wdGlvbnMpO1xuICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIFwibmFtZVwiLCB7XG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgICAgICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgICAgIHZhbHVlOiBuYW1lLFxuICAgICAgICB3cml0YWJsZTogdHJ1ZSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIG92ZXJyaWRlIGdldCBzdGF0dXMoKSB7XG4gICAgICByZXR1cm4gc3RhdHVzO1xuICAgIH1cbiAgfTtcbiAgcmV0dXJuIEVycm9yQ3Rvcjtcbn1cblxuLyoqIEEgbWFwIG9mIEh0dHBFcnJvcnMgdGhhdCBhcmUgdW5pcXVlIGluc3RhbmNlcyBmb3IgZWFjaCBIVFRQIGVycm9yIHN0YXR1c1xuICogY29kZS5cbiAqXG4gKiAjIyMgRXhhbXBsZVxuICpcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBlcnJvcnMgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQCRTVERfVkVSU0lPTi9odHRwL2h0dHBfZXJyb3JzLnRzXCI7XG4gKlxuICogdGhyb3cgbmV3IGVycm9ycy5JbnRlcm5hbFNlcnZlckVycm9yKFwiT29vcHMhXCIpO1xuICogYGBgXG4gKi9cbmV4cG9ydCBjb25zdCBlcnJvcnM6IFJlY29yZDxFcnJvclN0YXR1c0tleXMsIHR5cGVvZiBIdHRwRXJyb3I+ID0ge30gYXMgUmVjb3JkPFxuICBFcnJvclN0YXR1c0tleXMsXG4gIHR5cGVvZiBIdHRwRXJyb3Jcbj47XG5cbmZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKEVSUk9SX1NUQVRVU19NQVApKSB7XG4gIGVycm9yc1trZXkgYXMgRXJyb3JTdGF0dXNLZXlzXSA9IGNyZWF0ZUh0dHBFcnJvckNvbnN0cnVjdG9yKHZhbHVlKTtcbn1cblxuLyoqIENyZWF0ZSBhbiBpbnN0YW5jZSBvZiBhbiBIdHRwRXJyb3IgYmFzZWQgb24gdGhlIHN0YXR1cyBjb2RlIHByb3ZpZGVkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUh0dHBFcnJvcihcbiAgc3RhdHVzOiBFcnJvclN0YXR1cyA9IFN0YXR1cy5JbnRlcm5hbFNlcnZlckVycm9yLFxuICBtZXNzYWdlPzogc3RyaW5nLFxuICBvcHRpb25zPzogSHR0cEVycm9yT3B0aW9ucyxcbik6IEh0dHBFcnJvciB7XG4gIHJldHVybiBuZXcgZXJyb3JzW1N0YXR1c1tzdGF0dXNdIGFzIEVycm9yU3RhdHVzS2V5c10obWVzc2FnZSwgb3B0aW9ucyk7XG59XG5cbi8qKiBBIHR5cGUgZ3VhcmQgdGhhdCBkZXRlcm1pbmVzIGlmIHRoZSB2YWx1ZSBpcyBhbiBIdHRwRXJyb3Igb3Igbm90LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzSHR0cEVycm9yKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgSHR0cEVycm9yIHtcbiAgcmV0dXJuIHZhbHVlIGluc3RhbmNlb2YgSHR0cEVycm9yO1xufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDBFQUEwRTtBQUUxRTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztDQTJDQyxHQUVELFNBRUUsbUJBQW1CLEVBQ25CLE1BQU0sRUFDTixXQUFXLFFBQ04sbUJBQW1CO0FBRTFCLE1BQU0sbUJBQW1CO0lBQ3ZCLGNBQWM7SUFDZCxnQkFBZ0I7SUFDaEIsbUJBQW1CO0lBQ25CLGFBQWE7SUFDYixZQUFZO0lBQ1osb0JBQW9CO0lBQ3BCLGlCQUFpQjtJQUNqQixxQkFBcUI7SUFDckIsa0JBQWtCO0lBQ2xCLFlBQVk7SUFDWixRQUFRO0lBQ1Isa0JBQWtCO0lBQ2xCLHNCQUFzQjtJQUN0Qix5QkFBeUI7SUFDekIscUJBQXFCO0lBQ3JCLHdCQUF3QjtJQUN4QixnQ0FBZ0M7SUFDaEMscUJBQXFCO0lBQ3JCLFVBQVU7SUFDVixzQkFBc0I7SUFDdEIsdUJBQXVCO0lBQ3ZCLFVBQVU7SUFDVixvQkFBb0I7SUFDcEIsbUJBQW1CO0lBQ25CLHdCQUF3QjtJQUN4QixtQkFBbUI7SUFDbkIsK0JBQStCO0lBQy9CLDhCQUE4QjtJQUM5Qix1QkFBdUI7SUFDdkIsa0JBQWtCO0lBQ2xCLGNBQWM7SUFDZCxzQkFBc0I7SUFDdEIsa0JBQWtCO0lBQ2xCLDJCQUEyQjtJQUMzQix5QkFBeUI7SUFDekIsdUJBQXVCO0lBQ3ZCLGdCQUFnQjtJQUNoQixlQUFlO0lBQ2YsaUNBQWlDO0FBQ25DO0FBU0E7c0JBQ3NCLEdBQ3RCLE9BQU8sTUFBTSxrQkFBa0I7SUFDN0IsQ0FBQyxNQUFNLEdBQWdCLE9BQU8sbUJBQW1CLENBQUM7SUFDbEQsQ0FBQyxNQUFNLENBQVU7SUFDakIsQ0FBQyxPQUFPLENBQVc7SUFDbkIsWUFDRSxVQUFVLFlBQVksRUFDdEIsT0FBMEIsQ0FDMUI7UUFDQSxLQUFLLENBQUMsU0FBUztRQUNmLElBQUksQ0FBQyxDQUFDLE1BQU0sR0FBRyxTQUFTLFdBQVcsWUFDL0Isb0JBQW9CLElBQUksQ0FBQyxNQUFNLElBQy9CLFFBQVEsTUFBTTtRQUNsQixJQUFJLFNBQVMsU0FBUztZQUNwQixJQUFJLENBQUMsQ0FBQyxPQUFPLEdBQUcsSUFBSSxRQUFRLFFBQVEsT0FBTztRQUM3QyxDQUFDO0lBQ0g7SUFDQTs7O2NBR1ksR0FDWixJQUFJLFNBQWtCO1FBQ3BCLE9BQU8sSUFBSSxDQUFDLENBQUMsTUFBTTtJQUNyQjtJQUNBLDBEQUEwRCxHQUMxRCxJQUFJLFVBQStCO1FBQ2pDLE9BQU8sSUFBSSxDQUFDLENBQUMsT0FBTztJQUN0QjtJQUNBLCtDQUErQyxHQUMvQyxJQUFJLFNBQXNCO1FBQ3hCLE9BQU8sSUFBSSxDQUFDLENBQUMsTUFBTTtJQUNyQjtBQUNGLENBQUM7QUFFRCxTQUFTLDJCQUEyQixNQUFtQixFQUFvQjtJQUN6RSxNQUFNLE9BQU8sQ0FBQyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDO0lBQ3JDLE1BQU0sWUFBWSxjQUFjO1FBQzlCLFlBQ0UsVUFBVSxXQUFXLENBQUMsT0FBTyxFQUM3QixPQUEwQixDQUMxQjtZQUNBLEtBQUssQ0FBQyxTQUFTO1lBQ2YsT0FBTyxjQUFjLENBQUMsSUFBSSxFQUFFLFFBQVE7Z0JBQ2xDLGNBQWMsSUFBSTtnQkFDbEIsWUFBWSxLQUFLO2dCQUNqQixPQUFPO2dCQUNQLFVBQVUsSUFBSTtZQUNoQjtRQUNGO1FBRUEsSUFBYSxTQUFTO1lBQ3BCLE9BQU87UUFDVDtJQUNGO0lBQ0EsT0FBTztBQUNUO0FBRUE7Ozs7Ozs7Ozs7Q0FVQyxHQUNELE9BQU8sTUFBTSxTQUFvRCxDQUFDLEVBR2hFO0FBRUYsS0FBSyxNQUFNLENBQUMsS0FBSyxNQUFNLElBQUksT0FBTyxPQUFPLENBQUMsa0JBQW1CO0lBQzNELE1BQU0sQ0FBQyxJQUF1QixHQUFHLDJCQUEyQjtBQUM5RDtBQUVBLDBFQUEwRSxHQUMxRSxPQUFPLFNBQVMsZ0JBQ2QsU0FBc0IsT0FBTyxtQkFBbUIsRUFDaEQsT0FBZ0IsRUFDaEIsT0FBMEIsRUFDZjtJQUNYLE9BQU8sSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBb0IsQ0FBQyxTQUFTO0FBQ2hFLENBQUM7QUFFRCxzRUFBc0UsR0FDdEUsT0FBTyxTQUFTLFlBQVksS0FBYyxFQUFzQjtJQUM5RCxPQUFPLGlCQUFpQjtBQUMxQixDQUFDIn0=