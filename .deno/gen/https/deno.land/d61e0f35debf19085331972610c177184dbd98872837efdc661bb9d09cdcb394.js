import { parseConnectionUri } from "../utils/utils.ts";
import { ConnectionParamsError } from "../client/error.ts";
import { fromFileUrl, isAbsolute } from "../deps.ts";
/**
 * This function retrieves the connection options from the environmental variables
 * as they are, without any extra parsing
 *
 * It will throw if no env permission was provided on startup
 */ function getPgEnv() {
    return {
        applicationName: Deno.env.get("PGAPPNAME"),
        database: Deno.env.get("PGDATABASE"),
        hostname: Deno.env.get("PGHOST"),
        options: Deno.env.get("PGOPTIONS"),
        password: Deno.env.get("PGPASSWORD"),
        port: Deno.env.get("PGPORT"),
        user: Deno.env.get("PGUSER")
    };
}
function formatMissingParams(missingParams) {
    return `Missing connection parameters: ${missingParams.join(", ")}`;
}
/**
 * This validates the options passed are defined and have a value other than null
 * or empty string, it throws a connection error otherwise
 *
 * @param has_env_access This parameter will change the error message if set to true,
 * telling the user to pass env permissions in order to read environmental variables
 */ function assertRequiredOptions(options, requiredKeys, has_env_access) {
    const missingParams = [];
    for (const key of requiredKeys){
        if (options[key] === "" || options[key] === null || options[key] === undefined) {
            missingParams.push(key);
        }
    }
    if (missingParams.length) {
        let missing_params_message = formatMissingParams(missingParams);
        if (!has_env_access) {
            missing_params_message += "\nConnection parameters can be read from environment variables only if Deno is run with env permission";
        }
        throw new ConnectionParamsError(missing_params_message);
    }
}
function parseOptionsArgument(options) {
    const args = options.split(" ");
    const transformed_args = [];
    for(let x = 0; x < args.length; x++){
        if (/^-\w/.test(args[x])) {
            if (args[x] === "-c") {
                if (args[x + 1] === undefined) {
                    throw new Error(`No provided value for "${args[x]}" in options parameter`);
                }
                // Skip next iteration
                transformed_args.push(args[x + 1]);
                x++;
            } else {
                throw new Error(`Argument "${args[x]}" is not supported in options parameter`);
            }
        } else if (/^--\w/.test(args[x])) {
            transformed_args.push(args[x].slice(2));
        } else {
            throw new Error(`Value "${args[x]}" is not a valid options argument`);
        }
    }
    return transformed_args.reduce((options, x)=>{
        if (!/.+=.+/.test(x)) {
            throw new Error(`Value "${x}" is not a valid options argument`);
        }
        const key = x.slice(0, x.indexOf("="));
        const value = x.slice(x.indexOf("=") + 1);
        options[key] = value;
        return options;
    }, {});
}
function parseOptionsFromUri(connection_string) {
    let postgres_uri;
    try {
        const uri = parseConnectionUri(connection_string);
        postgres_uri = {
            application_name: uri.params.application_name,
            dbname: uri.path || uri.params.dbname,
            driver: uri.driver,
            host: uri.host || uri.params.host,
            options: uri.params.options,
            password: uri.password || uri.params.password,
            port: uri.port || uri.params.port,
            // Compatibility with JDBC, not standard
            // Treat as sslmode=require
            sslmode: uri.params.ssl === "true" ? "require" : uri.params.sslmode,
            user: uri.user || uri.params.user
        };
    } catch (e) {
        throw new ConnectionParamsError(`Could not parse the connection string`, e);
    }
    if (![
        "postgres",
        "postgresql"
    ].includes(postgres_uri.driver)) {
        throw new ConnectionParamsError(`Supplied DSN has invalid driver: ${postgres_uri.driver}.`);
    }
    // No host by default means socket connection
    const host_type = postgres_uri.host ? isAbsolute(postgres_uri.host) ? "socket" : "tcp" : "socket";
    const options = postgres_uri.options ? parseOptionsArgument(postgres_uri.options) : {};
    let tls;
    switch(postgres_uri.sslmode){
        case undefined:
            {
                break;
            }
        case "disable":
            {
                tls = {
                    enabled: false,
                    enforce: false,
                    caCertificates: []
                };
                break;
            }
        case "prefer":
            {
                tls = {
                    enabled: true,
                    enforce: false,
                    caCertificates: []
                };
                break;
            }
        case "require":
        case "verify-ca":
        case "verify-full":
            {
                tls = {
                    enabled: true,
                    enforce: true,
                    caCertificates: []
                };
                break;
            }
        default:
            {
                throw new ConnectionParamsError(`Supplied DSN has invalid sslmode '${postgres_uri.sslmode}'`);
            }
    }
    return {
        applicationName: postgres_uri.application_name,
        database: postgres_uri.dbname,
        hostname: postgres_uri.host,
        host_type,
        options,
        password: postgres_uri.password,
        port: postgres_uri.port,
        tls,
        user: postgres_uri.user
    };
}
const DEFAULT_OPTIONS = {
    applicationName: "deno_postgres",
    connection: {
        attempts: 1,
        interval: (previous_interval)=>previous_interval + 500
    },
    host: "127.0.0.1",
    socket: "/tmp",
    host_type: "socket",
    options: {},
    port: 5432,
    tls: {
        enabled: true,
        enforce: false,
        caCertificates: []
    }
};
export function createParams(params = {}) {
    if (typeof params === "string") {
        params = parseOptionsFromUri(params);
    }
    let pgEnv = {};
    let has_env_access = true;
    try {
        pgEnv = getPgEnv();
    } catch (e) {
        if (e instanceof Deno.errors.PermissionDenied) {
            has_env_access = false;
        } else {
            throw e;
        }
    }
    const provided_host = params.hostname ?? pgEnv.hostname;
    // If a host is provided, the default connection type is TCP
    const host_type = params.host_type ?? (provided_host ? "tcp" : DEFAULT_OPTIONS.host_type);
    if (![
        "tcp",
        "socket"
    ].includes(host_type)) {
        throw new ConnectionParamsError(`"${host_type}" is not a valid host type`);
    }
    let host;
    if (host_type === "socket") {
        const socket = provided_host ?? DEFAULT_OPTIONS.socket;
        try {
            if (!isAbsolute(socket)) {
                const parsed_host = new URL(socket, Deno.mainModule);
                // Resolve relative path
                if (parsed_host.protocol === "file:") {
                    host = fromFileUrl(parsed_host);
                } else {
                    throw new Error("The provided host is not a file path");
                }
            } else {
                host = socket;
            }
        } catch (e1) {
            throw new ConnectionParamsError(`Could not parse host "${socket}"`, e1);
        }
    } else {
        host = provided_host ?? DEFAULT_OPTIONS.host;
    }
    const provided_options = params.options ?? pgEnv.options;
    let options;
    if (provided_options) {
        if (typeof provided_options === "string") {
            options = parseOptionsArgument(provided_options);
        } else {
            options = provided_options;
        }
    } else {
        options = {};
    }
    for(const key in options){
        if (!/^\w+$/.test(key)) {
            throw new Error(`The "${key}" key in the options argument is invalid`);
        }
        options[key] = options[key].replaceAll(" ", "\\ ");
    }
    let port;
    if (params.port) {
        port = Number(params.port);
    } else if (pgEnv.port) {
        port = Number(pgEnv.port);
    } else {
        port = DEFAULT_OPTIONS.port;
    }
    if (Number.isNaN(port) || port === 0) {
        throw new ConnectionParamsError(`"${params.port ?? pgEnv.port}" is not a valid port number`);
    }
    if (host_type === "socket" && params?.tls) {
        throw new ConnectionParamsError(`No TLS options are allowed when host type is set to "socket"`);
    }
    const tls_enabled = !!(params?.tls?.enabled ?? DEFAULT_OPTIONS.tls.enabled);
    const tls_enforced = !!(params?.tls?.enforce ?? DEFAULT_OPTIONS.tls.enforce);
    if (!tls_enabled && tls_enforced) {
        throw new ConnectionParamsError("Can't enforce TLS when client has TLS encryption is disabled");
    }
    // TODO
    // Perhaps username should be taken from the PC user as a default?
    const connection_options = {
        applicationName: params.applicationName ?? pgEnv.applicationName ?? DEFAULT_OPTIONS.applicationName,
        connection: {
            attempts: params?.connection?.attempts ?? DEFAULT_OPTIONS.connection.attempts,
            interval: params?.connection?.interval ?? DEFAULT_OPTIONS.connection.interval
        },
        database: params.database ?? pgEnv.database,
        hostname: host,
        host_type,
        options,
        password: params.password ?? pgEnv.password,
        port,
        tls: {
            enabled: tls_enabled,
            enforce: tls_enforced,
            caCertificates: params?.tls?.caCertificates ?? []
        },
        user: params.user ?? pgEnv.user
    };
    assertRequiredOptions(connection_options, [
        "applicationName",
        "database",
        "hostname",
        "host_type",
        "port",
        "user"
    ], has_env_access);
    return connection_options;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvcG9zdGdyZXNAdjAuMTcuMC9jb25uZWN0aW9uL2Nvbm5lY3Rpb25fcGFyYW1zLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IHBhcnNlQ29ubmVjdGlvblVyaSB9IGZyb20gXCIuLi91dGlscy91dGlscy50c1wiO1xuaW1wb3J0IHsgQ29ubmVjdGlvblBhcmFtc0Vycm9yIH0gZnJvbSBcIi4uL2NsaWVudC9lcnJvci50c1wiO1xuaW1wb3J0IHsgZnJvbUZpbGVVcmwsIGlzQWJzb2x1dGUgfSBmcm9tIFwiLi4vZGVwcy50c1wiO1xuXG4vKipcbiAqIFRoZSBjb25uZWN0aW9uIHN0cmluZyBtdXN0IG1hdGNoIHRoZSBmb2xsb3dpbmcgVVJJIHN0cnVjdHVyZS4gQWxsIHBhcmFtZXRlcnMgYnV0IGRhdGFiYXNlIGFuZCB1c2VyIGFyZSBvcHRpb25hbFxuICpcbiAqIGBwb3N0Z3JlczovL3VzZXI6cGFzc3dvcmRAaG9zdG5hbWU6cG9ydC9kYXRhYmFzZT9zc2xtb2RlPW1vZGUuLi5gXG4gKlxuICogWW91IGNhbiBhZGRpdGlvbmFsbHkgcHJvdmlkZSB0aGUgZm9sbG93aW5nIHVybCBzZWFyY2ggcGFyYW1ldGVyc1xuICpcbiAqIC0gYXBwbGljYXRpb25fbmFtZVxuICogLSBkYm5hbWVcbiAqIC0gaG9zdFxuICogLSBvcHRpb25zXG4gKiAtIHBhc3N3b3JkXG4gKiAtIHBvcnRcbiAqIC0gc3NsbW9kZVxuICogLSB1c2VyXG4gKi9cbmV4cG9ydCB0eXBlIENvbm5lY3Rpb25TdHJpbmcgPSBzdHJpbmc7XG5cbi8qKlxuICogVGhpcyBmdW5jdGlvbiByZXRyaWV2ZXMgdGhlIGNvbm5lY3Rpb24gb3B0aW9ucyBmcm9tIHRoZSBlbnZpcm9ubWVudGFsIHZhcmlhYmxlc1xuICogYXMgdGhleSBhcmUsIHdpdGhvdXQgYW55IGV4dHJhIHBhcnNpbmdcbiAqXG4gKiBJdCB3aWxsIHRocm93IGlmIG5vIGVudiBwZXJtaXNzaW9uIHdhcyBwcm92aWRlZCBvbiBzdGFydHVwXG4gKi9cbmZ1bmN0aW9uIGdldFBnRW52KCk6IENsaWVudE9wdGlvbnMge1xuICByZXR1cm4ge1xuICAgIGFwcGxpY2F0aW9uTmFtZTogRGVuby5lbnYuZ2V0KFwiUEdBUFBOQU1FXCIpLFxuICAgIGRhdGFiYXNlOiBEZW5vLmVudi5nZXQoXCJQR0RBVEFCQVNFXCIpLFxuICAgIGhvc3RuYW1lOiBEZW5vLmVudi5nZXQoXCJQR0hPU1RcIiksXG4gICAgb3B0aW9uczogRGVuby5lbnYuZ2V0KFwiUEdPUFRJT05TXCIpLFxuICAgIHBhc3N3b3JkOiBEZW5vLmVudi5nZXQoXCJQR1BBU1NXT1JEXCIpLFxuICAgIHBvcnQ6IERlbm8uZW52LmdldChcIlBHUE9SVFwiKSxcbiAgICB1c2VyOiBEZW5vLmVudi5nZXQoXCJQR1VTRVJcIiksXG4gIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29ubmVjdGlvbk9wdGlvbnMge1xuICAvKipcbiAgICogQnkgZGVmYXVsdCwgYW55IGNsaWVudCB3aWxsIG9ubHkgYXR0ZW1wdCB0byBzdGFibGlzaFxuICAgKiBjb25uZWN0aW9uIHdpdGggeW91ciBkYXRhYmFzZSBvbmNlLiBTZXR0aW5nIHRoaXMgcGFyYW1ldGVyXG4gICAqIHdpbGwgY2F1c2UgdGhlIGNsaWVudCB0byBhdHRlbXB0IHJlY29ubmVjdGlvbiBhcyBtYW55IHRpbWVzXG4gICAqIGFzIHJlcXVlc3RlZCBiZWZvcmUgZXJyb3JpbmdcbiAgICpcbiAgICogZGVmYXVsdDogYDFgXG4gICAqL1xuICBhdHRlbXB0czogbnVtYmVyO1xuICAvKipcbiAgICogVGhlIHRpbWUgdG8gd2FpdCBiZWZvcmUgYXR0ZW1wdGluZyBlYWNoIHJlY29ubmVjdGlvbiAoaW4gbWlsbGlzZWNvbmRzKVxuICAgKlxuICAgKiBZb3UgY2FuIHByb3ZpZGUgYSBmaXhlZCBudW1iZXIgb3IgYSBmdW5jdGlvbiB0byBjYWxsIGVhY2ggdGltZSB0aGVcbiAgICogY29ubmVjdGlvbiBpcyBhdHRlbXB0ZWQuIEJ5IGRlZmF1bHQsIHRoZSBpbnRlcnZhbCB3aWxsIGJlIGEgZnVuY3Rpb25cbiAgICogd2l0aCBhbiBleHBvbmVudGlhbCBiYWNrb2ZmIGluY3JlYXNpbmcgYnkgNTAwIG1pbGxpc2Vjb25kc1xuICAgKi9cbiAgaW50ZXJ2YWw6IG51bWJlciB8ICgocHJldmlvdXNfaW50ZXJ2YWw6IG51bWJlcikgPT4gbnVtYmVyKTtcbn1cblxuLyoqIGh0dHBzOi8vd3d3LnBvc3RncmVzcWwub3JnL2RvY3MvMTQvbGlicHEtc3NsLmh0bWwjTElCUFEtU1NMLVBST1RFQ1RJT04gKi9cbnR5cGUgVExTTW9kZXMgPVxuICB8IFwiZGlzYWJsZVwiXG4gIHwgXCJwcmVmZXJcIlxuICB8IFwicmVxdWlyZVwiXG4gIHwgXCJ2ZXJpZnktY2FcIlxuICB8IFwidmVyaWZ5LWZ1bGxcIjtcblxuLy8gVE9ET1xuLy8gUmVmYWN0b3IgZW5hYmxlZCBhbmQgZW5mb3JjZSBpbnRvIG9uZSBzaW5nbGUgb3B0aW9uIGZvciAxLjBcbmV4cG9ydCBpbnRlcmZhY2UgVExTT3B0aW9ucyB7XG4gIC8qKlxuICAgKiBJZiBUTFMgc3VwcG9ydCBpcyBlbmFibGVkIG9yIG5vdC4gSWYgdGhlIHNlcnZlciByZXF1aXJlcyBUTFMsXG4gICAqIHRoZSBjb25uZWN0aW9uIHdpbGwgZmFpbC5cbiAgICpcbiAgICogRGVmYXVsdDogYHRydWVgXG4gICAqL1xuICBlbmFibGVkOiBib29sZWFuO1xuICAvKipcbiAgICogVGhpcyB3aWxsIGZvcmNlIHRoZSBjb25uZWN0aW9uIHRvIHJ1biBvdmVyIFRMU1xuICAgKiBJZiB0aGUgc2VydmVyIGRvZXNuJ3Qgc3VwcG9ydCBUTFMsIHRoZSBjb25uZWN0aW9uIHdpbGwgZmFpbFxuICAgKlxuICAgKiBEZWZhdWx0OiBgZmFsc2VgXG4gICAqL1xuICBlbmZvcmNlOiBib29sZWFuO1xuICAvKipcbiAgICogQSBsaXN0IG9mIHJvb3QgY2VydGlmaWNhdGVzIHRoYXQgd2lsbCBiZSB1c2VkIGluIGFkZGl0aW9uIHRvIHRoZSBkZWZhdWx0XG4gICAqIHJvb3QgY2VydGlmaWNhdGVzIHRvIHZlcmlmeSB0aGUgc2VydmVyJ3MgY2VydGlmaWNhdGUuXG4gICAqXG4gICAqIE11c3QgYmUgaW4gUEVNIGZvcm1hdC5cbiAgICpcbiAgICogRGVmYXVsdDogYFtdYFxuICAgKi9cbiAgY2FDZXJ0aWZpY2F0ZXM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENsaWVudE9wdGlvbnMge1xuICBhcHBsaWNhdGlvbk5hbWU/OiBzdHJpbmc7XG4gIGNvbm5lY3Rpb24/OiBQYXJ0aWFsPENvbm5lY3Rpb25PcHRpb25zPjtcbiAgZGF0YWJhc2U/OiBzdHJpbmc7XG4gIGhvc3RuYW1lPzogc3RyaW5nO1xuICBob3N0X3R5cGU/OiBcInRjcFwiIHwgXCJzb2NrZXRcIjtcbiAgb3B0aW9ucz86IHN0cmluZyB8IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gIHBhc3N3b3JkPzogc3RyaW5nO1xuICBwb3J0Pzogc3RyaW5nIHwgbnVtYmVyO1xuICB0bHM/OiBQYXJ0aWFsPFRMU09wdGlvbnM+O1xuICB1c2VyPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENsaWVudENvbmZpZ3VyYXRpb24ge1xuICBhcHBsaWNhdGlvbk5hbWU6IHN0cmluZztcbiAgY29ubmVjdGlvbjogQ29ubmVjdGlvbk9wdGlvbnM7XG4gIGRhdGFiYXNlOiBzdHJpbmc7XG4gIGhvc3RuYW1lOiBzdHJpbmc7XG4gIGhvc3RfdHlwZTogXCJ0Y3BcIiB8IFwic29ja2V0XCI7XG4gIG9wdGlvbnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gIHBhc3N3b3JkPzogc3RyaW5nO1xuICBwb3J0OiBudW1iZXI7XG4gIHRsczogVExTT3B0aW9ucztcbiAgdXNlcjogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBmb3JtYXRNaXNzaW5nUGFyYW1zKG1pc3NpbmdQYXJhbXM6IHN0cmluZ1tdKSB7XG4gIHJldHVybiBgTWlzc2luZyBjb25uZWN0aW9uIHBhcmFtZXRlcnM6ICR7XG4gICAgbWlzc2luZ1BhcmFtcy5qb2luKFxuICAgICAgXCIsIFwiLFxuICAgIClcbiAgfWA7XG59XG5cbi8qKlxuICogVGhpcyB2YWxpZGF0ZXMgdGhlIG9wdGlvbnMgcGFzc2VkIGFyZSBkZWZpbmVkIGFuZCBoYXZlIGEgdmFsdWUgb3RoZXIgdGhhbiBudWxsXG4gKiBvciBlbXB0eSBzdHJpbmcsIGl0IHRocm93cyBhIGNvbm5lY3Rpb24gZXJyb3Igb3RoZXJ3aXNlXG4gKlxuICogQHBhcmFtIGhhc19lbnZfYWNjZXNzIFRoaXMgcGFyYW1ldGVyIHdpbGwgY2hhbmdlIHRoZSBlcnJvciBtZXNzYWdlIGlmIHNldCB0byB0cnVlLFxuICogdGVsbGluZyB0aGUgdXNlciB0byBwYXNzIGVudiBwZXJtaXNzaW9ucyBpbiBvcmRlciB0byByZWFkIGVudmlyb25tZW50YWwgdmFyaWFibGVzXG4gKi9cbmZ1bmN0aW9uIGFzc2VydFJlcXVpcmVkT3B0aW9ucyhcbiAgb3B0aW9uczogUGFydGlhbDxDbGllbnRDb25maWd1cmF0aW9uPixcbiAgcmVxdWlyZWRLZXlzOiAoa2V5b2YgQ2xpZW50T3B0aW9ucylbXSxcbiAgaGFzX2Vudl9hY2Nlc3M6IGJvb2xlYW4sXG4pOiBhc3NlcnRzIG9wdGlvbnMgaXMgQ2xpZW50Q29uZmlndXJhdGlvbiB7XG4gIGNvbnN0IG1pc3NpbmdQYXJhbXM6IChrZXlvZiBDbGllbnRPcHRpb25zKVtdID0gW107XG4gIGZvciAoY29uc3Qga2V5IG9mIHJlcXVpcmVkS2V5cykge1xuICAgIGlmIChcbiAgICAgIG9wdGlvbnNba2V5XSA9PT0gXCJcIiB8fFxuICAgICAgb3B0aW9uc1trZXldID09PSBudWxsIHx8XG4gICAgICBvcHRpb25zW2tleV0gPT09IHVuZGVmaW5lZFxuICAgICkge1xuICAgICAgbWlzc2luZ1BhcmFtcy5wdXNoKGtleSk7XG4gICAgfVxuICB9XG5cbiAgaWYgKG1pc3NpbmdQYXJhbXMubGVuZ3RoKSB7XG4gICAgbGV0IG1pc3NpbmdfcGFyYW1zX21lc3NhZ2UgPSBmb3JtYXRNaXNzaW5nUGFyYW1zKG1pc3NpbmdQYXJhbXMpO1xuICAgIGlmICghaGFzX2Vudl9hY2Nlc3MpIHtcbiAgICAgIG1pc3NpbmdfcGFyYW1zX21lc3NhZ2UgKz1cbiAgICAgICAgXCJcXG5Db25uZWN0aW9uIHBhcmFtZXRlcnMgY2FuIGJlIHJlYWQgZnJvbSBlbnZpcm9ubWVudCB2YXJpYWJsZXMgb25seSBpZiBEZW5vIGlzIHJ1biB3aXRoIGVudiBwZXJtaXNzaW9uXCI7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IENvbm5lY3Rpb25QYXJhbXNFcnJvcihtaXNzaW5nX3BhcmFtc19tZXNzYWdlKTtcbiAgfVxufVxuXG4vLyBUT0RPXG4vLyBTdXBwb3J0IG1vcmUgb3B0aW9ucyBmcm9tIHRoZSBzcGVjXG4vKiogb3B0aW9ucyBmcm9tIFVSSSBwZXIgaHR0cHM6Ly93d3cucG9zdGdyZXNxbC5vcmcvZG9jcy8xNC9saWJwcS1jb25uZWN0Lmh0bWwjTElCUFEtQ09OTlNUUklORyAqL1xuaW50ZXJmYWNlIFBvc3RncmVzVXJpIHtcbiAgYXBwbGljYXRpb25fbmFtZT86IHN0cmluZztcbiAgZGJuYW1lPzogc3RyaW5nO1xuICBkcml2ZXI6IHN0cmluZztcbiAgaG9zdD86IHN0cmluZztcbiAgb3B0aW9ucz86IHN0cmluZztcbiAgcGFzc3dvcmQ/OiBzdHJpbmc7XG4gIHBvcnQ/OiBzdHJpbmc7XG4gIHNzbG1vZGU/OiBUTFNNb2RlcztcbiAgdXNlcj86IHN0cmluZztcbn1cblxuZnVuY3Rpb24gcGFyc2VPcHRpb25zQXJndW1lbnQob3B0aW9uczogc3RyaW5nKTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB7XG4gIGNvbnN0IGFyZ3MgPSBvcHRpb25zLnNwbGl0KFwiIFwiKTtcblxuICBjb25zdCB0cmFuc2Zvcm1lZF9hcmdzID0gW107XG4gIGZvciAobGV0IHggPSAwOyB4IDwgYXJncy5sZW5ndGg7IHgrKykge1xuICAgIGlmICgvXi1cXHcvLnRlc3QoYXJnc1t4XSkpIHtcbiAgICAgIGlmIChhcmdzW3hdID09PSBcIi1jXCIpIHtcbiAgICAgICAgaWYgKGFyZ3NbeCArIDFdID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICBgTm8gcHJvdmlkZWQgdmFsdWUgZm9yIFwiJHthcmdzW3hdfVwiIGluIG9wdGlvbnMgcGFyYW1ldGVyYCxcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU2tpcCBuZXh0IGl0ZXJhdGlvblxuICAgICAgICB0cmFuc2Zvcm1lZF9hcmdzLnB1c2goYXJnc1t4ICsgMV0pO1xuICAgICAgICB4Kys7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgYEFyZ3VtZW50IFwiJHthcmdzW3hdfVwiIGlzIG5vdCBzdXBwb3J0ZWQgaW4gb3B0aW9ucyBwYXJhbWV0ZXJgLFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoL14tLVxcdy8udGVzdChhcmdzW3hdKSkge1xuICAgICAgdHJhbnNmb3JtZWRfYXJncy5wdXNoKGFyZ3NbeF0uc2xpY2UoMikpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBWYWx1ZSBcIiR7YXJnc1t4XX1cIiBpcyBub3QgYSB2YWxpZCBvcHRpb25zIGFyZ3VtZW50YCxcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRyYW5zZm9ybWVkX2FyZ3MucmVkdWNlKChvcHRpb25zLCB4KSA9PiB7XG4gICAgaWYgKCEvLis9LisvLnRlc3QoeCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgVmFsdWUgXCIke3h9XCIgaXMgbm90IGEgdmFsaWQgb3B0aW9ucyBhcmd1bWVudGApO1xuICAgIH1cblxuICAgIGNvbnN0IGtleSA9IHguc2xpY2UoMCwgeC5pbmRleE9mKFwiPVwiKSk7XG4gICAgY29uc3QgdmFsdWUgPSB4LnNsaWNlKHguaW5kZXhPZihcIj1cIikgKyAxKTtcblxuICAgIG9wdGlvbnNba2V5XSA9IHZhbHVlO1xuXG4gICAgcmV0dXJuIG9wdGlvbnM7XG4gIH0sIHt9IGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz4pO1xufVxuXG5mdW5jdGlvbiBwYXJzZU9wdGlvbnNGcm9tVXJpKGNvbm5lY3Rpb25fc3RyaW5nOiBzdHJpbmcpOiBDbGllbnRPcHRpb25zIHtcbiAgbGV0IHBvc3RncmVzX3VyaTogUG9zdGdyZXNVcmk7XG4gIHRyeSB7XG4gICAgY29uc3QgdXJpID0gcGFyc2VDb25uZWN0aW9uVXJpKGNvbm5lY3Rpb25fc3RyaW5nKTtcbiAgICBwb3N0Z3Jlc191cmkgPSB7XG4gICAgICBhcHBsaWNhdGlvbl9uYW1lOiB1cmkucGFyYW1zLmFwcGxpY2F0aW9uX25hbWUsXG4gICAgICBkYm5hbWU6IHVyaS5wYXRoIHx8IHVyaS5wYXJhbXMuZGJuYW1lLFxuICAgICAgZHJpdmVyOiB1cmkuZHJpdmVyLFxuICAgICAgaG9zdDogdXJpLmhvc3QgfHwgdXJpLnBhcmFtcy5ob3N0LFxuICAgICAgb3B0aW9uczogdXJpLnBhcmFtcy5vcHRpb25zLFxuICAgICAgcGFzc3dvcmQ6IHVyaS5wYXNzd29yZCB8fCB1cmkucGFyYW1zLnBhc3N3b3JkLFxuICAgICAgcG9ydDogdXJpLnBvcnQgfHwgdXJpLnBhcmFtcy5wb3J0LFxuICAgICAgLy8gQ29tcGF0aWJpbGl0eSB3aXRoIEpEQkMsIG5vdCBzdGFuZGFyZFxuICAgICAgLy8gVHJlYXQgYXMgc3NsbW9kZT1yZXF1aXJlXG4gICAgICBzc2xtb2RlOiB1cmkucGFyYW1zLnNzbCA9PT0gXCJ0cnVlXCJcbiAgICAgICAgPyBcInJlcXVpcmVcIlxuICAgICAgICA6IHVyaS5wYXJhbXMuc3NsbW9kZSBhcyBUTFNNb2RlcyxcbiAgICAgIHVzZXI6IHVyaS51c2VyIHx8IHVyaS5wYXJhbXMudXNlcixcbiAgICB9O1xuICB9IGNhdGNoIChlKSB7XG4gICAgdGhyb3cgbmV3IENvbm5lY3Rpb25QYXJhbXNFcnJvcihcbiAgICAgIGBDb3VsZCBub3QgcGFyc2UgdGhlIGNvbm5lY3Rpb24gc3RyaW5nYCxcbiAgICAgIGUsXG4gICAgKTtcbiAgfVxuXG4gIGlmICghW1wicG9zdGdyZXNcIiwgXCJwb3N0Z3Jlc3FsXCJdLmluY2x1ZGVzKHBvc3RncmVzX3VyaS5kcml2ZXIpKSB7XG4gICAgdGhyb3cgbmV3IENvbm5lY3Rpb25QYXJhbXNFcnJvcihcbiAgICAgIGBTdXBwbGllZCBEU04gaGFzIGludmFsaWQgZHJpdmVyOiAke3Bvc3RncmVzX3VyaS5kcml2ZXJ9LmAsXG4gICAgKTtcbiAgfVxuXG4gIC8vIE5vIGhvc3QgYnkgZGVmYXVsdCBtZWFucyBzb2NrZXQgY29ubmVjdGlvblxuICBjb25zdCBob3N0X3R5cGUgPSBwb3N0Z3Jlc191cmkuaG9zdFxuICAgID8gKGlzQWJzb2x1dGUocG9zdGdyZXNfdXJpLmhvc3QpID8gXCJzb2NrZXRcIiA6IFwidGNwXCIpXG4gICAgOiBcInNvY2tldFwiO1xuXG4gIGNvbnN0IG9wdGlvbnMgPSBwb3N0Z3Jlc191cmkub3B0aW9uc1xuICAgID8gcGFyc2VPcHRpb25zQXJndW1lbnQocG9zdGdyZXNfdXJpLm9wdGlvbnMpXG4gICAgOiB7fTtcblxuICBsZXQgdGxzOiBUTFNPcHRpb25zIHwgdW5kZWZpbmVkO1xuICBzd2l0Y2ggKHBvc3RncmVzX3VyaS5zc2xtb2RlKSB7XG4gICAgY2FzZSB1bmRlZmluZWQ6IHtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBjYXNlIFwiZGlzYWJsZVwiOiB7XG4gICAgICB0bHMgPSB7IGVuYWJsZWQ6IGZhbHNlLCBlbmZvcmNlOiBmYWxzZSwgY2FDZXJ0aWZpY2F0ZXM6IFtdIH07XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgY2FzZSBcInByZWZlclwiOiB7XG4gICAgICB0bHMgPSB7IGVuYWJsZWQ6IHRydWUsIGVuZm9yY2U6IGZhbHNlLCBjYUNlcnRpZmljYXRlczogW10gfTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBjYXNlIFwicmVxdWlyZVwiOlxuICAgIGNhc2UgXCJ2ZXJpZnktY2FcIjpcbiAgICBjYXNlIFwidmVyaWZ5LWZ1bGxcIjoge1xuICAgICAgdGxzID0geyBlbmFibGVkOiB0cnVlLCBlbmZvcmNlOiB0cnVlLCBjYUNlcnRpZmljYXRlczogW10gfTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBkZWZhdWx0OiB7XG4gICAgICB0aHJvdyBuZXcgQ29ubmVjdGlvblBhcmFtc0Vycm9yKFxuICAgICAgICBgU3VwcGxpZWQgRFNOIGhhcyBpbnZhbGlkIHNzbG1vZGUgJyR7cG9zdGdyZXNfdXJpLnNzbG1vZGV9J2AsXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgYXBwbGljYXRpb25OYW1lOiBwb3N0Z3Jlc191cmkuYXBwbGljYXRpb25fbmFtZSxcbiAgICBkYXRhYmFzZTogcG9zdGdyZXNfdXJpLmRibmFtZSxcbiAgICBob3N0bmFtZTogcG9zdGdyZXNfdXJpLmhvc3QsXG4gICAgaG9zdF90eXBlLFxuICAgIG9wdGlvbnMsXG4gICAgcGFzc3dvcmQ6IHBvc3RncmVzX3VyaS5wYXNzd29yZCxcbiAgICBwb3J0OiBwb3N0Z3Jlc191cmkucG9ydCxcbiAgICB0bHMsXG4gICAgdXNlcjogcG9zdGdyZXNfdXJpLnVzZXIsXG4gIH07XG59XG5cbmNvbnN0IERFRkFVTFRfT1BUSU9OUzpcbiAgJiBPbWl0PENsaWVudENvbmZpZ3VyYXRpb24sIFwiZGF0YWJhc2VcIiB8IFwidXNlclwiIHwgXCJob3N0bmFtZVwiPlxuICAmIHsgaG9zdDogc3RyaW5nOyBzb2NrZXQ6IHN0cmluZyB9ID0ge1xuICAgIGFwcGxpY2F0aW9uTmFtZTogXCJkZW5vX3Bvc3RncmVzXCIsXG4gICAgY29ubmVjdGlvbjoge1xuICAgICAgYXR0ZW1wdHM6IDEsXG4gICAgICBpbnRlcnZhbDogKHByZXZpb3VzX2ludGVydmFsKSA9PiBwcmV2aW91c19pbnRlcnZhbCArIDUwMCxcbiAgICB9LFxuICAgIGhvc3Q6IFwiMTI3LjAuMC4xXCIsXG4gICAgc29ja2V0OiBcIi90bXBcIixcbiAgICBob3N0X3R5cGU6IFwic29ja2V0XCIsXG4gICAgb3B0aW9uczoge30sXG4gICAgcG9ydDogNTQzMixcbiAgICB0bHM6IHtcbiAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICBlbmZvcmNlOiBmYWxzZSxcbiAgICAgIGNhQ2VydGlmaWNhdGVzOiBbXSxcbiAgICB9LFxuICB9O1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlUGFyYW1zKFxuICBwYXJhbXM6IHN0cmluZyB8IENsaWVudE9wdGlvbnMgPSB7fSxcbik6IENsaWVudENvbmZpZ3VyYXRpb24ge1xuICBpZiAodHlwZW9mIHBhcmFtcyA9PT0gXCJzdHJpbmdcIikge1xuICAgIHBhcmFtcyA9IHBhcnNlT3B0aW9uc0Zyb21VcmkocGFyYW1zKTtcbiAgfVxuXG4gIGxldCBwZ0VudjogQ2xpZW50T3B0aW9ucyA9IHt9O1xuICBsZXQgaGFzX2Vudl9hY2Nlc3MgPSB0cnVlO1xuICB0cnkge1xuICAgIHBnRW52ID0gZ2V0UGdFbnYoKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGlmIChlIGluc3RhbmNlb2YgRGVuby5lcnJvcnMuUGVybWlzc2lvbkRlbmllZCkge1xuICAgICAgaGFzX2Vudl9hY2Nlc3MgPSBmYWxzZTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBwcm92aWRlZF9ob3N0ID0gcGFyYW1zLmhvc3RuYW1lID8/IHBnRW52Lmhvc3RuYW1lO1xuXG4gIC8vIElmIGEgaG9zdCBpcyBwcm92aWRlZCwgdGhlIGRlZmF1bHQgY29ubmVjdGlvbiB0eXBlIGlzIFRDUFxuICBjb25zdCBob3N0X3R5cGUgPSBwYXJhbXMuaG9zdF90eXBlID8/XG4gICAgKHByb3ZpZGVkX2hvc3QgPyBcInRjcFwiIDogREVGQVVMVF9PUFRJT05TLmhvc3RfdHlwZSk7XG4gIGlmICghW1widGNwXCIsIFwic29ja2V0XCJdLmluY2x1ZGVzKGhvc3RfdHlwZSkpIHtcbiAgICB0aHJvdyBuZXcgQ29ubmVjdGlvblBhcmFtc0Vycm9yKGBcIiR7aG9zdF90eXBlfVwiIGlzIG5vdCBhIHZhbGlkIGhvc3QgdHlwZWApO1xuICB9XG5cbiAgbGV0IGhvc3Q6IHN0cmluZztcbiAgaWYgKGhvc3RfdHlwZSA9PT0gXCJzb2NrZXRcIikge1xuICAgIGNvbnN0IHNvY2tldCA9IHByb3ZpZGVkX2hvc3QgPz8gREVGQVVMVF9PUFRJT05TLnNvY2tldDtcbiAgICB0cnkge1xuICAgICAgaWYgKCFpc0Fic29sdXRlKHNvY2tldCkpIHtcbiAgICAgICAgY29uc3QgcGFyc2VkX2hvc3QgPSBuZXcgVVJMKHNvY2tldCwgRGVuby5tYWluTW9kdWxlKTtcblxuICAgICAgICAvLyBSZXNvbHZlIHJlbGF0aXZlIHBhdGhcbiAgICAgICAgaWYgKHBhcnNlZF9ob3N0LnByb3RvY29sID09PSBcImZpbGU6XCIpIHtcbiAgICAgICAgICBob3N0ID0gZnJvbUZpbGVVcmwocGFyc2VkX2hvc3QpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgIFwiVGhlIHByb3ZpZGVkIGhvc3QgaXMgbm90IGEgZmlsZSBwYXRoXCIsXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaG9zdCA9IHNvY2tldDtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICB0aHJvdyBuZXcgQ29ubmVjdGlvblBhcmFtc0Vycm9yKFxuICAgICAgICBgQ291bGQgbm90IHBhcnNlIGhvc3QgXCIke3NvY2tldH1cImAsXG4gICAgICAgIGUsXG4gICAgICApO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBob3N0ID0gcHJvdmlkZWRfaG9zdCA/PyBERUZBVUxUX09QVElPTlMuaG9zdDtcbiAgfVxuXG4gIGNvbnN0IHByb3ZpZGVkX29wdGlvbnMgPSBwYXJhbXMub3B0aW9ucyA/PyBwZ0Vudi5vcHRpb25zO1xuXG4gIGxldCBvcHRpb25zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuICBpZiAocHJvdmlkZWRfb3B0aW9ucykge1xuICAgIGlmICh0eXBlb2YgcHJvdmlkZWRfb3B0aW9ucyA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgb3B0aW9ucyA9IHBhcnNlT3B0aW9uc0FyZ3VtZW50KHByb3ZpZGVkX29wdGlvbnMpO1xuICAgIH0gZWxzZSB7XG4gICAgICBvcHRpb25zID0gcHJvdmlkZWRfb3B0aW9ucztcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgb3B0aW9ucyA9IHt9O1xuICB9XG5cbiAgZm9yIChjb25zdCBrZXkgaW4gb3B0aW9ucykge1xuICAgIGlmICghL15cXHcrJC8udGVzdChrZXkpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFRoZSBcIiR7a2V5fVwiIGtleSBpbiB0aGUgb3B0aW9ucyBhcmd1bWVudCBpcyBpbnZhbGlkYCk7XG4gICAgfVxuXG4gICAgb3B0aW9uc1trZXldID0gb3B0aW9uc1trZXldLnJlcGxhY2VBbGwoXCIgXCIsIFwiXFxcXCBcIik7XG4gIH1cblxuICBsZXQgcG9ydDogbnVtYmVyO1xuICBpZiAocGFyYW1zLnBvcnQpIHtcbiAgICBwb3J0ID0gTnVtYmVyKHBhcmFtcy5wb3J0KTtcbiAgfSBlbHNlIGlmIChwZ0Vudi5wb3J0KSB7XG4gICAgcG9ydCA9IE51bWJlcihwZ0Vudi5wb3J0KTtcbiAgfSBlbHNlIHtcbiAgICBwb3J0ID0gREVGQVVMVF9PUFRJT05TLnBvcnQ7XG4gIH1cbiAgaWYgKE51bWJlci5pc05hTihwb3J0KSB8fCBwb3J0ID09PSAwKSB7XG4gICAgdGhyb3cgbmV3IENvbm5lY3Rpb25QYXJhbXNFcnJvcihcbiAgICAgIGBcIiR7cGFyYW1zLnBvcnQgPz8gcGdFbnYucG9ydH1cIiBpcyBub3QgYSB2YWxpZCBwb3J0IG51bWJlcmAsXG4gICAgKTtcbiAgfVxuXG4gIGlmIChob3N0X3R5cGUgPT09IFwic29ja2V0XCIgJiYgcGFyYW1zPy50bHMpIHtcbiAgICB0aHJvdyBuZXcgQ29ubmVjdGlvblBhcmFtc0Vycm9yKFxuICAgICAgYE5vIFRMUyBvcHRpb25zIGFyZSBhbGxvd2VkIHdoZW4gaG9zdCB0eXBlIGlzIHNldCB0byBcInNvY2tldFwiYCxcbiAgICApO1xuICB9XG4gIGNvbnN0IHRsc19lbmFibGVkID0gISEocGFyYW1zPy50bHM/LmVuYWJsZWQgPz8gREVGQVVMVF9PUFRJT05TLnRscy5lbmFibGVkKTtcbiAgY29uc3QgdGxzX2VuZm9yY2VkID0gISEocGFyYW1zPy50bHM/LmVuZm9yY2UgPz8gREVGQVVMVF9PUFRJT05TLnRscy5lbmZvcmNlKTtcblxuICBpZiAoIXRsc19lbmFibGVkICYmIHRsc19lbmZvcmNlZCkge1xuICAgIHRocm93IG5ldyBDb25uZWN0aW9uUGFyYW1zRXJyb3IoXG4gICAgICBcIkNhbid0IGVuZm9yY2UgVExTIHdoZW4gY2xpZW50IGhhcyBUTFMgZW5jcnlwdGlvbiBpcyBkaXNhYmxlZFwiLFxuICAgICk7XG4gIH1cblxuICAvLyBUT0RPXG4gIC8vIFBlcmhhcHMgdXNlcm5hbWUgc2hvdWxkIGJlIHRha2VuIGZyb20gdGhlIFBDIHVzZXIgYXMgYSBkZWZhdWx0P1xuICBjb25zdCBjb25uZWN0aW9uX29wdGlvbnMgPSB7XG4gICAgYXBwbGljYXRpb25OYW1lOiBwYXJhbXMuYXBwbGljYXRpb25OYW1lID8/IHBnRW52LmFwcGxpY2F0aW9uTmFtZSA/P1xuICAgICAgREVGQVVMVF9PUFRJT05TLmFwcGxpY2F0aW9uTmFtZSxcbiAgICBjb25uZWN0aW9uOiB7XG4gICAgICBhdHRlbXB0czogcGFyYW1zPy5jb25uZWN0aW9uPy5hdHRlbXB0cyA/P1xuICAgICAgICBERUZBVUxUX09QVElPTlMuY29ubmVjdGlvbi5hdHRlbXB0cyxcbiAgICAgIGludGVydmFsOiBwYXJhbXM/LmNvbm5lY3Rpb24/LmludGVydmFsID8/XG4gICAgICAgIERFRkFVTFRfT1BUSU9OUy5jb25uZWN0aW9uLmludGVydmFsLFxuICAgIH0sXG4gICAgZGF0YWJhc2U6IHBhcmFtcy5kYXRhYmFzZSA/PyBwZ0Vudi5kYXRhYmFzZSxcbiAgICBob3N0bmFtZTogaG9zdCxcbiAgICBob3N0X3R5cGUsXG4gICAgb3B0aW9ucyxcbiAgICBwYXNzd29yZDogcGFyYW1zLnBhc3N3b3JkID8/IHBnRW52LnBhc3N3b3JkLFxuICAgIHBvcnQsXG4gICAgdGxzOiB7XG4gICAgICBlbmFibGVkOiB0bHNfZW5hYmxlZCxcbiAgICAgIGVuZm9yY2U6IHRsc19lbmZvcmNlZCxcbiAgICAgIGNhQ2VydGlmaWNhdGVzOiBwYXJhbXM/LnRscz8uY2FDZXJ0aWZpY2F0ZXMgPz8gW10sXG4gICAgfSxcbiAgICB1c2VyOiBwYXJhbXMudXNlciA/PyBwZ0Vudi51c2VyLFxuICB9O1xuXG4gIGFzc2VydFJlcXVpcmVkT3B0aW9ucyhcbiAgICBjb25uZWN0aW9uX29wdGlvbnMsXG4gICAgW1wiYXBwbGljYXRpb25OYW1lXCIsIFwiZGF0YWJhc2VcIiwgXCJob3N0bmFtZVwiLCBcImhvc3RfdHlwZVwiLCBcInBvcnRcIiwgXCJ1c2VyXCJdLFxuICAgIGhhc19lbnZfYWNjZXNzLFxuICApO1xuXG4gIHJldHVybiBjb25uZWN0aW9uX29wdGlvbnM7XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsU0FBUyxrQkFBa0IsUUFBUSxvQkFBb0I7QUFDdkQsU0FBUyxxQkFBcUIsUUFBUSxxQkFBcUI7QUFDM0QsU0FBUyxXQUFXLEVBQUUsVUFBVSxRQUFRLGFBQWE7QUFvQnJEOzs7OztDQUtDLEdBQ0QsU0FBUyxXQUEwQjtJQUNqQyxPQUFPO1FBQ0wsaUJBQWlCLEtBQUssR0FBRyxDQUFDLEdBQUcsQ0FBQztRQUM5QixVQUFVLEtBQUssR0FBRyxDQUFDLEdBQUcsQ0FBQztRQUN2QixVQUFVLEtBQUssR0FBRyxDQUFDLEdBQUcsQ0FBQztRQUN2QixTQUFTLEtBQUssR0FBRyxDQUFDLEdBQUcsQ0FBQztRQUN0QixVQUFVLEtBQUssR0FBRyxDQUFDLEdBQUcsQ0FBQztRQUN2QixNQUFNLEtBQUssR0FBRyxDQUFDLEdBQUcsQ0FB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