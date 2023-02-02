// Copyright 2018-2022 the oak authors. All rights reserved. MIT license.
import { Cookies } from "./cookies.ts";
import { createHttpError } from "./deps.ts";
import { Request } from "./request.ts";
import { Response } from "./response.ts";
import { send } from "./send.ts";
import { SSEStreamTarget } from "./server_sent_event.ts";
/** Provides context about the current request and response to middleware
 * functions, and the current instance being processed is the first argument
 * provided a {@linkcode Middleware} function.
 *
 * _Typically this is only used as a type annotation and shouldn't be
 * constructed directly._
 *
 * ### Example
 *
 * ```ts
 * import { Application, Context } from "https://deno.land/x/oak/mod.ts";
 *
 * const app = new Application();
 *
 * app.use((ctx) => {
 *   // information about the request is here:
 *   ctx.request;
 *   // information about the response is here:
 *   ctx.response;
 *   // the cookie store is here:
 *   ctx.cookies;
 * });
 *
 * // Needs a type annotation because it cannot be inferred.
 * function mw(ctx: Context) {
 *   // process here...
 * }
 *
 * app.use(mw);
 * ```
 *
 * @template S the state which extends the application state (`AS`)
 * @template AS the type of the state derived from the application
 */ export class Context {
    #socket;
    #sse;
    #wrapReviverReplacer(reviver) {
        return reviver ? (key, value)=>reviver(key, value, this) : undefined;
    }
    /** A reference to the current application. */ app;
    /** An object which allows access to cookies, mediating both the request and
   * response. */ cookies;
    /** Is `true` if the current connection is upgradeable to a web socket.
   * Otherwise the value is `false`.  Use `.upgrade()` to upgrade the connection
   * and return the web socket. */ get isUpgradable() {
        const upgrade = this.request.headers.get("upgrade");
        if (!upgrade || upgrade.toLowerCase() !== "websocket") {
            return false;
        }
        const secKey = this.request.headers.get("sec-websocket-key");
        return typeof secKey === "string" && secKey != "";
    }
    /** Determines if the request should be responded to.  If `false` when the
   * middleware completes processing, the response will not be sent back to the
   * requestor.  Typically this is used if the middleware will take over low
   * level processing of requests and responses, for example if using web
   * sockets.  This automatically gets set to `false` when the context is
   * upgraded to a web socket via the `.upgrade()` method.
   *
   * The default is `true`. */ respond;
    /** An object which contains information about the current request. */ request;
    /** An object which contains information about the response that will be sent
   * when the middleware finishes processing. */ response;
    /** If the the current context has been upgraded, then this will be set to
   * with the current web socket, otherwise it is `undefined`. */ get socket() {
        return this.#socket;
    }
    /** The object to pass state to front-end views.  This can be typed by
   * supplying the generic state argument when creating a new app.  For
   * example:
   *
   * ```ts
   * const app = new Application<{ foo: string }>();
   * ```
   *
   * Or can be contextually inferred based on setting an initial state object:
   *
   * ```ts
   * const app = new Application({ state: { foo: "bar" } });
   * ```
   *
   * On each request/response cycle, the context's state is cloned from the
   * application state. This means changes to the context's `.state` will be
   * dropped when the request drops, but "defaults" can be applied to the
   * application's state.  Changes to the application's state though won't be
   * reflected until the next request in the context's state.
   */ state;
    constructor(app, serverRequest, state, { secure =false , jsonBodyReplacer , jsonBodyReviver  } = {}){
        this.app = app;
        this.state = state;
        const { proxy  } = app;
        this.request = new Request(serverRequest, {
            proxy,
            secure,
            jsonBodyReviver: this.#wrapReviverReplacer(jsonBodyReviver)
        });
        this.respond = true;
        this.response = new Response(this.request, this.#wrapReviverReplacer(jsonBodyReplacer));
        this.cookies = new Cookies(this.request, this.response, {
            keys: this.app.keys,
            secure: this.request.secure
        });
    }
    /** Asserts the condition and if the condition fails, creates an HTTP error
   * with the provided status (which defaults to `500`).  The error status by
   * default will be set on the `.response.status`.
   *
   * Because of limitation of TypeScript, any assertion type function requires
   * specific type annotations, so the {@linkcode Context} type should be used
   * even if it can be inferred from the context.
   *
   * ### Example
   *
   * ```ts
   * import { Context, Status } from "https://deno.land/x/oak/mod.ts";
   *
   * export function mw(ctx: Context) {
   *   const body = ctx.request.body();
   *   ctx.assert(body.type === "json", Status.NotAcceptable);
   *   // process the body and send a response...
   * }
   * ```
   */ assert(// deno-lint-ignore no-explicit-any
    condition, errorStatus = 500, message, props) {
        if (condition) {
            return;
        }
        const err = createHttpError(errorStatus, message);
        if (props) {
            Object.assign(err, props);
        }
        throw err;
    }
    /** Asynchronously fulfill a response with a file from the local file
   * system.
   *
   * If the `options.path` is not supplied, the file to be sent will default
   * to this `.request.url.pathname`.
   *
   * Requires Deno read permission. */ send(options) {
        const { path =this.request.url.pathname , ...sendOptions } = options;
        return send(this, path, sendOptions);
    }
    /** Convert the connection to stream events, returning an event target for
   * sending server sent events.  Events dispatched on the returned target will
   * be sent to the client and be available in the client's `EventSource` that
   * initiated the connection.
   *
   * This will set `.respond` to `false`. */ sendEvents(options) {
        if (!this.#sse) {
            this.#sse = new SSEStreamTarget(this, options);
        }
        return this.#sse;
    }
    /** Create and throw an HTTP Error, which can be used to pass status
   * information which can be caught by other middleware to send more
   * meaningful error messages back to the client.  The passed error status will
   * be set on the `.response.status` by default as well.
   */ throw(errorStatus, message, props) {
        const err = createHttpError(errorStatus, message);
        if (props) {
            Object.assign(err, props);
        }
        throw err;
    }
    /** Take the current request and upgrade it to a web socket, resolving with
   * the a web standard `WebSocket` object. This will set `.respond` to
   * `false`.  If the socket cannot be upgraded, this method will throw. */ upgrade(options) {
        if (this.#socket) {
            return this.#socket;
        }
        if (!this.request.originalRequest.upgrade) {
            throw new TypeError("Web socket upgrades not currently supported for this type of server.");
        }
        this.#socket = this.request.originalRequest.upgrade(options);
        this.respond = false;
        return this.#socket;
    }
    [Symbol.for("Deno.customInspect")](inspect) {
        const { app , cookies , isUpgradable , respond , request , response , socket , state  } = this;
        return `${this.constructor.name} ${inspect({
            app,
            cookies,
            isUpgradable,
            respond,
            request,
            response,
            socket,
            state
        })}`;
    }
    [Symbol.for("nodejs.util.inspect.custom")](depth, // deno-lint-ignore no-explicit-any
    options, inspect) {
        if (depth < 0) {
            return options.stylize(`[${this.constructor.name}]`, "special");
        }
        const newOptions = Object.assign({}, options, {
            depth: options.depth === null ? null : options.depth - 1
        });
        const { app , cookies , isUpgradable , respond , request , response , socket , state  } = this;
        return `${options.stylize(this.constructor.name, "special")} ${inspect({
            app,
            cookies,
            isUpgradable,
            respond,
            request,
            response,
            socket,
            state
        }, newOptions)}`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMS4xLjAvY29udGV4dC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBvYWsgYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG5cbmltcG9ydCB0eXBlIHsgQXBwbGljYXRpb24sIFN0YXRlIH0gZnJvbSBcIi4vYXBwbGljYXRpb24udHNcIjtcbmltcG9ydCB7IENvb2tpZXMgfSBmcm9tIFwiLi9jb29raWVzLnRzXCI7XG5pbXBvcnQgeyBjcmVhdGVIdHRwRXJyb3IgfSBmcm9tIFwiLi9kZXBzLnRzXCI7XG5pbXBvcnQgeyBLZXlTdGFjayB9IGZyb20gXCIuL2tleVN0YWNrLnRzXCI7XG5pbXBvcnQgeyBSZXF1ZXN0IH0gZnJvbSBcIi4vcmVxdWVzdC50c1wiO1xuaW1wb3J0IHsgUmVzcG9uc2UgfSBmcm9tIFwiLi9yZXNwb25zZS50c1wiO1xuaW1wb3J0IHsgc2VuZCwgU2VuZE9wdGlvbnMgfSBmcm9tIFwiLi9zZW5kLnRzXCI7XG5pbXBvcnQge1xuICBTZXJ2ZXJTZW50RXZlbnRUYXJnZXRPcHRpb25zLFxuICBTU0VTdHJlYW1UYXJnZXQsXG59IGZyb20gXCIuL3NlcnZlcl9zZW50X2V2ZW50LnRzXCI7XG5pbXBvcnQgdHlwZSB7IFNlcnZlclNlbnRFdmVudFRhcmdldCB9IGZyb20gXCIuL3NlcnZlcl9zZW50X2V2ZW50LnRzXCI7XG5pbXBvcnQgdHlwZSB7XG4gIEVycm9yU3RhdHVzLFxuICBTZXJ2ZXJSZXF1ZXN0LFxuICBVcGdyYWRlV2ViU29ja2V0T3B0aW9ucyxcbn0gZnJvbSBcIi4vdHlwZXMuZC50c1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIENvbnRleHRPcHRpb25zPFxuICBTIGV4dGVuZHMgQVMgPSBTdGF0ZSxcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgQVMgZXh0ZW5kcyBTdGF0ZSA9IFJlY29yZDxzdHJpbmcsIGFueT4sXG4+IHtcbiAganNvbkJvZHlSZXBsYWNlcj86IChcbiAgICBrZXk6IHN0cmluZyxcbiAgICB2YWx1ZTogdW5rbm93bixcbiAgICBjb250ZXh0OiBDb250ZXh0PFM+LFxuICApID0+IHVua25vd247XG4gIGpzb25Cb2R5UmV2aXZlcj86IChcbiAgICBrZXk6IHN0cmluZyxcbiAgICB2YWx1ZTogdW5rbm93bixcbiAgICBjb250ZXh0OiBDb250ZXh0PFM+LFxuICApID0+IHVua25vd247XG4gIHNlY3VyZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29udGV4dFNlbmRPcHRpb25zIGV4dGVuZHMgU2VuZE9wdGlvbnMge1xuICAvKiogVGhlIGZpbGVuYW1lIHRvIHNlbmQsIHdoaWNoIHdpbGwgYmUgcmVzb2x2ZWQgYmFzZWQgb24gdGhlIG90aGVyIG9wdGlvbnMuXG4gICAqIElmIHRoaXMgcHJvcGVydHkgaXMgb21pdHRlZCwgdGhlIGN1cnJlbnQgY29udGV4dCdzIGAucmVxdWVzdC51cmwucGF0aG5hbWVgXG4gICAqIHdpbGwgYmUgdXNlZC4gKi9cbiAgcGF0aD86IHN0cmluZztcbn1cblxuLyoqIFByb3ZpZGVzIGNvbnRleHQgYWJvdXQgdGhlIGN1cnJlbnQgcmVxdWVzdCBhbmQgcmVzcG9uc2UgdG8gbWlkZGxld2FyZVxuICogZnVuY3Rpb25zLCBhbmQgdGhlIGN1cnJlbnQgaW5zdGFuY2UgYmVpbmcgcHJvY2Vzc2VkIGlzIHRoZSBmaXJzdCBhcmd1bWVudFxuICogcHJvdmlkZWQgYSB7QGxpbmtjb2RlIE1pZGRsZXdhcmV9IGZ1bmN0aW9uLlxuICpcbiAqIF9UeXBpY2FsbHkgdGhpcyBpcyBvbmx5IHVzZWQgYXMgYSB0eXBlIGFubm90YXRpb24gYW5kIHNob3VsZG4ndCBiZVxuICogY29uc3RydWN0ZWQgZGlyZWN0bHkuX1xuICpcbiAqICMjIyBFeGFtcGxlXG4gKlxuICogYGBgdHNcbiAqIGltcG9ydCB7IEFwcGxpY2F0aW9uLCBDb250ZXh0IH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrL21vZC50c1wiO1xuICpcbiAqIGNvbnN0IGFwcCA9IG5ldyBBcHBsaWNhdGlvbigpO1xuICpcbiAqIGFwcC51c2UoKGN0eCkgPT4ge1xuICogICAvLyBpbmZvcm1hdGlvbiBhYm91dCB0aGUgcmVxdWVzdCBpcyBoZXJlOlxuICogICBjdHgucmVxdWVzdDtcbiAqICAgLy8gaW5mb3JtYXRpb24gYWJvdXQgdGhlIHJlc3BvbnNlIGlzIGhlcmU6XG4gKiAgIGN0eC5yZXNwb25zZTtcbiAqICAgLy8gdGhlIGNvb2tpZSBzdG9yZSBpcyBoZXJlOlxuICogICBjdHguY29va2llcztcbiAqIH0pO1xuICpcbiAqIC8vIE5lZWRzIGEgdHlwZSBhbm5vdGF0aW9uIGJlY2F1c2UgaXQgY2Fubm90IGJlIGluZmVycmVkLlxuICogZnVuY3Rpb24gbXcoY3R4OiBDb250ZXh0KSB7XG4gKiAgIC8vIHByb2Nlc3MgaGVyZS4uLlxuICogfVxuICpcbiAqIGFwcC51c2UobXcpO1xuICogYGBgXG4gKlxuICogQHRlbXBsYXRlIFMgdGhlIHN0YXRlIHdoaWNoIGV4dGVuZHMgdGhlIGFwcGxpY2F0aW9uIHN0YXRlIChgQVNgKVxuICogQHRlbXBsYXRlIEFTIHRoZSB0eXBlIG9mIHRoZSBzdGF0ZSBkZXJpdmVkIGZyb20gdGhlIGFwcGxpY2F0aW9uXG4gKi9cbmV4cG9ydCBjbGFzcyBDb250ZXh0PFxuICBTIGV4dGVuZHMgQVMgPSBTdGF0ZSxcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgQVMgZXh0ZW5kcyBTdGF0ZSA9IFJlY29yZDxzdHJpbmcsIGFueT4sXG4+IHtcbiAgI3NvY2tldD86IFdlYlNvY2tldDtcbiAgI3NzZT86IFNlcnZlclNlbnRFdmVudFRhcmdldDtcblxuICAjd3JhcFJldml2ZXJSZXBsYWNlcihcbiAgICByZXZpdmVyPzogKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biwgY29udGV4dDogdGhpcykgPT4gdW5rbm93bixcbiAgKTogdW5kZWZpbmVkIHwgKChrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pID0+IHVua25vd24pIHtcbiAgICByZXR1cm4gcmV2aXZlclxuICAgICAgPyAoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKSA9PiByZXZpdmVyKGtleSwgdmFsdWUsIHRoaXMpXG4gICAgICA6IHVuZGVmaW5lZDtcbiAgfVxuXG4gIC8qKiBBIHJlZmVyZW5jZSB0byB0aGUgY3VycmVudCBhcHBsaWNhdGlvbi4gKi9cbiAgYXBwOiBBcHBsaWNhdGlvbjxBUz47XG5cbiAgLyoqIEFuIG9iamVjdCB3aGljaCBhbGxvd3MgYWNjZXNzIHRvIGNvb2tpZXMsIG1lZGlhdGluZyBib3RoIHRoZSByZXF1ZXN0IGFuZFxuICAgKiByZXNwb25zZS4gKi9cbiAgY29va2llczogQ29va2llcztcblxuICAvKiogSXMgYHRydWVgIGlmIHRoZSBjdXJyZW50IGNvbm5lY3Rpb24gaXMgdXBncmFkZWFibGUgdG8gYSB3ZWIgc29ja2V0LlxuICAgKiBPdGhlcndpc2UgdGhlIHZhbHVlIGlzIGBmYWxzZWAuICBVc2UgYC51cGdyYWRlKClgIHRvIHVwZ3JhZGUgdGhlIGNvbm5lY3Rpb25cbiAgICogYW5kIHJldHVybiB0aGUgd2ViIHNvY2tldC4gKi9cbiAgZ2V0IGlzVXBncmFkYWJsZSgpOiBib29sZWFuIHtcbiAgICBjb25zdCB1cGdyYWRlID0gdGhpcy5yZXF1ZXN0LmhlYWRlcnMuZ2V0KFwidXBncmFkZVwiKTtcbiAgICBpZiAoIXVwZ3JhZGUgfHwgdXBncmFkZS50b0xvd2VyQ2FzZSgpICE9PSBcIndlYnNvY2tldFwiKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNvbnN0IHNlY0tleSA9IHRoaXMucmVxdWVzdC5oZWFkZXJzLmdldChcInNlYy13ZWJzb2NrZXQta2V5XCIpO1xuICAgIHJldHVybiB0eXBlb2Ygc2VjS2V5ID09PSBcInN0cmluZ1wiICYmIHNlY0tleSAhPSBcIlwiO1xuICB9XG5cbiAgLyoqIERldGVybWluZXMgaWYgdGhlIHJlcXVlc3Qgc2hvdWxkIGJlIHJlc3BvbmRlZCB0by4gIElmIGBmYWxzZWAgd2hlbiB0aGVcbiAgICogbWlkZGxld2FyZSBjb21wbGV0ZXMgcHJvY2Vzc2luZywgdGhlIHJlc3BvbnNlIHdpbGwgbm90IGJlIHNlbnQgYmFjayB0byB0aGVcbiAgICogcmVxdWVzdG9yLiAgVHlwaWNhbGx5IHRoaXMgaXMgdXNlZCBpZiB0aGUgbWlkZGxld2FyZSB3aWxsIHRha2Ugb3ZlciBsb3dcbiAgICogbGV2ZWwgcHJvY2Vzc2luZyBvZiByZXF1ZXN0cyBhbmQgcmVzcG9uc2VzLCBmb3IgZXhhbXBsZSBpZiB1c2luZyB3ZWJcbiAgICogc29ja2V0cy4gIFRoaXMgYXV0b21hdGljYWxseSBnZXRzIHNldCB0byBgZmFsc2VgIHdoZW4gdGhlIGNvbnRleHQgaXNcbiAgICogdXBncmFkZWQgdG8gYSB3ZWIgc29ja2V0IHZpYSB0aGUgYC51cGdyYWRlKClgIG1ldGhvZC5cbiAgICpcbiAgICogVGhlIGRlZmF1bHQgaXMgYHRydWVgLiAqL1xuICByZXNwb25kOiBib29sZWFuO1xuXG4gIC8qKiBBbiBvYmplY3Qgd2hpY2ggY29udGFpbnMgaW5mb3JtYXRpb24gYWJvdXQgdGhlIGN1cnJlbnQgcmVxdWVzdC4gKi9cbiAgcmVxdWVzdDogUmVxdWVzdDtcblxuICAvKiogQW4gb2JqZWN0IHdoaWNoIGNvbnRhaW5zIGluZm9ybWF0aW9uIGFib3V0IHRoZSByZXNwb25zZSB0aGF0IHdpbGwgYmUgc2VudFxuICAgKiB3aGVuIHRoZSBtaWRkbGV3YXJlIGZpbmlzaGVzIHByb2Nlc3NpbmcuICovXG4gIHJlc3BvbnNlOiBSZXNwb25zZTtcblxuICAvKiogSWYgdGhlIHRoZSBjdXJyZW50IGNvbnRleHQgaGFzIGJlZW4gdXBncmFkZWQsIHRoZW4gdGhpcyB3aWxsIGJlIHNldCB0b1xuICAgKiB3aXRoIHRoZSBjdXJyZW50IHdlYiBzb2NrZXQsIG90aGVyd2lzZSBpdCBpcyBgdW5kZWZpbmVkYC4gKi9cbiAgZ2V0IHNvY2tldCgpOiBXZWJTb2NrZXQgfCB1bmRlZmluZWQge1xuICAgIHJldHVybiB0aGlzLiNzb2NrZXQ7XG4gIH1cblxuICAvKiogVGhlIG9iamVjdCB0byBwYXNzIHN0YXRlIHRvIGZyb250LWVuZCB2aWV3cy4gIFRoaXMgY2FuIGJlIHR5cGVkIGJ5XG4gICAqIHN1cHBseWluZyB0aGUgZ2VuZXJpYyBzdGF0ZSBhcmd1bWVudCB3aGVuIGNyZWF0aW5nIGEgbmV3IGFwcC4gIEZvclxuICAgKiBleGFtcGxlOlxuICAgKlxuICAgKiBgYGB0c1xuICAgKiBjb25zdCBhcHAgPSBuZXcgQXBwbGljYXRpb248eyBmb286IHN0cmluZyB9PigpO1xuICAgKiBgYGBcbiAgICpcbiAgICogT3IgY2FuIGJlIGNvbnRleHR1YWxseSBpbmZlcnJlZCBiYXNlZCBvbiBzZXR0aW5nIGFuIGluaXRpYWwgc3RhdGUgb2JqZWN0OlxuICAgKlxuICAgKiBgYGB0c1xuICAgKiBjb25zdCBhcHAgPSBuZXcgQXBwbGljYXRpb24oeyBzdGF0ZTogeyBmb286IFwiYmFyXCIgfSB9KTtcbiAgICogYGBgXG4gICAqXG4gICAqIE9uIGVhY2ggcmVxdWVzdC9yZXNwb25zZSBjeWNsZSwgdGhlIGNvbnRleHQncyBzdGF0ZSBpcyBjbG9uZWQgZnJvbSB0aGVcbiAgICogYXBwbGljYXRpb24gc3RhdGUuIFRoaXMgbWVhbnMgY2hhbmdlcyB0byB0aGUgY29udGV4dCdzIGAuc3RhdGVgIHdpbGwgYmVcbiAgICogZHJvcHBlZCB3aGVuIHRoZSByZXF1ZXN0IGRyb3BzLCBidXQgXCJkZWZhdWx0c1wiIGNhbiBiZSBhcHBsaWVkIHRvIHRoZVxuICAgKiBhcHBsaWNhdGlvbidzIHN0YXRlLiAgQ2hhbmdlcyB0byB0aGUgYXBwbGljYXRpb24ncyBzdGF0ZSB0aG91Z2ggd29uJ3QgYmVcbiAgICogcmVmbGVjdGVkIHVudGlsIHRoZSBuZXh0IHJlcXVlc3QgaW4gdGhlIGNvbnRleHQncyBzdGF0ZS5cbiAgICovXG4gIHN0YXRlOiBTO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIGFwcDogQXBwbGljYXRpb248QVM+LFxuICAgIHNlcnZlclJlcXVlc3Q6IFNlcnZlclJlcXVlc3QsXG4gICAgc3RhdGU6IFMsXG4gICAge1xuICAgICAgc2VjdXJlID0gZmFsc2UsXG4gICAgICBqc29uQm9keVJlcGxhY2VyLFxuICAgICAganNvbkJvZHlSZXZpdmVyLFxuICAgIH06IENvbnRleHRPcHRpb25zPFMsIEFTPiA9IHt9LFxuICApIHtcbiAgICB0aGlzLmFwcCA9IGFwcDtcbiAgICB0aGlzLnN0YXRlID0gc3RhdGU7XG4gICAgY29uc3QgeyBwcm94eSB9ID0gYXBwO1xuICAgIHRoaXMucmVxdWVzdCA9IG5ldyBSZXF1ZXN0KFxuICAgICAgc2VydmVyUmVxdWVzdCxcbiAgICAgIHtcbiAgICAgICAgcHJveHksXG4gICAgICAgIHNlY3VyZSxcbiAgICAgICAganNvbkJvZHlSZXZpdmVyOiB0aGlzLiN3cmFwUmV2aXZlclJlcGxhY2VyKGpzb25Cb2R5UmV2aXZlciksXG4gICAgICB9LFxuICAgICk7XG4gICAgdGhpcy5yZXNwb25kID0gdHJ1ZTtcbiAgICB0aGlzLnJlc3BvbnNlID0gbmV3IFJlc3BvbnNlKFxuICAgICAgdGhpcy5yZXF1ZXN0LFxuICAgICAgdGhpcy4jd3JhcFJldml2ZXJSZXBsYWNlcihqc29uQm9keVJlcGxhY2VyKSxcbiAgICApO1xuICAgIHRoaXMuY29va2llcyA9IG5ldyBDb29raWVzKHRoaXMucmVxdWVzdCwgdGhpcy5yZXNwb25zZSwge1xuICAgICAga2V5czogdGhpcy5hcHAua2V5cyBhcyBLZXlTdGFjayB8IHVuZGVmaW5lZCxcbiAgICAgIHNlY3VyZTogdGhpcy5yZXF1ZXN0LnNlY3VyZSxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKiBBc3NlcnRzIHRoZSBjb25kaXRpb24gYW5kIGlmIHRoZSBjb25kaXRpb24gZmFpbHMsIGNyZWF0ZXMgYW4gSFRUUCBlcnJvclxuICAgKiB3aXRoIHRoZSBwcm92aWRlZCBzdGF0dXMgKHdoaWNoIGRlZmF1bHRzIHRvIGA1MDBgKS4gIFRoZSBlcnJvciBzdGF0dXMgYnlcbiAgICogZGVmYXVsdCB3aWxsIGJlIHNldCBvbiB0aGUgYC5yZXNwb25zZS5zdGF0dXNgLlxuICAgKlxuICAgKiBCZWNhdXNlIG9mIGxpbWl0YXRpb24gb2YgVHlwZVNjcmlwdCwgYW55IGFzc2VydGlvbiB0eXBlIGZ1bmN0aW9uIHJlcXVpcmVzXG4gICAqIHNwZWNpZmljIHR5cGUgYW5ub3RhdGlvbnMsIHNvIHRoZSB7QGxpbmtjb2RlIENvbnRleHR9IHR5cGUgc2hvdWxkIGJlIHVzZWRcbiAgICogZXZlbiBpZiBpdCBjYW4gYmUgaW5mZXJyZWQgZnJvbSB0aGUgY29udGV4dC5cbiAgICpcbiAgICogIyMjIEV4YW1wbGVcbiAgICpcbiAgICogYGBgdHNcbiAgICogaW1wb3J0IHsgQ29udGV4dCwgU3RhdHVzIH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrL21vZC50c1wiO1xuICAgKlxuICAgKiBleHBvcnQgZnVuY3Rpb24gbXcoY3R4OiBDb250ZXh0KSB7XG4gICAqICAgY29uc3QgYm9keSA9IGN0eC5yZXF1ZXN0LmJvZHkoKTtcbiAgICogICBjdHguYXNzZXJ0KGJvZHkudHlwZSA9PT0gXCJqc29uXCIsIFN0YXR1cy5Ob3RBY2NlcHRhYmxlKTtcbiAgICogICAvLyBwcm9jZXNzIHRoZSBib2R5IGFuZCBzZW5kIGEgcmVzcG9uc2UuLi5cbiAgICogfVxuICAgKiBgYGBcbiAgICovXG4gIGFzc2VydChcbiAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAgIGNvbmRpdGlvbjogYW55LFxuICAgIGVycm9yU3RhdHVzOiBFcnJvclN0YXR1cyA9IDUwMCxcbiAgICBtZXNzYWdlPzogc3RyaW5nLFxuICAgIHByb3BzPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG4gICk6IGFzc2VydHMgY29uZGl0aW9uIHtcbiAgICBpZiAoY29uZGl0aW9uKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGVyciA9IGNyZWF0ZUh0dHBFcnJvcihlcnJvclN0YXR1cywgbWVzc2FnZSk7XG4gICAgaWYgKHByb3BzKSB7XG4gICAgICBPYmplY3QuYXNzaWduKGVyciwgcHJvcHMpO1xuICAgIH1cbiAgICB0aHJvdyBlcnI7XG4gIH1cblxuICAvKiogQXN5bmNocm9ub3VzbHkgZnVsZmlsbCBhIHJlc3BvbnNlIHdpdGggYSBmaWxlIGZyb20gdGhlIGxvY2FsIGZpbGVcbiAgICogc3lzdGVtLlxuICAgKlxuICAgKiBJZiB0aGUgYG9wdGlvbnMucGF0aGAgaXMgbm90IHN1cHBsaWVkLCB0aGUgZmlsZSB0byBiZSBzZW50IHdpbGwgZGVmYXVsdFxuICAgKiB0byB0aGlzIGAucmVxdWVzdC51cmwucGF0aG5hbWVgLlxuICAgKlxuICAgKiBSZXF1aXJlcyBEZW5vIHJlYWQgcGVybWlzc2lvbi4gKi9cbiAgc2VuZChvcHRpb25zOiBDb250ZXh0U2VuZE9wdGlvbnMpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuICAgIGNvbnN0IHsgcGF0aCA9IHRoaXMucmVxdWVzdC51cmwucGF0aG5hbWUsIC4uLnNlbmRPcHRpb25zIH0gPSBvcHRpb25zO1xuICAgIHJldHVybiBzZW5kKHRoaXMsIHBhdGgsIHNlbmRPcHRpb25zKTtcbiAgfVxuXG4gIC8qKiBDb252ZXJ0IHRoZSBjb25uZWN0aW9uIHRvIHN0cmVhbSBldmVudHMsIHJldHVybmluZyBhbiBldmVudCB0YXJnZXQgZm9yXG4gICAqIHNlbmRpbmcgc2VydmVyIHNlbnQgZXZlbnRzLiAgRXZlbnRzIGRpc3BhdGNoZWQgb24gdGhlIHJldHVybmVkIHRhcmdldCB3aWxsXG4gICAqIGJlIHNlbnQgdG8gdGhlIGNsaWVudCBhbmQgYmUgYXZhaWxhYmxlIGluIHRoZSBjbGllbnQncyBgRXZlbnRTb3VyY2VgIHRoYXRcbiAgICogaW5pdGlhdGVkIHRoZSBjb25uZWN0aW9uLlxuICAgKlxuICAgKiBUaGlzIHdpbGwgc2V0IGAucmVzcG9uZGAgdG8gYGZhbHNlYC4gKi9cbiAgc2VuZEV2ZW50cyhvcHRpb25zPzogU2VydmVyU2VudEV2ZW50VGFyZ2V0T3B0aW9ucyk6IFNlcnZlclNlbnRFdmVudFRhcmdldCB7XG4gICAgaWYgKCF0aGlzLiNzc2UpIHtcbiAgICAgIHRoaXMuI3NzZSA9IG5ldyBTU0VTdHJlYW1UYXJnZXQodGhpcywgb3B0aW9ucyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLiNzc2U7XG4gIH1cblxuICAvKiogQ3JlYXRlIGFuZCB0aHJvdyBhbiBIVFRQIEVycm9yLCB3aGljaCBjYW4gYmUgdXNlZCB0byBwYXNzIHN0YXR1c1xuICAgKiBpbmZvcm1hdGlvbiB3aGljaCBjYW4gYmUgY2F1Z2h0IGJ5IG90aGVyIG1pZGRsZXdhcmUgdG8gc2VuZCBtb3JlXG4gICAqIG1lYW5pbmdmdWwgZXJyb3IgbWVzc2FnZXMgYmFjayB0byB0aGUgY2xpZW50LiAgVGhlIHBhc3NlZCBlcnJvciBzdGF0dXMgd2lsbFxuICAgKiBiZSBzZXQgb24gdGhlIGAucmVzcG9uc2Uuc3RhdHVzYCBieSBkZWZhdWx0IGFzIHdlbGwuXG4gICAqL1xuICB0aHJvdyhcbiAgICBlcnJvclN0YXR1czogRXJyb3JTdGF0dXMsXG4gICAgbWVzc2FnZT86IHN0cmluZyxcbiAgICBwcm9wcz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+LFxuICApOiBuZXZlciB7XG4gICAgY29uc3QgZXJyID0gY3JlYXRlSHR0cEVycm9yKGVycm9yU3RhdHVzLCBtZXNzYWdlKTtcbiAgICBpZiAocHJvcHMpIHtcbiAgICAgIE9iamVjdC5hc3NpZ24oZXJyLCBwcm9wcyk7XG4gICAgfVxuICAgIHRocm93IGVycjtcbiAgfVxuXG4gIC8qKiBUYWtlIHRoZSBjdXJyZW50IHJlcXVlc3QgYW5kIHVwZ3JhZGUgaXQgdG8gYSB3ZWIgc29ja2V0LCByZXNvbHZpbmcgd2l0aFxuICAgKiB0aGUgYSB3ZWIgc3RhbmRhcmQgYFdlYlNvY2tldGAgb2JqZWN0LiBUaGlzIHdpbGwgc2V0IGAucmVzcG9uZGAgdG9cbiAgICogYGZhbHNlYC4gIElmIHRoZSBzb2NrZXQgY2Fubm90IGJlIHVwZ3JhZGVkLCB0aGlzIG1ldGhvZCB3aWxsIHRocm93LiAqL1xuICB1cGdyYWRlKG9wdGlvbnM/OiBVcGdyYWRlV2ViU29ja2V0T3B0aW9ucyk6IFdlYlNvY2tldCB7XG4gICAgaWYgKHRoaXMuI3NvY2tldCkge1xuICAgICAgcmV0dXJuIHRoaXMuI3NvY2tldDtcbiAgICB9XG4gICAgaWYgKCF0aGlzLnJlcXVlc3Qub3JpZ2luYWxSZXF1ZXN0LnVwZ3JhZGUpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXG4gICAgICAgIFwiV2ViIHNvY2tldCB1cGdyYWRlcyBub3QgY3VycmVudGx5IHN1cHBvcnRlZCBmb3IgdGhpcyB0eXBlIG9mIHNlcnZlci5cIixcbiAgICAgICk7XG4gICAgfVxuICAgIHRoaXMuI3NvY2tldCA9IHRoaXMucmVxdWVzdC5vcmlnaW5hbFJlcXVlc3QudXBncmFkZShvcHRpb25zKTtcbiAgICB0aGlzLnJlc3BvbmQgPSBmYWxzZTtcbiAgICByZXR1cm4gdGhpcy4jc29ja2V0O1xuICB9XG5cbiAgW1N5bWJvbC5mb3IoXCJEZW5vLmN1c3RvbUluc3BlY3RcIildKGluc3BlY3Q6ICh2YWx1ZTogdW5rbm93bikgPT4gc3RyaW5nKSB7XG4gICAgY29uc3Qge1xuICAgICAgYXBwLFxuICAgICAgY29va2llcyxcbiAgICAgIGlzVXBncmFkYWJsZSxcbiAgICAgIHJlc3BvbmQsXG4gICAgICByZXF1ZXN0LFxuICAgICAgcmVzcG9uc2UsXG4gICAgICBzb2NrZXQsXG4gICAgICBzdGF0ZSxcbiAgICB9ID0gdGhpcztcbiAgICByZXR1cm4gYCR7dGhpcy5jb25zdHJ1Y3Rvci5uYW1lfSAke1xuICAgICAgaW5zcGVjdCh7XG4gICAgICAgIGFwcCxcbiAgICAgICAgY29va2llcyxcbiAgICAgICAgaXNVcGdyYWRhYmxlLFxuICAgICAgICByZXNwb25kLFxuICAgICAgICByZXF1ZXN0LFxuICAgICAgICByZXNwb25zZSxcbiAgICAgICAgc29ja2V0LFxuICAgICAgICBzdGF0ZSxcbiAgICAgIH0pXG4gICAgfWA7XG4gIH1cblxuICBbU3ltYm9sLmZvcihcIm5vZGVqcy51dGlsLmluc3BlY3QuY3VzdG9tXCIpXShcbiAgICBkZXB0aDogbnVtYmVyLFxuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgb3B0aW9uczogYW55LFxuICAgIGluc3BlY3Q6ICh2YWx1ZTogdW5rbm93biwgb3B0aW9ucz86IHVua25vd24pID0+IHN0cmluZyxcbiAgKSB7XG4gICAgaWYgKGRlcHRoIDwgMCkge1xuICAgICAgcmV0dXJuIG9wdGlvbnMuc3R5bGl6ZShgWyR7dGhpcy5jb25zdHJ1Y3Rvci5uYW1lfV1gLCBcInNwZWNpYWxcIik7XG4gICAgfVxuXG4gICAgY29uc3QgbmV3T3B0aW9ucyA9IE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIHtcbiAgICAgIGRlcHRoOiBvcHRpb25zLmRlcHRoID09PSBudWxsID8gbnVsbCA6IG9wdGlvbnMuZGVwdGggLSAxLFxuICAgIH0pO1xuICAgIGNvbnN0IHtcbiAgICAgIGFwcCxcbiAgICAgIGNvb2tpZXMsXG4gICAgICBpc1VwZ3JhZGFibGUsXG4gICAgICByZXNwb25kLFxuICAgICAgcmVxdWVzdCxcbiAgICAgIHJlc3BvbnNlLFxuICAgICAgc29ja2V0LFxuICAgICAgc3RhdGUsXG4gICAgfSA9IHRoaXM7XG4gICAgcmV0dXJuIGAke29wdGlvbnMuc3R5bGl6ZSh0aGlzLmNvbnN0cnVjdG9yLm5hbWUsIFwic3BlY2lhbFwiKX0gJHtcbiAgICAgIGluc3BlY3Qoe1xuICAgICAgICBhcHAsXG4gICAgICAgIGNvb2tpZXMsXG4gICAgICAgIGlzVXBncmFkYWJsZSxcbiAgICAgICAgcmVzcG9uZCxcbiAgICAgICAgcmVxdWVzdCxcbiAgICAgICAgcmVzcG9uc2UsXG4gICAgICAgIHNvY2tldCxcbiAgICAgICAgc3RhdGUsXG4gICAgICB9LCBuZXdPcHRpb25zKVxuICAgIH1g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