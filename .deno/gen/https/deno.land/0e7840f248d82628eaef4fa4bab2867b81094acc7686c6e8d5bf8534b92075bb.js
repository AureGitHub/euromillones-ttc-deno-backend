function pad(number, digits) {
    let padded = "" + number;
    while(padded.length < digits){
        padded = "0" + padded;
    }
    return padded;
}
function encodeDate(date) {
    // Construct ISO date
    const year = pad(date.getFullYear(), 4);
    const month = pad(date.getMonth() + 1, 2);
    const day = pad(date.getDate(), 2);
    const hour = pad(date.getHours(), 2);
    const min = pad(date.getMinutes(), 2);
    const sec = pad(date.getSeconds(), 2);
    const ms = pad(date.getMilliseconds(), 3);
    const encodedDate = `${year}-${month}-${day}T${hour}:${min}:${sec}.${ms}`;
    // Construct timezone info
    //
    // Date.prototype.getTimezoneOffset();
    //
    // From MDN:
    // > The time-zone offset is the difference, in minutes, from local time to UTC.
    // > Note that this means that the offset is positive if the local timezone is
    // > behind UTC and negative if it is ahead. For example, for time zone UTC+10:00
    // > (Australian Eastern Standard Time, Vladivostok Time, Chamorro Standard Time),
    // > -600 will be returned.
    const offset = date.getTimezoneOffset();
    const tzSign = offset > 0 ? "-" : "+";
    const absOffset = Math.abs(offset);
    const tzHours = pad(Math.floor(absOffset / 60), 2);
    const tzMinutes = pad(Math.floor(absOffset % 60), 2);
    const encodedTz = `${tzSign}${tzHours}:${tzMinutes}`;
    return encodedDate + encodedTz;
}
function escapeArrayElement(value) {
    // deno-lint-ignore no-explicit-any
    const strValue = value.toString();
    const escapedValue = strValue.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${escapedValue}"`;
}
function encodeArray(array) {
    let encodedArray = "{";
    array.forEach((element, index)=>{
        if (index > 0) {
            encodedArray += ",";
        }
        if (element === null || typeof element === "undefined") {
            encodedArray += "NULL";
        } else if (Array.isArray(element)) {
            encodedArray += encodeArray(element);
        } else if (element instanceof Uint8Array) {
            // TODO
            // Should it be encoded as bytea?
            throw new Error("Can't encode array of buffers.");
        } else {
            const encodedElement = encodeArgument(element);
            encodedArray += escapeArrayElement(encodedElement);
        }
    });
    encodedArray += "}";
    return encodedArray;
}
function encodeBytes(value) {
    const hex = Array.from(value).map((val)=>val < 0x10 ? `0${val.toString(16)}` : val.toString(16)).join("");
    return `\\x${hex}`;
}
export function encodeArgument(value) {
    if (value === null || typeof value === "undefined") {
        return null;
    } else if (value instanceof Uint8Array) {
        return encodeBytes(value);
    } else if (value instanceof Date) {
        return encodeDate(value);
    } else if (value instanceof Array) {
        return encodeArray(value);
    } else if (value instanceof Object) {
        return JSON.stringify(value);
    } else {
        return String(value);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvcG9zdGdyZXNAdjAuMTcuMC9xdWVyeS9lbmNvZGUudHMiXSwic291cmNlc0NvbnRlbnQiOlsiZnVuY3Rpb24gcGFkKG51bWJlcjogbnVtYmVyLCBkaWdpdHM6IG51bWJlcik6IHN0cmluZyB7XG4gIGxldCBwYWRkZWQgPSBcIlwiICsgbnVtYmVyO1xuICB3aGlsZSAocGFkZGVkLmxlbmd0aCA8IGRpZ2l0cykge1xuICAgIHBhZGRlZCA9IFwiMFwiICsgcGFkZGVkO1xuICB9XG4gIHJldHVybiBwYWRkZWQ7XG59XG5cbmZ1bmN0aW9uIGVuY29kZURhdGUoZGF0ZTogRGF0ZSk6IHN0cmluZyB7XG4gIC8vIENvbnN0cnVjdCBJU08gZGF0ZVxuICBjb25zdCB5ZWFyID0gcGFkKGRhdGUuZ2V0RnVsbFllYXIoKSwgNCk7XG4gIGNvbnN0IG1vbnRoID0gcGFkKGRhdGUuZ2V0TW9udGgoKSArIDEsIDIpO1xuICBjb25zdCBkYXkgPSBwYWQoZGF0ZS5nZXREYXRlKCksIDIpO1xuICBjb25zdCBob3VyID0gcGFkKGRhdGUuZ2V0SG91cnMoKSwgMik7XG4gIGNvbnN0IG1pbiA9IHBhZChkYXRlLmdldE1pbnV0ZXMoKSwgMik7XG4gIGNvbnN0IHNlYyA9IHBhZChkYXRlLmdldFNlY29uZHMoKSwgMik7XG4gIGNvbnN0IG1zID0gcGFkKGRhdGUuZ2V0TWlsbGlzZWNvbmRzKCksIDMpO1xuXG4gIGNvbnN0IGVuY29kZWREYXRlID0gYCR7eWVhcn0tJHttb250aH0tJHtkYXl9VCR7aG91cn06JHttaW59OiR7c2VjfS4ke21zfWA7XG5cbiAgLy8gQ29uc3RydWN0IHRpbWV6b25lIGluZm9cbiAgLy9cbiAgLy8gRGF0ZS5wcm90b3R5cGUuZ2V0VGltZXpvbmVPZmZzZXQoKTtcbiAgLy9cbiAgLy8gRnJvbSBNRE46XG4gIC8vID4gVGhlIHRpbWUtem9uZSBvZmZzZXQgaXMgdGhlIGRpZmZlcmVuY2UsIGluIG1pbnV0ZXMsIGZyb20gbG9jYWwgdGltZSB0byBVVEMuXG4gIC8vID4gTm90ZSB0aGF0IHRoaXMgbWVhbnMgdGhhdCB0aGUgb2Zmc2V0IGlzIHBvc2l0aXZlIGlmIHRoZSBsb2NhbCB0aW1lem9uZSBpc1xuICAvLyA+IGJlaGluZCBVVEMgYW5kIG5lZ2F0aXZlIGlmIGl0IGlzIGFoZWFkLiBGb3IgZXhhbXBsZSwgZm9yIHRpbWUgem9uZSBVVEMrMTA6MDBcbiAgLy8gPiAoQXVzdHJhbGlhbiBFYXN0ZXJuIFN0YW5kYXJkIFRpbWUsIFZsYWRpdm9zdG9rIFRpbWUsIENoYW1vcnJvIFN0YW5kYXJkIFRpbWUpLFxuICAvLyA+IC02MDAgd2lsbCBiZSByZXR1cm5lZC5cbiAgY29uc3Qgb2Zmc2V0ID0gZGF0ZS5nZXRUaW1lem9uZU9mZnNldCgpO1xuICBjb25zdCB0elNpZ24gPSBvZmZzZXQgPiAwID8gXCItXCIgOiBcIitcIjtcbiAgY29uc3QgYWJzT2Zmc2V0ID0gTWF0aC5hYnMob2Zmc2V0KTtcbiAgY29uc3QgdHpIb3VycyA9IHBhZChNYXRoLmZsb29yKGFic09mZnNldCAvIDYwKSwgMik7XG4gIGNvbnN0IHR6TWludXRlcyA9IHBhZChNYXRoLmZsb29yKGFic09mZnNldCAlIDYwKSwgMik7XG5cbiAgY29uc3QgZW5jb2RlZFR6ID0gYCR7dHpTaWdufSR7dHpIb3Vyc306JHt0ek1pbnV0ZXN9YDtcblxuICByZXR1cm4gZW5jb2RlZERhdGUgKyBlbmNvZGVkVHo7XG59XG5cbmZ1bmN0aW9uIGVzY2FwZUFycmF5RWxlbWVudCh2YWx1ZTogdW5rbm93bik6IHN0cmluZyB7XG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIGNvbnN0IHN0clZhbHVlID0gKHZhbHVlIGFzIGFueSkudG9TdHJpbmcoKTtcbiAgY29uc3QgZXNjYXBlZFZhbHVlID0gc3RyVmFsdWUucmVwbGFjZSgvXFxcXC9nLCBcIlxcXFxcXFxcXCIpLnJlcGxhY2UoL1wiL2csICdcXFxcXCInKTtcblxuICByZXR1cm4gYFwiJHtlc2NhcGVkVmFsdWV9XCJgO1xufVxuXG5mdW5jdGlvbiBlbmNvZGVBcnJheShhcnJheTogQXJyYXk8dW5rbm93bj4pOiBzdHJpbmcge1xuICBsZXQgZW5jb2RlZEFycmF5ID0gXCJ7XCI7XG5cbiAgYXJyYXkuZm9yRWFjaCgoZWxlbWVudCwgaW5kZXgpID0+IHtcbiAgICBpZiAoaW5kZXggPiAwKSB7XG4gICAgICBlbmNvZGVkQXJyYXkgKz0gXCIsXCI7XG4gICAgfVxuXG4gICAgaWYgKGVsZW1lbnQgPT09IG51bGwgfHwgdHlwZW9mIGVsZW1lbnQgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgIGVuY29kZWRBcnJheSArPSBcIk5VTExcIjtcbiAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZWxlbWVudCkpIHtcbiAgICAgIGVuY29kZWRBcnJheSArPSBlbmNvZGVBcnJheShlbGVtZW50KTtcbiAgICB9IGVsc2UgaWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBVaW50OEFycmF5KSB7XG4gICAgICAvLyBUT0RPXG4gICAgICAvLyBTaG91bGQgaXQgYmUgZW5jb2RlZCBhcyBieXRlYT9cbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IGVuY29kZSBhcnJheSBvZiBidWZmZXJzLlwiKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgZW5jb2RlZEVsZW1lbnQgPSBlbmNvZGVBcmd1bWVudChlbGVtZW50KTtcbiAgICAgIGVuY29kZWRBcnJheSArPSBlc2NhcGVBcnJheUVsZW1lbnQoZW5jb2RlZEVsZW1lbnQgYXMgc3RyaW5nKTtcbiAgICB9XG4gIH0pO1xuXG4gIGVuY29kZWRBcnJheSArPSBcIn1cIjtcbiAgcmV0dXJuIGVuY29kZWRBcnJheTtcbn1cblxuZnVuY3Rpb24gZW5jb2RlQnl0ZXModmFsdWU6IFVpbnQ4QXJyYXkpOiBzdHJpbmcge1xuICBjb25zdCBoZXggPSBBcnJheS5mcm9tKHZhbHVlKVxuICAgIC5tYXAoKHZhbCkgPT4gKHZhbCA8IDB4MTAgPyBgMCR7dmFsLnRvU3RyaW5nKDE2KX1gIDogdmFsLnRvU3RyaW5nKDE2KSkpXG4gICAgLmpvaW4oXCJcIik7XG4gIHJldHVybiBgXFxcXHgke2hleH1gO1xufVxuXG5leHBvcnQgdHlwZSBFbmNvZGVkQXJnID0gbnVsbCB8IHN0cmluZyB8IFVpbnQ4QXJyYXk7XG5cbmV4cG9ydCBmdW5jdGlvbiBlbmNvZGVBcmd1bWVudCh2YWx1ZTogdW5rbm93bik6IEVuY29kZWRBcmcge1xuICBpZiAodmFsdWUgPT09IG51bGwgfHwgdHlwZW9mIHZhbHVlID09PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH0gZWxzZSBpZiAodmFsdWUgaW5zdGFuY2VvZiBVaW50OEFycmF5KSB7XG4gICAgcmV0dXJuIGVuY29kZUJ5dGVzKHZhbHVlKTtcbiAgfSBlbHNlIGlmICh2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICByZXR1cm4gZW5jb2RlRGF0ZSh2YWx1ZSk7XG4gIH0gZWxzZSBpZiAodmFsdWUgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHJldHVybiBlbmNvZGVBcnJheSh2YWx1ZSk7XG4gIH0gZWxzZSBpZiAodmFsdWUgaW5zdGFuY2VvZiBPYmplY3QpIHtcbiAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBTdHJpbmcodmFsdWUpO1xuICB9XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsU0FBUyxJQUFJLE1BQWMsRUFBRSxNQUFjLEVBQVU7SUFDbkQsSUFBSSxTQUFTLEtBQUs7SUFDbEIsTUFBTyxPQUFPLE1BQU0sR0FBRyxPQUFRO1FBQzdCLFNBQVMsTUFBTTtJQUNqQjtJQUNBLE9BQU87QUFDVDtBQUVBLFNBQVMsV0FBVyxJQUFVLEVBQVU7SUFDdEMscUJBQXFCO0lBQ3JCLE1BQU0sT0FBTyxJQUFJLEtBQUssV0FBVyxJQUFJO0lBQ3JDLE1BQU0sUUFBUSxJQUFJLEtBQUssUUFBUSxLQUFLLEdBQUc7SUFDdkMsTUFBTSxNQUFNLElBQUksS0FBSyxPQUFPLElB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