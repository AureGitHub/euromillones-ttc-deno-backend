import { deleteTask, getTask } from "../../services/task.service.ts";
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
    await deleteTask(taskId);
    response.body = {
        msg: "Task deleted"
    };
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImZpbGU6Ly8vaG9tZS9ydW5uZXIvZXVyb21pbGxvbmVzLXR0Yy1kZW5vLWJhY2tlbmQvY29udHJvbGxlcnMvdGFzay9kZWxldGVUYXNrLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGRlbGV0ZVRhc2ssIGdldFRhc2sgfSBmcm9tIFwiLi4vLi4vc2VydmljZXMvdGFzay5zZXJ2aWNlLnRzXCI7XG5cbmV4cG9ydCBkZWZhdWx0IGFzeW5jICh7XG4gIHBhcmFtcyxcbiAgcmVzcG9uc2Vcbn0pID0+IHtcbiAgY29uc3QgdGFza0lkID0gcGFyYW1zLmlkO1xuXG4gIGlmICghdGFza0lkKSB7XG4gICAgcmVzcG9uc2Uuc3RhdHVzID0gNDAwO1xuICAgIHJlc3BvbnNlLmJvZHkgPSB7IG1zZzogXCJJbnZhbGlkIHRhc2sgaWRcIiB9O1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGZvdW5kVGFzayA9IGF3YWl0IGdldFRhc2sodGFza0lkKTtcbiAgaWYgKCFmb3VuZFRhc2spIHtcbiAgICByZXNwb25zZS5zdGF0dXMgPSA0MDQ7XG4gICAgcmVzcG9uc2UuYm9keSA9IHsgbXNnOiBgVGFzayB3aXRoIElEICR7dGFza0lkfSBub3QgZm91bmRgIH07XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgYXdhaXQgZGVsZXRlVGFzayh0YXNrSWQpO1xuICByZXNwb25zZS5ib2R5ID0geyBtc2c6IFwiVGFzayBkZWxldGVkXCIgfTtcbn07Il0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFNBQVMsVUFBVSxFQUFFLE9BQU8sUUFBUSxpQ0FBaUM7QUFFckUsZUFBZSxDQUFBLE9BQU8sRUFDcEIsT0FBTSxFQUNOLFNBQVEsRUFDVCxHQUFLO0lBQ0osTUFBTSxTQUFTLE9BQU8sRUFBRTtJQUV4QixJQUFJLENBQUMsUUFBUTtRQUNYLFNBQVMsTUFBTSxHQUFHO1FBQ2xCLFNBQVMsSUFBSSxHQUFHO1lBQUUsS0FBSztRQUFrQjtRQUN6QztJQUNGLENBQUM7SUFFRCxNQUFNLFlBQVksTUFBTSxRQUFRO0lBQ2hDLElBQUksQ0FBQyxXQUFXO1FBQ2QsU0FBUyxNQUFNLEdBQUc7UUFDbEIsU0FBUyxJQUFJLEdBQUc7WUFBRSxLQUFLLENBQUMsYUFBYSxFQUFFLE9BQU8sVUFBVSxDQUFDO1FBQUM7UUFDMUQ7SUFDRixDQUFDO0lBRUQsTUFBTSxXQUFXO0lBQ2pCLFNBQVMsSUFBSSxHQUFHO1FBQUUsS0FBSztJQUFlO0FBQ3hDLENBQUEsRUFBRSJ9