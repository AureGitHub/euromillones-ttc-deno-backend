import { Oid } from "./oid.ts";
import { decodeBigint, decodeBigintArray, decodeBoolean, decodeBooleanArray, decodeBox, decodeBoxArray, decodeBytea, decodeByteaArray, decodeCircle, decodeCircleArray, decodeDate, decodeDateArray, decodeDatetime, decodeDatetimeArray, decodeInt, decodeIntArray, decodeJson, decodeJsonArray, decodeLine, decodeLineArray, decodeLineSegment, decodeLineSegmentArray, decodePath, decodePathArray, decodePoint, decodePointArray, decodePolygon, decodePolygonArray, decodeStringArray, decodeTid, decodeTidArray } from "./decoders.ts";
export class Column {
    constructor(name, tableOid, index, typeOid, columnLength, typeModifier, format){
        this.name = name;
        this.tableOid = tableOid;
        this.index = index;
        this.typeOid = typeOid;
        this.columnLength = columnLength;
        this.typeModifier = typeModifier;
        this.format = format;
    }
    name;
    tableOid;
    index;
    typeOid;
    columnLength;
    typeModifier;
    format;
}
var Format;
(function(Format) {
    Format[Format["TEXT"] = 0] = "TEXT";
    Format[Format["BINARY"] = 1] = "BINARY";
})(Format || (Format = {}));
const decoder = new TextDecoder();
// TODO
// Decode binary fields
function decodeBinary() {
    throw new Error("Not implemented!");
}
// deno-lint-ignore no-explicit-any
function decodeText(value, typeOid) {
    const strValue = decoder.decode(value);
    switch(typeOid){
        case Oid.bpchar:
        case Oid.char:
        case Oid.cidr:
        case Oid.float4:
        case Oid.float8:
        case Oid.inet:
        case Oid.macaddr:
        case Oid.name:
        case Oid.numeric:
        case Oid.oid:
        case Oid.regclass:
        case Oid.regconfig:
        case Oid.regdictionary:
        case Oid.regnamespace:
        case Oid.regoper:
        case Oid.regoperator:
        case Oid.regproc:
        case Oid.regprocedure:
        case Oid.regrole:
        case Oid.regtype:
        case Oid.text:
        case Oid.time:
        case Oid.timetz:
        case Oid.uuid:
        case Oid.varchar:
        case Oid.void:
            return strValue;
        case Oid.bpchar_array:
        case Oid.char_array:
        case Oid.cidr_array:
        case Oid.float4_array:
        case Oid.float8_array:
        case Oid.inet_array:
        case Oid.macaddr_array:
        case Oid.name_array:
        case Oid.numeric_array:
        case Oid.oid_array:
        case Oid.regclass_array:
        case Oid.regconfig_array:
        case Oid.regdictionary_array:
        case Oid.regnamespace_array:
        case Oid.regoper_array:
        case Oid.regoperator_array:
        case Oid.regproc_array:
        case Oid.regprocedure_array:
        case Oid.regrole_array:
        case Oid.regtype_array:
        case Oid.text_array:
        case Oid.time_array:
        case Oid.timetz_array:
        case Oid.uuid_array:
        case Oid.varchar_array:
            return decodeStringArray(strValue);
        case Oid.int2:
        case Oid.int4:
        case Oid.xid:
            return decodeInt(strValue);
        case Oid.int2_array:
        case Oid.int4_array:
        case Oid.xid_array:
            return decodeIntArray(strValue);
        case Oid.bool:
            return decodeBoolean(strValue);
        case Oid.bool_array:
            return decodeBooleanArray(strValue);
        case Oid.box:
            return decodeBox(strValue);
        case Oid.box_array:
            return decodeBoxArray(strValue);
        case Oid.circle:
            return decodeCircle(strValue);
        case Oid.circle_array:
            return decodeCircleArray(strValue);
        case Oid.bytea:
            return decodeBytea(strValue);
        case Oid.byte_array:
            return decodeByteaArray(strValue);
        case Oid.date:
            return decodeDate(strValue);
        case Oid.date_array:
            return decodeDateArray(strValue);
        case Oid.int8:
            return decodeBigint(strValue);
        case Oid.int8_array:
            return decodeBigintArray(strValue);
        case Oid.json:
        case Oid.jsonb:
            return decodeJson(strValue);
        case Oid.json_array:
        case Oid.jsonb_array:
            return decodeJsonArray(strValue);
        case Oid.line:
            return decodeLine(strValue);
        case Oid.line_array:
            return decodeLineArray(strValue);
        case Oid.lseg:
            return decodeLineSegment(strValue);
        case Oid.lseg_array:
            return decodeLineSegmentArray(strValue);
        case Oid.path:
            return decodePath(strValue);
        case Oid.path_array:
            return decodePathArray(strValue);
        case Oid.point:
            return decodePoint(strValue);
        case Oid.point_array:
            return decodePointArray(strValue);
        case Oid.polygon:
            return decodePolygon(strValue);
        case Oid.polygon_array:
            return decodePolygonArray(strValue);
        case Oid.tid:
            return decodeTid(strValue);
        case Oid.tid_array:
            return decodeTidArray(strValue);
        case Oid.timestamp:
        case Oid.timestamptz:
            return decodeDatetime(strValue);
        case Oid.timestamp_array:
        case Oid.timestamptz_array:
            return decodeDatetimeArray(strValue);
        default:
            // A separate category for not handled values
            // They might or might not be represented correctly as strings,
            // returning them to the user as raw strings allows them to parse
            // them as they see fit
            return strValue;
    }
}
export function decode(value, column) {
    if (column.format === Format.BINARY) {
        return decodeBinary();
    } else if (column.format === Format.TEXT) {
        return decodeText(value, column.typeOid);
    } else {
        throw new Error(`Unknown column format: ${column.format}`);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvcG9zdGdyZXNAdjAuMTcuMC9xdWVyeS9kZWNvZGUudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgT2lkIH0gZnJvbSBcIi4vb2lkLnRzXCI7XG5pbXBvcnQge1xuICBkZWNvZGVCaWdpbnQsXG4gIGRlY29kZUJpZ2ludEFycmF5LFxuICBkZWNvZGVCb29sZWFuLFxuICBkZWNvZGVCb29sZWFuQXJyYXksXG4gIGRlY29kZUJveCxcbiAgZGVjb2RlQm94QXJyYXksXG4gIGRlY29kZUJ5dGVhLFxuICBkZWNvZGVCeXRlYUFycmF5LFxuICBkZWNvZGVDaXJjbGUsXG4gIGRlY29kZUNpcmNsZUFycmF5LFxuICBkZWNvZGVEYXRlLFxuICBkZWNvZGVEYXRlQXJyYXksXG4gIGRlY29kZURhdGV0aW1lLFxuICBkZWNvZGVEYXRldGltZUFycmF5LFxuICBkZWNvZGVJbnQsXG4gIGRlY29kZUludEFycmF5LFxuICBkZWNvZGVKc29uLFxuICBkZWNvZGVKc29uQXJyYXksXG4gIGRlY29kZUxpbmUsXG4gIGRlY29kZUxpbmVBcnJheSxcbiAgZGVjb2RlTGluZVNlZ21lbnQsXG4gIGRlY29kZUxpbmVTZWdtZW50QXJyYXksXG4gIGRlY29kZVBhdGgsXG4gIGRlY29kZVBhdGhBcnJheSxcbiAgZGVjb2RlUG9pbnQsXG4gIGRlY29kZVBvaW50QXJyYXksXG4gIGRlY29kZVBvbHlnb24sXG4gIGRlY29kZVBvbHlnb25BcnJheSxcbiAgZGVjb2RlU3RyaW5nQXJyYXksXG4gIGRlY29kZVRpZCxcbiAgZGVjb2RlVGlkQXJyYXksXG59IGZyb20gXCIuL2RlY29kZXJzLnRzXCI7XG5cbmV4cG9ydCBjbGFzcyBDb2x1bW4ge1xuICBjb25zdHJ1Y3RvcihcbiAgICBwdWJsaWMgbmFtZTogc3RyaW5nLFxuICAgIHB1YmxpYyB0YWJsZU9pZDogbnVtYmVyLFxuICAgIHB1YmxpYyBpbmRleDogbnVtYmVyLFxuICAgIHB1YmxpYyB0eXBlT2lkOiBudW1iZXIsXG4gICAgcHVibGljIGNvbHVtbkxlbmd0aDogbnVtYmVyLFxuICAgIHB1YmxpYyB0eXBlTW9kaWZpZXI6IG51bWJlcixcbiAgICBwdWJsaWMgZm9ybWF0OiBGb3JtYXQsXG4gICkge31cbn1cblxuZW51bSBGb3JtYXQge1xuICBURVhUID0gMCxcbiAgQklOQVJZID0gMSxcbn1cblxuY29uc3QgZGVjb2RlciA9IG5ldyBUZXh0RGVjb2RlcigpO1xuXG4vLyBUT0RPXG4vLyBEZWNvZGUgYmluYXJ5IGZpZWxkc1xuZnVuY3Rpb24gZGVjb2RlQmluYXJ5KCkge1xuICB0aHJvdyBuZXcgRXJyb3IoXCJOb3QgaW1wbGVtZW50ZWQhXCIpO1xufVxuXG4vLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuZnVuY3Rpb24gZGVjb2RlVGV4dCh2YWx1ZTogVWludDhBcnJheSwgdHlwZU9pZDogbnVtYmVyKTogYW55IHtcbiAgY29uc3Qgc3RyVmFsdWUgPSBkZWNvZGVyLmRlY29kZSh2YWx1ZSk7XG5cbiAgc3dpdGNoICh0eXBlT2lkKSB7XG4gICAgY2FzZSBPaWQuYnBjaGFyOlxuICAgIGNhc2UgT2lkLmNoYXI6XG4gICAgY2FzZSBPaWQuY2lkcjpcbiAgICBjYXNlIE9pZC5mbG9hdDQ6XG4gICAgY2FzZSBPaWQuZmxvYXQ4OlxuICAgIGNhc2UgT2lkLmluZXQ6XG4gICAgY2FzZSBPaWQubWFjYWRkcjpcbiAgICBjYXNlIE9pZC5uYW1lOlxuICAgIGNhc2UgT2lkLm51bWVyaWM6XG4gICAgY2FzZSBPaWQub2lkOlxuICAgIGNhc2UgT2lkLnJlZ2NsYXNzOlxuICAgIGNhc2UgT2lkLnJlZ2NvbmZpZzpcbiAgICBjYXNlIE9pZC5yZWdkaWN0aW9uYXJ5OlxuICAgIGNhc2UgT2lkLnJlZ25hbWVzcGFjZTpcbiAgICBjYXNlIE9pZC5yZWdvcGVyOlxuICAgIGNhc2UgT2lkLnJlZ29wZXJhdG9yOlxuICAgIGNhc2UgT2lkLnJlZ3Byb2M6XG4gICAgY2FzZSBPaWQucmVncHJvY2VkdXJlOlxuICAgIGNhc2UgT2lkLnJlZ3JvbGU6XG4gICAgY2FzZSBPaWQucmVndHlwZTpcbiAgICBjYXNlIE9pZC50ZXh0OlxuICAgIGNhc2UgT2lkLnRpbWU6XG4gICAgY2FzZSBPaWQudGltZXR6OlxuICAgIGNhc2UgT2lkLnV1aWQ6XG4gICAgY2FzZSBPaWQudmFyY2hhcjpcbiAgICBjYXNlIE9pZC52b2lkOlxuICAgICAgcmV0dXJuIHN0clZhbHVlO1xuICAgIGNhc2UgT2lkLmJwY2hhcl9hcnJheTpcbiAgICBjYXNlIE9pZC5jaGFyX2FycmF5OlxuICAgIGNhc2UgT2lkLmNpZHJfYXJyYXk6XG4gICAgY2FzZSBPaWQuZmxvYXQ0X2FycmF5OlxuICAgIGNhc2UgT2lkLmZsb2F0OF9hcnJheTpcbiAgICBjYXNlIE9pZC5pbmV0X2FycmF5OlxuICAgIGNhc2UgT2lkLm1hY2FkZHJfYXJyYXk6XG4gICAgY2FzZSBPaWQubmFtZV9hcnJheTpcbiAgICBjYXNlIE9pZC5udW1lcmljX2FycmF5OlxuICAgIGNhc2UgT2lkLm9pZF9hcnJheTpcbiAgICBjYXNlIE9pZC5yZWdjbGFzc19hcnJheTpcbiAgICBjYXNlIE9pZC5yZWdjb25maWdfYXJyYXk6XG4gICAgY2FzZSBPaWQucmVnZGljdGlvbmFyeV9hcnJheTpcbiAgICBjYXNlIE9pZC5yZWduYW1lc3BhY2VfYXJyYXk6XG4gICAgY2FzZSBPaWQucmVnb3Blcl9hcnJheTpcbiAgICBjYXNlIE9pZC5yZWdvcGVyYXRvcl9hcnJheTpcbiAgICBjYXNlIE9pZC5yZWdwcm9jX2FycmF5OlxuICAgIGNhc2UgT2lkLnJlZ3Byb2NlZHVyZV9hcnJheTpcbiAgICBjYXNlIE9pZC5yZWdyb2xlX2FycmF5OlxuICAgIGNhc2UgT2lkLnJlZ3R5cGVfYXJyYXk6XG4gICAgY2FzZSBPaWQudGV4dF9hcnJheTpcbiAgICBjYXNlIE9pZC50aW1lX2FycmF5OlxuICAgIGNhc2UgT2lkLnRpbWV0el9hcnJheTpcbiAgICBjYXNlIE9pZC51dWlkX2FycmF5OlxuICAgIGNhc2UgT2lkLnZhcmNoYXJfYXJyYXk6XG4gICAgICByZXR1cm4gZGVjb2RlU3RyaW5nQXJyYXkoc3RyVmFsdWUpO1xuICAgIGNhc2UgT2lkLmludDI6XG4gICAgY2FzZSBPaWQuaW50NDpcbiAgICBjYXNlIE9pZC54aWQ6XG4gICAgICByZXR1cm4gZGVjb2RlSW50KHN0clZhbHVlKTtcbiAgICBjYXNlIE9pZC5pbnQyX2FycmF5OlxuICAgIGNhc2UgT2lkLmludDRfYXJyYXk6XG4gICAgY2FzZSBPaWQueGlkX2FycmF5OlxuICAgICAgcmV0dXJuIGRlY29kZUludEFycmF5KHN0clZhbHVlKTtcbiAgICBjYXNlIE9pZC5ib29sOlxuICAgICAgcmV0dXJuIGRlY29kZUJvb2xlYW4oc3RyVmFsdWUpO1xuICAgIGNhc2UgT2lkLmJvb2xfYXJyYXk6XG4gICAgICByZXR1cm4gZGVjb2RlQm9vbGVhbkFycmF5KHN0clZhbHVlKTtcbiAgICBjYXNlIE9pZC5ib3g6XG4gICAgICByZXR1cm4gZGVjb2RlQm94KHN0clZhbHVlKTtcbiAgICBjYXNlIE9pZC5ib3hfYXJyYXk6XG4gICAgICByZXR1cm4gZGVjb2RlQm94QXJyYXkoc3RyVmFsdWUpO1xuICAgIGNhc2UgT2lkLmNpcmNsZTpcbiAgICAgIHJldHVybiBkZWNvZGVDaXJjbGUoc3RyVmFsdWUpO1xuICAgIGNhc2UgT2lkLmNpcmNsZV9hcnJheTpcbiAgICAgIHJldHVybiBkZWNvZGVDaXJjbGVBcnJheShzdHJWYWx1ZSk7XG4gICAgY2FzZSBPaWQuYnl0ZWE6XG4gICAgICByZXR1cm4gZGVjb2RlQnl0ZWEoc3RyVmFsdWUpO1xuICAgIGNhc2UgT2lkLmJ5dGVfYXJyYXk6XG4gICAgICByZXR1cm4gZGVjb2RlQnl0ZWFBcnJheShzdHJWYWx1ZSk7XG4gICAgY2FzZSBPaWQuZGF0ZTpcbiAgICAgIHJldHVybiBkZWNvZGVEYXRlKHN0clZhbHVlKTtcbiAgICBjYXNlIE9pZC5kYXRlX2FycmF5OlxuICAgICAgcmV0dXJuIGRlY29kZURhdGVBcnJheShzdHJWYWx1ZSk7XG4gICAgY2FzZSBPaWQuaW50ODpcbiAgICAgIHJldHVybiBkZWNvZGVCaWdpbnQoc3RyVmFsdWUpO1xuICAgIGNhc2UgT2lkLmludDhfYXJyYXk6XG4gICAgICByZXR1cm4gZGVjb2RlQmlnaW50QXJyYXkoc3RyVmFsdWUpO1xuICAgIGNhc2UgT2lkLmpzb246XG4gICAgY2FzZSBPaWQuanNvbmI6XG4gICAgICByZXR1cm4gZGVjb2RlSnNvbihzdHJWYWx1ZSk7XG4gICAgY2FzZSBPaWQuanNvbl9hcnJheTpcbiAgICBjYXNlIE9pZC5qc29uYl9hcnJheTpcbiAgICAgIHJldHVybiBkZWNvZGVKc29uQXJyYXkoc3RyVmFsdWUpO1xuICAgIGNhc2UgT2lkLmxpbmU6XG4gICAgICByZXR1cm4gZGVjb2RlTGluZShzdHJWYWx1ZSk7XG4gICAgY2FzZSBPaWQubGluZV9hcnJheTpcbiAgICAgIHJldHVybiBkZWNvZGVMaW5lQXJyYXkoc3RyVmFsdWUpO1xuICAgIGNhc2UgT2lkLmxzZWc6XG4gICAgICByZXR1cm4gZGVjb2RlTGluZVNlZ21lbnQoc3RyVmFsdWUpO1xuICAgIGNhc2UgT2lkLmxzZWdfYXJyYXk6XG4gICAgICByZXR1cm4gZGVjb2RlTGluZVNlZ21lbnRBcnJheShzdHJWYWx1ZSk7XG4gICAgY2FzZSBPaWQucGF0aDpcbiAgICAgIHJldHVybiBkZWNvZGVQYXRoKHN0clZhbHVlKTtcbiAgICBjYXNlIE9pZC5wYXRoX2FycmF5OlxuICAgICAgcmV0dXJuIGRlY29kZVBhdGhBcnJheShzdHJWYWx1ZSk7XG4gICAgY2FzZSBPaWQucG9pbnQ6XG4gICAgICByZXR1cm4gZGVjb2RlUG9pbnQoc3RyVmFsdWUpO1xuICAgIGNhc2UgT2lkLnBvaW50X2FycmF5OlxuICAgICAgcmV0dXJuIGRlY29kZVBvaW50QXJyYXkoc3RyVmFsdWUpO1xuICAgIGNhc2UgT2lkLnBvbHlnb246XG4gICAgICByZXR1cm4gZGVjb2RlUG9seWdvbihzdHJWYWx1ZSk7XG4gICAgY2FzZSBPaWQucG9seWdvbl9hcnJheTpcbiAgICAgIHJldHVybiBkZWNvZGVQb2x5Z29uQXJyYXkoc3RyVmFsdWUpO1xuICAgIGNhc2UgT2lkLnRpZDpcbiAgICAgIHJldHVybiBkZWNvZGVUaWQoc3RyVmFsdWUpO1xuICAgIGNhc2UgT2lkLnRpZF9hcnJheTpcbiAgICAgIHJldHVybiBkZWNvZGVUaWRBcnJheShzdHJWYWx1ZSk7XG4gICAgY2FzZSBPaWQudGltZXN0YW1wOlxuICAgIGNhc2UgT2lkLnRpbWVzdGFtcHR6OlxuICAgICAgcmV0dXJuIGRlY29kZURhdGV0aW1lKHN0clZhbHVlKTtcbiAgICBjYXNlIE9pZC50aW1lc3RhbXBfYXJyYXk6XG4gICAgY2FzZSBPaWQudGltZXN0YW1wdHpfYXJyYXk6XG4gICAgICByZXR1cm4gZGVjb2RlRGF0ZXRpbWVBcnJheShzdHJWYWx1ZSk7XG4gICAgZGVmYXVsdDpcbiAgICAgIC8vIEEgc2VwYXJhdGUgY2F0ZWdvcnkgZm9yIG5vdCBoYW5kbGVkIHZhbHVlc1xuICAgICAgLy8gVGhleSBtaWdodCBvciBtaWdodCBub3QgYmUgcmVwcmVzZW50ZWQgY29ycmVjdGx5IGFzIHN0cmluZ3MsXG4gICAgICAvLyByZXR1cm5pbmcgdGhlbSB0byB0aGUgdXNlciBhcyByYXcgc3RyaW5ncyBhbGxvd3MgdGhlbSB0byBwYXJzZVxuICAgICAgLy8gdGhlbSBhcyB0aGV5IHNlZSBmaXRcbiAgICAgIHJldHVybiBzdHJWYWx1ZTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVjb2RlKHZhbHVlOiBVaW50OEFycmF5LCBjb2x1bW46IENvbHVtbikge1xuICBpZiAoY29sdW1uLmZvcm1hdCA9PT0gRm9ybWF0LkJJTkFSWSkge1xuICAgIHJldHVybiBkZWNvZGVCaW5hcnkoKTtcbiAgfSBlbHNlIGlmIChjb2x1bW4uZm9ybWF0ID09PSBGb3JtYXQuVEVYVCkge1xuICAgIHJldHVybiBkZWNvZGVUZXh0KHZhbHVlLCBjb2x1bW4udHlwZU9pZCk7XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3du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