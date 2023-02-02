// Copyright 2018-2022 the oak authors. All rights reserved. MIT license.
import { NativeRequest } from "./http_server_native_request.ts";
import { assert, isListenTlsOptions } from "./util.ts";
const serveHttp = "serveHttp" in Deno ? Deno.serveHttp.bind(Deno) : undefined;
/** The oak abstraction of the Deno native HTTP server which is used internally
 * for handling native HTTP requests. Generally users of oak do not need to
 * worry about this class. */ // deno-lint-ignore no-explicit-any
export class HttpServer {
    #app;
    #closed = false;
    #listener;
    #httpConnections = new Set();
    #options;
    constructor(app, options){
        if (!("serveHttp" in Deno)) {
            throw new Error("The native bindings for serving HTTP are not available.");
        }
        this.#app = app;
        this.#options = options;
    }
    get app() {
        return this.#app;
    }
    get closed() {
        return this.#closed;
    }
    close() {
        this.#closed = true;
        if (this.#listener) {
            this.#listener.close();
            this.#listener = undefined;
        }
        for (const httpConn of this.#httpConnections){
            try {
                httpConn.close();
            } catch (error) {
                if (!(error instanceof Deno.errors.BadResource)) {
                    throw error;
                }
            }
        }
        this.#httpConnections.clear();
    }
    listen() {
        return this.#listener = isListenTlsOptions(this.#options) ? Deno.listenTls(this.#options) : Deno.listen(this.#options);
    }
    #trackHttpConnection(httpConn) {
        this.#httpConnections.add(httpConn);
    }
    #untrackHttpConnection(httpConn1) {
        this.#httpConnections.delete(httpConn1);
    }
    [Symbol.asyncIterator]() {
        const start = (controller)=>{
            // deno-lint-ignore no-this-alias
            const server = this;
            async function serve(conn) {
                const httpConn = serveHttp(conn);
                server.#trackHttpConnection(httpConn);
                while(true){
                    try {
                        const requestEvent = await httpConn.nextRequest();
                        if (requestEvent === null) {
                            return;
                        }
                        const nativeRequest = new NativeRequest(requestEvent, {
                            conn
                        });
                        controller.enqueue(nativeRequest);
                        // if we await here, this becomes blocking, and really all we want
                        // it to dispatch any errors that occur on the promise
                        nativeRequest.donePromise.catch((error)=>{
                            server.app.dispatchEvent(new ErrorEvent("error", {
                                error
                            }));
                        });
                    } catch (error) {
                        server.app.dispatchEvent(new ErrorEvent("error", {
                            error
                        }));
                    }
                    if (server.closed) {
                        server.#untrackHttpConnection(httpConn);
                        httpConn.close();
                        controller.close();
                    }
                }
            }
            const listener = this.#listener;
            assert(listener);
            async function accept() {
                while(true){
                    try {
                        const conn = await listener.accept();
                        serve(conn);
                    } catch (error) {
                        if (!server.closed) {
                            server.app.dispatchEvent(new ErrorEvent("error", {
                                error
                            }));
                        }
                    }
                    if (server.closed) {
                        controller.close();
                        return;
                    }
                }
            }
            accept();
        };
        const stream = new ReadableStream({
            start
        });
        return stream[Symbol.asyncIterator]();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMS4xLjAvaHR0cF9zZXJ2ZXJfbmF0aXZlLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAyMDE4LTIwMjIgdGhlIG9hayBhdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLiBNSVQgbGljZW5zZS5cblxuaW1wb3J0IHR5cGUgeyBBcHBsaWNhdGlvbiwgU3RhdGUgfSBmcm9tIFwiLi9hcHBsaWNhdGlvbi50c1wiO1xuaW1wb3J0IHsgTmF0aXZlUmVxdWVzdCB9IGZyb20gXCIuL2h0dHBfc2VydmVyX25hdGl2ZV9yZXF1ZXN0LnRzXCI7XG5pbXBvcnQgdHlwZSB7IEh0dHBDb25uLCBMaXN0ZW5lciwgU2VydmVyIH0gZnJvbSBcIi4vdHlwZXMuZC50c1wiO1xuaW1wb3J0IHsgYXNzZXJ0LCBpc0xpc3RlblRsc09wdGlvbnMgfSBmcm9tIFwiLi91dGlsLnRzXCI7XG5cbi8vIHRoaXMgaXMgaW5jbHVkZWQgc28gd2hlbiBkb3duLWVtaXR0aW5nIHRvIG5wbS9Ob2RlLmpzLCBSZWFkYWJsZVN0cmVhbSBoYXNcbi8vIGFzeW5jIGl0ZXJhdG9yc1xuZGVjbGFyZSBnbG9iYWwge1xuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICBpbnRlcmZhY2UgUmVhZGFibGVTdHJlYW08UiA9IGFueT4ge1xuICAgIFtTeW1ib2wuYXN5bmNJdGVyYXRvcl0ob3B0aW9ucz86IHtcbiAgICAgIHByZXZlbnRDYW5jZWw/OiBib29sZWFuO1xuICAgIH0pOiBBc3luY0l0ZXJhYmxlSXRlcmF0b3I8Uj47XG4gIH1cbn1cblxuZXhwb3J0IHR5cGUgUmVzcG9uZCA9IChyOiBSZXNwb25zZSB8IFByb21pc2U8UmVzcG9uc2U+KSA9PiB2b2lkO1xuXG4vLyBUaGlzIHR5cGUgaXMgcGFydCBvZiBEZW5vLCBidXQgbm90IHBhcnQgb2YgbGliLmRvbS5kLnRzLCB0aGVyZWZvcmUgYWRkIGl0IGhlcmVcbi8vIHNvIHRoYXQgdHlwZSBjaGVja2luZyBjYW4gb2NjdXIgcHJvcGVybHkgdW5kZXIgYGxpYi5kb20uZC50c2AuXG5pbnRlcmZhY2UgUmVhZGFibGVTdHJlYW1EZWZhdWx0Q29udHJvbGxlckNhbGxiYWNrPFI+IHtcbiAgKGNvbnRyb2xsZXI6IFJlYWRhYmxlU3RyZWFtRGVmYXVsdENvbnRyb2xsZXI8Uj4pOiB2b2lkIHwgUHJvbWlzZUxpa2U8dm9pZD47XG59XG5cbmNvbnN0IHNlcnZlSHR0cDogKGNvbm46IERlbm8uQ29ubikgPT4gSHR0cENvbm4gPSBcInNlcnZlSHR0cFwiIGluIERlbm9cbiAgPyAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAgIChEZW5vIGFzIGFueSkuc2VydmVIdHRwLmJpbmQoRGVubylcbiAgOiB1bmRlZmluZWQ7XG5cbi8qKiBUaGUgb2FrIGFic3RyYWN0aW9uIG9mIHRoZSBEZW5vIG5hdGl2ZSBIVFRQIHNlcnZlciB3aGljaCBpcyB1c2VkIGludGVybmFsbHlcbiAqIGZvciBoYW5kbGluZyBuYXRpdmUgSFRUUCByZXF1ZXN0cy4gR2VuZXJhbGx5IHVzZXJzIG9mIG9hayBkbyBub3QgbmVlZCB0b1xuICogd29ycnkgYWJvdXQgdGhpcyBjbGFzcy4gKi9cbi8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG5leHBvcnQgY2xhc3MgSHR0cFNlcnZlcjxBUyBleHRlbmRzIFN0YXRlID0gUmVjb3JkPHN0cmluZywgYW55Pj5cbiAgaW1wbGVtZW50cyBTZXJ2ZXI8TmF0aXZlUmVxdWVzdD4ge1xuICAjYXBwOiBBcHBsaWNhdGlvbjxBUz47XG4gICNjbG9zZWQgPSBmYWxzZTtcbiAgI2xpc3RlbmVyPzogRGVuby5MaXN0ZW5lcjtcbiAgI2h0dHBDb25uZWN0aW9uczogU2V0PEh0dHBDb25uPiA9IG5ldyBTZXQoKTtcbiAgI29wdGlvbnM6IERlbm8uTGlzdGVuT3B0aW9ucyB8IERlbm8uTGlzdGVuVGxzT3B0aW9ucztcblxuICBjb25zdHJ1Y3RvcihcbiAgICBhcHA6IEFwcGxpY2F0aW9uPEFTPixcbiAgICBvcHRpb25zOiBEZW5vLkxpc3Rlbk9wdGlvbnMgfCBEZW5vLkxpc3RlblRsc09wdGlvbnMsXG4gICkge1xuICAgIGlmICghKFwic2VydmVIdHRwXCIgaW4gRGVubykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgXCJUaGUgbmF0aXZlIGJpbmRpbmdzIGZvciBzZXJ2aW5nIEhUVFAgYXJlIG5vdCBhdmFpbGFibGUuXCIsXG4gICAgICApO1xuICAgIH1cbiAgICB0aGlzLiNhcHAgPSBhcHA7XG4gICAgdGhpcy4jb3B0aW9ucyA9IG9wdGlvbnM7XG4gIH1cblxuICBnZXQgYXBwKCk6IEFwcGxpY2F0aW9uPEFTPiB7XG4gICAgcmV0dXJuIHRoaXMuI2FwcDtcbiAgfVxuXG4gIGdldCBjbG9zZWQoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuI2Nsb3NlZDtcbiAgfVxuXG4gIGNsb3NlKCk6IHZvaWQge1xuICAgIHRoaXMuI2Nsb3NlZCA9IHRydWU7XG5cbiAgICBpZiAodGhpcy4jbGlzdGVuZXIpIHtcbiAgICAgIHRoaXMuI2xpc3RlbmVyLmNsb3NlKCk7XG4gICAgICB0aGlzLiNsaXN0ZW5lciA9IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGh0dHBDb25uIG9mIHRoaXMuI2h0dHBDb25uZWN0aW9ucykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgaHR0cENvbm4uY2xvc2UoKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmICghKGVycm9yIGluc3RhbmNlb2YgRGVuby5lcnJvcnMuQmFkUmVzb3VyY2UpKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLiNodHRwQ29ubmVjdGlvbnMuY2xlYXIoKTtcbiAgfVxuXG4gIGxpc3RlbigpOiBMaXN0ZW5lciB7XG4gICAgcmV0dXJuICh0aGlzLiNsaXN0ZW5lciA9IGlzTGlzdGVuVGxzT3B0aW9ucyh0aGlzLiNvcHRpb25zKVxuICAgICAgPyBEZW5vLmxpc3RlblRscyh0aGlzLiNvcHRpb25zKVxuICAgICAgOiBEZW5vLmxpc3Rlbih0aGlzLiNvcHRpb25zKSkgYXMgTGlzdGVuZXI7XG4gIH1cblxuICAjdHJhY2tIdHRwQ29ubmVjdGlvbihodHRwQ29ubjogSHR0cENvbm4pOiB2b2lkIHtcbiAgICB0aGlzLiNodHRwQ29ubmVjdGlvbnMuYWRkKGh0dHBDb25uKTtcbiAgfVxuXG4gICN1bnRyYWNrSHR0cENvbm5lY3Rpb24oaHR0cENvbm46IEh0dHBDb25uKTogdm9pZCB7XG4gICAgdGhpcy4jaHR0cENvbm5lY3Rpb25zLmRlbGV0ZShodHRwQ29ubik7XG4gIH1cblxuICBbU3ltYm9sLmFzeW5jSXRlcmF0b3JdKCk6IEFzeW5jSXRlcmFibGVJdGVyYXRvcjxOYXRpdmVSZXF1ZXN0PiB7XG4gICAgY29uc3Qgc3RhcnQ6IFJlYWRhYmxlU3RyZWFtRGVmYXVsdENvbnRyb2xsZXJDYWxsYmFjazxOYXRpdmVSZXF1ZXN0PiA9IChcbiAgICAgIGNvbnRyb2xsZXIsXG4gICAgKSA9PiB7XG4gICAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLXRoaXMtYWxpYXNcbiAgICAgIGNvbnN0IHNlcnZlciA9IHRoaXM7XG4gICAgICBhc3luYyBmdW5jdGlvbiBzZXJ2ZShjb25uOiBEZW5vLkNvbm4pIHtcbiAgICAgICAgY29uc3QgaHR0cENvbm4gPSBzZXJ2ZUh0dHAoY29ubik7XG4gICAgICAgIHNlcnZlci4jdHJhY2tIdHRwQ29ubmVjdGlvbihodHRwQ29ubik7XG5cbiAgICAgICAgd2hpbGUgKHRydWUpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVxdWVzdEV2ZW50ID0gYXdhaXQgaHR0cENvbm4ubmV4dFJlcXVlc3QoKTtcblxuICAgICAgICAgICAgaWYgKHJlcXVlc3RFdmVudCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG5hdGl2ZVJlcXVlc3QgPSBuZXcgTmF0aXZlUmVxdWVzdChyZXF1ZXN0RXZlbnQsIHsgY29ubiB9KTtcbiAgICAgICAgICAgIGNvbnRyb2xsZXIuZW5xdWV1ZShuYXRpdmVSZXF1ZXN0KTtcbiAgICAgICAgICAgIC8vIGlmIHdlIGF3YWl0IGhlcmUsIHRoaXMgYmVjb21lcyBibG9ja2luZywgYW5kIHJlYWxseSBhbGwgd2Ugd2FudFxuICAgICAgICAgICAgLy8gaXQgdG8gZGlzcGF0Y2ggYW55IGVycm9ycyB0aGF0IG9jY3VyIG9uIHRoZSBwcm9taXNlXG4gICAgICAgICAgICBuYXRpdmVSZXF1ZXN0LmRvbmVQcm9taXNlLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgICAgICAgICBzZXJ2ZXIuYXBwLmRpc3BhdGNoRXZlbnQobmV3IEVycm9yRXZlbnQoXCJlcnJvclwiLCB7IGVycm9yIH0pKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBzZXJ2ZXIuYXBwLmRpc3BhdGNoRXZlbnQobmV3IEVycm9yRXZlbnQoXCJlcnJvclwiLCB7IGVycm9yIH0pKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoc2VydmVyLmNsb3NlZCkge1xuICAgICAgICAgICAgc2VydmVyLiN1bnRyYWNrSHR0cENvbm5lY3Rpb24oaHR0cENvbm4pO1xuICAgICAgICAgICAgaHR0cENvbm4uY2xvc2UoKTtcbiAgICAgICAgICAgIGNvbnRyb2xsZXIuY2xvc2UoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgbGlzdGVuZXIgPSB0aGlzLiNsaXN0ZW5lcjtcbiAgICAgIGFzc2VydChsaXN0ZW5lcik7XG4gICAgICBhc3luYyBmdW5jdGlvbiBhY2NlcHQoKSB7XG4gICAgICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbm4gPSBhd2FpdCBsaXN0ZW5lciEuYWNjZXB0KCk7XG4gICAgICAgICAgICBzZXJ2ZShjb25uKTtcbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKCFzZXJ2ZXIuY2xvc2VkKSB7XG4gICAgICAgICAgICAgIHNlcnZlci5hcHAuZGlzcGF0Y2hFdmVudChuZXcgRXJyb3JFdmVudChcImVycm9yXCIsIHsgZXJyb3IgfSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoc2VydmVyLmNsb3NlZCkge1xuICAgICAgICAgICAgY29udHJvbGxlci5jbG9zZSgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBhY2NlcHQoKTtcbiAgICB9O1xuICAgIGNvbnN0IHN0cmVhbSA9IG5ldyBSZWFkYWJsZVN0cmVhbTxOYXRpdmVSZXF1ZXN0Pih7IHN0YXJ0IH0pO1xuXG4gICAgcmV0dXJuIHN0cmVhbVtTeW1ib2wuYXN5bmNJdGVyYXRvcl0oKTtcbiAgfVxufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLHlFQUF5RTtBQUd6RSxTQUFTLGFBQWEsUUFBUSxrQ0FBa0M7QUFFaEUsU0FBUyxNQUFNLEVBQUUsa0JBQWtCLFFBQVEsWUFBWTtBQXFCdkQsTUFBTSxZQUEyQyxlQUFlLE9BRTVELEFBQUMsS0FBYSxTQUFTLENBQUMsSUFBSSxDQUFDLFFBQzdCLFNBQVM7QUFFYjs7MkJBRTJCLEdBQzNCLG1DQUFtQztBQUNuQyxPQUFPLE1BQU07SUFFWCxDQUFDLEdBQUcsQ0FBa0I7SUFDdEIsQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO0lBQ2hCLENBQUMsUUFBUSxDQUFpQjtJQUMxQixDQUFDLGVBQWUsR0FBa0IsSUFBSSxNQUFNO0lBQzVDLENBQUMsT0FBTyxDQUE2QztJQUVyRCxZQUNFLEdBQW9CLEVBQ3BCLE9BQW1ELENBQ25EO1FBQ0EsSUFBSSxDQUFDLENBQUMs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