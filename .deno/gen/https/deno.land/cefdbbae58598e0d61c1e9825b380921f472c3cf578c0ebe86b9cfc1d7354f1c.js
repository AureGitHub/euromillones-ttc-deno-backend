// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
/**
 * Extensions to the
 * [Web Crypto](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
 * supporting additional encryption APIs.
 *
 * Provides additional digest algorithms that are not part of the WebCrypto
 * standard as well as a `subtle.digest` and `subtle.digestSync` methods. It
 * also provide a `subtle.timingSafeEqual()` method to compare array buffers
 * or data views in a way that isn't prone to timing based attacks.
 *
 * The "polyfill" delegates to `WebCrypto` where possible.
 *
 * The {@linkcode KeyStack} export implements the {@linkcode KeyRing} interface
 * for managing rotatable keys for signing data to prevent tampering, like with
 * HTTP cookies.
 *
 * @module
 */ import { digestAlgorithms as wasmDigestAlgorithms, instantiateWasm } from "./_wasm_crypto/mod.ts";
import { timingSafeEqual } from "./timing_safe_equal.ts";
import { fnv } from "./_fnv/index.ts";
export { KeyStack } from "./keystack.ts";
/**
 * A copy of the global WebCrypto interface, with methods bound so they're
 * safe to re-export.
 */ const webCrypto = ((crypto)=>({
        getRandomValues: crypto.getRandomValues?.bind(crypto),
        randomUUID: crypto.randomUUID?.bind(crypto),
        subtle: {
            decrypt: crypto.subtle?.decrypt?.bind(crypto.subtle),
            deriveBits: crypto.subtle?.deriveBits?.bind(crypto.subtle),
            deriveKey: crypto.subtle?.deriveKey?.bind(crypto.subtle),
            digest: crypto.subtle?.digest?.bind(crypto.subtle),
            encrypt: crypto.subtle?.encrypt?.bind(crypto.subtle),
            exportKey: crypto.subtle?.exportKey?.bind(crypto.subtle),
            generateKey: crypto.subtle?.generateKey?.bind(crypto.subtle),
            importKey: crypto.subtle?.importKey?.bind(crypto.subtle),
            sign: crypto.subtle?.sign?.bind(crypto.subtle),
            unwrapKey: crypto.subtle?.unwrapKey?.bind(crypto.subtle),
            verify: crypto.subtle?.verify?.bind(crypto.subtle),
            wrapKey: crypto.subtle?.wrapKey?.bind(crypto.subtle)
        }
    }))(globalThis.crypto);
