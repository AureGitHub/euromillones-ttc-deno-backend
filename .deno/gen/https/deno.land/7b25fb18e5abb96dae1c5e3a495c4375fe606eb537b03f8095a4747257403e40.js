// Copyright 2018-2022 the oak authors. All rights reserved. MIT license.
import { deferred, Status, STATUS_TEXT } from "./deps.ts";
import { HttpRequest } from "./http_request.ts";
import { assert } from "./util.ts";
const serve = "serve" in Deno ? Deno.serve.bind(Deno) : undefined;
function isServeTlsOptions(value) {
    return "cert" in value && "key" in value;
}
/** A function that determines if the current environment supports Deno flash.*/ export function hasFlash() {
    return Boolean(serve);
}
/** A server abstraction which manages requests from Deno's flash server.
 *
 * You can pass the class as the `server` property when constructing a new
 * application to force the application to use Deno's flash server.
 */ export class FlashServer {
    // deno-lint-ignore no-explicit-any
    #app;
    #closed = false;
    #controller;
    #abortController = new AbortController();
    #options;
    #servePromise;
    #stream;
    // deno-lint-ignore no-explicit-any
    constructor(app, options){
        if (!serve) {
            throw new Error("The flash bindings for serving HTTP are not available.");
        }
        this.#app = app;
        this.#options = options;
    }
    async close() {
        if (this.#closed) {
            return;
        }
        this.#closed = true;
        try {
            this.#controller?.close();
            this.#controller = undefined;
            this.#stream = undefined;
            this.#abortController.abort();
            if (this.#servePromise) {
                await this.#servePromise;
                this.#servePromise = undefined;
            }
        } catch  {
        // just swallow here
        }
    }
    listen() {
        const p = deferred();
        const start = (controller)=>{
            this.#controller = controller;
            const options = {
                ...this.#options,
                signal: this.#abortController.signal,
                onListen: (addr)=>p.resolve({
                        addr
                    }),
                onError: (error)=>{
                    this.#app.dispatchEvent(new ErrorEvent("error", {
                        error
                    }));
                    return new Response("Internal server error", {
                        status: Status.InternalServerError,
                        statusText: STATUS_TEXT[Status.InternalServerError]
                    });
                }
            };
            const handler = (request)=>{
                const resolve = deferred();
                const flashRequest = new HttpRequest(request, resolve);
                controller.enqueue(flashRequest);
                return resolve;
            };
            this.#servePromise = serve(handler, options);
        };
        this.#stream = new ReadableStream({
            start
        });
        return p;
    }
    [Symbol.asyncIterator]() {
        assert(this.#stream, ".listen() was not called before iterating or server is closed.");
        return this.#stream[Symbol.asyncIterator]();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMS4xLjAvaHR0cF9zZXJ2ZXJfZmxhc2gudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IDIwMTgtMjAyMiB0aGUgb2FrIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuXG5pbXBvcnQgeyB0eXBlIEFwcGxpY2F0aW9uIH0gZnJvbSBcIi4vYXBwbGljYXRpb24udHNcIjtcbmltcG9ydCB7IGRlZmVycmVkLCBTdGF0dXMsIFNUQVRVU19URVhUIH0gZnJvbSBcIi4vZGVwcy50c1wiO1xuaW1wb3J0IHsgSHR0cFJlcXVlc3QgfSBmcm9tIFwiLi9odHRwX3JlcXVlc3QudHNcIjtcbmltcG9ydCB0eXBlIHsgTGlzdGVuZXIsIFNlcnZlciB9IGZyb20gXCIuL3R5cGVzLmQudHNcIjtcbmltcG9ydCB7IGFzc2VydCB9IGZyb20gXCIuL3V0aWwudHNcIjtcblxudHlwZSBTZXJ2ZUhhbmRsZXIgPSAoXG4gIHJlcXVlc3Q6IFJlcXVlc3QsXG4pID0+IFJlc3BvbnNlIHwgUHJvbWlzZTxSZXNwb25zZT4gfCB2b2lkIHwgUHJvbWlzZTx2b2lkPjtcblxuaW50ZXJmYWNlIFNlcnZlT3B0aW9ucyB7XG4gIHBvcnQ/OiBudW1iZXI7XG4gIGhvc3RuYW1lPzogc3RyaW5nO1xuICBzaWduYWw/OiBBYm9ydFNpZ25hbDtcbiAgb25FcnJvcj86IChlcnJvcjogdW5rbm93bikgPT4gUmVzcG9uc2UgfCBQcm9taXNlPFJlc3BvbnNlPjtcbiAgb25MaXN0ZW4/OiAocGFyYW1zOiB7IGhvc3RuYW1lOiBzdHJpbmc7IHBvcnQ6IG51bWJlciB9KSA9PiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgU2VydmVUbHNPcHRpb25zIGV4dGVuZHMgU2VydmVPcHRpb25zIHtcbiAgY2VydDogc3RyaW5nO1xuICBrZXk6IHN0cmluZztcbn1cblxudHlwZSBGbGFzaFNlcnZlck9wdGlvbnMgPSBPbWl0PFBhcnRpYWw8U2VydmVUbHNPcHRpb25zPiwgXCJvbkxpc3RlblwiIHwgXCJzaWduYWxcIj47XG5cbmNvbnN0IHNlcnZlOiAoXG4gIGhhbmRsZXI6IFNlcnZlSGFuZGxlcixcbiAgb3B0aW9ucz86IFNlcnZlT3B0aW9ucyB8IFNlcnZlVGxzT3B0aW9ucyxcbikgPT4gUHJvbWlzZTx2b2lkPiA9IFwic2VydmVcIiBpbiBEZW5vXG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gID8gKERlbm8gYXMgYW55KS5zZXJ2ZS5iaW5kKERlbm8pXG4gIDogdW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpc1NlcnZlVGxzT3B0aW9ucyhcbiAgdmFsdWU6IFNlcnZlT3B0aW9ucyB8IFNlcnZlVGxzT3B0aW9ucyxcbik6IHZhbHVlIGlzIFNlcnZlVGxzT3B0aW9ucyB7XG4gIHJldHVybiBcImNlcnRcIiBpbiB2YWx1ZSAmJiBcImtleVwiIGluIHZhbHVlO1xufVxuXG4vKiogQSBmdW5jdGlvbiB0aGF0IGRldGVybWluZXMgaWYgdGhlIGN1cnJlbnQgZW52aXJvbm1lbnQgc3VwcG9ydHMgRGVubyBmbGFzaC4qL1xuZXhwb3J0IGZ1bmN0aW9uIGhhc0ZsYXNoKCk6IGJvb2xlYW4ge1xuICByZXR1cm4gQm9vbGVhbihzZXJ2ZSk7XG59XG5cbi8qKiBBIHNlcnZlciBhYnN0cmFjdGlvbiB3aGljaCBtYW5hZ2VzIHJlcXVlc3RzIGZyb20gRGVubydzIGZsYXNoIHNlcnZlci5cbiAqXG4gKiBZb3UgY2FuIHBhc3MgdGhlIGNsYXNzIGFzIHRoZSBgc2VydmVyYCBwcm9wZXJ0eSB3aGVuIGNvbnN0cnVjdGluZyBhIG5ld1xuICogYXBwbGljYXRpb24gdG8gZm9yY2UgdGhlIGFwcGxpY2F0aW9uIHRvIHVzZSBEZW5vJ3MgZmxhc2ggc2VydmVyLlxuICovXG5leHBvcnQgY2xhc3MgRmxhc2hTZXJ2ZXIgaW1wbGVtZW50cyBTZXJ2ZXI8SHR0cFJlcXVlc3Q+IHtcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgI2FwcDogQXBwbGljYXRpb248YW55PjtcbiAgI2Nsb3NlZCA9IGZhbHNlO1xuICAjY29udHJvbGxlcj86IFJlYWRhYmxlU3RyZWFtRGVmYXVsdENvbnRyb2xsZXI8SHR0cFJlcXVlc3Q+O1xuICAjYWJvcnRDb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuICAjb3B0aW9uczogRmxhc2hTZXJ2ZXJPcHRpb25zO1xuICAjc2VydmVQcm9taXNlPzogUHJvbWlzZTx2b2lkPjtcbiAgI3N0cmVhbT86IFJlYWRhYmxlU3RyZWFtPEh0dHBSZXF1ZXN0PjtcblxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcGxpY2F0aW9uPGFueT4sIG9wdGlvbnM6IEZsYXNoU2VydmVyT3B0aW9ucykge1xuICAgIGlmICghc2VydmUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlRoZSBmbGFzaCBiaW5kaW5ncyBmb3Igc2VydmluZyBIVFRQIGFyZSBub3QgYXZhaWxhYmxlLlwiKTtcbiAgICB9XG4gICAgdGhpcy4jYXBwID0gYXBwO1xuICAgIHRoaXMuI29wdGlvbnMgPSBvcHRpb25zO1xuICB9XG5cbiAgYXN5bmMgY2xvc2UoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMuI2Nsb3NlZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLiNjbG9zZWQgPSB0cnVlO1xuICAgIHRyeSB7XG4gICAgICB0aGlzLiNjb250cm9sbGVyPy5jbG9zZSgpO1xuICAgICAgdGhpcy4jY29udHJvbGxlciA9IHVuZGVmaW5lZDtcbiAgICAgIHRoaXMuI3N0cmVhbSA9IHVuZGVmaW5lZDtcbiAgICAgIHRoaXMuI2Fib3J0Q29udHJvbGxlci5hYm9ydCgpO1xuICAgICAgaWYgKHRoaXMuI3NlcnZlUHJvbWlzZSkge1xuICAgICAgICBhd2FpdCB0aGlzLiNzZXJ2ZVByb21pc2U7XG4gICAgICAgIHRoaXMuI3NlcnZlUHJvbWlzZSA9IHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIGp1c3Qgc3dhbGxvdyBoZXJlXG4gICAgfVxuICB9XG5cbiAgbGlzdGVuKCk6IFByb21pc2U8TGlzdGVuZXI+IHtcbiAgICBjb25zdCBwID0gZGVmZXJyZWQ8TGlzdGVuZXI+KCk7XG4gICAgY29uc3Qgc3RhcnQ6IFJlYWRhYmxlU3RyZWFtRGVmYXVsdENvbnRyb2xsZXJDYWxsYmFjazxIdHRwUmVxdWVzdD4gPSAoXG4gICAgICBjb250cm9sbGVyLFxuICAgICkgPT4ge1xuICAgICAgdGhpcy4jY29udHJvbGxlciA9IGNvbnRyb2xsZXI7XG4gICAgICBjb25zdCBvcHRpb25zOiBTZXJ2ZU9wdGlvbnMgfCBTZXJ2ZVRsc09wdGlvbnMgPSB7XG4gICAgICAgIC4uLnRoaXMuI29wdGlvbnMsXG4gICAgICAgIHNpZ25hbDogdGhpcy4jYWJvcnRDb250cm9sbGVyLnNpZ25hbCxcbiAgICAgICAgb25MaXN0ZW46IChhZGRyKSA9PiBwLnJlc29sdmUoeyBhZGRyIH0pLFxuICAgICAgICBvbkVycm9yOiAoZXJyb3IpID0+IHtcbiAgICAgICAgICB0aGlzLiNhcHAuZGlzcGF0Y2hFdmVudChuZXcgRXJyb3JFdmVudChcImVycm9yXCIsIHsgZXJyb3IgfSkpO1xuICAgICAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UoXCJJbnRlcm5hbCBzZXJ2ZXIgZXJyb3JcIiwge1xuICAgICAgICAgICAgc3RhdHVzOiBTdGF0dXMuSW50ZXJuYWxTZXJ2ZXJFcnJvcixcbiAgICAgICAgICAgIHN0YXR1c1RleHQ6IFNUQVRVU19URVhUW1N0YXR1cy5JbnRlcm5hbFNlcnZlckVycm9yXSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSxcbiAgICAgIH07XG4gICAgICBjb25zdCBoYW5kbGVyOiBTZXJ2ZUhhbmRsZXIgPSAocmVxdWVzdCkgPT4ge1xuICAgICAgICBjb25zdCByZXNvbHZlID0gZGVmZXJyZWQ8UmVzcG9uc2U+KCk7XG4gICAgICAgIGNvbnN0IGZsYXNoUmVxdWVzdCA9IG5ldyBIdHRwUmVxdWVzdChyZXF1ZXN0LCByZXNvbHZlKTtcbiAgICAgICAgY29udHJvbGxlci5lbnF1ZXVlKGZsYXNoUmVxdWVzdCk7XG4gICAgICAgIHJldHVybiByZXNvbHZlO1xuICAgICAgfTtcbiAgICAgIHRoaXMuI3NlcnZlUHJvbWlzZSA9IHNlcnZlKGhhbmRsZXIsIG9wdGlvbnMpO1xuICAgIH07XG4gICAgdGhpcy4jc3RyZWFtID0gbmV3IFJlYWRhYmxlU3RyZWFtKHsgc3RhcnQgfSk7XG4gICAgcmV0dXJuIHA7XG4gIH1cblxuICBbU3ltYm9sLmFzeW5jSXRlcmF0b3JdKCk6IEFzeW5jSXRlcmFibGVJdGVyYXRvcjxIdHRwUmVxdWVzdD4ge1xuICAgIGFzc2VydChcbiAgICAgIHRoaXMuI3N0cmVhbSxcbiAgICAgIFwiLmxpc3RlbigpIHdhcyBub3QgY2FsbGVkIGJlZm9yZSBpdGVyYXRpbmcgb3Igc2VydmVyIGlzIGNsb3NlZC5cIixcbiAgICApO1xuICAgIHJldHVybiB0aGlzLiNzdHJlYW1bU3ltYm9sLmFzeW5jSXRlcmF0b3JdKCk7XG4gIH1cbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSx5RUFBeUU7QUFHekUsU0FBUyxRQUFRLEVBQUUsTUFBTSxFQUFFLFdBQVcsUUFBUSxZQUFZO0FBQzFELFNBQVMsV0FBVyxRQUFRLG9CQUFvQjtBQUVoRCxTQUFTLE1BQU0sUUFBUSxZQUFZO0FBcUJuQyxNQUFNLFFBR2UsV0FBVyxPQUU1QixBQUFDLEtBQWEsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUN6QixTQUFTO0FBRWIsU0FBUyxrQkFDUCxLQUFxQyxFQUNYO0lBQzFCLE9BQU8sVUFBVSxTQUFTLFNBQVM7QUFDckM7QUFFQSw4RUFBOEUsR0FDOUUsT0FBTyxTQUFTLFdBQW9CO0lBQ2xDLE9BQU8sUUFBUTtBQUNqQixDQUFDO0FBRUQ7Ozs7Q0FJQyxHQUNELE9BQU8sTUFBTTtJQUNYLG1DQUFtQztJQUNuQyxDQUFDLEdBQUcsQ0FB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