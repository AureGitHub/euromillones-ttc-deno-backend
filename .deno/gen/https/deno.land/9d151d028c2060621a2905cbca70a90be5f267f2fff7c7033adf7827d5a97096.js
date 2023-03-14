// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
// This module is browser compatible.
import { Tokenizer } from "./tokenizer.ts";
function digits(value, count = 2) {
    return String(value).padStart(count, "0");
}
function createLiteralTestFunction(value) {
    return (string)=>{
        return string.startsWith(value) ? {
            value,
            length: value.length
        } : undefined;
    };
}
function createMatchTestFunction(match) {
    return (string)=>{
        const result = match.exec(string);
        if (result) return {
            value: result,
            length: result[0].length
        };
    };
}
// according to unicode symbols (http://www.unicode.org/reports/tr35/tr35-dates.html#Date_Field_Symbol_Table)
const defaultRules = [
    {
        test: createLiteralTestFunction("yyyy"),
        fn: ()=>({
                type: "year",
                value: "numeric"
            })
    },
    {
        test: createLiteralTestFunction("yy"),
        fn: ()=>({
                type: "year",
                value: "2-digit"
            })
    },
    {
        test: createLiteralTestFunction("MM"),
        fn: ()=>({
                type: "month",
                value: "2-digit"
            })
    },
    {
        test: createLiteralTestFunction("M"),
        fn: ()=>({
                type: "month",
                value: "numeric"
            })
    },
    {
        test: createLiteralTestFunction("dd"),
        fn: ()=>({
                type: "day",
                value: "2-digit"
            })
    },
    {
        test: createLiteralTestFunction("d"),
        fn: ()=>({
                type: "day",
                value: "numeric"
            })
    },
    {
        test: createLiteralTestFunction("HH"),
        fn: ()=>({
                type: "hour",
                value: "2-digit"
            })
    },
    {
        test: createLiteralTestFunction("H"),
        fn: ()=>({
                type: "hour",
                value: "numeric"
            })
    },
    {
        test: createLiteralTestFunction("hh"),
        fn: ()=>({
                type: "hour",
                value: "2-digit",
                hour12: true
            })
    },
    {
        test: createLiteralTestFunction("h"),
        fn: ()=>({
                type: "hour",
                value: "numeric",
                hour12: true
            })
    },
    {
        test: createLiteralTestFunction("mm"),
        fn: ()=>({
                type: "minute",
                value: "2-digit"
            })
    },
    {
        test: createLiteralTestFunction("m"),
        fn: ()=>({
                type: "minute",
                value: "numeric"
            })
    },
    {
        test: createLiteralTestFunction("ss"),
        fn: ()=>({
                type: "second",
                value: "2-digit"
            })
    },
    {
        test: createLiteralTestFunction("s"),
        fn: ()=>({
                type: "second",
                value: "numeric"
            })
    },
    {
        test: createLiteralTestFunction("SSS"),
        fn: ()=>({
                type: "fractionalSecond",
                value: 3
            })
    },
    {
        test: createLiteralTestFunction("SS"),
        fn: ()=>({
                type: "fractionalSecond",
                value: 2
            })
    },
    {
        test: createLiteralTestFunction("S"),
        fn: ()=>({
                type: "fractionalSecond",
                value: 1
            })
    },
    {
        test: createLiteralTestFunction("a"),
        fn: (value)=>({
                type: "dayPeriod",
                value: value
            })
    },
    // quoted literal
    {
        test: createMatchTestFunction(/^(')(?<value>\\.|[^\']*)\1/),
        fn: (match)=>({
                type: "literal",
                value: match.groups.value
            })
    },
    // literal
    {
        test: createMatchTestFunction(/^.+?\s*/),
        fn: (match)=>({
                type: "literal",
                value: match[0]
            })
    }
];
export class DateTimeFormatter {
    #format;
    constructor(formatString, rules = defaultRules){
        const tokenizer = new Tokenizer(rules);
        this.#format = tokenizer.tokenize(formatString, ({ type , value , hour12  })=>{
            const result = {
                type,
                value
            };
            if (hour12) result.hour12 = hour12;
            return result;
        });
    }
    format(date, options = {}) {
        let string = "";
        const utc = options.timeZone === "UTC";
        for (const token of this.#format){
            const type = token.type;
            switch(type){
                case "year":
                    {
                        const value = utc ? date.getUTCFullYear() : date.getFullYear();
                        switch(token.value){
                            case "numeric":
                                {
                                    string += value;
                                    break;
                                }
                            case "2-digit":
                                {
                                    string += digits(value, 2).slice(-2);
                                    break;
                                }
                            default:
                                throw Error(`FormatterError: value "${token.value}" is not supported`);
                        }
                        break;
                    }
                case "month":
                    {
                        const value1 = (utc ? date.getUTCMonth() : date.getMonth()) + 1;
                        switch(token.value){
                            case "numeric":
                                {
                                    string += value1;
                                    break;
                                }
                            case "2-digit":
                                {
                                    string += digits(value1, 2);
                                    break;
                                }
                            default:
                                throw Error(`FormatterError: value "${token.value}" is not supported`);
                        }
                        break;
                    }
                case "day":
                    {
                        const value2 = utc ? date.getUTCDate() : date.getDate();
                        switch(token.value){
                            case "numeric":
                                {
                                    string += value2;
                                    break;
                                }
                            case "2-digit":
                                {
                                    string += digits(value2, 2);
                                    break;
                                }
                            default:
                                throw Error(`FormatterError: value "${token.value}" is not supported`);
                        }
                        break;
                    }
                case "hour":
                    {
                        let value3 = utc ? date.getUTCHours() : date.getHours();
                        value3 -= token.hour12 && date.getHours() > 12 ? 12 : 0;
                        switch(token.value){
                            case "numeric":
                                {
                                    string += value3;
                                    break;
                                }
                            case "2-digit":
                                {
                                    string += digits(value3, 2);
                                    break;
                                }
                            default:
                                throw Error(`FormatterError: value "${token.value}" is not supported`);
                        }
                        break;
                    }
                case "minute":
                    {
                        const value4 = utc ? date.getUTCMinutes() : date.getMinutes();
                        switch(token.value){
                            case "numeric":
                                {
                                    string += value4;
                                    break;
                                }
                            case "2-digit":
                                {
                                    string += digits(value4, 2);
                                    break;
                                }
                            default:
                                throw Error(`FormatterError: value "${token.value}" is not supported`);
                        }
                        break;
                    }
                case "second":
                    {
                        const value5 = utc ? date.getUTCSeconds() : date.getSeconds();
                        switch(token.value){
                            case "numeric":
                                {
                                    string += value5;
                                    break;
                                }
                            case "2-digit":
                                {
                                    string += digits(value5, 2);
                                    break;
                                }
                            default:
                                throw Error(`FormatterError: value "${token.value}" is not supported`);
                        }
                        break;
                    }
                case "fractionalSecond":
                    {
                        const value6 = utc ? date.getUTCMilliseconds() : date.getMilliseconds();
                        string += digits(value6, Number(token.value));
                        break;
                    }
                // FIXME(bartlomieju)
                case "timeZoneName":
                    {
                        break;
                    }
                case "dayPeriod":
                    {
                        string += token.value ? date.getHours() >= 12 ? "PM" : "AM" : "";
                        break;
                    }
                case "literal":
                    {
                        string += token.value;
                        break;
                    }
                default:
                    throw Error(`FormatterError: { ${token.type} ${token.value} }`);
            }
        }
        return string;
    }
    parseToParts(string) {
        const parts = [];
        for (const token of this.#format){
            const type = token.type;
            let value = "";
            switch(token.type){
                case "year":
                    {
                        switch(token.value){
                            case "numeric":
                                {
                                    value = /^\d{1,4}/.exec(string)?.[0];
                                    break;
                                }
                            case "2-digit":
                                {
                                    value = /^\d{1,2}/.exec(string)?.[0];
                                    break;
                                }
                        }
                        break;
                    }
                case "month":
                    {
                        switch(token.value){
                            case "numeric":
                                {
                                    value = /^\d{1,2}/.exec(string)?.[0];
                                    break;
                                }
                            case "2-digit":
                                {
                                    value = /^\d{2}/.exec(string)?.[0];
                                    break;
                                }
                            case "narrow":
                                {
                                    value = /^[a-zA-Z]+/.exec(string)?.[0];
                                    break;
                                }
                            case "short":
                                {
                                    value = /^[a-zA-Z]+/.exec(string)?.[0];
                                    break;
                                }
                            case "long":
                                {
                                    value = /^[a-zA-Z]+/.exec(string)?.[0];
                                    break;
                                }
                            default:
                                throw Error(`ParserError: value "${token.value}" is not supported`);
                        }
                        break;
                    }
                case "day":
                    {
                        switch(token.value){
                            case "numeric":
                                {
                                    value = /^\d{1,2}/.exec(string)?.[0];
                                    break;
                                }
                            case "2-digit":
                                {
                                    value = /^\d{2}/.exec(string)?.[0];
                                    break;
                                }
                            default:
                                throw Error(`ParserError: value "${token.value}" is not supported`);
                        }
                        break;
                    }
                case "hour":
                    {
                        switch(token.value){
                            case "numeric":
                                {
                                    value = /^\d{1,2}/.exec(string)?.[0];
                                    if (token.hour12 && parseInt(value) > 12) {
                                        console.error(`Trying to parse hour greater than 12. Use 'H' instead of 'h'.`);
                                    }
                                    break;
                                }
                            case "2-digit":
                                {
                                    value = /^\d{2}/.exec(string)?.[0];
                                    if (token.hour12 && parseInt(value) > 12) {
                                        console.error(`Trying to parse hour greater than 12. Use 'HH' instead of 'hh'.`);
                                    }
                                    break;
                                }
                            default:
                                throw Error(`ParserError: value "${token.value}" is not supported`);
                        }
                        break;
                    }
                case "minute":
                    {
                        switch(token.value){
                            case "numeric":
                                {
                                    value = /^\d{1,2}/.exec(string)?.[0];
                                    break;
                                }
                            case "2-digit":
                                {
                                    value = /^\d{2}/.exec(string)?.[0];
                                    break;
                                }
                            default:
                                throw Error(`ParserError: value "${token.value}" is not supported`);
                        }
                        break;
                    }
                case "second":
                    {
                        switch(token.value){
                            case "numeric":
                                {
                                    value = /^\d{1,2}/.exec(string)?.[0];
                                    break;
                                }
                            case "2-digit":
                                {
                                    value = /^\d{2}/.exec(string)?.[0];
                                    break;
                                }
                            default:
                                throw Error(`ParserError: value "${token.value}" is not supported`);
                        }
                        break;
                    }
                case "fractionalSecond":
                    {
                        value = new RegExp(`^\\d{${token.value}}`).exec(string)?.[0];
                        break;
                    }
                case "timeZoneName":
                    {
                        value = token.value;
                        break;
                    }
                case "dayPeriod":
                    {
                        value = /^(A|P)M/.exec(string)?.[0];
                        break;
                    }
                case "literal":
                    {
                        if (!string.startsWith(token.value)) {
                            throw Error(`Literal "${token.value}" not found "${string.slice(0, 25)}"`);
                        }
                        value = token.value;
                        break;
                    }
                default:
                    throw Error(`${token.type} ${token.value}`);
            }
            if (!value) {
                throw Error(`value not valid for token { ${type} ${value} } ${string.slice(0, 25)}`);
            }
            parts.push({
                type,
                value
            });
            string = string.slice(value.length);
        }
        if (string.length) {
            throw Error(`datetime string was not fully parsed! ${string.slice(0, 25)}`);
        }
        return parts;
    }
    /** sort & filter dateTimeFormatPart */ sortDateTimeFormatPart(parts) {
        let result = [];
        const typeArray = [
            "year",
            "month",
            "day",
            "hour",
            "minute",
            "second",
            "fractionalSecond"
        ];
        for (const type of typeArray){
            const current = parts.findIndex((el)=>el.type === type);
            if (current !== -1) {
                result = result.concat(parts.splice(current, 1));
            }
        }
        result = result.concat(parts);
        return result;
    }
    partsToDate(parts) {
        const date = new Date();
        const utc = parts.find((part)=>part.type === "timeZoneName" && part.value === "UTC");
        const dayPart = parts.find((part)=>part.type === "day");
        utc ? date.setUTCHours(0, 0, 0, 0) : date.setHours(0, 0, 0, 0);
        for (const part of parts){
            switch(part.type){
                case "year":
                    {
                        const value = Number(part.value.padStart(4, "20"));
                        utc ? date.setUTCFullYear(value) : date.setFullYear(value);
                        break;
                    }
                case "month":
                    {
                        const value1 = Number(part.value) - 1;
                        if (dayPart) {
                            utc ? date.setUTCMonth(value1, Number(dayPart.value)) : date.setMonth(value1, Number(dayPart.value));
                        } else {
                            utc ? date.setUTCMonth(value1) : date.setMonth(value1);
                        }
                        break;
                    }
                case "day":
                    {
                        const value2 = Number(part.value);
                        utc ? date.setUTCDate(value2) : date.setDate(value2);
                        break;
                    }
                case "hour":
                    {
                        let value3 = Number(part.value);
                        const dayPeriod = parts.find((part)=>part.type === "dayPeriod");
                        if (dayPeriod?.value === "PM") value3 += 12;
                        utc ? date.setUTCHours(value3) : date.setHours(value3);
                        break;
                    }
                case "minute":
                    {
                        const value4 = Number(part.value);
                        utc ? date.setUTCMinutes(value4) : date.setMinutes(value4);
                        break;
                    }
                case "second":
                    {
                        const value5 = Number(part.value);
                        utc ? date.setUTCSeconds(value5) : date.setSeconds(value5);
                        break;
                    }
                case "fractionalSecond":
                    {
                        const value6 = Number(part.value);
                        utc ? date.setUTCMilliseconds(value6) : date.setMilliseconds(value6);
                        break;
                    }
            }
        }
        return date;
    }
    parse(string) {
        const parts = this.parseToParts(string);
        const sortParts = this.sortDateTimeFormatPart(parts);
        return this.partsToDate(sortParts);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE2MC4wL2RhdGV0aW1lL2Zvcm1hdHRlci50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuLy8gVGhpcyBtb2R1bGUgaXMgYnJvd3NlciBjb21wYXRpYmxlLlxuXG5pbXBvcnQge1xuICBDYWxsYmFja1Jlc3VsdCxcbiAgUmVjZWl2ZXJSZXN1bHQsXG4gIFJ1bGUsXG4gIFRlc3RGdW5jdGlvbixcbiAgVGVzdFJlc3VsdCxcbiAgVG9rZW5pemVyLFxufSBmcm9tIFwiLi90b2tlbml6ZXIudHNcIjtcblxuZnVuY3Rpb24gZGlnaXRzKHZhbHVlOiBzdHJpbmcgfCBudW1iZXIsIGNvdW50ID0gMik6IHN0cmluZyB7XG4gIHJldHVybiBTdHJpbmcodmFsdWUpLnBhZFN0YXJ0KGNvdW50LCBcIjBcIik7XG59XG5cbi8vIGFzIGRlY2xhcmVkIGFzIGluIG5hbWVzcGFjZSBJbnRsXG50eXBlIERhdGVUaW1lRm9ybWF0UGFydFR5cGVzID1cbiAgfCBcImRheVwiXG4gIHwgXCJkYXlQZXJpb2RcIlxuICAvLyB8IFwiZXJhXCJcbiAgfCBcImhvdXJcIlxuICB8IFwibGl0ZXJhbFwiXG4gIHwgXCJtaW51dGVcIlxuICB8IFwibW9udGhcIlxuICB8IFwic2Vjb25kXCJcbiAgfCBcInRpbWVab25lTmFtZVwiXG4gIC8vIHwgXCJ3ZWVrZGF5XCJcbiAgfCBcInllYXJcIlxuICB8IFwiZnJhY3Rpb25hbFNlY29uZFwiO1xuXG5pbnRlcmZhY2UgRGF0ZVRpbWVGb3JtYXRQYXJ0IHtcbiAgdHlwZTogRGF0ZVRpbWVGb3JtYXRQYXJ0VHlwZXM7XG4gIHZhbHVlOiBzdHJpbmc7XG59XG5cbnR5cGUgVGltZVpvbmUgPSBcIlVUQ1wiO1xuXG5pbnRlcmZhY2UgT3B0aW9ucyB7XG4gIHRpbWVab25lPzogVGltZVpvbmU7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUxpdGVyYWxUZXN0RnVuY3Rpb24odmFsdWU6IHN0cmluZyk6IFRlc3RGdW5jdGlvbiB7XG4gIHJldHVybiAoc3RyaW5nOiBzdHJpbmcpOiBUZXN0UmVzdWx0ID0+IHtcbiAgICByZXR1cm4gc3RyaW5nLnN0YXJ0c1dpdGgodmFsdWUpXG4gICAgICA/IHsgdmFsdWUsIGxlbmd0aDogdmFsdWUubGVuZ3RoIH1cbiAgICAgIDogdW5kZWZpbmVkO1xuICB9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNYXRjaFRlc3RGdW5jdGlvbihtYXRjaDogUmVnRXhwKTogVGVzdEZ1bmN0aW9uIHtcbiAgcmV0dXJuIChzdHJpbmc6IHN0cmluZyk6IFRlc3RSZXN1bHQgPT4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IG1hdGNoLmV4ZWMoc3RyaW5nKTtcbiAgICBpZiAocmVzdWx0KSByZXR1cm4geyB2YWx1ZTogcmVzdWx0LCBsZW5ndGg6IHJlc3VsdFswXS5sZW5ndGggfTtcbiAgfTtcbn1cblxuLy8gYWNjb3JkaW5nIHRvIHVuaWNvZGUgc3ltYm9scyAoaHR0cDovL3d3dy51bmljb2RlLm9yZy9yZXBvcnRzL3RyMzUvdHIzNS1kYXRlcy5odG1sI0RhdGVfRmllbGRfU3ltYm9sX1RhYmxlKVxuY29uc3QgZGVmYXVsdFJ1bGVzID0gW1xuICB7XG4gICAgdGVzdDogY3JlYXRlTGl0ZXJhbFRlc3RGdW5jdGlvbihcInl5eXlcIiksXG4gICAgZm46ICgpOiBDYWxsYmFja1Jlc3VsdCA9PiAoeyB0eXBlOiBcInllYXJcIiwgdmFsdWU6IFwibnVtZXJpY1wiIH0pLFxuICB9LFxuICB7XG4gICAgdGVzdDogY3JlYXRlTGl0ZXJhbFRlc3RGdW5jdGlvbihcInl5XCIpLFxuICAgIGZuOiAoKTogQ2FsbGJhY2tSZXN1bHQgPT4gKHsgdHlwZTogXCJ5ZWFyXCIsIHZhbHVlOiBcIjItZGlnaXRcIiB9KSxcbiAgfSxcblxuICB7XG4gICAgdGVzdDogY3JlYXRlTGl0ZXJhbFRlc3RGdW5jdGlvbihcIk1NXCIpLFxuICAgIGZuOiAoKTogQ2FsbGJhY2tSZXN1bHQgPT4gKHsgdHlwZTogXCJtb250aFwiLCB2YWx1ZTogXCIyLWRpZ2l0XCIgfSksXG4gIH0sXG4gIHtcbiAgICB0ZXN0OiBjcmVhdGVMaXRlcmFsVGVzdEZ1bmN0aW9uKFwiTVwiKSxcbiAgICBmbjogKCk6IENhbGxiYWNrUmVzdWx0ID0+ICh7IHR5cGU6IFwibW9udGhcIiwgdmFsdWU6IFwibnVtZXJpY1wiIH0pLFxuICB9LFxuICB7XG4gICAgdGVzdDogY3JlYXRlTGl0ZXJhbFRlc3RGdW5jdGlvbihcImRkXCIpLFxuICAgIGZuOiAoKTogQ2FsbGJhY2tSZXN1bHQgPT4gKHsgdHlwZTogXCJkYXlcIiwgdmFsdWU6IFwiMi1kaWdpdFwiIH0pLFxuICB9LFxuICB7XG4gICAgdGVzdDogY3JlYXRlTGl0ZXJhbFRlc3RGdW5jdGlvbihcImRcIiksXG4gICAgZm46ICgpOiBDYWxsYmFja1Jlc3VsdCA9PiAoeyB0eXBlOiBcImRheVwiLCB2YWx1ZTogXCJudW1lcmljXCIgfSksXG4gIH0sXG5cbiAge1xuICAgIHRlc3Q6IGNyZWF0ZUxpdGVyYWxUZXN0RnVuY3Rpb24oXCJISFwiKSxcbiAgICBmbjogKCk6IENhbGxiYWNrUmVzdWx0ID0+ICh7IHR5cGU6IFwiaG91clwiLCB2YWx1ZTogXCIyLWRpZ2l0XCIgfSksXG4gIH0sXG4gIHtcbiAgICB0ZXN0OiBjcmVhdGVMaXRlcmFsVGVzdEZ1bmN0aW9uKFwiSFwiKSxcbiAgICBmbjogKCk6IENhbGxiYWNrUmVzdWx0ID0+ICh7IHR5cGU6IFwiaG91clwiLCB2YWx1ZTogXCJudW1lcmljXCIgfSksXG4gIH0sXG4gIHtcbiAgICB0ZXN0OiBjcmVhdGVMaXRlcmFsVGVzdEZ1bmN0aW9uKFwiaGhcIiksXG4gICAgZm46ICgpOiBDYWxsYmFja1Jlc3VsdCA9PiAoe1xuICAgICAgdHlwZTogXCJob3VyXCIsXG4gICAgICB2YWx1ZTogXCIyLWRpZ2l0XCIsXG4gICAgICBob3VyMTI6IHRydWUsXG4gICAgfSksXG4gIH0sXG4gIHtcbiAgICB0ZXN0OiBjcmVhdGVMaXRlcmFsVGVzdEZ1bmN0aW9uKFwiaFwiKSxcbiAgICBmbjogKCk6IENhbGxiYWNrUmVzdWx0ID0+ICh7XG4gICAgICB0eXBlOiBcImhvdXJcIixcbiAgICAgIHZhbHVlOiBcIm51bWVyaWNcIixcbiAgICAgIGhvdXIxMjogdHJ1ZSxcbiAgICB9KSxcbiAgfSxcbiAge1xuICAgIHRlc3Q6IGNyZWF0ZUxpdGVyYWxUZXN0RnVuY3Rpb24oXCJtbVwiKSxcbiAgICBmbjogKCk6IENhbGxiYWNrUmVzdWx0ID0+ICh7IHR5cGU6IFwibWludXRlXCIsIHZhbHVlOiBcIjItZGlnaXRcIiB9KSxcbiAgfSxcbiAge1xuICAgIHRlc3Q6IGNyZWF0ZUxpdGVyYWxUZXN0RnVuY3Rpb24oXCJtXCIpLFxuICAgIGZuOiAoKTogQ2FsbGJhY2tSZXN1bHQgPT4gKHsgdHlwZTogXCJtaW51dGVcIiwgdmFsdWU6IFwibnVtZXJpY1wiIH0pLFxuICB9LFxuICB7XG4gICAgdGVzdDogY3JlYXRlTGl0ZXJhbFRlc3RGdW5jdGlvbihcInNzXCIpLFxuICAgIGZuOiAoKTogQ2FsbGJhY2tSZXN1bHQgPT4gKHsgdHlwZTogXCJzZWNvbmRcIiwgdmFsdWU6IFwiMi1kaWdpdFwiIH0pLFxuICB9LFxuICB7XG4gICAgdGVzdDogY3JlYXRlTGl0ZXJhbFRlc3RGdW5jdGlvbihcInNcIiksXG4gICAgZm46ICgpOiBDYWxsYmFja1Jlc3VsdCA9PiAoeyB0eXBlOiBcInNlY29uZFwiLCB2YWx1ZTogXCJudW1lcmljXCIgfSksXG4gIH0sXG4gIHtcbiAgICB0ZXN0OiBjcmVhdGVMaXRlcmFsVGVzdEZ1bmN0aW9uKFwiU1NTXCIpLFxuICAgIGZuOiAoKTogQ2FsbGJhY2tSZXN1bHQgPT4gKHsgdHlwZTogXCJmcmFjdGlvbmFsU2Vjb25kXCIsIHZhbHVlOiAzIH0pLFxuICB9LFxuICB7XG4gICAgdGVzdDogY3JlYXRlTGl0ZXJhbFRlc3RGdW5jdGlvbihcIlNTXCIpLFxuICAgIGZuOiAoKTogQ2FsbGJhY2tSZXN1bHQgPT4gKHsgdHlwZTogXCJmcmFjdGlvbmFsU2Vjb25kXCIsIHZhbHVlOiAyIH0pLFxuICB9LFxuICB7XG4gICAgdGVzdDogY3JlYXRlTGl0ZXJhbFRlc3RGdW5jdGlvbihcIlNcIiksXG4gICAgZm46ICgpOiBDYWxsYmFja1Jlc3VsdCA9PiAoeyB0eXBlOiBcImZyYWN0aW9uYWxTZWNvbmRcIiwgdmFsdWU6IDEgfSksXG4gIH0sXG5cbiAge1xuICAgIHRlc3Q6IGNyZWF0ZUxpdGVyYWxUZXN0RnVuY3Rpb24oXCJhXCIpLFxuICAgIGZuOiAodmFsdWU6IHVua25vd24pOiBDYWxsYmFja1Jlc3VsdCA9PiAoe1xuICAgICAgdHlwZTogXCJkYXlQZXJpb2RcIixcbiAgICAgIHZhbHVlOiB2YWx1ZSBhcyBzdHJpbmcsXG4gICAgfSksXG4gIH0sXG5cbiAgLy8gcXVvdGVkIGxpdGVyYWxcbiAge1xuICAgIHRlc3Q6IGNyZWF0ZU1hdGNoVGVzdEZ1bmN0aW9uKC9eKCcpKD88dmFsdWU+XFxcXC58W15cXCddKilcXDEvKSxcbiAgICBmbjogKG1hdGNoOiB1bmtub3duKTogQ2FsbGJhY2tSZXN1bHQgPT4gKHtcbiAgICAgIHR5cGU6IFwibGl0ZXJhbFwiLFxuICAgICAgdmFsdWU6IChtYXRjaCBhcyBSZWdFeHBFeGVjQXJyYXkpLmdyb3VwcyEudmFsdWUgYXMgc3RyaW5nLFxuICAgIH0pLFxuICB9LFxuICAvLyBsaXRlcmFsXG4gIHtcbiAgICB0ZXN0OiBjcmVhdGVNYXRjaFRlc3RGdW5jdGlvbigvXi4rP1xccyovKSxcbiAgICBmbjogKG1hdGNoOiB1bmtub3duKTogQ2FsbGJhY2tSZXN1bHQgPT4gKHtcbiAgICAgIHR5cGU6IFwibGl0ZXJhbFwiLFxuICAgICAgdmFsdWU6IChtYXRjaCBhcyBSZWdFeHBFeGVjQXJyYXkpWzBdLFxuICAgIH0pLFxuICB9LFxuXTtcblxudHlwZSBGb3JtYXRQYXJ0ID0ge1xuICB0eXBlOiBEYXRlVGltZUZvcm1hdFBhcnRUeXBlcztcbiAgdmFsdWU6IHN0cmluZyB8IG51bWJlcjtcbiAgaG91cjEyPzogYm9vbGVhbjtcbn07XG50eXBlIEZvcm1hdCA9IEZvcm1hdFBhcnRbXTtcblxuZXhwb3J0IGNsYXNzIERhdGVUaW1lRm9ybWF0dGVyIHtcbiAgI2Zvcm1hdDogRm9ybWF0O1xuXG4gIGNvbnN0cnVjdG9yKGZvcm1hdFN0cmluZzogc3RyaW5nLCBydWxlczogUnVsZVtdID0gZGVmYXVsdFJ1bGVzKSB7XG4gICAgY29uc3QgdG9rZW5pemVyID0gbmV3IFRva2VuaXplcihydWxlcyk7XG4gICAgdGhpcy4jZm9ybWF0ID0gdG9rZW5pemVyLnRva2VuaXplKFxuICAgICAgZm9ybWF0U3RyaW5nLFxuICAgICAgKHsgdHlwZSwgdmFsdWUsIGhvdXIxMiB9KSA9PiB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHtcbiAgICAgICAgICB0eXBlLFxuICAgICAgICAgIHZhbHVlLFxuICAgICAgICB9IGFzIHVua25vd24gYXMgUmVjZWl2ZXJSZXN1bHQ7XG4gICAgICAgIGlmIChob3VyMTIpIHJlc3VsdC5ob3VyMTIgPSBob3VyMTIgYXMgYm9vbGVhbjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH0sXG4gICAgKSBhcyBGb3JtYXQ7XG4gIH1cblxuICBmb3JtYXQoZGF0ZTogRGF0ZSwgb3B0aW9uczogT3B0aW9ucyA9IHt9KTogc3RyaW5nIHtcbiAgICBsZXQgc3RyaW5nID0gXCJcIjtcblxuICAgIGNvbnN0IHV0YyA9IG9wdGlvbnMudGltZVpvbmUgPT09IFwiVVRDXCI7XG5cbiAgICBmb3IgKGNvbnN0IHRva2VuIG9mIHRoaXMuI2Zvcm1hdCkge1xuICAgICAgY29uc3QgdHlwZSA9IHRva2VuLnR5cGU7XG5cbiAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICBjYXNlIFwieWVhclwiOiB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSB1dGMgPyBkYXRlLmdldFVUQ0Z1bGxZZWFyKCkgOiBkYXRlLmdldEZ1bGxZZWFyKCk7XG4gICAgICAgICAgc3dpdGNoICh0b2tlbi52YWx1ZSkge1xuICAgICAgICAgICAgY2FzZSBcIm51bWVyaWNcIjoge1xuICAgICAgICAgICAgICBzdHJpbmcgKz0gdmFsdWU7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSBcIjItZGlnaXRcIjoge1xuICAgICAgICAgICAgICBzdHJpbmcgKz0gZGlnaXRzKHZhbHVlLCAyKS5zbGljZSgtMik7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoXG4gICAgICAgICAgICAgICAgYEZvcm1hdHRlckVycm9yOiB2YWx1ZSBcIiR7dG9rZW4udmFsdWV9XCIgaXMgbm90IHN1cHBvcnRlZGAsXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgXCJtb250aFwiOiB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSAodXRjID8gZGF0ZS5nZXRVVENNb250aCgpIDogZGF0ZS5nZXRNb250aCgpKSArIDE7XG4gICAgICAgICAgc3dpdGNoICh0b2tlbi52YWx1ZSkge1xuICAgICAgICAgICAgY2FzZSBcIm51bWVyaWNcIjoge1xuICAgICAgICAgICAgICBzdHJpbmcgKz0gdmFsdWU7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSBcIjItZGlnaXRcIjoge1xuICAgICAgICAgICAgICBzdHJpbmcgKz0gZGlnaXRzKHZhbHVlLCAyKTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICB0aHJvdyBFcnJvcihcbiAgICAgICAgICAgICAgICBgRm9ybWF0dGVyRXJyb3I6IHZhbHVlIFwiJHt0b2tlbi52YWx1ZX1cIiBpcyBub3Qgc3VwcG9ydGVkYCxcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBcImRheVwiOiB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSB1dGMgPyBkYXRlLmdldFVUQ0RhdGUoKSA6IGRhdGUuZ2V0RGF0ZSgpO1xuICAgICAgICAgIHN3aXRjaCAodG9rZW4udmFsdWUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJudW1lcmljXCI6IHtcbiAgICAgICAgICAgICAgc3RyaW5nICs9IHZhbHVlO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgXCIyLWRpZ2l0XCI6IHtcbiAgICAgICAgICAgICAgc3RyaW5nICs9IGRpZ2l0cyh2YWx1ZSwgMik7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoXG4gICAgICAgICAgICAgICAgYEZvcm1hdHRlckVycm9yOiB2YWx1ZSBcIiR7dG9rZW4udmFsdWV9XCIgaXMgbm90IHN1cHBvcnRlZGAsXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgXCJob3VyXCI6IHtcbiAgICAgICAgICBsZXQgdmFsdWUgPSB1dGMgPyBkYXRlLmdldFVUQ0hvdXJzKCkgOiBkYXRlLmdldEhvdXJzKCk7XG4gICAgICAgICAgdmFsdWUgLT0gdG9rZW4uaG91cjEyICYmIGRhdGUuZ2V0SG91cnMoKSA+IDEyID8gMTIgOiAwO1xuICAgICAgICAgIHN3aXRjaCAodG9rZW4udmFsdWUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJudW1lcmljXCI6IHtcbiAgICAgICAgICAgICAgc3RyaW5nICs9IHZhbHVlO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgXCIyLWRpZ2l0XCI6IHtcbiAgICAgICAgICAgICAgc3RyaW5nICs9IGRpZ2l0cyh2YWx1ZSwgMik7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoXG4gICAgICAgICAgICAgICAgYEZvcm1hdHRlckVycm9yOiB2YWx1ZSBcIiR7dG9rZW4udmFsdWV9XCIgaXMgbm90IHN1cHBvcnRlZGAsXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgXCJtaW51dGVcIjoge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gdXRjID8gZGF0ZS5nZXRVVENNaW51dGVzKCkgOiBkYXRlLmdldE1pbnV0ZXMoKTtcbiAgICAgICAgICBzd2l0Y2ggKHRva2VuLnZhbHVlKSB7XG4gICAgICAgICAgICBjYXNlIFwibnVtZXJpY1wiOiB7XG4gICAgICAgICAgICAgIHN0cmluZyArPSB2YWx1ZTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlIFwiMi1kaWdpdFwiOiB7XG4gICAgICAgICAgICAgIHN0cmluZyArPSBkaWdpdHModmFsdWUsIDIpO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgIHRocm93IEVycm9yKFxuICAgICAgICAgICAgICAgIGBGb3JtYXR0ZXJFcnJvcjogdmFsdWUgXCIke3Rva2VuLnZhbHVlfVwiIGlzIG5vdCBzdXBwb3J0ZWRgLFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlIFwic2Vjb25kXCI6IHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHV0YyA/IGRhdGUuZ2V0VVRDU2Vjb25kcygpIDogZGF0ZS5nZXRTZWNvbmRzKCk7XG4gICAgICAgICAgc3dpdGNoICh0b2tlbi52YWx1ZSkge1xuICAgICAgICAgICAgY2FzZSBcIm51bWVyaWNcIjoge1xuICAgICAgICAgICAgICBzdHJpbmcgKz0gdmFsdWU7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSBcIjItZGlnaXRcIjoge1xuICAgICAgICAgICAgICBzdHJpbmcgKz0gZGlnaXRzKHZhbHVlLCAyKTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICB0aHJvdyBFcnJvcihcbiAgICAgICAgICAgICAgICBgRm9ybWF0dGVyRXJyb3I6IHZhbHVlIFwiJHt0b2tlbi52YWx1ZX1cIiBpcyBub3Qgc3VwcG9ydGVkYCxcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBcImZyYWN0aW9uYWxTZWNvbmRcIjoge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gdXRjXG4gICAgICAgICAgICA/IGRhdGUuZ2V0VVRDTWlsbGlzZWNvbmRzKClcbiAgICAgICAgICAgIDogZGF0ZS5nZXRNaWxsaXNlY29uZHMoKTtcbiAgICAgICAgICBzdHJpbmcgKz0gZGlnaXRzKHZhbHVlLCBOdW1iZXIodG9rZW4udmFsdWUpKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICAvLyBGSVhNRShiYXJ0bG9taWVqdSlcbiAgICAgICAgY2FzZSBcInRpbWVab25lTmFtZVwiOiB7XG4gICAgICAgICAgLy8gc3RyaW5nICs9IHV0YyA/IFwiWlwiIDogdG9rZW4udmFsdWVcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlIFwiZGF5UGVyaW9kXCI6IHtcbiAgICAgICAgICBzdHJpbmcgKz0gdG9rZW4udmFsdWUgPyAoZGF0ZS5nZXRIb3VycygpID49IDEyID8gXCJQTVwiIDogXCJBTVwiKSA6IFwiXCI7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBcImxpdGVyYWxcIjoge1xuICAgICAgICAgIHN0cmluZyArPSB0b2tlbi52YWx1ZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgRXJyb3IoYEZvcm1hdHRlckVycm9yOiB7ICR7dG9rZW4udHlwZX0gJHt0b2tlbi52YWx1ZX0gfWApO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBzdHJpbmc7XG4gIH1cblxuICBwYXJzZVRvUGFydHMoc3RyaW5nOiBzdHJpbmcpOiBEYXRlVGltZUZvcm1hdFBhcnRbXSB7XG4gICAgY29uc3QgcGFydHM6IERhdGVUaW1lRm9ybWF0UGFydFtdID0gW107XG5cbiAgICBmb3IgKGNvbnN0IHRva2VuIG9mIHRoaXMuI2Zvcm1hdCkge1xuICAgICAgY29uc3QgdHlwZSA9IHRva2VuLnR5cGU7XG5cbiAgICAgIGxldCB2YWx1ZSA9IFwiXCI7XG4gICAgICBzd2l0Y2ggKHRva2VuLnR5cGUpIHtcbiAgICAgICAgY2FzZSBcInllYXJcIjoge1xuICAgICAgICAgIHN3aXRjaCAodG9rZW4udmFsdWUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJudW1lcmljXCI6IHtcbiAgICAgICAgICAgICAgdmFsdWUgPSAvXlxcZHsxLDR9Ly5leGVjKHN0cmluZyk/LlswXSBhcyBzdHJpbmc7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSBcIjItZGlnaXRcIjoge1xuICAgICAgICAgICAgICB2YWx1ZSA9IC9eXFxkezEsMn0vLmV4ZWMoc3RyaW5nKT8uWzBdIGFzIHN0cmluZztcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgXCJtb250aFwiOiB7XG4gICAgICAgICAgc3dpdGNoICh0b2tlbi52YWx1ZSkge1xuICAgICAgICAgICAgY2FzZSBcIm51bWVyaWNcIjoge1xuICAgICAgICAgICAgICB2YWx1ZSA9IC9eXFxkezEsMn0vLmV4ZWMoc3RyaW5nKT8uWzBdIGFzIHN0cmluZztcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlIFwiMi1kaWdpdFwiOiB7XG4gICAgICAgICAgICAgIHZhbHVlID0gL15cXGR7Mn0vLmV4ZWMoc3RyaW5nKT8uWzBdIGFzIHN0cmluZztcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlIFwibmFycm93XCI6IHtcbiAgICAgICAgICAgICAgdmFsdWUgPSAvXlthLXpBLVpdKy8uZXhlYyhzdHJpbmcpPy5bMF0gYXMgc3RyaW5nO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgXCJzaG9ydFwiOiB7XG4gICAgICAgICAgICAgIHZhbHVlID0gL15bYS16QS1aXSsvLmV4ZWMoc3RyaW5nKT8uWzBdIGFzIHN0cmluZztcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlIFwibG9uZ1wiOiB7XG4gICAgICAgICAgICAgIHZhbHVlID0gL15bYS16QS1aXSsvLmV4ZWMoc3RyaW5nKT8uWzBdIGFzIHN0cmluZztcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICB0aHJvdyBFcnJvcihcbiAgICAgICAgICAgICAgICBgUGFyc2VyRXJyb3I6IHZhbHVlIFwiJHt0b2tlbi52YWx1ZX1cIiBpcyBub3Qgc3VwcG9ydGVkYCxcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBcImRheVwiOiB7XG4gICAgICAgICAgc3dpdGNoICh0b2tlbi52YWx1ZSkge1xuICAgICAgICAgICAgY2FzZSBcIm51bWVyaWNcIjoge1xuICAgICAgICAgICAgICB2YWx1ZSA9IC9eXFxkezEsMn0vLmV4ZWMoc3RyaW5nKT8uWzBdIGFzIHN0cmluZztcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlIFwiMi1kaWdpdFwiOiB7XG4gICAgICAgICAgICAgIHZhbHVlID0gL15cXGR7Mn0vLmV4ZWMoc3RyaW5nKT8uWzBdIGFzIHN0cmluZztcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICB0aHJvdyBFcnJvcihcbiAgICAgICAgICAgICAgICBgUGFyc2VyRXJyb3I6IHZhbHVlIFwiJHt0b2tlbi52YWx1ZX1cIiBpcyBub3Qgc3VwcG9ydGVkYCxcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBcImhvdXJcIjoge1xuICAgICAgICAgIHN3aXRjaCAodG9rZW4udmFsdWUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJudW1lcmljXCI6IHtcbiAgICAgICAgICAgICAgdmFsdWUgPSAvXlxcZHsxLDJ9Ly5leGVjKHN0cmluZyk/LlswXSBhcyBzdHJpbmc7XG4gICAgICAgICAgICAgIGlmICh0b2tlbi5ob3VyMTIgJiYgcGFyc2VJbnQodmFsdWUpID4gMTIpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgICAgICAgICAgYFRyeWluZyB0byBwYXJzZSBob3VyIGdyZWF0ZXIgdGhhbiAxMi4gVXNlICdIJyBpbnN0ZWFkIG9mICdoJy5gLFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlIFwiMi1kaWdpdFwiOiB7XG4gICAgICAgICAgICAgIHZhbHVlID0gL15cXGR7Mn0vLmV4ZWMoc3RyaW5nKT8uWzBdIGFzIHN0cmluZztcbiAgICAgICAgICAgICAgaWYgKHRva2VuLmhvdXIxMiAmJiBwYXJzZUludCh2YWx1ZSkgPiAxMikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgICAgICAgICBgVHJ5aW5nIHRvIHBhcnNlIGhvdXIgZ3JlYXRlciB0aGFuIDEyLiBVc2UgJ0hIJyBpbnN0ZWFkIG9mICdoaCcuYCxcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoXG4gICAgICAgICAgICAgICAgYFBhcnNlckVycm9yOiB2YWx1ZSBcIiR7dG9rZW4udmFsdWV9XCIgaXMgbm90IHN1cHBvcnRlZGAsXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgXCJtaW51dGVcIjoge1xuICAgICAgICAgIHN3aXRjaCAodG9rZW4udmFsdWUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJudW1lcmljXCI6IHtcbiAgICAgICAgICAgICAgdmFsdWUgPSAvXlxcZHsxLDJ9Ly5leGVjKHN0cmluZyk/LlswXSBhcyBzdHJpbmc7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSBcIjItZGlnaXRcIjoge1xuICAgICAgICAgICAgICB2YWx1ZSA9IC9eXFxkezJ9Ly5leGVjKHN0cmluZyk/LlswXSBhcyBzdHJpbmc7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoXG4gICAgICAgICAgICAgICAgYFBhcnNlckVycm9yOiB2YWx1ZSBcIiR7dG9rZW4udmFsdWV9XCIgaXMgbm90IHN1cHBvcnRlZGAsXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgXCJzZWNvbmRcIjoge1xuICAgICAgICAgIHN3aXRjaCAodG9rZW4udmFsdWUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJudW1lcmljXCI6IHtcbiAgICAgICAgICAgICAgdmFsdWUgPSAvXlxcZHsxLDJ9Ly5leGVjKHN0cmluZyk/LlswXSBhcyBzdHJpbmc7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSBcIjItZGlnaXRcIjoge1xuICAgICAgICAgICAgICB2YWx1ZSA9IC9eXFxkezJ9Ly5leGVjKHN0cmluZyk/LlswXSBhcyBzdHJpbmc7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoXG4gICAgICAgICAgICAgICAgYFBhcnNlckVycm9yOiB2YWx1ZSBcIiR7dG9rZW4udmFsdWV9XCIgaXMgbm90IHN1cHBvcnRlZGAsXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgXCJmcmFjdGlvbmFsU2Vjb25kXCI6IHtcbiAgICAgICAgICB2YWx1ZSA9IG5ldyBSZWdFeHAoYF5cXFxcZHske3Rva2VuLnZhbHVlfX1gKS5leGVjKHN0cmluZylcbiAgICAgICAgICAgID8uWzBdIGFzIHN0cmluZztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlIFwidGltZVpvbmVOYW1lXCI6IHtcbiAgICAgICAgICB2YWx1ZSA9IHRva2VuLnZhbHVlIGFzIHN0cmluZztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlIFwiZGF5UGVyaW9kXCI6IHtcbiAgICAgICAgICB2YWx1ZSA9IC9eKEF8UClNLy5leGVjKHN0cmluZyk/LlswXSBhcyBzdHJpbmc7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBcImxpdGVyYWxcIjoge1xuICAgICAgICAgIGlmICghc3RyaW5nLnN0YXJ0c1dpdGgodG9rZW4udmFsdWUgYXMgc3RyaW5nKSkge1xuICAgICAgICAgICAgdGhyb3cgRXJyb3IoXG4gICAgICAgICAgICAgIGBMaXRlcmFsIFwiJHt0b2tlbi52YWx1ZX1cIiBub3QgZm91bmQgXCIke3N0cmluZy5zbGljZSgwLCAyNSl9XCJgLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFsdWUgPSB0b2tlbi52YWx1ZSBhcyBzdHJpbmc7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cblxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHRocm93IEVycm9yKGAke3Rva2VuLnR5cGV9ICR7dG9rZW4udmFsdWV9YCk7XG4gICAgICB9XG5cbiAgICAgIGlmICghdmFsdWUpIHtcbiAgICAgICAgdGhyb3cgRXJyb3IoXG4gICAgICAgICAgYHZhbHVlIG5vdCB2YWxpZCBmb3IgdG9rZW4geyAke3R5cGV9ICR7dmFsdWV9IH0gJHtcbiAgICAgICAgICAgIHN0cmluZy5zbGljZShcbiAgICAgICAgICAgICAgMCxcbiAgICAgICAgICAgICAgMjUsXG4gICAgICAgICAgICApXG4gICAgICAgICAgfWAsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBwYXJ0cy5wdXNoKHsgdHlwZSwgdmFsdWUgfSk7XG5cbiAgICAgIHN0cmluZyA9IHN0cmluZy5zbGljZSh2YWx1ZS5sZW5ndGgpO1xuICAgIH1cblxuICAgIGlmIChzdHJpbmcubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBFcnJvcihcbiAgICAgICAgYGRhdGV0aW1lIHN0cmluZyB3YXMgbm90IGZ1bGx5IHBhcnNlZCEgJHtzdHJpbmcuc2xpY2UoMCwgMjUpfWAsXG4gICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiBwYXJ0cztcbiAgfVxuXG4gIC8qKiBzb3J0ICYgZmlsdGVyIGRhdGVUaW1lRm9ybWF0UGFydCAqL1xuICBzb3J0RGF0ZVRpbWVGb3JtYXRQYXJ0KHBhcnRzOiBEYXRlVGltZUZvcm1hdFBhcnRbXSk6IERhdGVUaW1lRm9ybWF0UGFydFtdIHtcbiAgICBsZXQgcmVzdWx0OiBEYXRlVGltZUZvcm1hdFBhcnRbXSA9IFtdO1xuICAgIGNvbnN0IHR5cGVBcnJheSA9IFtcbiAgICAgIFwieWVhclwiLFxuICAgICAgXCJtb250aFwiLFxuICAgICAgXCJkYXlcIixcbiAgICAgIFwiaG91clwiLFxuICAgICAgXCJtaW51dGVcIixcbiAgICAgIFwic2Vjb25kXCIsXG4gICAgICBcImZyYWN0aW9uYWxTZWNvbmRcIixcbiAgICBdO1xuICAgIGZvciAoY29uc3QgdHlwZSBvZiB0eXBlQXJyYXkpIHtcbiAgICAgIGNvbnN0IGN1cnJlbnQgPSBwYXJ0cy5maW5kSW5kZXgoKGVsKSA9PiBlbC50eXBlID09PSB0eXBlKTtcbiAgICAgIGlmIChjdXJyZW50ICE9PSAtMSkge1xuICAgICAgICByZXN1bHQgPSByZXN1bHQuY29uY2F0KHBhcnRzLnNwbGljZShjdXJyZW50LCAxKSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJlc3VsdCA9IHJlc3VsdC5jb25jYXQocGFydHMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwYXJ0c1RvRGF0ZShwYXJ0czogRGF0ZVRpbWVGb3JtYXRQYXJ0W10pOiBEYXRlIHtcbiAgICBjb25zdCBkYXRlID0gbmV3IERhdGUoKTtcbiAgICBjb25zdCB1dGMgPSBwYXJ0cy5maW5kKFxuICAgICAgKHBhcnQpID0+IHBhcnQudHlwZSA9PT0gXCJ0aW1lWm9uZU5hbWVcIiAmJiBwYXJ0LnZhbHVlID09PSBcIlVUQ1wiLFxuICAgICk7XG5cbiAgICBjb25zdCBkYXlQYXJ0ID0gcGFydHMuZmluZCgocGFydCkgPT4gcGFydC50eXBlID09PSBcImRheVwiKTtcblxuICAgIHV0YyA/IGRhdGUuc2V0VVRDSG91cnMoMCwgMCwgMCwgMCkgOiBkYXRlLnNldEhvdXJzKDAsIDAsIDAsIDApO1xuICAgIGZvciAoY29uc3QgcGFydCBvZiBwYXJ0cykge1xuICAgICAgc3dpdGNoIChwYXJ0LnR5cGUpIHtcbiAgICAgICAgY2FzZSBcInllYXJcIjoge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gTnVtYmVyKHBhcnQudmFsdWUucGFkU3RhcnQoNCwgXCIyMFwiKSk7XG4gICAgICAgICAgdXRjID8gZGF0ZS5zZXRVVENGdWxsWWVhcih2YWx1ZSkgOiBkYXRlLnNldEZ1bGxZZWFyKHZhbHVlKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlIFwibW9udGhcIjoge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gTnVtYmVyKHBhcnQudmFsdWUpIC0gMTtcbiAgICAgICAgICBpZiAoZGF5UGFydCkge1xuICAgICAgICAgICAgdXRjXG4gICAgICAgICAgICAgID8gZGF0ZS5zZXRVVENNb250aCh2YWx1ZSwgTnVtYmVyKGRheVBhcnQudmFsdWUpKVxuICAgICAgICAgICAgICA6IGRhdGUuc2V0TW9udGgodmFsdWUsIE51bWJlcihkYXlQYXJ0LnZhbHVlKSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHV0YyA/IGRhdGUuc2V0VVRDTW9udGgodmFsdWUpIDogZGF0ZS5zZXRNb250aCh2YWx1ZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgXCJkYXlcIjoge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gTnVtYmVyKHBhcnQudmFsdWUpO1xuICAgICAgICAgIHV0YyA/IGRhdGUuc2V0VVRDRGF0ZSh2YWx1ZSkgOiBkYXRlLnNldERhdGUodmFsdWUpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgXCJob3VyXCI6IHtcbiAgICAgICAgICBsZXQgdmFsdWUgPSBOdW1iZXIocGFydC52YWx1ZSk7XG4gICAgICAgICAgY29uc3QgZGF5UGVyaW9kID0gcGFydHMuZmluZChcbiAgICAgICAgICAgIChwYXJ0OiBEYXRlVGltZUZvcm1hdFBhcnQpID0+IHBhcnQudHlwZSA9PT0gXCJkYXlQZXJpb2RcIixcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmIChkYXlQZXJpb2Q/LnZhbHVlID09PSBcIlBNXCIpIHZhbHVlICs9IDEyO1xuICAgICAgICAgIHV0YyA/IGRhdGUuc2V0VVRDSG91cnModmFsdWUpIDogZGF0ZS5zZXRIb3Vycyh2YWx1ZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBcIm1pbnV0ZVwiOiB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBOdW1iZXIocGFydC52YWx1ZSk7XG4gICAgICAgICAgdXRjID8gZGF0ZS5zZXRVVENNaW51dGVzKHZhbHVlKSA6IGRhdGUuc2V0TWludXRlcyh2YWx1ZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBcInNlY29uZFwiOiB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBOdW1iZXIocGFydC52YWx1ZSk7XG4gICAgICAgICAgdXRjID8gZGF0ZS5zZXRVVENTZWNvbmRzKHZhbHVlKSA6IGRhdGUuc2V0U2Vjb25kcyh2YWx1ZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBcImZyYWN0aW9uYWxTZWNvbmRcIjoge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gTnVtYmVyKHBhcnQudmFsdWUpO1xuICAgICAgICAgIHV0YyA/IGRhdGUuc2V0VVRDTWlsbGlzZWNvbmRzKHZhbHVlKSA6IGRhdGUuc2V0TWlsbGlzZWNvbmRzKHZhbHVlKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZGF0ZTtcbiAgfVxuXG4gIHBhcnNlKHN0cmluZzogc3RyaW5nKTogRGF0ZSB7XG4gICAgY29uc3QgcGFydHMgPSB0aGlzLnBhcnNlVG9QYXJ0cyhzdHJpbmcpO1xuICAgIGNvbnN0IHNvcnRQYXJ0cyA9IHRoaXMuc29ydERhdGVUaW1lRm9ybWF0UGFydChwYXJ0cyk7XG4gICAgcmV0dXJuIHRoaXMucGFydHNUb0RhdGUoc29ydFBhcnRzKTtcbiAgfVxufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDBFQUEwRTtBQUMxRSxxQ0FBcUM7QUFFckMsU0FNRSxTQUFTLFFBQ0osaUJBQWlCO0FBRXhCLFNBQVMsT0FBTyxLQUFzQixFQUFFLFFBQVEsQ0FBQyxFQUFVO0lBQ3pELE9BQU8sT0FBTyxPQUFPLFFBQVEsQ0FBQyxPQUFPO0FBQ3ZDO0FBNEJBLFNBQVMsMEJBQTBCLEtBQWEsRUFBZ0I7SUFDOUQsT0FBTyxDQUFDLFNBQStCO1FBQ3JDLE9BQU8sT0FBTyxVQUFVLENBQUMsU0FDckI7WUFBRTtZQUFPLFFBQVEsTUFBTSxNQUFNO1FBQUMsSUFDOUIsU0FBUztJQUNmO0FBQ0Y7QUFFQSxTQUFTLHdCQUF3QixLQUFhLEVBQWdCO0lBQzVELE9BQU8sQ0FBQyxTQUErQjtRQUNyQyxNQUFNLFNBQVMsTUFBTSxJQUFJLENBQUM7UUFDMUIsSUFBSSxRQUFRLE9BQU87WUFBRSxPQUFPO1lBQVEsUUFBUSxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU07UUFBQztJQUMvRDtBQUNGO0FBRUEsNkdBQTZHO0FBQzdHLE1BQU0sZUFBZTtJQUNuQjtRQUNFLE1BQU0sMEJBQTBCO1FBQ2hDLElBQUksSUFBc0IsQ0FBQztnQkFBRSxNQUFNO2dCQUFRLE9BQU87WUFBVSxDQUFDO0lBQy9EO0lBQ0E7UUFDRSxNQUFNLDBCQUEwQjtRQUNoQyxJQUFJ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