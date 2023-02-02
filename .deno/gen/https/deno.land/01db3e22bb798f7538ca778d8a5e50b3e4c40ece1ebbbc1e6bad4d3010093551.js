/**
 * Adapted directly from @koa/router at
 * https://github.com/koajs/router/ which is licensed as:
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2015 Alexander C. Mingoia
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */ import { compile, errors, pathParse, pathToRegexp, Status } from "./deps.ts";
import { compose } from "./middleware.ts";
import { assert, decodeComponent } from "./util.ts";
/** Generate a URL from a string, potentially replace route params with
 * values. */ function toUrl(url, params = {}, options) {
    const tokens = pathParse(url);
    let replace = {};
    if (tokens.some((token)=>typeof token === "object")) {
        replace = params;
    } else {
        options = params;
    }
    const toPath = compile(url, options);
    const replaced = toPath(replace);
    if (options && options.query) {
        const url1 = new URL(replaced, "http://oak");
        if (typeof options.query === "string") {
            url1.search = options.query;
        } else {
            url1.search = String(options.query instanceof URLSearchParams ? options.query : new URLSearchParams(options.query));
        }
        return `${url1.pathname}${url1.search}${url1.hash}`;
    }
    return replaced;
}
class Layer {
    #opts;
    #paramNames = [];
    #regexp;
    methods;
    name;
    path;
    stack;
    constructor(path, methods, middleware, { name , ...opts } = {}){
        this.#opts = opts;
        this.name = name;
        this.methods = [
            ...methods
        ];
        if (this.methods.includes("GET")) {
            this.methods.unshift("HEAD");
        }
        this.stack = Array.isArray(middleware) ? middleware.slice() : [
            middleware
        ];
        this.path = path;
        this.#regexp = pathToRegexp(path, this.#paramNames, this.#opts);
    }
    clone() {
        return new Layer(this.path, this.methods, this.stack, {
            name: this.name,
            ...this.#opts
        });
    }
    match(path) {
        return this.#regexp.test(path);
    }
    params(captures, existingParams = {}) {
        const params = existingParams;
        for(let i = 0; i < captures.length; i++){
            if (this.#paramNames[i]) {
                const c = captures[i];
                params[this.#paramNames[i].name] = c ? decodeComponent(c) : c;
            }
        }
        return params;
    }
    captures(path) {
        if (this.#opts.ignoreCaptures) {
            return [];
        }
        return path.match(this.#regexp)?.slice(1) ?? [];
    }
    url(params = {}, options) {
        const url = this.path.replace(/\(\.\*\)/g, "");
        return toUrl(url, params, options);
    }
    param(param, // deno-lint-ignore no-explicit-any
    fn) {
        const stack = this.stack;
        const params = this.#paramNames;
        const middleware = function(ctx, next) {
            const p = ctx.params[param];
            assert(p);
            return fn.call(this, p, ctx, next);
        };
        middleware.param = param;
        const names = params.map((p)=>p.name);
        const x = names.indexOf(param);
        if (x >= 0) {
            for(let i = 0; i < stack.length; i++){
                const fn1 = stack[i];
                if (!fn1.param || names.indexOf(fn1.param) > x) {
                    stack.splice(i, 0, middleware);
                    break;
                }
            }
        }
        return this;
    }
    setPrefix(prefix) {
        if (this.path) {
            this.path = this.path !== "/" || this.#opts.strict === true ? `${prefix}${this.path}` : prefix;
            this.#paramNames = [];
            this.#regexp = pathToRegexp(this.path, this.#paramNames, this.#opts);
        }
        return this;
    }
    // deno-lint-ignore no-explicit-any
    toJSON() {
        return {
            methods: [
                ...this.methods
            ],
            middleware: [
                ...this.stack
            ],
            paramNames: this.#paramNames.map((key)=>key.name),
            path: this.path,
            regexp: this.#regexp,
            options: {
                ...this.#opts
            }
        };
    }
    [Symbol.for("Deno.customInspect")](inspect) {
        return `${this.constructor.name} ${inspect({
            methods: this.methods,
            middleware: this.stack,
            options: this.#opts,
            paramNames: this.#paramNames.map((key)=>key.name),
            path: this.path,
            regexp: this.#regexp
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
        return `${options.stylize(this.constructor.name, "special")} ${inspect({
            methods: this.methods,
            middleware: this.stack,
            options: this.#opts,
            paramNames: this.#paramNames.map((key)=>key.name),
            path: this.path,
            regexp: this.#regexp
        }, newOptions)}`;
    }
}
/** An interface for registering middleware that will run when certain HTTP
 * methods and paths are requested, as well as provides a way to parameterize
 * parts of the requested path.
 *
 * ### Basic example
 *
 * ```ts
 * import { Application, Router } from "https://deno.land/x/oak/mod.ts";
 *
 * const router = new Router();
 * router.get("/", (ctx, next) => {
 *   // handle the GET endpoint here
 * });
 * router.all("/item/:item", (ctx, next) => {
 *   // called for all HTTP verbs/requests
 *   ctx.params.item; // contains the value of `:item` from the parsed URL
 * });
 *
 * const app = new Application();
 * app.use(router.routes());
 * app.use(router.allowedMethods());
 *
 * app.listen({ port: 8080 });
 * ```
 */ export class Router {
    #opts;
    #methods;
    // deno-lint-ignore no-explicit-any
    #params = {};
    #stack = [];
    #match(path, method) {
        const matches = {
            path: [],
            pathAndMethod: [],
            route: false
        };
        for (const route of this.#stack){
            if (route.match(path)) {
                matches.path.push(route);
                if (route.methods.length === 0 || route.methods.includes(method)) {
                    matches.pathAndMethod.push(route);
                    if (route.methods.length) {
                        matches.route = true;
                    }
                }
            }
        }
        return matches;
    }
    #register(path1, middlewares, methods, options = {}) {
        if (Array.isArray(path1)) {
            for (const p of path1){
                this.#register(p, middlewares, methods, options);
            }
            return;
        }
        let layerMiddlewares = [];
        for (const middleware of middlewares){
            if (!middleware.router) {
                layerMiddlewares.push(middleware);
                continue;
            }
            if (layerMiddlewares.length) {
                this.#addLayer(path1, layerMiddlewares, methods, options);
                layerMiddlewares = [];
            }
            const router = middleware.router.#clone();
            for (const layer of router.#stack){
                if (!options.ignorePrefix) {
                    layer.setPrefix(path1);
                }
                if (this.#opts.prefix) {
                    layer.setPrefix(this.#opts.prefix);
                }
                this.#stack.push(layer);
            }
            for (const [param, mw] of Object.entries(this.#params)){
                router.param(param, mw);
            }
        }
        if (layerMiddlewares.length) {
            this.#addLayer(path1, layerMiddlewares, methods, options);
        }
    }
    #addLayer(path2, middlewares1, methods1, options1 = {}) {
        const { end , name , sensitive =this.#opts.sensitive , strict =this.#opts.strict , ignoreCaptures  } = options1;
        const route1 = new Layer(path2, methods1, middlewares1, {
            end,
            name,
            sensitive,
            strict,
            ignoreCaptures
        });
        if (this.#opts.prefix) {
            route1.setPrefix(this.#opts.prefix);
        }
        for (const [param1, mw1] of Object.entries(this.#params)){
            route1.param(param1, mw1);
        }
        this.#stack.push(route1);
    }
    #route(name1) {
        for (const route2 of this.#stack){
            if (route2.name === name1) {
                return route2;
            }
        }
    }
    #useVerb(nameOrPath, pathOrMiddleware, middleware1, methods2) {
        let name2 = undefined;
        let path3;
        if (typeof pathOrMiddleware === "string") {
            name2 = nameOrPath;
            path3 = pathOrMiddleware;
        } else {
            path3 = nameOrPath;
            middleware1.unshift(pathOrMiddleware);
        }
        this.#register(path3, middleware1, methods2, {
            name: name2
        });
    }
    #clone() {
        const router1 = new Router(this.#opts);
        router1.#methods = router1.#methods.slice();
        router1.#params = {
            ...this.#params
        };
        router1.#stack = this.#stack.map((layer)=>layer.clone());
        return router1;
    }
    constructor(opts = {}){
        this.#opts = opts;
        this.#methods = opts.methods ?? [
            "DELETE",
            "GET",
            "HEAD",
            "OPTIONS",
            "PATCH",
            "POST",
            "PUT"
        ];
    }
    all(nameOrPath, pathOrMiddleware, ...middleware) {
        this.#useVerb(nameOrPath, pathOrMiddleware, middleware, [
            "DELETE",
            "GET",
            "POST",
            "PUT"
        ]);
        return this;
    }
    /** Middleware that handles requests for HTTP methods registered with the
   * router.  If none of the routes handle a method, then "not allowed" logic
   * will be used.  If a method is supported by some routes, but not the
   * particular matched router, then "not implemented" will be returned.
   *
   * The middleware will also automatically handle the `OPTIONS` method,
   * responding with a `200 OK` when the `Allowed` header sent to the allowed
   * methods for a given route.
   *
   * By default, a "not allowed" request will respond with a `405 Not Allowed`
   * and a "not implemented" will respond with a `501 Not Implemented`. Setting
   * the option `.throw` to `true` will cause the middleware to throw an
   * `HTTPError` instead of setting the response status.  The error can be
   * overridden by providing a `.notImplemented` or `.notAllowed` method in the
   * options, of which the value will be returned will be thrown instead of the
   * HTTP error. */ allowedMethods(options = {}) {
        const implemented = this.#methods;
        const allowedMethods = async (context, next)=>{
            const ctx = context;
            await next();
            if (!ctx.response.status || ctx.response.status === Status.NotFound) {
                assert(ctx.matched);
                const allowed = new Set();
                for (const route of ctx.matched){
                    for (const method of route.methods){
                        allowed.add(method);
                    }
                }
                const allowedStr = [
                    ...allowed
                ].join(", ");
                if (!implemented.includes(ctx.request.method)) {
                    if (options.throw) {
                        throw options.notImplemented ? options.notImplemented() : new errors.NotImplemented();
                    } else {
                        ctx.response.status = Status.NotImplemented;
                        ctx.response.headers.set("Allowed", allowedStr);
                    }
                } else if (allowed.size) {
                    if (ctx.request.method === "OPTIONS") {
                        ctx.response.status = Status.OK;
                        ctx.response.headers.set("Allowed", allowedStr);
                    } else if (!allowed.has(ctx.request.method)) {
                        if (options.throw) {
                            throw options.methodNotAllowed ? options.methodNotAllowed() : new errors.MethodNotAllowed();
                        } else {
                            ctx.response.status = Status.MethodNotAllowed;
                            ctx.response.headers.set("Allowed", allowedStr);
                        }
                    }
                }
            }
        };
        return allowedMethods;
    }
    delete(nameOrPath, pathOrMiddleware, ...middleware) {
        this.#useVerb(nameOrPath, pathOrMiddleware, middleware, [
            "DELETE"
        ]);
        return this;
    }
    /** Iterate over the routes currently added to the router.  To be compatible
   * with the iterable interfaces, both the key and value are set to the value
   * of the route. */ *entries() {
        for (const route of this.#stack){
            const value = route.toJSON();
            yield [
                value,
                value
            ];
        }
    }
    /** Iterate over the routes currently added to the router, calling the
   * `callback` function for each value. */ forEach(callback, // deno-lint-ignore no-explicit-any
    thisArg = null) {
        for (const route of this.#stack){
            const value = route.toJSON();
            callback.call(thisArg, value, value, this);
        }
    }
    get(nameOrPath, pathOrMiddleware, ...middleware) {
        this.#useVerb(nameOrPath, pathOrMiddleware, middleware, [
            "GET"
        ]);
        return this;
    }
    head(nameOrPath, pathOrMiddleware, ...middleware) {
        this.#useVerb(nameOrPath, pathOrMiddleware, middleware, [
            "HEAD"
        ]);
        return this;
    }
    /** Iterate over the routes currently added to the router.  To be compatible
   * with the iterable interfaces, the key is set to the value of the route. */ *keys() {
        for (const route of this.#stack){
            yield route.toJSON();
        }
    }
    options(nameOrPath, pathOrMiddleware, ...middleware) {
        this.#useVerb(nameOrPath, pathOrMiddleware, middleware, [
            "OPTIONS"
        ]);
        return this;
    }
    /** Register param middleware, which will be called when the particular param
   * is parsed from the route. */ param(param, middleware) {
        this.#params[param] = middleware;
        for (const route of this.#stack){
            route.param(param, middleware);
        }
        return this;
    }
    patch(nameOrPath, pathOrMiddleware, ...middleware) {
        this.#useVerb(nameOrPath, pathOrMiddleware, middleware, [
            "PATCH"
        ]);
        return this;
    }
    post(nameOrPath, pathOrMiddleware, ...middleware) {
        this.#useVerb(nameOrPath, pathOrMiddleware, middleware, [
            "POST"
        ]);
        return this;
    }
    /** Set the router prefix for this router. */ prefix(prefix) {
        prefix = prefix.replace(/\/$/, "");
        this.#opts.prefix = prefix;
        for (const route of this.#stack){
            route.setPrefix(prefix);
        }
        return this;
    }
    put(nameOrPath, pathOrMiddleware, ...middleware) {
        this.#useVerb(nameOrPath, pathOrMiddleware, middleware, [
            "PUT"
        ]);
        return this;
    }
    /** Register a direction middleware, where when the `source` path is matched
   * the router will redirect the request to the `destination` path.  A `status`
   * of `302 Found` will be set by default.
   *
   * The `source` and `destination` can be named routes. */ redirect(source, destination, status = Status.Found) {
        if (source[0] !== "/") {
            const s = this.url(source);
            if (!s) {
                throw new RangeError(`Could not resolve named route: "${source}"`);
            }
            source = s;
        }
        if (typeof destination === "string") {
            if (destination[0] !== "/") {
                const d = this.url(destination);
                if (!d) {
                    try {
                        const url = new URL(destination);
                        destination = url;
                    } catch  {
                        throw new RangeError(`Could not resolve named route: "${source}"`);
                    }
                } else {
                    destination = d;
                }
            }
        }
        this.all(source, async (ctx, next)=>{
            await next();
            ctx.response.redirect(destination);
            ctx.response.status = status;
        });
        return this;
    }
    /** Return middleware that will do all the route processing that the router
   * has been configured to handle.  Typical usage would be something like this:
   *
   * ```ts
   * import { Application, Router } from "https://deno.land/x/oak/mod.ts";
   *
   * const app = new Application();
   * const router = new Router();
   *
   * // register routes
   *
   * app.use(router.routes());
   * app.use(router.allowedMethods());
   * await app.listen({ port: 80 });
   * ```
   */ routes() {
        const dispatch = (context, next)=>{
            const ctx = context;
            let pathname;
            let method;
            try {
                const { url: { pathname: p  } , method: m  } = ctx.request;
                pathname = p;
                method = m;
            } catch (e) {
                return Promise.reject(e);
            }
            const path = this.#opts.routerPath ?? ctx.routerPath ?? decodeURI(pathname);
            const matches = this.#match(path, method);
            if (ctx.matched) {
                ctx.matched.push(...matches.path);
            } else {
                ctx.matched = [
                    ...matches.path
                ];
            }
            // deno-lint-ignore no-explicit-any
            ctx.router = this;
            if (!matches.route) return next();
            const { pathAndMethod: matchedRoutes  } = matches;
            const chain = matchedRoutes.reduce((prev, route)=>[
                    ...prev,
                    (ctx, next)=>{
                        ctx.captures = route.captures(path);
                        ctx.params = route.params(ctx.captures, ctx.params);
                        ctx.routeName = route.name;
                        return next();
                    },
                    ...route.stack
                ], []);
            return compose(chain)(ctx, next);
        };
        dispatch.router = this;
        return dispatch;
    }
    /** Generate a URL pathname for a named route, interpolating the optional
   * params provided.  Also accepts an optional set of options. */ url(name, params, options) {
        const route = this.#route(name);
        if (route) {
            return route.url(params, options);
        }
    }
    use(pathOrMiddleware, ...middleware) {
        let path;
        if (typeof pathOrMiddleware === "string" || Array.isArray(pathOrMiddleware)) {
            path = pathOrMiddleware;
        } else {
            middleware.unshift(pathOrMiddleware);
        }
        this.#register(path ?? "(.*)", middleware, [], {
            end: false,
            ignoreCaptures: !path,
            ignorePrefix: !path
        });
        return this;
    }
    /** Iterate over the routes currently added to the router. */ *values() {
        for (const route of this.#stack){
            yield route.toJSON();
        }
    }
    /** Provide an iterator interface that iterates over the routes registered
   * with the router. */ *[Symbol.iterator]() {
        for (const route of this.#stack){
            yield route.toJSON();
        }
    }
    /** Generate a URL pathname based on the provided path, interpolating the
   * optional params provided.  Also accepts an optional set of options. */ static url(path, params, options) {
        return toUrl(path, params, options);
    }
    [Symbol.for("Deno.customInspect")](inspect) {
        return `${this.constructor.name} ${inspect({
            "#params": this.#params,
            "#stack": this.#stack
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
        return `${options.stylize(this.constructor.name, "special")} ${inspect({
            "#params": this.#params,
            "#stack": this.#stack
        }, newOptions)}`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMS4xLjAvcm91dGVyLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQWRhcHRlZCBkaXJlY3RseSBmcm9tIEBrb2Evcm91dGVyIGF0XG4gKiBodHRwczovL2dpdGh1Yi5jb20va29hanMvcm91dGVyLyB3aGljaCBpcyBsaWNlbnNlZCBhczpcbiAqXG4gKiBUaGUgTUlUIExpY2Vuc2UgKE1JVClcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTUgQWxleGFuZGVyIEMuIE1pbmdvaWFcbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbiAqIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTlxuICogVEhFIFNPRlRXQVJFLlxuICovXG5cbmltcG9ydCB0eXBlIHsgU3RhdGUgfSBmcm9tIFwiLi9hcHBsaWNhdGlvbi50c1wiO1xuaW1wb3J0IHR5cGUgeyBDb250ZXh0IH0gZnJvbSBcIi4vY29udGV4dC50c1wiO1xuaW1wb3J0IHtcbiAgY29tcGlsZSxcbiAgZXJyb3JzLFxuICBLZXksXG4gIFBhcnNlT3B0aW9ucyxcbiAgcGF0aFBhcnNlLFxuICBwYXRoVG9SZWdleHAsXG4gIFN0YXR1cyxcbiAgVG9rZW5zVG9SZWdleHBPcHRpb25zLFxufSBmcm9tIFwiLi9kZXBzLnRzXCI7XG5pbXBvcnQgeyBjb21wb3NlLCBNaWRkbGV3YXJlIH0gZnJvbSBcIi4vbWlkZGxld2FyZS50c1wiO1xuaW1wb3J0IHR5cGUgeyBIVFRQTWV0aG9kcywgUmVkaXJlY3RTdGF0dXMgfSBmcm9tIFwiLi90eXBlcy5kLnRzXCI7XG5pbXBvcnQgeyBhc3NlcnQsIGRlY29kZUNvbXBvbmVudCB9IGZyb20gXCIuL3V0aWwudHNcIjtcblxuaW50ZXJmYWNlIE1hdGNoZXM8UiBleHRlbmRzIHN0cmluZz4ge1xuICBwYXRoOiBMYXllcjxSPltdO1xuICBwYXRoQW5kTWV0aG9kOiBMYXllcjxSPltdO1xuICByb3V0ZTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSb3V0ZXJBbGxvd2VkTWV0aG9kc09wdGlvbnMge1xuICAvKiogVXNlIHRoZSB2YWx1ZSByZXR1cm5lZCBmcm9tIHRoaXMgZnVuY3Rpb24gaW5zdGVhZCBvZiBhbiBIVFRQIGVycm9yXG4gICAqIGBNZXRob2ROb3RBbGxvd2VkYC4gKi9cbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgbWV0aG9kTm90QWxsb3dlZD8oKTogYW55O1xuXG4gIC8qKiBVc2UgdGhlIHZhbHVlIHJldHVybmVkIGZyb20gdGhpcyBmdW5jdGlvbiBpbnN0ZWFkIG9mIGFuIEhUVFAgZXJyb3JcbiAgICogYE5vdEltcGxlbWVudGVkYC4gKi9cbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgbm90SW1wbGVtZW50ZWQ/KCk6IGFueTtcblxuICAvKiogV2hlbiBkZWFsaW5nIHdpdGggYSBub24taW1wbGVtZW50ZWQgbWV0aG9kIG9yIGEgbWV0aG9kIG5vdCBhbGxvd2VkLCB0aHJvd1xuICAgKiBhbiBlcnJvciBpbnN0ZWFkIG9mIHNldHRpbmcgdGhlIHN0YXR1cyBhbmQgaGVhZGVyIGZvciB0aGUgcmVzcG9uc2UuICovXG4gIHRocm93PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSb3V0ZTxcbiAgUiBleHRlbmRzIHN0cmluZyxcbiAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPFI+ID0gUm91dGVQYXJhbXM8Uj4sXG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIFMgZXh0ZW5kcyBTdGF0ZSA9IFJlY29yZDxzdHJpbmcsIGFueT4sXG4+IHtcbiAgLyoqIFRoZSBIVFRQIG1ldGhvZHMgdGhhdCB0aGlzIHJvdXRlIGhhbmRsZXMuICovXG4gIG1ldGhvZHM6IEhUVFBNZXRob2RzW107XG5cbiAgLyoqIFRoZSBtaWRkbGV3YXJlIHRoYXQgd2lsbCBiZSBhcHBsaWVkIHRvIHRoaXMgcm91dGUuICovXG4gIG1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz5bXTtcblxuICAvKiogQW4gb3B0aW9uYWwgbmFtZSBmb3IgdGhlIHJvdXRlLiAqL1xuICBuYW1lPzogc3RyaW5nO1xuXG4gIC8qKiBPcHRpb25zIHRoYXQgd2VyZSB1c2VkIHRvIGNyZWF0ZSB0aGUgcm91dGUuICovXG4gIG9wdGlvbnM6IExheWVyT3B0aW9ucztcblxuICAvKiogVGhlIHBhcmFtZXRlcnMgdGhhdCBhcmUgaWRlbnRpZmllZCBpbiB0aGUgcm91dGUgdGhhdCB3aWxsIGJlIHBhcnNlZCBvdXRcbiAgICogb24gbWF0Y2hlZCByZXF1ZXN0cy4gKi9cbiAgcGFyYW1OYW1lczogKGtleW9mIFApW107XG5cbiAgLyoqIFRoZSBwYXRoIHRoYXQgdGhpcyByb3V0ZSBtYW5hZ2VzLiAqL1xuICBwYXRoOiBzdHJpbmc7XG5cbiAgLyoqIFRoZSByZWd1bGFyIGV4cHJlc3Npb24gdXNlZCBmb3IgbWF0Y2hpbmcgYW5kIHBhcnNpbmcgcGFyYW1ldGVycyBmb3IgdGhlXG4gICAqIHJvdXRlLiAqL1xuICByZWdleHA6IFJlZ0V4cDtcbn1cblxuLyoqIFRoZSBjb250ZXh0IHBhc3NlZCByb3V0ZXIgbWlkZGxld2FyZS4gICovXG5leHBvcnQgaW50ZXJmYWNlIFJvdXRlckNvbnRleHQ8XG4gIFIgZXh0ZW5kcyBzdHJpbmcsXG4gIFAgZXh0ZW5kcyBSb3V0ZVBhcmFtczxSPiA9IFJvdXRlUGFyYW1zPFI+LFxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICBTIGV4dGVuZHMgU3RhdGUgPSBSZWNvcmQ8c3RyaW5nLCBhbnk+LFxuPiBleHRlbmRzIENvbnRleHQ8Uz4ge1xuICAvKiogV2hlbiBtYXRjaGluZyB0aGUgcm91dGUsIGFuIGFycmF5IG9mIHRoZSBjYXB0dXJpbmcgZ3JvdXBzIGZyb20gdGhlIHJlZ3VsYXJcbiAgICogZXhwcmVzc2lvbi4gKi9cbiAgY2FwdHVyZXM6IHN0cmluZ1tdO1xuXG4gIC8qKiBUaGUgcm91dGVzIHRoYXQgd2VyZSBtYXRjaGVkIGZvciB0aGlzIHJlcXVlc3QuICovXG4gIG1hdGNoZWQ/OiBMYXllcjxSLCBQLCBTPltdO1xuXG4gIC8qKiBBbnkgcGFyYW1ldGVycyBwYXJzZWQgZnJvbSB0aGUgcm91dGUgd2hlbiBtYXRjaGVkLiAqL1xuICBwYXJhbXM6IFA7XG5cbiAgLyoqIEEgcmVmZXJlbmNlIHRvIHRoZSByb3V0ZXIgaW5zdGFuY2UuICovXG4gIHJvdXRlcjogUm91dGVyO1xuXG4gIC8qKiBJZiB0aGUgbWF0Y2hlZCByb3V0ZSBoYXMgYSBgbmFtZWAsIHRoZSBtYXRjaGVkIHJvdXRlIG5hbWUgaXMgcHJvdmlkZWRcbiAgICogaGVyZS4gKi9cbiAgcm91dGVOYW1lPzogc3RyaW5nO1xuXG4gIC8qKiBPdmVycmlkZXMgdGhlIG1hdGNoZWQgcGF0aCBmb3IgZnV0dXJlIHJvdXRlIG1pZGRsZXdhcmUsIHdoZW4gYVxuICAgKiBgcm91dGVyUGF0aGAgb3B0aW9uIGlzIG5vdCBkZWZpbmVkIG9uIHRoZSBgUm91dGVyYCBvcHRpb25zLiAqL1xuICByb3V0ZXJQYXRoPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJvdXRlck1pZGRsZXdhcmU8XG4gIFIgZXh0ZW5kcyBzdHJpbmcsXG4gIFAgZXh0ZW5kcyBSb3V0ZVBhcmFtczxSPiA9IFJvdXRlUGFyYW1zPFI+LFxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICBTIGV4dGVuZHMgU3RhdGUgPSBSZWNvcmQ8c3RyaW5nLCBhbnk+LFxuPiB7XG4gIChjb250ZXh0OiBSb3V0ZXJDb250ZXh0PFIsIFAsIFM+LCBuZXh0OiAoKSA9PiBQcm9taXNlPHVua25vd24+KTpcbiAgICB8IFByb21pc2U8dW5rbm93bj5cbiAgICB8IHVua25vd247XG4gIC8qKiBGb3Igcm91dGUgcGFyYW1ldGVyIG1pZGRsZXdhcmUsIHRoZSBgcGFyYW1gIGtleSBmb3IgdGhpcyBwYXJhbWV0ZXIgd2lsbFxuICAgKiBiZSBzZXQuICovXG4gIHBhcmFtPzoga2V5b2YgUDtcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgcm91dGVyPzogUm91dGVyPGFueT47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUm91dGVyT3B0aW9ucyB7XG4gIC8qKiBPdmVycmlkZSB0aGUgZGVmYXVsdCBzZXQgb2YgbWV0aG9kcyBzdXBwb3J0ZWQgYnkgdGhlIHJvdXRlci4gKi9cbiAgbWV0aG9kcz86IEhUVFBNZXRob2RzW107XG5cbiAgLyoqIE9ubHkgaGFuZGxlIHJvdXRlcyB3aGVyZSB0aGUgcmVxdWVzdGVkIHBhdGggc3RhcnRzIHdpdGggdGhlIHByZWZpeC4gKi9cbiAgcHJlZml4Pzogc3RyaW5nO1xuXG4gIC8qKiBPdmVycmlkZSB0aGUgYHJlcXVlc3QudXJsLnBhdGhuYW1lYCB3aGVuIG1hdGNoaW5nIG1pZGRsZXdhcmUgdG8gcnVuLiAqL1xuICByb3V0ZXJQYXRoPzogc3RyaW5nO1xuXG4gIC8qKiBEZXRlcm1pbmVzIGlmIHJvdXRlcyBhcmUgbWF0Y2hlZCBpbiBhIGNhc2Ugc2Vuc2l0aXZlIHdheS4gIERlZmF1bHRzIHRvXG4gICAqIGBmYWxzZWAuICovXG4gIHNlbnNpdGl2ZT86IGJvb2xlYW47XG5cbiAgLyoqIERldGVybWluZXMgaWYgcm91dGVzIGFyZSBtYXRjaGVkIHN0cmljdGx5LCB3aGVyZSB0aGUgdHJhaWxpbmcgYC9gIGlzIG5vdFxuICAgKiBvcHRpb25hbC4gIERlZmF1bHRzIHRvIGBmYWxzZWAuICovXG4gIHN0cmljdD86IGJvb2xlYW47XG59XG5cbi8qKiBNaWRkbGV3YXJlIHRoYXQgd2lsbCBiZSBjYWxsZWQgYnkgdGhlIHJvdXRlciB3aGVuIGhhbmRsaW5nIGEgc3BlY2lmaWNcbiAqIHBhcmFtZXRlciwgd2hpY2ggdGhlIG1pZGRsZXdhcmUgd2lsbCBiZSBjYWxsZWQgd2hlbiBhIHJlcXVlc3QgbWF0Y2hlcyB0aGVcbiAqIHJvdXRlIHBhcmFtZXRlci4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgUm91dGVyUGFyYW1NaWRkbGV3YXJlPFxuICBSIGV4dGVuZHMgc3RyaW5nLFxuICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8Uj4gPSBSb3V0ZVBhcmFtczxSPixcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgUyBleHRlbmRzIFN0YXRlID0gUmVjb3JkPHN0cmluZywgYW55Pixcbj4ge1xuICAoXG4gICAgcGFyYW06IHN0cmluZyxcbiAgICBjb250ZXh0OiBSb3V0ZXJDb250ZXh0PFIsIFAsIFM+LFxuICAgIG5leHQ6ICgpID0+IFByb21pc2U8dW5rbm93bj4sXG4gICk6IFByb21pc2U8dW5rbm93bj4gfCB1bmtub3duO1xuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICByb3V0ZXI/OiBSb3V0ZXI8YW55Pjtcbn1cblxuaW50ZXJmYWNlIFBhcmFtc0RpY3Rpb25hcnkge1xuICBba2V5OiBzdHJpbmddOiBzdHJpbmc7XG59XG5cbnR5cGUgUmVtb3ZlVGFpbDxTIGV4dGVuZHMgc3RyaW5nLCBUYWlsIGV4dGVuZHMgc3RyaW5nPiA9IFMgZXh0ZW5kc1xuICBgJHtpbmZlciBQfSR7VGFpbH1gID8gUCA6IFM7XG5cbnR5cGUgR2V0Um91dGVQYXJhbXM8UyBleHRlbmRzIHN0cmluZz4gPSBSZW1vdmVUYWlsPFxuICBSZW1vdmVUYWlsPFJlbW92ZVRhaWw8UywgYC8ke3N0cmluZ31gPiwgYC0ke3N0cmluZ31gPixcbiAgYC4ke3N0cmluZ31gXG4+O1xuXG5leHBvcnQgdHlwZSBSb3V0ZVBhcmFtczxSb3V0ZSBleHRlbmRzIHN0cmluZz4gPSBzdHJpbmcgZXh0ZW5kcyBSb3V0ZVxuICA/IFBhcmFtc0RpY3Rpb25hcnlcbiAgOiBSb3V0ZSBleHRlbmRzIGAke3N0cmluZ30oJHtzdHJpbmd9YCA/IFBhcmFtc0RpY3Rpb25hcnlcbiAgOiBSb3V0ZSBleHRlbmRzIGAke3N0cmluZ306JHtpbmZlciBSZXN0fWAgPyBcbiAgICAgICYgKFxuICAgICAgICBHZXRSb3V0ZVBhcmFtczxSZXN0PiBleHRlbmRzIG5ldmVyID8gUGFyYW1zRGljdGlvbmFyeVxuICAgICAgICAgIDogR2V0Um91dGVQYXJhbXM8UmVzdD4gZXh0ZW5kcyBgJHtpbmZlciBQYXJhbU5hbWV9P2BcbiAgICAgICAgICAgID8geyBbUCBpbiBQYXJhbU5hbWVdPzogc3RyaW5nIH1cbiAgICAgICAgICA6IHsgW1AgaW4gR2V0Um91dGVQYXJhbXM8UmVzdD5dOiBzdHJpbmcgfVxuICAgICAgKVxuICAgICAgJiAoUmVzdCBleHRlbmRzIGAke0dldFJvdXRlUGFyYW1zPFJlc3Q+fSR7aW5mZXIgTmV4dH1gID8gUm91dGVQYXJhbXM8TmV4dD5cbiAgICAgICAgOiB1bmtub3duKVxuICA6IFJlY29yZDxzdHJpbmcgfCBudW1iZXIsIHN0cmluZyB8IHVuZGVmaW5lZD47XG5cbnR5cGUgTGF5ZXJPcHRpb25zID0gVG9rZW5zVG9SZWdleHBPcHRpb25zICYgUGFyc2VPcHRpb25zICYge1xuICBpZ25vcmVDYXB0dXJlcz86IGJvb2xlYW47XG4gIG5hbWU/OiBzdHJpbmc7XG59O1xuXG50eXBlIFJlZ2lzdGVyT3B0aW9ucyA9IExheWVyT3B0aW9ucyAmIHtcbiAgaWdub3JlUHJlZml4PzogYm9vbGVhbjtcbn07XG5cbnR5cGUgVXJsT3B0aW9ucyA9IFRva2Vuc1RvUmVnZXhwT3B0aW9ucyAmIFBhcnNlT3B0aW9ucyAmIHtcbiAgLyoqIFdoZW4gZ2VuZXJhdGluZyBhIFVSTCBmcm9tIGEgcm91dGUsIGFkZCB0aGUgcXVlcnkgdG8gdGhlIFVSTC4gIElmIGFuXG4gICAqIG9iamVjdCAqL1xuICBxdWVyeT86IFVSTFNlYXJjaFBhcmFtcyB8IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfCBzdHJpbmc7XG59O1xuXG4vKiogR2VuZXJhdGUgYSBVUkwgZnJvbSBhIHN0cmluZywgcG90ZW50aWFsbHkgcmVwbGFjZSByb3V0ZSBwYXJhbXMgd2l0aFxuICogdmFsdWVzLiAqL1xuZnVuY3Rpb24gdG9Vcmw8UiBleHRlbmRzIHN0cmluZz4oXG4gIHVybDogc3RyaW5nLFxuICBwYXJhbXMgPSB7fSBhcyBSb3V0ZVBhcmFtczxSPixcbiAgb3B0aW9ucz86IFVybE9wdGlvbnMsXG4pIHtcbiAgY29uc3QgdG9rZW5zID0gcGF0aFBhcnNlKHVybCk7XG4gIGxldCByZXBsYWNlID0ge30gYXMgUm91dGVQYXJhbXM8Uj47XG5cbiAgaWYgKHRva2Vucy5zb21lKCh0b2tlbikgPT4gdHlwZW9mIHRva2VuID09PSBcIm9iamVjdFwiKSkge1xuICAgIHJlcGxhY2UgPSBwYXJhbXM7XG4gIH0gZWxzZSB7XG4gICAgb3B0aW9ucyA9IHBhcmFtcztcbiAgfVxuXG4gIGNvbnN0IHRvUGF0aCA9IGNvbXBpbGUodXJsLCBvcHRpb25zKTtcbiAgY29uc3QgcmVwbGFjZWQgPSB0b1BhdGgocmVwbGFjZSk7XG5cbiAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5xdWVyeSkge1xuICAgIGNvbnN0IHVybCA9IG5ldyBVUkwocmVwbGFjZWQsIFwiaHR0cDovL29ha1wiKTtcbiAgICBpZiAodHlwZW9mIG9wdGlvbnMucXVlcnkgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgIHVybC5zZWFyY2ggPSBvcHRpb25zLnF1ZXJ5O1xuICAgIH0gZWxzZSB7XG4gICAgICB1cmwuc2VhcmNoID0gU3RyaW5nKFxuICAgICAgICBvcHRpb25zLnF1ZXJ5IGluc3RhbmNlb2YgVVJMU2VhcmNoUGFyYW1zXG4gICAgICAgICAgPyBvcHRpb25zLnF1ZXJ5XG4gICAgICAgICAgOiBuZXcgVVJMU2VhcmNoUGFyYW1zKG9wdGlvbnMucXVlcnkpLFxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIGAke3VybC5wYXRobmFtZX0ke3VybC5zZWFyY2h9JHt1cmwuaGFzaH1gO1xuICB9XG4gIHJldHVybiByZXBsYWNlZDtcbn1cblxuY2xhc3MgTGF5ZXI8XG4gIFIgZXh0ZW5kcyBzdHJpbmcsXG4gIFAgZXh0ZW5kcyBSb3V0ZVBhcmFtczxSPiA9IFJvdXRlUGFyYW1zPFI+LFxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICBTIGV4dGVuZHMgU3RhdGUgPSBSZWNvcmQ8c3RyaW5nLCBhbnk+LFxuPiB7XG4gICNvcHRzOiBMYXllck9wdGlvbnM7XG4gICNwYXJhbU5hbWVzOiBLZXlbXSA9IFtdO1xuICAjcmVnZXhwOiBSZWdFeHA7XG5cbiAgbWV0aG9kczogSFRUUE1ldGhvZHNbXTtcbiAgbmFtZT86IHN0cmluZztcbiAgcGF0aDogc3RyaW5nO1xuICBzdGFjazogUm91dGVyTWlkZGxld2FyZTxSLCBQLCBTPltdO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHBhdGg6IHN0cmluZyxcbiAgICBtZXRob2RzOiBIVFRQTWV0aG9kc1tdLFxuICAgIG1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz4gfCBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+W10sXG4gICAgeyBuYW1lLCAuLi5vcHRzIH06IExheWVyT3B0aW9ucyA9IHt9LFxuICApIHtcbiAgICB0aGlzLiNvcHRzID0gb3B0cztcbiAgICB0aGlzLm5hbWUgPSBuYW1lO1xuICAgIHRoaXMubWV0aG9kcyA9IFsuLi5tZXRob2RzXTtcbiAgICBpZiAodGhpcy5tZXRob2RzLmluY2x1ZGVzKFwiR0VUXCIpKSB7XG4gICAgICB0aGlzLm1ldGhvZHMudW5zaGlmdChcIkhFQURcIik7XG4gICAgfVxuICAgIHRoaXMuc3RhY2sgPSBBcnJheS5pc0FycmF5KG1pZGRsZXdhcmUpID8gbWlkZGxld2FyZS5zbGljZSgpIDogW21pZGRsZXdhcmVdO1xuICAgIHRoaXMucGF0aCA9IHBhdGg7XG4gICAgdGhpcy4jcmVnZXhwID0gcGF0aFRvUmVnZXhwKHBhdGgsIHRoaXMuI3BhcmFtTmFtZXMsIHRoaXMuI29wdHMpO1xuICB9XG5cbiAgY2xvbmUoKTogTGF5ZXI8UiwgUCwgUz4ge1xuICAgIHJldHVybiBuZXcgTGF5ZXIoXG4gICAgICB0aGlzLnBhdGgsXG4gICAgICB0aGlzLm1ldGhvZHMsXG4gICAgICB0aGlzLnN0YWNrLFxuICAgICAgeyBuYW1lOiB0aGlzLm5hbWUsIC4uLnRoaXMuI29wdHMgfSxcbiAgICApO1xuICB9XG5cbiAgbWF0Y2gocGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuI3JlZ2V4cC50ZXN0KHBhdGgpO1xuICB9XG5cbiAgcGFyYW1zKFxuICAgIGNhcHR1cmVzOiBzdHJpbmdbXSxcbiAgICBleGlzdGluZ1BhcmFtcyA9IHt9IGFzIFJvdXRlUGFyYW1zPFI+LFxuICApOiBSb3V0ZVBhcmFtczxSPiB7XG4gICAgY29uc3QgcGFyYW1zID0gZXhpc3RpbmdQYXJhbXM7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjYXB0dXJlcy5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKHRoaXMuI3BhcmFtTmFtZXNbaV0pIHtcbiAgICAgICAgY29uc3QgYyA9IGNhcHR1cmVzW2ldO1xuICAgICAgICBwYXJhbXNbdGhpcy4jcGFyYW1OYW1lc1tpXS5uYW1lXSA9IGMgPyBkZWNvZGVDb21wb25lbnQoYykgOiBjO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcGFyYW1zO1xuICB9XG5cbiAgY2FwdHVyZXMocGF0aDogc3RyaW5nKTogc3RyaW5nW10ge1xuICAgIGlmICh0aGlzLiNvcHRzLmlnbm9yZUNhcHR1cmVzKSB7XG4gICAgICByZXR1cm4gW107XG4gICAgfVxuICAgIHJldHVybiBwYXRoLm1hdGNoKHRoaXMuI3JlZ2V4cCk/LnNsaWNlKDEpID8/IFtdO1xuICB9XG5cbiAgdXJsKFxuICAgIHBhcmFtcyA9IHt9IGFzIFJvdXRlUGFyYW1zPFI+LFxuICAgIG9wdGlvbnM/OiBVcmxPcHRpb25zLFxuICApOiBzdHJpbmcge1xuICAgIGNvbnN0IHVybCA9IHRoaXMucGF0aC5yZXBsYWNlKC9cXChcXC5cXCpcXCkvZywgXCJcIik7XG4gICAgcmV0dXJuIHRvVXJsKHVybCwgcGFyYW1zLCBvcHRpb25zKTtcbiAgfVxuXG4gIHBhcmFtKFxuICAgIHBhcmFtOiBzdHJpbmcsXG4gICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICBmbjogUm91dGVyUGFyYW1NaWRkbGV3YXJlPGFueSwgYW55LCBhbnk+LFxuICApIHtcbiAgICBjb25zdCBzdGFjayA9IHRoaXMuc3RhY2s7XG4gICAgY29uc3QgcGFyYW1zID0gdGhpcy4jcGFyYW1OYW1lcztcbiAgICBjb25zdCBtaWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPFI+ID0gZnVuY3Rpb24gKFxuICAgICAgdGhpczogUm91dGVyLFxuICAgICAgY3R4LFxuICAgICAgbmV4dCxcbiAgICApOiBQcm9taXNlPHVua25vd24+IHwgdW5rbm93biB7XG4gICAgICBjb25zdCBwID0gY3R4LnBhcmFtc1twYXJhbV07XG4gICAgICBhc3NlcnQocCk7XG4gICAgICByZXR1cm4gZm4uY2FsbCh0aGlzLCBwLCBjdHgsIG5leHQpO1xuICAgIH07XG4gICAgbWlkZGxld2FyZS5wYXJhbSA9IHBhcmFtO1xuXG4gICAgY29uc3QgbmFtZXMgPSBwYXJhbXMubWFwKChwKSA9PiBwLm5hbWUpO1xuXG4gICAgY29uc3QgeCA9IG5hbWVzLmluZGV4T2YocGFyYW0pO1xuICAgIGlmICh4ID49IDApIHtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RhY2subGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgZm4gPSBzdGFja1tpXTtcbiAgICAgICAgaWYgKCFmbi5wYXJhbSB8fCBuYW1lcy5pbmRleE9mKGZuLnBhcmFtIGFzIChzdHJpbmcgfCBudW1iZXIpKSA+IHgpIHtcbiAgICAgICAgICBzdGFjay5zcGxpY2UoaSwgMCwgbWlkZGxld2FyZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICBzZXRQcmVmaXgocHJlZml4OiBzdHJpbmcpOiB0aGlzIHtcbiAgICBpZiAodGhpcy5wYXRoKSB7XG4gICAgICB0aGlzLnBhdGggPSB0aGlzLnBhdGggIT09IFwiL1wiIHx8IHRoaXMuI29wdHMuc3RyaWN0ID09PSB0cnVlXG4gICAgICAgID8gYCR7cHJlZml4fSR7dGhpcy5wYXRofWBcbiAgICAgICAgOiBwcmVmaXg7XG4gICAgICB0aGlzLiNwYXJhbU5hbWVzID0gW107XG4gICAgICB0aGlzLiNyZWdleHAgPSBwYXRoVG9SZWdleHAodGhpcy5wYXRoLCB0aGlzLiNwYXJhbU5hbWVzLCB0aGlzLiNvcHRzKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICB0b0pTT04oKTogUm91dGU8YW55LCBhbnksIGFueT4ge1xuICAgIHJldHVybiB7XG4gICAgICBtZXRob2RzOiBbLi4udGhpcy5tZXRob2RzXSxcbiAgICAgIG1pZGRsZXdhcmU6IFsuLi50aGlzLnN0YWNrXSxcbiAgICAgIHBhcmFtTmFtZXM6IHRoaXMuI3BhcmFtTmFtZXMubWFwKChrZXkpID0+IGtleS5uYW1lKSxcbiAgICAgIHBhdGg6IHRoaXMucGF0aCxcbiAgICAgIHJlZ2V4cDogdGhpcy4jcmVnZXhwLFxuICAgICAgb3B0aW9uczogeyAuLi50aGlzLiNvcHRzIH0sXG4gICAgfTtcbiAgfVxuXG4gIFtTeW1ib2wuZm9yKFwiRGVuby5jdXN0b21JbnNwZWN0XCIpXShpbnNwZWN0OiAodmFsdWU6IHVua25vd24pID0+IHN0cmluZykge1xuICAgIHJldHVybiBgJHt0aGlzLmNvbnN0cnVjdG9yLm5hbWV9ICR7XG4gICAgICBpbnNwZWN0KHtcbiAgICAgICAgbWV0aG9kczogdGhpcy5tZXRob2RzLFxuICAgICAgICBtaWRkbGV3YXJlOiB0aGlzLnN0YWNrLFxuICAgICAgICBvcHRpb25zOiB0aGlzLiNvcHRzLFxuICAgICAgICBwYXJhbU5hbWVzOiB0aGlzLiNwYXJhbU5hbWVzLm1hcCgoa2V5KSA9PiBrZXkubmFtZSksXG4gICAgICAgIHBhdGg6IHRoaXMucGF0aCxcbiAgICAgICAgcmVnZXhwOiB0aGlzLiNyZWdleHAsXG4gICAgICB9KVxuICAgIH1gO1xuICB9XG5cbiAgW1N5bWJvbC5mb3IoXCJub2RlanMudXRpbC5pbnNwZWN0LmN1c3RvbVwiKV0oXG4gICAgZGVwdGg6IG51bWJlcixcbiAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAgIG9wdGlvbnM6IGFueSxcbiAgICBpbnNwZWN0OiAodmFsdWU6IHVua25vd24sIG9wdGlvbnM/OiB1bmtub3duKSA9PiBzdHJpbmcsXG4gICkge1xuICAgIGlmIChkZXB0aCA8IDApIHtcbiAgICAgIHJldHVybiBvcHRpb25zLnN0eWxpemUoYFske3RoaXMuY29uc3RydWN0b3IubmFtZX1dYCwgXCJzcGVjaWFsXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IG5ld09wdGlvbnMgPSBPYmplY3QuYXNzaWduKHt9LCBvcHRpb25zLCB7XG4gICAgICBkZXB0aDogb3B0aW9ucy5kZXB0aCA9PT0gbnVsbCA/IG51bGwgOiBvcHRpb25zLmRlcHRoIC0gMSxcbiAgICB9KTtcbiAgICByZXR1cm4gYCR7b3B0aW9ucy5zdHlsaXplKHRoaXMuY29uc3RydWN0b3IubmFtZSwgXCJzcGVjaWFsXCIpfSAke1xuICAgICAgaW5zcGVjdChcbiAgICAgICAge1xuICAgICAgICAgIG1ldGhvZHM6IHRoaXMubWV0aG9kcyxcbiAgICAgICAgICBtaWRkbGV3YXJlOiB0aGlzLnN0YWNrLFxuICAgICAgICAgIG9wdGlvbnM6IHRoaXMuI29wdHMsXG4gICAgICAgICAgcGFyYW1OYW1lczogdGhpcy4jcGFyYW1OYW1lcy5tYXAoKGtleSkgPT4ga2V5Lm5hbWUpLFxuICAgICAgICAgIHBhdGg6IHRoaXMucGF0aCxcbiAgICAgICAgICByZWdleHA6IHRoaXMuI3JlZ2V4cCxcbiAgICAgICAgfSxcbiAgICAgICAgbmV3T3B0aW9ucyxcbiAgICAgIClcbiAgICB9YDtcbiAgfVxufVxuXG4vKiogQW4gaW50ZXJmYWNlIGZvciByZWdpc3RlcmluZyBtaWRkbGV3YXJlIHRoYXQgd2lsbCBydW4gd2hlbiBjZXJ0YWluIEhUVFBcbiAqIG1ldGhvZHMgYW5kIHBhdGhzIGFyZSByZXF1ZXN0ZWQsIGFzIHdlbGwgYXMgcHJvdmlkZXMgYSB3YXkgdG8gcGFyYW1ldGVyaXplXG4gKiBwYXJ0cyBvZiB0aGUgcmVxdWVzdGVkIHBhdGguXG4gKlxuICogIyMjIEJhc2ljIGV4YW1wbGVcbiAqXG4gKiBgYGB0c1xuICogaW1wb3J0IHsgQXBwbGljYXRpb24sIFJvdXRlciB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC94L29hay9tb2QudHNcIjtcbiAqXG4gKiBjb25zdCByb3V0ZXIgPSBuZXcgUm91dGVyKCk7XG4gKiByb3V0ZXIuZ2V0KFwiL1wiLCAoY3R4LCBuZXh0KSA9PiB7XG4gKiAgIC8vIGhhbmRsZSB0aGUgR0VUIGVuZHBvaW50IGhlcmVcbiAqIH0pO1xuICogcm91dGVyLmFsbChcIi9pdGVtLzppdGVtXCIsIChjdHgsIG5leHQpID0+IHtcbiAqICAgLy8gY2FsbGVkIGZvciBhbGwgSFRUUCB2ZXJicy9yZXF1ZXN0c1xuICogICBjdHgucGFyYW1zLml0ZW07IC8vIGNvbnRhaW5zIHRoZSB2YWx1ZSBvZiBgOml0ZW1gIGZyb20gdGhlIHBhcnNlZCBVUkxcbiAqIH0pO1xuICpcbiAqIGNvbnN0IGFwcCA9IG5ldyBBcHBsaWNhdGlvbigpO1xuICogYXBwLnVzZShyb3V0ZXIucm91dGVzKCkpO1xuICogYXBwLnVzZShyb3V0ZXIuYWxsb3dlZE1ldGhvZHMoKSk7XG4gKlxuICogYXBwLmxpc3Rlbih7IHBvcnQ6IDgwODAgfSk7XG4gKiBgYGBcbiAqL1xuZXhwb3J0IGNsYXNzIFJvdXRlcjxcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgUlMgZXh0ZW5kcyBTdGF0ZSA9IFJlY29yZDxzdHJpbmcsIGFueT4sXG4+IHtcbiAgI29wdHM6IFJvdXRlck9wdGlvbnM7XG4gICNtZXRob2RzOiBIVFRQTWV0aG9kc1tdO1xuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAjcGFyYW1zOiBSZWNvcmQ8c3RyaW5nLCBSb3V0ZXJQYXJhbU1pZGRsZXdhcmU8YW55LCBhbnksIGFueT4+ID0ge307XG4gICNzdGFjazogTGF5ZXI8c3RyaW5nPltdID0gW107XG5cbiAgI21hdGNoKHBhdGg6IHN0cmluZywgbWV0aG9kOiBIVFRQTWV0aG9kcyk6IE1hdGNoZXM8c3RyaW5nPiB7XG4gICAgY29uc3QgbWF0Y2hlczogTWF0Y2hlczxzdHJpbmc+ID0ge1xuICAgICAgcGF0aDogW10sXG4gICAgICBwYXRoQW5kTWV0aG9kOiBbXSxcbiAgICAgIHJvdXRlOiBmYWxzZSxcbiAgICB9O1xuXG4gICAgZm9yIChjb25zdCByb3V0ZSBvZiB0aGlzLiNzdGFjaykge1xuICAgICAgaWYgKHJvdXRlLm1hdGNoKHBhdGgpKSB7XG4gICAgICAgIG1hdGNoZXMucGF0aC5wdXNoKHJvdXRlKTtcbiAgICAgICAgaWYgKHJvdXRlLm1ldGhvZHMubGVuZ3RoID09PSAwIHx8IHJvdXRlLm1ldGhvZHMuaW5jbHVkZXMobWV0aG9kKSkge1xuICAgICAgICAgIG1hdGNoZXMucGF0aEFuZE1ldGhvZC5wdXNoKHJvdXRlKTtcbiAgICAgICAgICBpZiAocm91dGUubWV0aG9kcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIG1hdGNoZXMucm91dGUgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBtYXRjaGVzO1xuICB9XG5cbiAgI3JlZ2lzdGVyKFxuICAgIHBhdGg6IHN0cmluZyB8IHN0cmluZ1tdLFxuICAgIG1pZGRsZXdhcmVzOiBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZz5bXSxcbiAgICBtZXRob2RzOiBIVFRQTWV0aG9kc1tdLFxuICAgIG9wdGlvbnM6IFJlZ2lzdGVyT3B0aW9ucyA9IHt9LFxuICApOiB2b2lkIHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShwYXRoKSkge1xuICAgICAgZm9yIChjb25zdCBwIG9mIHBhdGgpIHtcbiAgICAgICAgdGhpcy4jcmVnaXN0ZXIocCwgbWlkZGxld2FyZXMsIG1ldGhvZHMsIG9wdGlvbnMpO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCBsYXllck1pZGRsZXdhcmVzOiBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZz5bXSA9IFtdO1xuICAgIGZvciAoY29uc3QgbWlkZGxld2FyZSBvZiBtaWRkbGV3YXJlcykge1xuICAgICAgaWYgKCFtaWRkbGV3YXJlLnJvdXRlcikge1xuICAgICAgICBsYXllck1pZGRsZXdhcmVzLnB1c2gobWlkZGxld2FyZSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAobGF5ZXJNaWRkbGV3YXJlcy5sZW5ndGgpIHtcbiAgICAgICAgdGhpcy4jYWRkTGF5ZXIocGF0aCwgbGF5ZXJNaWRkbGV3YXJlcywgbWV0aG9kcywgb3B0aW9ucyk7XG4gICAgICAgIGxheWVyTWlkZGxld2FyZXMgPSBbXTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgcm91dGVyID0gbWlkZGxld2FyZS5yb3V0ZXIuI2Nsb25lKCk7XG5cbiAgICAgIGZvciAoY29uc3QgbGF5ZXIgb2Ygcm91dGVyLiNzdGFjaykge1xuICAgICAgICBpZiAoIW9wdGlvbnMuaWdub3JlUHJlZml4KSB7XG4gICAgICAgICAgbGF5ZXIuc2V0UHJlZml4KHBhdGgpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLiNvcHRzLnByZWZpeCkge1xuICAgICAgICAgIGxheWVyLnNldFByZWZpeCh0aGlzLiNvcHRzLnByZWZpeCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4jc3RhY2sucHVzaChsYXllcik7XG4gICAgICB9XG5cbiAgICAgIGZvciAoY29uc3QgW3BhcmFtLCBtd10gb2YgT2JqZWN0LmVudHJpZXModGhpcy4jcGFyYW1zKSkge1xuICAgICAgICByb3V0ZXIucGFyYW0ocGFyYW0sIG13KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobGF5ZXJNaWRkbGV3YXJlcy5sZW5ndGgpIHtcbiAgICAgIHRoaXMuI2FkZExheWVyKHBhdGgsIGxheWVyTWlkZGxld2FyZXMsIG1ldGhvZHMsIG9wdGlvbnMpO1xuICAgIH1cbiAgfVxuXG4gICNhZGRMYXllcihcbiAgICBwYXRoOiBzdHJpbmcsXG4gICAgbWlkZGxld2FyZXM6IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nPltdLFxuICAgIG1ldGhvZHM6IEhUVFBNZXRob2RzW10sXG4gICAgb3B0aW9uczogTGF5ZXJPcHRpb25zID0ge30sXG4gICkge1xuICAgIGNvbnN0IHtcbiAgICAgIGVuZCxcbiAgICAgIG5hbWUsXG4gICAgICBzZW5zaXRpdmUgPSB0aGlzLiNvcHRzLnNlbnNpdGl2ZSxcbiAgICAgIHN0cmljdCA9IHRoaXMuI29wdHMuc3RyaWN0LFxuICAgICAgaWdub3JlQ2FwdHVyZXMsXG4gICAgfSA9IG9wdGlvbnM7XG4gICAgY29uc3Qgcm91dGUgPSBuZXcgTGF5ZXIocGF0aCwgbWV0aG9kcywgbWlkZGxld2FyZXMsIHtcbiAgICAgIGVuZCxcbiAgICAgIG5hbWUsXG4gICAgICBzZW5zaXRpdmUsXG4gICAgICBzdHJpY3QsXG4gICAgICBpZ25vcmVDYXB0dXJlcyxcbiAgICB9KTtcblxuICAgIGlmICh0aGlzLiNvcHRzLnByZWZpeCkge1xuICAgICAgcm91dGUuc2V0UHJlZml4KHRoaXMuI29wdHMucHJlZml4KTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IFtwYXJhbSwgbXddIG9mIE9iamVjdC5lbnRyaWVzKHRoaXMuI3BhcmFtcykpIHtcbiAgICAgIHJvdXRlLnBhcmFtKHBhcmFtLCBtdyk7XG4gICAgfVxuXG4gICAgdGhpcy4jc3RhY2sucHVzaChyb3V0ZSk7XG4gIH1cblxuICAjcm91dGUobmFtZTogc3RyaW5nKTogTGF5ZXI8c3RyaW5nPiB8IHVuZGVmaW5lZCB7XG4gICAgZm9yIChjb25zdCByb3V0ZSBvZiB0aGlzLiNzdGFjaykge1xuICAgICAgaWYgKHJvdXRlLm5hbWUgPT09IG5hbWUpIHtcbiAgICAgICAgcmV0dXJuIHJvdXRlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gICN1c2VWZXJiKFxuICAgIG5hbWVPclBhdGg6IHN0cmluZyxcbiAgICBwYXRoT3JNaWRkbGV3YXJlOiBzdHJpbmcgfCBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZz4sXG4gICAgbWlkZGxld2FyZTogUm91dGVyTWlkZGxld2FyZTxzdHJpbmc+W10sXG4gICAgbWV0aG9kczogSFRUUE1ldGhvZHNbXSxcbiAgKTogdm9pZCB7XG4gICAgbGV0IG5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcbiAgICBsZXQgcGF0aDogc3RyaW5nO1xuICAgIGlmICh0eXBlb2YgcGF0aE9yTWlkZGxld2FyZSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgbmFtZSA9IG5hbWVPclBhdGg7XG4gICAgICBwYXRoID0gcGF0aE9yTWlkZGxld2FyZTtcbiAgICB9IGVsc2Uge1xuICAgICAgcGF0aCA9IG5hbWVPclBhdGg7XG4gICAgICBtaWRkbGV3YXJlLnVuc2hpZnQocGF0aE9yTWlkZGxld2FyZSk7XG4gICAgfVxuXG4gICAgdGhpcy4jcmVnaXN0ZXIocGF0aCwgbWlkZGxld2FyZSwgbWV0aG9kcywgeyBuYW1lIH0pO1xuICB9XG5cbiAgI2Nsb25lKCk6IFJvdXRlcjxSUz4ge1xuICAgIGNvbnN0IHJvdXRlciA9IG5ldyBSb3V0ZXI8UlM+KHRoaXMuI29wdHMpO1xuICAgIHJvdXRlci4jbWV0aG9kcyA9IHJvdXRlci4jbWV0aG9kcy5zbGljZSgpO1xuICAgIHJvdXRlci4jcGFyYW1zID0geyAuLi50aGlzLiNwYXJhbXMgfTtcbiAgICByb3V0ZXIuI3N0YWNrID0gdGhpcy4jc3RhY2subWFwKChsYXllcikgPT4gbGF5ZXIuY2xvbmUoKSk7XG4gICAgcmV0dXJuIHJvdXRlcjtcbiAgfVxuXG4gIGNvbnN0cnVjdG9yKG9wdHM6IFJvdXRlck9wdGlvbnMgPSB7fSkge1xuICAgIHRoaXMuI29wdHMgPSBvcHRzO1xuICAgIHRoaXMuI21ldGhvZHMgPSBvcHRzLm1ldGhvZHMgPz8gW1xuICAgICAgXCJERUxFVEVcIixcbiAgICAgIFwiR0VUXCIsXG4gICAgICBcIkhFQURcIixcbiAgICAgIFwiT1BUSU9OU1wiLFxuICAgICAgXCJQQVRDSFwiLFxuICAgICAgXCJQT1NUXCIsXG4gICAgICBcIlBVVFwiLFxuICAgIF07XG4gIH1cblxuICAvKiogUmVnaXN0ZXIgbmFtZWQgbWlkZGxld2FyZSBmb3IgdGhlIHNwZWNpZmllZCByb3V0ZXMgd2hlbiB0aGUgYERFTEVURWAsXG4gICAqIGBHRVRgLCBgUE9TVGAsIG9yIGBQVVRgIG1ldGhvZCBpcyByZXF1ZXN0ZWQuICovXG4gIGFsbDxcbiAgICBSIGV4dGVuZHMgc3RyaW5nLFxuICAgIFAgZXh0ZW5kcyBSb3V0ZVBhcmFtczxSPiA9IFJvdXRlUGFyYW1zPFI+LFxuICAgIFMgZXh0ZW5kcyBTdGF0ZSA9IFJTLFxuICA+KFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBwYXRoOiBSLFxuICAgIG1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz4sXG4gICAgLi4ubWlkZGxld2FyZXM6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz5bXVxuICApOiBSb3V0ZXI8UyBleHRlbmRzIFJTID8gUyA6IChTICYgUlMpPjtcbiAgLyoqIFJlZ2lzdGVyIG1pZGRsZXdhcmUgZm9yIHRoZSBzcGVjaWZpZWQgcm91dGVzIHdoZW4gdGhlIGBERUxFVEVgLFxuICAgKiBgR0VUYCwgYFBPU1RgLCBvciBgUFVUYCBtZXRob2QgaXMgcmVxdWVzdGVkLiAqL1xuICBhbGw8XG4gICAgUiBleHRlbmRzIHN0cmluZyxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8Uj4gPSBSb3V0ZVBhcmFtczxSPixcbiAgICBTIGV4dGVuZHMgU3RhdGUgPSBSUyxcbiAgPihcbiAgICBwYXRoOiBSLFxuICAgIG1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz4sXG4gICAgLi4ubWlkZGxld2FyZXM6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz5bXVxuICApOiBSb3V0ZXI8UyBleHRlbmRzIFJTID8gUyA6IChTICYgUlMpPjtcbiAgLyoqIFJlZ2lzdGVyIG1pZGRsZXdhcmUgZm9yIHRoZSBzcGVjaWZpZWQgcm91dGVzIHdoZW4gdGhlIGBERUxFVEVgLFxuICAgKiBgR0VUYCwgYFBPU1RgLCBvciBgUFVUYCBtZXRob2QgaXMgcmVxdWVzdGVkIHdpdGggZXhwbGljaXQgcGF0aCBwYXJhbWV0ZXJzLlxuICAgKi9cbiAgYWxsPFxuICAgIFAgZXh0ZW5kcyBSb3V0ZVBhcmFtczxzdHJpbmc+LFxuICAgIFMgZXh0ZW5kcyBTdGF0ZSA9IFJTLFxuICA+KFxuICAgIG5hbWVPclBhdGg6IHN0cmluZyxcbiAgICBwYXRoT3JNaWRkbGV3YXJlOiBzdHJpbmcgfCBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZywgUCwgUz4sXG4gICAgLi4ubWlkZGxld2FyZTogUm91dGVyTWlkZGxld2FyZTxzdHJpbmcsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT47XG4gIGFsbDxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8c3RyaW5nPiA9IFJvdXRlUGFyYW1zPHN0cmluZz4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgbmFtZU9yUGF0aDogc3RyaW5nLFxuICAgIHBhdGhPck1pZGRsZXdhcmU6IHN0cmluZyB8IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nLCBQLCBTPixcbiAgICAuLi5taWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZywgUCwgUz5bXVxuICApOiBSb3V0ZXI8UyBleHRlbmRzIFJTID8gUyA6IChTICYgUlMpPiB7XG4gICAgdGhpcy4jdXNlVmVyYihcbiAgICAgIG5hbWVPclBhdGgsXG4gICAgICBwYXRoT3JNaWRkbGV3YXJlIGFzIChzdHJpbmcgfCBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZz4pLFxuICAgICAgbWlkZGxld2FyZSBhcyBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZz5bXSxcbiAgICAgIFtcIkRFTEVURVwiLCBcIkdFVFwiLCBcIlBPU1RcIiwgXCJQVVRcIl0sXG4gICAgKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKiBNaWRkbGV3YXJlIHRoYXQgaGFuZGxlcyByZXF1ZXN0cyBmb3IgSFRUUCBtZXRob2RzIHJlZ2lzdGVyZWQgd2l0aCB0aGVcbiAgICogcm91dGVyLiAgSWYgbm9uZSBvZiB0aGUgcm91dGVzIGhhbmRsZSBhIG1ldGhvZCwgdGhlbiBcIm5vdCBhbGxvd2VkXCIgbG9naWNcbiAgICogd2lsbCBiZSB1c2VkLiAgSWYgYSBtZXRob2QgaXMgc3VwcG9ydGVkIGJ5IHNvbWUgcm91dGVzLCBidXQgbm90IHRoZVxuICAgKiBwYXJ0aWN1bGFyIG1hdGNoZWQgcm91dGVyLCB0aGVuIFwibm90IGltcGxlbWVudGVkXCIgd2lsbCBiZSByZXR1cm5lZC5cbiAgICpcbiAgICogVGhlIG1pZGRsZXdhcmUgd2lsbCBhbHNvIGF1dG9tYXRpY2FsbHkgaGFuZGxlIHRoZSBgT1BUSU9OU2AgbWV0aG9kLFxuICAgKiByZXNwb25kaW5nIHdpdGggYSBgMjAwIE9LYCB3aGVuIHRoZSBgQWxsb3dlZGAgaGVhZGVyIHNlbnQgdG8gdGhlIGFsbG93ZWRcbiAgICogbWV0aG9kcyBmb3IgYSBnaXZlbiByb3V0ZS5cbiAgICpcbiAgICogQnkgZGVmYXVsdCwgYSBcIm5vdCBhbGxvd2VkXCIgcmVxdWVzdCB3aWxsIHJlc3BvbmQgd2l0aCBhIGA0MDUgTm90IEFsbG93ZWRgXG4gICAqIGFuZCBhIFwibm90IGltcGxlbWVudGVkXCIgd2lsbCByZXNwb25kIHdpdGggYSBgNTAxIE5vdCBJbXBsZW1lbnRlZGAuIFNldHRpbmdcbiAgICogdGhlIG9wdGlvbiBgLnRocm93YCB0byBgdHJ1ZWAgd2lsbCBjYXVzZSB0aGUgbWlkZGxld2FyZSB0byB0aHJvdyBhblxuICAgKiBgSFRUUEVycm9yYCBpbnN0ZWFkIG9mIHNldHRpbmcgdGhlIHJlc3BvbnNlIHN0YXR1cy4gIFRoZSBlcnJvciBjYW4gYmVcbiAgICogb3ZlcnJpZGRlbiBieSBwcm92aWRpbmcgYSBgLm5vdEltcGxlbWVudGVkYCBvciBgLm5vdEFsbG93ZWRgIG1ldGhvZCBpbiB0aGVcbiAgICogb3B0aW9ucywgb2Ygd2hpY2ggdGhlIHZhbHVlIHdpbGwgYmUgcmV0dXJuZWQgd2lsbCBiZSB0aHJvd24gaW5zdGVhZCBvZiB0aGVcbiAgICogSFRUUCBlcnJvci4gKi9cbiAgYWxsb3dlZE1ldGhvZHMoXG4gICAgb3B0aW9uczogUm91dGVyQWxsb3dlZE1ldGhvZHNPcHRpb25zID0ge30sXG4gICk6IE1pZGRsZXdhcmUge1xuICAgIGNvbnN0IGltcGxlbWVudGVkID0gdGhpcy4jbWV0aG9kcztcblxuICAgIGNvbnN0IGFsbG93ZWRNZXRob2RzOiBNaWRkbGV3YXJlID0gYXN5bmMgKGNvbnRleHQsIG5leHQpID0+IHtcbiAgICAgIGNvbnN0IGN0eCA9IGNvbnRleHQgYXMgUm91dGVyQ29udGV4dDxzdHJpbmc+O1xuICAgICAgYXdhaXQgbmV4dCgpO1xuICAgICAgaWYgKCFjdHgucmVzcG9uc2Uuc3RhdHVzIHx8IGN0eC5yZXNwb25zZS5zdGF0dXMgPT09IFN0YXR1cy5Ob3RGb3VuZCkge1xuICAgICAgICBhc3NlcnQoY3R4Lm1hdGNoZWQpO1xuICAgICAgICBjb25zdCBhbGxvd2VkID0gbmV3IFNldDxIVFRQTWV0aG9kcz4oKTtcbiAgICAgICAgZm9yIChjb25zdCByb3V0ZSBvZiBjdHgubWF0Y2hlZCkge1xuICAgICAgICAgIGZvciAoY29uc3QgbWV0aG9kIG9mIHJvdXRlLm1ldGhvZHMpIHtcbiAgICAgICAgICAgIGFsbG93ZWQuYWRkKG1ldGhvZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgYWxsb3dlZFN0ciA9IFsuLi5hbGxvd2VkXS5qb2luKFwiLCBcIik7XG4gICAgICAgIGlmICghaW1wbGVtZW50ZWQuaW5jbHVkZXMoY3R4LnJlcXVlc3QubWV0aG9kKSkge1xuICAgICAgICAgIGlmIChvcHRpb25zLnRocm93KSB7XG4gICAgICAgICAgICB0aHJvdyBvcHRpb25zLm5vdEltcGxlbWVudGVkXG4gICAgICAgICAgICAgID8gb3B0aW9ucy5ub3RJbXBsZW1lbnRlZCgpXG4gICAgICAgICAgICAgIDogbmV3IGVycm9ycy5Ob3RJbXBsZW1lbnRlZCgpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjdHgucmVzcG9uc2Uuc3RhdHVzID0gU3RhdHVzLk5vdEltcGxlbWVudGVkO1xuICAgICAgICAgICAgY3R4LnJlc3BvbnNlLmhlYWRlcnMuc2V0KFwiQWxsb3dlZFwiLCBhbGxvd2VkU3RyKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoYWxsb3dlZC5zaXplKSB7XG4gICAgICAgICAgaWYgKGN0eC5yZXF1ZXN0Lm1ldGhvZCA9PT0gXCJPUFRJT05TXCIpIHtcbiAgICAgICAgICAgIGN0eC5yZXNwb25zZS5zdGF0dXMgPSBTdGF0dXMuT0s7XG4gICAgICAgICAgICBjdHgucmVzcG9uc2UuaGVhZGVycy5zZXQoXCJBbGxvd2VkXCIsIGFsbG93ZWRTdHIpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoIWFsbG93ZWQuaGFzKGN0eC5yZXF1ZXN0Lm1ldGhvZCkpIHtcbiAgICAgICAgICAgIGlmIChvcHRpb25zLnRocm93KSB7XG4gICAgICAgICAgICAgIHRocm93IG9wdGlvbnMubWV0aG9kTm90QWxsb3dlZFxuICAgICAgICAgICAgICAgID8gb3B0aW9ucy5tZXRob2ROb3RBbGxvd2VkKClcbiAgICAgICAgICAgICAgICA6IG5ldyBlcnJvcnMuTWV0aG9kTm90QWxsb3dlZCgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY3R4LnJlc3BvbnNlLnN0YXR1cyA9IFN0YXR1cy5NZXRob2ROb3RBbGxvd2VkO1xuICAgICAgICAgICAgICBjdHgucmVzcG9uc2UuaGVhZGVycy5zZXQoXCJBbGxvd2VkXCIsIGFsbG93ZWRTdHIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gYWxsb3dlZE1ldGhvZHM7XG4gIH1cblxuICAvKiogUmVnaXN0ZXIgbmFtZWQgbWlkZGxld2FyZSBmb3IgdGhlIHNwZWNpZmllZCByb3V0ZXMgd2hlbiB0aGUgYERFTEVURWAsXG4gICAqICBtZXRob2QgaXMgcmVxdWVzdGVkLiAqL1xuICBkZWxldGU8XG4gICAgUiBleHRlbmRzIHN0cmluZyxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8Uj4gPSBSb3V0ZVBhcmFtczxSPixcbiAgICBTIGV4dGVuZHMgU3RhdGUgPSBSUyxcbiAgPihcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgcGF0aDogUixcbiAgICBtaWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+LFxuICAgIC4uLm1pZGRsZXdhcmVzOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT47XG4gIC8qKiBSZWdpc3RlciBtaWRkbGV3YXJlIGZvciB0aGUgc3BlY2lmaWVkIHJvdXRlcyB3aGVuIHRoZSBgREVMRVRFYCxcbiAgICogbWV0aG9kIGlzIHJlcXVlc3RlZC4gKi9cbiAgZGVsZXRlPFxuICAgIFIgZXh0ZW5kcyBzdHJpbmcsXG4gICAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPFI+ID0gUm91dGVQYXJhbXM8Uj4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgcGF0aDogUixcbiAgICBtaWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+LFxuICAgIC4uLm1pZGRsZXdhcmVzOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT47XG4gIC8qKiBSZWdpc3RlciBtaWRkbGV3YXJlIGZvciB0aGUgc3BlY2lmaWVkIHJvdXRlcyB3aGVuIHRoZSBgREVMRVRFYCxcbiAgICogbWV0aG9kIGlzIHJlcXVlc3RlZCB3aXRoIGV4cGxpY2l0IHBhdGggcGFyYW1ldGVycy4gKi9cbiAgZGVsZXRlPFxuICAgIFAgZXh0ZW5kcyBSb3V0ZVBhcmFtczxzdHJpbmc+LFxuICAgIFMgZXh0ZW5kcyBTdGF0ZSA9IFJTLFxuICA+KFxuICAgIG5hbWVPclBhdGg6IHN0cmluZyxcbiAgICBwYXRoT3JNaWRkbGV3YXJlOiBzdHJpbmcgfCBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZywgUCwgUz4sXG4gICAgLi4ubWlkZGxld2FyZTogUm91dGVyTWlkZGxld2FyZTxzdHJpbmcsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT47XG4gIGRlbGV0ZTxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8c3RyaW5nPiA9IFJvdXRlUGFyYW1zPHN0cmluZz4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgbmFtZU9yUGF0aDogc3RyaW5nLFxuICAgIHBhdGhPck1pZGRsZXdhcmU6IHN0cmluZyB8IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nLCBQLCBTPixcbiAgICAuLi5taWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZywgUCwgUz5bXVxuICApOiBSb3V0ZXI8UyBleHRlbmRzIFJTID8gUyA6IChTICYgUlMpPiB7XG4gICAgdGhpcy4jdXNlVmVyYihcbiAgICAgIG5hbWVPclBhdGgsXG4gICAgICBwYXRoT3JNaWRkbGV3YXJlIGFzIChzdHJpbmcgfCBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZz4pLFxuICAgICAgbWlkZGxld2FyZSBhcyBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZz5bXSxcbiAgICAgIFtcIkRFTEVURVwiXSxcbiAgICApO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqIEl0ZXJhdGUgb3ZlciB0aGUgcm91dGVzIGN1cnJlbnRseSBhZGRlZCB0byB0aGUgcm91dGVyLiAgVG8gYmUgY29tcGF0aWJsZVxuICAgKiB3aXRoIHRoZSBpdGVyYWJsZSBpbnRlcmZhY2VzLCBib3RoIHRoZSBrZXkgYW5kIHZhbHVlIGFyZSBzZXQgdG8gdGhlIHZhbHVlXG4gICAqIG9mIHRoZSByb3V0ZS4gKi9cbiAgKmVudHJpZXMoKTogSXRlcmFibGVJdGVyYXRvcjxbUm91dGU8c3RyaW5nPiwgUm91dGU8c3RyaW5nPl0+IHtcbiAgICBmb3IgKGNvbnN0IHJvdXRlIG9mIHRoaXMuI3N0YWNrKSB7XG4gICAgICBjb25zdCB2YWx1ZSA9IHJvdXRlLnRvSlNPTigpO1xuICAgICAgeWllbGQgW3ZhbHVlLCB2YWx1ZV07XG4gICAgfVxuICB9XG5cbiAgLyoqIEl0ZXJhdGUgb3ZlciB0aGUgcm91dGVzIGN1cnJlbnRseSBhZGRlZCB0byB0aGUgcm91dGVyLCBjYWxsaW5nIHRoZVxuICAgKiBgY2FsbGJhY2tgIGZ1bmN0aW9uIGZvciBlYWNoIHZhbHVlLiAqL1xuICBmb3JFYWNoKFxuICAgIGNhbGxiYWNrOiAoXG4gICAgICB2YWx1ZTE6IFJvdXRlPHN0cmluZz4sXG4gICAgICB2YWx1ZTI6IFJvdXRlPHN0cmluZz4sXG4gICAgICByb3V0ZXI6IHRoaXMsXG4gICAgKSA9PiB2b2lkLFxuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgdGhpc0FyZzogYW55ID0gbnVsbCxcbiAgKTogdm9pZCB7XG4gICAgZm9yIChjb25zdCByb3V0ZSBvZiB0aGlzLiNzdGFjaykge1xuICAgICAgY29uc3QgdmFsdWUgPSByb3V0ZS50b0pTT04oKTtcbiAgICAgIGNhbGxiYWNrLmNhbGwodGhpc0FyZywgdmFsdWUsIHZhbHVlLCB0aGlzKTtcbiAgICB9XG4gIH1cblxuICAvKiogUmVnaXN0ZXIgbmFtZWQgbWlkZGxld2FyZSBmb3IgdGhlIHNwZWNpZmllZCByb3V0ZXMgd2hlbiB0aGUgYEdFVGAsXG4gICAqICBtZXRob2QgaXMgcmVxdWVzdGVkLiAqL1xuICBnZXQ8XG4gICAgUiBleHRlbmRzIHN0cmluZyxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8Uj4gPSBSb3V0ZVBhcmFtczxSPixcbiAgICBTIGV4dGVuZHMgU3RhdGUgPSBSUyxcbiAgPihcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgcGF0aDogUixcbiAgICBtaWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+LFxuICAgIC4uLm1pZGRsZXdhcmVzOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT47XG4gIC8qKiBSZWdpc3RlciBtaWRkbGV3YXJlIGZvciB0aGUgc3BlY2lmaWVkIHJvdXRlcyB3aGVuIHRoZSBgR0VUYCxcbiAgICogbWV0aG9kIGlzIHJlcXVlc3RlZC4gKi9cbiAgZ2V0PFxuICAgIFIgZXh0ZW5kcyBzdHJpbmcsXG4gICAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPFI+ID0gUm91dGVQYXJhbXM8Uj4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgcGF0aDogUixcbiAgICBtaWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+LFxuICAgIC4uLm1pZGRsZXdhcmVzOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT47XG4gIC8qKiBSZWdpc3RlciBtaWRkbGV3YXJlIGZvciB0aGUgc3BlY2lmaWVkIHJvdXRlcyB3aGVuIHRoZSBgR0VUYCxcbiAgICogbWV0aG9kIGlzIHJlcXVlc3RlZCB3aXRoIGV4cGxpY2l0IHBhdGggcGFyYW1ldGVycy4gKi9cbiAgZ2V0PFxuICAgIFAgZXh0ZW5kcyBSb3V0ZVBhcmFtczxzdHJpbmc+LFxuICAgIFMgZXh0ZW5kcyBTdGF0ZSA9IFJTLFxuICA+KFxuICAgIG5hbWVPclBhdGg6IHN0cmluZyxcbiAgICBwYXRoT3JNaWRkbGV3YXJlOiBzdHJpbmcgfCBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZywgUCwgUz4sXG4gICAgLi4ubWlkZGxld2FyZTogUm91dGVyTWlkZGxld2FyZTxzdHJpbmcsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT47XG4gIGdldDxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8c3RyaW5nPiA9IFJvdXRlUGFyYW1zPHN0cmluZz4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgbmFtZU9yUGF0aDogc3RyaW5nLFxuICAgIHBhdGhPck1pZGRsZXdhcmU6IHN0cmluZyB8IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nLCBQLCBTPixcbiAgICAuLi5taWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZywgUCwgUz5bXVxuICApOiBSb3V0ZXI8UyBleHRlbmRzIFJTID8gUyA6IChTICYgUlMpPiB7XG4gICAgdGhpcy4jdXNlVmVyYihcbiAgICAgIG5hbWVPclBhdGgsXG4gICAgICBwYXRoT3JNaWRkbGV3YXJlIGFzIChzdHJpbmcgfCBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZz4pLFxuICAgICAgbWlkZGxld2FyZSBhcyBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZz5bXSxcbiAgICAgIFtcIkdFVFwiXSxcbiAgICApO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqIFJlZ2lzdGVyIG5hbWVkIG1pZGRsZXdhcmUgZm9yIHRoZSBzcGVjaWZpZWQgcm91dGVzIHdoZW4gdGhlIGBIRUFEYCxcbiAgICogIG1ldGhvZCBpcyByZXF1ZXN0ZWQuICovXG4gIGhlYWQ8XG4gICAgUiBleHRlbmRzIHN0cmluZyxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8Uj4gPSBSb3V0ZVBhcmFtczxSPixcbiAgICBTIGV4dGVuZHMgU3RhdGUgPSBSUyxcbiAgPihcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgcGF0aDogUixcbiAgICBtaWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+LFxuICAgIC4uLm1pZGRsZXdhcmVzOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT47XG4gIC8qKiBSZWdpc3RlciBtaWRkbGV3YXJlIGZvciB0aGUgc3BlY2lmaWVkIHJvdXRlcyB3aGVuIHRoZSBgSEVBRGAsXG4gICAqIG1ldGhvZCBpcyByZXF1ZXN0ZWQuICovXG4gIGhlYWQ8XG4gICAgUiBleHRlbmRzIHN0cmluZyxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8Uj4gPSBSb3V0ZVBhcmFtczxSPixcbiAgICBTIGV4dGVuZHMgU3RhdGUgPSBSUyxcbiAgPihcbiAgICBwYXRoOiBSLFxuICAgIG1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz4sXG4gICAgLi4ubWlkZGxld2FyZXM6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz5bXVxuICApOiBSb3V0ZXI8UyBleHRlbmRzIFJTID8gUyA6IChTICYgUlMpPjtcbiAgLyoqIFJlZ2lzdGVyIG1pZGRsZXdhcmUgZm9yIHRoZSBzcGVjaWZpZWQgcm91dGVzIHdoZW4gdGhlIGBIRUFEYCxcbiAgICogbWV0aG9kIGlzIHJlcXVlc3RlZCB3aXRoIGV4cGxpY2l0IHBhdGggcGFyYW1ldGVycy4gKi9cbiAgaGVhZDxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8c3RyaW5nPixcbiAgICBTIGV4dGVuZHMgU3RhdGUgPSBSUyxcbiAgPihcbiAgICBuYW1lT3JQYXRoOiBzdHJpbmcsXG4gICAgcGF0aE9yTWlkZGxld2FyZTogc3RyaW5nIHwgUm91dGVyTWlkZGxld2FyZTxzdHJpbmcsIFAsIFM+LFxuICAgIC4uLm1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nLCBQLCBTPltdXG4gICk6IFJvdXRlcjxTIGV4dGVuZHMgUlMgPyBTIDogKFMgJiBSUyk+O1xuICBoZWFkPFxuICAgIFAgZXh0ZW5kcyBSb3V0ZVBhcmFtczxzdHJpbmc+ID0gUm91dGVQYXJhbXM8c3RyaW5nPixcbiAgICBTIGV4dGVuZHMgU3RhdGUgPSBSUyxcbiAgPihcbiAgICBuYW1lT3JQYXRoOiBzdHJpbmcsXG4gICAgcGF0aE9yTWlkZGxld2FyZTogc3RyaW5nIHwgUm91dGVyTWlkZGxld2FyZTxzdHJpbmcsIFAsIFM+LFxuICAgIC4uLm1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nLCBQLCBTPltdXG4gICk6IFJvdXRlcjxTIGV4dGVuZHMgUlMgPyBTIDogKFMgJiBSUyk+IHtcbiAgICB0aGlzLiN1c2VWZXJiKFxuICAgICAgbmFtZU9yUGF0aCxcbiAgICAgIHBhdGhPck1pZGRsZXdhcmUgYXMgKHN0cmluZyB8IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nPiksXG4gICAgICBtaWRkbGV3YXJlIGFzIFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nPltdLFxuICAgICAgW1wiSEVBRFwiXSxcbiAgICApO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqIEl0ZXJhdGUgb3ZlciB0aGUgcm91dGVzIGN1cnJlbnRseSBhZGRlZCB0byB0aGUgcm91dGVyLiAgVG8gYmUgY29tcGF0aWJsZVxuICAgKiB3aXRoIHRoZSBpdGVyYWJsZSBpbnRlcmZhY2VzLCB0aGUga2V5IGlzIHNldCB0byB0aGUgdmFsdWUgb2YgdGhlIHJvdXRlLiAqL1xuICAqa2V5cygpOiBJdGVyYWJsZUl0ZXJhdG9yPFJvdXRlPHN0cmluZz4+IHtcbiAgICBmb3IgKGNvbnN0IHJvdXRlIG9mIHRoaXMuI3N0YWNrKSB7XG4gICAgICB5aWVsZCByb3V0ZS50b0pTT04oKTtcbiAgICB9XG4gIH1cblxuICAvKiogUmVnaXN0ZXIgbmFtZWQgbWlkZGxld2FyZSBmb3IgdGhlIHNwZWNpZmllZCByb3V0ZXMgd2hlbiB0aGUgYE9QVElPTlNgLFxuICAgKiBtZXRob2QgaXMgcmVxdWVzdGVkLiAqL1xuICBvcHRpb25zPFxuICAgIFIgZXh0ZW5kcyBzdHJpbmcsXG4gICAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPFI+ID0gUm91dGVQYXJhbXM8Uj4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIHBhdGg6IFIsXG4gICAgbWlkZGxld2FyZTogUm91dGVyTWlkZGxld2FyZTxSLCBQLCBTPixcbiAgICAuLi5taWRkbGV3YXJlczogUm91dGVyTWlkZGxld2FyZTxSLCBQLCBTPltdXG4gICk6IFJvdXRlcjxTIGV4dGVuZHMgUlMgPyBTIDogKFMgJiBSUyk+O1xuICAvKiogUmVnaXN0ZXIgbWlkZGxld2FyZSBmb3IgdGhlIHNwZWNpZmllZCByb3V0ZXMgd2hlbiB0aGUgYE9QVElPTlNgLFxuICAgKiBtZXRob2QgaXMgcmVxdWVzdGVkLiAqL1xuICBvcHRpb25zPFxuICAgIFIgZXh0ZW5kcyBzdHJpbmcsXG4gICAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPFI+ID0gUm91dGVQYXJhbXM8Uj4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgcGF0aDogUixcbiAgICBtaWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+LFxuICAgIC4uLm1pZGRsZXdhcmVzOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT47XG4gIC8qKiBSZWdpc3RlciBtaWRkbGV3YXJlIGZvciB0aGUgc3BlY2lmaWVkIHJvdXRlcyB3aGVuIHRoZSBgT1BUSU9OU2AsXG4gICAqIG1ldGhvZCBpcyByZXF1ZXN0ZWQgd2l0aCBleHBsaWNpdCBwYXRoIHBhcmFtZXRlcnMuICovXG4gIG9wdGlvbnM8XG4gICAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPHN0cmluZz4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgbmFtZU9yUGF0aDogc3RyaW5nLFxuICAgIHBhdGhPck1pZGRsZXdhcmU6IHN0cmluZyB8IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nLCBQLCBTPixcbiAgICAuLi5taWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZywgUCwgUz5bXVxuICApOiBSb3V0ZXI8UyBleHRlbmRzIFJTID8gUyA6IChTICYgUlMpPjtcbiAgb3B0aW9uczxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8c3RyaW5nPiA9IFJvdXRlUGFyYW1zPHN0cmluZz4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgbmFtZU9yUGF0aDogc3RyaW5nLFxuICAgIHBhdGhPck1pZGRsZXdhcmU6IHN0cmluZyB8IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nLCBQLCBTPixcbiAgICAuLi5taWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZywgUCwgUz5bXVxuICApOiBSb3V0ZXI8UyBleHRlbmRzIFJTID8gUyA6IChTICYgUlMpPiB7XG4gICAgdGhpcy4jdXNlVmVyYihcbiAgICAgIG5hbWVPclBhdGgsXG4gICAgICBwYXRoT3JNaWRkbGV3YXJlIGFzIChzdHJpbmcgfCBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZz4pLFxuICAgICAgbWlkZGxld2FyZSBhcyBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZz5bXSxcbiAgICAgIFtcIk9QVElPTlNcIl0sXG4gICAgKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKiBSZWdpc3RlciBwYXJhbSBtaWRkbGV3YXJlLCB3aGljaCB3aWxsIGJlIGNhbGxlZCB3aGVuIHRoZSBwYXJ0aWN1bGFyIHBhcmFtXG4gICAqIGlzIHBhcnNlZCBmcm9tIHRoZSByb3V0ZS4gKi9cbiAgcGFyYW08UiBleHRlbmRzIHN0cmluZywgUyBleHRlbmRzIFN0YXRlID0gUlM+KFxuICAgIHBhcmFtOiBrZXlvZiBSb3V0ZVBhcmFtczxSPixcbiAgICBtaWRkbGV3YXJlOiBSb3V0ZXJQYXJhbU1pZGRsZXdhcmU8UiwgUm91dGVQYXJhbXM8Uj4sIFM+LFxuICApOiBSb3V0ZXI8Uz4ge1xuICAgIHRoaXMuI3BhcmFtc1twYXJhbSBhcyBzdHJpbmddID0gbWlkZGxld2FyZTtcbiAgICBmb3IgKGNvbnN0IHJvdXRlIG9mIHRoaXMuI3N0YWNrKSB7XG4gICAgICByb3V0ZS5wYXJhbShwYXJhbSBhcyBzdHJpbmcsIG1pZGRsZXdhcmUpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKiBSZWdpc3RlciBuYW1lZCBtaWRkbGV3YXJlIGZvciB0aGUgc3BlY2lmaWVkIHJvdXRlcyB3aGVuIHRoZSBgUEFUQ0hgLFxuICAgKiBtZXRob2QgaXMgcmVxdWVzdGVkLiAqL1xuICBwYXRjaDxcbiAgICBSIGV4dGVuZHMgc3RyaW5nLFxuICAgIFAgZXh0ZW5kcyBSb3V0ZVBhcmFtczxSPiA9IFJvdXRlUGFyYW1zPFI+LFxuICAgIFMgZXh0ZW5kcyBTdGF0ZSA9IFJTLFxuICA+KFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBwYXRoOiBSLFxuICAgIG1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz4sXG4gICAgLi4ubWlkZGxld2FyZXM6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz5bXVxuICApOiBSb3V0ZXI8UyBleHRlbmRzIFJTID8gUyA6IChTICYgUlMpPjtcbiAgLyoqIFJlZ2lzdGVyIG1pZGRsZXdhcmUgZm9yIHRoZSBzcGVjaWZpZWQgcm91dGVzIHdoZW4gdGhlIGBQQVRDSGAsXG4gICAqIG1ldGhvZCBpcyByZXF1ZXN0ZWQuICovXG4gIHBhdGNoPFxuICAgIFIgZXh0ZW5kcyBzdHJpbmcsXG4gICAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPFI+ID0gUm91dGVQYXJhbXM8Uj4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgcGF0aDogUixcbiAgICBtaWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+LFxuICAgIC4uLm1pZGRsZXdhcmVzOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT47XG4gIC8qKiBSZWdpc3RlciBtaWRkbGV3YXJlIGZvciB0aGUgc3BlY2lmaWVkIHJvdXRlcyB3aGVuIHRoZSBgUEFUQ0hgLFxuICAgKiBtZXRob2QgaXMgcmVxdWVzdGVkIHdpdGggZXhwbGljaXQgcGF0aCBwYXJhbWV0ZXJzLiAqL1xuICBwYXRjaDxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8c3RyaW5nPixcbiAgICBTIGV4dGVuZHMgU3RhdGUgPSBSUyxcbiAgPihcbiAgICBuYW1lT3JQYXRoOiBzdHJpbmcsXG4gICAgcGF0aE9yTWlkZGxld2FyZTogc3RyaW5nIHwgUm91dGVyTWlkZGxld2FyZTxzdHJpbmcsIFAsIFM+LFxuICAgIC4uLm1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nLCBQLCBTPltdXG4gICk6IFJvdXRlcjxTIGV4dGVuZHMgUlMgPyBTIDogKFMgJiBSUyk+O1xuICBwYXRjaDxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8c3RyaW5nPiA9IFJvdXRlUGFyYW1zPHN0cmluZz4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgbmFtZU9yUGF0aDogc3RyaW5nLFxuICAgIHBhdGhPck1pZGRsZXdhcmU6IHN0cmluZyB8IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nLCBQLCBTPixcbiAgICAuLi5taWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZywgUCwgUz5bXVxuICApOiBSb3V0ZXI8UyBleHRlbmRzIFJTID8gUyA6IChTICYgUlMpPiB7XG4gICAgdGhpcy4jdXNlVmVyYihcbiAgICAgIG5hbWVPclBhdGgsXG4gICAgICBwYXRoT3JNaWRkbGV3YXJlIGFzIChzdHJpbmcgfCBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZz4pLFxuICAgICAgbWlkZGxld2FyZSBhcyBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZz5bXSxcbiAgICAgIFtcIlBBVENIXCJdLFxuICAgICk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKiogUmVnaXN0ZXIgbmFtZWQgbWlkZGxld2FyZSBmb3IgdGhlIHNwZWNpZmllZCByb3V0ZXMgd2hlbiB0aGUgYFBPU1RgLFxuICAgKiBtZXRob2QgaXMgcmVxdWVzdGVkLiAqL1xuICBwb3N0PFxuICAgIFIgZXh0ZW5kcyBzdHJpbmcsXG4gICAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPFI+ID0gUm91dGVQYXJhbXM8Uj4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIHBhdGg6IFIsXG4gICAgbWlkZGxld2FyZTogUm91dGVyTWlkZGxld2FyZTxSLCBQLCBTPixcbiAgICAuLi5taWRkbGV3YXJlczogUm91dGVyTWlkZGxld2FyZTxSLCBQLCBTPltdXG4gICk6IFJvdXRlcjxTIGV4dGVuZHMgUlMgPyBTIDogKFMgJiBSUyk+O1xuICAvKiogUmVnaXN0ZXIgbWlkZGxld2FyZSBmb3IgdGhlIHNwZWNpZmllZCByb3V0ZXMgd2hlbiB0aGUgYFBPU1RgLFxuICAgKiBtZXRob2QgaXMgcmVxdWVzdGVkLiAqL1xuICBwb3N0PFxuICAgIFIgZXh0ZW5kcyBzdHJpbmcsXG4gICAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPFI+ID0gUm91dGVQYXJhbXM8Uj4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgcGF0aDogUixcbiAgICBtaWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+LFxuICAgIC4uLm1pZGRsZXdhcmVzOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT47XG4gIC8qKiBSZWdpc3RlciBtaWRkbGV3YXJlIGZvciB0aGUgc3BlY2lmaWVkIHJvdXRlcyB3aGVuIHRoZSBgUE9TVGAsXG4gICAqIG1ldGhvZCBpcyByZXF1ZXN0ZWQgd2l0aCBleHBsaWNpdCBwYXRoIHBhcmFtZXRlcnMuICovXG4gIHBvc3Q8XG4gICAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPHN0cmluZz4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgbmFtZU9yUGF0aDogc3RyaW5nLFxuICAgIHBhdGhPck1pZGRsZXdhcmU6IHN0cmluZyB8IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nLCBQLCBTPixcbiAgICAuLi5taWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZywgUCwgUz5bXVxuICApOiBSb3V0ZXI8UyBleHRlbmRzIFJTID8gUyA6IChTICYgUlMpPjtcbiAgcG9zdDxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8c3RyaW5nPiA9IFJvdXRlUGFyYW1zPHN0cmluZz4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgbmFtZU9yUGF0aDogc3RyaW5nLFxuICAgIHBhdGhPck1pZGRsZXdhcmU6IHN0cmluZyB8IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nLCBQLCBTPixcbiAgICAuLi5taWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZywgUCwgUz5bXVxuICApOiBSb3V0ZXI8UyBleHRlbmRzIFJTID8gUyA6IChTICYgUlMpPiB7XG4gICAgdGhpcy4jdXNlVmVyYihcbiAgICAgIG5hbWVPclBhdGgsXG4gICAgICBwYXRoT3JNaWRkbGV3YXJlIGFzIChzdHJpbmcgfCBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZz4pLFxuICAgICAgbWlkZGxld2FyZSBhcyBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZz5bXSxcbiAgICAgIFtcIlBPU1RcIl0sXG4gICAgKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKiBTZXQgdGhlIHJvdXRlciBwcmVmaXggZm9yIHRoaXMgcm91dGVyLiAqL1xuICBwcmVmaXgocHJlZml4OiBzdHJpbmcpOiB0aGlzIHtcbiAgICBwcmVmaXggPSBwcmVmaXgucmVwbGFjZSgvXFwvJC8sIFwiXCIpO1xuICAgIHRoaXMuI29wdHMucHJlZml4ID0gcHJlZml4O1xuICAgIGZvciAoY29uc3Qgcm91dGUgb2YgdGhpcy4jc3RhY2spIHtcbiAgICAgIHJvdXRlLnNldFByZWZpeChwcmVmaXgpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKiBSZWdpc3RlciBuYW1lZCBtaWRkbGV3YXJlIGZvciB0aGUgc3BlY2lmaWVkIHJvdXRlcyB3aGVuIHRoZSBgUFVUYFxuICAgKiBtZXRob2QgaXMgcmVxdWVzdGVkLiAqL1xuICBwdXQ8XG4gICAgUiBleHRlbmRzIHN0cmluZyxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8Uj4gPSBSb3V0ZVBhcmFtczxSPixcbiAgICBTIGV4dGVuZHMgU3RhdGUgPSBSUyxcbiAgPihcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgcGF0aDogUixcbiAgICBtaWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+LFxuICAgIC4uLm1pZGRsZXdhcmVzOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT47XG4gIC8qKiBSZWdpc3RlciBtaWRkbGV3YXJlIGZvciB0aGUgc3BlY2lmaWVkIHJvdXRlcyB3aGVuIHRoZSBgUFVUYFxuICAgKiBtZXRob2QgaXMgcmVxdWVzdGVkLiAqL1xuICBwdXQ8XG4gICAgUiBleHRlbmRzIHN0cmluZyxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8Uj4gPSBSb3V0ZVBhcmFtczxSPixcbiAgICBTIGV4dGVuZHMgU3RhdGUgPSBSUyxcbiAgPihcbiAgICBwYXRoOiBSLFxuICAgIG1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz4sXG4gICAgLi4ubWlkZGxld2FyZXM6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz5bXVxuICApOiBSb3V0ZXI8UyBleHRlbmRzIFJTID8gUyA6IChTICYgUlMpPjtcbiAgLyoqIFJlZ2lzdGVyIG1pZGRsZXdhcmUgZm9yIHRoZSBzcGVjaWZpZWQgcm91dGVzIHdoZW4gdGhlIGBQVVRgXG4gICAqIG1ldGhvZCBpcyByZXF1ZXN0ZWQgd2l0aCBleHBsaWNpdCBwYXRoIHBhcmFtZXRlcnMuICovXG4gIHB1dDxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8c3RyaW5nPixcbiAgICBTIGV4dGVuZHMgU3RhdGUgPSBSUyxcbiAgPihcbiAgICBuYW1lT3JQYXRoOiBzdHJpbmcsXG4gICAgcGF0aE9yTWlkZGxld2FyZTogc3RyaW5nIHwgUm91dGVyTWlkZGxld2FyZTxzdHJpbmcsIFAsIFM+LFxuICAgIC4uLm1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nLCBQLCBTPltdXG4gICk6IFJvdXRlcjxTIGV4dGVuZHMgUlMgPyBTIDogKFMgJiBSUyk+O1xuICBwdXQ8XG4gICAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPHN0cmluZz4gPSBSb3V0ZVBhcmFtczxzdHJpbmc+LFxuICAgIFMgZXh0ZW5kcyBTdGF0ZSA9IFJTLFxuICA+KFxuICAgIG5hbWVPclBhdGg6IHN0cmluZyxcbiAgICBwYXRoT3JNaWRkbGV3YXJlOiBzdHJpbmcgfCBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZywgUCwgUz4sXG4gICAgLi4ubWlkZGxld2FyZTogUm91dGVyTWlkZGxld2FyZTxzdHJpbmcsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT4ge1xuICAgIHRoaXMuI3VzZVZlcmIoXG4gICAgICBuYW1lT3JQYXRoLFxuICAgICAgcGF0aE9yTWlkZGxld2FyZSBhcyAoc3RyaW5nIHwgUm91dGVyTWlkZGxld2FyZTxzdHJpbmc+KSxcbiAgICAgIG1pZGRsZXdhcmUgYXMgUm91dGVyTWlkZGxld2FyZTxzdHJpbmc+W10sXG4gICAgICBbXCJQVVRcIl0sXG4gICAgKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKiBSZWdpc3RlciBhIGRpcmVjdGlvbiBtaWRkbGV3YXJlLCB3aGVyZSB3aGVuIHRoZSBgc291cmNlYCBwYXRoIGlzIG1hdGNoZWRcbiAgICogdGhlIHJvdXRlciB3aWxsIHJlZGlyZWN0IHRoZSByZXF1ZXN0IHRvIHRoZSBgZGVzdGluYXRpb25gIHBhdGguICBBIGBzdGF0dXNgXG4gICAqIG9mIGAzMDIgRm91bmRgIHdpbGwgYmUgc2V0IGJ5IGRlZmF1bHQuXG4gICAqXG4gICAqIFRoZSBgc291cmNlYCBhbmQgYGRlc3RpbmF0aW9uYCBjYW4gYmUgbmFtZWQgcm91dGVzLiAqL1xuICByZWRpcmVjdChcbiAgICBzb3VyY2U6IHN0cmluZyxcbiAgICBkZXN0aW5hdGlvbjogc3RyaW5nIHwgVVJMLFxuICAgIHN0YXR1czogUmVkaXJlY3RTdGF0dXMgPSBTdGF0dXMuRm91bmQsXG4gICk6IHRoaXMge1xuICAgIGlmIChzb3VyY2VbMF0gIT09IFwiL1wiKSB7XG4gICAgICBjb25zdCBzID0gdGhpcy51cmwoc291cmNlKTtcbiAgICAgIGlmICghcykge1xuICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcihgQ291bGQgbm90IHJlc29sdmUgbmFtZWQgcm91dGU6IFwiJHtzb3VyY2V9XCJgKTtcbiAgICAgIH1cbiAgICAgIHNvdXJjZSA9IHM7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZGVzdGluYXRpb24gPT09IFwic3RyaW5nXCIpIHtcbiAgICAgIGlmIChkZXN0aW5hdGlvblswXSAhPT0gXCIvXCIpIHtcbiAgICAgICAgY29uc3QgZCA9IHRoaXMudXJsKGRlc3RpbmF0aW9uKTtcbiAgICAgICAgaWYgKCFkKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwoZGVzdGluYXRpb24pO1xuICAgICAgICAgICAgZGVzdGluYXRpb24gPSB1cmw7XG4gICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcihgQ291bGQgbm90IHJlc29sdmUgbmFtZWQgcm91dGU6IFwiJHtzb3VyY2V9XCJgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZGVzdGluYXRpb24gPSBkO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5hbGwoc291cmNlLCBhc3luYyAoY3R4LCBuZXh0KSA9PiB7XG4gICAgICBhd2FpdCBuZXh0KCk7XG4gICAgICBjdHgucmVzcG9uc2UucmVkaXJlY3QoZGVzdGluYXRpb24pO1xuICAgICAgY3R4LnJlc3BvbnNlLnN0YXR1cyA9IHN0YXR1cztcbiAgICB9KTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKiBSZXR1cm4gbWlkZGxld2FyZSB0aGF0IHdpbGwgZG8gYWxsIHRoZSByb3V0ZSBwcm9jZXNzaW5nIHRoYXQgdGhlIHJvdXRlclxuICAgKiBoYXMgYmVlbiBjb25maWd1cmVkIHRvIGhhbmRsZS4gIFR5cGljYWwgdXNhZ2Ugd291bGQgYmUgc29tZXRoaW5nIGxpa2UgdGhpczpcbiAgICpcbiAgICogYGBgdHNcbiAgICogaW1wb3J0IHsgQXBwbGljYXRpb24sIFJvdXRlciB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC94L29hay9tb2QudHNcIjtcbiAgICpcbiAgICogY29uc3QgYXBwID0gbmV3IEFwcGxpY2F0aW9uKCk7XG4gICAqIGNvbnN0IHJvdXRlciA9IG5ldyBSb3V0ZXIoKTtcbiAgICpcbiAgICogLy8gcmVnaXN0ZXIgcm91dGVzXG4gICAqXG4gICAqIGFwcC51c2Uocm91dGVyLnJvdXRlcygpKTtcbiAgICogYXBwLnVzZShyb3V0ZXIuYWxsb3dlZE1ldGhvZHMoKSk7XG4gICAqIGF3YWl0IGFwcC5saXN0ZW4oeyBwb3J0OiA4MCB9KTtcbiAgICogYGBgXG4gICAqL1xuICByb3V0ZXMoKTogTWlkZGxld2FyZSB7XG4gICAgY29uc3QgZGlzcGF0Y2ggPSAoXG4gICAgICBjb250ZXh0OiBDb250ZXh0LFxuICAgICAgbmV4dDogKCkgPT4gUHJvbWlzZTx1bmtub3duPixcbiAgICApOiBQcm9taXNlPHVua25vd24+ID0+IHtcbiAgICAgIGNvbnN0IGN0eCA9IGNvbnRleHQgYXMgUm91dGVyQ29udGV4dDxzdHJpbmc+O1xuICAgICAgbGV0IHBhdGhuYW1lOiBzdHJpbmc7XG4gICAgICBsZXQgbWV0aG9kOiBIVFRQTWV0aG9kcztcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgdXJsOiB7IHBhdGhuYW1lOiBwIH0sIG1ldGhvZDogbSB9ID0gY3R4LnJlcXVlc3Q7XG4gICAgICAgIHBhdGhuYW1lID0gcDtcbiAgICAgICAgbWV0aG9kID0gbTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGUpO1xuICAgICAgfVxuICAgICAgY29uc3QgcGF0aCA9IHRoaXMuI29wdHMucm91dGVyUGF0aCA/PyBjdHgucm91dGVyUGF0aCA/P1xuICAgICAgICBkZWNvZGVVUkkocGF0aG5hbWUpO1xuICAgICAgY29uc3QgbWF0Y2hlcyA9IHRoaXMuI21hdGNoKHBhdGgsIG1ldGhvZCk7XG5cbiAgICAgIGlmIChjdHgubWF0Y2hlZCkge1xuICAgICAgICBjdHgubWF0Y2hlZC5wdXNoKC4uLm1hdGNoZXMucGF0aCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjdHgubWF0Y2hlZCA9IFsuLi5tYXRjaGVzLnBhdGhdO1xuICAgICAgfVxuXG4gICAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAgICAgY3R4LnJvdXRlciA9IHRoaXMgYXMgUm91dGVyPGFueT47XG5cbiAgICAgIGlmICghbWF0Y2hlcy5yb3V0ZSkgcmV0dXJuIG5leHQoKTtcblxuICAgICAgY29uc3QgeyBwYXRoQW5kTWV0aG9kOiBtYXRjaGVkUm91dGVzIH0gPSBtYXRjaGVzO1xuXG4gICAgICBjb25zdCBjaGFpbiA9IG1hdGNoZWRSb3V0ZXMucmVkdWNlKFxuICAgICAgICAocHJldiwgcm91dGUpID0+IFtcbiAgICAgICAgICAuLi5wcmV2LFxuICAgICAgICAgIChjdHgsIG5leHQpID0+IHtcbiAgICAgICAgICAgIGN0eC5jYXB0dXJlcyA9IHJvdXRlLmNhcHR1cmVzKHBhdGgpO1xuICAgICAgICAgICAgY3R4LnBhcmFtcyA9IHJvdXRlLnBhcmFtcyhjdHguY2FwdHVyZXMsIGN0eC5wYXJhbXMpO1xuICAgICAgICAgICAgY3R4LnJvdXRlTmFtZSA9IHJvdXRlLm5hbWU7XG4gICAgICAgICAgICByZXR1cm4gbmV4dCgpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgLi4ucm91dGUuc3RhY2ssXG4gICAgICAgIF0sXG4gICAgICAgIFtdIGFzIFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nPltdLFxuICAgICAgKTtcbiAgICAgIHJldHVybiBjb21wb3NlKGNoYWluKShjdHgsIG5leHQpO1xuICAgIH07XG4gICAgZGlzcGF0Y2gucm91dGVyID0gdGhpcztcbiAgICByZXR1cm4gZGlzcGF0Y2g7XG4gIH1cblxuICAvKiogR2VuZXJhdGUgYSBVUkwgcGF0aG5hbWUgZm9yIGEgbmFtZWQgcm91dGUsIGludGVycG9sYXRpbmcgdGhlIG9wdGlvbmFsXG4gICAqIHBhcmFtcyBwcm92aWRlZC4gIEFsc28gYWNjZXB0cyBhbiBvcHRpb25hbCBzZXQgb2Ygb3B0aW9ucy4gKi9cbiAgdXJsPFAgZXh0ZW5kcyBSb3V0ZVBhcmFtczxzdHJpbmc+ID0gUm91dGVQYXJhbXM8c3RyaW5nPj4oXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIHBhcmFtcz86IFAsXG4gICAgb3B0aW9ucz86IFVybE9wdGlvbnMsXG4gICk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gICAgY29uc3Qgcm91dGUgPSB0aGlzLiNyb3V0ZShuYW1lKTtcblxuICAgIGlmIChyb3V0ZSkge1xuICAgICAgcmV0dXJuIHJvdXRlLnVybChwYXJhbXMsIG9wdGlvbnMpO1xuICAgIH1cbiAgfVxuXG4gIC8qKiBSZWdpc3RlciBtaWRkbGV3YXJlIHRvIGJlIHVzZWQgb24gZXZlcnkgbWF0Y2hlZCByb3V0ZS4gKi9cbiAgdXNlPFxuICAgIFAgZXh0ZW5kcyBSb3V0ZVBhcmFtczxzdHJpbmc+ID0gUm91dGVQYXJhbXM8c3RyaW5nPixcbiAgICBTIGV4dGVuZHMgU3RhdGUgPSBSUyxcbiAgPihcbiAgICBtaWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZywgUCwgUz4sXG4gICAgLi4ubWlkZGxld2FyZXM6IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nLCBQLCBTPltdXG4gICk6IFJvdXRlcjxTIGV4dGVuZHMgUlMgPyBTIDogKFMgJiBSUyk+O1xuICAvKiogUmVnaXN0ZXIgbWlkZGxld2FyZSB0byBiZSB1c2VkIG9uIGV2ZXJ5IHJvdXRlIHRoYXQgbWF0Y2hlcyB0aGUgc3VwcGxpZWRcbiAgICogYHBhdGhgLiAqL1xuICB1c2U8XG4gICAgUiBleHRlbmRzIHN0cmluZyxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8Uj4gPSBSb3V0ZVBhcmFtczxSPixcbiAgICBTIGV4dGVuZHMgU3RhdGUgPSBSUyxcbiAgPihcbiAgICBwYXRoOiBSLFxuICAgIG1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz4sXG4gICAgLi4ubWlkZGxld2FyZXM6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz5bXVxuICApOiBSb3V0ZXI8UyBleHRlbmRzIFJTID8gUyA6IChTICYgUlMpPjtcbiAgLyoqIFJlZ2lzdGVyIG1pZGRsZXdhcmUgdG8gYmUgdXNlZCBvbiBldmVyeSByb3V0ZSB0aGF0IG1hdGNoZXMgdGhlIHN1cHBsaWVkXG4gICAqIGBwYXRoYCB3aXRoIGV4cGxpY2l0IHBhdGggcGFyYW1ldGVycy4gKi9cbiAgdXNlPFxuICAgIFAgZXh0ZW5kcyBSb3V0ZVBhcmFtczxzdHJpbmc+LFxuICAgIFMgZXh0ZW5kcyBTdGF0ZSA9IFJTLFxuICA+KFxuICAgIHBhdGg6IHN0cmluZyxcbiAgICBtaWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZywgUCwgUz4sXG4gICAgLi4ubWlkZGxld2FyZXM6IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nLCBQLCBTPltdXG4gICk6IFJvdXRlcjxTIGV4dGVuZHMgUlMgPyBTIDogKFMgJiBSUyk+O1xuICB1c2U8XG4gICAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPHN0cmluZz4gPSBSb3V0ZVBhcmFtczxzdHJpbmc+LFxuICAgIFMgZXh0ZW5kcyBTdGF0ZSA9IFJTLFxuICA+KFxuICAgIHBhdGg6IHN0cmluZ1tdLFxuICAgIG1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nLCBQLCBTPixcbiAgICAuLi5taWRkbGV3YXJlczogUm91dGVyTWlkZGxld2FyZTxzdHJpbmcsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT47XG4gIHVzZTxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8c3RyaW5nPiA9IFJvdXRlUGFyYW1zPHN0cmluZz4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgcGF0aE9yTWlkZGxld2FyZTogc3RyaW5nIHwgc3RyaW5nW10gfCBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZywgUCwgUz4sXG4gICAgLi4ubWlkZGxld2FyZTogUm91dGVyTWlkZGxld2FyZTxzdHJpbmcsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT4ge1xuICAgIGxldCBwYXRoOiBzdHJpbmcgfCBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcbiAgICBpZiAoXG4gICAgICB0eXBlb2YgcGF0aE9yTWlkZGxld2FyZSA9PT0gXCJzdHJpbmdcIiB8fCBBcnJheS5pc0FycmF5KHBhdGhPck1pZGRsZXdhcmUpXG4gICAgKSB7XG4gICAgICBwYXRoID0gcGF0aE9yTWlkZGxld2FyZTtcbiAgICB9IGVsc2Uge1xuICAgICAgbWlkZGxld2FyZS51bnNoaWZ0KHBhdGhPck1pZGRsZXdhcmUpO1xuICAgIH1cblxuICAgIHRoaXMuI3JlZ2lzdGVyKFxuICAgICAgcGF0aCA/PyBcIiguKilcIixcbiAgICAgIG1pZGRsZXdhcmUgYXMgUm91dGVyTWlkZGxld2FyZTxzdHJpbmc+W10sXG4gICAgICBbXSxcbiAgICAgIHsgZW5kOiBmYWxzZSwgaWdub3JlQ2FwdHVyZXM6ICFwYXRoLCBpZ25vcmVQcmVmaXg6ICFwYXRoIH0sXG4gICAgKTtcblxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqIEl0ZXJhdGUgb3ZlciB0aGUgcm91dGVzIGN1cnJlbnRseSBhZGRlZCB0byB0aGUgcm91dGVyLiAqL1xuICAqdmFsdWVzKCk6IEl0ZXJhYmxlSXRlcmF0b3I8Um91dGU8c3RyaW5nLCBSb3V0ZVBhcmFtczxzdHJpbmc+LCBSUz4+IHtcbiAgICBmb3IgKGNvbnN0IHJvdXRlIG9mIHRoaXMuI3N0YWNrKSB7XG4gICAgICB5aWVsZCByb3V0ZS50b0pTT04oKTtcbiAgICB9XG4gIH1cblxuICAvKiogUHJvdmlkZSBhbiBpdGVyYXRvciBpbnRlcmZhY2UgdGhhdCBpdGVyYXRlcyBvdmVyIHRoZSByb3V0ZXMgcmVnaXN0ZXJlZFxuICAgKiB3aXRoIHRoZSByb3V0ZXIuICovXG4gICpbU3ltYm9sLml0ZXJhdG9yXSgpOiBJdGVyYWJsZUl0ZXJhdG9yPFxuICAgIFJvdXRlPHN0cmluZywgUm91dGVQYXJhbXM8c3RyaW5nPiwgUlM+XG4gID4ge1xuICAgIGZvciAoY29uc3Qgcm91dGUgb2YgdGhpcy4jc3RhY2spIHtcbiAgICAgIHlpZWxkIHJvdXRlLnRvSlNPTigpO1xuICAgIH1cbiAgfVxuXG4gIC8qKiBHZW5lcmF0ZSBhIFVSTCBwYXRobmFtZSBiYXNlZCBvbiB0aGUgcHJvdmlkZWQgcGF0aCwgaW50ZXJwb2xhdGluZyB0aGVcbiAgICogb3B0aW9uYWwgcGFyYW1zIHByb3ZpZGVkLiAgQWxzbyBhY2NlcHRzIGFuIG9wdGlvbmFsIHNldCBvZiBvcHRpb25zLiAqL1xuICBzdGF0aWMgdXJsPFIgZXh0ZW5kcyBzdHJpbmc+KFxuICAgIHBhdGg6IFIsXG4gICAgcGFyYW1zPzogUm91dGVQYXJhbXM8Uj4sXG4gICAgb3B0aW9ucz86IFVybE9wdGlvbnMsXG4gICk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHRvVXJsKHBhdGgsIHBhcmFtcywgb3B0aW9ucyk7XG4gIH1cblxuICBbU3ltYm9sLmZvcihcIkRlbm8uY3VzdG9tSW5zcGVjdFwiKV0oaW5zcGVjdDogKHZhbHVlOiB1bmtub3duKSA9PiBzdHJpbmcpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5jb25zdHJ1Y3Rvci5uYW1lfSAke1xuICAgICAgaW5zcGVjdCh7IFwiI3BhcmFtc1wiOiB0aGlzLiNwYXJhbXMsIFwiI3N0YWNrXCI6IHRoaXMuI3N0YWNrIH0pXG4gICAgfWA7XG4gIH1cblxuICBbU3ltYm9sLmZvcihcIm5vZGVqcy51dGlsLmluc3BlY3QuY3VzdG9tXCIpXShcbiAgICBkZXB0aDogbnVtYmVyLFxuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgb3B0aW9uczogYW55LFxuICAgIGluc3BlY3Q6ICh2YWx1ZTogdW5rbm93biwgb3B0aW9ucz86IHVua25vd24pID0+IHN0cmluZyxcbiAgKSB7XG4gICAgaWYgKGRlcHRoIDwgMCkge1xuICAgICAgcmV0dXJuIG9wdGlvbnMuc3R5bGl6ZShgWyR7dGhpcy5jb25zdHJ1Y3Rvci5uYW1lfV1gLCBcInNwZWNpYWxcIik7XG4gICAgfVxuXG4gICAgY29uc3QgbmV3T3B0aW9ucyA9IE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIHtcbiAgICAgIGRlcHRoOiBvcHRpb25zLmRlcHRoID09PSBudWxsID8gbnVsbCA6IG9wdGlvbnMuZGVwdGggLSAxLFxuICAgIH0pO1xuICAgIHJldHVybiBgJHtvcHRpb25zLnN0eWxpemUodGhpcy5jb25zdHJ1Y3Rvci5uYW1lLCBcInNwZWNpYWxcIil9ICR7XG4gICAgICBpbnNwZWN0KFxuICAgICAgICB7IFwiI3BhcmFtc1wiOiB0aGlzLiNwYXJhbXMsIFwiI3N0YWNrXCI6IHRoaXMuI3N0YWNrIH0sXG4gICAgICAgIG5ld09wdGlvbnMsXG4gICAg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