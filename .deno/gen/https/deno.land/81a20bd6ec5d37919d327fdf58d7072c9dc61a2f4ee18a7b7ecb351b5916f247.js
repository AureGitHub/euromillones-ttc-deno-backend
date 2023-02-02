// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
import { assert } from "../testing/asserts.ts";
/** Compare to array buffers or data views in a way that timing based attacks
 * cannot gain information about the platform. */ export function timingSafeEqual(a, b) {
    if (a.byteLength !== b.byteLength) {
        return false;
    }
    if (!(a instanceof DataView)) {
        a = new DataView(ArrayBuffer.isView(a) ? a.buffer : a);
    }
    if (!(b instanceof DataView)) {
        b = new DataView(ArrayBuffer.isView(b) ? b.buffer : b);
    }
    assert(a instanceof DataView);
    assert(b instanceof DataView);
    const length = a.byteLength;
    let out = 0;
    let i = -1;
    while(++i < length){
        out |= a.getUint8(i) ^ b.getUint8(i);
    }
    return out === 0;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE1Mi4wL2NyeXB0by90aW1pbmdfc2FmZV9lcXVhbC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuXG5pbXBvcnQgeyBhc3NlcnQgfSBmcm9tIFwiLi4vdGVzdGluZy9hc3NlcnRzLnRzXCI7XG5cbi8qKiBDb21wYXJlIHRvIGFycmF5IGJ1ZmZlcnMgb3IgZGF0YSB2aWV3cyBpbiBhIHdheSB0aGF0IHRpbWluZyBiYXNlZCBhdHRhY2tzXG4gKiBjYW5ub3QgZ2FpbiBpbmZvcm1hdGlvbiBhYm91dCB0aGUgcGxhdGZvcm0uICovXG5leHBvcnQgZnVuY3Rpb24gdGltaW5nU2FmZUVxdWFsKFxuICBhOiBBcnJheUJ1ZmZlclZpZXcgfCBBcnJheUJ1ZmZlckxpa2UgfCBEYXRhVmlldyxcbiAgYjogQXJyYXlCdWZmZXJWaWV3IHwgQXJyYXlCdWZmZXJMaWtlIHwgRGF0YVZpZXcsXG4pOiBib29sZWFuIHtcbiAgaWYgKGEuYnl0ZUxlbmd0aCAhPT0gYi5ieXRlTGVuZ3RoKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmICghKGEgaW5zdGFuY2VvZiBEYXRhVmlldykpIHtcbiAgICBhID0gbmV3IERhdGFWaWV3KEFycmF5QnVmZmVyLmlzVmlldyhhKSA/IGEuYnVmZmVyIDogYSk7XG4gIH1cbiAgaWYgKCEoYiBpbnN0YW5jZW9mIERhdGFWaWV3KSkge1xuICAgIGIgPSBuZXcgRGF0YVZpZXcoQXJyYXlCdWZmZXIuaXNWaWV3KGIpID8gYi5idWZmZXIgOiBiKTtcbiAgfVxuICBhc3NlcnQoYSBpbnN0YW5jZW9mIERhdGFWaWV3KTtcbiAgYXNzZXJ0KGIgaW5zdGFuY2VvZiBEYXRhVmlldyk7XG4gIGNvbnN0IGxlbmd0aCA9IGEuYnl0ZUxlbmd0aDtcbiAgbGV0IG91dCA9IDA7XG4gIGxldCBpID0gLTE7XG4gIHdoaWxlICgrK2kgPCBsZW5ndGgpIHtcbiAgICBvdXQgfD0gYS5nZXRVaW50OChpKSBeIGIuZ2V0VWludDgoaSk7XG4gIH1cbiAgcmV0dXJuIG91dCA9PT0gMDtcbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSwwRUFBMEU7QUFFMUUsU0FBUyxNQUFNLFFBQVEsd0JBQXdCO0FBRS9DOytDQUMrQyxHQUMvQyxPQUFPLFNBQVMsZ0JBQ2QsQ0FBK0MsRUFDL0MsQ0FBK0MsRUFDdEM7SUFDVCxJQUFJLEVBQUUsVUFBVSxLQUFLLEVBQUUsVUFBVSxFQUFFO1FBQ2pDLE9BQU8sS0FBSztJQUNkLENBQUM7SUFDRCxJQUFJLENBQUMsQ0FBQyxhQUFhLFFBQVEsR0FBRztRQUM1QixJQUFJLElBQUksU0FBUyxZQUFZLE1BQU0sQ0FBQyxLQUFLLEVBQUUsTUFBTSxHQUFHLENBQUM7SUFDdkQsQ0FBQztJQUNELElBQUksQ0FBQyxDQUFDLGFBQWEsUUFBUSxHQUFHO1FBQzVCLElBQUksSUFBSSxTQUFTLFlBQVksTUFBTSxDQUFDLEtBQUssRUFBRSxNQUFNLEdBQUcsQ0FBQztJQUN2RCxDQUFDO0lBQ0QsT0FBTyxhQUFhO0lBQ3BCLE9BQU8sYUFBYTtJQUNwQixNQUFNLFNBQVMsRUFBRSxVQUFVO0lBQzNCLElBQUksTUFBTTtJQUNWLElBQUksSUFBSSxDQUFDO0lBQ1QsTUFBTyxFQUFFLElBQUksT0FBUTtRQUNuQixPQUFPLEVBQUUsUUFBUSxDQUFDLEtBQUssRUFBRSxRQUFRLENBQUM7SUFDcEM7SUFDQSxPQUFPLFFBQVE7QUFDakIsQ0FBQyJ9