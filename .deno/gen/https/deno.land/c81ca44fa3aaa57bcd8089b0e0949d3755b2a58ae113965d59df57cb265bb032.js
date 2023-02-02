// Copyright 2018-2022 the oak authors. All rights reserved. MIT license.
/**
 * A middleware framework for handling HTTP with Deno.
 *
 * oak works well on both Deno CLI and Deno deploy, and is inspired by
 * [koa](https://koajs.com/). It works well with both the Deno CLI and
 * [Deno Deploy](https://deno.com/deploy).
 *
 * ### Example server
 *
 * A minimal router server which responds with content on `/`. With Deno CLI
 * this will listen on port 8080 and on Deploy, this will simply serve requests
 * received on the application.
 *
 * ```ts
 * import { Application, Router } from "https://deno.land/x/oak/mod.ts";
 *
 * const router = new Router();
 * router.get("/", (ctx) => {
 *   ctx.response.body = `<!DOCTYPE html>
 *     <html>
 *       <head><title>Hello oak!</title><head>
 *       <body>
 *         <h1>Hello oak!</h1>
 *       </body>
 *     </html>
 *   `;
 * });
 *
 * const app = new Application();
 * app.use(router.routes());
 * app.use(router.allowedMethods());
 *
 * app.listen({ port: 8080 });
 * ```
 *
 * ### Using Deno's flash server
 *
 * Currently, Deno's flash server is not the default, even with the `--unstable`
 * flag. In order to use the flash server, you need to provide the
 * {@linkcode FlashServer} to the {@linkcode Application} constructor:
 *
 * ```ts
 * import { Application, FlashServer } from "https://deno.land/x/oak/mod.ts";
 *
 * const app = new Application({ serverConstructor: FlashServer });
 *
 * // register middleware
 *
 * app.listen({ port: 8080 });
 * ```
 *
 * Note the currently Deno's flash server requires the `--unstable` flag. If it
 * isn't present, the application will error on listening.
 *
 * @module
 */ export { Application } from "./application.ts";
