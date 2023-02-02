// Copyright 2018-2022 the oak authors. All rights reserved. MIT license.
import { Context } from "./context.ts";
import { STATUS_TEXT } from "./deps.ts";
import { FlashServer } from "./http_server_flash.ts";
import { HttpServer } from "./http_server_native.ts";
import { NativeRequest } from "./http_server_native_request.ts";
import { KeyStack } from "./keyStack.ts";
import { compose } from "./middleware.ts";
import { cloneState } from "./structured_clone.ts";
import { assert, isConn } from "./util.ts";
const ADDR_REGEXP = /^\[?([^\]]*)\]?:([0-9]{1,5})$/;
const DEFAULT_SERVER = HttpServer;
export class ApplicationErrorEvent extends ErrorEvent {
    context;
    constructor(eventInitDict){
        super("error", eventInitDict);
        this.context = eventInitDict.context;
    }
}
function logErrorListener({ error , context  }) {
    if (error instanceof Error) {
        console.error(`[uncaught application error]: ${error.name} - ${error.message}`);
    } else {
        console.error(`[uncaught application error]\n`, error);
    }
    if (context) {
        let url;
        try {
            url = context.request.url.toString();
        } catch  {
            url = "[malformed url]";
        }
        console.error(`\nrequest:`, {
            url,
            method: context.request.method,
            hasBody: context.request.hasBody
        });
        console.error(`response:`, {
            status: context.response.status,
            type: context.response.type,
            hasBody: !!context.response.body,
            writable: context.response.writable
        });
    }
    if (error instanceof Error && error.stack) {
        console.error(`\n${error.stack.split("\n").slice(1).join("\n")}`);
    }
}
export class ApplicationListenEvent extends Event {
    hostname;
    listener;
    port;
    secure;
    serverType;
    constructor(eventInitDict){
        super("listen", eventInitDict);
        this.hostname = eventInitDict.hostname;
        this.listener = eventInitDict.listener;
        this.port = eventInitDict.port;
        this.secure = eventInitDict.secure;
        this.serverType = eventInitDict.serverType;
    }
}
/** A class which registers middleware (via `.use()`) and then processes
 * inbound requests against that middleware (via `.listen()`).
 *
 * The `context.state` can be typed via passing a generic argument when
 * constructing an instance of `Application`. It can also be inferred by setting
 * the {@linkcode ApplicationOptions.state} option when constructing the
 * application.
 *
 * ### Basic example
 *
 * ```ts
 * import { Application } from "https://deno.land/x/oak/mod.ts";
 *
 * const app = new Application();
 *
 * app.use((ctx, next) => {
 *   // called on each request with the context (`ctx`) of the request,
 *   // response, and other data.
 *   // `next()` is use to modify the flow control of the middleware stack.
 * });
 *
 * app.listen({ port: 8080 });
 * ```
 *
 * @template AS the type of the application state which extends
 *              {@linkcode State} and defaults to a simple string record.
 */ // deno-lint-ignore no-explicit-any
