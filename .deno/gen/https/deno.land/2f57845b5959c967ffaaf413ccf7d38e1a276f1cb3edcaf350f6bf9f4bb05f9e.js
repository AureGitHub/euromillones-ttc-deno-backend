import { base64 } from "../deps.ts";
/** Number of random bytes used to generate a nonce */ const defaultNonceSize = 16;
const text_encoder = new TextEncoder();
var AuthenticationState;
(function(AuthenticationState) {
    AuthenticationState[AuthenticationState["Init"] = 0] = "Init";
    AuthenticationState[AuthenticationState["ClientChallenge"] = 1] = "ClientChallenge";
    AuthenticationState[AuthenticationState["ServerChallenge"] = 2] = "ServerChallenge";
    AuthenticationState[AuthenticationState["ClientResponse"] = 3] = "ClientResponse";
    AuthenticationState[AuthenticationState["ServerResponse"] = 4] = "ServerResponse";
    AuthenticationState[AuthenticationState["Failed"] = 5] = "Failed";
})(AuthenticationState || (AuthenticationState = {}));
export var Reason;
(function(Reason) {
    Reason["BadMessage"] = "server sent an ill-formed message";
    Reason["BadServerNonce"] = "server sent an invalid nonce";
    Reason["BadSalt"] = "server specified an invalid salt";
    Reason["BadIterationCount"] = "server specified an invalid iteration count";
    Reason["BadVerifier"] = "server sent a bad verifier";
    Reason["Rejected"] = "rejected by server";
})(Reason || (Reason = {}));
function assert(cond) {
    if (!cond) {
        throw new Error("Scram protocol assertion failed");
    }
}
// TODO
// Handle mapping and maybe unicode normalization.
// Add tests for invalid string values
/**
 * Normalizes string per SASLprep.
 * @see {@link https://tools.ietf.org/html/rfc3454}
 * @see {@link https://tools.ietf.org/html/rfc4013}
 */ function assertValidScramString(str) {
    const unsafe = /[^\x21-\x7e]/;
    if (unsafe.test(str)) {
        throw new Error("scram username/password is currently limited to safe ascii characters");
    }
}
async function computeScramSignature(message, raw_key) {
    const key = await crypto.subtle.importKey("raw", raw_key, {
        name: "HMAC",
        hash: "SHA-256"
    }, false, [
        "sign"
    ]);
    return new Uint8Array(await crypto.subtle.sign({
        name: "HMAC",
        hash: "SHA-256"
    }, key, text_encoder.encode(message)));
}
function computeScramProof(signature, key) {
    const digest = new Uint8Array(signature.length);
    for(let i = 0; i < digest.length; i++){
        digest[i] = signature[i] ^ key[i];
    }
    return digest;
}
/**
 * Derives authentication key signatures from a plaintext password
 */ async function deriveKeySignatures(password, salt, iterations) {
    const pbkdf2_password = await crypto.subtle.importKey("raw", text_encoder.encode(password), "PBKDF2", false, [
        "deriveBits",
        "deriveKey"
    ]);
    const key = await crypto.subtle.deriveKey({
        hash: "SHA-256",
        iterations,
        name: "PBKDF2",
        salt
    }, pbkdf2_password, {
        name: "HMAC",
        hash: "SHA-256",
        length: 256
    }, false, [
        "sign"
    ]);
    const client = new Uint8Array(await crypto.subtle.sign("HMAC", key, text_encoder.encode("Client Key")));
    const server = new Uint8Array(await crypto.subtle.sign("HMAC", key, text_encoder.encode("Server Key")));
    const stored = new Uint8Array(await crypto.subtle.digest("SHA-256", client));
    return {
        client,
        server,
        stored
    };
}
/** Escapes "=" and "," in a string. */ function escape(str) {
    return str.replace(/=/g, "=3D").replace(/,/g, "=2C");
}
function generateRandomNonce(size) {
    return base64.encode(crypto.getRandomValues(new Uint8Array(size)));
}
function parseScramAttributes(message) {
    const attrs = {};
    for (const entry of message.split(",")){
        const pos = entry.indexOf("=");
        if (pos < 1) {
            throw new Error(Reason.BadMessage);
        }
        // TODO
        // Replace with String.prototype.substring
        const key = entry.substr(0, pos);
        const value = entry.substr(pos + 1);
        attrs[key] = value;
    }
    return attrs;
}
/**
 * Client composes and verifies SCRAM authentication messages, keeping track
 * of authentication #state and parameters.
 * @see {@link https://tools.ietf.org/html/rfc5802}
 */ export class Client {
    #auth_message;
    #client_nonce;
    #key_signatures;
    #password;
    #server_nonce;
    #state;
    #username;
    constructor(username, password, nonce){
        assertValidScramString(password);
        assertValidScramString(username);
        this.#auth_message = "";
        this.#client_nonce = nonce ?? generateRandomNonce(defaultNonceSize);
        this.#password = password;
        this.#state = AuthenticationState.Init;
        this.#username = escape(username);
    }
    /**
   * Composes client-first-message
   */ composeChallenge() {
        assert(this.#state === AuthenticationState.Init);
        try {
            // "n" for no channel binding, then an empty authzid option follows.
            const header = "n,,";
            const challenge = `n=${this.#username},r=${this.#client_nonce}`;
            const message = header + challenge;
            this.#auth_message += challenge;
            this.#state = AuthenticationState.ClientChallenge;
            return message;
        } catch (e) {
            this.#state = AuthenticationState.Failed;
            throw e;
        }
    }
    /**
   * Processes server-first-message
   */ async receiveChallenge(challenge) {
        assert(this.#state === AuthenticationState.ClientChallenge);
        try {
            const attrs = parseScramAttributes(challenge);
            const nonce = attrs.r;
            if (!attrs.r || !attrs.r.startsWith(this.#client_nonce)) {
                throw new Error(Reason.BadServerNonce);
            }
            this.#server_nonce = nonce;
            let salt;
            if (!attrs.s) {
                throw new Error(Reason.BadSalt);
            }
            try {
                salt = base64.decode(attrs.s);
            } catch  {
                throw new Error(Reason.BadSalt);
            }
            const iterCount = parseInt(attrs.i) | 0;
            if (iterCount <= 0) {
                throw new Error(Reason.BadIterationCount);
            }
            this.#key_signatures = await deriveKeySignatures(this.#password, salt, iterCount);
            this.#auth_message += "," + challenge;
            this.#state = AuthenticationState.ServerChallenge;
        } catch (e) {
            this.#state = AuthenticationState.Failed;
            throw e;
        }
    }
    /**
   * Composes client-final-message
   */ async composeResponse() {
        assert(this.#state === AuthenticationState.ServerChallenge);
        assert(this.#key_signatures);
        assert(this.#server_nonce);
        try {
            // "biws" is the base-64 encoded form of the gs2-header "n,,".
            const responseWithoutProof = `c=biws,r=${this.#server_nonce}`;
            this.#auth_message += "," + responseWithoutProof;
            const proof = base64.encode(computeScramProof(await computeScramSignature(this.#auth_message, this.#key_signatures.stored), this.#key_signatures.client));
            const message = `${responseWithoutProof},p=${proof}`;
            this.#state = AuthenticationState.ClientResponse;
            return message;
        } catch (e) {
            this.#state = AuthenticationState.Failed;
            throw e;
        }
    }
    /**
   * Processes server-final-message
   */ async receiveResponse(response) {
        assert(this.#state === AuthenticationState.ClientResponse);
        assert(this.#key_signatures);
        try {
            const attrs = parseScramAttributes(response);
            if (attrs.e) {
                throw new Error(attrs.e ?? Reason.Rejected);
            }
            const verifier = base64.encode(await computeScramSignature(this.#auth_message, this.#key_signatures.server));
            if (attrs.v !== verifier) {
                throw new Error(Reason.BadVerifier);
            }
            this.#state = AuthenticationState.ServerResponse;
        } catch (e) {
            this.#state = AuthenticationState.Failed;
            throw e;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvcG9zdGdyZXNAdjAuMTcuMC9jb25uZWN0aW9uL3NjcmFtLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGJhc2U2NCB9IGZyb20gXCIuLi9kZXBzLnRzXCI7XG5cbi8qKiBOdW1iZXIgb2YgcmFuZG9tIGJ5dGVzIHVzZWQgdG8gZ2VuZXJhdGUgYSBub25jZSAqL1xuY29uc3QgZGVmYXVsdE5vbmNlU2l6ZSA9IDE2O1xuY29uc3QgdGV4dF9lbmNvZGVyID0gbmV3IFRleHRFbmNvZGVyKCk7XG5cbmVudW0gQXV0aGVudGljYXRpb25TdGF0ZSB7XG4gIEluaXQsXG4gIENsaWVudENoYWxsZW5nZSxcbiAgU2VydmVyQ2hhbGxlbmdlLFxuICBDbGllbnRSZXNwb25zZSxcbiAgU2VydmVyUmVzcG9uc2UsXG4gIEZhaWxlZCxcbn1cblxuLyoqXG4gKiBDb2xsZWN0aW9uIG9mIFNDUkFNIGF1dGhlbnRpY2F0aW9uIGtleXMgZGVyaXZlZCBmcm9tIGEgcGxhaW50ZXh0IHBhc3N3b3JkXG4gKiBpbiBITUFDLWRlcml2ZWQgYmluYXJ5IGZvcm1hdFxuICovXG5pbnRlcmZhY2UgS2V5U2lnbmF0dXJlcyB7XG4gIGNsaWVudDogVWludDhBcnJheTtcbiAgc2VydmVyOiBVaW50OEFycmF5O1xuICBzdG9yZWQ6IFVpbnQ4QXJyYXk7XG59XG5cbi8qKlxuICogUmVhc29uIG9mIGF1dGhlbnRpY2F0aW9uIGZhaWx1cmVcbiAqL1xuZXhwb3J0IGVudW0gUmVhc29uIHtcbiAgQmFkTWVzc2FnZSA9IFwic2VydmVyIHNlbnQgYW4gaWxsLWZvcm1lZCBtZXNzYWdlXCIsXG4gIEJhZFNlcnZlck5vbmNlID0gXCJzZXJ2ZXIgc2VudCBhbiBpbnZhbGlkIG5vbmNlXCIsXG4gIEJhZFNhbHQgPSBcInNlcnZlciBzcGVjaWZpZWQgYW4gaW52YWxpZCBzYWx0XCIsXG4gIEJhZEl0ZXJhdGlvbkNvdW50ID0gXCJzZXJ2ZXIgc3BlY2lmaWVkIGFuIGludmFsaWQgaXRlcmF0aW9uIGNvdW50XCIsXG4gIEJhZFZlcmlmaWVyID0gXCJzZXJ2ZXIgc2VudCBhIGJhZCB2ZXJpZmllclwiLFxuICBSZWplY3RlZCA9IFwicmVqZWN0ZWQgYnkgc2VydmVyXCIsXG59XG5cbmZ1bmN0aW9uIGFzc2VydChjb25kOiB1bmtub3duKTogYXNzZXJ0cyBjb25kIHtcbiAgaWYgKCFjb25kKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiU2NyYW0gcHJvdG9jb2wgYXNzZXJ0aW9uIGZhaWxlZFwiKTtcbiAgfVxufVxuXG4vLyBUT0RPXG4vLyBIYW5kbGUgbWFwcGluZyBhbmQgbWF5YmUgdW5pY29kZSBub3JtYWxpemF0aW9uLlxuLy8gQWRkIHRlc3RzIGZvciBpbnZhbGlkIHN0cmluZyB2YWx1ZXNcbi8qKlxuICogTm9ybWFsaXplcyBzdHJpbmcgcGVyIFNBU0xwcmVwLlxuICogQHNlZSB7QGxpbmsgaHR0cHM6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM0NTR9XG4gKiBAc2VlIHtAbGluayBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjNDAxM31cbiAqL1xuZnVuY3Rpb24gYXNzZXJ0VmFsaWRTY3JhbVN0cmluZyhzdHI6IHN0cmluZykge1xuICBjb25zdCB1bnNhZmUgPSAvW15cXHgyMS1cXHg3ZV0vO1xuICBpZiAodW5zYWZlLnRlc3Qoc3RyKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIFwic2NyYW0gdXNlcm5hbWUvcGFzc3dvcmQgaXMgY3VycmVudGx5IGxpbWl0ZWQgdG8gc2FmZSBhc2NpaSBjaGFyYWN0ZXJzXCIsXG4gICAgKTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBjb21wdXRlU2NyYW1TaWduYXR1cmUoXG4gIG1lc3NhZ2U6IHN0cmluZyxcbiAgcmF3X2tleTogVWludDhBcnJheSxcbik6IFByb21pc2U8VWludDhBcnJheT4ge1xuICBjb25zdCBrZXkgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmltcG9ydEtleShcbiAgICBcInJhd1wiLFxuICAgIHJhd19rZXksXG4gICAgeyBuYW1lOiBcIkhNQUNcIiwgaGFzaDogXCJTSEEtMjU2XCIgfSxcbiAgICBmYWxzZSxcbiAgICBbXCJzaWduXCJdLFxuICApO1xuXG4gIHJldHVybiBuZXcgVWludDhBcnJheShcbiAgICBhd2FpdCBjcnlwdG8uc3VidGxlLnNpZ24oXG4gICAgICB7IG5hbWU6IFwiSE1BQ1wiLCBoYXNoOiBcIlNIQS0yNTZcIiB9LFxuICAgICAga2V5LFxuICAgICAgdGV4dF9lbmNvZGVyLmVuY29kZShtZXNzYWdlKSxcbiAgICApLFxuICApO1xufVxuXG5mdW5jdGlvbiBjb21wdXRlU2NyYW1Qcm9vZihzaWduYXR1cmU6IFVpbnQ4QXJyYXksIGtleTogVWludDhBcnJheSk6IFVpbnQ4QXJyYXkge1xuICBjb25zdCBkaWdlc3QgPSBuZXcgVWludDhBcnJheShzaWduYXR1cmUubGVuZ3RoKTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBkaWdlc3QubGVuZ3RoOyBpKyspIHtcbiAgICBkaWdlc3RbaV0gPSBzaWduYXR1cmVbaV0gXiBrZXlbaV07XG4gIH1cbiAgcmV0dXJuIGRpZ2VzdDtcbn1cblxuLyoqXG4gKiBEZXJpdmVzIGF1dGhlbnRpY2F0aW9uIGtleSBzaWduYXR1cmVzIGZyb20gYSBwbGFpbnRleHQgcGFzc3dvcmRcbiAqL1xuYXN5bmMgZnVuY3Rpb24gZGVyaXZlS2V5U2lnbmF0dXJlcyhcbiAgcGFzc3dvcmQ6IHN0cmluZyxcbiAgc2FsdDogVWludDhBcnJheSxcbiAgaXRlcmF0aW9uczogbnVtYmVyLFxuKTogUHJvbWlzZTxLZXlTaWduYXR1cmVzPiB7XG4gIGNvbnN0IHBia2RmMl9wYXNzd29yZCA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuaW1wb3J0S2V5KFxuICAgIFwicmF3XCIsXG4gICAgdGV4dF9lbmNvZGVyLmVuY29kZShwYXNzd29yZCksXG4gICAgXCJQQktERjJcIixcbiAgICBmYWxzZSxcbiAgICBbXCJkZXJpdmVCaXRzXCIsIFwiZGVyaXZlS2V5XCJdLFxuICApO1xuICBjb25zdCBrZXkgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmRlcml2ZUtleShcbiAgICB7XG4gICAgICBoYXNoOiBcIlNIQS0yNTZcIixcbiAgICAgIGl0ZXJhdGlvbnMsXG4gICAgICBuYW1lOiBcIlBCS0RGMlwiLFxuICAgICAgc2FsdCxcbiAgICB9LFxuICAgIHBia2RmMl9wYXNzd29yZCxcbiAgICB7IG5hbWU6IFwiSE1BQ1wiLCBoYXNoOiBcIlNIQS0yNTZcIiwgbGVuZ3RoOiAyNTYgfSxcbiAgICBmYWxzZSxcbiAgICBbXCJzaWduXCJdLFxuICApO1xuXG4gIGNvbnN0IGNsaWVudCA9IG5ldyBVaW50OEFycmF5KFxuICAgIGF3YWl0IGNyeXB0by5zdWJ0bGUuc2lnbihcIkhNQUNcIiwga2V5LCB0ZXh0X2VuY29kZXIuZW5jb2RlKFwiQ2xpZW50IEtleVwiKSksXG4gICk7XG4gIGNvbnN0IHNlcnZlciA9IG5ldyBVaW50OEFycmF5KFxuICAgIGF3YWl0IGNyeXB0by5zdWJ0bGUuc2lnbihcIkhNQUNcIiwga2V5LCB0ZXh0X2VuY29kZXIuZW5jb2RlKFwiU2VydmVyIEtleVwiKSksXG4gICk7XG4gIGNvbnN0IHN0b3JlZCA9IG5ldyBVaW50OEFycmF5KGF3YWl0IGNyeXB0by5zdWJ0bGUuZGlnZXN0KFwiU0hBLTI1NlwiLCBjbGllbnQpKTtcblxuICByZXR1cm4geyBjbGllbnQsIHNlcnZlciwgc3RvcmVkIH07XG59XG5cbi8qKiBFc2NhcGVzIFwiPVwiIGFuZCBcIixcIiBpbiBhIHN0cmluZy4gKi9cbmZ1bmN0aW9uIGVzY2FwZShzdHI6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBzdHJcbiAgICAucmVwbGFjZSgvPS9nLCBcIj0zRFwiKVxuICAgIC5yZXBsYWNlKC8sL2csIFwiPTJDXCIpO1xufVxuXG5mdW5jdGlvbiBnZW5lcmF0ZVJhbmRvbU5vbmNlKHNpemU6IG51bWJlcik6IHN0cmluZyB7XG4gIHJldHVybiBiYXNlNjQuZW5jb2RlKGNyeXB0by5nZXRSYW5kb21WYWx1ZXMobmV3IFVpbnQ4QXJyYXkoc2l6ZSkpKTtcbn1cblxuZnVuY3Rpb24gcGFyc2VTY3JhbUF0dHJpYnV0ZXMobWVzc2FnZTogc3RyaW5nKTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB7XG4gIGNvbnN0IGF0dHJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG5cbiAgZm9yIChjb25zdCBlbnRyeSBvZiBtZXNzYWdlLnNwbGl0KFwiLFwiKSkge1xuICAgIGNvbnN0IHBvcyA9IGVudHJ5LmluZGV4T2YoXCI9XCIpO1xuICAgIGlmIChwb3MgPCAxKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoUmVhc29uLkJhZE1lc3NhZ2UpO1xuICAgIH1cblxuICAgIC8vIFRPRE9cbiAgICAvLyBSZXBsYWNlIHdpdGggU3RyaW5nLnByb3RvdHlwZS5zdWJzdHJpbmdcbiAgICBjb25zdCBrZXkgPSBlbnRyeS5zdWJzdHIoMCwgcG9zKTtcbiAgICBjb25zdCB2YWx1ZSA9IGVudHJ5LnN1YnN0cihwb3MgKyAxKTtcbiAgICBhdHRyc1trZXldID0gdmFsdWU7XG4gIH1cblxuICByZXR1cm4gYXR0cnM7XG59XG5cbi8qKlxuICogQ2xpZW50IGNvbXBvc2VzIGFuZCB2ZXJpZmllcyBTQ1JBTSBhdXRoZW50aWNhdGlvbiBtZXNzYWdlcywga2VlcGluZyB0cmFja1xuICogb2YgYXV0aGVudGljYXRpb24gI3N0YXRlIGFuZCBwYXJhbWV0ZXJzLlxuICogQHNlZSB7QGxpbmsgaHR0cHM6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzU4MDJ9XG4gKi9cbmV4cG9ydCBjbGFzcyBDbGllbnQge1xuICAjYXV0aF9tZXNzYWdlOiBzdHJpbmc7XG4gICNjbGllbnRfbm9uY2U6IHN0cmluZztcbiAgI2tleV9zaWduYXR1cmVzPzogS2V5U2lnbmF0dXJlcztcbiAgI3Bhc3N3b3JkOiBzdHJpbmc7XG4gICNzZXJ2ZXJfbm9uY2U/OiBzdHJpbmc7XG4gICNzdGF0ZTogQXV0aGVudGljYXRpb25TdGF0ZTtcbiAgI3VzZXJuYW1lOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3IodXNlcm5hbWU6IHN0cmluZywgcGFzc3dvcmQ6IHN0cmluZywgbm9uY2U/OiBzdHJpbmcpIHtcbiAgICBhc3NlcnRWYWxpZFNjcmFtU3RyaW5nKHBhc3N3b3JkKTtcbiAgICBhc3NlcnRWYWxpZFNjcmFtU3RyaW5nKHVzZXJuYW1lKTtcblxuICAgIHRoaXMuI2F1dGhfbWVzc2FnZSA9IFwiXCI7XG4gICAgdGhpcy4jY2xpZW50X25vbmNlID0gbm9uY2UgPz8gZ2VuZXJhdGVSYW5kb21Ob25jZShkZWZhdWx0Tm9uY2VTaXplKTtcbiAgICB0aGlzLiNwYXNzd29yZCA9IHBhc3N3b3JkO1xuICAgIHRoaXMuI3N0YXRlID0gQXV0aGVudGljYXRpb25TdGF0ZS5Jbml0O1xuICAgIHRoaXMuI3VzZXJuYW1lID0gZXNjYXBlKHVzZXJuYW1lKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDb21wb3NlcyBjbGllbnQtZmlyc3QtbWVzc2FnZVxuICAgKi9cbiAgY29tcG9zZUNoYWxsZW5nZSgpOiBzdHJpbmcge1xuICAgIGFzc2VydCh0aGlzLiNzdGF0ZSA9PT0gQXV0aGVudGljYXRpb25TdGF0ZS5Jbml0KTtcblxuICAgIHRyeSB7XG4gICAgICAvLyBcIm5cIiBmb3Igbm8gY2hhbm5lbCBiaW5kaW5nLCB0aGVuIGFuIGVtcHR5IGF1dGh6aWQgb3B0aW9uIGZvbGxvd3MuXG4gICAgICBjb25zdCBoZWFkZXIgPSBcIm4sLFwiO1xuXG4gICAgICBjb25zdCBjaGFsbGVuZ2UgPSBgbj0ke3RoaXMuI3VzZXJuYW1lfSxyPSR7dGhpcy4jY2xpZW50X25vbmNlfWA7XG4gICAgICBjb25zdCBtZXNzYWdlID0gaGVhZGVyICsgY2hhbGxlbmdlO1xuXG4gICAgICB0aGlzLiNhdXRoX21lc3NhZ2UgKz0gY2hhbGxlbmdlO1xuICAgICAgdGhpcy4jc3RhdGUgPSBBdXRoZW50aWNhdGlvblN0YXRlLkNsaWVudENoYWxsZW5nZTtcbiAgICAgIHJldHVybiBtZXNzYWdlO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHRoaXMuI3N0YXRlID0gQXV0aGVudGljYXRpb25TdGF0ZS5GYWlsZWQ7XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBQcm9jZXNzZXMgc2VydmVyLWZpcnN0LW1lc3NhZ2VcbiAgICovXG4gIGFzeW5jIHJlY2VpdmVDaGFsbGVuZ2UoY2hhbGxlbmdlOiBzdHJpbmcpIHtcbiAgICBhc3NlcnQodGhpcy4jc3RhdGUgPT09IEF1dGhlbnRpY2F0aW9uU3RhdGUuQ2xpZW50Q2hhbGxlbmdlKTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBhdHRycyA9IHBhcnNlU2NyYW1BdHRyaWJ1dGVzKGNoYWxsZW5nZSk7XG5cbiAgICAgIGNvbnN0IG5vbmNlID0gYXR0cnMucjtcbiAgICAgIGlmICghYXR0cnMuciB8fCAhYXR0cnMuci5zdGFydHNXaXRoKHRoaXMuI2NsaWVudF9ub25jZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFJlYXNvbi5CYWRTZXJ2ZXJOb25jZSk7XG4gICAgICB9XG4gICAgICB0aGlzLiNzZXJ2ZXJfbm9uY2UgPSBub25jZTtcblxuICAgICAgbGV0IHNhbHQ6IFVpbnQ4QXJyYXkgfCB1bmRlZmluZWQ7XG4gICAgICBpZiAoIWF0dHJzLnMpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFJlYXNvbi5CYWRTYWx0KTtcbiAgICAgIH1cbiAgICAgIHRyeSB7XG4gICAgICAgIHNhbHQgPSBiYXNlNjQuZGVjb2RlKGF0dHJzLnMpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihSZWFzb24uQmFkU2FsdCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGl0ZXJDb3VudCA9IHBhcnNlSW50KGF0dHJzLmkpIHwgMDtcbiAgICAgIGlmIChpdGVyQ291bnQgPD0gMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoUmVhc29uLkJhZEl0ZXJhdGlvbkNvdW50KTtcbiAgICAgIH1cblxuICAgICAgdGhpcy4ja2V5X3NpZ25hdHVyZXMgPSBhd2FpdCBkZXJpdmVLZXlTaWduYXR1cmVzKFxuICAgICAgICB0aGlzLiNwYXNzd29yZCxcbiAgICAgICAgc2FsdCxcbiAgICAgICAgaXRlckNvdW50LFxuICAgICAgKTtcblxuICAgICAgdGhpcy4jYXV0aF9tZXNzYWdlICs9IFwiLFwiICsgY2hhbGxlbmdlO1xuICAgICAgdGhpcy4jc3RhdGUgPSBBdXRoZW50aWNhdGlvblN0YXRlLlNlcnZlckNoYWxsZW5nZTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICB0aGlzLiNzdGF0ZSA9IEF1dGhlbnRpY2F0aW9uU3RhdGUuRmFpbGVkO1xuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ29tcG9zZXMgY2xpZW50LWZpbmFsLW1lc3NhZ2VcbiAgICovXG4gIGFzeW5jIGNvbXBvc2VSZXNwb25zZSgpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGFzc2VydCh0aGlzLiNzdGF0ZSA9PT0gQXV0aGVudGljYXRpb25TdGF0ZS5TZXJ2ZXJDaGFsbGVuZ2UpO1xuICAgIGFzc2VydCh0aGlzLiNrZXlfc2lnbmF0dXJlcyk7XG4gICAgYXNzZXJ0KHRoaXMuI3NlcnZlcl9ub25jZSk7XG5cbiAgICB0cnkge1xuICAgICAgLy8gXCJiaXdzXCIgaXMgdGhlIGJhc2UtNjQgZW5jb2RlZCBmb3JtIG9mIHRoZSBnczItaGVhZGVyIFwibiwsXCIuXG4gICAgICBjb25zdCByZXNwb25zZVdpdGhvdXRQcm9vZiA9IGBjPWJpd3Mscj0ke3RoaXMuI3NlcnZlcl9ub25jZX1gO1xuXG4gICAgICB0aGlzLiNhdXRoX21lc3NhZ2UgKz0gXCIsXCIgKyByZXNwb25zZVdpdGhvdXRQcm9vZjtcblxuICAgICAgY29uc3QgcHJvb2YgPSBiYXNlNjQuZW5jb2RlKFxuICAgICAgICBjb21wdXRlU2NyYW1Qcm9vZihcbiAgICAgICAgICBhd2FpdCBjb21wdXRlU2NyYW1TaWduYXR1cmUoXG4gICAgICAgICAgICB0aGlzLiNhdXRoX21lc3NhZ2UsXG4gICAgICAgICAgICB0aGlzLiNrZXlfc2lnbmF0dXJlcy5zdG9yZWQsXG4gICAgICAgICAgKSxcbiAgICAgICAgICB0aGlzLiNrZXlfc2lnbmF0dXJlcy5jbGllbnQsXG4gICAgICAgICksXG4gICAgICApO1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGAke3Jlc3BvbnNlV2l0aG91dFByb29mfSxwPSR7cHJvb2Z9YDtcblxuICAgICAgdGhpcy4jc3RhdGUgPSBBdXRoZW50aWNhdGlvblN0YXRlLkNsaWVudFJlc3BvbnNlO1xuICAgICAgcmV0dXJuIG1lc3NhZ2U7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgdGhpcy4jc3RhdGUgPSBBdXRoZW50aWNhdGlvblN0YXRlLkZhaWxlZDtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFByb2Nlc3NlcyBzZXJ2ZXItZmluYWwtbWVzc2FnZVxuICAgKi9cbiAgYXN5bmMgcmVjZWl2ZVJlc3BvbnNlKHJlc3BvbnNlOiBzdHJpbmcpIHtcbiAgICBhc3NlcnQodGhpcy4jc3RhdGUgPT09IEF1dGhlbnRpY2F0aW9uU3RhdGUuQ2xpZW50UmVzcG9uc2UpO1xuICAgIGFzc2VydCh0aGlzLiNrZXlfc2lnbmF0dXJlcyk7XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgYXR0cnMgPSBwYXJzZVNjcmFtQXR0cmlidXRlcyhyZXNwb25zZSk7XG5cbiAgICAgIGlmIChhdHRycy5lKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihhdHRycy5lID8/IFJlYXNvbi5SZWplY3RlZCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHZlcmlmaWVyID0gYmFzZTY0LmVuY29kZShcbiAgICAgICAgYXdhaXQgY29tcHV0ZVNjcmFtU2lnbmF0dXJlKFxuICAgICAgICAgIHRoaXMuI2F1dGhfbWVzc2FnZSxcbiAgICAgICAgICB0aGlzLiNrZXlfc2lnbmF0dXJlcy5zZXJ2ZXIsXG4gICAgICAgICksXG4gICAgICApO1xuICAgICAgaWYgKGF0dHJzLnYgIT09IHZlcmlmaWVyKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihSZWFzb24uQmFkVmVyaWZpZXIpO1xuICAgICAgfVxuXG4gICAgICB0aGlzLiNzdGF0ZSA9IEF1dGhlbnRpY2F0aW9uU3RhdGUuU2VydmVyUmVzcG9uc2U7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgdGhpcy4jc3RhdGUgPSBBdXRoZW50aWNhdGlvblN0YXRlLkZhaWxlZDtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuICB9XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsU0FBUyxNQUFNLFFBQVEsYUFBYTtBQUVwQyxvREFBb0QsR0FDcEQsTUFBTSxtQkFBbUI7QUFDekIsTUFBTSxlQUFlLElBQUk7SUFFekI7VUFBSyxtQkFBbUI7SUFBbkIsb0JBQUEsb0JBQ0gsVUFBQSxLQUFBO0lBREcsb0JBQUEsb0JBRUgscUJBQUEsS0FBQTtJQUZHLG9CQUFBLG9CQUdILHFCQUFBLEtBQUE7SUFIRyxvQkFBQSxvQkFJSCxvQkFBQSxLQUFBO0lBSkcsb0JBQUEsb0JBS0gsb0JBQUEsS0FBQTtJQUxHLG9CQUFBLG9CQU1ILFlBQUEsS0FBQTtHQU5HLHdCQUFBO1dBc0JFO1VBQUssTUFBTTtJQUFOLE9BQ1YsZ0JBQWE7SUFESCxPQUVWLG9CQUFpQjtJQUZQLE9BR1YsYUFBVTtJQUhBLE9BSVYsdUJBQW9CO0lBSlYsT0FLVixpQkFBYztJQUxKLE9BTVYsY0FBVztHQU5ELFdBQUE7QUFTWixTQUFTLE9BQU8sSUFBYSxFQUFnQjtJQUMzQyxJQUFJLENBQUMsTUFBTTtRQUNULE1BQU0sSUFBSSxNQUFNLG1DQUFtQztJQUNyRCxDQUFDO0FBQ0g7QUFFQSxPQUFPO0FBQ1Asa0RBQWtEO0FBQ2xELHNDQUFzQztBQUN0Qzs7OztDQUlDLEdBQ0QsU0FBUyx1QkFBdUIsR0FBVyxFQUFFO0lBQzNDLE1BQU0sU0FBUztJQUNmLElBQUksT0FBTyxJQUFJLENBQUMsTUFBTTtRQUNwQixNQUFNLElBQUksTUFDUix5RUFD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