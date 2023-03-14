import { updateTask } from "../../services/task.service.ts";
export default (async ({ params , request , response  })=>{
    const taskId = params.id;
    if (!taskId) {
        response.status = 400;
        response.body = {
            msg: "Invalid task id"
        };
        return;
    }
    if (!request.hasBody) {
        response.status = 400;
        response.body = {
            msg: "Invalid task data"
        };
        return;
    }
    const { descripcion , observacion , is_finalizada  } = await request.body().value;
    await updateTask(taskId, {
        descripcion,
        observacion,
        is_finalizada
    });
    response.body = {
        msg: "Task updated"
    };
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImZpbGU6Ly8vaG9tZS9ydW5uZXIvZXVyb21pbGxvbmVzLXR0Yy1kZW5vLWJhY2tlbmQvY29udHJvbGxlcnMvdGFzay9jcmVhdGVUYXNrLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IHVwZGF0ZVRhc2sgfSBmcm9tIFwiLi4vLi4vc2VydmljZXMvdGFzay5zZXJ2aWNlLnRzXCI7XG5cbmV4cG9ydCBkZWZhdWx0IGFzeW5jICh7IHBhcmFtcywgcmVxdWVzdCwgcmVzcG9uc2UgfSkgPT4ge1xuICBjb25zdCB0YXNrSWQgPSBwYXJhbXMuaWQ7XG5cbiAgaWYgKCF0YXNrSWQpIHtcbiAgICByZXNwb25zZS5zdGF0dXMgPSA0MDA7XG4gICAgcmVzcG9uc2UuYm9keSA9IHsgbXNnOiBcIkludmFsaWQgdGFzayBpZFwiIH07XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCFyZXF1ZXN0Lmhhc0JvZHkpIHtcbiAgICByZXNwb25zZS5zdGF0dXMgPSA0MDA7XG4gICAgcmVzcG9uc2UuYm9keSA9IHsgbXNnOiBcIkludmFsaWQgdGFzayBkYXRhXCIgfTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCB7IGRlc2NyaXBjaW9uLCBvYnNlcnZhY2lvbiwgaXNfZmluYWxpemFkYSB9ID0gYXdhaXQgcmVxdWVzdC5ib2R5KCkudmFsdWU7XG5cbiAgYXdhaXQgdXBkYXRlVGFzayh0YXNrSWQsIHsgZGVzY3JpcGNpb24sIG9ic2VydmFjaW9uLCBpc19maW5hbGl6YWRhIH0pO1xuXG4gIHJlc3BvbnNlLmJvZHkgPSB7IG1zZzogXCJUYXNrIHVwZGF0ZWRcIiB9O1xufTsiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsU0FBUyxVQUFVLFFBQVEsaUNBQWlDO0FBRTVELGVBQWUsQ0FBQSxPQUFPLEVBQUUsT0FBTSxFQUFFLFFBQU8sRUFBRSxTQUFRLEVBQUUsR0FBSztJQUN0RCxNQUFNLFNBQVMsT0FBTyxFQUFFO0lBRXhCLElBQUksQ0FBQyxRQUFRO1FBQ1gsU0FBUyxNQUFNLEdBQUc7UUFDbEIsU0FBUyxJQUFJLEdBQUc7WUFBRSxLQUFLO1FBQWtCO1FBQ3pDO0lBQ0YsQ0FBQztJQUVELElBQUksQ0FBQyxRQUFRLE9BQU8sRUFBRTtRQUNwQixTQUFTLE1BQU0sR0FBRztRQUNsQixTQUFTLElBQUksR0FBRztZQUFFLEtBQUs7UUFBb0I7UUFDM0M7SUFDRixDQUFDO0lBRUQsTUFBTSxFQUFFLFlBQVcsRUFBRSxZQUFXLEVBQUUsY0FBYSxFQUFFLEdBQUcsTUFBTSxRQUFRLElBQUksR0FBRyxLQUFLO0lBRTlFLE1BQU0sV0FBVyxRQUFRO1FBQUU7UUFBYTtRQUFhO0lBQWM7SUFFbkUsU0FBUyxJQUFJLEdBQUc7UUFBRSxLQUFLO0lBQWU7QUFDeEMsQ0FBQSxFQUFFIn0=