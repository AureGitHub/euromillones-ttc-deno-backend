const DEFAULT_DEBOUNCE_TIMEOUT = 30;
const DEFAULT_IGNORE_KINDS = [
    "any",
    "access"
];
const DEFAULT_PATHS = "./";
const DEFAULT_RECURSIVE = true;
const sockets = new Set();
async function watch({ debounce =DEFAULT_DEBOUNCE_TIMEOUT , ignoreKinds =DEFAULT_IGNORE_KINDS , paths =DEFAULT_PATHS , recursive =DEFAULT_RECURSIVE , signal  } = {
    debounce: DEFAULT_DEBOUNCE_TIMEOUT,
    ignoreKinds: DEFAULT_IGNORE_KINDS,
    paths: DEFAULT_PATHS,
    recursive: DEFAULT_RECURSIVE
}) {
    const watcher = Deno.watchFs(paths, {
        recursive
    });
    function close() {
        try {
            watcher.close();
            sockets.forEach((socket)=>socket.close());
            sockets.clear();
        } catch  {
        // ignore
        }
    }
    let queued = false;
    function send() {
        if (signal?.aborted) {
            close();
            return;
        }
        queued = false;
        sockets.forEach((socket)=>{
            try {
                socket.send("");
            } catch  {
            // ignore
            }
        });
    }
    for await (const { kind  } of watcher){
        if (signal?.aborted) {
            close();
            break;
        } else if (ignoreKinds.includes(kind)) {
            continue;
        }
        if (!queued) {
            queued = true;
            setTimeout(send, debounce);
        }
    }
}
const RE_REFRESH_WS = /\/_r$/;
const isRefreshWs = (url)=>RE_REFRESH_WS.test(url);
/**
 * Constructs a refresh middleware for reloading the browser on file changes.
 *
 * ```ts
 * import { serve } from "https://deno.land/std/http/server.ts";
 * import { refresh } from "https://deno.land/x/refresh/mod.ts";
 *
 * const middleware = refresh();
 *
 * serve((req: Request) => {
 *  const res = middleware(req);
 *
 *  if (res) return res;
 *
 *  return new Response("Hello Deno!");
 * });
 * ```
 *
 * @param {RefreshInit} refreshInit optional configuration for browser refresh middleware.
 */ export function refresh(refreshInit) {
    watch(refreshInit);
    return function refreshMiddleware(req) {
        if (isRefreshWs(req.url) && !refreshInit?.signal?.aborted) {
            const upgrade = Deno.upgradeWebSocket(req);
            upgrade.socket.onclose = ()=>{
                sockets.delete(upgrade.socket);
            };
            sockets.add(upgrade.socket);
            return upgrade.response;
        }
        return null;
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvcmVmcmVzaEAxLjAuMC9tb2QudHMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGludGVyZmFjZSBSZWZyZXNoSW5pdCB7XG4gIC8qKlxuICAgKiBEZWJvdW5jZSB0aW1lb3V0IGZvciBicm93c2VyIHJlZnJlc2ggb24gZmlsZSBjaGFuZ2UuIERlZmF1bHQgYDMwYG1zLlxuICAgKi9cbiAgZGVib3VuY2U/OiBudW1iZXI7XG4gIC8qKlxuICAgKiBBcnJheSBvZiBmaWxlIHN5c3RlbSBldmVudHMgdG8gaWdub3JlLiBEZWZhdWx0IGBbXCJhbnlcIiwgXCJhY2Nlc3NcIl1gLlxuICAgKi9cbiAgaWdub3JlS2luZHM/OiBzdHJpbmdbXTtcbiAgLyoqXG4gICAqIE9uZSBvciBtb3JlIHBhdGhzLCB3aGljaCBjYW4gYmUgZmlsZXMgb3IgZGlyZWN0b3JpZXMsIGZvciB3YXRjaGluZyBmaWxlXG4gICAqIHN5c3RlbSBldmVudHMuIERlZmF1bHQgYC4vYFxuICAgKi9cbiAgcGF0aHM/OiBzdHJpbmcgfCBzdHJpbmdbXTtcbiAgLyoqXG4gICAqIEZvciBkaXJlY3Rvcmllcywgd2lsbCB3YXRjaCB0aGUgc3BlY2lmaWVkIGRpcmVjdG9yeSBhbmQgYWxsIHN1YlxuICAgKiBkaXJlY3RvcmllcyB3aGVuIHNldCB0byB0cnVlLiBEZWZhdWx0IGB0cnVlYC5cbiAgICovXG4gIHJlY3Vyc2l2ZT86IGJvb2xlYW47XG4gIC8qKlxuICAgKiBBbiBhYm9ydCBzaWduYWwgdG8gc3RvcCB0aGUgd2F0Y2hpbmcgb2YgZmlsZXMuXG4gICAqL1xuICBzaWduYWw/OiBBYm9ydFNpZ25hbDtcbn1cblxuY29uc3QgREVGQVVMVF9ERUJPVU5DRV9USU1FT1VUID0gMzA7XG5jb25zdCBERUZBVUxUX0lHTk9SRV9LSU5EUyA9IFtcImFueVwiLCBcImFjY2Vzc1wiXTtcbmNvbnN0IERFRkFVTFRfUEFUSFMgPSBcIi4vXCI7XG5jb25zdCBERUZBVUxUX1JFQ1VSU0lWRSA9IHRydWU7XG5cbmNvbnN0IHNvY2tldHM6IFNldDxXZWJTb2NrZXQ+ID0gbmV3IFNldCgpO1xuXG5hc3luYyBmdW5jdGlvbiB3YXRjaChcbiAge1xuICAgIGRlYm91bmNlID0gREVGQVVMVF9ERUJPVU5DRV9USU1FT1VULFxuICAgIGlnbm9yZUtpbmRzID0gREVGQVVMVF9JR05PUkVfS0lORFMsXG4gICAgcGF0aHMgPSBERUZBVUxUX1BBVEhTLFxuICAgIHJlY3Vyc2l2ZSA9IERFRkFVTFRfUkVDVVJTSVZFLFxuICAgIHNpZ25hbCxcbiAgfTogUmVmcmVzaEluaXQgPSB7XG4gICAgZGVib3VuY2U6IERFRkFVTFRfREVCT1VOQ0VfVElNRU9VVCxcbiAgICBpZ25vcmVLaW5kczogREVGQVVMVF9JR05PUkVfS0lORFMsXG4gICAgcGF0aHM6IERFRkFVTFRfUEFUSFMsXG4gICAgcmVjdXJzaXZlOiBERUZBVUxUX1JFQ1VSU0lWRSxcbiAgfSxcbikge1xuICBjb25zdCB3YXRjaGVyID0gRGVuby53YXRjaEZzKHBhdGhzLCB7IHJlY3Vyc2l2ZSB9KTtcblxuICBmdW5jdGlvbiBjbG9zZSgpIHtcbiAgICB0cnkge1xuICAgICAgd2F0Y2hlci5jbG9zZSgpO1xuICAgICAgc29ja2V0cy5mb3JFYWNoKChzb2NrZXQpID0+IHNvY2tldC5jbG9zZSgpKTtcbiAgICAgIHNvY2tldHMuY2xlYXIoKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIGlnbm9yZVxuICAgIH1cbiAgfVxuXG4gIGxldCBxdWV1ZWQgPSBmYWxzZTtcblxuICBmdW5jdGlvbiBzZW5kKCkge1xuICAgIGlmIChzaWduYWw/LmFib3J0ZWQpIHtcbiAgICAgIGNsb3NlKCk7XG5cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBxdWV1ZWQgPSBmYWxzZTtcblxuICAgIHNvY2tldHMuZm9yRWFjaCgoc29ja2V0KSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBzb2NrZXQuc2VuZChcIlwiKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBpZ25vcmVcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIGZvciBhd2FpdCAoY29uc3QgeyBraW5kIH0gb2Ygd2F0Y2hlcikge1xuICAgIGlmIChzaWduYWw/LmFib3J0ZWQpIHtcbiAgICAgIGNsb3NlKCk7XG5cbiAgICAgIGJyZWFrO1xuICAgIH0gZWxzZSBpZiAoaWdub3JlS2luZHMuaW5jbHVkZXMoa2luZCkpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmICghcXVldWVkKSB7XG4gICAgICBxdWV1ZWQgPSB0cnVlO1xuICAgICAgc2V0VGltZW91dChzZW5kLCBkZWJvdW5jZSk7XG4gICAgfVxuICB9XG59XG5cbmNvbnN0IFJFX1JFRlJFU0hfV1MgPSAvXFwvX3IkLztcblxuY29uc3QgaXNSZWZyZXNoV3MgPSAodXJsOiBzdHJpbmcpID0+IFJFX1JFRlJFU0hfV1MudGVzdCh1cmwpO1xuXG4vKipcbiAqIENvbnN0cnVjdHMgYSByZWZyZXNoIG1pZGRsZXdhcmUgZm9yIHJlbG9hZGluZyB0aGUgYnJvd3NlciBvbiBmaWxlIGNoYW5nZXMuXG4gKlxuICogYGBgdHNcbiAqIGltcG9ydCB7IHNlcnZlIH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3N0ZC9odHRwL3NlcnZlci50c1wiO1xuICogaW1wb3J0IHsgcmVmcmVzaCB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC94L3JlZnJlc2gvbW9kLnRzXCI7XG4gKlxuICogY29uc3QgbWlkZGxld2FyZSA9IHJlZnJlc2goKTtcbiAqXG4gKiBzZXJ2ZSgocmVxOiBSZXF1ZXN0KSA9PiB7XG4gKiAgY29uc3QgcmVzID0gbWlkZGxld2FyZShyZXEpO1xuICpcbiAqICBpZiAocmVzKSByZXR1cm4gcmVzO1xuICpcbiAqICByZXR1cm4gbmV3IFJlc3BvbnNlKFwiSGVsbG8gRGVubyFcIik7XG4gKiB9KTtcbiAqIGBgYFxuICpcbiAqIEBwYXJhbSB7UmVmcmVzaEluaXR9IHJlZnJlc2hJbml0IG9wdGlvbmFsIGNvbmZpZ3VyYXRpb24gZm9yIGJyb3dzZXIgcmVmcmVzaCBtaWRkbGV3YXJlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVmcmVzaChcbiAgcmVmcmVzaEluaXQ/OiBSZWZyZXNoSW5pdCxcbik6IChyZXE6IFJlcXVlc3QpID0+IFJlc3BvbnNlIHwgbnVsbCB7XG4gIHdhdGNoKHJlZnJlc2hJbml0KTtcblxuICByZXR1cm4gZnVuY3Rpb24gcmVmcmVzaE1pZGRsZXdhcmUocmVxOiBSZXF1ZXN0KTogUmVzcG9uc2UgfCBudWxsIHtcbiAgICBpZiAoaXNSZWZyZXNoV3MocmVxLnVybCkgJiYgIXJlZnJlc2hJbml0Py5zaWduYWw/LmFib3J0ZWQpIHtcbiAgICAgIGNvbnN0IHVwZ3JhZGUgPSBEZW5vLnVwZ3JhZGVXZWJTb2NrZXQocmVxKTtcblxuICAgICAgdXBncmFkZS5zb2NrZXQub25jbG9zZSA9ICgpID0+IHtcbiAgICAgICAgc29ja2V0cy5kZWxldGUodXBncmFkZS5zb2NrZXQpO1xuICAgICAgfTtcblxuICAgICAgc29ja2V0cy5hZGQodXBncmFkZS5zb2NrZXQpO1xuXG4gICAgICByZXR1cm4gdXBncmFkZS5yZXNwb25zZTtcbiAgICB9XG5cbiAgICByZXR1cm4gbnVsbDtcbiAgfTtcbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUF5QkEsTUFBTSwyQkFBMkI7QUFDakMsTUFBTSx1QkFBdUI7SUFBQztJQUFPO0NBQVM7QUFDOUMsTUFBTSxnQkFBZ0I7QUFDdEIsTUFBTSxvQkFBb0IsSUFBSTtBQUU5QixNQUFNLFVBQTBCLElBQUk7QUFFcEMsZUFBZSxNQUNiLEVBQ0UsVUFBVyx5QkFBd0IsRUFDbkMsYUFBYyxxQkFBb0IsRUFDbEMsT0FBUSxjQUFhLEVBQ3JCLFdBQVksa0JBQWlCLEVBQzdCLE9BQU0sRUFDTSxHQUFHO0lBQ2YsVUFBVTtJQUNWLGFBQWE7SUFDYixPQUFPO0lBQ1AsV0FBVztBQUNiLENBQUMsRUFDRDtJQUNBLE1BQU0sVUFBVSxLQUFLLE9BQU8sQ0FBQyxPQUFPO1FBQUU7SUFBVTtJQUVoRCxTQUFTLFFBQVE7UUFDZixJQUFJO1lBQ0YsUUFBUSxLQUFLO1lBQ2IsUUFBUSxPQUFPLENBQUMsQ0FBQyxTQUFXLE9BQU8sS0FBSztZQUN4QyxRQUFRLEtBQUs7UUFDZixFQUFFLE9BQU07UUFDTixTQUFTO1FBQ1g7SUFDRjtJQUVBLElBQUksU0FBUyxLQUFLO0lBRWxCLFNBQVMsT0FBTztRQUNkLElBQUksUUFBUSxTQUFTO1lBQ25CO1lBRUE7UUFDRixDQUFDO1FBRUQsU0FBUyxLQUFLO1FBRWQsUUFBUSxPQUFPLENBQUMsQ0FBQyxTQUFXO1lBQzFCLElBQUk7Z0JBQ0YsT0FBTyxJQUFJLENBQUM7WUFDZCxFQUFFLE9BQU07WUFDTixTQUFTO1lBQ1g7UUFDRjtJQUNGO0lBRUEsV0FBVyxNQUFNLEVBQUUsS0FBSSxFQUFFLElBQUksUUFBUztRQUNwQyxJQUFJLFFBQVEsU0FBUztZQUNuQjtZQUVBLEtBQU07UUFDUixPQUFPLElBQUksWUFBWSxRQUFRLENBQUMsT0FBTztZQUNyQyxRQUFTO1FBQ1gsQ0FBQztRQUVELElBQUksQ0FBQyxRQUFRO1lBQ1gsU0FBUyxJQUFJO1lBQ2IsV0FBVyxNQUFNO1FBQ25CLENBQUM7SUFDSDtBQUNGO0FBRUEsTUFBTSxnQkFBZ0I7QUFFdEIsTUFBTSxjQUFjLENBQUMsTUFBZ0IsY0FBYyxJQUFJLENBQUM7QUFFeEQ7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Q0FtQkMsR0FDRCxPQUFPLFNBQVMsUUFDZCxXQUF5QixFQUNVO0lBQ25DLE1BQU07SUFFTixPQUFPLFNBQVMsa0JBQWtCLEdBQVksRUFBbUI7UUFDL0QsSUFBSSxZQUFZLElBQUksR0FBRyxLQUFLLENBQUMsYUFBYSxRQUFRLFNBQVM7WUFDekQsTUFBTSxVQUFVLEtBQUssZ0JBQWdCLENBQUM7WUFFdEMsUUFBUSxNQUFNLENBQUMsT0FBTyxHQUFHLElBQU07Z0JBQzdCLFFBQVEsTUFBTSxDQUFDLFFBQVEsTUFBTTtZQUMvQjtZQUVBLFFBQVEsR0FBRyxDQUFDLFFBQVEsTUFBTTtZQUUxQixPQUFPLFFBQVEsUUFBUTtRQUN6QixDQUFDO1FBRUQsT0FBTyxJQUFJO0lBQ2I7QUFDRixDQUFDIn0=