const bufferSourceBytes = (data)=>{
    let bytes;
    if (data instanceof Uint8Array) {
        bytes = data;
    } else if (ArrayBuffer.isView(data)) {
        bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } else if (data instanceof ArrayBuffer) {
        bytes = new Uint8Array(data);
    }
    return bytes;
};
/**
 * An wrapper for WebCrypto adding support for additional non-standard
 * algorithms, but delegating to the runtime WebCrypto implementation whenever
 * possible.
 */ const stdCrypto = ((x)=>x)({
    ...webCrypto,
    subtle: {
        ...webCrypto.subtle,
        async digest (algorithm, data) {
            const { name , length  } = normalizeAlgorithm(algorithm);
            const bytes = bufferSourceBytes(data);
            if (FNVAlgorithms.includes(name)) {
                return fnv(name, bytes);
            }
            // We delegate to WebCrypto whenever possible,
            if (// if the algorithm is supported by the WebCrypto standard,
            webCryptoDigestAlgorithms.includes(name) && // and the data is a single buffer,
            bytes) {
                return webCrypto.subtle.digest(algorithm, bytes);
            } else if (wasmDigestAlgorithms.includes(name)) {
                if (bytes) {
                    // Otherwise, we use our bundled Wasm implementation via digestSync
                    // if it supports the algorithm.
                    return stdCrypto.subtle.digestSync(algorithm, bytes);
                } else if (data[Symbol.iterator]) {
                    return stdCrypto.subtle.digestSync(algorithm, data);
                } else if (data[Symbol.asyncIterator]) {
                    const wasmCrypto = instantiateWasm();
                    const context = new wasmCrypto.DigestContext(name);
                    for await (const chunk of data){
                        const chunkBytes = bufferSourceBytes(chunk);
                        if (!chunkBytes) {
                            throw new TypeError("data contained chunk of the wrong type");
                        }
                        context.update(chunkBytes);
                    }
                    return context.digestAndDrop(length).buffer;
                } else {
                    throw new TypeError("data must be a BufferSource or [Async]Iterable<BufferSource>");
                }
            } else if (webCrypto.subtle?.digest) {
                // (TypeScript type definitions prohibit this case.) If they're trying
                // to call an algorithm we don't recognize, pass it along to WebCrypto
                // in case it's a non-standard algorithm supported by the the runtime
                // they're using.
                return webCrypto.subtle.digest(algorithm, data);
            } else {
                throw new TypeError(`unsupported digest algorithm: ${algorithm}`);
            }
        },
        digestSync (algorithm, data) {
            algorithm = normalizeAlgorithm(algorithm);
            const bytes = bufferSourceBytes(data);
            if (FNVAlgorithms.includes(algorithm.name)) {
                return fnv(algorithm.name, bytes);
            }
            const wasmCrypto = instantiateWasm();
            if (bytes) {
                return wasmCrypto.digest(algorithm.name, bytes, algorithm.length).buffer;
            } else if (data[Symbol.iterator]) {
                const context = new wasmCrypto.DigestContext(algorithm.name);
                for (const chunk of data){
                    const chunkBytes = bufferSourceBytes(chunk);
                    if (!chunkBytes) {
                        throw new TypeError("data contained chunk of the wrong type");
                    }
                    context.update(chunkBytes);
                }
                return context.digestAndDrop(algorithm.length).buffer;
            } else {
                throw new TypeError("data must be a BufferSource or Iterable<BufferSource>");
            }
        },
        // TODO(@kitsonk): rework when https://github.com/w3c/webcrypto/issues/270 resolved
        timingSafeEqual
    }
});
const FNVAlgorithms = [
    "FNV32",
    "FNV32A",
    "FNV64",
    "FNV64A"
];
/** Digest algorithms supported by WebCrypto. */ const webCryptoDigestAlgorithms = [
    "SHA-384",
    "SHA-256",
    "SHA-512",
    // insecure (length-extendable and collidable):
    "SHA-1"
];
const normalizeAlgorithm = (algorithm)=>typeof algorithm === "string" ? {
        name: algorithm.toUpperCase()
    } : {
        ...algorithm,
        name: algorithm.name.toUpperCase()
    };
