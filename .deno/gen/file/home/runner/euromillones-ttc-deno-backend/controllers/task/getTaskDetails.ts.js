import { getTask } from "../../services/task.service.ts";
export default (async ({ params , response  })=>{
    const taskId = params.id;
    if (!taskId) {
        response.status = 400;
        response.body = {
            msg: "Invalid task id"
        };
        return;
    }
    const foundTask = await getTask(taskId);
    if (!foundTask) {
        response.status = 404;
        response.body = {
            msg: `Task with ID ${taskId} not found`
        };
        return;
    }
    response.body = foundTask;
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImZpbGU6Ly8vaG9tZS9ydW5uZXIvZXVyb21pbGxvbmVzLXR0Yy1kZW5vLWJhY2tlbmQvY29udHJvbGxlcnMvdGFzay9nZXRUYXNrRGV0YWlscy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBnZXRUYXNrIH0gZnJvbSBcIi4uLy4uL3NlcnZpY2VzL3Rhc2suc2VydmljZS50c1wiO1xuXG5leHBvcnQgZGVmYXVsdCBhc3luYyAoeyBwYXJhbXMsIHJlc3BvbnNlIH0pID0+IHtcbiAgY29uc3QgdGFza0lkID0gcGFyYW1zLmlkO1xuXG4gIGlmICghdGFza0lkKSB7XG4gICAgcmVzcG9uc2Uuc3RhdHVzID0gNDAwO1xuICAgIHJlc3BvbnNlLmJvZHkgPSB7IG1zZzogXCJJbnZhbGlkIHRhc2sgaWRcIiB9O1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGZvdW5kVGFzayA9IGF3YWl0IGdldFRhc2sodGFza0lkKTtcbiAgaWYgKCFmb3VuZFRhc2spIHtcbiAgICByZXNwb25zZS5zdGF0dXMgPSA0MDQ7XG4gICAgcmVzcG9uc2UuYm9keSA9IHsgbXNnOiBgVGFzayB3aXRoIElEICR7dGFza0lkfSBub3QgZm91bmRgIH07XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgcmVzcG9uc2UuYm9keSA9IGZvdW5kVGFzaztcbn07Il0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFNBQVMsT0FBTyxRQUFRLGlDQUFpQztBQUV6RCxlQUFlLENBQUEsT0FBTyxFQUFFLE9BQU0sRUFBRSxTQUFRLEVBQUUsR0FBSztJQUM3QyxNQUFNLFNBQVMsT0FBTyxFQUFFO0lBRXhCLElBQUksQ0FBQyxRQUFRO1FBQ1gsU0FBUyxNQUFNLEdBQUc7UUFDbEIsU0FBUyxJQUFJLEdBQUc7WUFBRSxLQUFLO1FBQWtCO1FBQ3pDO0lBQ0YsQ0FBQztJQUVELE1BQU0sWUFBWSxNQUFNLFFBQVE7SUFDaEMsSUFBSSxDQUFDLFdBQVc7UUFDZCxTQUFTLE1BQU0sR0FBRztRQUNsQixTQUFTLElBQUksR0FBRztZQUFFLEtBQUssQ0FBQyxhQUFhLEVBQUUsT0FBTyxVQUFVLENBQUM7UUFBQztRQUMxRDtJQUNGLENBQUM7SUFFRCxTQUFTLElBQUksR0FBRztBQUNsQixDQUFBLEVBQUUifQ==