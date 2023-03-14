import { encodeArgument } from "./encode.ts";
import { decode } from "./decode.ts";
const commandTagRegexp = /^([A-Za-z]+)(?: (\d+))?(?: (\d+))?/;
export var ResultType;
(function(ResultType) {
    ResultType[ResultType["ARRAY"] = 0] = "ARRAY";
    ResultType[ResultType["OBJECT"] = 1] = "OBJECT";
})(ResultType || (ResultType = {}));
export class RowDescription {
    constructor(columnCount, columns){
        this.columnCount = columnCount;
        this.columns = columns;
    }
    columnCount;
    columns;
}
/**
 * This function transforms template string arguments into a query
 *
 * ```ts
 * ["SELECT NAME FROM TABLE WHERE ID = ", " AND DATE < "]
 * // "SELECT NAME FROM TABLE WHERE ID = $1 AND DATE < $2"
 * ```
 */ export function templateStringToQuery(template, args, result_type) {
    const text = template.reduce((curr, next, index)=>{
        return `${curr}$${index}${next}`;
    });
    return new Query(text, result_type, args);
}
function objectQueryToQueryArgs(query, args) {
    args = normalizeObjectQueryArgs(args);
    let counter = 0;
    const clean_args = [];
    const clean_query = query.replaceAll(/(?<=\$)\w+/g, (match)=>{
        match = match.toLowerCase();
        if (match in args) {
            clean_args.push(args[match]);
        } else {
            throw new Error(`No value was provided for the query argument "${match}"`);
        }
        return String(++counter);
    });
    return [
        clean_query,
        clean_args
    ];
}
/** This function lowercases all the keys of the object passed to it and checks for collission names */ function normalizeObjectQueryArgs(args) {
    const normalized_args = Object.fromEntries(Object.entries(args).map(([key, value])=>[
            key.toLowerCase(),
            value
        ]));
    if (Object.keys(normalized_args).length !== Object.keys(args).length) {
        throw new Error("The arguments provided for the query must be unique (insensitive)");
    }
    return normalized_args;
}
export class QueryResult {
    command;
    rowCount;
    /**
   * This variable will be set after the class initialization, however it's required to be set
   * in order to handle result rows coming in
   */ #row_description;
    warnings;
    get rowDescription() {
        return this.#row_description;
    }
    set rowDescription(row_description) {
        // Prevent #row_description from being changed once set
        if (row_description && !this.#row_description) {
            this.#row_description = row_description;
        }
    }
    constructor(query){
        this.query = query;
        this.warnings = [];
    }
    /**
   * This function is required to parse each column
   * of the results
   */ loadColumnDescriptions(description) {
        this.rowDescription = description;
    }
    handleCommandComplete(commandTag) {
        const match = commandTagRegexp.exec(commandTag);
        if (match) {
            this.command = match[1];
            if (match[3]) {
                // COMMAND OID ROWS
                this.rowCount = parseInt(match[3], 10);
            } else {
                // COMMAND ROWS
                this.rowCount = parseInt(match[2], 10);
            }
        }
    }
    /**
   * Add a row to the result based on metadata provided by `rowDescription`
   * This implementation depends on row description not being modified after initialization
   *
   * This function can throw on validation, so any errors must be handled in the message loop accordingly
   */ insertRow(_row) {
        throw new Error("No implementation for insertRow is defined");
    }
    query;
}
export class QueryArrayResult extends QueryResult {
    rows = [];
    insertRow(row_data) {
        if (!this.rowDescription) {
            throw new Error("The row descriptions required to parse the result data weren't initialized");
        }
        // Row description won't be modified after initialization
        const row = row_data.map((raw_value, index)=>{
            const column = this.rowDescription.columns[index];
            if (raw_value === null) {
                return null;
            }
            return decode(raw_value, column);
        });
        this.rows.push(row);
    }
}
function findDuplicatesInArray(array) {
    return array.reduce((duplicates, item, index)=>{
        const is_duplicate = array.indexOf(item) !== index;
        if (is_duplicate && !duplicates.includes(item)) {
            duplicates.push(item);
        }
        return duplicates;
    }, []);
}
function snakecaseToCamelcase(input) {
    return input.split("_").reduce((res, word, i)=>{
        if (i !== 0) {
            word = word[0].toUpperCase() + word.slice(1);
        }
        res += word;
        return res;
    }, "");
}
export class QueryObjectResult extends QueryResult {
    /**
   * The column names will be undefined on the first run of insertRow, since
   */ columns;
    rows = [];
    insertRow(row_data) {
        if (!this.rowDescription) {
            throw new Error("The row description required to parse the result data wasn't initialized");
        }
        // This will only run on the first iteration after row descriptions have been set
        if (!this.columns) {
            if (this.query.fields) {
                if (this.rowDescription.columns.length !== this.query.fields.length) {
                    throw new RangeError("The fields provided for the query don't match the ones returned as a result " + `(${this.rowDescription.columns.length} expected, ${this.query.fields.length} received)`);
                }
                this.columns = this.query.fields;
            } else {
                let column_names;
                if (this.query.camelcase) {
                    column_names = this.rowDescription.columns.map((column)=>snakecaseToCamelcase(column.name));
                } else {
                    column_names = this.rowDescription.columns.map((column)=>column.name);
                }
                // Check field names returned by the database are not duplicated
                const duplicates = findDuplicatesInArray(column_names);
                if (duplicates.length) {
                    throw new Error(`Field names ${duplicates.map((str)=>`"${str}"`).join(", ")} are duplicated in the result of the query`);
                }
                this.columns = column_names;
            }
        }
        // It's safe to assert columns as defined from now on
        const columns = this.columns;
        if (columns.length !== row_data.length) {
            throw new RangeError("The result fields returned by the database don't match the defined structure of the result");
        }
        const row = row_data.reduce((row, raw_value, index)=>{
            const current_column = this.rowDescription.columns[index];
            if (raw_value === null) {
                row[columns[index]] = null;
            } else {
                row[columns[index]] = decode(raw_value, current_column);
            }
            return row;
        }, {});
        this.rows.push(row);
    }
}
export class Query {
    args;
    camelcase;
    /**
   * The explicitly set fields for the query result, they have been validated beforehand
   * for duplicates and invalid names
   */ fields;
    // TODO
    // Should be private
    result_type;
    // TODO
    // Document that this text is the one sent to the database, not the original one
    text;
    constructor(config_or_text, result_type, args = []){
        this.result_type = result_type;
        if (typeof config_or_text === "string") {
            if (!Array.isArray(args)) {
                [config_or_text, args] = objectQueryToQueryArgs(config_or_text, args);
            }
            this.text = config_or_text;
            this.args = args.map(encodeArgument);
        } else {
            let { args: args1 = [] , camelcase , encoder =encodeArgument , fields , // deno-lint-ignore no-unused-vars
            name , text  } = config_or_text;
            // Check that the fields passed are valid and can be used to map
            // the result of the query
            if (fields) {
                const fields_are_clean = fields.every((field)=>/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field));
                if (!fields_are_clean) {
                    throw new TypeError("The fields provided for the query must contain only letters and underscores");
                }
                if (new Set(fields).size !== fields.length) {
                    throw new TypeError("The fields provided for the query must be unique");
                }
                this.fields = fields;
            }
            this.camelcase = camelcase;
            if (!Array.isArray(args1)) {
                [text, args1] = objectQueryToQueryArgs(text, args1);
            }
            this.args = args1.map(encoder);
            this.text = text;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvcG9zdGdyZXNAdjAuMTcuMC9xdWVyeS9xdWVyeS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBlbmNvZGVBcmd1bWVudCwgdHlwZSBFbmNvZGVkQXJnIH0gZnJvbSBcIi4vZW5jb2RlLnRzXCI7XG5pbXBvcnQgeyB0eXBlIENvbHVtbiwgZGVjb2RlIH0gZnJvbSBcIi4vZGVjb2RlLnRzXCI7XG5pbXBvcnQgeyB0eXBlIE5vdGljZSB9IGZyb20gXCIuLi9jb25uZWN0aW9uL21lc3NhZ2UudHNcIjtcblxuLy8gVE9ET1xuLy8gTGltaXQgdGhlIHR5cGUgb2YgcGFyYW1ldGVycyB0aGF0IGNhbiBiZSBwYXNzZWRcbi8vIHRvIGEgcXVlcnlcbi8qKlxuICogaHR0cHM6Ly93d3cucG9zdGdyZXNxbC5vcmcvZG9jcy8xNC9zcWwtcHJlcGFyZS5odG1sXG4gKlxuICogVGhpcyBhcmd1bWVudHMgd2lsbCBiZSBhcHBlbmRlZCB0byB0aGUgcHJlcGFyZWQgc3RhdGVtZW50IHBhc3NlZFxuICogYXMgcXVlcnlcbiAqXG4gKiBUaGV5IHdpbGwgdGFrZSB0aGUgcG9zaXRpb24gYWNjb3JkaW5nIHRvIHRoZSBvcmRlciBpbiB3aGljaCB0aGV5IHdlcmUgcHJvdmlkZWRcbiAqXG4gKiBgYGB0c1xuICogaW1wb3J0IHsgQ2xpZW50IH0gZnJvbSBcIi4uL2NsaWVudC50c1wiO1xuICpcbiAqIGNvbnN0IG15X2NsaWVudCA9IG5ldyBDbGllbnQoKTtcbiAqXG4gKiBhd2FpdCBteV9jbGllbnQucXVlcnlBcnJheShcIlNFTEVDVCBJRCwgTkFNRSBGUk9NIFBFT1BMRSBXSEVSRSBBR0UgPiAkMSBBTkQgQUdFIDwgJDJcIiwgW1xuICogICAxMCwgLy8gJDFcbiAqICAgMjAsIC8vICQyXG4gKiBdKTtcbiAqIGBgYFxuICovXG5leHBvcnQgdHlwZSBRdWVyeUFyZ3VtZW50cyA9IHVua25vd25bXSB8IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXG5jb25zdCBjb21tYW5kVGFnUmVnZXhwID0gL14oW0EtWmEtel0rKSg/OiAoXFxkKykpPyg/OiAoXFxkKykpPy87XG5cbnR5cGUgQ29tbWFuZFR5cGUgPVxuICB8IFwiSU5TRVJUXCJcbiAgfCBcIkRFTEVURVwiXG4gIHwgXCJVUERBVEVcIlxuICB8IFwiU0VMRUNUXCJcbiAgfCBcIk1PVkVcIlxuICB8IFwiRkVUQ0hcIlxuICB8IFwiQ09QWVwiO1xuXG5leHBvcnQgZW51bSBSZXN1bHRUeXBlIHtcbiAgQVJSQVksXG4gIE9CSkVDVCxcbn1cblxuZXhwb3J0IGNsYXNzIFJvd0Rlc2NyaXB0aW9uIHtcbiAgY29uc3RydWN0b3IocHVibGljIGNvbHVtbkNvdW50OiBudW1iZXIsIHB1YmxpYyBjb2x1bW5zOiBDb2x1bW5bXSkge31cbn1cblxuLyoqXG4gKiBUaGlzIGZ1bmN0aW9uIHRyYW5zZm9ybXMgdGVtcGxhdGUgc3RyaW5nIGFyZ3VtZW50cyBpbnRvIGEgcXVlcnlcbiAqXG4gKiBgYGB0c1xuICogW1wiU0VMRUNUIE5BTUUgRlJPTSBUQUJMRSBXSEVSRSBJRCA9IFwiLCBcIiBBTkQgREFURSA8IFwiXVxuICogLy8gXCJTRUxFQ1QgTkFNRSBGUk9NIFRBQkxFIFdIRVJFIElEID0gJDEgQU5EIERBVEUgPCAkMlwiXG4gKiBgYGBcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRlbXBsYXRlU3RyaW5nVG9RdWVyeTxUIGV4dGVuZHMgUmVzdWx0VHlwZT4oXG4gIHRlbXBsYXRlOiBUZW1wbGF0ZVN0cmluZ3NBcnJheSxcbiAgYXJnczogdW5rbm93bltdLFxuICByZXN1bHRfdHlwZTogVCxcbik6IFF1ZXJ5PFQ+IHtcbiAgY29uc3QgdGV4dCA9IHRlbXBsYXRlLnJlZHVjZSgoY3VyciwgbmV4dCwgaW5kZXgpID0+IHtcbiAgICByZXR1cm4gYCR7Y3Vycn0kJHtpbmRleH0ke25leHR9YDtcbiAgfSk7XG5cbiAgcmV0dXJuIG5ldyBRdWVyeSh0ZXh0LCByZXN1bHRfdHlwZSwgYXJncyk7XG59XG5cbmZ1bmN0aW9uIG9iamVjdFF1ZXJ5VG9RdWVyeUFyZ3MoXG4gIHF1ZXJ5OiBzdHJpbmcsXG4gIGFyZ3M6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LFxuKTogW3N0cmluZywgdW5rbm93bltdXSB7XG4gIGFyZ3MgPSBub3JtYWxpemVPYmplY3RRdWVyeUFyZ3MoYXJncyk7XG5cbiAgbGV0IGNvdW50ZXIgPSAwO1xuICBjb25zdCBjbGVhbl9hcmdzOiB1bmtub3duW10gPSBbXTtcbiAgY29uc3QgY2xlYW5fcXVlcnkgPSBxdWVyeS5yZXBsYWNlQWxsKC8oPzw9XFwkKVxcdysvZywgKG1hdGNoKSA9PiB7XG4gICAgbWF0Y2ggPSBtYXRjaC50b0xvd2VyQ2FzZSgpO1xuICAgIGlmIChtYXRjaCBpbiBhcmdzKSB7XG4gICAgICBjbGVhbl9hcmdzLnB1c2goYXJnc1ttYXRjaF0pO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBObyB2YWx1ZSB3YXMgcHJvdmlkZWQgZm9yIHRoZSBxdWVyeSBhcmd1bWVudCBcIiR7bWF0Y2h9XCJgLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gU3RyaW5nKCsrY291bnRlcik7XG4gIH0pO1xuXG4gIHJldHVybiBbY2xlYW5fcXVlcnksIGNsZWFuX2FyZ3NdO1xufVxuXG4vKiogVGhpcyBmdW5jdGlvbiBsb3dlcmNhc2VzIGFsbCB0aGUga2V5cyBvZiB0aGUgb2JqZWN0IHBhc3NlZCB0byBpdCBhbmQgY2hlY2tzIGZvciBjb2xsaXNzaW9uIG5hbWVzICovXG5mdW5jdGlvbiBub3JtYWxpemVPYmplY3RRdWVyeUFyZ3MoXG4gIGFyZ3M6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LFxuKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuICBjb25zdCBub3JtYWxpemVkX2FyZ3MgPSBPYmplY3QuZnJvbUVudHJpZXMoXG4gICAgT2JqZWN0LmVudHJpZXMoYXJncykubWFwKChcbiAgICAgIFtrZXksIHZhbHVlXSxcbiAgICApID0+IFtrZXkudG9Mb3dlckNhc2UoKSwgdmFsdWVdKSxcbiAgKTtcblxuICBpZiAoT2JqZWN0LmtleXMobm9ybWFsaXplZF9hcmdzKS5sZW5ndGggIT09IE9iamVjdC5rZXlzKGFyZ3MpLmxlbmd0aCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIFwiVGhlIGFyZ3VtZW50cyBwcm92aWRlZCBmb3IgdGhlIHF1ZXJ5IG11c3QgYmUgdW5pcXVlIChpbnNlbnNpdGl2ZSlcIixcbiAgICApO1xuICB9XG5cbiAgcmV0dXJuIG5vcm1hbGl6ZWRfYXJncztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBRdWVyeU9wdGlvbnMge1xuICBhcmdzPzogUXVlcnlBcmd1bWVudHM7XG4gIGVuY29kZXI/OiAoYXJnOiB1bmtub3duKSA9PiBFbmNvZGVkQXJnO1xuICBuYW1lPzogc3RyaW5nO1xuICAvLyBUT0RPXG4gIC8vIFJlbmFtZSB0byBxdWVyeVxuICB0ZXh0OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUXVlcnlPYmplY3RPcHRpb25zIGV4dGVuZHMgUXVlcnlPcHRpb25zIHtcbiAgLy8gVE9ET1xuICAvLyBTdXBwb3J0IG11bHRpcGxlIGNhc2Ugb3B0aW9uc1xuICAvKipcbiAgICogRW5hYmxpbmcgY2FtZWxjYXNlIHdpbGwgdHJhbnNmb3JtIGFueSBzbmFrZSBjYXNlIGZpZWxkIG5hbWVzIGNvbWluZyBmcm9tIHRoZSBkYXRhYmFzZSBpbnRvIGNhbWVsIGNhc2Ugb25lc1xuICAgKlxuICAgKiBFeDogYFNFTEVDVCAxIEFTIG15X2ZpZWxkYCB3aWxsIHJldHVybiBgeyBteUZpZWxkOiAxIH1gXG4gICAqXG4gICAqIFRoaXMgd29uJ3QgaGF2ZSBhbnkgZWZmZWN0IGlmIHlvdSBleHBsaWNpdGx5IHNldCB0aGUgZmllbGQgbmFtZXMgd2l0aCB0aGUgYGZpZWxkc2AgcGFyYW1ldGVyXG4gICAqL1xuICBjYW1lbGNhc2U/OiBib29sZWFuO1xuICAvKipcbiAgICogVGhpcyBwYXJhbWV0ZXIgc3VwZXJzZWRlcyBxdWVyeSBjb2x1bW4gbmFtZXMgY29taW5nIGZyb20gdGhlIGRhdGFiYXNlcyBpbiB0aGUgb3JkZXIgdGhleSB3ZXJlIHByb3ZpZGVkLlxuICAgKiBGaWVsZHMgbXVzdCBiZSB1bmlxdWUgYW5kIGJlIGluIHRoZSByYW5nZSBvZiAoYS16QS1aMC05XyksIG90aGVyd2lzZSB0aGUgcXVlcnkgd2lsbCB0aHJvdyBiZWZvcmUgZXhlY3V0aW9uLlxuICAgKiBBIGZpZWxkIGNhbiBub3Qgc3RhcnQgd2l0aCBhIG51bWJlciwganVzdCBsaWtlIEphdmFTY3JpcHQgdmFyaWFibGVzXG4gICAqXG4gICAqIFRoaXMgc2V0dGluZyBvdmVycmlkZXMgdGhlIGNhbWVsY2FzZSBvcHRpb25cbiAgICpcbiAgICogRXg6IGBTRUxFQ1QgJ0EnLCAnQicgQVMgbXlfZmllbGRgIHdpdGggZmllbGRzIGBbXCJmaWVsZF8xXCIsIFwiZmllbGRfMlwiXWAgd2lsbCByZXR1cm4gYHsgZmllbGRfMTogXCJBXCIsIGZpZWxkXzI6IFwiQlwiIH1gXG4gICAqL1xuICBmaWVsZHM/OiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGNsYXNzIFF1ZXJ5UmVzdWx0IHtcbiAgcHVibGljIGNvbW1hbmQhOiBDb21tYW5kVHlwZTtcbiAgcHVibGljIHJvd0NvdW50PzogbnVtYmVyO1xuICAvKipcbiAgICogVGhpcyB2YXJpYWJsZSB3aWxsIGJlIHNldCBhZnRlciB0aGUgY2xhc3MgaW5pdGlhbGl6YXRpb24sIGhvd2V2ZXIgaXQncyByZXF1aXJlZCB0byBiZSBzZXRcbiAgICogaW4gb3JkZXIgdG8gaGFuZGxlIHJlc3VsdCByb3dzIGNvbWluZyBpblxuICAgKi9cbiAgI3Jvd19kZXNjcmlwdGlvbj86IFJvd0Rlc2NyaXB0aW9uO1xuICBwdWJsaWMgd2FybmluZ3M6IE5vdGljZVtdID0gW107XG5cbiAgZ2V0IHJvd0Rlc2NyaXB0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLiNyb3dfZGVzY3JpcHRpb247XG4gIH1cblxuICBzZXQgcm93RGVzY3JpcHRpb24ocm93X2Rlc2NyaXB0aW9uOiBSb3dEZXNjcmlwdGlvbiB8IHVuZGVmaW5lZCkge1xuICAgIC8vIFByZXZlbnQgI3Jvd19kZXNjcmlwdGlvbiBmcm9tIGJlaW5nIGNoYW5nZWQgb25jZSBzZXRcbiAgICBpZiAocm93X2Rlc2NyaXB0aW9uICYmICF0aGlzLiNyb3dfZGVzY3JpcHRpb24pIHtcbiAgICAgIHRoaXMuI3Jvd19kZXNjcmlwdGlvbiA9IHJvd19kZXNjcmlwdGlvbjtcbiAgICB9XG4gIH1cblxuICBjb25zdHJ1Y3RvcihwdWJsaWMgcXVlcnk6IFF1ZXJ5PFJlc3VsdFR5cGU+KSB7fVxuXG4gIC8qKlxuICAgKiBUaGlzIGZ1bmN0aW9uIGlzIHJlcXVpcmVkIHRvIHBhcnNlIGVhY2ggY29sdW1uXG4gICAqIG9mIHRoZSByZXN1bHRzXG4gICAqL1xuICBsb2FkQ29sdW1uRGVzY3JpcHRpb25zKGRlc2NyaXB0aW9uOiBSb3dEZXNjcmlwdGlvbikge1xuICAgIHRoaXMucm93RGVzY3JpcHRpb24gPSBkZXNjcmlwdGlvbjtcbiAgfVxuXG4gIGhhbmRsZUNvbW1hbmRDb21wbGV0ZShjb21tYW5kVGFnOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCBtYXRjaCA9IGNvbW1hbmRUYWdSZWdleHAuZXhlYyhjb21tYW5kVGFnKTtcbiAgICBpZiAobWF0Y2gpIHtcbiAgICAgIHRoaXMuY29tbWFuZCA9IG1hdGNoWzFdIGFzIENvbW1hbmRUeXBlO1xuICAgICAgaWYgKG1hdGNoWzNdKSB7XG4gICAgICAgIC8vIENPTU1BTkQgT0lEIFJPV1NcbiAgICAgICAgdGhpcy5yb3dDb3VudCA9IHBhcnNlSW50KG1hdGNoWzNdLCAxMCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBDT01NQU5EIFJPV1NcbiAgICAgICAgdGhpcy5yb3dDb3VudCA9IHBhcnNlSW50KG1hdGNoWzJdLCAxMCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEFkZCBhIHJvdyB0byB0aGUgcmVzdWx0IGJhc2VkIG9uIG1ldGFkYXRhIHByb3ZpZGVkIGJ5IGByb3dEZXNjcmlwdGlvbmBcbiAgICogVGhpcyBpbXBsZW1lbnRhdGlvbiBkZXBlbmRzIG9uIHJvdyBkZXNjcmlwdGlvbiBub3QgYmVpbmcgbW9kaWZpZWQgYWZ0ZXIgaW5pdGlhbGl6YXRpb25cbiAgICpcbiAgICogVGhpcyBmdW5jdGlvbiBjYW4gdGhyb3cgb24gdmFsaWRhdGlvbiwgc28gYW55IGVycm9ycyBtdXN0IGJlIGhhbmRsZWQgaW4gdGhlIG1lc3NhZ2UgbG9vcCBhY2NvcmRpbmdseVxuICAgKi9cbiAgaW5zZXJ0Um93KF9yb3c6IFVpbnQ4QXJyYXlbXSk6IHZvaWQge1xuICAgIHRocm93IG5ldyBFcnJvcihcIk5vIGltcGxlbWVudGF0aW9uIGZvciBpbnNlcnRSb3cgaXMgZGVmaW5lZFwiKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgUXVlcnlBcnJheVJlc3VsdDxUIGV4dGVuZHMgQXJyYXk8dW5rbm93bj4gPSBBcnJheTx1bmtub3duPj5cbiAgZXh0ZW5kcyBRdWVyeVJlc3VsdCB7XG4gIHB1YmxpYyByb3dzOiBUW10gPSBbXTtcblxuICBpbnNlcnRSb3cocm93X2RhdGE6IFVpbnQ4QXJyYXlbXSkge1xuICAgIGlmICghdGhpcy5yb3dEZXNjcmlwdGlvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBcIlRoZSByb3cgZGVzY3JpcHRpb25zIHJlcXVpcmVkIHRvIHBhcnNlIHRoZSByZXN1bHQgZGF0YSB3ZXJlbid0IGluaXRpYWxpemVkXCIsXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIFJvdyBkZXNjcmlwdGlvbiB3b24ndCBiZSBtb2RpZmllZCBhZnRlciBpbml0aWFsaXphdGlvblxuICAgIGNvbnN0IHJvdyA9IHJvd19kYXRhLm1hcCgocmF3X3ZhbHVlLCBpbmRleCkgPT4ge1xuICAgICAgY29uc3QgY29sdW1uID0gdGhpcy5yb3dEZXNjcmlwdGlvbiEuY29sdW1uc1tpbmRleF07XG5cbiAgICAgIGlmIChyYXdfdmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgICByZXR1cm4gZGVjb2RlKHJhd192YWx1ZSwgY29sdW1uKTtcbiAgICB9KSBhcyBUO1xuXG4gICAgdGhpcy5yb3dzLnB1c2gocm93KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBmaW5kRHVwbGljYXRlc0luQXJyYXkoYXJyYXk6IHN0cmluZ1tdKTogc3RyaW5nW10ge1xuICByZXR1cm4gYXJyYXkucmVkdWNlKChkdXBsaWNhdGVzLCBpdGVtLCBpbmRleCkgPT4ge1xuICAgIGNvbnN0IGlzX2R1cGxpY2F0ZSA9IGFycmF5LmluZGV4T2YoaXRlbSkgIT09IGluZGV4O1xuICAgIGlmIChpc19kdXBsaWNhdGUgJiYgIWR1cGxpY2F0ZXMuaW5jbHVkZXMoaXRlbSkpIHtcbiAgICAgIGR1cGxpY2F0ZXMucHVzaChpdGVtKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZHVwbGljYXRlcztcbiAgfSwgW10gYXMgc3RyaW5nW10pO1xufVxuXG5mdW5jdGlvbiBzbmFrZWNhc2VUb0NhbWVsY2FzZShpbnB1dDogc3RyaW5nKSB7XG4gIHJldHVybiBpbnB1dFxuICAgIC5zcGxpdChcIl9cIilcbiAgICAucmVkdWNlKFxuICAgICAgKHJlcywgd29yZCwgaSkgPT4ge1xuICAgICAgICBpZiAoaSAhPT0gMCkge1xuICAgICAgICAgIHdvcmQgPSB3b3JkWzBdLnRvVXBwZXJDYXNlKCkgKyB3b3JkLnNsaWNlKDEpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmVzICs9IHdvcmQ7XG4gICAgICAgIHJldHVybiByZXM7XG4gICAgICB9LFxuICAgICAgXCJcIixcbiAgICApO1xufVxuXG5leHBvcnQgY2xhc3MgUXVlcnlPYmplY3RSZXN1bHQ8XG4gIFQgPSBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPixcbj4gZXh0ZW5kcyBRdWVyeVJlc3VsdCB7XG4gIC8qKlxuICAgKiBUaGUgY29sdW1uIG5hbWVzIHdpbGwgYmUgdW5kZWZpbmVkIG9uIHRoZSBmaXJzdCBydW4gb2YgaW5zZXJ0Um93LCBzaW5jZVxuICAgKi9cbiAgcHVibGljIGNvbHVtbnM/OiBzdHJpbmdbXTtcbiAgcHVibGljIHJvd3M6IFRbXSA9IFtdO1xuXG4gIGluc2VydFJvdyhyb3dfZGF0YTogVWludDhBcnJheVtdKSB7XG4gICAgaWYgKCF0aGlzLnJvd0Rlc2NyaXB0aW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIFwiVGhlIHJvdyBkZXNjcmlwdGlvbiByZXF1aXJlZCB0byBwYXJzZSB0aGUgcmVzdWx0IGRhdGEgd2Fzbid0IGluaXRpYWxpemVkXCIsXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIFRoaXMgd2lsbCBvbmx5IHJ1biBvbiB0aGUgZmlyc3QgaXRlcmF0aW9uIGFmdGVyIHJvdyBkZXNjcmlwdGlvbnMgaGF2ZSBiZWVuIHNldFxuICAgIGlmICghdGhpcy5jb2x1bW5zKSB7XG4gICAgICBpZiAodGhpcy5xdWVyeS5maWVsZHMpIHtcbiAgICAgICAgaWYgKHRoaXMucm93RGVzY3JpcHRpb24uY29sdW1ucy5sZW5ndGggIT09IHRoaXMucXVlcnkuZmllbGRzLmxlbmd0aCkge1xuICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKFxuICAgICAgICAgICAgXCJUaGUgZmllbGRzIHByb3ZpZGVkIGZvciB0aGUgcXVlcnkgZG9uJ3QgbWF0Y2ggdGhlIG9uZXMgcmV0dXJuZWQgYXMgYSByZXN1bHQgXCIgK1xuICAgICAgICAgICAgICBgKCR7dGhpcy5yb3dEZXNjcmlwdGlvbi5jb2x1bW5zLmxlbmd0aH0gZXhwZWN0ZWQsICR7dGhpcy5xdWVyeS5maWVsZHMubGVuZ3RofSByZWNlaXZlZClgLFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmNvbHVtbnMgPSB0aGlzLnF1ZXJ5LmZpZWxkcztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxldCBjb2x1bW5fbmFtZXM6IHN0cmluZ1tdO1xuICAgICAgICBpZiAodGhpcy5xdWVyeS5jYW1lbGNhc2UpIHtcbiAgICAgICAgICBjb2x1bW5fbmFtZXMgPSB0aGlzLnJvd0Rlc2NyaXB0aW9uLmNvbHVtbnMubWFwKChjb2x1bW4pID0+XG4gICAgICAgICAgICBzbmFrZWNhc2VUb0NhbWVsY2FzZShjb2x1bW4ubmFtZSlcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbHVtbl9uYW1lcyA9IHRoaXMucm93RGVzY3JpcHRpb24uY29sdW1ucy5tYXAoKGNvbHVtbikgPT5cbiAgICAgICAgICAgIGNvbHVtbi5uYW1lXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENoZWNrIGZpZWxkIG5hbWVzIHJldHVybmVkIGJ5IHRoZSBkYXRhYmFzZSBhcmUgbm90IGR1cGxpY2F0ZWRcbiAgICAgICAgY29uc3QgZHVwbGljYXRlcyA9IGZpbmREdXBsaWNhdGVzSW5BcnJheShjb2x1bW5fbmFtZXMpO1xuICAgICAgICBpZiAoZHVwbGljYXRlcy5sZW5ndGgpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICBgRmllbGQgbmFtZXMgJHtcbiAgICAgICAgICAgICAgZHVwbGljYXRlcy5tYXAoKHN0cikgPT4gYFwiJHtzdHJ9XCJgKS5qb2luKFwiLCBcIilcbiAgICAgICAgICAgIH0gYXJlIGR1cGxpY2F0ZWQgaW4gdGhlIHJlc3VsdCBvZiB0aGUgcXVlcnlgLFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmNvbHVtbnMgPSBjb2x1bW5fbmFtZXM7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gSXQncyBzYWZlIHRvIGFzc2VydCBjb2x1bW5zIGFzIGRlZmluZWQgZnJvbSBub3cgb25cbiAgICBjb25zdCBjb2x1bW5zID0gdGhpcy5jb2x1bW5zITtcblxuICAgIGlmIChjb2x1bW5zLmxlbmd0aCAhPT0gcm93X2RhdGEubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcihcbiAgICAgICAgXCJUaGUgcmVzdWx0IGZpZWxkcyByZXR1cm5lZCBieSB0aGUgZGF0YWJhc2UgZG9uJ3QgbWF0Y2ggdGhlIGRlZmluZWQgc3RydWN0dXJlIG9mIHRoZSByZXN1bHRcIixcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3Qgcm93ID0gcm93X2RhdGEucmVkdWNlKFxuICAgICAgKHJvdywgcmF3X3ZhbHVlLCBpbmRleCkgPT4ge1xuICAgICAgICBjb25zdCBjdXJyZW50X2NvbHVtbiA9IHRoaXMucm93RGVzY3JpcHRpb24hLmNvbHVtbnNbaW5kZXhdO1xuXG4gICAgICAgIGlmIChyYXdfdmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgICByb3dbY29sdW1uc1tpbmRleF1dID0gbnVsbDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByb3dbY29sdW1uc1tpbmRleF1dID0gZGVjb2RlKHJhd192YWx1ZSwgY3VycmVudF9jb2x1bW4pO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJvdztcbiAgICAgIH0sXG4gICAgICB7fSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPixcbiAgICApO1xuXG4gICAgdGhpcy5yb3dzLnB1c2gocm93IGFzIFQpO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBRdWVyeTxUIGV4dGVuZHMgUmVzdWx0VHlwZT4ge1xuICBwdWJsaWMgYXJnczogRW5jb2RlZEFyZ1tdO1xuICBwdWJsaWMgY2FtZWxjYXNlPzogYm9vbGVhbjtcbiAgLyoqXG4gICAqIFRoZSBleHBsaWNpdGx5IHNldCBmaWVsZHMgZm9yIHRoZSBxdWVyeSByZXN1bHQsIHRoZXkgaGF2ZSBiZWVuIHZhbGlkYXRlZCBiZWZvcmVoYW5kXG4gICAqIGZvciBkdXBsaWNhdGVzIGFuZCBpbnZhbGlkIG5hbWVzXG4gICAqL1xuICBwdWJsaWMgZmllbGRzPzogc3RyaW5nW107XG4gIC8vIFRPRE9cbiAgLy8gU2hvdWxkIGJlIHByaXZhdGVcbiAgcHVibGljIHJlc3VsdF90eXBlOiBSZXN1bHRUeXBlO1xuICAvLyBUT0RPXG4gIC8vIERvY3VtZW50IHRoYXQgdGhpcyB0ZXh0IGlzIHRoZSBvbmUgc2VudCB0byB0aGUgZGF0YWJhc2UsIG5vdCB0aGUgb3JpZ2luYWwgb25lXG4gIHB1YmxpYyB0ZXh0OiBzdHJpbmc7XG4gIGNvbnN0cnVjdG9yKGNvbmZpZzogUXVlcnlPYmplY3RPcHRpb25zLCByZXN1bHRfdHlwZTogVCk7XG4gIGNvbnN0cnVjdG9yKHRleHQ6IHN0cmluZywgcmVzdWx0X3R5cGU6IFQsIGFyZ3M/OiBRdWVyeUFyZ3VtZW50cyk7XG4gIGNvbnN0cnVjdG9yKFxuICAgIGNvbmZpZ19vcl90ZXh0OiBzdHJpbmcgfCBRdWVyeU9iamVjdE9wdGlvbnMsXG4gICAgcmVzdWx0X3R5cGU6IFQsXG4gICAgYXJnczogUXVlcnlBcmd1bWVudHMgPSBbXSxcbiAgKSB7XG4gICAgdGhpcy5yZXN1bHRfdHlwZSA9IHJlc3VsdF90eXBlO1xuICAgIGlmICh0eXBlb2YgY29uZmlnX29yX3RleHQgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgIGlmICghQXJyYXkuaXNBcnJheShhcmdzKSkge1xuICAgICAgICBbY29uZmlnX29yX3RleHQsIGFyZ3NdID0gb2JqZWN0UXVlcnlUb1F1ZXJ5QXJncyhjb25maWdfb3JfdGV4dCwgYXJncyk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMudGV4dCA9IGNvbmZpZ19vcl90ZXh0O1xuICAgICAgdGhpcy5hcmdzID0gYXJncy5tYXAoZW5jb2RlQXJndW1lbnQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBsZXQge1xuICAgICAgICBhcmdzID0gW10sXG4gICAgICAgIGNhbWVsY2FzZSxcbiAgICAgICAgZW5jb2RlciA9IGVuY29kZUFyZ3VtZW50LFxuICAgICAgICBmaWVsZHMsXG4gICAgICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tdW51c2VkLXZhcnNcbiAgICAgICAgbmFtZSxcbiAgICAgICAgdGV4dCxcbiAgICAgIH0gPSBjb25maWdfb3JfdGV4dDtcblxuICAgICAgLy8gQ2hlY2sgdGhhdCB0aGUgZmllbGRzIHBhc3NlZCBhcmUgdmFsaWQgYW5kIGNhbiBiZSB1c2VkIHRvIG1hcFxuICAgICAgLy8gdGhlIHJlc3VsdCBvZiB0aGUgcXVlcnlcbiAgICAgIGlmIChmaWVsZHMpIHtcbiAgICAgICAgY29uc3QgZmllbGRzX2FyZV9jbGVhbiA9IGZpZWxkcy5ldmVyeSgoZmllbGQpID0+XG4gICAgICAgICAgL15bYS16QS1aX11bYS16QS1aMC05X10qJC8udGVzdChmaWVsZClcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCFmaWVsZHNfYXJlX2NsZWFuKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcbiAgICAgICAgICAgIFwiVGhlIGZpZWxkcyBwcm92aWRlZCBmb3IgdGhlIHF1ZXJ5IG11c3QgY29udGFpbiBvbmx5IGxldHRlcnMgYW5kIHVuZGVyc2NvcmVzXCIsXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChuZXcgU2V0KGZpZWxkcykuc2l6ZSAhPT0gZmllbGRzLmxlbmd0aCkge1xuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXG4gICAgICAgICAgICBcIlRoZSBmaWVsZHMgcHJvdmlkZWQgZm9yIHRoZSBxdWVyeSBtdXN0IGJlIHVuaXF1ZVwiLFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmZpZWxkcyA9IGZpZWxkcztcbiAgICAgIH1cblxuICAgICAgdGhpcy5jYW1lbGNhc2UgPSBjYW1lbGNhc2U7XG5cbiAgICAgIGlmICghQXJyYXkuaXNBcnJheShhcmdzKSkge1xuICAgICAgICBbdGV4dCwgYXJnc10gPSBvYmplY3RRdWVyeVRvUXVlcnlBcmdzKHRleHQsIGFyZ3MpO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmFyZ3MgPSBhcmdzLm1hcChlbmNvZGVyKTtcbiAgICAgIHRoaXMudGV4dCA9IHRleHQ7XG4gICAgfVxuICB9XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5n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