// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
/*!
 * Adapted directly from negotiator at https://github.com/jshttp/negotiator/
 * which is licensed as follows:
 *
 * (The MIT License)
 *
 * Copyright (c) 2012-2014 Federico Romero
 * Copyright (c) 2012-2014 Isaac Z. Schlueter
 * Copyright (c) 2014-2015 Douglas Christopher Wilson
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
 */ import { compareSpecs, isQuality } from "./common.ts";
const simpleMediaTypeRegExp = /^\s*([^\s\/;]+)\/([^;\s]+)\s*(?:;(.*))?$/;
function quoteCount(str) {
    let count = 0;
    let index = 0;
    while((index = str.indexOf(`"`, index)) !== -1){
        count++;
        index++;
    }
    return count;
}
function splitMediaTypes(accept) {
    const accepts = accept.split(",");
    let j = 0;
    for(let i = 1; i < accepts.length; i++){
        if (quoteCount(accepts[j]) % 2 === 0) {
            accepts[++j] = accepts[i];
        } else {
            accepts[j] += `,${accepts[i]}`;
        }
    }
    accepts.length = j + 1;
    return accepts;
}
function splitParameters(str) {
    const parameters = str.split(";");
    let j = 0;
    for(let i = 1; i < parameters.length; i++){
        if (quoteCount(parameters[j]) % 2 === 0) {
            parameters[++j] = parameters[i];
        } else {
            parameters[j] += `;${parameters[i]}`;
        }
    }
    parameters.length = j + 1;
    return parameters.map((p)=>p.trim());
}
function splitKeyValuePair(str) {
    const [key, value] = str.split("=");
    return [
        key.toLowerCase(),
        value
    ];
}
function parseMediaType(str, i) {
    const match = simpleMediaTypeRegExp.exec(str);
    if (!match) {
        return;
    }
    const params = Object.create(null);
    let q = 1;
    const [, type, subtype, parameters] = match;
    if (parameters) {
        const kvps = splitParameters(parameters).map(splitKeyValuePair);
        for (const [key, val] of kvps){
            const value = val && val[0] === `"` && val[val.length - 1] === `"` ? val.substr(1, val.length - 2) : val;
            if (key === "q" && value) {
                q = parseFloat(value);
                break;
            }
            params[key] = value;
        }
    }
    return {
        type,
        subtype,
        params,
        q,
        i
    };
}
function parseAccept(accept) {
    const accepts = splitMediaTypes(accept);
    const mediaTypes = [];
    for(let i = 0; i < accepts.length; i++){
        const mediaType = parseMediaType(accepts[i].trim(), i);
        if (mediaType) {
            mediaTypes.push(mediaType);
        }
    }
    return mediaTypes;
}
function getFullType(spec) {
    return `${spec.type}/${spec.subtype}`;
}
function specify(type, spec, index) {
    const p = parseMediaType(type, index);
    if (!p) {
        return;
    }
    let s = 0;
    if (spec.type.toLowerCase() === p.type.toLowerCase()) {
        s |= 4;
    } else if (spec.type !== "*") {
        return;
    }
    if (spec.subtype.toLowerCase() === p.subtype.toLowerCase()) {
        s |= 2;
    } else if (spec.subtype !== "*") {
        return;
    }
    const keys = Object.keys(spec.params);
    if (keys.length) {
        if (keys.every((key)=>(spec.params[key] || "").toLowerCase() === (p.params[key] || "").toLowerCase())) {
            s |= 1;
        } else {
            return;
        }
    }
    return {
        i: index,
        o: spec.o,
        q: spec.q,
        s
    };
}
function getMediaTypePriority(type, accepted, index) {
    let priority = {
        o: -1,
        q: 0,
        s: 0,
        i: index
    };
    for (const accepts of accepted){
        const spec = specify(type, accepts, index);
        if (spec && ((priority.s || 0) - (spec.s || 0) || (priority.q || 0) - (spec.q || 0) || (priority.o || 0) - (spec.o || 0)) < 0) {
            priority = spec;
        }
    }
    return priority;
}
export function preferredMediaTypes(accept, provided) {
    const accepts = parseAccept(accept === undefined ? "*/*" : accept || "");
    if (!provided) {
        return accepts.filter(isQuality).sort(compareSpecs).map(getFullType);
    }
    const priorities = provided.map((type, index)=>{
        return getMediaTypePriority(type, accepts, index);
    });
    return priorities.filter(isQuality).sort(compareSpecs).map((priority)=>provided[priorities.indexOf(priority)]);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE1Mi4wL2h0dHAvX25lZ290aWF0aW9uL21lZGlhX3R5cGUudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IDIwMTgtMjAyMiB0aGUgRGVubyBhdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLiBNSVQgbGljZW5zZS5cbi8qIVxuICogQWRhcHRlZCBkaXJlY3RseSBmcm9tIG5lZ290aWF0b3IgYXQgaHR0cHM6Ly9naXRodWIuY29tL2pzaHR0cC9uZWdvdGlhdG9yL1xuICogd2hpY2ggaXMgbGljZW5zZWQgYXMgZm9sbG93czpcbiAqXG4gKiAoVGhlIE1JVCBMaWNlbnNlKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMi0yMDE0IEZlZGVyaWNvIFJvbWVyb1xuICogQ29weXJpZ2h0IChjKSAyMDEyLTIwMTQgSXNhYWMgWi4gU2NobHVldGVyXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQtMjAxNSBEb3VnbGFzIENocmlzdG9waGVyIFdpbHNvblxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZ1xuICogYSBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4gKiAnU29mdHdhcmUnKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4gKiB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4gKiBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG9cbiAqIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0b1xuICogdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuICpcbiAqIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlXG4gKiBpbmNsdWRlZCBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbiAqXG4gKiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgJ0FTIElTJywgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCxcbiAqIEVYUFJFU1MgT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuICogTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULlxuICogSU4gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTllcbiAqIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsXG4gKiBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRVxuICogU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG4gKi9cblxuaW1wb3J0IHsgY29tcGFyZVNwZWNzLCBpc1F1YWxpdHksIFNwZWNpZmljaXR5IH0gZnJvbSBcIi4vY29tbW9uLnRzXCI7XG5cbmludGVyZmFjZSBNZWRpYVR5cGVTcGVjaWZpY2l0eSBleHRlbmRzIFNwZWNpZmljaXR5IHtcbiAgdHlwZTogc3RyaW5nO1xuICBzdWJ0eXBlOiBzdHJpbmc7XG4gIHBhcmFtczogeyBbcGFyYW06IHN0cmluZ106IHN0cmluZyB8IHVuZGVmaW5lZCB9O1xufVxuXG5jb25zdCBzaW1wbGVNZWRpYVR5cGVSZWdFeHAgPSAvXlxccyooW15cXHNcXC87XSspXFwvKFteO1xcc10rKVxccyooPzo7KC4qKSk/JC87XG5cbmZ1bmN0aW9uIHF1b3RlQ291bnQoc3RyOiBzdHJpbmcpOiBudW1iZXIge1xuICBsZXQgY291bnQgPSAwO1xuICBsZXQgaW5kZXggPSAwO1xuXG4gIHdoaWxlICgoaW5kZXggPSBzdHIuaW5kZXhPZihgXCJgLCBpbmRleCkpICE9PSAtMSkge1xuICAgIGNvdW50Kys7XG4gICAgaW5kZXgrKztcbiAgfVxuXG4gIHJldHVybiBjb3VudDtcbn1cblxuZnVuY3Rpb24gc3BsaXRNZWRpYVR5cGVzKGFjY2VwdDogc3RyaW5nKTogc3RyaW5nW10ge1xuICBjb25zdCBhY2NlcHRzID0gYWNjZXB0LnNwbGl0KFwiLFwiKTtcblxuICBsZXQgaiA9IDA7XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgYWNjZXB0cy5sZW5ndGg7IGkrKykge1xuICAgIGlmIChxdW90ZUNvdW50KGFjY2VwdHNbal0pICUgMiA9PT0gMCkge1xuICAgICAgYWNjZXB0c1srK2pdID0gYWNjZXB0c1tpXTtcbiAgICB9IGVsc2Uge1xuICAgICAgYWNjZXB0c1tqXSArPSBgLCR7YWNjZXB0c1tpXX1gO1xuICAgIH1cbiAgfVxuXG4gIGFjY2VwdHMubGVuZ3RoID0gaiArIDE7XG5cbiAgcmV0dXJuIGFjY2VwdHM7XG59XG5cbmZ1bmN0aW9uIHNwbGl0UGFyYW1ldGVycyhzdHI6IHN0cmluZyk6IHN0cmluZ1tdIHtcbiAgY29uc3QgcGFyYW1ldGVycyA9IHN0ci5zcGxpdChcIjtcIik7XG5cbiAgbGV0IGogPSAwO1xuICBmb3IgKGxldCBpID0gMTsgaSA8IHBhcmFtZXRlcnMubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAocXVvdGVDb3VudChwYXJhbWV0ZXJzW2pdKSAlIDIgPT09IDApIHtcbiAgICAgIHBhcmFtZXRlcnNbKytqXSA9IHBhcmFtZXRlcnNbaV07XG4gICAgfSBlbHNlIHtcbiAgICAgIHBhcmFtZXRlcnNbal0gKz0gYDske3BhcmFtZXRlcnNbaV19YDtcbiAgICB9XG4gIH1cblxuICBwYXJhbWV0ZXJzLmxlbmd0aCA9IGogKyAxO1xuXG4gIHJldHVybiBwYXJhbWV0ZXJzLm1hcCgocCkgPT4gcC50cmltKCkpO1xufVxuXG5mdW5jdGlvbiBzcGxpdEtleVZhbHVlUGFpcihzdHI6IHN0cmluZyk6IFtzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZF0ge1xuICBjb25zdCBba2V5LCB2YWx1ZV0gPSBzdHIuc3BsaXQoXCI9XCIpO1xuICByZXR1cm4gW2tleS50b0xvd2VyQ2FzZSgpLCB2YWx1ZV07XG59XG5cbmZ1bmN0aW9uIHBhcnNlTWVkaWFUeXBlKFxuICBzdHI6IHN0cmluZyxcbiAgaTogbnVtYmVyLFxuKTogTWVkaWFUeXBlU3BlY2lmaWNpdHkgfCB1bmRlZmluZWQge1xuICBjb25zdCBtYXRjaCA9IHNpbXBsZU1lZGlhVHlwZVJlZ0V4cC5leGVjKHN0cik7XG5cbiAgaWYgKCFtYXRjaCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IHBhcmFtczogeyBbcGFyYW06IHN0cmluZ106IHN0cmluZyB8IHVuZGVmaW5lZCB9ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgbGV0IHEgPSAxO1xuICBjb25zdCBbLCB0eXBlLCBzdWJ0eXBlLCBwYXJhbWV0ZXJzXSA9IG1hdGNoO1xuXG4gIGlmIChwYXJhbWV0ZXJzKSB7XG4gICAgY29uc3Qga3ZwcyA9IHNwbGl0UGFyYW1ldGVycyhwYXJhbWV0ZXJzKS5tYXAoc3BsaXRLZXlWYWx1ZVBhaXIpO1xuXG4gICAgZm9yIChjb25zdCBba2V5LCB2YWxdIG9mIGt2cHMpIHtcbiAgICAgIGNvbnN0IHZhbHVlID0gdmFsICYmIHZhbFswXSA9PT0gYFwiYCAmJiB2YWxbdmFsLmxlbmd0aCAtIDFdID09PSBgXCJgXG4gICAgICAgID8gdmFsLnN1YnN0cigxLCB2YWwubGVuZ3RoIC0gMilcbiAgICAgICAgOiB2YWw7XG5cbiAgICAgIGlmIChrZXkgPT09IFwicVwiICYmIHZhbHVlKSB7XG4gICAgICAgIHEgPSBwYXJzZUZsb2F0KHZhbHVlKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIHBhcmFtc1trZXldID0gdmFsdWU7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHsgdHlwZSwgc3VidHlwZSwgcGFyYW1zLCBxLCBpIH07XG59XG5cbmZ1bmN0aW9uIHBhcnNlQWNjZXB0KGFjY2VwdDogc3RyaW5nKTogTWVkaWFUeXBlU3BlY2lmaWNpdHlbXSB7XG4gIGNvbnN0IGFjY2VwdHMgPSBzcGxpdE1lZGlhVHlwZXMoYWNjZXB0KTtcblxuICBjb25zdCBtZWRpYVR5cGVzOiBNZWRpYVR5cGVTcGVjaWZpY2l0eVtdID0gW107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgYWNjZXB0cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IG1lZGlhVHlwZSA9IHBhcnNlTWVkaWFUeXBlKGFjY2VwdHNbaV0udHJpbSgpLCBpKTtcblxuICAgIGlmIChtZWRpYVR5cGUpIHtcbiAgICAgIG1lZGlhVHlwZXMucHVzaChtZWRpYVR5cGUpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBtZWRpYVR5cGVzO1xufVxuXG5mdW5jdGlvbiBnZXRGdWxsVHlwZShzcGVjOiBNZWRpYVR5cGVTcGVjaWZpY2l0eSkge1xuICByZXR1cm4gYCR7c3BlYy50eXBlfS8ke3NwZWMuc3VidHlwZX1gO1xufVxuXG5mdW5jdGlvbiBzcGVjaWZ5KFxuICB0eXBlOiBzdHJpbmcsXG4gIHNwZWM6IE1lZGlhVHlwZVNwZWNpZmljaXR5LFxuICBpbmRleDogbnVtYmVyLFxuKTogU3BlY2lmaWNpdHkgfCB1bmRlZmluZWQge1xuICBjb25zdCBwID0gcGFyc2VNZWRpYVR5cGUodHlwZSwgaW5kZXgpO1xuXG4gIGlmICghcCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGxldCBzID0gMDtcblxuICBpZiAoc3BlYy50eXBlLnRvTG93ZXJDYXNlKCkgPT09IHAudHlwZS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgcyB8PSA0O1xuICB9IGVsc2UgaWYgKHNwZWMudHlwZSAhPT0gXCIqXCIpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoc3BlYy5zdWJ0eXBlLnRvTG93ZXJDYXNlKCkgPT09IHAuc3VidHlwZS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgcyB8PSAyO1xuICB9IGVsc2UgaWYgKHNwZWMuc3VidHlwZSAhPT0gXCIqXCIpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMoc3BlYy5wYXJhbXMpO1xuICBpZiAoa2V5cy5sZW5ndGgpIHtcbiAgICBpZiAoXG4gICAgICBrZXlzLmV2ZXJ5KChrZXkpID0+XG4gICAgICAgIChzcGVjLnBhcmFtc1trZXldIHx8IFwiXCIpLnRvTG93ZXJDYXNlKCkgPT09XG4gICAgICAgICAgKHAucGFyYW1zW2tleV0gfHwgXCJcIikudG9Mb3dlckNhc2UoKVxuICAgICAgKVxuICAgICkge1xuICAgICAgcyB8PSAxO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBpOiBpbmRleCxcbiAgICBvOiBzcGVjLm8sXG4gICAgcTogc3BlYy5xLFxuICAgIHMsXG4gIH07XG59XG5cbmZ1bmN0aW9uIGdldE1lZGlhVHlwZVByaW9yaXR5KFxuICB0eXBlOiBzdHJpbmcsXG4gIGFjY2VwdGVkOiBNZWRpYVR5cGVTcGVjaWZpY2l0eVtdLFxuICBpbmRleDogbnVtYmVyLFxuKSB7XG4gIGxldCBwcmlvcml0eTogU3BlY2lmaWNpdHkgPSB7IG86IC0xLCBxOiAwLCBzOiAwLCBpOiBpbmRleCB9O1xuXG4gIGZvciAoY29uc3QgYWNjZXB0cyBvZiBhY2NlcHRlZCkge1xuICAgIGNvbnN0IHNwZWMgPSBzcGVjaWZ5KHR5cGUsIGFjY2VwdHMsIGluZGV4KTtcblxuICAgIGlmIChcbiAgICAgIHNwZWMgJiZcbiAgICAgICgocHJpb3JpdHkucyB8fCAwKSAtIChzcGVjLnMgfHwgMCkgfHxcbiAgICAgICAgICAocHJpb3JpdHkucSB8fCAwKSAtIChzcGVjLnEgfHwgMCkgfHxcbiAgICAgICAgICAocHJpb3JpdHkubyB8fCAwKSAtIChzcGVjLm8gfHwgMCkpIDwgMFxuICAgICkge1xuICAgICAgcHJpb3JpdHkgPSBzcGVjO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBwcmlvcml0eTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByZWZlcnJlZE1lZGlhVHlwZXMoXG4gIGFjY2VwdD86IHN0cmluZyB8IG51bGwsXG4gIHByb3ZpZGVkPzogc3RyaW5nW10sXG4pOiBzdHJpbmdbXSB7XG4gIGNvbnN0IGFjY2VwdHMgPSBwYXJzZUFjY2VwdChhY2NlcHQgPT09IHVuZGVmaW5lZCA/IFwiKi8qXCIgOiBhY2NlcHQgfHwgXCJcIik7XG5cbiAgaWYgKCFwcm92aWRlZCkge1xuICAgIHJldHVybiBhY2NlcHRzXG4gICAgICAuZmlsdGVyKGlzUXVhbGl0eSlcbiAgICAgIC5zb3J0KGNvbXBhcmVTcGVjcylcbiAgICAgIC5tYXAoZ2V0RnVsbFR5cGUpO1xuICB9XG5cbiAgY29uc3QgcHJpb3JpdGllcyA9IHByb3ZpZGVkLm1hcCgodHlwZSwgaW5kZXgpID0+IHtcbiAgICByZXR1cm4gZ2V0TWVkaWFUeXBlUHJpb3JpdHkodHlwZSwgYWNjZXB0cywgaW5kZXgpO1xuICB9KTtcblxuICByZXR1cm4gcHJpb3JpdGllc1xuICAgIC5maWx0ZXIoaXNRdWFsaXR5KVxuICAgIC5zb3J0KGNvbXBhcmVTcGVjcylcbiAgICAubWFwKChwcmlvcml0eSkgPT4gcHJvdmlkZWRbcHJpb3JpdGllcy5pbmRleE9mKHByaW9yaXR5KV0pO1xufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDBFQUEwRTtBQUMxRTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztDQTRCQyxHQUVELFNBQVMsWUFBWSxFQUFFLFNBQVMsUUFBcUIsY0FBYztBQVFuRSxNQUFNLHdCQUF3QjtBQUU5QixTQUFTLFdBQVcsR0FBVyxFQUFVO0lB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