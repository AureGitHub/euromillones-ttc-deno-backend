// Copyright 2018-2022 the oak authors. All rights reserved. MIT license.
// deno-lint-ignore-file
/** Compose multiple middleware functions into a single middleware function. */ export function compose(middleware) {
    return function composedMiddleware(context, next) {
        let index = -1;
        async function dispatch(i) {
            if (i <= index) {
                throw new Error("next() called multiple times.");
            }
            index = i;
            let fn = middleware[i];
            if (i === middleware.length) {
                fn = next;
            }
            if (!fn) {
                return;
            }
            await fn(context, dispatch.bind(null, i + 1));
        }
        return dispatch(0);
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMS4xLjAvbWlkZGxld2FyZS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBvYWsgYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG5cbi8vIGRlbm8tbGludC1pZ25vcmUtZmlsZVxuXG5pbXBvcnQgdHlwZSB7IFN0YXRlIH0gZnJvbSBcIi4vYXBwbGljYXRpb24udHNcIjtcbmltcG9ydCB0eXBlIHsgQ29udGV4dCB9IGZyb20gXCIuL2NvbnRleHQudHNcIjtcblxuLyoqIE1pZGRsZXdhcmUgYXJlIGZ1bmN0aW9ucyB3aGljaCBhcmUgY2hhaW5lZCB0b2dldGhlciB0byBkZWFsIHdpdGggcmVxdWVzdHMuICovXG5leHBvcnQgaW50ZXJmYWNlIE1pZGRsZXdhcmU8XG4gIFMgZXh0ZW5kcyBTdGF0ZSA9IFJlY29yZDxzdHJpbmcsIGFueT4sXG4gIFQgZXh0ZW5kcyBDb250ZXh0ID0gQ29udGV4dDxTPixcbj4ge1xuICAoY29udGV4dDogVCwgbmV4dDogKCkgPT4gUHJvbWlzZTx1bmtub3duPik6IFByb21pc2U8dW5rbm93bj4gfCB1bmtub3duO1xufVxuXG4vKiogQ29tcG9zZSBtdWx0aXBsZSBtaWRkbGV3YXJlIGZ1bmN0aW9ucyBpbnRvIGEgc2luZ2xlIG1pZGRsZXdhcmUgZnVuY3Rpb24uICovXG5leHBvcnQgZnVuY3Rpb24gY29tcG9zZTxcbiAgUyBleHRlbmRzIFN0YXRlID0gUmVjb3JkPHN0cmluZywgYW55PixcbiAgVCBleHRlbmRzIENvbnRleHQgPSBDb250ZXh0PFM+LFxuPihcbiAgbWlkZGxld2FyZTogTWlkZGxld2FyZTxTLCBUPltdLFxuKTogKGNvbnRleHQ6IFQsIG5leHQ/OiAoKSA9PiBQcm9taXNlPHVua25vd24+KSA9PiBQcm9taXNlPHVua25vd24+IHtcbiAgcmV0dXJuIGZ1bmN0aW9uIGNvbXBvc2VkTWlkZGxld2FyZShcbiAgICBjb250ZXh0OiBULFxuICAgIG5leHQ/OiAoKSA9PiBQcm9taXNlPHVua25vd24+LFxuICApOiBQcm9taXNlPHVua25vd24+IHtcbiAgICBsZXQgaW5kZXggPSAtMTtcblxuICAgIGFzeW5jIGZ1bmN0aW9uIGRpc3BhdGNoKGk6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuICAgICAgaWYgKGkgPD0gaW5kZXgpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwibmV4dCgpIGNhbGxlZCBtdWx0aXBsZSB0aW1lcy5cIik7XG4gICAgICB9XG4gICAgICBpbmRleCA9IGk7XG4gICAgICBsZXQgZm46IE1pZGRsZXdhcmU8UywgVD4gfCB1bmRlZmluZWQgPSBtaWRkbGV3YXJlW2ldO1xuICAgICAgaWYgKGkgPT09IG1pZGRsZXdhcmUubGVuZ3RoKSB7XG4gICAgICAgIGZuID0gbmV4dDtcbiAgICAgIH1cbiAgICAgIGlmICghZm4pIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgYXdhaXQgZm4oY29udGV4dCwgZGlzcGF0Y2guYmluZChudWxsLCBpICsgMSkpO1xuICAgIH1cblxuICAgIHJldHVybiBkaXNwYXRjaCgwKTtcbiAgfTtcbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSx5RUFBeUU7QUFFekUsd0JBQXdCO0FBYXhCLDZFQUE2RSxHQUM3RSxPQUFPLFNBQVMsUUFJZCxVQUE4QixFQUNtQztJQUNqRSxPQUFPLFNBQVMsbUJBQ2QsT0FBVSxFQUNWLElBQTZCLEVBQ1g7UUFDbEIsSUFBSSxRQUFRLENBQUM7UUFFYixlQUFlLFNBQVMsQ0FBUyxFQUFpQjtZQUNoRCxJQUFJLEtBQUssT0FBTztnQkFDZCxNQUFNLElBQUksTUFBTSxpQ0FBaUM7WUFDbkQsQ0FBQztZQUNELFFBQVE7WUFDUixJQUFJLEtBQW1DLFVBQVUsQ0FBQyxFQUFFO1lBQ3BELElBQUksTUFBTSxXQUFXLE1BQU0sRUFBRTtnQkFDM0IsS0FBSztZQUNQLENBQUM7WUFDRCxJQUFJLENBQUMsSUFBSTtnQkFDUDtZQUNGLENBQUM7WUFDRCxNQUFNLEdBQUcsU0FBUyxTQUFTLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSTtRQUM1QztRQUVBLE9BQU8sU0FBUztJQUNsQjtBQUNGLENBQUMifQ==