export { stdCrypto as crypto };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE2MC4wL2NyeXB0by9tb2QudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IDIwMTgtMjAyMiB0aGUgRGVubyBhdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLiBNSVQgbGljZW5zZS5cblxuLyoqXG4gKiBFeHRlbnNpb25zIHRvIHRoZVxuICogW1dlYiBDcnlwdG9dKGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9XZWJfQ3J5cHRvX0FQSSlcbiAqIHN1cHBvcnRpbmcgYWRkaXRpb25hbCBlbmNyeXB0aW9uIEFQSXMuXG4gKlxuICogUHJvdmlkZXMgYWRkaXRpb25hbCBkaWdlc3QgYWxnb3JpdGhtcyB0aGF0IGFyZSBub3QgcGFydCBvZiB0aGUgV2ViQ3J5cHRvXG4gKiBzdGFuZGFyZCBhcyB3ZWxsIGFzIGEgYHN1YnRsZS5kaWdlc3RgIGFuZCBgc3VidGxlLmRpZ2VzdFN5bmNgIG1ldGhvZHMuIEl0XG4gKiBhbHNvIHByb3ZpZGUgYSBgc3VidGxlLnRpbWluZ1NhZmVFcXVhbCgpYCBtZXRob2QgdG8gY29tcGFyZSBhcnJheSBidWZmZXJzXG4gKiBvciBkYXRhIHZpZXdzIGluIGEgd2F5IHRoYXQgaXNuJ3QgcHJvbmUgdG8gdGltaW5nIGJhc2VkIGF0dGFja3MuXG4gKlxuICogVGhlIFwicG9seWZpbGxcIiBkZWxlZ2F0ZXMgdG8gYFdlYkNyeXB0b2Agd2hlcmUgcG9zc2libGUuXG4gKlxuICogVGhlIHtAbGlua2NvZGUgS2V5U3RhY2t9IGV4cG9ydCBpbXBsZW1lbnRzIHRoZSB7QGxpbmtjb2RlIEtleVJpbmd9IGludGVyZmFjZVxuICogZm9yIG1hbmFnaW5nIHJvdGF0YWJsZSBrZXlzIGZvciBzaWduaW5nIGRhdGEgdG8gcHJldmVudCB0YW1wZXJpbmcsIGxpa2Ugd2l0aFxuICogSFRUUCBjb29raWVzLlxuICpcbiAqIEBtb2R1bGVcbiAqL1xuXG5pbXBvcnQge1xuICBEaWdlc3RBbGdvcml0aG0gYXMgV2FzbURpZ2VzdEFsZ29yaXRobSxcbiAgZGlnZXN0QWxnb3JpdGhtcyBhcyB3YXNtRGlnZXN0QWxnb3JpdGhtcyxcbiAgaW5zdGFudGlhdGVXYXNtLFxufSBmcm9tIFwiLi9fd2FzbV9jcnlwdG8vbW9kLnRzXCI7XG5pbXBvcnQgeyB0aW1pbmdTYWZlRXF1YWwgfSBmcm9tIFwiLi90aW1pbmdfc2FmZV9lcXVhbC50c1wiO1xuaW1wb3J0IHsgZm52IH0gZnJvbSBcIi4vX2Zudi9pbmRleC50c1wiO1xuXG5leHBvcnQgeyB0eXBlIERhdGEsIHR5cGUgS2V5LCBLZXlTdGFjayB9IGZyb20gXCIuL2tleXN0YWNrLnRzXCI7XG5cbi8qKlxuICogQSBjb3B5IG9mIHRoZSBnbG9iYWwgV2ViQ3J5cHRvIGludGVyZmFjZSwgd2l0aCBtZXRob2RzIGJvdW5kIHNvIHRoZXkncmVcbiAqIHNhZmUgdG8gcmUtZXhwb3J0LlxuICovXG5jb25zdCB3ZWJDcnlwdG8gPSAoKGNyeXB0bykgPT4gKHtcbiAgZ2V0UmFuZG9tVmFsdWVzOiBjcnlwdG8uZ2V0UmFuZG9tVmFsdWVzPy5iaW5kKGNyeXB0byksXG4gIHJhbmRvbVVVSUQ6IGNyeXB0by5yYW5kb21VVUlEPy5iaW5kKGNyeXB0byksXG4gIHN1YnRsZToge1xuICAgIGRlY3J5cHQ6IGNyeXB0by5zdWJ0bGU/LmRlY3J5cHQ/LmJpbmQoY3J5cHRvLnN1YnRsZSksXG4gICAgZGVyaXZlQml0czogY3J5cHRvLnN1YnRsZT8uZGVyaXZlQml0cz8uYmluZChjcnlwdG8uc3VidGxlKSxcbiAgICBkZXJpdmVLZXk6IGNyeXB0by5zdWJ0bGU/LmRlcml2ZUtleT8uYmluZChjcnlwdG8uc3VidGxlKSxcbiAgICBkaWdlc3Q6IGNyeXB0by5zdWJ0bGU/LmRpZ2VzdD8uYmluZChjcnlwdG8uc3VidGxlKSxcbiAgICBlbmNyeXB0OiBjcnlwdG8uc3VidGxlPy5lbmNyeXB0Py5iaW5kKGNyeXB0by5zdWJ0bGUpLFxuICAgIGV4cG9ydEtleTogY3J5cHRvLnN1YnRsZT8uZXhwb3J0S2V5Py5iaW5kKGNyeXB0by5zdWJ0bGUpLFxuICAgIGdlbmVyYXRlS2V5OiBjcnlwdG8uc3VidGxlPy5nZW5lcmF0ZUtleT8uYmluZChjcnlwdG8uc3VidGxlKSxcbiAgICBpbXBvcnRLZXk6IGNyeXB0by5zdWJ0bGU/LmltcG9ydEtleT8uYmluZChjcnlwdG8uc3VidGxlKSxcbiAgICBzaWduOiBjcnlwdG8uc3VidGxlPy5zaWduPy5iaW5kKGNyeXB0by5zdWJ0bGUpLFxuICAgIHVud3JhcEtleTogY3J5cHRvLnN1YnRsZT8udW53cmFwS2V5Py5iaW5kKGNyeXB0by5zdWJ0bGUpLFxuICAgIHZlcmlmeTogY3J5cHRvLnN1YnRsZT8udmVyaWZ5Py5iaW5kKGNyeXB0by5zdWJ0bGUpLFxuICAgIHdyYXBLZXk6IGNyeXB0by5zdWJ0bGU/LndyYXBLZXk/LmJpbmQoY3J5cHRvLnN1YnRsZSksXG4gIH0sXG59KSkoZ2xvYmFsVGhpcy5jcnlwdG8pO1xuXG5jb25zdCBidWZmZXJTb3VyY2VCeXRlcyA9IChkYXRhOiBCdWZmZXJTb3VyY2UgfCB1bmtub3duKSA9PiB7XG4gIGxldCBieXRlczogVWludDhBcnJheSB8IHVuZGVmaW5lZDtcbiAgaWYgKGRhdGEgaW5zdGFuY2VvZiBVaW50OEFycmF5KSB7XG4gICAgYnl0ZXMgPSBkYXRhO1xuICB9IGVsc2UgaWYgKEFycmF5QnVmZmVyLmlzVmlldyhkYXRhKSkge1xuICAgIGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoZGF0YS5idWZmZXIsIGRhdGEuYnl0ZU9mZnNldCwgZGF0YS5ieXRlTGVuZ3RoKTtcbiAgfSBlbHNlIGlmIChkYXRhIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpIHtcbiAgICBieXRlcyA9IG5ldyBVaW50OEFycmF5KGRhdGEpO1xuICB9XG4gIHJldHVybiBieXRlcztcbn07XG5cbi8qKiBFeHRlbnNpb25zIHRvIHRoZSB3ZWIgc3RhbmRhcmQgYFN1YnRsZUNyeXB0b2AgaW50ZXJmYWNlLiAqL1xuZXhwb3J0IGludGVyZmFjZSBTdGRTdWJ0bGVDcnlwdG8gZXh0ZW5kcyBTdWJ0bGVDcnlwdG8ge1xuICAvKipcbiAgICogUmV0dXJucyBhIG5ldyBgUHJvbWlzZWAgb2JqZWN0IHRoYXQgd2lsbCBkaWdlc3QgYGRhdGFgIHVzaW5nIHRoZSBzcGVjaWZpZWRcbiAgICogYEFsZ29yaXRobUlkZW50aWZpZXJgLlxuICAgKi9cbiAgZGlnZXN0KFxuICAgIGFsZ29yaXRobTogRGlnZXN0QWxnb3JpdGhtLFxuICAgIGRhdGE6IEJ1ZmZlclNvdXJjZSB8IEFzeW5jSXRlcmFibGU8QnVmZmVyU291cmNlPiB8IEl0ZXJhYmxlPEJ1ZmZlclNvdXJjZT4sXG4gICk6IFByb21pc2U8QXJyYXlCdWZmZXI+O1xuXG4gIC8qKlxuICAgKiBSZXR1cm5zIGEgQXJyYXlCdWZmZXIgd2l0aCB0aGUgcmVzdWx0IG9mIGRpZ2VzdGluZyBgZGF0YWAgdXNpbmcgdGhlXG4gICAqIHNwZWNpZmllZCBgQWxnb3JpdGhtSWRlbnRpZmllcmAuXG4gICAqL1xuICBkaWdlc3RTeW5jKFxuICAgIGFsZ29yaXRobTogRGlnZXN0QWxnb3JpdGhtLFxuICAgIGRhdGE6IEJ1ZmZlclNvdXJjZSB8IEl0ZXJhYmxlPEJ1ZmZlclNvdXJjZT4sXG4gICk6IEFycmF5QnVmZmVyO1xuXG4gIC8qKiBDb21wYXJlIHRvIGFycmF5IGJ1ZmZlcnMgb3IgZGF0YSB2aWV3cyBpbiBhIHdheSB0aGF0IHRpbWluZyBiYXNlZCBhdHRhY2tzXG4gICAqIGNhbm5vdCBnYWluIGluZm9ybWF0aW9uIGFib3V0IHRoZSBwbGF0Zm9ybS4gKi9cbiAgdGltaW5nU2FmZUVxdWFsKFxuICAgIGE6IEFycmF5QnVmZmVyTGlrZSB8IERhdGFWaWV3LFxuICAgIGI6IEFycmF5QnVmZmVyTGlrZSB8IERhdGFWaWV3LFxuICApOiBib29sZWFuO1xufVxuXG4vKiogRXh0ZW5zaW9ucyB0byB0aGUgV2ViIHtAbGlua2NvZGUgQ3J5cHRvfSBpbnRlcmZhY2UuICovXG5leHBvcnQgaW50ZXJmYWNlIFN0ZENyeXB0byBleHRlbmRzIENyeXB0byB7XG4gIHJlYWRvbmx5IHN1YnRsZTogU3RkU3VidGxlQ3J5cHRvO1xufVxuXG4vKipcbiAqIEFuIHdyYXBwZXIgZm9yIFdlYkNyeXB0byBhZGRpbmcgc3VwcG9ydCBmb3IgYWRkaXRpb25hbCBub24tc3RhbmRhcmRcbiAqIGFsZ29yaXRobXMsIGJ1dCBkZWxlZ2F0aW5nIHRvIHRoZSBydW50aW1lIFdlYkNyeXB0byBpbXBsZW1lbnRhdGlvbiB3aGVuZXZlclxuICogcG9zc2libGUuXG4gKi9cbmNvbnN0IHN0ZENyeXB0bzogU3RkQ3J5cHRvID0gKCh4KSA9PiB4KSh7XG4gIC4uLndlYkNyeXB0byxcbiAgc3VidGxlOiB7XG4gICAgLi4ud2ViQ3J5cHRvLnN1YnRsZSxcblxuICAgIGFzeW5jIGRpZ2VzdChcbiAgICAgIGFsZ29yaXRobTogRGlnZXN0QWxnb3JpdGhtLFxuICAgICAgZGF0YTogQnVmZmVyU291cmNlIHwgQXN5bmNJdGVyYWJsZTxCdWZmZXJTb3VyY2U+IHwgSXRlcmFibGU8QnVmZmVyU291cmNlPixcbiAgICApOiBQcm9taXNlPEFycmF5QnVmZmVyPiB7XG4gICAgICBjb25zdCB7IG5hbWUsIGxlbmd0aCB9ID0gbm9ybWFsaXplQWxnb3JpdGhtKGFsZ29yaXRobSk7XG4gICAgICBjb25zdCBieXRlcyA9IGJ1ZmZlclNvdXJjZUJ5dGVzKGRhdGEpO1xuXG4gICAgICBpZiAoRk5WQWxnb3JpdGhtcy5pbmNsdWRlcyhuYW1lKSkge1xuICAgICAgICByZXR1cm4gZm52KG5hbWUsIGJ5dGVzKTtcbiAgICAgIH1cblxuICAgICAgLy8gV2UgZGVsZWdhdGUgdG8gV2ViQ3J5cHRvIHdoZW5ldmVyIHBvc3NpYmxlLFxuICAgICAgaWYgKFxuICAgICAgICAvLyBpZiB0aGUgYWxnb3JpdGhtIGlzIHN1cHBvcnRlZCBieSB0aGUgV2ViQ3J5cHRvIHN0YW5kYXJkLFxuICAgICAgICAod2ViQ3J5cHRvRGlnZXN0QWxnb3JpdGhtcyBhcyByZWFkb25seSBzdHJpbmdbXSkuaW5jbHVkZXMobmFtZSkgJiZcbiAgICAgICAgLy8gYW5kIHRoZSBkYXRhIGlzIGEgc2luZ2xlIGJ1ZmZlcixcbiAgICAgICAgYnl0ZXNcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gd2ViQ3J5cHRvLnN1YnRsZS5kaWdlc3QoYWxnb3JpdGhtLCBieXRlcyk7XG4gICAgICB9IGVsc2UgaWYgKHdhc21EaWdlc3RBbGdvcml0aG1zLmluY2x1ZGVzKG5hbWUgYXMgV2FzbURpZ2VzdEFsZ29yaXRobSkpIHtcbiAgICAgICAgaWYgKGJ5dGVzKSB7XG4gICAgICAgICAgLy8gT3RoZXJ3aXNlLCB3ZSB1c2Ugb3VyIGJ1bmRsZWQgV2FzbSBpbXBsZW1lbnRhdGlvbiB2aWEgZGlnZXN0U3luY1xuICAgICAgICAgIC8vIGlmIGl0IHN1cHBvcnRzIHRoZSBhbGdvcml0aG0uXG4gICAgICAgICAgcmV0dXJuIHN0ZENyeXB0by5zdWJ0bGUuZGlnZXN0U3luYyhhbGdvcml0aG0sIGJ5dGVzKTtcbiAgICAgICAgfSBlbHNlIGlmICgoZGF0YSBhcyBJdGVyYWJsZTxCdWZmZXJTb3VyY2U+KVtTeW1ib2wuaXRlcmF0b3JdKSB7XG4gICAgICAgICAgcmV0dXJuIHN0ZENyeXB0by5zdWJ0bGUuZGlnZXN0U3luYyhcbiAgICAgICAgICAgIGFsZ29yaXRobSxcbiAgICAgICAgICAgIGRhdGEgYXMgSXRlcmFibGU8QnVmZmVyU291cmNlPixcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgIChkYXRhIGFzIEFzeW5jSXRlcmFibGU8QnVmZmVyU291cmNlPilbU3ltYm9sLmFzeW5jSXRlcmF0b3JdXG4gICAgICAgICkge1xuICAgICAgICAgIGNvbnN0IHdhc21DcnlwdG8gPSBpbnN0YW50aWF0ZVdhc20oKTtcbiAgICAgICAgICBjb25zdCBjb250ZXh0ID0gbmV3IHdhc21DcnlwdG8uRGlnZXN0Q29udGV4dChuYW1lKTtcbiAgICAgICAgICBmb3IgYXdhaXQgKGNvbnN0IGNodW5rIG9mIGRhdGEgYXMgQXN5bmNJdGVyYWJsZTxCdWZmZXJTb3VyY2U+KSB7XG4gICAgICAgICAgICBjb25zdCBjaHVua0J5dGVzID0gYnVmZmVyU291cmNlQnl0ZXMoY2h1bmspO1xuICAgICAgICAgICAgaWYgKCFjaHVua0J5dGVzKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJkYXRhIGNvbnRhaW5lZCBjaHVuayBvZiB0aGUgd3JvbmcgdHlwZVwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnRleHQudXBkYXRlKGNodW5rQnl0ZXMpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gY29udGV4dC5kaWdlc3RBbmREcm9wKGxlbmd0aCkuYnVmZmVyO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXG4gICAgICAgICAgICBcImRhdGEgbXVzdCBiZSBhIEJ1ZmZlclNvdXJjZSBvciBbQXN5bmNdSXRlcmFibGU8QnVmZmVyU291cmNlPlwiLFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAod2ViQ3J5cHRvLnN1YnRsZT8uZGlnZXN0KSB7XG4gICAgICAgIC8vIChUeXBlU2NyaXB0IHR5cGUgZGVmaW5pdGlvbnMgcHJvaGliaXQgdGhpcyBjYXNlLikgSWYgdGhleSdyZSB0cnlpbmdcbiAgICAgICAgLy8gdG8gY2FsbCBhbiBhbGdvcml0aG0gd2UgZG9uJ3QgcmVjb2duaXplLCBwYXNzIGl0IGFsb25nIHRvIFdlYkNyeXB0b1xuICAgICAgICAvLyBpbiBjYXNlIGl0J3MgYSBub24tc3RhbmRhcmQgYWxnb3JpdGhtIHN1cHBvcnRlZCBieSB0aGUgdGhlIHJ1bnRpbWVcbiAgICAgICAgLy8gdGhleSdyZSB1c2luZy5cbiAgICAgICAgcmV0dXJuIHdlYkNyeXB0by5zdWJ0bGUuZGlnZXN0KFxuICAgICAgICAgIGFsZ29yaXRobSxcbiAgICAgICAgICAoZGF0YSBhcyB1bmtub3duKSBhcyBVaW50OEFycmF5LFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihgdW5zdXBwb3J0ZWQgZGlnZXN0IGFsZ29yaXRobTogJHthbGdvcml0aG19YCk7XG4gICAgICB9XG4gICAgfSxcblxuICAgIGRpZ2VzdFN5bmMoXG4gICAgICBhbGdvcml0aG06IERpZ2VzdEFsZ29yaXRobSxcbiAgICAgIGRhdGE6IEJ1ZmZlclNvdXJjZSB8IEl0ZXJhYmxlPEJ1ZmZlclNvdXJjZT4sXG4gICAgKTogQXJyYXlCdWZmZXIge1xuICAgICAgYWxnb3JpdGhtID0gbm9ybWFsaXplQWxnb3JpdGhtKGFsZ29yaXRobSk7XG5cbiAgICAgIGNvbnN0IGJ5dGVzID0gYnVmZmVyU291cmNlQnl0ZXMoZGF0YSk7XG5cbiAgICAgIGlmIChGTlZBbGdvcml0aG1zLmluY2x1ZGVzKGFsZ29yaXRobS5uYW1lKSkge1xuICAgICAgICByZXR1cm4gZm52KGFsZ29yaXRobS5uYW1lLCBieXRlcyk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHdhc21DcnlwdG8gPSBpbnN0YW50aWF0ZVdhc20oKTtcbiAgICAgIGlmIChieXRlcykge1xuICAgICAgICByZXR1cm4gd2FzbUNyeXB0by5kaWdlc3QoYWxnb3JpdGhtLm5hbWUsIGJ5dGVzLCBhbGdvcml0aG0ubGVuZ3RoKVxuICAgICAgICAgIC5idWZmZXI7XG4gICAgICB9IGVsc2UgaWYgKChkYXRhIGFzIEl0ZXJhYmxlPEJ1ZmZlclNvdXJjZT4pW1N5bWJvbC5pdGVyYXRvcl0pIHtcbiAgICAgICAgY29uc3QgY29udGV4dCA9IG5ldyB3YXNtQ3J5cHRvLkRpZ2VzdENvbnRleHQoYWxnb3JpdGhtLm5hbWUpO1xuICAgICAgICBmb3IgKGNvbnN0IGNodW5rIG9mIGRhdGEgYXMgSXRlcmFibGU8QnVmZmVyU291cmNlPikge1xuICAgICAgICAgIGNvbnN0IGNodW5rQnl0ZXMgPSBidWZmZXJTb3VyY2VCeXRlcyhjaHVuayk7XG4gICAgICAgICAgaWYgKCFjaHVua0J5dGVzKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiZGF0YSBjb250YWluZWQgY2h1bmsgb2YgdGhlIHdyb25nIHR5cGVcIik7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnRleHQudXBkYXRlKGNodW5rQnl0ZXMpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb250ZXh0LmRpZ2VzdEFuZERyb3AoYWxnb3JpdGhtLmxlbmd0aCkuYnVmZmVyO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcbiAgICAgICAgICBcImRhdGEgbXVzdCBiZSBhIEJ1ZmZlclNvdXJjZSBvciBJdGVyYWJsZTxCdWZmZXJTb3VyY2U+XCIsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSxcblxuICAgIC8vIFRPRE8oQGtpdHNvbmspOiByZXdvcmsgd2hlbiBodHRwczovL2dpdGh1Yi5jb20vdzNjL3dlYmNyeXB0by9pc3N1ZXMvMjcwIHJlc29sdmVkXG4gICAgdGltaW5nU2FmZUVxdWFsLFxuICB9LFxufSk7XG5cbmNvbnN0IEZOVkFsZ29yaXRobXMgPSBbXCJGTlYzMlwiLCBcIkZOVjMyQVwiLCBcIkZOVjY0XCIsIFwiRk5WNjRBXCJdO1xuXG4vKiogRGlnZXN0IGFsZ29yaXRobXMgc3VwcG9ydGVkIGJ5IFdlYkNyeXB0by4gKi9cbmNvbnN0IHdlYkNyeXB0b0RpZ2VzdEFsZ29yaXRobXMgPSBbXG4gIFwiU0hBLTM4NFwiLFxuICBcIlNIQS0yNTZcIixcbiAgXCJTSEEtNTEyXCIsXG4gIC8vIGluc2VjdXJlIChsZW5ndGgtZXh0ZW5kYWJsZSBhbmQgY29sbGlkYWJsZSk6XG4gIFwiU0hBLTFcIixcbl0gYXMgY29uc3Q7XG5cbmV4cG9ydCB0eXBlIEZOVkFsZ29yaXRobXMgPSBcIkZOVjMyXCIgfCBcIkZOVjMyQVwiIHwgXCJGTlY2NFwiIHwgXCJGTlY2NEFcIjtcbmV4cG9ydCB0eXBlIERpZ2VzdEFsZ29yaXRobU5hbWUgPSBXYXNtRGlnZXN0QWxnb3JpdGhtIHwgRk5WQWxnb3JpdGhtcztcblxuZXhwb3J0IHR5cGUgRGlnZXN0QWxnb3JpdGhtT2JqZWN0ID0ge1xuICBuYW1lOiBEaWdlc3RBbGdvcml0aG1OYW1lO1xuICBsZW5ndGg/OiBudW1iZXI7XG59O1xuXG5leHBvcnQgdHlwZSBEaWdlc3RBbGdvcml0aG0gPSBEaWdlc3RBbGdvcml0aG1OYW1lIHwgRGlnZXN0QWxnb3JpdGhtT2JqZWN0O1xuXG5jb25zdCBub3JtYWxpemVBbGdvcml0aG0gPSAoYWxnb3JpdGhtOiBEaWdlc3RBbGdvcml0aG0pID0+XG4gICgodHlwZW9mIGFsZ29yaXRobSA9PT0gXCJzdHJpbmdcIikgPyB7IG5hbWU6IGFsZ29yaXRobS50b1VwcGVyQ2FzZSgpIH0gOiB7XG4gICAgLi4uYWxnb3JpdGhtLFxuICAgIG5hbWU6IGFsZ29yaXRobS5uYW1lLnRvVXBwZXJDYXNlKCksXG4gIH0pIGFzIERpZ2VzdEFsZ29yaXRobU9iamVjdDtcblxuZXhwb3J0IHsgc3RkQ3J5cHRvIGFzIGNyeXB0byB9O1xuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDBFQUEwRTtBQUUxRTs7Ozs7Ozs7Ozs7Ozs7Ozs7Q0FpQkMsR0FFRCxTQUVFLG9CQUFvQixvQkFBb0IsRUFDeEMsZUFBZSxRQUNWLHdCQUF3QjtBQUMvQixTQUFTLGVBQWUsUUFBUSx5QkFBeUI7QUFDekQsU0FBUyxHQUFHLFFBQVEsa0JBQWtCO0FBRXRDLFNBQThCLFFBQVEsUUFBUSxnQkFBZ0I7QUFFOUQ7OztDQUdDLEdBQ0QsTUFBTSxZQUFZLENBQUMsQ0FBQyxTQUFXLENBQUM7UUFDOUIsaUJBQWlCLE9BQU8sZUFBZSxFQUFFLEtBQUs7UUFDOUMsWUFBWSxPQUFPLFVBQVUsRUFBRSxLQUFLO1FBQ3BDLFFBQVE7WUFDTixTQUFTLE9BQU8sTUFBTSxFQUFFLFNBQVMsS0FBSyxPQUFPLE1BQU07WUFDbkQsWUFBWSxPQUFPLE1BQU0sRUFBRSxZQUFZLEtBQUssT0FBTyxNQUFNO1lBQ3pELFdBQVcsT0FBTyxN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