export { Context } from "./context.ts";
export * as helpers from "./helpers.ts";
export { Cookies } from "./cookies.ts";
export * as etag from "./etag.ts";
export { HttpRequest } from "./http_request.ts";
export { FlashServer, hasFlash } from "./http_server_flash.ts";
export { HttpServer as HttpServerNative } from "./http_server_native.ts";
export { proxy } from "./middleware/proxy.ts";
export { compose as composeMiddleware } from "./middleware.ts";
export { FormDataReader } from "./multipart.ts";
export { ifRange, MultiPartStream, parseRange } from "./range.ts";
export { Request } from "./request.ts";
export { REDIRECT_BACK, Response } from "./response.ts";
export { Router } from "./router.ts";
export { send } from "./send.ts";
export { ServerSentEvent } from "./server_sent_event.ts";
/** Utilities for making testing oak servers easier. */ export * as testing from "./testing.ts";
export { isErrorStatus, isRedirectStatus } from "./util.ts";
// Re-exported from `std/http`
export { createHttpError, errors as httpErrors, HttpError, isHttpError, Status, STATUS_TEXT } from "./deps.ts";
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMS4xLjAvbW9kLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAyMDE4LTIwMjIgdGhlIG9hayBhdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLiBNSVQgbGljZW5zZS5cblxuLyoqXG4gKiBBIG1pZGRsZXdhcmUgZnJhbWV3b3JrIGZvciBoYW5kbGluZyBIVFRQIHdpdGggRGVuby5cbiAqXG4gKiBvYWsgd29ya3Mgd2VsbCBvbiBib3RoIERlbm8gQ0xJIGFuZCBEZW5vIGRlcGxveSwgYW5kIGlzIGluc3BpcmVkIGJ5XG4gKiBba29hXShodHRwczovL2tvYWpzLmNvbS8pLiBJdCB3b3JrcyB3ZWxsIHdpdGggYm90aCB0aGUgRGVubyBDTEkgYW5kXG4gKiBbRGVubyBEZXBsb3ldKGh0dHBzOi8vZGVuby5jb20vZGVwbG95KS5cbiAqXG4gKiAjIyMgRXhhbXBsZSBzZXJ2ZXJcbiAqXG4gKiBBIG1pbmltYWwgcm91dGVyIHNlcnZlciB3aGljaCByZXNwb25kcyB3aXRoIGNvbnRlbnQgb24gYC9gLiBXaXRoIERlbm8gQ0xJXG4gKiB0aGlzIHdpbGwgbGlzdGVuIG9uIHBvcnQgODA4MCBhbmQgb24gRGVwbG95LCB0aGlzIHdpbGwgc2ltcGx5IHNlcnZlIHJlcXVlc3RzXG4gKiByZWNlaXZlZCBvbiB0aGUgYXBwbGljYXRpb24uXG4gKlxuICogYGBgdHNcbiAqIGltcG9ydCB7IEFwcGxpY2F0aW9uLCBSb3V0ZXIgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQveC9vYWsvbW9kLnRzXCI7XG4gKlxuICogY29uc3Qgcm91dGVyID0gbmV3IFJvdXRlcigpO1xuICogcm91dGVyLmdldChcIi9cIiwgKGN0eCkgPT4ge1xuICogICBjdHgucmVzcG9uc2UuYm9keSA9IGA8IURPQ1RZUEUgaHRtbD5cbiAqICAgICA8aHRtbD5cbiAqICAgICAgIDxoZWFkPjx0aXRsZT5IZWxsbyBvYWshPC90aXRsZT48aGVhZD5cbiAqICAgICAgIDxib2R5PlxuICogICAgICAgICA8aDE+SGVsbG8gb2FrITwvaDE+XG4gKiAgICAgICA8L2JvZHk+XG4gKiAgICAgPC9odG1sPlxuICogICBgO1xuICogfSk7XG4gKlxuICogY29uc3QgYXBwID0gbmV3IEFwcGxpY2F0aW9uKCk7XG4gKiBhcHAudXNlKHJvdXRlci5yb3V0ZXMoKSk7XG4gKiBhcHAudXNlKHJvdXRlci5hbGxvd2VkTWV0aG9kcygpKTtcbiAqXG4gKiBhcHAubGlzdGVuKHsgcG9ydDogODA4MCB9KTtcbiAqIGBgYFxuICpcbiAqICMjIyBVc2luZyBEZW5vJ3MgZmxhc2ggc2VydmVyXG4gKlxuICogQ3VycmVudGx5LCBEZW5vJ3MgZmxhc2ggc2VydmVyIGlzIG5vdCB0aGUgZGVmYXVsdCwgZXZlbiB3aXRoIHRoZSBgLS11bnN0YWJsZWBcbiAqIGZsYWcuIEluIG9yZGVyIHRvIHVzZSB0aGUgZmxhc2ggc2VydmVyLCB5b3UgbmVlZCB0byBwcm92aWRlIHRoZVxuICoge0BsaW5rY29kZSBGbGFzaFNlcnZlcn0gdG8gdGhlIHtAbGlua2NvZGUgQXBwbGljYXRpb259IGNvbnN0cnVjdG9yOlxuICpcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBBcHBsaWNhdGlvbiwgRmxhc2hTZXJ2ZXIgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQveC9vYWsvbW9kLnRzXCI7XG4gKlxuICogY29uc3QgYXBwID0gbmV3IEFwcGxpY2F0aW9uKHsgc2VydmVyQ29uc3RydWN0b3I6IEZsYXNoU2VydmVyIH0pO1xuICpcbiAqIC8vIHJlZ2lzdGVyIG1pZGRsZXdhcmVcbiAqXG4gKiBhcHAubGlzdGVuKHsgcG9ydDogODA4MCB9KTtcbiAqIGBgYFxuICpcbiAqIE5vdGUgdGhlIGN1cnJlbnRseSBEZW5vJ3MgZmxhc2ggc2VydmVyIHJlcXVpcmVzIHRoZSBgLS11bnN0YWJsZWAgZmxhZy4gSWYgaXRcbiAqIGlzbid0IHByZXNlbnQsIHRoZSBhcHBsaWNhdGlvbiB3aWxsIGVycm9yIG9uIGxpc3RlbmluZy5cbiAqXG4gKiBAbW9kdWxlXG4gKi9cblxuZXhwb3J0IHsgQXBwbGljYXRpb24gfSBmcm9tIFwiLi9hcHBsaWNhdGlvbi50c1wiO1xuZXhwb3J0IHR5cGUge1xuICBBcHBsaWNhdGlvbk9wdGlvbnMsXG4gIExpc3Rlbk9wdGlvbnMsXG4gIExpc3Rlbk9wdGlvbnNCYXNlLFxuICBMaXN0ZW5PcHRpb25zVGxzLFxuICBTdGF0ZSxcbn0gZnJvbSBcIi4vYXBwbGljYXRpb24udHNcIjtcbmV4cG9ydCB0eXBlIHtcbiAgQm9keUJ5dGVzLFxuICBCb2R5Q29udGVudFR5cGVzLFxuICBCb2R5Rm9ybSxcbiAgQm9keUZvcm1EYXRhLFxuICBCb2R5SnNvbixcbiAgQm9keU9wdGlvbnMsXG4gIEJvZHlPcHRpb25zQ29udGVudFR5cGVzLFxuICBCb2R5UmVhZGVyLFxuICBCb2R5U3RyZWFtLFxuICBCb2R5VGV4dCxcbiAgQm9keVR5cGUsXG4gIEJvZHlVbmRlZmluZWQsXG59IGZyb20gXCIuL2JvZHkudHNcIjtcbmV4cG9ydCB7IENvbnRleHQsIHR5cGUgQ29udGV4dFNlbmRPcHRpb25zIH0gZnJvbSBcIi4vY29udGV4dC50c1wiO1xuZXhwb3J0ICogYXMgaGVscGVycyBmcm9tIFwiLi9oZWxwZXJzLnRzXCI7XG5leHBvcnQge1xuICBDb29raWVzLFxuICB0eXBlIENvb2tpZXNHZXRPcHRpb25zLFxuICB0eXBlIENvb2tpZXNTZXREZWxldGVPcHRpb25zLFxufSBmcm9tIFwiLi9jb29raWVzLnRzXCI7XG5leHBvcnQgKiBhcyBldGFnIGZyb20gXCIuL2V0YWcudHNcIjtcbmV4cG9ydCB7IEh0dHBSZXF1ZXN0IH0gZnJvbSBcIi4vaHR0cF9yZXF1ZXN0LnRzXCI7XG5leHBvcnQgeyBGbGFzaFNlcnZlciwgaGFzRmxhc2ggfSBmcm9tIFwiLi9odHRwX3NlcnZlcl9mbGFzaC50c1wiO1xuZXhwb3J0IHsgSHR0cFNlcnZlciBhcyBIdHRwU2VydmVyTmF0aXZlIH0gZnJvbSBcIi4vaHR0cF9zZXJ2ZXJfbmF0aXZlLnRzXCI7XG5leHBvcnQgeyB0eXBlIE5hdGl2ZVJlcXVlc3QgfSBmcm9tIFwiLi9odHRwX3NlcnZlcl9uYXRpdmVfcmVxdWVzdC50c1wiO1xuZXhwb3J0IHsgcHJveHkgfSBmcm9tIFwiLi9taWRkbGV3YXJlL3Byb3h5LnRzXCI7XG5leHBvcnQgdHlwZSB7IFByb3h5T3B0aW9ucyB9IGZyb20gXCIuL21pZGRsZXdhcmUvcHJveHkudHNcIjtcbmV4cG9ydCB7IGNvbXBvc2UgYXMgY29tcG9zZU1pZGRsZXdhcmUgfSBmcm9tIFwiLi9taWRkbGV3YXJlLnRzXCI7XG5leHBvcnQgdHlwZSB7IE1pZGRsZXdhcmUgfSBmcm9tIFwiLi9taWRkbGV3YXJlLnRzXCI7XG5leHBvcnQgeyBGb3JtRGF0YVJlYWRlciB9IGZyb20gXCIuL211bHRpcGFydC50c1wiO1xuZXhwb3J0IHR5cGUge1xuICBGb3JtRGF0YUJvZHksXG4gIEZvcm1EYXRhRmlsZSxcbiAgRm9ybURhdGFSZWFkT3B0aW9ucyxcbn0gZnJvbSBcIi4vbXVsdGlwYXJ0LnRzXCI7XG5leHBvcnQgeyBpZlJhbmdlLCBNdWx0aVBhcnRTdHJlYW0sIHBhcnNlUmFuZ2UgfSBmcm9tIFwiLi9yYW5nZS50c1wiO1xuZXhwb3J0IHR5cGUgeyBCeXRlUmFuZ2UgfSBmcm9tIFwiLi9yYW5nZS50c1wiO1xuZXhwb3J0IHsgUmVxdWVzdCB9IGZyb20gXCIuL3JlcXVlc3QudHNcIjtcbmV4cG9ydCB7IFJFRElSRUNUX0JBQ0ssIFJlc3BvbnNlIH0gZnJvbSBcIi4vcmVzcG9uc2UudHNcIjtcbmV4cG9ydCB7IFJvdXRlciB9IGZyb20gXCIuL3JvdXRlci50c1wiO1xuZXhwb3J0IHR5cGUge1xuICBSb3V0ZSxcbiAgUm91dGVQYXJhbXMsXG4gIFJvdXRlckFsbG93ZWRNZXRob2RzT3B0aW9ucyxcbiAgUm91dGVyQ29udGV4dCxcbiAgUm91dGVyTWlkZGxld2FyZSxcbiAgUm91dGVyT3B0aW9ucyxcbiAgUm91dGVyUGFyYW1NaWRkbGV3YXJlLFxufSBmcm9tIFwiLi9yb3V0ZXIudHNcIjtcbmV4cG9ydCB7IHNlbmQgfSBmcm9tIFwiLi9zZW5kLnRzXCI7XG5leHBvcnQgdHlwZSB7IFNlbmRPcHRpb25zIH0gZnJvbSBcIi4vc2VuZC50c1wiO1xuZXhwb3J0IHsgU2VydmVyU2VudEV2ZW50IH0gZnJvbSBcIi4vc2VydmVyX3NlbnRfZXZlbnQudHNcIjtcbmV4cG9ydCB0eXBlIHtcbiAgU2VydmVyU2VudEV2ZW50SW5pdCxcbiAgU2VydmVyU2VudEV2ZW50VGFyZ2V0LFxufSBmcm9tIFwiLi9zZXJ2ZXJfc2VudF9ldmVudC50c1wiO1xuLyoqIFV0aWxpdGllcyBmb3IgbWFraW5nIHRlc3Rpbmcgb2FrIHNlcnZlcnMgZWFzaWVyLiAqL1xuZXhwb3J0ICogYXMgdGVzdGluZyBmcm9tIFwiLi90ZXN0aW5nLnRzXCI7XG5leHBvcnQgdHlwZSB7XG4gIEVycm9yU3RhdHVzLFxuICBIVFRQTWV0aG9kcyxcbiAgUmVkaXJlY3RTdGF0dXMsXG4gIFNlcnZlckNvbnN0cnVjdG9yLFxufSBmcm9tIFwiLi90eXBlcy5kLnRzXCI7XG5leHBvcnQgeyBpc0Vycm9yU3RhdHVzLCBpc1JlZGlyZWN0U3RhdHVzIH0gZnJvbSBcIi4vdXRpbC50c1wiO1xuXG4vLyBSZS1leHBvcnRlZCBmcm9tIGBzdGQvaHR0cGBcbmV4cG9ydCB7XG4gIGNyZWF0ZUh0dHBFcnJvcixcbiAgZXJyb3JzIGFzIGh0dHBFcnJvcnMsXG4gIEh0dHBFcnJvcixcbiAgaXNIdHRwRXJyb3IsXG4gIFN0YXR1cyxcbiAgU1RBVFVTX1RFWFQsXG59IGZyb20gXCIuL2RlcHMudHNcIjtcbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSx5RUFBeUU7QUFFekU7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Q0F1REMsR0FFRCxTQUFTLFdBQVcsUUFBUSxtQkFBbUI7QUFzQi9DLFNBQVMsT0FBTyxRQUFpQyxlQUFlO0FBQ2hFLE9BQU8sS0FBSyxPQUFPLE1BQU0sZUFBZTtBQUN4QyxTQUNFLE9BQU8sUUFHRixlQUFlO0FBQ3RCLE9BQU8sS0FBSyxJQUFJLE1BQU0sWUFBWTtBQUNsQyxTQUFTLFdBQVcsUUFBUSxvQkFBb0I7QUFDaEQsU0FBUyxXQUFXLEVBQUUsUUFBUSxRQUFRLHlCQUF5QjtBQUMvRCxTQUFTLGNBQWMsZ0JBQWdCLFFBQVEsMEJBQTBCO0FBRXpFLFNBQVMsS0FBSyxRQUFRLHdCQUF3QjtBQUU5QyxTQUFTLFdBQVcsaUJBQWlCLFFBQVEsa0JBQWtCO0FBRS9ELFNBQVMsY0FBYyxRQUFRLGlCQUFpQjtBQU1oRCxTQUFTLE9BQU8sRUFBRSxlQUFlLEVBQUUsVUFBVSxRQUFRLGFBQWE7QUFFbEUsU0FBUyxPQUFPLFFBQVEsZUFBZTtBQUN2QyxTQUFTLGFBQWEsRUFBRSxRQUFRLFFBQVEsZ0JBQWdCO0FBQ3hELFNBQVMsTUFBTSxRQUFRLGNBQWM7QUFVckMsU0FBUyxJQUFJLFFBQVEsWUFBWTtBQUVqQyxTQUFTLGVBQWUsUUFBUSx5QkFBeUI7QUFLekQscURBQXFELEdBQ3JELE9BQU8sS0FBSyxPQUFPLE1BQU0sZUFBZTtBQU94QyxTQUFTLGFBQWEsRUFBRSxnQkFBZ0IsUUFBUSxZQUFZO0FBRTVELDhCQUE4QjtBQUM5QixTQUNFLGVBQWUsRUFDZixVQUFVLFVBQVUsRUFDcEIsU0FBUyxFQUNULFdBQVcsRUFDWCxNQUFNLEVBQ04sV0FBVyxRQUNOLFlBQVkifQ==