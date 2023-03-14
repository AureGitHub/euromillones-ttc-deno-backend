/*!
 * Substantial parts adapted from https://github.com/brianc/node-postgres
 * which is licensed as follows:
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2010 - 2019 Brian Carlson
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * 'Software'), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */ import { bold, BufReader, BufWriter, delay, joinPath, yellow } from "../deps.ts";
import { DeferredStack } from "../utils/deferred.ts";
import { getSocketName, readUInt32BE } from "../utils/utils.ts";
import { PacketWriter } from "./packet.ts";
import { Message, parseBackendKeyMessage, parseCommandCompleteMessage, parseNoticeMessage, parseRowDataMessage, parseRowDescriptionMessage } from "./message.ts";
import { QueryArrayResult, QueryObjectResult, ResultType } from "../query/query.ts";
import * as scram from "./scram.ts";
import { ConnectionError, ConnectionParamsError, PostgresError } from "../client/error.ts";
import { AUTHENTICATION_TYPE, ERROR_MESSAGE, INCOMING_AUTHENTICATION_MESSAGES, INCOMING_QUERY_MESSAGES, INCOMING_TLS_MESSAGES } from "./message_code.ts";
import { hashMd5Password } from "./auth.ts";
function assertSuccessfulStartup(msg) {
    switch(msg.type){
        case ERROR_MESSAGE:
            throw new PostgresError(parseNoticeMessage(msg));
    }
}
function assertSuccessfulAuthentication(auth_message) {
    if (auth_message.type === ERROR_MESSAGE) {
        throw new PostgresError(parseNoticeMessage(auth_message));
    }
    if (auth_message.type !== INCOMING_AUTHENTICATION_MESSAGES.AUTHENTICATION) {
        throw new Error(`Unexpected auth response: ${auth_message.type}.`);
    }
    const responseCode = auth_message.reader.readInt32();
    if (responseCode !== 0) {
        throw new Error(`Unexpected auth response code: ${responseCode}.`);
    }
}
function logNotice(notice) {
    console.error(`${bold(yellow(notice.severity))}: ${notice.message}`);
}
const decoder = new TextDecoder();
const encoder = new TextEncoder();
// TODO
// - Refactor properties to not be lazily initialized
//   or to handle their undefined value
export class Connection {
    #bufReader;
    #bufWriter;
    #conn;
    connected = false;
    #connection_params;
    #message_header = new Uint8Array(5);
    #onDisconnection;
    #packetWriter = new PacketWriter();
    #pid;
    #queryLock = new DeferredStack(1, [
        undefined
    ]);
    // TODO
    // Find out what the secret key is for
    #secretKey;
    #tls;
    #transport;
    get pid() {
        return this.#pid;
    }
    /** Indicates if the connection is carried over TLS */ get tls() {
        return this.#tls;
    }
    /** Indicates the connection protocol used */ get transport() {
        return this.#transport;
    }
    constructor(connection_params, disconnection_callback){
        this.#connection_params = connection_params;
        this.#onDisconnection = disconnection_callback;
    }
    /**
   * Read single message sent by backend
   */ async #readMessage() {
        // Clear buffer before reading the message type
        this.#message_header.fill(0);
        await this.#bufReader.readFull(this.#message_header);
        const type = decoder.decode(this.#message_header.slice(0, 1));
        // TODO
        // Investigate if the ascii terminator is the best way to check for a broken
        // session
        if (type === "\x00") {
            // This error means that the database terminated the session without notifying
            // the library
            // TODO
            // This will be removed once we move to async handling of messages by the frontend
            // However, unnotified disconnection will remain a possibility, that will likely
            // be handled in another place
            throw new ConnectionError("The session was terminated unexpectedly");
        }
        const length = readUInt32BE(this.#message_header, 1) - 4;
        const body = new Uint8Array(length);
        await this.#bufReader.readFull(body);
        return new Message(type, length, body);
    }
    async #serverAcceptsTLS() {
        const writer = this.#packetWriter;
        writer.clear();
        writer.addInt32(8).addInt32(80877103).join();
        await this.#bufWriter.write(writer.flush());
        await this.#bufWriter.flush();
        const response = new Uint8Array(1);
        await this.#conn.read(response);
        switch(String.fromCharCode(response[0])){
            case INCOMING_TLS_MESSAGES.ACCEPTS_TLS:
                return true;
            case INCOMING_TLS_MESSAGES.NO_ACCEPTS_TLS:
                return false;
            default:
                throw new Error(`Could not check if server accepts SSL connections, server responded with: ${response}`);
        }
    }
    /** https://www.postgresql.org/docs/14/protocol-flow.html#id-1.10.5.7.3 */ async #sendStartupMessage() {
        const writer1 = this.#packetWriter;
        writer1.clear();
        // protocol version - 3.0, written as
        writer1.addInt16(3).addInt16(0);
        // explicitly set utf-8 encoding
        writer1.addCString("client_encoding").addCString("'utf-8'");
        // TODO: recognize other parameters
        writer1.addCString("user").addCString(this.#connection_params.user);
        writer1.addCString("database").addCString(this.#connection_params.database);
        writer1.addCString("application_name").addCString(this.#connection_params.applicationName);
        const connection_options = Object.entries(this.#connection_params.options);
        if (connection_options.length > 0) {
            // The database expects options in the --key=value
            writer1.addCString("options").addCString(connection_options.map(([key, value])=>`--${key}=${value}`).join(" "));
        }
        // terminator after all parameters were writter
        writer1.addCString("");
        const bodyBuffer = writer1.flush();
        const bodyLength = bodyBuffer.length + 4;
        writer1.clear();
        const finalBuffer = writer1.addInt32(bodyLength).add(bodyBuffer).join();
        await this.#bufWriter.write(finalBuffer);
        await this.#bufWriter.flush();
        return await this.#readMessage();
    }
    async #openConnection(options) {
        // @ts-ignore This will throw in runtime if the options passed to it are socket related and deno is running
        // on stable
        this.#conn = await Deno.connect(options);
        this.#bufWriter = new BufWriter(this.#conn);
        this.#bufReader = new BufReader(this.#conn);
    }
    async #openSocketConnection(path, port) {
        if (Deno.build.os === "windows") {
            throw new Error("Socket connection is only available on UNIX systems");
        }
        const socket = await Deno.stat(path);
        if (socket.isFile) {
            await this.#openConnection({
                path,
                transport: "unix"
            });
        } else {
            const socket_guess = joinPath(path, getSocketName(port));
            try {
                await this.#openConnection({
                    path: socket_guess,
                    transport: "unix"
                });
            } catch (e) {
                if (e instanceof Deno.errors.NotFound) {
                    throw new ConnectionError(`Could not open socket in path "${socket_guess}"`);
                }
                throw e;
            }
        }
    }
    async #openTlsConnection(connection, options1) {
        this.#conn = await Deno.startTls(connection, options1);
        this.#bufWriter = new BufWriter(this.#conn);
        this.#bufReader = new BufReader(this.#conn);
    }
    #resetConnectionMetadata() {
        this.connected = false;
        this.#packetWriter = new PacketWriter();
        this.#pid = undefined;
        this.#queryLock = new DeferredStack(1, [
            undefined
        ]);
        this.#secretKey = undefined;
        this.#tls = undefined;
        this.#transport = undefined;
    }
    #closeConnection() {
        try {
            this.#conn.close();
        } catch (_e) {
        // Swallow if the connection had errored or been closed beforehand
        } finally{
            this.#resetConnectionMetadata();
        }
    }
    async #startup() {
        this.#closeConnection();
        const { hostname , host_type , port: port1 , tls: { enabled: tls_enabled , enforce: tls_enforced , caCertificates  }  } = this.#connection_params;
        if (host_type === "socket") {
            await this.#openSocketConnection(hostname, port1);
            this.#tls = undefined;
            this.#transport = "socket";
        } else {
            // A BufWriter needs to be available in order to check if the server accepts TLS connections
            await this.#openConnection({
                hostname,
                port: port1,
                transport: "tcp"
            });
            this.#tls = false;
            this.#transport = "tcp";
            if (tls_enabled) {
                // If TLS is disabled, we don't even try to connect.
                const accepts_tls = await this.#serverAcceptsTLS().catch((e)=>{
                    // Make sure to close the connection if the TLS validation throws
                    this.#closeConnection();
                    throw e;
                });
                // https://www.postgresql.org/docs/14/protocol-flow.html#id-1.10.5.7.11
                if (accepts_tls) {
                    try {
                        await this.#openTlsConnection(this.#conn, {
                            hostname,
                            caCerts: caCertificates
                        });
                        this.#tls = true;
                    } catch (e1) {
                        if (!tls_enforced) {
                            console.error(bold(yellow("TLS connection failed with message: ")) + e1.message + "\n" + bold("Defaulting to non-encrypted connection"));
                            await this.#openConnection({
                                hostname,
                                port: port1,
                                transport: "tcp"
                            });
                            this.#tls = false;
                        } else {
                            throw e1;
                        }
                    }
                } else if (tls_enforced) {
                    // Make sure to close the connection before erroring
                    this.#closeConnection();
                    throw new Error("The server isn't accepting TLS connections. Change the client configuration so TLS configuration isn't required to connect");
                }
            }
        }
        try {
            let startup_response;
            try {
                startup_response = await this.#sendStartupMessage();
            } catch (e2) {
                // Make sure to close the connection before erroring or reseting
                this.#closeConnection();
                if (e2 instanceof Deno.errors.InvalidData && tls_enabled) {
                    if (tls_enforced) {
                        throw new Error("The certificate used to secure the TLS connection is invalid.");
                    } else {
                        console.error(bold(yellow("TLS connection failed with message: ")) + e2.message + "\n" + bold("Defaulting to non-encrypted connection"));
                        await this.#openConnection({
                            hostname,
                            port: port1,
                            transport: "tcp"
                        });
                        this.#tls = false;
                        this.#transport = "tcp";
                        startup_response = await this.#sendStartupMessage();
                    }
                } else {
                    throw e2;
                }
            }
            assertSuccessfulStartup(startup_response);
            await this.#authenticate(startup_response);
            // Handle connection status
            // Process connection initialization messages until connection returns ready
            let message = await this.#readMessage();
            while(message.type !== INCOMING_AUTHENTICATION_MESSAGES.READY){
                switch(message.type){
                    // Connection error (wrong database or user)
                    case ERROR_MESSAGE:
                        await this.#processErrorUnsafe(message, false);
                        break;
                    case INCOMING_AUTHENTICATION_MESSAGES.BACKEND_KEY:
                        {
                            const { pid , secret_key  } = parseBackendKeyMessage(message);
                            this.#pid = pid;
                            this.#secretKey = secret_key;
                            break;
                        }
                    case INCOMING_AUTHENTICATION_MESSAGES.PARAMETER_STATUS:
                        break;
                    default:
                        throw new Error(`Unknown response for startup: ${message.type}`);
                }
                message = await this.#readMessage();
            }
            this.connected = true;
        } catch (e3) {
            this.#closeConnection();
            throw e3;
        }
    }
    /**
   * Calling startup on a connection twice will create a new session and overwrite the previous one
   *
   * @param is_reconnection This indicates whether the startup should behave as if there was
   * a connection previously established, or if it should attempt to create a connection first
   *
   * https://www.postgresql.org/docs/14/protocol-flow.html#id-1.10.5.7.3
   */ async startup(is_reconnection) {
        if (is_reconnection && this.#connection_params.connection.attempts === 0) {
            throw new Error("The client has been disconnected from the database. Enable reconnection in the client to attempt reconnection after failure");
        }
        let reconnection_attempts = 0;
        const max_reconnections = this.#connection_params.connection.attempts;
        let error;
        // If no connection has been established and the reconnection attempts are
        // set to zero, attempt to connect at least once
        if (!is_reconnection && this.#connection_params.connection.attempts === 0) {
            try {
                await this.#startup();
            } catch (e) {
                error = e;
            }
        } else {
            let interval = typeof this.#connection_params.connection.interval === "number" ? this.#connection_params.connection.interval : 0;
            while(reconnection_attempts < max_reconnections){
                // Don't wait for the interval on the first connection
                if (reconnection_attempts > 0) {
                    if (typeof this.#connection_params.connection.interval === "function") {
                        interval = this.#connection_params.connection.interval(interval);
                    }
                    if (interval > 0) {
                        await delay(interval);
                    }
                }
                try {
                    await this.#startup();
                    break;
                } catch (e1) {
                    // TODO
                    // Eventually distinguish between connection errors and normal errors
                    reconnection_attempts++;
                    if (reconnection_attempts === max_reconnections) {
                        error = e1;
                    }
                }
            }
        }
        if (error) {
            await this.end();
            throw error;
        }
    }
    /**
   * Will attempt to authenticate with the database using the provided
   * password credentials
   */ async #authenticate(authentication_request) {
        const authentication_type = authentication_request.reader.readInt32();
        let authentication_result;
        switch(authentication_type){
            case AUTHENTICATION_TYPE.NO_AUTHENTICATION:
                authentication_result = authentication_request;
                break;
            case AUTHENTICATION_TYPE.CLEAR_TEXT:
                authentication_result = await this.#authenticateWithClearPassword();
                break;
            case AUTHENTICATION_TYPE.MD5:
                {
                    const salt = authentication_request.reader.readBytes(4);
                    authentication_result = await this.#authenticateWithMd5(salt);
                    break;
                }
            case AUTHENTICATION_TYPE.SCM:
                throw new Error("Database server expected SCM authentication, which is not supported at the moment");
            case AUTHENTICATION_TYPE.GSS_STARTUP:
                throw new Error("Database server expected GSS authentication, which is not supported at the moment");
            case AUTHENTICATION_TYPE.GSS_CONTINUE:
                throw new Error("Database server expected GSS authentication, which is not supported at the moment");
            case AUTHENTICATION_TYPE.SSPI:
                throw new Error("Database server expected SSPI authentication, which is not supported at the moment");
            case AUTHENTICATION_TYPE.SASL_STARTUP:
                authentication_result = await this.#authenticateWithSasl();
                break;
            default:
                throw new Error(`Unknown auth message code ${authentication_type}`);
        }
        await assertSuccessfulAuthentication(authentication_result);
    }
    async #authenticateWithClearPassword() {
        this.#packetWriter.clear();
        const password = this.#connection_params.password || "";
        const buffer = this.#packetWriter.addCString(password).flush(0x70);
        await this.#bufWriter.write(buffer);
        await this.#bufWriter.flush();
        return this.#readMessage();
    }
    async #authenticateWithMd5(salt1) {
        this.#packetWriter.clear();
        if (!this.#connection_params.password) {
            throw new ConnectionParamsError("Attempting MD5 authentication with unset password");
        }
        const password1 = await hashMd5Password(this.#connection_params.password, this.#connection_params.user, salt1);
        const buffer1 = this.#packetWriter.addCString(password1).flush(0x70);
        await this.#bufWriter.write(buffer1);
        await this.#bufWriter.flush();
        return this.#readMessage();
    }
    /**
   * https://www.postgresql.org/docs/14/sasl-authentication.html
   */ async #authenticateWithSasl() {
        if (!this.#connection_params.password) {
            throw new ConnectionParamsError("Attempting SASL auth with unset password");
        }
        const client = new scram.Client(this.#connection_params.user, this.#connection_params.password);
        const utf8 = new TextDecoder("utf-8");
        // SASLInitialResponse
        const clientFirstMessage = client.composeChallenge();
        this.#packetWriter.clear();
        this.#packetWriter.addCString("SCRAM-SHA-256");
        this.#packetWriter.addInt32(clientFirstMessage.length);
        this.#packetWriter.addString(clientFirstMessage);
        this.#bufWriter.write(this.#packetWriter.flush(0x70));
        this.#bufWriter.flush();
        const maybe_sasl_continue = await this.#readMessage();
        switch(maybe_sasl_continue.type){
            case INCOMING_AUTHENTICATION_MESSAGES.AUTHENTICATION:
                {
                    const authentication_type1 = maybe_sasl_continue.reader.readInt32();
                    if (authentication_type1 !== AUTHENTICATION_TYPE.SASL_CONTINUE) {
                        throw new Error(`Unexpected authentication type in SASL negotiation: ${authentication_type1}`);
                    }
                    break;
                }
            case ERROR_MESSAGE:
                throw new PostgresError(parseNoticeMessage(maybe_sasl_continue));
            default:
                throw new Error(`Unexpected message in SASL negotiation: ${maybe_sasl_continue.type}`);
        }
        const sasl_continue = utf8.decode(maybe_sasl_continue.reader.readAllBytes());
        await client.receiveChallenge(sasl_continue);
        this.#packetWriter.clear();
        this.#packetWriter.addString(await client.composeResponse());
        this.#bufWriter.write(this.#packetWriter.flush(0x70));
        this.#bufWriter.flush();
        const maybe_sasl_final = await this.#readMessage();
        switch(maybe_sasl_final.type){
            case INCOMING_AUTHENTICATION_MESSAGES.AUTHENTICATION:
                {
                    const authentication_type2 = maybe_sasl_final.reader.readInt32();
                    if (authentication_type2 !== AUTHENTICATION_TYPE.SASL_FINAL) {
                        throw new Error(`Unexpected authentication type in SASL finalization: ${authentication_type2}`);
                    }
                    break;
                }
            case ERROR_MESSAGE:
                throw new PostgresError(parseNoticeMessage(maybe_sasl_final));
            default:
                throw new Error(`Unexpected message in SASL finalization: ${maybe_sasl_continue.type}`);
        }
        const sasl_final = utf8.decode(maybe_sasl_final.reader.readAllBytes());
        await client.receiveResponse(sasl_final);
        // Return authentication result
        return this.#readMessage();
    }
    async #simpleQuery(query) {
        this.#packetWriter.clear();
        const buffer2 = this.#packetWriter.addCString(query.text).flush(0x51);
        await this.#bufWriter.write(buffer2);
        await this.#bufWriter.flush();
        let result;
        if (query.result_type === ResultType.ARRAY) {
            result = new QueryArrayResult(query);
        } else {
            result = new QueryObjectResult(query);
        }
        let error;
        let current_message = await this.#readMessage();
        // Process messages until ready signal is sent
        // Delay error handling until after the ready signal is sent
        while(current_message.type !== INCOMING_QUERY_MESSAGES.READY){
            switch(current_message.type){
                case ERROR_MESSAGE:
                    error = new PostgresError(parseNoticeMessage(current_message));
                    break;
                case INCOMING_QUERY_MESSAGES.COMMAND_COMPLETE:
                    {
                        result.handleCommandComplete(parseCommandCompleteMessage(current_message));
                        break;
                    }
                case INCOMING_QUERY_MESSAGES.DATA_ROW:
                    {
                        const row_data = parseRowDataMessage(current_message);
                        try {
                            result.insertRow(row_data);
                        } catch (e4) {
                            error = e4;
                        }
                        break;
                    }
                case INCOMING_QUERY_MESSAGES.EMPTY_QUERY:
                    break;
                case INCOMING_QUERY_MESSAGES.NOTICE_WARNING:
                    {
                        const notice = parseNoticeMessage(current_message);
                        logNotice(notice);
                        result.warnings.push(notice);
                        break;
                    }
                case INCOMING_QUERY_MESSAGES.PARAMETER_STATUS:
                    break;
                case INCOMING_QUERY_MESSAGES.READY:
                    break;
                case INCOMING_QUERY_MESSAGES.ROW_DESCRIPTION:
                    {
                        result.loadColumnDescriptions(parseRowDescriptionMessage(current_message));
                        break;
                    }
                default:
                    throw new Error(`Unexpected simple query message: ${current_message.type}`);
            }
            current_message = await this.#readMessage();
        }
        if (error) throw error;
        return result;
    }
    async #appendQueryToMessage(query1) {
        this.#packetWriter.clear();
        const buffer3 = this.#packetWriter.addCString("") // TODO: handle named queries (config.name)
        .addCString(query1.text).addInt16(0).flush(0x50);
        await this.#bufWriter.write(buffer3);
    }
    async #appendArgumentsToMessage(query2) {
        this.#packetWriter.clear();
        const hasBinaryArgs = query2.args.some((arg)=>arg instanceof Uint8Array);
        // bind statement
        this.#packetWriter.clear();
        this.#packetWriter.addCString("") // TODO: unnamed portal
        .addCString(""); // TODO: unnamed prepared statement
        if (hasBinaryArgs) {
            this.#packetWriter.addInt16(query2.args.length);
            query2.args.forEach((arg)=>{
                this.#packetWriter.addInt16(arg instanceof Uint8Array ? 1 : 0);
            });
        } else {
            this.#packetWriter.addInt16(0);
        }
        this.#packetWriter.addInt16(query2.args.length);
        query2.args.forEach((arg)=>{
            if (arg === null || typeof arg === "undefined") {
                this.#packetWriter.addInt32(-1);
            } else if (arg instanceof Uint8Array) {
                this.#packetWriter.addInt32(arg.length);
                this.#packetWriter.add(arg);
            } else {
                const byteLength = encoder.encode(arg).length;
                this.#packetWriter.addInt32(byteLength);
                this.#packetWriter.addString(arg);
            }
        });
        this.#packetWriter.addInt16(0);
        const buffer4 = this.#packetWriter.flush(0x42);
        await this.#bufWriter.write(buffer4);
    }
    /**
   * This function appends the query type (in this case prepared statement)
   * to the message
   */ async #appendDescribeToMessage() {
        this.#packetWriter.clear();
        const buffer5 = this.#packetWriter.addCString("P").flush(0x44);
        await this.#bufWriter.write(buffer5);
    }
    async #appendExecuteToMessage() {
        this.#packetWriter.clear();
        const buffer6 = this.#packetWriter.addCString("") // unnamed portal
        .addInt32(0).flush(0x45);
        await this.#bufWriter.write(buffer6);
    }
    async #appendSyncToMessage() {
        this.#packetWriter.clear();
        const buffer7 = this.#packetWriter.flush(0x53);
        await this.#bufWriter.write(buffer7);
    }
    // TODO
    // Rename process function to a more meaningful name and move out of class
    async #processErrorUnsafe(msg, recoverable = true) {
        const error1 = new PostgresError(parseNoticeMessage(msg));
        if (recoverable) {
            let maybe_ready_message = await this.#readMessage();
            while(maybe_ready_message.type !== INCOMING_QUERY_MESSAGES.READY){
                maybe_ready_message = await this.#readMessage();
            }
        }
        throw error1;
    }
    /**
   * https://www.postgresql.org/docs/14/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY
   */ async #preparedQuery(query3) {
        // The parse messages declares the statement, query arguments and the cursor used in the transaction
        // The database will respond with a parse response
        await this.#appendQueryToMessage(query3);
        await this.#appendArgumentsToMessage(query3);
        // The describe message will specify the query type and the cursor in which the current query will be running
        // The database will respond with a bind response
        await this.#appendDescribeToMessage();
        // The execute response contains the portal in which the query will be run and how many rows should it return
        await this.#appendExecuteToMessage();
        await this.#appendSyncToMessage();
        // send all messages to backend
        await this.#bufWriter.flush();
        let result1;
        if (query3.result_type === ResultType.ARRAY) {
            result1 = new QueryArrayResult(query3);
        } else {
            result1 = new QueryObjectResult(query3);
        }
        let error2;
        let current_message1 = await this.#readMessage();
        while(current_message1.type !== INCOMING_QUERY_MESSAGES.READY){
            switch(current_message1.type){
                case ERROR_MESSAGE:
                    {
                        error2 = new PostgresError(parseNoticeMessage(current_message1));
                        break;
                    }
                case INCOMING_QUERY_MESSAGES.BIND_COMPLETE:
                    break;
                case INCOMING_QUERY_MESSAGES.COMMAND_COMPLETE:
                    {
                        result1.handleCommandComplete(parseCommandCompleteMessage(current_message1));
                        break;
                    }
                case INCOMING_QUERY_MESSAGES.DATA_ROW:
                    {
                        const row_data1 = parseRowDataMessage(current_message1);
                        try {
                            result1.insertRow(row_data1);
                        } catch (e5) {
                            error2 = e5;
                        }
                        break;
                    }
                case INCOMING_QUERY_MESSAGES.NO_DATA:
                    break;
                case INCOMING_QUERY_MESSAGES.NOTICE_WARNING:
                    {
                        const notice1 = parseNoticeMessage(current_message1);
                        logNotice(notice1);
                        result1.warnings.push(notice1);
                        break;
                    }
                case INCOMING_QUERY_MESSAGES.PARAMETER_STATUS:
                    break;
                case INCOMING_QUERY_MESSAGES.PARSE_COMPLETE:
                    break;
                case INCOMING_QUERY_MESSAGES.ROW_DESCRIPTION:
                    {
                        result1.loadColumnDescriptions(parseRowDescriptionMessage(current_message1));
                        break;
                    }
                default:
                    throw new Error(`Unexpected prepared query message: ${current_message1.type}`);
            }
            current_message1 = await this.#readMessage();
        }
        if (error2) throw error2;
        return result1;
    }
    async query(query) {
        if (!this.connected) {
            await this.startup(true);
        }
        await this.#queryLock.pop();
        try {
            if (query.args.length === 0) {
                return await this.#simpleQuery(query);
            } else {
                return await this.#preparedQuery(query);
            }
        } catch (e) {
            if (e instanceof ConnectionError) {
                await this.end();
            }
            throw e;
        } finally{
            this.#queryLock.push(undefined);
        }
    }
    async end() {
        if (this.connected) {
            const terminationMessage = new Uint8Array([
                0x58,
                0x00,
                0x00,
                0x00,
                0x04
            ]);
            await this.#bufWriter.write(terminationMessage);
            try {
                await this.#bufWriter.flush();
            } catch (_e) {
            // This steps can fail if the underlying connection was closed ungracefully
            } finally{
                this.#closeConnection();
                this.#onDisconnection();
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvcG9zdGdyZXNAdjAuMTcuMC9jb25uZWN0aW9uL2Nvbm5lY3Rpb24udHMiXSwic291cmNlc0NvbnRlbnQiOlsiLyohXG4gKiBTdWJzdGFudGlhbCBwYXJ0cyBhZGFwdGVkIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL2JyaWFuYy9ub2RlLXBvc3RncmVzXG4gKiB3aGljaCBpcyBsaWNlbnNlZCBhcyBmb2xsb3dzOlxuICpcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCAtIDIwMTkgQnJpYW4gQ2FybHNvblxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZ1xuICogYSBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4gKiAnU29mdHdhcmUnKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4gKiB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4gKiBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG9cbiAqIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0b1xuICogdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuICpcbiAqIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlXG4gKiBpbmNsdWRlZCBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbiAqXG4gKiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgJ0FTIElTJywgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCxcbiAqIEVYUFJFU1MgT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuICogTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULlxuICogSU4gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTllcbiAqIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsXG4gKiBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRVxuICogU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG4gKi9cblxuaW1wb3J0IHtcbiAgYm9sZCxcbiAgQnVmUmVhZGVyLFxuICBCdWZXcml0ZXIsXG4gIGRlbGF5LFxuICBqb2luUGF0aCxcbiAgeWVsbG93LFxufSBmcm9tIFwiLi4vZGVwcy50c1wiO1xuaW1wb3J0IHsgRGVmZXJyZWRTdGFjayB9IGZyb20gXCIuLi91dGlscy9kZWZlcnJlZC50c1wiO1xuaW1wb3J0IHsgZ2V0U29ja2V0TmFtZSwgcmVhZFVJbnQzMkJFIH0gZnJvbSBcIi4uL3V0aWxzL3V0aWxzLnRzXCI7XG5pbXBvcnQgeyBQYWNrZXRXcml0ZXIgfSBmcm9tIFwiLi9wYWNrZXQudHNcIjtcbmltcG9ydCB7XG4gIE1lc3NhZ2UsXG4gIHR5cGUgTm90aWNlLFxuICBwYXJzZUJhY2tlbmRLZXlNZXNzYWdlLFxuICBwYXJzZUNvbW1hbmRDb21wbGV0ZU1lc3NhZ2UsXG4gIHBhcnNlTm90aWNlTWVzc2FnZSxcbiAgcGFyc2VSb3dEYXRhTWVzc2FnZSxcbiAgcGFyc2VSb3dEZXNjcmlwdGlvbk1lc3NhZ2UsXG59IGZyb20gXCIuL21lc3NhZ2UudHNcIjtcbmltcG9ydCB7XG4gIHR5cGUgUXVlcnksXG4gIFF1ZXJ5QXJyYXlSZXN1bHQsXG4gIFF1ZXJ5T2JqZWN0UmVzdWx0LFxuICB0eXBlIFF1ZXJ5UmVzdWx0LFxuICBSZXN1bHRUeXBlLFxufSBmcm9tIFwiLi4vcXVlcnkvcXVlcnkudHNcIjtcbmltcG9ydCB7IHR5cGUgQ2xpZW50Q29uZmlndXJhdGlvbiB9IGZyb20gXCIuL2Nvbm5lY3Rpb25fcGFyYW1zLnRzXCI7XG5pbXBvcnQgKiBhcyBzY3JhbSBmcm9tIFwiLi9zY3JhbS50c1wiO1xuaW1wb3J0IHtcbiAgQ29ubmVjdGlvbkVycm9yLFxuICBDb25uZWN0aW9uUGFyYW1zRXJyb3IsXG4gIFBvc3RncmVzRXJyb3IsXG59IGZyb20gXCIuLi9jbGllbnQvZXJyb3IudHNcIjtcbmltcG9ydCB7XG4gIEFVVEhFTlRJQ0FUSU9OX1RZUEUsXG4gIEVSUk9SX01FU1NBR0UsXG4gIElOQ09NSU5HX0FVVEhFTlRJQ0FUSU9OX01FU1NBR0VTLFxuICBJTkNPTUlOR19RVUVSWV9NRVNTQUdFUyxcbiAgSU5DT01JTkdfVExTX01FU1NBR0VTLFxufSBmcm9tIFwiLi9tZXNzYWdlX2NvZGUudHNcIjtcbmltcG9ydCB7IGhhc2hNZDVQYXNzd29yZCB9IGZyb20gXCIuL2F1dGgudHNcIjtcblxuLy8gV29yayBhcm91bmQgdW5zdGFibGUgbGltaXRhdGlvblxudHlwZSBDb25uZWN0T3B0aW9ucyA9XG4gIHwgeyBob3N0bmFtZTogc3RyaW5nOyBwb3J0OiBudW1iZXI7IHRyYW5zcG9ydDogXCJ0Y3BcIiB9XG4gIHwgeyBwYXRoOiBzdHJpbmc7IHRyYW5zcG9ydDogXCJ1bml4XCIgfTtcblxuZnVuY3Rpb24gYXNzZXJ0U3VjY2Vzc2Z1bFN0YXJ0dXAobXNnOiBNZXNzYWdlKSB7XG4gIHN3aXRjaCAobXNnLnR5cGUpIHtcbiAgICBjYXNlIEVSUk9SX01FU1NBR0U6XG4gICAgICB0aHJvdyBuZXcgUG9zdGdyZXNFcnJvcihwYXJzZU5vdGljZU1lc3NhZ2UobXNnKSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gYXNzZXJ0U3VjY2Vzc2Z1bEF1dGhlbnRpY2F0aW9uKGF1dGhfbWVzc2FnZTogTWVzc2FnZSkge1xuICBpZiAoYXV0aF9tZXNzYWdlLnR5cGUgPT09IEVSUk9SX01FU1NBR0UpIHtcbiAgICB0aHJvdyBuZXcgUG9zdGdyZXNFcnJvcihwYXJzZU5vdGljZU1lc3NhZ2UoYXV0aF9tZXNzYWdlKSk7XG4gIH1cblxuICBpZiAoXG4gICAgYXV0aF9tZXNzYWdlLnR5cGUgIT09IElOQ09NSU5HX0FVVEhFTlRJQ0FUSU9OX01FU1NBR0VTLkFVVEhFTlRJQ0FUSU9OXG4gICkge1xuICAgIHRocm93IG5ldyBFcnJvcihgVW5leHBlY3RlZCBhdXRoIHJlc3BvbnNlOiAke2F1dGhfbWVzc2FnZS50eXBlfS5gKTtcbiAgfVxuXG4gIGNvbnN0IHJlc3BvbnNlQ29kZSA9IGF1dGhfbWVzc2FnZS5yZWFkZXIucmVhZEludDMyKCk7XG4gIGlmIChyZXNwb25zZUNvZGUgIT09IDApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFVuZXhwZWN0ZWQgYXV0aCByZXNwb25zZSBjb2RlOiAke3Jlc3BvbnNlQ29kZX0uYCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gbG9nTm90aWNlKG5vdGljZTogTm90aWNlKSB7XG4gIGNvbnNvbGUuZXJyb3IoYCR7Ym9sZCh5ZWxsb3cobm90aWNlLnNldmVyaXR5KSl9OiAke25vdGljZS5tZXNzYWdlfWApO1xufVxuXG5jb25zdCBkZWNvZGVyID0gbmV3IFRleHREZWNvZGVyKCk7XG5jb25zdCBlbmNvZGVyID0gbmV3IFRleHRFbmNvZGVyKCk7XG5cbi8vIFRPRE9cbi8vIC0gUmVmYWN0b3IgcHJvcGVydGllcyB0byBub3QgYmUgbGF6aWx5IGluaXRpYWxpemVkXG4vLyAgIG9yIHRvIGhhbmRsZSB0aGVpciB1bmRlZmluZWQgdmFsdWVcbmV4cG9ydCBjbGFzcyBDb25uZWN0aW9uIHtcbiAgI2J1ZlJlYWRlciE6IEJ1ZlJlYWRlcjtcbiAgI2J1ZldyaXRlciE6IEJ1ZldyaXRlcjtcbiAgI2Nvbm4hOiBEZW5vLkNvbm47XG4gIGNvbm5lY3RlZCA9IGZhbHNlO1xuICAjY29ubmVjdGlvbl9wYXJhbXM6IENsaWVudENvbmZpZ3VyYXRpb247XG4gICNtZXNzYWdlX2hlYWRlciA9IG5ldyBVaW50OEFycmF5KDUpO1xuICAjb25EaXNjb25uZWN0aW9uOiAoKSA9PiBQcm9taXNlPHZvaWQ+O1xuICAjcGFja2V0V3JpdGVyID0gbmV3IFBhY2tldFdyaXRlcigpO1xuICAjcGlkPzogbnVtYmVyO1xuICAjcXVlcnlMb2NrOiBEZWZlcnJlZFN0YWNrPHVuZGVmaW5lZD4gPSBuZXcgRGVmZXJyZWRTdGFjayhcbiAgICAxLFxuICAgIFt1bmRlZmluZWRdLFxuICApO1xuICAvLyBUT0RPXG4gIC8vIEZpbmQgb3V0IHdoYXQgdGhlIHNlY3JldCBrZXkgaXMgZm9yXG4gICNzZWNyZXRLZXk/OiBudW1iZXI7XG4gICN0bHM/OiBib29sZWFuO1xuICAjdHJhbnNwb3J0PzogXCJ0Y3BcIiB8IFwic29ja2V0XCI7XG5cbiAgZ2V0IHBpZCgpIHtcbiAgICByZXR1cm4gdGhpcy4jcGlkO1xuICB9XG5cbiAgLyoqIEluZGljYXRlcyBpZiB0aGUgY29ubmVjdGlvbiBpcyBjYXJyaWVkIG92ZXIgVExTICovXG4gIGdldCB0bHMoKSB7XG4gICAgcmV0dXJuIHRoaXMuI3RscztcbiAgfVxuXG4gIC8qKiBJbmRpY2F0ZXMgdGhlIGNvbm5lY3Rpb24gcHJvdG9jb2wgdXNlZCAqL1xuICBnZXQgdHJhbnNwb3J0KCkge1xuICAgIHJldHVybiB0aGlzLiN0cmFuc3BvcnQ7XG4gIH1cblxuICBjb25zdHJ1Y3RvcihcbiAgICBjb25uZWN0aW9uX3BhcmFtczogQ2xpZW50Q29uZmlndXJhdGlvbixcbiAgICBkaXNjb25uZWN0aW9uX2NhbGxiYWNrOiAoKSA9PiBQcm9taXNlPHZvaWQ+LFxuICApIHtcbiAgICB0aGlzLiNjb25uZWN0aW9uX3BhcmFtcyA9IGNvbm5lY3Rpb25fcGFyYW1zO1xuICAgIHRoaXMuI29uRGlzY29ubmVjdGlvbiA9IGRpc2Nvbm5lY3Rpb25fY2FsbGJhY2s7XG4gIH1cblxuICAvKipcbiAgICogUmVhZCBzaW5nbGUgbWVzc2FnZSBzZW50IGJ5IGJhY2tlbmRcbiAgICovXG4gIGFzeW5jICNyZWFkTWVzc2FnZSgpOiBQcm9taXNlPE1lc3NhZ2U+IHtcbiAgICAvLyBDbGVhciBidWZmZXIgYmVmb3JlIHJlYWRpbmcgdGhlIG1lc3NhZ2UgdHlwZVxuICAgIHRoaXMuI21lc3NhZ2VfaGVhZGVyLmZpbGwoMCk7XG4gICAgYXdhaXQgdGhpcy4jYnVmUmVhZGVyLnJlYWRGdWxsKHRoaXMuI21lc3NhZ2VfaGVhZGVyKTtcbiAgICBjb25zdCB0eXBlID0gZGVjb2Rlci5kZWNvZGUodGhpcy4jbWVzc2FnZV9oZWFkZXIuc2xpY2UoMCwgMSkpO1xuICAgIC8vIFRPRE9cbiAgICAvLyBJbnZlc3RpZ2F0ZSBpZiB0aGUgYXNjaWkgdGVybWluYXRvciBpcyB0aGUgYmVzdCB3YXkgdG8gY2hlY2sgZm9yIGEgYnJva2VuXG4gICAgLy8gc2Vzc2lvblxuICAgIGlmICh0eXBlID09PSBcIlxceDAwXCIpIHtcbiAgICAgIC8vIFRoaXMgZXJyb3IgbWVhbnMgdGhhdCB0aGUgZGF0YWJhc2UgdGVybWluYXRlZCB0aGUgc2Vzc2lvbiB3aXRob3V0IG5vdGlmeWluZ1xuICAgICAgLy8gdGhlIGxpYnJhcnlcbiAgICAgIC8vIFRPRE9cbiAgICAgIC8vIFRoaXMgd2lsbCBiZSByZW1vdmVkIG9uY2Ugd2UgbW92ZSB0byBhc3luYyBoYW5kbGluZyBvZiBtZXNzYWdlcyBieSB0aGUgZnJvbnRlbmRcbiAgICAgIC8vIEhvd2V2ZXIsIHVubm90aWZpZWQgZGlzY29ubmVjdGlvbiB3aWxsIHJlbWFpbiBhIHBvc3NpYmlsaXR5LCB0aGF0IHdpbGwgbGlrZWx5XG4gICAgICAvLyBiZSBoYW5kbGVkIGluIGFub3RoZXIgcGxhY2VcbiAgICAgIHRocm93IG5ldyBDb25uZWN0aW9uRXJyb3IoXCJUaGUgc2Vzc2lvbiB3YXMgdGVybWluYXRlZCB1bmV4cGVjdGVkbHlcIik7XG4gICAgfVxuICAgIGNvbnN0IGxlbmd0aCA9IHJlYWRVSW50MzJCRSh0aGlzLiNtZXNzYWdlX2hlYWRlciwgMSkgLSA0O1xuICAgIGNvbnN0IGJvZHkgPSBuZXcgVWludDhBcnJheShsZW5ndGgpO1xuICAgIGF3YWl0IHRoaXMuI2J1ZlJlYWRlci5yZWFkRnVsbChib2R5KTtcblxuICAgIHJldHVybiBuZXcgTWVzc2FnZSh0eXBlLCBsZW5ndGgsIGJvZHkpO1xuICB9XG5cbiAgYXN5bmMgI3NlcnZlckFjY2VwdHNUTFMoKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3Qgd3JpdGVyID0gdGhpcy4jcGFja2V0V3JpdGVyO1xuICAgIHdyaXRlci5jbGVhcigpO1xuICAgIHdyaXRlclxuICAgICAgLmFkZEludDMyKDgpXG4gICAgICAuYWRkSW50MzIoODA4NzcxMDMpXG4gICAgICAuam9pbigpO1xuXG4gICAgYXdhaXQgdGhpcy4jYnVmV3JpdGVyLndyaXRlKHdyaXRlci5mbHVzaCgpKTtcbiAgICBhd2FpdCB0aGlzLiNidWZXcml0ZXIuZmx1c2goKTtcblxuICAgIGNvbnN0IHJlc3BvbnNlID0gbmV3IFVpbnQ4QXJyYXkoMSk7XG4gICAgYXdhaXQgdGhpcy4jY29ubi5yZWFkKHJlc3BvbnNlKTtcblxuICAgIHN3aXRjaCAoU3RyaW5nLmZyb21DaGFyQ29kZShyZXNwb25zZVswXSkpIHtcbiAgICAgIGNhc2UgSU5DT01JTkdfVExTX01FU1NBR0VTLkFDQ0VQVFNfVExTOlxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIGNhc2UgSU5DT01JTkdfVExTX01FU1NBR0VTLk5PX0FDQ0VQVFNfVExTOlxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgYENvdWxkIG5vdCBjaGVjayBpZiBzZXJ2ZXIgYWNjZXB0cyBTU0wgY29ubmVjdGlvbnMsIHNlcnZlciByZXNwb25kZWQgd2l0aDogJHtyZXNwb25zZX1gLFxuICAgICAgICApO1xuICAgIH1cbiAgfVxuXG4gIC8qKiBodHRwczovL3d3dy5wb3N0Z3Jlc3FsLm9yZy9kb2NzLzE0L3Byb3RvY29sLWZsb3cuaHRtbCNpZC0xLjEwLjUuNy4zICovXG4gIGFzeW5jICNzZW5kU3RhcnR1cE1lc3NhZ2UoKTogUHJvbWlzZTxNZXNzYWdlPiB7XG4gICAgY29uc3Qgd3JpdGVyID0gdGhpcy4jcGFja2V0V3JpdGVyO1xuICAgIHdyaXRlci5jbGVhcigpO1xuXG4gICAgLy8gcHJvdG9jb2wgdmVyc2lvbiAtIDMuMCwgd3JpdHRlbiBhc1xuICAgIHdyaXRlci5hZGRJbnQxNigzKS5hZGRJbnQxNigwKTtcbiAgICAvLyBleHBsaWNpdGx5IHNldCB1dGYtOCBlbmNvZGluZ1xuICAgIHdyaXRlci5hZGRDU3RyaW5nKFwiY2xpZW50X2VuY29kaW5nXCIpLmFkZENTdHJpbmcoXCIndXRmLTgnXCIpO1xuXG4gICAgLy8gVE9ETzogcmVjb2duaXplIG90aGVyIHBhcmFtZXRlcnNcbiAgICB3cml0ZXIuYWRkQ1N0cmluZyhcInVzZXJcIikuYWRkQ1N0cmluZyh0aGlzLiNjb25uZWN0aW9uX3BhcmFtcy51c2VyKTtcbiAgICB3cml0ZXIuYWRkQ1N0cmluZyhcImRhdGFiYXNlXCIpLmFkZENTdHJpbmcodGhpcy4jY29ubmVjdGlvbl9wYXJhbXMuZGF0YWJhc2UpO1xuICAgIHdyaXRlci5hZGRDU3RyaW5nKFwiYXBwbGljYXRpb25fbmFtZVwiKS5hZGRDU3RyaW5nKFxuICAgICAgdGhpcy4jY29ubmVjdGlvbl9wYXJhbXMuYXBwbGljYXRpb25OYW1lLFxuICAgICk7XG5cbiAgICBjb25zdCBjb25uZWN0aW9uX29wdGlvbnMgPSBPYmplY3QuZW50cmllcyh0aGlzLiNjb25uZWN0aW9uX3BhcmFtcy5vcHRpb25zKTtcbiAgICBpZiAoY29ubmVjdGlvbl9vcHRpb25zLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIFRoZSBkYXRhYmFzZSBleHBlY3RzIG9wdGlvbnMgaW4gdGhlIC0ta2V5PXZhbHVlXG4gICAgICB3cml0ZXIuYWRkQ1N0cmluZyhcIm9wdGlvbnNcIikuYWRkQ1N0cmluZyhcbiAgICAgICAgY29ubmVjdGlvbl9vcHRpb25zLm1hcCgoW2tleSwgdmFsdWVdKSA9PiBgLS0ke2tleX09JHt2YWx1ZX1gKS5qb2luKFwiIFwiKSxcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gdGVybWluYXRvciBhZnRlciBhbGwgcGFyYW1ldGVycyB3ZXJlIHdyaXR0ZXJcbiAgICB3cml0ZXIuYWRkQ1N0cmluZyhcIlwiKTtcblxuICAgIGNvbnN0IGJvZHlCdWZmZXIgPSB3cml0ZXIuZmx1c2goKTtcbiAgICBjb25zdCBib2R5TGVuZ3RoID0gYm9keUJ1ZmZlci5sZW5ndGggKyA0O1xuXG4gICAgd3JpdGVyLmNsZWFyKCk7XG5cbiAgICBjb25zdCBmaW5hbEJ1ZmZlciA9IHdyaXRlclxuICAgICAgLmFkZEludDMyKGJvZHlMZW5ndGgpXG4gICAgICAuYWRkKGJvZHlCdWZmZXIpXG4gICAgICAuam9pbigpO1xuXG4gICAgYXdhaXQgdGhpcy4jYnVmV3JpdGVyLndyaXRlKGZpbmFsQnVmZmVyKTtcbiAgICBhd2FpdCB0aGlzLiNidWZXcml0ZXIuZmx1c2goKTtcblxuICAgIHJldHVybiBhd2FpdCB0aGlzLiNyZWFkTWVzc2FnZSgpO1xuICB9XG5cbiAgYXN5bmMgI29wZW5Db25uZWN0aW9uKG9wdGlvbnM6IENvbm5lY3RPcHRpb25zKSB7XG4gICAgLy8gQHRzLWlnbm9yZSBUaGlzIHdpbGwgdGhyb3cgaW4gcnVudGltZSBpZiB0aGUgb3B0aW9ucyBwYXNzZWQgdG8gaXQgYXJlIHNvY2tldCByZWxhdGVkIGFuZCBkZW5vIGlzIHJ1bm5pbmdcbiAgICAvLyBvbiBzdGFibGVcbiAgICB0aGlzLiNjb25uID0gYXdhaXQgRGVuby5jb25uZWN0KG9wdGlvbnMpO1xuICAgIHRoaXMuI2J1ZldyaXRlciA9IG5ldyBCdWZXcml0ZXIodGhpcy4jY29ubik7XG4gICAgdGhpcy4jYnVmUmVhZGVyID0gbmV3IEJ1ZlJlYWRlcih0aGlzLiNjb25uKTtcbiAgfVxuXG4gIGFzeW5jICNvcGVuU29ja2V0Q29ubmVjdGlvbihwYXRoOiBzdHJpbmcsIHBvcnQ6IG51bWJlcikge1xuICAgIGlmIChEZW5vLmJ1aWxkLm9zID09PSBcIndpbmRvd3NcIikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBcIlNvY2tldCBjb25uZWN0aW9uIGlzIG9ubHkgYXZhaWxhYmxlIG9uIFVOSVggc3lzdGVtc1wiLFxuICAgICAgKTtcbiAgICB9XG4gICAgY29uc3Qgc29ja2V0ID0gYXdhaXQgRGVuby5zdGF0KHBhdGgpO1xuXG4gICAgaWYgKHNvY2tldC5pc0ZpbGUpIHtcbiAgICAgIGF3YWl0IHRoaXMuI29wZW5Db25uZWN0aW9uKHsgcGF0aCwgdHJhbnNwb3J0OiBcInVuaXhcIiB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3Qgc29ja2V0X2d1ZXNzID0gam9pblBhdGgocGF0aCwgZ2V0U29ja2V0TmFtZShwb3J0KSk7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLiNvcGVuQ29ubmVjdGlvbih7XG4gICAgICAgICAgcGF0aDogc29ja2V0X2d1ZXNzLFxuICAgICAgICAgIHRyYW5zcG9ydDogXCJ1bml4XCIsXG4gICAgICAgIH0pO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBpZiAoZSBpbnN0YW5jZW9mIERlbm8uZXJyb3JzLk5vdEZvdW5kKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IENvbm5lY3Rpb25FcnJvcihcbiAgICAgICAgICAgIGBDb3VsZCBub3Qgb3BlbiBzb2NrZXQgaW4gcGF0aCBcIiR7c29ja2V0X2d1ZXNzfVwiYCxcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgI29wZW5UbHNDb25uZWN0aW9uKFxuICAgIGNvbm5lY3Rpb246IERlbm8uQ29ubixcbiAgICBvcHRpb25zOiB7IGhvc3RuYW1lOiBzdHJpbmc7IGNhQ2VydHM6IHN0cmluZ1tdIH0sXG4gICkge1xuICAgIHRoaXMuI2Nvbm4gPSBhd2FpdCBEZW5vLnN0YXJ0VGxzKGNvbm5lY3Rpb24sIG9wdGlvbnMpO1xuICAgIHRoaXMuI2J1ZldyaXRlciA9IG5ldyBCdWZXcml0ZXIodGhpcy4jY29ubik7XG4gICAgdGhpcy4jYnVmUmVhZGVyID0gbmV3IEJ1ZlJlYWRlcih0aGlzLiNjb25uKTtcbiAgfVxuXG4gICNyZXNldENvbm5lY3Rpb25NZXRhZGF0YSgpIHtcbiAgICB0aGlzLmNvbm5lY3RlZCA9IGZhbHNlO1xuICAgIHRoaXMuI3BhY2tldFdyaXRlciA9IG5ldyBQYWNrZXRXcml0ZXIoKTtcbiAgICB0aGlzLiNwaWQgPSB1bmRlZmluZWQ7XG4gICAgdGhpcy4jcXVlcnlMb2NrID0gbmV3IERlZmVycmVkU3RhY2soXG4gICAgICAxLFxuICAgICAgW3VuZGVmaW5lZF0sXG4gICAgKTtcbiAgICB0aGlzLiNzZWNyZXRLZXkgPSB1bmRlZmluZWQ7XG4gICAgdGhpcy4jdGxzID0gdW5kZWZpbmVkO1xuICAgIHRoaXMuI3RyYW5zcG9ydCA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gICNjbG9zZUNvbm5lY3Rpb24oKSB7XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMuI2Nvbm4uY2xvc2UoKTtcbiAgICB9IGNhdGNoIChfZSkge1xuICAgICAgLy8gU3dhbGxvdyBpZiB0aGUgY29ubmVjdGlvbiBoYWQgZXJyb3JlZCBvciBiZWVuIGNsb3NlZCBiZWZvcmVoYW5kXG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMuI3Jlc2V0Q29ubmVjdGlvbk1ldGFkYXRhKCk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgI3N0YXJ0dXAoKSB7XG4gICAgdGhpcy4jY2xvc2VDb25uZWN0aW9uKCk7XG5cbiAgICBjb25zdCB7XG4gICAgICBob3N0bmFtZSxcbiAgICAgIGhvc3RfdHlwZSxcbiAgICAgIHBvcnQsXG4gICAgICB0bHM6IHtcbiAgICAgICAgZW5hYmxlZDogdGxzX2VuYWJsZWQsXG4gICAgICAgIGVuZm9yY2U6IHRsc19lbmZvcmNlZCxcbiAgICAgICAgY2FDZXJ0aWZpY2F0ZXMsXG4gICAgICB9LFxuICAgIH0gPSB0aGlzLiNjb25uZWN0aW9uX3BhcmFtcztcblxuICAgIGlmIChob3N0X3R5cGUgPT09IFwic29ja2V0XCIpIHtcbiAgICAgIGF3YWl0IHRoaXMuI29wZW5Tb2NrZXRDb25uZWN0aW9uKGhvc3RuYW1lLCBwb3J0KTtcbiAgICAgIHRoaXMuI3RscyA9IHVuZGVmaW5lZDtcbiAgICAgIHRoaXMuI3RyYW5zcG9ydCA9IFwic29ja2V0XCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEEgQnVmV3JpdGVyIG5lZWRzIHRvIGJlIGF2YWlsYWJsZSBpbiBvcmRlciB0byBjaGVjayBpZiB0aGUgc2VydmVyIGFjY2VwdHMgVExTIGNvbm5lY3Rpb25zXG4gICAgICBhd2FpdCB0aGlzLiNvcGVuQ29ubmVjdGlvbih7IGhvc3RuYW1lLCBwb3J0LCB0cmFuc3BvcnQ6IFwidGNwXCIgfSk7XG4gICAgICB0aGlzLiN0bHMgPSBmYWxzZTtcbiAgICAgIHRoaXMuI3RyYW5zcG9ydCA9IFwidGNwXCI7XG5cbiAgICAgIGlmICh0bHNfZW5hYmxlZCkge1xuICAgICAgICAvLyBJZiBUTFMgaXMgZGlzYWJsZWQsIHdlIGRvbid0IGV2ZW4gdHJ5IHRvIGNvbm5lY3QuXG4gICAgICAgIGNvbnN0IGFjY2VwdHNfdGxzID0gYXdhaXQgdGhpcy4jc2VydmVyQWNjZXB0c1RMUygpXG4gICAgICAgICAgLmNhdGNoKChlKSA9PiB7XG4gICAgICAgICAgICAvLyBNYWtlIHN1cmUgdG8gY2xvc2UgdGhlIGNvbm5lY3Rpb24gaWYgdGhlIFRMUyB2YWxpZGF0aW9uIHRocm93c1xuICAgICAgICAgICAgdGhpcy4jY2xvc2VDb25uZWN0aW9uKCk7XG4gICAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgIC8vIGh0dHBzOi8vd3d3LnBvc3RncmVzcWwub3JnL2RvY3MvMTQvcHJvdG9jb2wtZmxvdy5odG1sI2lkLTEuMTAuNS43LjExXG4gICAgICAgIGlmIChhY2NlcHRzX3Rscykge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLiNvcGVuVGxzQ29ubmVjdGlvbih0aGlzLiNjb25uLCB7XG4gICAgICAgICAgICAgIGhvc3RuYW1lLFxuICAgICAgICAgICAgICBjYUNlcnRzOiBjYUNlcnRpZmljYXRlcyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy4jdGxzID0gdHJ1ZTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBpZiAoIXRsc19lbmZvcmNlZCkge1xuICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgICAgICAgIGJvbGQoeWVsbG93KFwiVExTIGNvbm5lY3Rpb24gZmFpbGVkIHdpdGggbWVzc2FnZTogXCIpKSArXG4gICAgICAgICAgICAgICAgICBlLm1lc3NhZ2UgK1xuICAgICAgICAgICAgICAgICAgXCJcXG5cIiArXG4gICAgICAgICAgICAgICAgICBib2xkKFwiRGVmYXVsdGluZyB0byBub24tZW5jcnlwdGVkIGNvbm5lY3Rpb25cIiksXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMuI29wZW5Db25uZWN0aW9uKHsgaG9zdG5hbWUsIHBvcnQsIHRyYW5zcG9ydDogXCJ0Y3BcIiB9KTtcbiAgICAgICAgICAgICAgdGhpcy4jdGxzID0gZmFsc2U7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICh0bHNfZW5mb3JjZWQpIHtcbiAgICAgICAgICAvLyBNYWtlIHN1cmUgdG8gY2xvc2UgdGhlIGNvbm5lY3Rpb24gYmVmb3JlIGVycm9yaW5nXG4gICAgICAgICAgdGhpcy4jY2xvc2VDb25uZWN0aW9uKCk7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgXCJUaGUgc2VydmVyIGlzbid0IGFjY2VwdGluZyBUTFMgY29ubmVjdGlvbnMuIENoYW5nZSB0aGUgY2xpZW50IGNvbmZpZ3VyYXRpb24gc28gVExTIGNvbmZpZ3VyYXRpb24gaXNuJ3QgcmVxdWlyZWQgdG8gY29ubmVjdFwiLFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgbGV0IHN0YXJ0dXBfcmVzcG9uc2U7XG4gICAgICB0cnkge1xuICAgICAgICBzdGFydHVwX3Jlc3BvbnNlID0gYXdhaXQgdGhpcy4jc2VuZFN0YXJ0dXBNZXNzYWdlKCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIC8vIE1ha2Ugc3VyZSB0byBjbG9zZSB0aGUgY29ubmVjdGlvbiBiZWZvcmUgZXJyb3Jpbmcgb3IgcmVzZXRpbmdcbiAgICAgICAgdGhpcy4jY2xvc2VDb25uZWN0aW9uKCk7XG4gICAgICAgIGlmIChlIGluc3RhbmNlb2YgRGVuby5lcnJvcnMuSW52YWxpZERhdGEgJiYgdGxzX2VuYWJsZWQpIHtcbiAgICAgICAgICBpZiAodGxzX2VuZm9yY2VkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgIFwiVGhlIGNlcnRpZmljYXRlIHVzZWQgdG8gc2VjdXJlIHRoZSBUTFMgY29ubmVjdGlvbiBpcyBpbnZhbGlkLlwiLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICAgICAgYm9sZCh5ZWxsb3coXCJUTFMgY29ubmVjdGlvbiBmYWlsZWQgd2l0aCBtZXNzYWdlOiBcIikpICtcbiAgICAgICAgICAgICAgICBlLm1lc3NhZ2UgK1xuICAgICAgICAgICAgICAgIFwiXFxuXCIgK1xuICAgICAgICAgICAgICAgIGJvbGQoXCJEZWZhdWx0aW5nIHRvIG5vbi1lbmNyeXB0ZWQgY29ubmVjdGlvblwiKSxcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLiNvcGVuQ29ubmVjdGlvbih7IGhvc3RuYW1lLCBwb3J0LCB0cmFuc3BvcnQ6IFwidGNwXCIgfSk7XG4gICAgICAgICAgICB0aGlzLiN0bHMgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuI3RyYW5zcG9ydCA9IFwidGNwXCI7XG4gICAgICAgICAgICBzdGFydHVwX3Jlc3BvbnNlID0gYXdhaXQgdGhpcy4jc2VuZFN0YXJ0dXBNZXNzYWdlKCk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGFzc2VydFN1Y2Nlc3NmdWxTdGFydHVwKHN0YXJ0dXBfcmVzcG9uc2UpO1xuICAgICAgYXdhaXQgdGhpcy4jYXV0aGVudGljYXRlKHN0YXJ0dXBfcmVzcG9uc2UpO1xuXG4gICAgICAvLyBIYW5kbGUgY29ubmVjdGlvbiBzdGF0dXNcbiAgICAgIC8vIFByb2Nlc3MgY29ubmVjdGlvbiBpbml0aWFsaXphdGlvbiBtZXNzYWdlcyB1bnRpbCBjb25uZWN0aW9uIHJldHVybnMgcmVhZHlcbiAgICAgIGxldCBtZXNzYWdlID0gYXdhaXQgdGhpcy4jcmVhZE1lc3NhZ2UoKTtcbiAgICAgIHdoaWxlIChtZXNzYWdlLnR5cGUgIT09IElOQ09NSU5HX0FVVEhFTlRJQ0FUSU9OX01FU1NBR0VTLlJFQURZKSB7XG4gICAgICAgIHN3aXRjaCAobWVzc2FnZS50eXBlKSB7XG4gICAgICAgICAgLy8gQ29ubmVjdGlvbiBlcnJvciAod3JvbmcgZGF0YWJhc2Ugb3IgdXNlcilcbiAgICAgICAgICBjYXNlIEVSUk9SX01FU1NBR0U6XG4gICAgICAgICAgICBhd2FpdCB0aGlzLiNwcm9jZXNzRXJyb3JVbnNhZmUobWVzc2FnZSwgZmFsc2UpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBJTkNPTUlOR19BVVRIRU5USUNBVElPTl9NRVNTQUdFUy5CQUNLRU5EX0tFWToge1xuICAgICAgICAgICAgY29uc3QgeyBwaWQsIHNlY3JldF9rZXkgfSA9IHBhcnNlQmFja2VuZEtleU1lc3NhZ2UobWVzc2FnZSk7XG4gICAgICAgICAgICB0aGlzLiNwaWQgPSBwaWQ7XG4gICAgICAgICAgICB0aGlzLiNzZWNyZXRLZXkgPSBzZWNyZXRfa2V5O1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNhc2UgSU5DT01JTkdfQVVUSEVOVElDQVRJT05fTUVTU0FHRVMuUEFSQU1FVEVSX1NUQVRVUzpcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gcmVzcG9uc2UgZm9yIHN0YXJ0dXA6ICR7bWVzc2FnZS50eXBlfWApO1xuICAgICAgICB9XG5cbiAgICAgICAgbWVzc2FnZSA9IGF3YWl0IHRoaXMuI3JlYWRNZXNzYWdlKCk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuY29ubmVjdGVkID0gdHJ1ZTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICB0aGlzLiNjbG9zZUNvbm5lY3Rpb24oKTtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIENhbGxpbmcgc3RhcnR1cCBvbiBhIGNvbm5lY3Rpb24gdHdpY2Ugd2lsbCBjcmVhdGUgYSBuZXcgc2Vzc2lvbiBhbmQgb3ZlcndyaXRlIHRoZSBwcmV2aW91cyBvbmVcbiAgICpcbiAgICogQHBhcmFtIGlzX3JlY29ubmVjdGlvbiBUaGlzIGluZGljYXRlcyB3aGV0aGVyIHRoZSBzdGFydHVwIHNob3VsZCBiZWhhdmUgYXMgaWYgdGhlcmUgd2FzXG4gICAqIGEgY29ubmVjdGlvbiBwcmV2aW91c2x5IGVzdGFibGlzaGVkLCBvciBpZiBpdCBzaG91bGQgYXR0ZW1wdCB0byBjcmVhdGUgYSBjb25uZWN0aW9uIGZpcnN0XG4gICAqXG4gICAqIGh0dHBzOi8vd3d3LnBvc3RncmVzcWwub3JnL2RvY3MvMTQvcHJvdG9jb2wtZmxvdy5odG1sI2lkLTEuMTAuNS43LjNcbiAgICovXG4gIGFzeW5jIHN0YXJ0dXAoaXNfcmVjb25uZWN0aW9uOiBib29sZWFuKSB7XG4gICAgaWYgKGlzX3JlY29ubmVjdGlvbiAmJiB0aGlzLiNjb25uZWN0aW9uX3BhcmFtcy5jb25uZWN0aW9uLmF0dGVtcHRzID09PSAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIFwiVGhlIGNsaWVudCBoYXMgYmVlbiBkaXNjb25uZWN0ZWQgZnJvbSB0aGUgZGF0YWJhc2UuIEVuYWJsZSByZWNvbm5lY3Rpb24gaW4gdGhlIGNsaWVudCB0byBhdHRlbXB0IHJlY29ubmVjdGlvbiBhZnRlciBmYWlsdXJlXCIsXG4gICAgICApO1xuICAgIH1cblxuICAgIGxldCByZWNvbm5lY3Rpb25fYXR0ZW1wdHMgPSAwO1xuICAgIGNvbnN0IG1heF9yZWNvbm5lY3Rpb25zID0gdGhpcy4jY29ubmVjdGlvbl9wYXJhbXMuY29ubmVjdGlvbi5hdHRlbXB0cztcblxuICAgIGxldCBlcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG4gICAgLy8gSWYgbm8gY29ubmVjdGlvbiBoYXMgYmVlbiBlc3RhYmxpc2hlZCBhbmQgdGhlIHJlY29ubmVjdGlvbiBhdHRlbXB0cyBhcmVcbiAgICAvLyBzZXQgdG8gemVybywgYXR0ZW1wdCB0byBjb25uZWN0IGF0IGxlYXN0IG9uY2VcbiAgICBpZiAoIWlzX3JlY29ubmVjdGlvbiAmJiB0aGlzLiNjb25uZWN0aW9uX3BhcmFtcy5jb25uZWN0aW9uLmF0dGVtcHRzID09PSAwKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLiNzdGFydHVwKCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGVycm9yID0gZTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgbGV0IGludGVydmFsID1cbiAgICAgICAgdHlwZW9mIHRoaXMuI2Nvbm5lY3Rpb25fcGFyYW1zLmNvbm5lY3Rpb24uaW50ZXJ2YWwgPT09IFwibnVtYmVyXCJcbiAgICAgICAgICA/IHRoaXMuI2Nvbm5lY3Rpb25fcGFyYW1zLmNvbm5lY3Rpb24uaW50ZXJ2YWxcbiAgICAgICAgICA6IDA7XG4gICAgICB3aGlsZSAocmVjb25uZWN0aW9uX2F0dGVtcHRzIDwgbWF4X3JlY29ubmVjdGlvbnMpIHtcbiAgICAgICAgLy8gRG9uJ3Qgd2FpdCBmb3IgdGhlIGludGVydmFsIG9uIHRoZSBmaXJzdCBjb25uZWN0aW9uXG4gICAgICAgIGlmIChyZWNvbm5lY3Rpb25fYXR0ZW1wdHMgPiAwKSB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgdHlwZW9mIHRoaXMuI2Nvbm5lY3Rpb25fcGFyYW1zLmNvbm5lY3Rpb24uaW50ZXJ2YWwgPT09IFwiZnVuY3Rpb25cIlxuICAgICAgICAgICkge1xuICAgICAgICAgICAgaW50ZXJ2YWwgPSB0aGlzLiNjb25uZWN0aW9uX3BhcmFtcy5jb25uZWN0aW9uLmludGVydmFsKGludGVydmFsKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoaW50ZXJ2YWwgPiAwKSB7XG4gICAgICAgICAgICBhd2FpdCBkZWxheShpbnRlcnZhbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy4jc3RhcnR1cCgpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgLy8gVE9ET1xuICAgICAgICAgIC8vIEV2ZW50dWFsbHkgZGlzdGluZ3Vpc2ggYmV0d2VlbiBjb25uZWN0aW9uIGVycm9ycyBhbmQgbm9ybWFsIGVycm9yc1xuICAgICAgICAgIHJlY29ubmVjdGlvbl9hdHRlbXB0cysrO1xuICAgICAgICAgIGlmIChyZWNvbm5lY3Rpb25fYXR0ZW1wdHMgPT09IG1heF9yZWNvbm5lY3Rpb25zKSB7XG4gICAgICAgICAgICBlcnJvciA9IGU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGVycm9yKSB7XG4gICAgICBhd2FpdCB0aGlzLmVuZCgpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFdpbGwgYXR0ZW1wdCB0byBhdXRoZW50aWNhdGUgd2l0aCB0aGUgZGF0YWJhc2UgdXNpbmcgdGhlIHByb3ZpZGVkXG4gICAqIHBhc3N3b3JkIGNyZWRlbnRpYWxzXG4gICAqL1xuICBhc3luYyAjYXV0aGVudGljYXRlKGF1dGhlbnRpY2F0aW9uX3JlcXVlc3Q6IE1lc3NhZ2UpIHtcbiAgICBjb25zdCBhdXRoZW50aWNhdGlvbl90eXBlID0gYXV0aGVudGljYXRpb25fcmVxdWVzdC5yZWFkZXIucmVhZEludDMyKCk7XG5cbiAgICBsZXQgYXV0aGVudGljYXRpb25fcmVzdWx0OiBNZXNzYWdlO1xuICAgIHN3aXRjaCAoYXV0aGVudGljYXRpb25fdHlwZSkge1xuICAgICAgY2FzZSBBVVRIRU5USUNBVElPTl9UWVBFLk5PX0FVVEhFTlRJQ0FUSU9OOlxuICAgICAgICBhdXRoZW50aWNhdGlvbl9yZXN1bHQgPSBhdXRoZW50aWNhdGlvbl9yZXF1ZXN0O1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgQVVUSEVOVElDQVRJT05fVFlQRS5DTEVBUl9URVhUOlxuICAgICAgICBhdXRoZW50aWNhdGlvbl9yZXN1bHQgPSBhd2FpdCB0aGlzLiNhdXRoZW50aWNhdGVXaXRoQ2xlYXJQYXNzd29yZCgpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgQVVUSEVOVElDQVRJT05fVFlQRS5NRDU6IHtcbiAgICAgICAgY29uc3Qgc2FsdCA9IGF1dGhlbnRpY2F0aW9uX3JlcXVlc3QucmVhZGVyLnJlYWRCeXRlcyg0KTtcbiAgICAgICAgYXV0aGVudGljYXRpb25fcmVzdWx0ID0gYXdhaXQgdGhpcy4jYXV0aGVudGljYXRlV2l0aE1kNShzYWx0KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlIEFVVEhFTlRJQ0FUSU9OX1RZUEUuU0NNOlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgXCJEYXRhYmFzZSBzZXJ2ZXIgZXhwZWN0ZWQgU0NNIGF1dGhlbnRpY2F0aW9uLCB3aGljaCBpcyBub3Qgc3VwcG9ydGVkIGF0IHRoZSBtb21lbnRcIixcbiAgICAgICAgKTtcbiAgICAgIGNhc2UgQVVUSEVOVElDQVRJT05fVFlQRS5HU1NfU1RBUlRVUDpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgIFwiRGF0YWJhc2Ugc2VydmVyIGV4cGVjdGVkIEdTUyBhdXRoZW50aWNhdGlvbiwgd2hpY2ggaXMgbm90IHN1cHBvcnRlZCBhdCB0aGUgbW9tZW50XCIsXG4gICAgICAgICk7XG4gICAgICBjYXNlIEFVVEhFTlRJQ0FUSU9OX1RZUEUuR1NTX0NPTlRJTlVFOlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgXCJEYXRhYmFzZSBzZXJ2ZXIgZXhwZWN0ZWQgR1NTIGF1dGhlbnRpY2F0aW9uLCB3aGljaCBpcyBub3Qgc3VwcG9ydGVkIGF0IHRoZSBtb21lbnRcIixcbiAgICAgICAgKTtcbiAgICAgIGNhc2UgQVVUSEVOVElDQVRJT05fVFlQRS5TU1BJOlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgXCJEYXRhYmFzZSBzZXJ2ZXIgZXhwZWN0ZWQgU1NQSSBhdXRoZW50aWNhdGlvbiwgd2hpY2ggaXMgbm90IHN1cHBvcnRlZCBhdCB0aGUgbW9tZW50XCIsXG4gICAgICAgICk7XG4gICAgICBjYXNlIEFVVEhFTlRJQ0FUSU9OX1RZUEUuU0FTTF9TVEFSVFVQOlxuICAgICAgICBhdXRoZW50aWNhdGlvbl9yZXN1bHQgPSBhd2FpdCB0aGlzLiNhdXRoZW50aWNhdGVXaXRoU2FzbCgpO1xuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBhdXRoIG1lc3NhZ2UgY29kZSAke2F1dGhlbnRpY2F0aW9uX3R5cGV9YCk7XG4gICAgfVxuXG4gICAgYXdhaXQgYXNzZXJ0U3VjY2Vzc2Z1bEF1dGhlbnRpY2F0aW9uKGF1dGhlbnRpY2F0aW9uX3Jlc3VsdCk7XG4gIH1cblxuICBhc3luYyAjYXV0aGVudGljYXRlV2l0aENsZWFyUGFzc3dvcmQoKTogUHJvbWlzZTxNZXNzYWdlPiB7XG4gICAgdGhpcy4jcGFja2V0V3JpdGVyLmNsZWFyKCk7XG4gICAgY29uc3QgcGFzc3dvcmQgPSB0aGlzLiNjb25uZWN0aW9uX3BhcmFtcy5wYXNzd29yZCB8fCBcIlwiO1xuICAgIGNvbnN0IGJ1ZmZlciA9IHRoaXMuI3BhY2tldFdyaXRlci5hZGRDU3RyaW5nKHBhc3N3b3JkKS5mbHVzaCgweDcwKTtcblxuICAgIGF3YWl0IHRoaXMuI2J1ZldyaXRlci53cml0ZShidWZmZXIpO1xuICAgIGF3YWl0IHRoaXMuI2J1ZldyaXRlci5mbHVzaCgpO1xuXG4gICAgcmV0dXJuIHRoaXMuI3JlYWRNZXNzYWdlKCk7XG4gIH1cblxuICBhc3luYyAjYXV0aGVudGljYXRlV2l0aE1kNShzYWx0OiBVaW50OEFycmF5KTogUHJvbWlzZTxNZXNzYWdlPiB7XG4gICAgdGhpcy4jcGFja2V0V3JpdGVyLmNsZWFyKCk7XG5cbiAgICBpZiAoIXRoaXMuI2Nvbm5lY3Rpb25fcGFyYW1zLnBhc3N3b3JkKSB7XG4gICAgICB0aHJvdyBuZXcgQ29ubmVjdGlvblBhcmFtc0Vycm9yKFxuICAgICAgICBcIkF0dGVtcHRpbmcgTUQ1IGF1dGhlbnRpY2F0aW9uIHdpdGggdW5zZXQgcGFzc3dvcmRcIixcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgcGFzc3dvcmQgPSBhd2FpdCBoYXNoTWQ1UGFzc3dvcmQoXG4gICAgICB0aGlzLiNjb25uZWN0aW9uX3BhcmFtcy5wYXNzd29yZCxcbiAgICAgIHRoaXMuI2Nvbm5lY3Rpb25fcGFyYW1zLnVzZXIsXG4gICAgICBzYWx0LFxuICAgICk7XG4gICAgY29uc3QgYnVmZmVyID0gdGhpcy4jcGFja2V0V3JpdGVyLmFkZENTdHJpbmcocGFzc3dvcmQpLmZsdXNoKDB4NzApO1xuXG4gICAgYXdhaXQgdGhpcy4jYnVmV3JpdGVyLndyaXRlKGJ1ZmZlcik7XG4gICAgYXdhaXQgdGhpcy4jYnVmV3JpdGVyLmZsdXNoKCk7XG5cbiAgICByZXR1cm4gdGhpcy4jcmVhZE1lc3NhZ2UoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBodHRwczovL3d3dy5wb3N0Z3Jlc3FsLm9yZy9kb2NzLzE0L3Nhc2wtYXV0aGVudGljYXRpb24uaHRtbFxuICAgKi9cbiAgYXN5bmMgI2F1dGhlbnRpY2F0ZVdpdGhTYXNsKCk6IFByb21pc2U8TWVzc2FnZT4ge1xuICAgIGlmICghdGhpcy4jY29ubmVjdGlvbl9wYXJhbXMucGFzc3dvcmQpIHtcbiAgICAgIHRocm93IG5ldyBDb25uZWN0aW9uUGFyYW1zRXJyb3IoXG4gICAgICAgIFwiQXR0ZW1wdGluZyBTQVNMIGF1dGggd2l0aCB1bnNldCBwYXNzd29yZFwiLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBjbGllbnQgPSBuZXcgc2NyYW0uQ2xpZW50KFxuICAgICAgdGhpcy4jY29ubmVjdGlvbl9wYXJhbXMudXNlcixcbiAgICAgIHRoaXMuI2Nvbm5lY3Rpb25fcGFyYW1zLnBhc3N3b3JkLFxuICAgICk7XG4gICAgY29uc3QgdXRmOCA9IG5ldyBUZXh0RGVjb2RlcihcInV0Zi04XCIpO1xuXG4gICAgLy8gU0FTTEluaXRpYWxSZXNwb25zZVxuICAgIGNvbnN0IGNsaWVudEZpcnN0TWVzc2FnZSA9IGNsaWVudC5jb21wb3NlQ2hhbGxlbmdlKCk7XG4gICAgdGhpcy4jcGFja2V0V3JpdGVyLmNsZWFyKCk7XG4gICAgdGhpcy4jcGFja2V0V3JpdGVyLmFkZENTdHJpbmcoXCJTQ1JBTS1TSEEtMjU2XCIpO1xuICAgIHRoaXMuI3BhY2tldFdyaXRlci5hZGRJbnQzMihjbGllbnRGaXJzdE1lc3NhZ2UubGVuZ3RoKTtcbiAgICB0aGlzLiNwYWNrZXRXcml0ZXIuYWRkU3RyaW5nKGNsaWVudEZpcnN0TWVzc2FnZSk7XG4gICAgdGhpcy4jYnVmV3JpdGVyLndyaXRlKHRoaXMuI3BhY2tldFdyaXRlci5mbHVzaCgweDcwKSk7XG4gICAgdGhpcy4jYnVmV3JpdGVyLmZsdXNoKCk7XG5cbiAgICBjb25zdCBtYXliZV9zYXNsX2NvbnRpbnVlID0gYXdhaXQgdGhpcy4jcmVhZE1lc3NhZ2UoKTtcbiAgICBzd2l0Y2ggKG1heWJlX3Nhc2xfY29udGludWUudHlwZSkge1xuICAgICAgY2FzZSBJTkNPTUlOR19BVVRIRU5USUNBVElPTl9NRVNTQUdFUy5BVVRIRU5USUNBVElPTjoge1xuICAgICAgICBjb25zdCBhdXRoZW50aWNhdGlvbl90eXBlID0gbWF5YmVfc2FzbF9jb250aW51ZS5yZWFkZXIucmVhZEludDMyKCk7XG4gICAgICAgIGlmIChhdXRoZW50aWNhdGlvbl90eXBlICE9PSBBVVRIRU5USUNBVElPTl9UWVBFLlNBU0xfQ09OVElOVUUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICBgVW5leHBlY3RlZCBhdXRoZW50aWNhdGlvbiB0eXBlIGluIFNBU0wgbmVnb3RpYXRpb246ICR7YXV0aGVudGljYXRpb25fdHlwZX1gLFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlIEVSUk9SX01FU1NBR0U6XG4gICAgICAgIHRocm93IG5ldyBQb3N0Z3Jlc0Vycm9yKHBhcnNlTm90aWNlTWVzc2FnZShtYXliZV9zYXNsX2NvbnRpbnVlKSk7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgYFVuZXhwZWN0ZWQgbWVzc2FnZSBpbiBTQVNMIG5lZ290aWF0aW9uOiAke21heWJlX3Nhc2xfY29udGludWUudHlwZX1gLFxuICAgICAgICApO1xuICAgIH1cbiAgICBjb25zdCBzYXNsX2NvbnRpbnVlID0gdXRmOC5kZWNvZGUoXG4gICAgICBtYXliZV9zYXNsX2NvbnRpbnVlLnJlYWRlci5yZWFkQWxsQnl0ZXMoKSxcbiAgICApO1xuICAgIGF3YWl0IGNsaWVudC5yZWNlaXZlQ2hhbGxlbmdlKHNhc2xfY29udGludWUpO1xuXG4gICAgdGhpcy4jcGFja2V0V3JpdGVyLmNsZWFyKCk7XG4gICAgdGhpcy4jcGFja2V0V3JpdGVyLmFkZFN0cmluZyhhd2FpdCBjbGllbnQuY29tcG9zZVJlc3BvbnNlKCkpO1xuICAgIHRoaXMuI2J1ZldyaXRlci53cml0ZSh0aGlzLiNwYWNrZXRXcml0ZXIuZmx1c2goMHg3MCkpO1xuICAgIHRoaXMuI2J1ZldyaXRlci5mbHVzaCgpO1xuXG4gICAgY29uc3QgbWF5YmVfc2FzbF9maW5hbCA9IGF3YWl0IHRoaXMuI3JlYWRNZXNzYWdlKCk7XG4gICAgc3dpdGNoIChtYXliZV9zYXNsX2ZpbmFsLnR5cGUpIHtcbiAgICAgIGNhc2UgSU5DT01JTkdfQVVUSEVOVElDQVRJT05fTUVTU0FHRVMuQVVUSEVOVElDQVRJT046IHtcbiAgICAgICAgY29uc3QgYXV0aGVudGljYXRpb25fdHlwZSA9IG1heWJlX3Nhc2xfZmluYWwucmVhZGVyLnJlYWRJbnQzMigpO1xuICAgICAgICBpZiAoYXV0aGVudGljYXRpb25fdHlwZSAhPT0gQVVUSEVOVElDQVRJT05fVFlQRS5TQVNMX0ZJTkFMKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgYFVuZXhwZWN0ZWQgYXV0aGVudGljYXRpb24gdHlwZSBpbiBTQVNMIGZpbmFsaXphdGlvbjogJHthdXRoZW50aWNhdGlvbl90eXBlfWAsXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgRVJST1JfTUVTU0FHRTpcbiAgICAgICAgdGhyb3cgbmV3IFBvc3RncmVzRXJyb3IocGFyc2VOb3RpY2VNZXNzYWdlKG1heWJlX3Nhc2xfZmluYWwpKTtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICBgVW5leHBlY3RlZCBtZXNzYWdlIGluIFNBU0wgZmluYWxpemF0aW9uOiAke21heWJlX3Nhc2xfY29udGludWUudHlwZX1gLFxuICAgICAgICApO1xuICAgIH1cbiAgICBjb25zdCBzYXNsX2ZpbmFsID0gdXRmOC5kZWNvZGUoXG4gICAgICBtYXliZV9zYXNsX2ZpbmFsLnJlYWRlci5yZWFkQWxsQnl0ZXMoKSxcbiAgICApO1xuICAgIGF3YWl0IGNsaWVudC5yZWNlaXZlUmVzcG9uc2Uoc2FzbF9maW5hbCk7XG5cbiAgICAvLyBSZXR1cm4gYXV0aGVudGljYXRpb24gcmVzdWx0XG4gICAgcmV0dXJuIHRoaXMuI3JlYWRNZXNzYWdlKCk7XG4gIH1cblxuICBhc3luYyAjc2ltcGxlUXVlcnkoXG4gICAgcXVlcnk6IFF1ZXJ5PFJlc3VsdFR5cGUuQVJSQVk+LFxuICApOiBQcm9taXNlPFF1ZXJ5QXJyYXlSZXN1bHQ+O1xuICBhc3luYyAjc2ltcGxlUXVlcnkoXG4gICAgcXVlcnk6IFF1ZXJ5PFJlc3VsdFR5cGUuT0JKRUNUPixcbiAgKTogUHJvbWlzZTxRdWVyeU9iamVjdFJlc3VsdD47XG4gIGFzeW5jICNzaW1wbGVRdWVyeShcbiAgICBxdWVyeTogUXVlcnk8UmVzdWx0VHlwZT4sXG4gICk6IFByb21pc2U8UXVlcnlSZXN1bHQ+IHtcbiAgICB0aGlzLiNwYWNrZXRXcml0ZXIuY2xlYXIoKTtcblxuICAgIGNvbnN0IGJ1ZmZlciA9IHRoaXMuI3BhY2tldFdyaXRlci5hZGRDU3RyaW5nKHF1ZXJ5LnRleHQpLmZsdXNoKDB4NTEpO1xuXG4gICAgYXdhaXQgdGhpcy4jYnVmV3JpdGVyLndyaXRlKGJ1ZmZlcik7XG4gICAgYXdhaXQgdGhpcy4jYnVmV3JpdGVyLmZsdXNoKCk7XG5cbiAgICBsZXQgcmVzdWx0O1xuICAgIGlmIChxdWVyeS5yZXN1bHRfdHlwZSA9PT0gUmVzdWx0VHlwZS5BUlJBWSkge1xuICAgICAgcmVzdWx0ID0gbmV3IFF1ZXJ5QXJyYXlSZXN1bHQocXVlcnkpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHQgPSBuZXcgUXVlcnlPYmplY3RSZXN1bHQocXVlcnkpO1xuICAgIH1cblxuICAgIGxldCBlcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG4gICAgbGV0IGN1cnJlbnRfbWVzc2FnZSA9IGF3YWl0IHRoaXMuI3JlYWRNZXNzYWdlKCk7XG5cbiAgICAvLyBQcm9jZXNzIG1lc3NhZ2VzIHVudGlsIHJlYWR5IHNpZ25hbCBpcyBzZW50XG4gICAgLy8gRGVsYXkgZXJyb3IgaGFuZGxpbmcgdW50aWwgYWZ0ZXIgdGhlIHJlYWR5IHNpZ25hbCBpcyBzZW50XG4gICAgd2hpbGUgKGN1cnJlbnRfbWVzc2FnZS50eXBlICE9PSBJTkNPTUlOR19RVUVSWV9NRVNTQUdFUy5SRUFEWSkge1xuICAgICAgc3dpdGNoIChjdXJyZW50X21lc3NhZ2UudHlwZSkge1xuICAgICAgICBjYXNlIEVSUk9SX01FU1NBR0U6XG4gICAgICAgICAgZXJyb3IgPSBuZXcgUG9zdGdyZXNFcnJvcihwYXJzZU5vdGljZU1lc3NhZ2UoY3VycmVudF9tZXNzYWdlKSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgSU5DT01JTkdfUVVFUllfTUVTU0FHRVMuQ09NTUFORF9DT01QTEVURToge1xuICAgICAgICAgIHJlc3VsdC5oYW5kbGVDb21tYW5kQ29tcGxldGUoXG4gICAgICAgICAgICBwYXJzZUNvbW1hbmRDb21wbGV0ZU1lc3NhZ2UoY3VycmVudF9tZXNzYWdlKSxcbiAgICAgICAgICApO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgSU5DT01JTkdfUVVFUllfTUVTU0FHRVMuREFUQV9ST1c6IHtcbiAgICAgICAgICBjb25zdCByb3dfZGF0YSA9IHBhcnNlUm93RGF0YU1lc3NhZ2UoY3VycmVudF9tZXNzYWdlKTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmVzdWx0Lmluc2VydFJvdyhyb3dfZGF0YSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgZXJyb3IgPSBlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlIElOQ09NSU5HX1FVRVJZX01FU1NBR0VTLkVNUFRZX1FVRVJZOlxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIElOQ09NSU5HX1FVRVJZX01FU1NBR0VTLk5PVElDRV9XQVJOSU5HOiB7XG4gICAgICAgICAgY29uc3Qgbm90aWNlID0gcGFyc2VOb3RpY2VNZXNzYWdlKGN1cnJlbnRfbWVzc2FnZSk7XG4gICAgICAgICAgbG9nTm90aWNlKG5vdGljZSk7XG4gICAgICAgICAgcmVzdWx0Lndhcm5pbmdzLnB1c2gobm90aWNlKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlIElOQ09NSU5HX1FVRVJZX01FU1NBR0VTLlBBUkFNRVRFUl9TVEFUVVM6XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgSU5DT01JTkdfUVVFUllfTUVTU0FHRVMuUkVBRFk6XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgSU5DT01JTkdfUVVFUllfTUVTU0FHRVMuUk9XX0RFU0NSSVBUSU9OOiB7XG4gICAgICAgICAgcmVzdWx0LmxvYWRDb2x1bW5EZXNjcmlwdGlvbnMoXG4gICAgICAgICAgICBwYXJzZVJvd0Rlc2NyaXB0aW9uTWVzc2FnZShjdXJyZW50X21lc3NhZ2UpLFxuICAgICAgICAgICk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICBgVW5leHBlY3RlZCBzaW1wbGUgcXVlcnkgbWVzc2FnZTogJHtjdXJyZW50X21lc3NhZ2UudHlwZX1gLFxuICAgICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGN1cnJlbnRfbWVzc2FnZSA9IGF3YWl0IHRoaXMuI3JlYWRNZXNzYWdlKCk7XG4gICAgfVxuXG4gICAgaWYgKGVycm9yKSB0aHJvdyBlcnJvcjtcblxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBhc3luYyAjYXBwZW5kUXVlcnlUb01lc3NhZ2U8VCBleHRlbmRzIFJlc3VsdFR5cGU+KHF1ZXJ5OiBRdWVyeTxUPikge1xuICAgIHRoaXMuI3BhY2tldFdyaXRlci5jbGVhcigpO1xuXG4gICAgY29uc3QgYnVmZmVyID0gdGhpcy4jcGFja2V0V3JpdGVyXG4gICAgICAuYWRkQ1N0cmluZyhcIlwiKSAvLyBUT0RPOiBoYW5kbGUgbmFtZWQgcXVlcmllcyAoY29uZmlnLm5hbWUpXG4gICAgICAuYWRkQ1N0cmluZyhxdWVyeS50ZXh0KVxuICAgICAgLmFkZEludDE2KDApXG4gICAgICAuZmx1c2goMHg1MCk7XG4gICAgYXdhaXQgdGhpcy4jYnVmV3JpdGVyLndyaXRlKGJ1ZmZlcik7XG4gIH1cblxuICBhc3luYyAjYXBwZW5kQXJndW1lbnRzVG9NZXNzYWdlPFQgZXh0ZW5kcyBSZXN1bHRUeXBlPihcbiAgICBxdWVyeTogUXVlcnk8VD4sXG4gICkge1xuICAgIHRoaXMuI3BhY2tldFdyaXRlci5jbGVhcigpO1xuXG4gICAgY29uc3QgaGFzQmluYXJ5QXJncyA9IHF1ZXJ5LmFyZ3Muc29tZSgoYXJnKSA9PiBhcmcgaW5zdGFuY2VvZiBVaW50OEFycmF5KTtcblxuICAgIC8vIGJpbmQgc3RhdGVtZW50XG4gICAgdGhpcy4jcGFja2V0V3JpdGVyLmNsZWFyKCk7XG4gICAgdGhpcy4jcGFja2V0V3JpdGVyXG4gICAgICAuYWRkQ1N0cmluZyhcIlwiKSAvLyBUT0RPOiB1bm5hbWVkIHBvcnRhbFxuICAgICAgLmFkZENTdHJpbmcoXCJcIik7IC8vIFRPRE86IHVubmFtZWQgcHJlcGFyZWQgc3RhdGVtZW50XG5cbiAgICBpZiAoaGFzQmluYXJ5QXJncykge1xuICAgICAgdGhpcy4jcGFja2V0V3JpdGVyLmFkZEludDE2KHF1ZXJ5LmFyZ3MubGVuZ3RoKTtcblxuICAgICAgcXVlcnkuYXJncy5mb3JFYWNoKChhcmcpID0+IHtcbiAgICAgICAgdGhpcy4jcGFja2V0V3JpdGVyLmFkZEludDE2KGFyZyBpbnN0YW5jZW9mIFVpbnQ4QXJyYXkgPyAxIDogMCk7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy4jcGFja2V0V3JpdGVyLmFkZEludDE2KDApO1xuICAgIH1cblxuICAgIHRoaXMuI3BhY2tldFdyaXRlci5hZGRJbnQxNihxdWVyeS5hcmdzLmxlbmd0aCk7XG5cbiAgICBxdWVyeS5hcmdzLmZvckVhY2goKGFyZykgPT4ge1xuICAgICAgaWYgKGFyZyA9PT0gbnVsbCB8fCB0eXBlb2YgYXJnID09PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgIHRoaXMuI3BhY2tldFdyaXRlci5hZGRJbnQzMigtMSk7XG4gICAgICB9IGVsc2UgaWYgKGFyZyBpbnN0YW5jZW9mIFVpbnQ4QXJyYXkpIHtcbiAgICAgICAgdGhpcy4jcGFja2V0V3JpdGVyLmFkZEludDMyKGFyZy5sZW5ndGgpO1xuICAgICAgICB0aGlzLiNwYWNrZXRXcml0ZXIuYWRkKGFyZyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBieXRlTGVuZ3RoID0gZW5jb2Rlci5lbmNvZGUoYXJnKS5sZW5ndGg7XG4gICAgICAgIHRoaXMuI3BhY2tldFdyaXRlci5hZGRJbnQzMihieXRlTGVuZ3RoKTtcbiAgICAgICAgdGhpcy4jcGFja2V0V3JpdGVyLmFkZFN0cmluZyhhcmcpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgdGhpcy4jcGFja2V0V3JpdGVyLmFkZEludDE2KDApO1xuICAgIGNvbnN0IGJ1ZmZlciA9IHRoaXMuI3BhY2tldFdyaXRlci5mbHVzaCgweDQyKTtcbiAgICBhd2FpdCB0aGlzLiNidWZXcml0ZXIud3JpdGUoYnVmZmVyKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUaGlzIGZ1bmN0aW9uIGFwcGVuZHMgdGhlIHF1ZXJ5IHR5cGUgKGluIHRoaXMgY2FzZSBwcmVwYXJlZCBzdGF0ZW1lbnQpXG4gICAqIHRvIHRoZSBtZXNzYWdlXG4gICAqL1xuICBhc3luYyAjYXBwZW5kRGVzY3JpYmVUb01lc3NhZ2UoKSB7XG4gICAgdGhpcy4jcGFja2V0V3JpdGVyLmNsZWFyKCk7XG5cbiAgICBjb25zdCBidWZmZXIgPSB0aGlzLiNwYWNrZXRXcml0ZXIuYWRkQ1N0cmluZyhcIlBcIikuZmx1c2goMHg0NCk7XG4gICAgYXdhaXQgdGhpcy4jYnVmV3JpdGVyLndyaXRlKGJ1ZmZlcik7XG4gIH1cblxuICBhc3luYyAjYXBwZW5kRXhlY3V0ZVRvTWVzc2FnZSgpIHtcbiAgICB0aGlzLiNwYWNrZXRXcml0ZXIuY2xlYXIoKTtcblxuICAgIGNvbnN0IGJ1ZmZlciA9IHRoaXMuI3BhY2tldFdyaXRlclxuICAgICAgLmFkZENTdHJpbmcoXCJcIikgLy8gdW5uYW1lZCBwb3J0YWxcbiAgICAgIC5hZGRJbnQzMigwKVxuICAgICAgLmZsdXNoKDB4NDUpO1xuICAgIGF3YWl0IHRoaXMuI2J1ZldyaXRlci53cml0ZShidWZmZXIpO1xuICB9XG5cbiAgYXN5bmMgI2FwcGVuZFN5bmNUb01lc3NhZ2UoKSB7XG4gICAgdGhpcy4jcGFja2V0V3JpdGVyLmNsZWFyKCk7XG5cbiAgICBjb25zdCBidWZmZXIgPSB0aGlzLiNwYWNrZXRXcml0ZXIuZmx1c2goMHg1Myk7XG4gICAgYXdhaXQgdGhpcy4jYnVmV3JpdGVyLndyaXRlKGJ1ZmZlcik7XG4gIH1cblxuICAvLyBUT0RPXG4gIC8vIFJlbmFtZSBwcm9jZXNzIGZ1bmN0aW9uIHRvIGEgbW9yZSBtZWFuaW5nZnVsIG5hbWUgYW5kIG1vdmUgb3V0IG9mIGNsYXNzXG4gIGFzeW5jICNwcm9jZXNzRXJyb3JVbnNhZmUoXG4gICAgbXNnOiBNZXNzYWdlLFxuICAgIHJlY292ZXJhYmxlID0gdHJ1ZSxcbiAgKSB7XG4gICAgY29uc3QgZXJyb3IgPSBuZXcgUG9zdGdyZXNFcnJvcihwYXJzZU5vdGljZU1lc3NhZ2UobXNnKSk7XG4gICAgaWYgKHJlY292ZXJhYmxlKSB7XG4gICAgICBsZXQgbWF5YmVfcmVhZHlfbWVzc2FnZSA9IGF3YWl0IHRoaXMuI3JlYWRNZXNzYWdlKCk7XG4gICAgICB3aGlsZSAobWF5YmVfcmVhZHlfbWVzc2FnZS50eXBlICE9PSBJTkNPTUlOR19RVUVSWV9NRVNTQUdFUy5SRUFEWSkge1xuICAgICAgICBtYXliZV9yZWFkeV9tZXNzYWdlID0gYXdhaXQgdGhpcy4jcmVhZE1lc3NhZ2UoKTtcbiAgICAgIH1cbiAgICB9XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cblxuICAvKipcbiAgICogaHR0cHM6Ly93d3cucG9zdGdyZXNxbC5vcmcvZG9jcy8xNC9wcm90b2NvbC1mbG93Lmh0bWwjUFJPVE9DT0wtRkxPVy1FWFQtUVVFUllcbiAgICovXG4gIGFzeW5jICNwcmVwYXJlZFF1ZXJ5PFQgZXh0ZW5kcyBSZXN1bHRUeXBlPihcbiAgICBxdWVyeTogUXVlcnk8VD4sXG4gICk6IFByb21pc2U8UXVlcnlSZXN1bHQ+IHtcbiAgICAvLyBUaGUgcGFyc2UgbWVzc2FnZXMgZGVjbGFyZXMgdGhlIHN0YXRlbWVudCwgcXVlcnkgYXJndW1lbnRzIGFuZCB0aGUgY3Vyc29yIHVzZWQgaW4gdGhlIHRyYW5zYWN0aW9uXG4gICAgLy8gVGhlIGRhdGFiYXNlIHdpbGwgcmVzcG9uZCB3aXRoIGEgcGFyc2UgcmVzcG9uc2VcbiAgICBhd2FpdCB0aGlzLiNhcHBlbmRRdWVyeVRvTWVzc2FnZShxdWVyeSk7XG4gICAgYXdhaXQgdGhpcy4jYXBwZW5kQXJndW1lbnRzVG9NZXNzYWdlKHF1ZXJ5KTtcbiAgICAvLyBUaGUgZGVzY3JpYmUgbWVzc2FnZSB3aWxsIHNwZWNpZnkgdGhlIHF1ZXJ5IHR5cGUgYW5kIHRoZSBjdXJzb3IgaW4gd2hpY2ggdGhlIGN1cnJlbnQgcXVlcnkgd2lsbCBiZSBydW5uaW5nXG4gICAgLy8gVGhlIGRhdGFiYXNlIHdpbGwgcmVzcG9uZCB3aXRoIGEgYmluZCByZXNwb25zZVxuICAgIGF3YWl0IHRoaXMuI2FwcGVuZERlc2NyaWJlVG9NZXNzYWdlKCk7XG4gICAgLy8gVGhlIGV4ZWN1dGUgcmVzcG9uc2UgY29udGFpbnMgdGhlIHBvcnRhbCBpbiB3aGljaCB0aGUgcXVlcnkgd2lsbCBiZSBydW4gYW5kIGhvdyBtYW55IHJvd3Mgc2hvdWxkIGl0IHJldHVyblxuICAgIGF3YWl0IHRoaXMuI2FwcGVuZEV4ZWN1dGVUb01lc3NhZ2UoKTtcbiAgICBhd2FpdCB0aGlzLiNhcHBlbmRTeW5jVG9NZXNzYWdlKCk7XG4gICAgLy8gc2VuZCBhbGwgbWVzc2FnZXMgdG8gYmFja2VuZFxuICAgIGF3YWl0IHRoaXMuI2J1ZldyaXRlci5mbHVzaCgpO1xuXG4gICAgbGV0IHJlc3VsdDtcbiAgICBpZiAocXVlcnkucmVzdWx0X3R5cGUgPT09IFJlc3VsdFR5cGUuQVJSQVkpIHtcbiAgICAgIHJlc3VsdCA9IG5ldyBRdWVyeUFycmF5UmVzdWx0KHF1ZXJ5KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0ID0gbmV3IFF1ZXJ5T2JqZWN0UmVzdWx0KHF1ZXJ5KTtcbiAgICB9XG5cbiAgICBsZXQgZXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkO1xuICAgIGxldCBjdXJyZW50X21lc3NhZ2UgPSBhd2FpdCB0aGlzLiNyZWFkTWVzc2FnZSgpO1xuXG4gICAgd2hpbGUgKGN1cnJlbnRfbWVzc2FnZS50eXBlICE9PSBJTkNPTUlOR19RVUVSWV9NRVNTQUdFUy5SRUFEWSkge1xuICAgICAgc3dpdGNoIChjdXJyZW50X21lc3NhZ2UudHlwZSkge1xuICAgICAgICBjYXNlIEVSUk9SX01FU1NBR0U6IHtcbiAgICAgICAgICBlcnJvciA9IG5ldyBQb3N0Z3Jlc0Vycm9yKHBhcnNlTm90aWNlTWVzc2FnZShjdXJyZW50X21lc3NhZ2UpKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlIElOQ09NSU5HX1FVRVJZX01FU1NBR0VTLkJJTkRfQ09NUExFVEU6XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgSU5DT01JTkdfUVVFUllfTUVTU0FHRVMuQ09NTUFORF9DT01QTEVURToge1xuICAgICAgICAgIHJlc3VsdC5oYW5kbGVDb21tYW5kQ29tcGxldGUoXG4gICAgICAgICAgICBwYXJzZUNvbW1hbmRDb21wbGV0ZU1lc3NhZ2UoY3VycmVudF9tZXNzYWdlKSxcbiAgICAgICAgICApO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgSU5DT01JTkdfUVVFUllfTUVTU0FHRVMuREFUQV9ST1c6IHtcbiAgICAgICAgICBjb25zdCByb3dfZGF0YSA9IHBhcnNlUm93RGF0YU1lc3NhZ2UoY3VycmVudF9tZXNzYWdlKTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmVzdWx0Lmluc2VydFJvdyhyb3dfZGF0YSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgZXJyb3IgPSBlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlIElOQ09NSU5HX1FVRVJZX01FU1NBR0VTLk5PX0RBVEE6XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgSU5DT01JTkdfUVVFUllfTUVTU0FHRVMuTk9USUNFX1dBUk5JTkc6IHtcbiAgICAgICAgICBjb25zdCBub3RpY2UgPSBwYXJzZU5vdGljZU1lc3NhZ2UoY3VycmVudF9tZXNzYWdlKTtcbiAgICAgICAgICBsb2dOb3RpY2Uobm90aWNlKTtcbiAgICAgICAgICByZXN1bHQud2FybmluZ3MucHVzaChub3RpY2UpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgSU5DT01JTkdfUVVFUllfTUVTU0FHRVMuUEFSQU1FVEVSX1NUQVRVUzpcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBJTkNPTUlOR19RVUVSWV9NRVNTQUdFUy5QQVJTRV9DT01QTEVURTpcbiAgICAgICAgICAvLyBUT0RPOiBhZGQgdG8gYWxyZWFkeSBwYXJzZWQgcXVlcmllcyBpZlxuICAgICAgICAgIC8vIHF1ZXJ5IGhhcyBuYW1lLCBzbyBpdCdzIG5vdCBwYXJzZWQgYWdhaW5cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBJTkNPTUlOR19RVUVSWV9NRVNTQUdFUy5ST1dfREVTQ1JJUFRJT046IHtcbiAgICAgICAgICByZXN1bHQubG9hZENvbHVtbkRlc2NyaXB0aW9ucyhcbiAgICAgICAgICAgIHBhcnNlUm93RGVzY3JpcHRpb25NZXNzYWdlKGN1cnJlbnRfbWVzc2FnZSksXG4gICAgICAgICAgKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgIGBVbmV4cGVjdGVkIHByZXBhcmVkIHF1ZXJ5IG1lc3NhZ2U6ICR7Y3VycmVudF9tZXNzYWdlLnR5cGV9YCxcbiAgICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBjdXJyZW50X21lc3NhZ2UgPSBhd2FpdCB0aGlzLiNyZWFkTWVzc2FnZSgpO1xuICAgIH1cblxuICAgIGlmIChlcnJvcikgdGhyb3cgZXJyb3I7XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgYXN5bmMgcXVlcnkoXG4gICAgcXVlcnk6IFF1ZXJ5PFJlc3VsdFR5cGUuQVJSQVk+LFxuICApOiBQcm9taXNlPFF1ZXJ5QXJyYXlSZXN1bHQ+O1xuICBhc3luYyBxdWVyeShcbiAgICBxdWVyeTogUXVlcnk8UmVzdWx0VHlwZS5PQkpFQ1Q+LFxuICApOiBQcm9taXNlPFF1ZXJ5T2JqZWN0UmVzdWx0PjtcbiAgYXN5bmMgcXVlcnkoXG4gICAgcXVlcnk6IFF1ZXJ5PFJlc3VsdFR5cGU+LFxuICApOiBQcm9taXNlPFF1ZXJ5UmVzdWx0PiB7XG4gICAgaWYgKCF0aGlzLmNvbm5lY3RlZCkge1xuICAgICAgYXdhaXQgdGhpcy5zdGFydHVwKHRydWUpO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuI3F1ZXJ5TG9jay5wb3AoKTtcbiAgICB0cnkge1xuICAgICAgaWYgKHF1ZXJ5LmFyZ3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybiBhd2FpdCB0aGlzLiNzaW1wbGVRdWVyeShxdWVyeSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy4jcHJlcGFyZWRRdWVyeShxdWVyeSk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKGUgaW5zdGFuY2VvZiBDb25uZWN0aW9uRXJyb3IpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5lbmQoKTtcbiAgICAgIH1cbiAgICAgIHRocm93IGU7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMuI3F1ZXJ5TG9jay5wdXNoKHVuZGVmaW5lZCk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZW5kKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0aGlzLmNvbm5lY3RlZCkge1xuICAgICAgY29uc3QgdGVybWluYXRpb25NZXNzYWdlID0gbmV3IFVpbnQ4QXJyYXkoWzB4NTgsIDB4MDAsIDB4MDAsIDB4MDAsIDB4MDRdKTtcbiAgICAgIGF3YWl0IHRoaXMuI2J1ZldyaXRlci53cml0ZSh0ZXJtaW5hdGlvbk1lc3NhZ2UpO1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy4jYnVmV3JpdGVyLmZsdXNoKCk7XG4gICAgICB9IGNhdGNoIChfZSkge1xuICAgICAgICAvLyBUaGlzIHN0ZXBzIGNhbiBmYWlsIGlmIHRoZSB1bmRlcmx5aW5nIGNvbm5lY3Rpb24gd2FzIGNsb3NlZCB1bmdyYWNlZnVsbHlcbiAgICAgIH0gZmluYWxseSB7XG4gICAgICAgIHRoaXMuI2Nsb3NlQ29ubmVjdGlvbigpO1xuICAgICAgICB0aGlzLiNvbkRpc2Nvbm5lY3Rpb24oKTtcbiAgICAgIH1cbiAgICB9XG4g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