export class Application extends EventTarget {
    #composedMiddleware;
    #contextOptions;
    #contextState;
    #keys;
    #middleware = [];
    #serverConstructor;
    /** A set of keys, or an instance of `KeyStack` which will be used to sign
   * cookies read and set by the application to avoid tampering with the
   * cookies. */ get keys() {
        return this.#keys;
    }
    set keys(keys) {
        if (!keys) {
            this.#keys = undefined;
            return;
        } else if (Array.isArray(keys)) {
            this.#keys = new KeyStack(keys);
        } else {
            this.#keys = keys;
        }
    }
    /** If `true`, proxy headers will be trusted when processing requests.  This
   * defaults to `false`. */ proxy;
    /** Generic state of the application, which can be specified by passing the
   * generic argument when constructing:
   *
   *       const app = new Application<{ foo: string }>();
   *
   * Or can be contextually inferred based on setting an initial state object:
   *
   *       const app = new Application({ state: { foo: "bar" } });
   *
   * When a new context is created, the application's state is cloned and the
   * state is unique to that request/response.  Changes can be made to the
   * application state that will be shared with all contexts.
   */ state;
    constructor(options = {}){
        super();
        const { state , keys , proxy , serverConstructor =DEFAULT_SERVER , contextState ="clone" , logErrors =true , ...contextOptions } = options;
        this.proxy = proxy ?? false;
        this.keys = keys;
        this.state = state ?? {};
        this.#serverConstructor = serverConstructor;
        this.#contextOptions = contextOptions;
        this.#contextState = contextState;
        if (logErrors) {
            this.addEventListener("error", logErrorListener);
        }
    }
    #getComposed() {
        if (!this.#composedMiddleware) {
            this.#composedMiddleware = compose(this.#middleware);
        }
        return this.#composedMiddleware;
    }
    #getContextState() {
        switch(this.#contextState){
            case "alias":
                return this.state;
            case "clone":
                return cloneState(this.state);
            case "empty":
                return {};
            case "prototype":
                return Object.create(this.state);
        }
    }
    /** Deal with uncaught errors in either the middleware or sending the
   * response. */ // deno-lint-ignore no-explicit-any
    #handleError(context, error) {
        if (!(error instanceof Error)) {
            error = new Error(`non-error thrown: ${JSON.stringify(error)}`);
        }
        const { message  } = error;
        this.dispatchEvent(new ApplicationErrorEvent({
            context,
            message,
            error
        }));
        if (!context.response.writable) {
            return;
        }
        for (const key of [
            ...context.response.headers.keys()
        ]){
            context.response.headers.delete(key);
        }
        if (error.headers && error.headers instanceof Headers) {
            for (const [key1, value] of error.headers){
                context.response.headers.set(key1, value);
            }
        }
        context.response.type = "text";
        const status = context.response.status = Deno.errors && error instanceof Deno.errors.NotFound ? 404 : error.status && typeof error.status === "number" ? error.status : 500;
        context.response.body = error.expose ? error.message : STATUS_TEXT[status];
    }
    /** Processing registered middleware on each request. */ async #handleRequest(request, secure, state) {
        const context1 = new Context(this, request, this.#getContextState(), {
            secure,
            ...this.#contextOptions
        });
        let resolve;
        const handlingPromise = new Promise((res)=>resolve = res);
        state.handling.add(handlingPromise);
        if (!state.closing && !state.closed) {
            try {
                await this.#getComposed()(context1);
            } catch (err) {
                this.#handleError(context1, err);
            }
        }
        if (context1.respond === false) {
            context1.response.destroy();
            resolve();
            state.handling.delete(handlingPromise);
            return;
        }
        let closeResources = true;
        let response;
        try {
            closeResources = false;
            response = await context1.response.toDomResponse();
        } catch (err1) {
            this.#handleError(context1, err1);
            response = await context1.response.toDomResponse();
        }
        assert(response);
        try {
            await request.respond(response);
        } catch (err2) {
            this.#handleError(context1, err2);
        } finally{
            context1.response.destroy(closeResources);
            resolve();
            state.handling.delete(handlingPromise);
            if (state.closing) {
                await state.server.close();
                state.closed = true;
            }
        }
    }
    /** Add an event listener for an event.  Currently valid event types are
   * `"error"` and `"listen"`. */ addEventListener(type, listener, options) {
        super.addEventListener(type, listener, options);
    }
    /** Handle an individual server request, returning the server response.  This
   * is similar to `.listen()`, but opening the connection and retrieving
   * requests are not the responsibility of the application.  If the generated
   * context gets set to not to respond, then the method resolves with
   * `undefined`, otherwise it resolves with a request that is compatible with
   * `std/http/server`. */ handle = async (request, secureOrConn, secure = false)=>{
        if (!this.#middleware.length) {
            throw new TypeError("There is no middleware to process requests.");
        }
        assert(isConn(secureOrConn) || typeof secureOrConn === "undefined");
        const contextRequest = new NativeRequest({
            request,
            respondWith () {
                return Promise.resolve(undefined);
            }
        }, {
            conn: secureOrConn
        });
        const context = new Context(this, contextRequest, this.#getContextState(), {
            secure,
            ...this.#contextOptions
        });
        try {
            await this.#getComposed()(context);
        } catch (err) {
            this.#handleError(context, err);
        }
        if (context.respond === false) {
            context.response.destroy();
            return;
        }
        try {
            const response = await context.response.toDomResponse();
            context.response.destroy(false);
            return response;
        } catch (err1) {
            this.#handleError(context, err1);
            throw err1;
        }
    };
    async listen(options = {
        port: 0
    }) {
        if (!this.#middleware.length) {
            throw new TypeError("There is no middleware to process requests.");
        }
        if (typeof options === "string") {
            const match = ADDR_REGEXP.exec(options);
            if (!match) {
                throw TypeError(`Invalid address passed: "${options}"`);
            }
            const [, hostname, portStr] = match;
            options = {
                hostname,
                port: parseInt(portStr, 10)
            };
        }
        options = Object.assign({
            port: 0
        }, options);
        const server = new this.#serverConstructor(this, options);
        const { signal  } = options;
        const state = {
            closed: false,
            closing: false,
            handling: new Set(),
            server
        };
        if (signal) {
            signal.addEventListener("abort", ()=>{
                if (!state.handling.size) {
                    server.close();
                    state.closed = true;
                }
                state.closing = true;
            });
        }
        const { secure =false  } = options;
        const serverType = server instanceof HttpServer ? "native" : server instanceof FlashServer ? "flash" : "custom";
        const listener = await server.listen();
        const { hostname: hostname1 , port  } = listener.addr;
        this.dispatchEvent(new ApplicationListenEvent({
            hostname: hostname1,
            listener,
            port,
            secure,
            serverType
        }));
        try {
            for await (const request of server){
                this.#handleRequest(request, secure, state);
            }
            await Promise.all(state.handling);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Application Error";
            this.dispatchEvent(new ApplicationErrorEvent({
                message,
                error
            }));
        }
    }
    use(...middleware) {
        this.#middleware.push(...middleware);
        this.#composedMiddleware = undefined;
        // deno-lint-ignore no-explicit-any
        return this;
    }
    [Symbol.for("Deno.customInspect")](inspect) {
        const { keys , proxy , state  } = this;
        return `${this.constructor.name} ${inspect({
            "#middleware": this.#middleware,
            keys,
            proxy,
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
        const { keys , proxy , state  } = this;
        return `${options.stylize(this.constructor.name, "special")} ${inspect({
            "#middleware": this.#middleware,
            keys,
            proxy,
            state
        }, newOptions)}`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMS4xLjAvYXBwbGljYXRpb24udHMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IDIwMTgtMjAyMiB0aGUgb2FrIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuXG5pbXBvcnQgeyBDb250ZXh0IH0gZnJvbSBcIi4vY29udGV4dC50c1wiO1xuaW1wb3J0IHsgU3RhdHVzLCBTVEFUVVNfVEVYVCB9IGZyb20gXCIuL2RlcHMudHNcIjtcbmltcG9ydCB7IEZsYXNoU2VydmVyIH0gZnJvbSBcIi4vaHR0cF9zZXJ2ZXJfZmxhc2gudHNcIjtcbmltcG9ydCB7IEh0dHBTZXJ2ZXIgfSBmcm9tIFwiLi9odHRwX3NlcnZlcl9uYXRpdmUudHNcIjtcbmltcG9ydCB7IE5hdGl2ZVJlcXVlc3QgfSBmcm9tIFwiLi9odHRwX3NlcnZlcl9uYXRpdmVfcmVxdWVzdC50c1wiO1xuaW1wb3J0IHsgS2V5U3RhY2sgfSBmcm9tIFwiLi9rZXlTdGFjay50c1wiO1xuaW1wb3J0IHsgY29tcG9zZSwgTWlkZGxld2FyZSB9IGZyb20gXCIuL21pZGRsZXdhcmUudHNcIjtcbmltcG9ydCB7IGNsb25lU3RhdGUgfSBmcm9tIFwiLi9zdHJ1Y3R1cmVkX2Nsb25lLnRzXCI7XG5pbXBvcnQge1xuICBLZXksXG4gIExpc3RlbmVyLFxuICBTZXJ2ZXIsXG4gIFNlcnZlckNvbnN0cnVjdG9yLFxuICBTZXJ2ZXJSZXF1ZXN0LFxufSBmcm9tIFwiLi90eXBlcy5kLnRzXCI7XG5pbXBvcnQgeyBhc3NlcnQsIGlzQ29ubiB9IGZyb20gXCIuL3V0aWwudHNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBMaXN0ZW5PcHRpb25zQmFzZSB7XG4gIC8qKiBUaGUgcG9ydCB0byBsaXN0ZW4gb24uIElmIG5vdCBzcGVjaWZpZWQsIGRlZmF1bHRzIHRvIGAwYCwgd2hpY2ggYWxsb3dzIHRoZVxuICAgKiBvcGVyYXRpbmcgc3lzdGVtIHRvIGRldGVybWluZSB0aGUgdmFsdWUuICovXG4gIHBvcnQ/OiBudW1iZXI7XG4gIC8qKiBBIGxpdGVyYWwgSVAgYWRkcmVzcyBvciBob3N0IG5hbWUgdGhhdCBjYW4gYmUgcmVzb2x2ZWQgdG8gYW4gSVAgYWRkcmVzcy5cbiAgICogSWYgbm90IHNwZWNpZmllZCwgZGVmYXVsdHMgdG8gYDAuMC4wLjBgLlxuICAgKlxuICAgKiBfX05vdGUgYWJvdXQgYDAuMC4wLjBgX18gV2hpbGUgbGlzdGVuaW5nIGAwLjAuMC4wYCB3b3JrcyBvbiBhbGwgcGxhdGZvcm1zLFxuICAgKiB0aGUgYnJvd3NlcnMgb24gV2luZG93cyBkb24ndCB3b3JrIHdpdGggdGhlIGFkZHJlc3MgYDAuMC4wLjBgLlxuICAgKiBZb3Ugc2hvdWxkIHNob3cgdGhlIG1lc3NhZ2UgbGlrZSBgc2VydmVyIHJ1bm5pbmcgb24gbG9jYWxob3N0OjgwODBgIGluc3RlYWQgb2ZcbiAgICogYHNlcnZlciBydW5uaW5nIG9uIDAuMC4wLjA6ODA4MGAgaWYgeW91ciBwcm9ncmFtIHN1cHBvcnRzIFdpbmRvd3MuICovXG4gIGhvc3RuYW1lPzogc3RyaW5nO1xuICBzZWN1cmU/OiBmYWxzZTtcbiAgLyoqIEFuIG9wdGlvbmFsIGFib3J0IHNpZ25hbCB3aGljaCBjYW4gYmUgdXNlZCB0byBjbG9zZSB0aGUgbGlzdGVuZXIuICovXG4gIHNpZ25hbD86IEFib3J0U2lnbmFsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIExpc3Rlbk9wdGlvbnNUbHMgZXh0ZW5kcyBEZW5vLkxpc3RlblRsc09wdGlvbnMge1xuICAvKiogQXBwbGljYXRpb24tTGF5ZXIgUHJvdG9jb2wgTmVnb3RpYXRpb24gKEFMUE4pIHByb3RvY29scyB0byBhbm5vdW5jZSB0b1xuICAgKiB0aGUgY2xpZW50LiBJZiBub3Qgc3BlY2lmaWVkLCBubyBBTFBOIGV4dGVuc2lvbiB3aWxsIGJlIGluY2x1ZGVkIGluIHRoZVxuICAgKiBUTFMgaGFuZHNoYWtlLlxuICAgKlxuICAgKiAqKk5PVEUqKiB0aGlzIGlzIHBhcnQgb2YgdGhlIG5hdGl2ZSBIVFRQIHNlcnZlciBpbiBEZW5vIDEuOSBvciBsYXRlcixcbiAgICogd2hpY2ggcmVxdWlyZXMgdGhlIGAtLXVuc3RhYmxlYCBmbGFnIHRvIGJlIGF2YWlsYWJsZS5cbiAgICovXG4gIGFscG5Qcm90b2NvbHM/OiBzdHJpbmdbXTtcbiAgc2VjdXJlOiB0cnVlO1xuICAvKiogQW4gb3B0aW9uYWwgYWJvcnQgc2lnbmFsIHdoaWNoIGNhbiBiZSB1c2VkIHRvIGNsb3NlIHRoZSBsaXN0ZW5lci4gKi9cbiAgc2lnbmFsPzogQWJvcnRTaWduYWw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGFuZGxlTWV0aG9kIHtcbiAgLyoqIEhhbmRsZSBhbiBpbmRpdmlkdWFsIHNlcnZlciByZXF1ZXN0LCByZXR1cm5pbmcgdGhlIHNlcnZlciByZXNwb25zZS4gIFRoaXNcbiAgICogaXMgc2ltaWxhciB0byBgLmxpc3RlbigpYCwgYnV0IG9wZW5pbmcgdGhlIGNvbm5lY3Rpb24gYW5kIHJldHJpZXZpbmdcbiAgICogcmVxdWVzdHMgYXJlIG5vdCB0aGUgcmVzcG9uc2liaWxpdHkgb2YgdGhlIGFwcGxpY2F0aW9uLiAgSWYgdGhlIGdlbmVyYXRlZFxuICAgKiBjb250ZXh0IGdldHMgc2V0IHRvIG5vdCB0byByZXNwb25kLCB0aGVuIHRoZSBtZXRob2QgcmVzb2x2ZXMgd2l0aFxuICAgKiBgdW5kZWZpbmVkYCwgb3RoZXJ3aXNlIGl0IHJlc29sdmVzIHdpdGggYSBET00gYFJlc3BvbnNlYCBvYmplY3QuICovXG4gIChcbiAgICByZXF1ZXN0OiBSZXF1ZXN0LFxuICAgIGNvbm4/OiBEZW5vLkNvbm4sXG4gICAgc2VjdXJlPzogYm9vbGVhbixcbiAgKTogUHJvbWlzZTxSZXNwb25zZSB8IHVuZGVmaW5lZD47XG59XG5cbmV4cG9ydCB0eXBlIExpc3Rlbk9wdGlvbnMgPSBMaXN0ZW5PcHRpb25zVGxzIHwgTGlzdGVuT3B0aW9uc0Jhc2U7XG5cbmludGVyZmFjZSBBcHBsaWNhdGlvbkVycm9yRXZlbnRMaXN0ZW5lcjxTIGV4dGVuZHMgQVMsIEFTPiB7XG4gIChldnQ6IEFwcGxpY2F0aW9uRXJyb3JFdmVudDxTLCBBUz4pOiB2b2lkIHwgUHJvbWlzZTx2b2lkPjtcbn1cblxuaW50ZXJmYWNlIEFwcGxpY2F0aW9uRXJyb3JFdmVudExpc3RlbmVyT2JqZWN0PFMgZXh0ZW5kcyBBUywgQVM+IHtcbiAgaGFuZGxlRXZlbnQoZXZ0OiBBcHBsaWNhdGlvbkVycm9yRXZlbnQ8UywgQVM+KTogdm9pZCB8IFByb21pc2U8dm9pZD47XG59XG5cbmludGVyZmFjZSBBcHBsaWNhdGlvbkVycm9yRXZlbnRJbml0PFMgZXh0ZW5kcyBBUywgQVMgZXh0ZW5kcyBTdGF0ZT5cbiAgZXh0ZW5kcyBFcnJvckV2ZW50SW5pdCB7XG4gIGNvbnRleHQ/OiBDb250ZXh0PFMsIEFTPjtcbn1cblxudHlwZSBBcHBsaWNhdGlvbkVycm9yRXZlbnRMaXN0ZW5lck9yRXZlbnRMaXN0ZW5lck9iamVjdDxTIGV4dGVuZHMgQVMsIEFTPiA9XG4gIHwgQXBwbGljYXRpb25FcnJvckV2ZW50TGlzdGVuZXI8UywgQVM+XG4gIHwgQXBwbGljYXRpb25FcnJvckV2ZW50TGlzdGVuZXJPYmplY3Q8UywgQVM+O1xuXG5pbnRlcmZhY2UgQXBwbGljYXRpb25MaXN0ZW5FdmVudExpc3RlbmVyIHtcbiAgKGV2dDogQXBwbGljYXRpb25MaXN0ZW5FdmVudCk6IHZvaWQgfCBQcm9taXNlPHZvaWQ+O1xufVxuXG5pbnRlcmZhY2UgQXBwbGljYXRpb25MaXN0ZW5FdmVudExpc3RlbmVyT2JqZWN0IHtcbiAgaGFuZGxlRXZlbnQoZXZ0OiBBcHBsaWNhdGlvbkxpc3RlbkV2ZW50KTogdm9pZCB8IFByb21pc2U8dm9pZD47XG59XG5cbmludGVyZmFjZSBBcHBsaWNhdGlvbkxpc3RlbkV2ZW50SW5pdCBleHRlbmRzIEV2ZW50SW5pdCB7XG4gIGhvc3RuYW1lOiBzdHJpbmc7XG4gIGxpc3RlbmVyOiBMaXN0ZW5lcjtcbiAgcG9ydDogbnVtYmVyO1xuICBzZWN1cmU6IGJvb2xlYW47XG4gIHNlcnZlclR5cGU6IFwibmF0aXZlXCIgfCBcImZsYXNoXCIgfCBcImN1c3RvbVwiO1xufVxuXG50eXBlIEFwcGxpY2F0aW9uTGlzdGVuRXZlbnRMaXN0ZW5lck9yRXZlbnRMaXN0ZW5lck9iamVjdCA9XG4gIHwgQXBwbGljYXRpb25MaXN0ZW5FdmVudExpc3RlbmVyXG4gIHwgQXBwbGljYXRpb25MaXN0ZW5FdmVudExpc3RlbmVyT2JqZWN0O1xuXG4vKiogQXZhaWxhYmxlIG9wdGlvbnMgdGhhdCBhcmUgdXNlZCB3aGVuIGNyZWF0aW5nIGEgbmV3IGluc3RhbmNlIG9mXG4gKiB7QGxpbmtjb2RlIEFwcGxpY2F0aW9ufS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQXBwbGljYXRpb25PcHRpb25zPFMsIFIgZXh0ZW5kcyBTZXJ2ZXJSZXF1ZXN0PiB7XG4gIC8qKiBEZXRlcm1pbmUgaG93IHdoZW4gY3JlYXRpbmcgYSBuZXcgY29udGV4dCwgdGhlIHN0YXRlIGZyb20gdGhlIGFwcGxpY2F0aW9uXG4gICAqIHNob3VsZCBiZSBhcHBsaWVkLiBBIHZhbHVlIG9mIGBcImNsb25lXCJgIHdpbGwgc2V0IHRoZSBzdGF0ZSBhcyBhIGNsb25lIG9mXG4gICAqIHRoZSBhcHAgc3RhdGUuIEFueSBub24tY2xvbmVhYmxlIG9yIG5vbi1lbnVtZXJhYmxlIHByb3BlcnRpZXMgd2lsbCBub3QgYmVcbiAgICogY29waWVkLiBBIHZhbHVlIG9mIGBcInByb3RvdHlwZVwiYCBtZWFucyB0aGF0IHRoZSBhcHBsaWNhdGlvbidzIHN0YXRlIHdpbGwgYmVcbiAgICogdXNlZCBhcyB0aGUgcHJvdG90eXBlIG9mIHRoZSB0aGUgY29udGV4dCdzIHN0YXRlLCBtZWFuaW5nIHNoYWxsb3dcbiAgICogcHJvcGVydGllcyBvbiB0aGUgY29udGV4dCdzIHN0YXRlIHdpbGwgbm90IGJlIHJlZmxlY3RlZCBpbiB0aGVcbiAgICogYXBwbGljYXRpb24ncyBzdGF0ZS4gQSB2YWx1ZSBvZiBgXCJhbGlhc1wiYCBtZWFucyB0aGF0IGFwcGxpY2F0aW9uJ3MgYC5zdGF0ZWBcbiAgICogYW5kIHRoZSBjb250ZXh0J3MgYC5zdGF0ZWAgd2lsbCBiZSBhIHJlZmVyZW5jZSB0byB0aGUgc2FtZSBvYmplY3QuIEEgdmFsdWVcbiAgICogb2YgYFwiZW1wdHlcImAgd2lsbCBpbml0aWFsaXplIHRoZSBjb250ZXh0J3MgYC5zdGF0ZWAgd2l0aCBhbiBlbXB0eSBvYmplY3QuXG4gICAqXG4gICAqIFRoZSBkZWZhdWx0IHZhbHVlIGlzIGBcImNsb25lXCJgLlxuICAgKi9cbiAgY29udGV4dFN0YXRlPzogXCJjbG9uZVwiIHwgXCJwcm90b3R5cGVcIiB8IFwiYWxpYXNcIiB8IFwiZW1wdHlcIjtcblxuICAvKiogQW4gb3B0aW9uYWwgcmVwbGFjZXIgZnVuY3Rpb24gdG8gYmUgdXNlZCB3aGVuIHNlcmlhbGl6aW5nIGEgSlNPTlxuICAgKiByZXNwb25zZS4gVGhlIHJlcGxhY2VyIHdpbGwgYmUgdXNlZCB3aXRoIGBKU09OLnN0cmluZ2lmeSgpYCB0byBlbmNvZGUgYW55XG4gICAqIHJlc3BvbnNlIGJvZGllcyB0aGF0IG5lZWQgdG8gYmUgY29udmVydGVkIGJlZm9yZSBzZW5kaW5nIHRoZSByZXNwb25zZS5cbiAgICpcbiAgICogVGhpcyBpcyBpbnRlbmRlZCB0byBhbGxvdyByZXNwb25zZXMgdG8gY29udGFpbiBiaWdpbnRzIGFuZCBjaXJjdWxhclxuICAgKiByZWZlcmVuY2VzIGFuZCBlbmNvZGluZyBvdGhlciB2YWx1ZXMgd2hpY2ggSlNPTiBkb2VzIG5vdCBzdXBwb3J0IGRpcmVjdGx5LlxuICAgKlxuICAgKiBUaGlzIGNhbiBiZSB1c2VkIGluIGNvbmp1bmN0aW9uIHdpdGggYGpzb25Cb2R5UmV2aXZlcmAgdG8gaGFuZGxlIGRlY29kaW5nXG4gICAqIG9mIHJlcXVlc3QgYm9kaWVzIGlmIHRoZSBzYW1lIHNlbWFudGljcyBhcmUgdXNlZCBmb3IgY2xpZW50IHJlcXVlc3RzLlxuICAgKlxuICAgKiBJZiBtb3JlIGRldGFpbGVkIG9yIGNvbmRpdGlvbmFsIHVzYWdlIGlzIHJlcXVpcmVkLCB0aGVuIHNlcmlhbGl6YXRpb25cbiAgICogc2hvdWxkIGJlIGltcGxlbWVudGVkIGRpcmVjdGx5IGluIG1pZGRsZXdhcmUuICovXG4gIGpzb25Cb2R5UmVwbGFjZXI/OiAoXG4gICAga2V5OiBzdHJpbmcsXG4gICAgdmFsdWU6IHVua25vd24sXG4gICAgY29udGV4dDogQ29udGV4dDxTPixcbiAgKSA9PiB1bmtub3duO1xuXG4gIC8qKiBBbiBvcHRpb25hbCByZXZpdmVyIGZ1bmN0aW9uIHRvIGJlIHVzZWQgd2hlbiBwYXJzaW5nIGEgSlNPTiByZXF1ZXN0LiBUaGVcbiAgICogcmV2aXZlciB3aWxsIGJlIHVzZWQgd2l0aCBgSlNPTi5wYXJzZSgpYCB0byBkZWNvZGUgYW55IHJlc3BvbnNlIGJvZGllcyB0aGF0XG4gICAqIGFyZSBiZWluZyBjb252ZXJ0ZWQgYXMgSlNPTi5cbiAgICpcbiAgICogVGhpcyBpcyBpbnRlbmRlZCB0byBhbGxvdyByZXF1ZXN0cyB0byBkZXNlcmlhbGl6ZSB0byBiaWdpbnRzLCBjaXJjdWxhclxuICAgKiByZWZlcmVuY2VzLCBvciBvdGhlciB2YWx1ZXMgd2hpY2ggSlNPTiBkb2VzIG5vdCBzdXBwb3J0IGRpcmVjdGx5LlxuICAgKlxuICAgKiBUaGlzIGNhbiBiZSB1c2VkIGluIGNvbmp1bmN0aW9uIHdpdGggYGpzb25Cb2R5UmVwbGFjZXJgIHRvIGhhbmRsZSBkZWNvZGluZ1xuICAgKiBvZiByZXNwb25zZSBib2RpZXMgaWYgdGhlIHNhbWUgc2VtYW50aWNzIGFyZSB1c2VkIGZvciByZXNwb25zZXMuXG4gICAqXG4gICAqIElmIG1vcmUgZGV0YWlsZWQgb3IgY29uZGl0aW9uYWwgdXNhZ2UgaXMgcmVxdWlyZWQsIHRoZW4gZGVzZXJpYWxpemF0aW9uXG4gICAqIHNob3VsZCBiZSBpbXBsZW1lbnRlZCBkaXJlY3RseSBpbiB0aGUgbWlkZGxld2FyZS5cbiAgICovXG4gIGpzb25Cb2R5UmV2aXZlcj86IChcbiAgICBrZXk6IHN0cmluZyxcbiAgICB2YWx1ZTogdW5rbm93bixcbiAgICBjb250ZXh0OiBDb250ZXh0PFM+LFxuICApID0+IHVua25vd247XG5cbiAgLyoqIEFuIGluaXRpYWwgc2V0IG9mIGtleXMgKG9yIGluc3RhbmNlIG9mIHtAbGlua2NvZGUgS2V5U3RhY2t9KSB0byBiZSB1c2VkIGZvciBzaWduaW5nXG4gICAqIGNvb2tpZXMgcHJvZHVjZWQgYnkgdGhlIGFwcGxpY2F0aW9uLiAqL1xuICBrZXlzPzogS2V5U3RhY2sgfCBLZXlbXTtcblxuICAvKiogSWYgYHRydWVgLCBhbnkgZXJyb3JzIGhhbmRsZWQgYnkgdGhlIGFwcGxpY2F0aW9uIHdpbGwgYmUgbG9nZ2VkIHRvIHRoZVxuICAgKiBzdGRlcnIuIElmIGBmYWxzZWAgbm90aGluZyB3aWxsIGJlIGxvZ2dlZC4gVGhlIGRlZmF1bHQgaXMgYHRydWVgLlxuICAgKlxuICAgKiBBbGwgZXJyb3JzIGFyZSBhdmFpbGFibGUgYXMgZXZlbnRzIG9uIHRoZSBhcHBsaWNhdGlvbiBvZiB0eXBlIGBcImVycm9yXCJgIGFuZFxuICAgKiBjYW4gYmUgYWNjZXNzZWQgZm9yIGN1c3RvbSBsb2dnaW5nL2FwcGxpY2F0aW9uIG1hbmFnZW1lbnQgdmlhIGFkZGluZyBhblxuICAgKiBldmVudCBsaXN0ZW5lciB0byB0aGUgYXBwbGljYXRpb246XG4gICAqXG4gICAqIGBgYHRzXG4gICAqIGNvbnN0IGFwcCA9IG5ldyBBcHBsaWNhdGlvbih7IGxvZ0Vycm9yczogZmFsc2UgfSk7XG4gICAqIGFwcC5hZGRFdmVudExpc3RlbmVyKFwiZXJyb3JcIiwgKGV2dCkgPT4ge1xuICAgKiAgIC8vIGV2dC5lcnJvciB3aWxsIGNvbnRhaW4gd2hhdCBlcnJvciB3YXMgdGhyb3duXG4gICAqIH0pO1xuICAgKiBgYGBcbiAgICovXG4gIGxvZ0Vycm9ycz86IGJvb2xlYW47XG5cbiAgLyoqIElmIHNldCB0byBgdHJ1ZWAsIHByb3h5IGhlYWRlcnMgd2lsbCBiZSB0cnVzdGVkIHdoZW4gcHJvY2Vzc2luZyByZXF1ZXN0cy5cbiAgICogVGhpcyBkZWZhdWx0cyB0byBgZmFsc2VgLiAqL1xuICBwcm94eT86IGJvb2xlYW47XG5cbiAgLyoqIEEgc2VydmVyIGNvbnN0cnVjdG9yIHRvIHVzZSBpbnN0ZWFkIG9mIHRoZSBkZWZhdWx0IHNlcnZlciBmb3IgcmVjZWl2aW5nXG4gICAqIHJlcXVlc3RzLlxuICAgKlxuICAgKiBHZW5lcmFsbHkgdGhpcyBpcyBvbmx5IHVzZWQgZm9yIHRlc3RpbmcuICovXG4gIHNlcnZlckNvbnN0cnVjdG9yPzogU2VydmVyQ29uc3RydWN0b3I8Uj47XG5cbiAgLyoqIFRoZSBpbml0aWFsIHN0YXRlIG9iamVjdCBmb3IgdGhlIGFwcGxpY2F0aW9uLCBvZiB3aGljaCB0aGUgdHlwZSBjYW4gYmVcbiAgICogdXNlZCB0byBpbmZlciB0aGUgdHlwZSBvZiB0aGUgc3RhdGUgZm9yIGJvdGggdGhlIGFwcGxpY2F0aW9uIGFuZCBhbnkgb2YgdGhlXG4gICAqIGFwcGxpY2F0aW9uJ3MgY29udGV4dC4gKi9cbiAgc3RhdGU/OiBTO1xufVxuXG5pbnRlcmZhY2UgUmVxdWVzdFN0YXRlIHtcbiAgaGFuZGxpbmc6IFNldDxQcm9taXNlPHZvaWQ+PjtcbiAgY2xvc2luZzogYm9vbGVhbjtcbiAgY2xvc2VkOiBib29sZWFuO1xuICBzZXJ2ZXI6IFNlcnZlcjxTZXJ2ZXJSZXF1ZXN0Pjtcbn1cblxuLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbmV4cG9ydCB0eXBlIFN0YXRlID0gUmVjb3JkPHN0cmluZyB8IG51bWJlciB8IHN5bWJvbCwgYW55PjtcblxuY29uc3QgQUREUl9SRUdFWFAgPSAvXlxcWz8oW15cXF1dKilcXF0/OihbMC05XXsxLDV9KSQvO1xuXG5jb25zdCBERUZBVUxUX1NFUlZFUjogU2VydmVyQ29uc3RydWN0b3I8U2VydmVyUmVxdWVzdD4gPSBIdHRwU2VydmVyO1xuXG5leHBvcnQgY2xhc3MgQXBwbGljYXRpb25FcnJvckV2ZW50PFMgZXh0ZW5kcyBBUywgQVMgZXh0ZW5kcyBTdGF0ZT5cbiAgZXh0ZW5kcyBFcnJvckV2ZW50IHtcbiAgY29udGV4dD86IENvbnRleHQ8UywgQVM+O1xuXG4gIGNvbnN0cnVjdG9yKGV2ZW50SW5pdERpY3Q6IEFwcGxpY2F0aW9uRXJyb3JFdmVudEluaXQ8UywgQVM+KSB7XG4gICAgc3VwZXIoXCJlcnJvclwiLCBldmVudEluaXREaWN0KTtcbiAgICB0aGlzLmNvbnRleHQgPSBldmVudEluaXREaWN0LmNvbnRleHQ7XG4gIH1cbn1cblxuZnVuY3Rpb24gbG9nRXJyb3JMaXN0ZW5lcjxTIGV4dGVuZHMgQVMsIEFTIGV4dGVuZHMgU3RhdGU+KFxuICB7IGVycm9yLCBjb250ZXh0IH06IEFwcGxpY2F0aW9uRXJyb3JFdmVudDxTLCBBUz4sXG4pIHtcbiAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKFxuICAgICAgYFt1bmNhdWdodCBhcHBsaWNhdGlvbiBlcnJvcl06ICR7ZXJyb3IubmFtZX0gLSAke2Vycm9yLm1lc3NhZ2V9YCxcbiAgICApO1xuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUuZXJyb3IoYFt1bmNhdWdodCBhcHBsaWNhdGlvbiBlcnJvcl1cXG5gLCBlcnJvcik7XG4gIH1cbiAgaWYgKGNvbnRleHQpIHtcbiAgICBsZXQgdXJsOiBzdHJpbmc7XG4gICAgdHJ5IHtcbiAgICAgIHVybCA9IGNvbnRleHQucmVxdWVzdC51cmwudG9TdHJpbmcoKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHVybCA9IFwiW21hbGZvcm1lZCB1cmxdXCI7XG4gICAgfVxuICAgIGNvbnNvbGUuZXJyb3IoYFxcbnJlcXVlc3Q6YCwge1xuICAgICAgdXJsLFxuICAgICAgbWV0aG9kOiBjb250ZXh0LnJlcXVlc3QubWV0aG9kLFxuICAgICAgaGFzQm9keTogY29udGV4dC5yZXF1ZXN0Lmhhc0JvZHksXG4gICAgfSk7XG4gICAgY29uc29sZS5lcnJvcihgcmVzcG9uc2U6YCwge1xuICAgICAgc3RhdHVzOiBjb250ZXh0LnJlc3BvbnNlLnN0YXR1cyxcbiAgICAgIHR5cGU6IGNvbnRleHQucmVzcG9uc2UudHlwZSxcbiAgICAgIGhhc0JvZHk6ICEhY29udGV4dC5yZXNwb25zZS5ib2R5LFxuICAgICAgd3JpdGFibGU6IGNvbnRleHQucmVzcG9uc2Uud3JpdGFibGUsXG4gICAgfSk7XG4gIH1cbiAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyb3Iuc3RhY2spIHtcbiAgICBjb25zb2xlLmVycm9yKGBcXG4ke2Vycm9yLnN0YWNrLnNwbGl0KFwiXFxuXCIpLnNsaWNlKDEpLmpvaW4oXCJcXG5cIil9YCk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEFwcGxpY2F0aW9uTGlzdGVuRXZlbnQgZXh0ZW5kcyBFdmVudCB7XG4gIGhvc3RuYW1lOiBzdHJpbmc7XG4gIGxpc3RlbmVyOiBMaXN0ZW5lcjtcbiAgcG9ydDogbnVtYmVyO1xuICBzZWN1cmU6IGJvb2xlYW47XG4gIHNlcnZlclR5cGU6IFwibmF0aXZlXCIgfCBcImZsYXNoXCIgfCBcImN1c3RvbVwiO1xuXG4gIGNvbnN0cnVjdG9yKGV2ZW50SW5pdERpY3Q6IEFwcGxpY2F0aW9uTGlzdGVuRXZlbnRJbml0KSB7XG4gICAgc3VwZXIoXCJsaXN0ZW5cIiwgZXZlbnRJbml0RGljdCk7XG4gICAgdGhpcy5ob3N0bmFtZSA9IGV2ZW50SW5pdERpY3QuaG9zdG5hbWU7XG4gICAgdGhpcy5saXN0ZW5lciA9IGV2ZW50SW5pdERpY3QubGlzdGVuZXI7XG4gICAgdGhpcy5wb3J0ID0gZXZlbnRJbml0RGljdC5wb3J0O1xuICAgIHRoaXMuc2VjdXJlID0gZXZlbnRJbml0RGljdC5zZWN1cmU7XG4gICAgdGhpcy5zZXJ2ZXJUeXBlID0gZXZlbnRJbml0RGljdC5zZXJ2ZXJUeXBlO1xuICB9XG59XG5cbi8qKiBBIGNsYXNzIHdoaWNoIHJlZ2lzdGVycyBtaWRkbGV3YXJlICh2aWEgYC51c2UoKWApIGFuZCB0aGVuIHByb2Nlc3Nlc1xuICogaW5ib3VuZCByZXF1ZXN0cyBhZ2FpbnN0IHRoYXQgbWlkZGxld2FyZSAodmlhIGAubGlzdGVuKClgKS5cbiAqXG4gKiBUaGUgYGNvbnRleHQuc3RhdGVgIGNhbiBiZSB0eXBlZCB2aWEgcGFzc2luZyBhIGdlbmVyaWMgYXJndW1lbnQgd2hlblxuICogY29uc3RydWN0aW5nIGFuIGluc3RhbmNlIG9mIGBBcHBsaWNhdGlvbmAuIEl0IGNhbiBhbHNvIGJlIGluZmVycmVkIGJ5IHNldHRpbmdcbiAqIHRoZSB7QGxpbmtjb2RlIEFwcGxpY2F0aW9uT3B0aW9ucy5zdGF0ZX0gb3B0aW9uIHdoZW4gY29uc3RydWN0aW5nIHRoZVxuICogYXBwbGljYXRpb24uXG4gKlxuICogIyMjIEJhc2ljIGV4YW1wbGVcbiAqXG4gKiBgYGB0c1xuICogaW1wb3J0IHsgQXBwbGljYXRpb24gfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQveC9vYWsvbW9kLnRzXCI7XG4gKlxuICogY29uc3QgYXBwID0gbmV3IEFwcGxpY2F0aW9uKCk7XG4gKlxuICogYXBwLnVzZSgoY3R4LCBuZXh0KSA9PiB7XG4gKiAgIC8vIGNhbGxlZCBvbiBlYWNoIHJlcXVlc3Qgd2l0aCB0aGUgY29udGV4dCAoYGN0eGApIG9mIHRoZSByZXF1ZXN0LFxuICogICAvLyByZXNwb25zZSwgYW5kIG90aGVyIGRhdGEuXG4gKiAgIC8vIGBuZXh0KClgIGlzIHVzZSB0byBtb2RpZnkgdGhlIGZsb3cgY29udHJvbCBvZiB0aGUgbWlkZGxld2FyZSBzdGFjay5cbiAqIH0pO1xuICpcbiAqIGFwcC5saXN0ZW4oeyBwb3J0OiA4MDgwIH0pO1xuICogYGBgXG4gKlxuICogQHRlbXBsYXRlIEFTIHRoZSB0eXBlIG9mIHRoZSBhcHBsaWNhdGlvbiBzdGF0ZSB3aGljaCBleHRlbmRzXG4gKiAgICAgICAgICAgICAge0BsaW5rY29kZSBTdGF0ZX0gYW5kIGRlZmF1bHRzIHRvIGEgc2ltcGxlIHN0cmluZyByZWNvcmQuXG4gKi9cbi8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG5leHBvcnQgY2xhc3MgQXBwbGljYXRpb248QVMgZXh0ZW5kcyBTdGF0ZSA9IFJlY29yZDxzdHJpbmcsIGFueT4+XG4gIGV4dGVuZHMgRXZlbnRUYXJnZXQge1xuICAjY29tcG9zZWRNaWRkbGV3YXJlPzogKGNvbnRleHQ6IENvbnRleHQ8QVMsIEFTPikgPT4gUHJvbWlzZTx1bmtub3duPjtcbiAgI2NvbnRleHRPcHRpb25zOiBQaWNrPFxuICAgIEFwcGxpY2F0aW9uT3B0aW9uczxBUywgU2VydmVyUmVxdWVzdD4sXG4gICAgXCJqc29uQm9keVJlcGxhY2VyXCIgfCBcImpzb25Cb2R5UmV2aXZlclwiXG4gID47XG4gICNjb250ZXh0U3RhdGU6IFwiY2xvbmVcIiB8IFwicHJvdG90eXBlXCIgfCBcImFsaWFzXCIgfCBcImVtcHR5XCI7XG4gICNrZXlzPzogS2V5U3RhY2s7XG4gICNtaWRkbGV3YXJlOiBNaWRkbGV3YXJlPFN0YXRlLCBDb250ZXh0PFN0YXRlLCBBUz4+W10gPSBbXTtcbiAgI3NlcnZlckNvbnN0cnVjdG9yOiBTZXJ2ZXJDb25zdHJ1Y3RvcjxTZXJ2ZXJSZXF1ZXN0PjtcblxuICAvKiogQSBzZXQgb2Yga2V5cywgb3IgYW4gaW5zdGFuY2Ugb2YgYEtleVN0YWNrYCB3aGljaCB3aWxsIGJlIHVzZWQgdG8gc2lnblxuICAgKiBjb29raWVzIHJlYWQgYW5kIHNldCBieSB0aGUgYXBwbGljYXRpb24gdG8gYXZvaWQgdGFtcGVyaW5nIHdpdGggdGhlXG4gICAqIGNvb2tpZXMuICovXG4gIGdldCBrZXlzKCk6IEtleVN0YWNrIHwgS2V5W10gfCB1bmRlZmluZWQge1xuICAgIHJldHVybiB0aGlzLiNrZXlzO1xuICB9XG5cbiAgc2V0IGtleXMoa2V5czogS2V5U3RhY2sgfCBLZXlbXSB8IHVuZGVmaW5lZCkge1xuICAgIGlmICgha2V5cykge1xuICAgICAgdGhpcy4ja2V5cyA9IHVuZGVmaW5lZDtcbiAgICAgIHJldHVybjtcbiAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoa2V5cykpIHtcbiAgICAgIHRoaXMuI2tleXMgPSBuZXcgS2V5U3RhY2soa2V5cyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuI2tleXMgPSBrZXlzO1xuICAgIH1cbiAgfVxuXG4gIC8qKiBJZiBgdHJ1ZWAsIHByb3h5IGhlYWRlcnMgd2lsbCBiZSB0cnVzdGVkIHdoZW4gcHJvY2Vzc2luZyByZXF1ZXN0cy4gIFRoaXNcbiAgICogZGVmYXVsdHMgdG8gYGZhbHNlYC4gKi9cbiAgcHJveHk6IGJvb2xlYW47XG5cbiAgLyoqIEdlbmVyaWMgc3RhdGUgb2YgdGhlIGFwcGxpY2F0aW9uLCB3aGljaCBjYW4gYmUgc3BlY2lmaWVkIGJ5IHBhc3NpbmcgdGhlXG4gICAqIGdlbmVyaWMgYXJndW1lbnQgd2hlbiBjb25zdHJ1Y3Rpbmc6XG4gICAqXG4gICAqICAgICAgIGNvbnN0IGFwcCA9IG5ldyBBcHBsaWNhdGlvbjx7IGZvbzogc3RyaW5nIH0+KCk7XG4gICAqXG4gICAqIE9yIGNhbiBiZSBjb250ZXh0dWFsbHkgaW5mZXJyZWQgYmFzZWQgb24gc2V0dGluZyBhbiBpbml0aWFsIHN0YXRlIG9iamVjdDpcbiAgICpcbiAgICogICAgICAgY29uc3QgYXBwID0gbmV3IEFwcGxpY2F0aW9uKHsgc3RhdGU6IHsgZm9vOiBcImJhclwiIH0gfSk7XG4gICAqXG4gICAqIFdoZW4gYSBuZXcgY29udGV4dCBpcyBjcmVhdGVkLCB0aGUgYXBwbGljYXRpb24ncyBzdGF0ZSBpcyBjbG9uZWQgYW5kIHRoZVxuICAgKiBzdGF0ZSBpcyB1bmlxdWUgdG8gdGhhdCByZXF1ZXN0L3Jlc3BvbnNlLiAgQ2hhbmdlcyBjYW4gYmUgbWFkZSB0byB0aGVcbiAgICogYXBwbGljYXRpb24gc3RhdGUgdGhhdCB3aWxsIGJlIHNoYXJlZCB3aXRoIGFsbCBjb250ZXh0cy5cbiAgICovXG4gIHN0YXRlOiBBUztcblxuICBjb25zdHJ1Y3RvcihvcHRpb25zOiBBcHBsaWNhdGlvbk9wdGlvbnM8QVMsIFNlcnZlclJlcXVlc3Q+ID0ge30pIHtcbiAgICBzdXBlcigpO1xuICAgIGNvbnN0IHtcbiAgICAgIHN0YXRlLFxuICAgICAga2V5cyxcbiAgICAgIHByb3h5LFxuICAgICAgc2VydmVyQ29uc3RydWN0b3IgPSBERUZBVUxUX1NFUlZFUixcbiAgICAgIGNvbnRleHRTdGF0ZSA9IFwiY2xvbmVcIixcbiAgICAgIGxvZ0Vycm9ycyA9IHRydWUsXG4gICAgICAuLi5jb250ZXh0T3B0aW9uc1xuICAgIH0gPSBvcHRpb25zO1xuXG4gICAgdGhpcy5wcm94eSA9IHByb3h5ID8/IGZhbHNlO1xuICAgIHRoaXMua2V5cyA9IGtleXM7XG4gICAgdGhpcy5zdGF0ZSA9IHN0YXRlID8/IHt9IGFzIEFTO1xuICAgIHRoaXMuI3NlcnZlckNvbnN0cnVjdG9yID0gc2VydmVyQ29uc3RydWN0b3I7XG4gICAgdGhpcy4jY29udGV4dE9wdGlvbnMgPSBjb250ZXh0T3B0aW9ucztcbiAgICB0aGlzLiNjb250ZXh0U3RhdGUgPSBjb250ZXh0U3RhdGU7XG5cbiAgICBpZiAobG9nRXJyb3JzKSB7XG4gICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXIoXCJlcnJvclwiLCBsb2dFcnJvckxpc3RlbmVyKTtcbiAgICB9XG4gIH1cblxuICAjZ2V0Q29tcG9zZWQoKTogKGNvbnRleHQ6IENvbnRleHQ8QVMsIEFTPikgPT4gUHJvbWlzZTx1bmtub3duPiB7XG4gICAgaWYgKCF0aGlzLiNjb21wb3NlZE1pZGRsZXdhcmUpIHtcbiAgICAgIHRoaXMuI2NvbXBvc2VkTWlkZGxld2FyZSA9IGNvbXBvc2UodGhpcy4jbWlkZGxld2FyZSk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLiNjb21wb3NlZE1pZGRsZXdhcmU7XG4gIH1cblxuICAjZ2V0Q29udGV4dFN0YXRlKCk6IEFTIHtcbiAgICBzd2l0Y2ggKHRoaXMuI2NvbnRleHRTdGF0ZSkge1xuICAgICAgY2FzZSBcImFsaWFzXCI6XG4gICAgICAgIHJldHVybiB0aGlzLnN0YXRlO1xuICAgICAgY2FzZSBcImNsb25lXCI6XG4gICAgICAgIHJldHVybiBjbG9uZVN0YXRlKHRoaXMuc3RhdGUpO1xuICAgICAgY2FzZSBcImVtcHR5XCI6XG4gICAgICAgIHJldHVybiB7fSBhcyBBUztcbiAgICAgIGNhc2UgXCJwcm90b3R5cGVcIjpcbiAgICAgICAgcmV0dXJuIE9iamVjdC5jcmVhdGUodGhpcy5zdGF0ZSk7XG4gICAgfVxuICB9XG5cbiAgLyoqIERlYWwgd2l0aCB1bmNhdWdodCBlcnJvcnMgaW4gZWl0aGVyIHRoZSBtaWRkbGV3YXJlIG9yIHNlbmRpbmcgdGhlXG4gICAqIHJlc3BvbnNlLiAqL1xuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAjaGFuZGxlRXJyb3IoY29udGV4dDogQ29udGV4dDxBUz4sIGVycm9yOiBhbnkpOiB2b2lkIHtcbiAgICBpZiAoIShlcnJvciBpbnN0YW5jZW9mIEVycm9yKSkge1xuICAgICAgZXJyb3IgPSBuZXcgRXJyb3IoYG5vbi1lcnJvciB0aHJvd246ICR7SlNPTi5zdHJpbmdpZnkoZXJyb3IpfWApO1xuICAgIH1cbiAgICBjb25zdCB7IG1lc3NhZ2UgfSA9IGVycm9yO1xuICAgIHRoaXMuZGlzcGF0Y2hFdmVudChuZXcgQXBwbGljYXRpb25FcnJvckV2ZW50KHsgY29udGV4dCwgbWVzc2FnZSwgZXJyb3IgfSkpO1xuICAgIGlmICghY29udGV4dC5yZXNwb25zZS53cml0YWJsZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBbLi4uY29udGV4dC5yZXNwb25zZS5oZWFkZXJzLmtleXMoKV0pIHtcbiAgICAgIGNvbnRleHQucmVzcG9uc2UuaGVhZGVycy5kZWxldGUoa2V5KTtcbiAgICB9XG4gICAgaWYgKGVycm9yLmhlYWRlcnMgJiYgZXJyb3IuaGVhZGVycyBpbnN0YW5jZW9mIEhlYWRlcnMpIHtcbiAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIGVycm9yLmhlYWRlcnMpIHtcbiAgICAgICAgY29udGV4dC5yZXNwb25zZS5oZWFkZXJzLnNldChrZXksIHZhbHVlKTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29udGV4dC5yZXNwb25zZS50eXBlID0gXCJ0ZXh0XCI7XG4gICAgY29uc3Qgc3RhdHVzOiBTdGF0dXMgPSBjb250ZXh0LnJlc3BvbnNlLnN0YXR1cyA9XG4gICAgICBEZW5vLmVycm9ycyAmJiBlcnJvciBpbnN0YW5jZW9mIERlbm8uZXJyb3JzLk5vdEZvdW5kXG4gICAgICAgID8gNDA0XG4gICAgICAgIDogZXJyb3Iuc3RhdHVzICYmIHR5cGVvZiBlcnJvci5zdGF0dXMgPT09IFwibnVtYmVyXCJcbiAgICAgICAgPyBlcnJvci5zdGF0dXNcbiAgICAgICAgOiA1MDA7XG4gICAgY29udGV4dC5yZXNwb25zZS5ib2R5ID0gZXJyb3IuZXhwb3NlID8gZXJyb3IubWVzc2FnZSA6IFNUQVRVU19URVhUW3N0YXR1c107XG4gIH1cblxuICAvKiogUHJvY2Vzc2luZyByZWdpc3RlcmVkIG1pZGRsZXdhcmUgb24gZWFjaCByZXF1ZXN0LiAqL1xuICBhc3luYyAjaGFuZGxlUmVxdWVzdChcbiAgICByZXF1ZXN0OiBTZXJ2ZXJSZXF1ZXN0LFxuICAgIHNlY3VyZTogYm9vbGVhbixcbiAgICBzdGF0ZTogUmVxdWVzdFN0YXRlLFxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBjb250ZXh0ID0gbmV3IENvbnRleHQoXG4gICAgICB0aGlzLFxuICAgICAgcmVxdWVzdCxcbiAgICAgIHRoaXMuI2dldENvbnRleHRTdGF0ZSgpLFxuICAgICAgeyBzZWN1cmUsIC4uLnRoaXMuI2NvbnRleHRPcHRpb25zIH0sXG4gICAgKTtcbiAgICBsZXQgcmVzb2x2ZTogKCkgPT4gdm9pZDtcbiAgICBjb25zdCBoYW5kbGluZ1Byb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPigocmVzKSA9PiByZXNvbHZlID0gcmVzKTtcbiAgICBzdGF0ZS5oYW5kbGluZy5hZGQoaGFuZGxpbmdQcm9taXNlKTtcbiAgICBpZiAoIXN0YXRlLmNsb3NpbmcgJiYgIXN0YXRlLmNsb3NlZCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy4jZ2V0Q29tcG9zZWQoKShjb250ZXh0KTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICB0aGlzLiNoYW5kbGVFcnJvcihjb250ZXh0LCBlcnIpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoY29udGV4dC5yZXNwb25kID09PSBmYWxzZSkge1xuICAgICAgY29udGV4dC5yZXNwb25zZS5kZXN0cm95KCk7XG4gICAgICByZXNvbHZlISgpO1xuICAgICAgc3RhdGUuaGFuZGxpbmcuZGVsZXRlKGhhbmRsaW5nUHJvbWlzZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGxldCBjbG9zZVJlc291cmNlcyA9IHRydWU7XG4gICAgbGV0IHJlc3BvbnNlOiBSZXNwb25zZTtcbiAgICB0cnkge1xuICAgICAgY2xvc2VSZXNvdXJjZXMgPSBmYWxzZTtcbiAgICAgIHJlc3BvbnNlID0gYXdhaXQgY29udGV4dC5yZXNwb25zZS50b0RvbVJlc3BvbnNlKCk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICB0aGlzLiNoYW5kbGVFcnJvcihjb250ZXh0LCBlcnIpO1xuICAgICAgcmVzcG9uc2UgPSBhd2FpdCBjb250ZXh0LnJlc3BvbnNlLnRvRG9tUmVzcG9uc2UoKTtcbiAgICB9XG4gICAgYXNzZXJ0KHJlc3BvbnNlKTtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgcmVxdWVzdC5yZXNwb25kKHJlc3BvbnNlKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIHRoaXMuI2hhbmRsZUVycm9yKGNvbnRleHQsIGVycik7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGNvbnRleHQucmVzcG9uc2UuZGVzdHJveShjbG9zZVJlc291cmNlcyk7XG4gICAgICByZXNvbHZlISgpO1xuICAgICAgc3RhdGUuaGFuZGxpbmcuZGVsZXRlKGhhbmRsaW5nUHJvbWlzZSk7XG4gICAgICBpZiAoc3RhdGUuY2xvc2luZykge1xuICAgICAgICBhd2FpdCBzdGF0ZS5zZXJ2ZXIuY2xvc2UoKTtcbiAgICAgICAgc3RhdGUuY2xvc2VkID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKiogQWRkIGFuIGV2ZW50IGxpc3RlbmVyIGZvciBhbiBgXCJlcnJvclwiYCBldmVudCB3aGljaCBvY2N1cnMgd2hlbiBhblxuICAgKiB1bi1jYXVnaHQgZXJyb3Igb2NjdXJzIHdoZW4gcHJvY2Vzc2luZyB0aGUgbWlkZGxld2FyZSBvciBkdXJpbmcgcHJvY2Vzc2luZ1xuICAgKiBvZiB0aGUgcmVzcG9uc2UuICovXG4gIGFkZEV2ZW50TGlzdGVuZXI8UyBleHRlbmRzIEFTPihcbiAgICB0eXBlOiBcImVycm9yXCIsXG4gICAgbGlzdGVuZXI6IEFwcGxpY2F0aW9uRXJyb3JFdmVudExpc3RlbmVyT3JFdmVudExpc3RlbmVyT2JqZWN0PFMsIEFTPiB8IG51bGwsXG4gICAgb3B0aW9ucz86IGJvb2xlYW4gfCBBZGRFdmVudExpc3RlbmVyT3B0aW9ucyxcbiAgKTogdm9pZDtcbiAgLyoqIEFkZCBhbiBldmVudCBsaXN0ZW5lciBmb3IgYSBgXCJsaXN0ZW5cImAgZXZlbnQgd2hpY2ggb2NjdXJzIHdoZW4gdGhlIHNlcnZlclxuICAgKiBoYXMgc3VjY2Vzc2Z1bGx5IG9wZW5lZCBidXQgYmVmb3JlIGFueSByZXF1ZXN0cyBzdGFydCBiZWluZyBwcm9jZXNzZWQuICovXG4gIGFkZEV2ZW50TGlzdGVuZXIoXG4gICAgdHlwZTogXCJsaXN0ZW5cIixcbiAgICBsaXN0ZW5lcjogQXBwbGljYXRpb25MaXN0ZW5FdmVudExpc3RlbmVyT3JFdmVudExpc3RlbmVyT2JqZWN0IHwgbnVsbCxcbiAgICBvcHRpb25zPzogYm9vbGVhbiB8IEFkZEV2ZW50TGlzdGVuZXJPcHRpb25zLFxuICApOiB2b2lkO1xuICAvKiogQWRkIGFuIGV2ZW50IGxpc3RlbmVyIGZvciBhbiBldmVudC4gIEN1cnJlbnRseSB2YWxpZCBldmVudCB0eXBlcyBhcmVcbiAgICogYFwiZXJyb3JcImAgYW5kIGBcImxpc3RlblwiYC4gKi9cbiAgYWRkRXZlbnRMaXN0ZW5lcihcbiAgICB0eXBlOiBcImVycm9yXCIgfCBcImxpc3RlblwiLFxuICAgIGxpc3RlbmVyOiBFdmVudExpc3RlbmVyT3JFdmVudExpc3RlbmVyT2JqZWN0IHwgbnVsbCxcbiAgICBvcHRpb25zPzogYm9vbGVhbiB8IEFkZEV2ZW50TGlzdGVuZXJPcHRpb25zLFxuICApOiB2b2lkIHtcbiAgICBzdXBlci5hZGRFdmVudExpc3RlbmVyKHR5cGUsIGxpc3RlbmVyLCBvcHRpb25zKTtcbiAgfVxuXG4gIC8qKiBIYW5kbGUgYW4gaW5kaXZpZHVhbCBzZXJ2ZXIgcmVxdWVzdCwgcmV0dXJuaW5nIHRoZSBzZXJ2ZXIgcmVzcG9uc2UuICBUaGlzXG4gICAqIGlzIHNpbWlsYXIgdG8gYC5saXN0ZW4oKWAsIGJ1dCBvcGVuaW5nIHRoZSBjb25uZWN0aW9uIGFuZCByZXRyaWV2aW5nXG4gICAqIHJlcXVlc3RzIGFyZSBub3QgdGhlIHJlc3BvbnNpYmlsaXR5IG9mIHRoZSBhcHBsaWNhdGlvbi4gIElmIHRoZSBnZW5lcmF0ZWRcbiAgICogY29udGV4dCBnZXRzIHNldCB0byBub3QgdG8gcmVzcG9uZCwgdGhlbiB0aGUgbWV0aG9kIHJlc29sdmVzIHdpdGhcbiAgICogYHVuZGVmaW5lZGAsIG90aGVyd2lzZSBpdCByZXNvbHZlcyB3aXRoIGEgcmVxdWVzdCB0aGF0IGlzIGNvbXBhdGlibGUgd2l0aFxuICAgKiBgc3RkL2h0dHAvc2VydmVyYC4gKi9cbiAgaGFuZGxlID0gKGFzeW5jIChcbiAgICByZXF1ZXN0OiBSZXF1ZXN0LFxuICAgIHNlY3VyZU9yQ29ubjogRGVuby5Db25uIHwgYm9vbGVhbiB8IHVuZGVmaW5lZCxcbiAgICBzZWN1cmU6IGJvb2xlYW4gfCB1bmRlZmluZWQgPSBmYWxzZSxcbiAgKTogUHJvbWlzZTxSZXNwb25zZSB8IHVuZGVmaW5lZD4gPT4ge1xuICAgIGlmICghdGhpcy4jbWlkZGxld2FyZS5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJUaGVyZSBpcyBubyBtaWRkbGV3YXJlIHRvIHByb2Nlc3MgcmVxdWVzdHMuXCIpO1xuICAgIH1cbiAgICBhc3NlcnQoaXNDb25uKHNlY3VyZU9yQ29ubikgfHwgdHlwZW9mIHNlY3VyZU9yQ29ubiA9PT0gXCJ1bmRlZmluZWRcIik7XG4gICAgY29uc3QgY29udGV4dFJlcXVlc3QgPSBuZXcgTmF0aXZlUmVxdWVzdCh7XG4gICAgICByZXF1ZXN0LFxuICAgICAgcmVzcG9uZFdpdGgoKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcbiAgICAgIH0sXG4gICAgfSwgeyBjb25uOiBzZWN1cmVPckNvbm4gfSk7XG4gICAgY29uc3QgY29udGV4dCA9IG5ldyBDb250ZXh0KFxuICAgICAgdGhpcyxcbiAgICAgIGNvbnRleHRSZXF1ZXN0LFxuICAgICAgdGhpcy4jZ2V0Q29udGV4dFN0YXRlKCksXG4gICAgICB7IHNlY3VyZSwgLi4udGhpcy4jY29udGV4dE9wdGlvbnMgfSxcbiAgICApO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCB0aGlzLiNnZXRDb21wb3NlZCgpKGNvbnRleHQpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgdGhpcy4jaGFuZGxlRXJyb3IoY29udGV4dCwgZXJyKTtcbiAgICB9XG4gICAgaWYgKGNvbnRleHQucmVzcG9uZCA9PT0gZmFsc2UpIHtcbiAgICAgIGNvbnRleHQucmVzcG9uc2UuZGVzdHJveSgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjb250ZXh0LnJlc3BvbnNlLnRvRG9tUmVzcG9uc2UoKTtcbiAgICAgIGNvbnRleHQucmVzcG9uc2UuZGVzdHJveShmYWxzZSk7XG4gICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICB0aGlzLiNoYW5kbGVFcnJvcihjb250ZXh0LCBlcnIpO1xuICAgICAgdGhyb3cgZXJyO1xuICAgIH1cbiAgfSkgYXMgSGFuZGxlTWV0aG9kO1xuXG4gIC8qKiBTdGFydCBsaXN0ZW5pbmcgZm9yIHJlcXVlc3RzLCBwcm9jZXNzaW5nIHJlZ2lzdGVyZWQgbWlkZGxld2FyZSBvbiBlYWNoXG4gICAqIHJlcXVlc3QuICBJZiB0aGUgb3B0aW9ucyBgLnNlY3VyZWAgaXMgdW5kZWZpbmVkIG9yIGBmYWxzZWAsIHRoZSBsaXN0ZW5pbmdcbiAgICogd2lsbCBiZSBvdmVyIEhUVFAuICBJZiB0aGUgb3B0aW9ucyBgLnNlY3VyZWAgcHJvcGVydHkgaXMgYHRydWVgLCBhXG4gICAqIGAuY2VydEZpbGVgIGFuZCBhIGAua2V5RmlsZWAgcHJvcGVydHkgbmVlZCB0byBiZSBzdXBwbGllZCBhbmQgcmVxdWVzdHNcbiAgICogd2lsbCBiZSBwcm9jZXNzZWQgb3ZlciBIVFRQUy4gKi9cbiAgYXN5bmMgbGlzdGVuKGFkZHI6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG4gIC8qKiBTdGFydCBsaXN0ZW5pbmcgZm9yIHJlcXVlc3RzLCBwcm9jZXNzaW5nIHJlZ2lzdGVyZWQgbWlkZGxld2FyZSBvbiBlYWNoXG4gICAqIHJlcXVlc3QuICBJZiB0aGUgb3B0aW9ucyBgLnNlY3VyZWAgaXMgdW5kZWZpbmVkIG9yIGBmYWxzZWAsIHRoZSBsaXN0ZW5pbmdcbiAgICogd2lsbCBiZSBvdmVyIEhUVFAuICBJZiB0aGUgb3B0aW9ucyBgLnNlY3VyZWAgcHJvcGVydHkgaXMgYHRydWVgLCBhXG4gICAqIGAuY2VydEZpbGVgIGFuZCBhIGAua2V5RmlsZWAgcHJvcGVydHkgbmVlZCB0byBiZSBzdXBwbGllZCBhbmQgcmVxdWVzdHNcbiAgICogd2lsbCBiZSBwcm9jZXNzZWQgb3ZlciBIVFRQUy5cbiAgICpcbiAgICogT21pdHRpbmcgb3B0aW9ucyB3aWxsIGRlZmF1bHQgdG8gYHsgcG9ydDogMCB9YCB3aGljaCBhbGxvd3MgdGhlIG9wZXJhdGluZ1xuICAgKiBzeXN0ZW0gdG8gc2VsZWN0IHRoZSBwb3J0LiAqL1xuICBhc3luYyBsaXN0ZW4ob3B0aW9ucz86IExpc3Rlbk9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuICBhc3luYyBsaXN0ZW4ob3B0aW9uczogc3RyaW5nIHwgTGlzdGVuT3B0aW9ucyA9IHsgcG9ydDogMCB9KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCF0aGlzLiNtaWRkbGV3YXJlLmxlbmd0aCkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIlRoZXJlIGlzIG5vIG1pZGRsZXdhcmUgdG8gcHJvY2VzcyByZXF1ZXN0cy5cIik7XG4gICAgfVxuICAgIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgY29uc3QgbWF0Y2ggPSBBRERSX1JFR0VYUC5leGVjKG9wdGlvbnMpO1xuICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICB0aHJvdyBUeXBlRXJyb3IoYEludmFsaWQgYWRkcmVzcyBwYXNzZWQ6IFwiJHtvcHRpb25zfVwiYCk7XG4gICAgICB9XG4gICAgICBjb25zdCBbLCBob3N0bmFtZSwgcG9ydFN0cl0gPSBtYXRjaDtcbiAgICAgIG9wdGlvbnMgPSB7IGhvc3RuYW1lLCBwb3J0OiBwYXJzZUludChwb3J0U3RyLCAxMCkgfTtcbiAgICB9XG4gICAgb3B0aW9ucyA9IE9iamVjdC5hc3NpZ24oeyBwb3J0OiAwIH0sIG9wdGlvbnMpO1xuICAgIGNvbnN0IHNlcnZlciA9IG5ldyB0aGlzLiNzZXJ2ZXJDb25zdHJ1Y3RvcihcbiAgICAgIHRoaXMsXG4gICAgICBvcHRpb25zIGFzIERlbm8uTGlzdGVuT3B0aW9ucyxcbiAgICApO1xuICAgIGNvbnN0IHsgc2lnbmFsIH0gPSBvcHRpb25zO1xuICAgIGNvbnN0IHN0YXRlID0ge1xuICAgICAgY2xvc2VkOiBmYWxzZSxcbiAgICAgIGNsb3Npbmc6IGZhbHNlLFxuICAgICAgaGFuZGxpbmc6IG5ldyBTZXQ8UHJvbWlzZTx2b2lkPj4oKSxcbiAgICAgIHNlcnZlcixcbiAgICB9O1xuICAgIGlmIChzaWduYWwpIHtcbiAgICAgIHNpZ25hbC5hZGRFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgKCkgPT4ge1xuICAgICAgICBpZiAoIXN0YXRlLmhhbmRsaW5nLnNpemUpIHtcbiAgICAgICAgICBzZXJ2ZXIuY2xvc2UoKTtcbiAgICAgICAgICBzdGF0ZS5jbG9zZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHN0YXRlLmNsb3NpbmcgPSB0cnVlO1xuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IHsgc2VjdXJlID0gZmFsc2UgfSA9IG9wdGlvbnM7XG4gICAgY29uc3Qgc2VydmVyVHlwZSA9IHNlcnZlciBpbnN0YW5jZW9mIEh0dHBTZXJ2ZXJcbiAgICAgID8gXCJuYXRpdmVcIlxuICAgICAgOiBzZXJ2ZXIgaW5zdGFuY2VvZiBGbGFzaFNlcnZlclxuICAgICAgPyBcImZsYXNoXCJcbiAgICAgIDogXCJjdXN0b21cIjtcbiAgICBjb25zdCBsaXN0ZW5lciA9IGF3YWl0IHNlcnZlci5saXN0ZW4oKTtcbiAgICBjb25zdCB7IGhvc3RuYW1lLCBwb3J0IH0gPSBsaXN0ZW5lci5hZGRyIGFzIERlbm8uTmV0QWRkcjtcbiAgICB0aGlzLmRpc3BhdGNoRXZlbnQoXG4gICAgICBuZXcgQXBwbGljYXRpb25MaXN0ZW5FdmVudCh7XG4gICAgICAgIGhvc3RuYW1lLFxuICAgICAgICBsaXN0ZW5lcixcbiAgICAgICAgcG9ydCxcbiAgICAgICAgc2VjdXJlLFxuICAgICAgICBzZXJ2ZXJUeXBlLFxuICAgICAgfSksXG4gICAgKTtcbiAgICB0cnkge1xuICAgICAgZm9yIGF3YWl0IChjb25zdCByZXF1ZXN0IG9mIHNlcnZlcikge1xuICAgICAgICB0aGlzLiNoYW5kbGVSZXF1ZXN0KHJlcXVlc3QsIHNlY3VyZSwgc3RhdGUpO1xuICAgICAgfVxuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoc3RhdGUuaGFuZGxpbmcpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvclxuICAgICAgICA/IGVycm9yLm1lc3NhZ2VcbiAgICAgICAgOiBcIkFwcGxpY2F0aW9uIEVycm9yXCI7XG4gICAgICB0aGlzLmRpc3BhdGNoRXZlbnQoXG4gICAgICAgIG5ldyBBcHBsaWNhdGlvbkVycm9yRXZlbnQoeyBtZXNzYWdlLCBlcnJvciB9KSxcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgLyoqIFJlZ2lzdGVyIG1pZGRsZXdhcmUgdG8gYmUgdXNlZCB3aXRoIHRoZSBhcHBsaWNhdGlvbi4gIE1pZGRsZXdhcmUgd2lsbFxuICAgKiBiZSBwcm9jZXNzZWQgaW4gdGhlIG9yZGVyIGl0IGlzIGFkZGVkLCBidXQgbWlkZGxld2FyZSBjYW4gY29udHJvbCB0aGUgZmxvd1xuICAgKiBvZiBleGVjdXRpb24gdmlhIHRoZSB1c2Ugb2YgdGhlIGBuZXh0KClgIGZ1bmN0aW9uIHRoYXQgdGhlIG1pZGRsZXdhcmVcbiAgICogZnVuY3Rpb24gd2lsbCBiZSBjYWxsZWQgd2l0aC4gIFRoZSBgY29udGV4dGAgb2JqZWN0IHByb3ZpZGVzIGluZm9ybWF0aW9uXG4gICAqIGFib3V0IHRoZSBjdXJyZW50IHN0YXRlIG9mIHRoZSBhcHBsaWNhdGlvbi5cbiAgICpcbiAgICogQmFzaWMgdXNhZ2U6XG4gICAqXG4gICAqIGBgYHRzXG4gICAqIGNvbnN0IGltcG9ydCB7IEFwcGxpY2F0aW9uIH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrL21vZC50c1wiO1xuICAgKlxuICAgKiBjb25zdCBhcHAgPSBuZXcgQXBwbGljYXRpb24oKTtcbiAgICpcbiAgICogYXBwLnVzZSgoY3R4LCBuZXh0KSA9PiB7XG4gICAqICAgY3R4LnJlcXVlc3Q7IC8vIGNvbnRhaW5zIHJlcXVlc3QgaW5mb3JtYXRpb25cbiAgICogICBjdHgucmVzcG9uc2U7IC8vIHNldHVwcyB1cCBpbmZvcm1hdGlvbiB0byB1c2UgaW4gdGhlIHJlc3BvbnNlO1xuICAgKiAgIGF3YWl0IG5leHQoKTsgLy8gbWFuYWdlcyB0aGUgZmxvdyBjb250cm9sIG9mIHRoZSBtaWRkbGV3YXJlIGV4ZWN1dGlvblxuICAgKiB9KTtcbiAgICpcbiAgICogYXdhaXQgYXBwLmxpc3Rlbih7IHBvcnQ6IDgwIH0pO1xuICAgKiBgYGBcbiAgICovXG4gIHVzZTxTIGV4dGVuZHMgU3RhdGUgPSBBUz4oXG4gICAgbWlkZGxld2FyZTogTWlkZGxld2FyZTxTLCBDb250ZXh0PFMsIEFTPj4sXG4gICAgLi4ubWlkZGxld2FyZXM6IE1pZGRsZXdhcmU8UywgQ29udGV4dDxTLCBBUz4+W11cbiAgKTogQXBwbGljYXRpb248UyBleHRlbmRzIEFTID8gUyA6IChTICYgQVMpPjtcbiAgdXNlPFMgZXh0ZW5kcyBTdGF0ZSA9IEFTPihcbiAgICAuLi5taWRkbGV3YXJlOiBNaWRkbGV3YXJlPFMsIENvbnRleHQ8UywgQVM+PltdXG4gICk6IEFwcGxpY2F0aW9uPFMgZXh0ZW5kcyBBUyA/IFMgOiAoUyAmIEFTKT4ge1xuICAgIHRoaXMuI21pZGRsZXdhcmUucHVzaCguLi5taWRkbGV3YXJlKTtcbiAgICB0aGlzLiNjb21wb3NlZE1pZGRsZXdhcmUgPSB1bmRlZmluZWQ7XG4gICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICByZXR1cm4gdGhpcyBhcyBBcHBsaWNhdGlvbjxhbnk+O1xuICB9XG5cbiAgW1N5bWJvbC5mb3IoXCJEZW5vLmN1c3RvbUluc3BlY3RcIildKGluc3BlY3Q6ICh2YWx1ZTogdW5rbm93bikgPT4gc3RyaW5nKSB7XG4gICAgY29uc3QgeyBrZXlzLCBwcm94eSwgc3RhdGUgfSA9IHRoaXM7XG4gICAgcmV0dXJuIGAke3RoaXMuY29uc3RydWN0b3IubmFtZX0gJHtcbiAgICAgIGluc3BlY3QoeyBcIiNtaWRkbGV3YXJlXCI6IHRoaXMuI21pZGRsZXdhcmUsIGtleXMsIHByb3h5LCBzdGF0ZSB9KVxuICAgIH1gO1xuICB9XG5cbiAgW1N5bWJvbC5mb3IoXCJub2RlanMudXRpbC5pbnNwZWN0LmN1c3RvbVwiKV0oXG4gICAgZGVwdGg6IG51bWJlcixcbiAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAgIG9wdGlvbnM6IGFueSxcbiAgICBpbnNwZWN0OiAodmFsdWU6IHVua25vd24sIG9wdGlvbnM/OiB1bmtub3duKSA9PiBzdHJpbmcsXG4gICkge1xuICAgIGlmIChkZXB0aCA8IDApIHtcbiAgICAgIHJldHVybiBvcHRpb25zLnN0eWxpemUoYFske3RoaXMuY29uc3RydWN0b3IubmFtZX1dYCwgXCJzcGVjaWFsXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IG5ld09wdGlvbnMgPSBPYmplY3QuYXNzaWduKHt9LCBvcHRpb25zLCB7XG4gICAgICBkZXB0aDogb3B0aW9ucy5kZXB0aCA9PT0gbnVsbCA/IG51bGwgOiBvcHRpb25zLmRlcHRoIC0gMSxcbiAgICB9KTtcbiAgICBjb25zdCB7IGtleXMsIHByb3h5LCBzdGF0ZSB9ID0gdGhpcztcbiAgICByZXR1cm4gYCR7b3B0aW9ucy5zdHlsaXplKHRoaXMuY29uc3RydWN0b3IubmFtZSwgXCJzcGVjaWFsXCIpfSAke1xuICAgICAgaW5zcGVjdChcbiAgICAgICAgeyBcIiNtaWRkbGV3YXJlXCI6IHRoaXMuI21pZGRsZXdhcmUsIGtleXMsIHByb3h5LCBzdGF0ZSB9LFxuICAgICAgICBuZXdPcHRpb25zLFxuICAgICAgKVxuICAgIH1gO1xuICB9XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEseUVBQXlFO0FBRXpFLFNBQVMsT0FBTyxRQUFRLGVBQWU7QUFDdkMsU0FBaUIsV0FBVyxRQUFRLFlBQVk7QUFDaEQsU0FBUyxXQUFXLFFBQVEseUJBQXlCO0FBQ3JELFNBQVMsVUFBVSxRQUFRLDBCQUEwQjtBQUNyRCxTQUFTLGFBQWEsUUFBUSxrQ0FBa0M7QUFDaEUsU0FBUyxRQUFRLFFBQVEsZ0JBQWdCO0FBQ3pDLFNBQVMsT0FBTyxRQUFvQixrQkFBa0I7QUFDdEQsU0FBUyxVQUFVLFFBQVEsd0JBQXdC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