// Copyright 2018-2022 the oak authors. All rights reserved. MIT license.
// deno-lint-ignore-file no-explicit-any
/**
 * A collection of utility APIs which can make testing of an oak application
 * easier.
 *
 * @module
 */ import { accepts, createHttpError } from "./deps.ts";
import { Cookies } from "./cookies.ts";
import { Response } from "./response.ts";
/** Creates a mock of `Application`. */ export function createMockApp(state = {}) {
    const app = {
        state,
        use () {
            return app;
        },
        [Symbol.for("Deno.customInspect")] () {
            return "MockApplication {}";
        },
        [Symbol.for("nodejs.util.inspect.custom")] (depth, options, inspect) {
            if (depth < 0) {
                return options.stylize(`[MockApplication]`, "special");
            }
            const newOptions = Object.assign({}, options, {
                depth: options.depth === null ? null : options.depth - 1
            });
            return `${options.stylize("MockApplication", "special")} ${inspect({}, newOptions)}`;
        }
    };
    return app;
}
/** Allows external parties to modify the context state. */ export const mockContextState = {
    /** Adjusts the return value of the `acceptedEncodings` in the context's
   * `request` object. */ encodingsAccepted: "identity"
};
/** Create a mock of `Context` or `RouterContext`. */ export function createMockContext({ ip ="127.0.0.1" , method ="GET" , params , path ="/" , state , app =createMockApp(state) , headers: requestHeaders  } = {}) {
    function createMockRequest() {
        const headers = new Headers(requestHeaders);
        return {
            accepts (...types) {
                if (!headers.has("Accept")) {
                    return;
                }
                if (types.length) {
                    return accepts({
                        headers
                    }, ...types);
                }
                return accepts({
                    headers
                });
            },
            acceptsEncodings () {
                return mockContextState.encodingsAccepted;
            },
            headers,
            ip,
            method,
            path,
            search: undefined,
            searchParams: new URLSearchParams(),
            url: new URL(path, "http://localhost/")
        };
    }
    const request = createMockRequest();
    const response = new Response(request);
    const cookies = new Cookies(request, response);
    return {
        app,
        params,
        request,
        cookies,
        response,
        state: Object.assign({}, app.state),
        assert (condition, errorStatus = 500, message, props) {
            if (condition) {
                return;
            }
            const err = createHttpError(errorStatus, message);
            if (props) {
                Object.assign(err, props);
            }
            throw err;
        },
        throw (errorStatus, message, props) {
            const err = createHttpError(errorStatus, message);
            if (props) {
                Object.assign(err, props);
            }
            throw err;
        },
        [Symbol.for("Deno.customInspect")] () {
            return `MockContext {}`;
        },
        [Symbol.for("nodejs.util.inspect.custom")] (depth, options, inspect) {
            if (depth < 0) {
                return options.stylize(`[MockContext]`, "special");
            }
            const newOptions = Object.assign({}, options, {
                depth: options.depth === null ? null : options.depth - 1
            });
            return `${options.stylize("MockContext", "special")} ${inspect({}, newOptions)}`;
        }
    };
}
/** Creates a mock `next()` function which can be used when calling
 * middleware. */ export function createMockNext() {
    return async function next() {};
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMS4xLjAvdGVzdGluZy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBvYWsgYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG5cbi8vIGRlbm8tbGludC1pZ25vcmUtZmlsZSBuby1leHBsaWNpdC1hbnlcblxuLyoqXG4gKiBBIGNvbGxlY3Rpb24gb2YgdXRpbGl0eSBBUElzIHdoaWNoIGNhbiBtYWtlIHRlc3Rpbmcgb2YgYW4gb2FrIGFwcGxpY2F0aW9uXG4gKiBlYXNpZXIuXG4gKlxuICogQG1vZHVsZVxuICovXG5cbmltcG9ydCB0eXBlIHsgQXBwbGljYXRpb24sIFN0YXRlIH0gZnJvbSBcIi4vYXBwbGljYXRpb24udHNcIjtcbmltcG9ydCB7IGFjY2VwdHMsIGNyZWF0ZUh0dHBFcnJvciB9IGZyb20gXCIuL2RlcHMudHNcIjtcbmltcG9ydCB0eXBlIHsgUm91dGVQYXJhbXMsIFJvdXRlckNvbnRleHQgfSBmcm9tIFwiLi9yb3V0ZXIudHNcIjtcbmltcG9ydCB0eXBlIHsgRXJyb3JTdGF0dXMgfSBmcm9tIFwiLi90eXBlcy5kLnRzXCI7XG5pbXBvcnQgeyBDb29raWVzIH0gZnJvbSBcIi4vY29va2llcy50c1wiO1xuaW1wb3J0IHsgUmVxdWVzdCB9IGZyb20gXCIuL3JlcXVlc3QudHNcIjtcbmltcG9ydCB7IFJlc3BvbnNlIH0gZnJvbSBcIi4vcmVzcG9uc2UudHNcIjtcblxuLyoqIENyZWF0ZXMgYSBtb2NrIG9mIGBBcHBsaWNhdGlvbmAuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTW9ja0FwcDxcbiAgUyBleHRlbmRzIFJlY29yZDxzdHJpbmcgfCBudW1iZXIgfCBzeW1ib2wsIGFueT4gPSBSZWNvcmQ8c3RyaW5nLCBhbnk+LFxuPihcbiAgc3RhdGUgPSB7fSBhcyBTLFxuKTogQXBwbGljYXRpb248Uz4ge1xuICBjb25zdCBhcHAgPSB7XG4gICAgc3RhdGUsXG4gICAgdXNlKCkge1xuICAgICAgcmV0dXJuIGFwcDtcbiAgICB9LFxuICAgIFtTeW1ib2wuZm9yKFwiRGVuby5jdXN0b21JbnNwZWN0XCIpXSgpIHtcbiAgICAgIHJldHVybiBcIk1vY2tBcHBsaWNhdGlvbiB7fVwiO1xuICAgIH0sXG4gICAgW1N5bWJvbC5mb3IoXCJub2RlanMudXRpbC5pbnNwZWN0LmN1c3RvbVwiKV0oXG4gICAgICBkZXB0aDogbnVtYmVyLFxuICAgICAgb3B0aW9uczogYW55LFxuICAgICAgaW5zcGVjdDogKHZhbHVlOiB1bmtub3duLCBvcHRpb25zPzogdW5rbm93bikgPT4gc3RyaW5nLFxuICAgICkge1xuICAgICAgaWYgKGRlcHRoIDwgMCkge1xuICAgICAgICByZXR1cm4gb3B0aW9ucy5zdHlsaXplKGBbTW9ja0FwcGxpY2F0aW9uXWAsIFwic3BlY2lhbFwiKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgbmV3T3B0aW9ucyA9IE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIHtcbiAgICAgICAgZGVwdGg6IG9wdGlvbnMuZGVwdGggPT09IG51bGwgPyBudWxsIDogb3B0aW9ucy5kZXB0aCAtIDEsXG4gICAgICB9KTtcbiAgICAgIHJldHVybiBgJHtvcHRpb25zLnN0eWxpemUoXCJNb2NrQXBwbGljYXRpb25cIiwgXCJzcGVjaWFsXCIpfSAke1xuICAgICAgICBpbnNwZWN0KHt9LCBuZXdPcHRpb25zKVxuICAgICAgfWA7XG4gICAgfSxcbiAgfSBhcyBhbnk7XG4gIHJldHVybiBhcHA7XG59XG5cbi8qKiBPcHRpb25zIHRoYXQgY2FuIGJlIHNldCBpbiBhIG1vY2sgY29udGV4dC4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgTW9ja0NvbnRleHRPcHRpb25zPFxuICBSIGV4dGVuZHMgc3RyaW5nLFxuICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8Uj4gPSBSb3V0ZVBhcmFtczxSPixcbiAgUyBleHRlbmRzIFN0YXRlID0gUmVjb3JkPHN0cmluZywgYW55Pixcbj4ge1xuICBhcHA/OiBBcHBsaWNhdGlvbjxTPjtcbiAgaXA/OiBzdHJpbmc7XG4gIG1ldGhvZD86IHN0cmluZztcbiAgcGFyYW1zPzogUDtcbiAgcGF0aD86IHN0cmluZztcbiAgc3RhdGU/OiBTO1xuICBoZWFkZXJzPzogW3N0cmluZywgc3RyaW5nXVtdO1xufVxuXG4vKiogQWxsb3dzIGV4dGVybmFsIHBhcnRpZXMgdG8gbW9kaWZ5IHRoZSBjb250ZXh0IHN0YXRlLiAqL1xuZXhwb3J0IGNvbnN0IG1vY2tDb250ZXh0U3RhdGUgPSB7XG4gIC8qKiBBZGp1c3RzIHRoZSByZXR1cm4gdmFsdWUgb2YgdGhlIGBhY2NlcHRlZEVuY29kaW5nc2AgaW4gdGhlIGNvbnRleHQnc1xuICAgKiBgcmVxdWVzdGAgb2JqZWN0LiAqL1xuICBlbmNvZGluZ3NBY2NlcHRlZDogXCJpZGVudGl0eVwiLFxufTtcblxuLyoqIENyZWF0ZSBhIG1vY2sgb2YgYENvbnRleHRgIG9yIGBSb3V0ZXJDb250ZXh0YC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVNb2NrQ29udGV4dDxcbiAgUiBleHRlbmRzIHN0cmluZyxcbiAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPFI+ID0gUm91dGVQYXJhbXM8Uj4sXG4gIFMgZXh0ZW5kcyBTdGF0ZSA9IFJlY29yZDxzdHJpbmcsIGFueT4sXG4+KFxuICB7XG4gICAgaXAgPSBcIjEyNy4wLjAuMVwiLFxuICAgIG1ldGhvZCA9IFwiR0VUXCIsXG4gICAgcGFyYW1zLFxuICAgIHBhdGggPSBcIi9cIixcbiAgICBzdGF0ZSxcbiAgICBhcHAgPSBjcmVhdGVNb2NrQXBwKHN0YXRlKSxcbiAgICBoZWFkZXJzOiByZXF1ZXN0SGVhZGVycyxcbiAgfTogTW9ja0NvbnRleHRPcHRpb25zPFI+ID0ge30sXG4pIHtcbiAgZnVuY3Rpb24gY3JlYXRlTW9ja1JlcXVlc3QoKTogUmVxdWVzdCB7XG4gICAgY29uc3QgaGVhZGVycyA9IG5ldyBIZWFkZXJzKHJlcXVlc3RIZWFkZXJzKTtcbiAgICByZXR1cm4ge1xuICAgICAgYWNjZXB0cyguLi50eXBlczogc3RyaW5nW10pIHtcbiAgICAgICAgaWYgKCFoZWFkZXJzLmhhcyhcIkFjY2VwdFwiKSkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAodHlwZXMubGVuZ3RoKSB7XG4gICAgICAgICAgcmV0dXJuIGFjY2VwdHMoeyBoZWFkZXJzIH0sIC4uLnR5cGVzKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYWNjZXB0cyh7IGhlYWRlcnMgfSk7XG4gICAgICB9LFxuICAgICAgYWNjZXB0c0VuY29kaW5ncygpIHtcbiAgICAgICAgcmV0dXJuIG1vY2tDb250ZXh0U3RhdGUuZW5jb2RpbmdzQWNjZXB0ZWQ7XG4gICAgICB9LFxuICAgICAgaGVhZGVycyxcbiAgICAgIGlwLFxuICAgICAgbWV0aG9kLFxuICAgICAgcGF0aCxcbiAgICAgIHNlYXJjaDogdW5kZWZpbmVkLFxuICAgICAgc2VhcmNoUGFyYW1zOiBuZXcgVVJMU2VhcmNoUGFyYW1zKCksXG4gICAgICB1cmw6IG5ldyBVUkwocGF0aCwgXCJodHRwOi8vbG9jYWxob3N0L1wiKSxcbiAgICB9IGFzIGFueTtcbiAgfVxuXG4gIGNvbnN0IHJlcXVlc3QgPSBjcmVhdGVNb2NrUmVxdWVzdCgpO1xuICBjb25zdCByZXNwb25zZSA9IG5ldyBSZXNwb25zZShyZXF1ZXN0KTtcbiAgY29uc3QgY29va2llcyA9IG5ldyBDb29raWVzKHJlcXVlc3QsIHJlc3BvbnNlKTtcblxuICByZXR1cm4gKHtcbiAgICBhcHAsXG4gICAgcGFyYW1zLFxuICAgIHJlcXVlc3QsXG4gICAgY29va2llcyxcbiAgICByZXNwb25zZSxcbiAgICBzdGF0ZTogT2JqZWN0LmFzc2lnbih7fSwgYXBwLnN0YXRlKSxcbiAgICBhc3NlcnQoXG4gICAgICBjb25kaXRpb246IGFueSxcbiAgICAgIGVycm9yU3RhdHVzOiBFcnJvclN0YXR1cyA9IDUwMCxcbiAgICAgIG1lc3NhZ2U/OiBzdHJpbmcsXG4gICAgICBwcm9wcz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+LFxuICAgICk6IGFzc2VydHMgY29uZGl0aW9uIHtcbiAgICAgIGlmIChjb25kaXRpb24pIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgZXJyID0gY3JlYXRlSHR0cEVycm9yKGVycm9yU3RhdHVzLCBtZXNzYWdlKTtcbiAgICAgIGlmIChwcm9wcykge1xuICAgICAgICBPYmplY3QuYXNzaWduKGVyciwgcHJvcHMpO1xuICAgICAgfVxuICAgICAgdGhyb3cgZXJyO1xuICAgIH0sXG4gICAgdGhyb3coXG4gICAgICBlcnJvclN0YXR1czogRXJyb3JTdGF0dXMsXG4gICAgICBtZXNzYWdlPzogc3RyaW5nLFxuICAgICAgcHJvcHM/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPixcbiAgICApOiBuZXZlciB7XG4gICAgICBjb25zdCBlcnIgPSBjcmVhdGVIdHRwRXJyb3IoZXJyb3JTdGF0dXMsIG1lc3NhZ2UpO1xuICAgICAgaWYgKHByb3BzKSB7XG4gICAgICAgIE9iamVjdC5hc3NpZ24oZXJyLCBwcm9wcyk7XG4gICAgICB9XG4gICAgICB0aHJvdyBlcnI7XG4gICAgfSxcbiAgICBbU3ltYm9sLmZvcihcIkRlbm8uY3VzdG9tSW5zcGVjdFwiKV0oKSB7XG4gICAgICByZXR1cm4gYE1vY2tDb250ZXh0IHt9YDtcbiAgICB9LFxuICAgIFtTeW1ib2wuZm9yKFwibm9kZWpzLnV0aWwuaW5zcGVjdC5jdXN0b21cIildKFxuICAgICAgZGVwdGg6IG51bWJlcixcbiAgICAgIG9wdGlvbnM6IGFueSxcbiAgICAgIGluc3BlY3Q6ICh2YWx1ZTogdW5rbm93biwgb3B0aW9ucz86IHVua25vd24pID0+IHN0cmluZyxcbiAgICApIHtcbiAgICAgIGlmIChkZXB0aCA8IDApIHtcbiAgICAgICAgcmV0dXJuIG9wdGlvbnMuc3R5bGl6ZShgW01vY2tDb250ZXh0XWAsIFwic3BlY2lhbFwiKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgbmV3T3B0aW9ucyA9IE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIHtcbiAgICAgICAgZGVwdGg6IG9wdGlvbnMuZGVwdGggPT09IG51bGwgPyBudWxsIDogb3B0aW9ucy5kZXB0aCAtIDEsXG4gICAgICB9KTtcbiAgICAgIHJldHVybiBgJHtvcHRpb25zLnN0eWxpemUoXCJNb2NrQ29udGV4dFwiLCBcInNwZWNpYWxcIil9ICR7XG4gICAgICAgIGluc3BlY3Qoe30sIG5ld09wdGlvbnMpXG4gICAgICB9YDtcbiAgICB9LFxuICB9IGFzIHVua25vd24pIGFzIFJvdXRlckNvbnRleHQ8UiwgUCwgUz47XG59XG5cbi8qKiBDcmVhdGVzIGEgbW9jayBgbmV4dCgpYCBmdW5jdGlvbiB3aGljaCBjYW4gYmUgdXNlZCB3aGVuIGNhbGxpbmdcbiAqIG1pZGRsZXdhcmUuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTW9ja05leHQoKSB7XG4gIHJldHVybiBhc3luYyBmdW5jdGlvbiBuZXh0KCkge307XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEseUVBQXlFO0FBRXpFLHdDQUF3QztBQUV4Qzs7Ozs7Q0FLQyxHQUVELEFBQ0EsU0FBUyxPQUFPLEVBQUUsZUFBZSxRQUFRLFlBQVk7QUFHckQsU0FBUyxPQUFPLFFBQVEsZUFBZTtBQUV2QyxTQUFTLFFBQVEsUUFBUSxnQkFBZ0I7QUFFekMscUNBQXFDLEdBQ3JDLE9BQU8sU0FBUyxjQUdkLFFBQVEsQ0FBQyxDQUFNLEVBQ0M7SUFDaEIsTUFBTSxNQUFNO1FBQ1Y7UUFDQSxPQUFNO1lBQ0osT0FBTztRQUNUO1FBQ0EsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxzQkFBc0IsSUFBRztZQUNuQyxPQUFPO1FBQ1Q7UUFDQSxDQUFDLE9BQU8sR0FBRyxDQUFDLDhCQUE4QixFQUN4QyxLQUFhLEVBQ2IsT0FBWSxFQUNaLE9BQXNELEVBQ3REO1lBQ0EsSUFBSSxRQUFRLEdBQUc7Z0JBQ2IsT0FBTyxRQUFRLE9BQU8sQ0FBQyxDQUFDLGlCQUFpQixDQUFD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