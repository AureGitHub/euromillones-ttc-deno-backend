import { createTask } from "../../services/task.service.ts";
export default (async ({ request , response  })=>{
    if (!request.hasBody) {
        response.status = 400;
        response.body = {
            msg: "Invalid task data"
        };
        return;
    }
    const { descripcion , observacion , is_finalizada  } = await request.body().value;
    console.log(await request.body({
        type: "json"
    }).value);
    if (!descripcion) {
        response.status = 422;
        response.body = {
            msg: "Incorrect task descripcion. descripcion is required"
        };
        return;
    }
    const taskId = await createTask({
        descripcion,
        observacion,
        is_finalizada
    });
    response.body = {
        msg: "Task created",
        taskId
    };
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImZpbGU6Ly8vaG9tZS9ydW5uZXIvZXVyb21pbGxvbmVzLXR0Yy1kZW5vLWJhY2tlbmQvY29udHJvbGxlcnMvdGFzay91cGRhdGVUYXNrLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGNyZWF0ZVRhc2sgfSBmcm9tIFwiLi4vLi4vc2VydmljZXMvdGFzay5zZXJ2aWNlLnRzXCI7XG5cbmV4cG9ydCBkZWZhdWx0IGFzeW5jICh7IHJlcXVlc3QsIHJlc3BvbnNlIH0pID0+IHtcbiAgaWYgKCFyZXF1ZXN0Lmhhc0JvZHkpIHtcbiAgICByZXNwb25zZS5zdGF0dXMgPSA0MDA7XG4gICAgcmVzcG9uc2UuYm9keSA9IHsgbXNnOiBcIkludmFsaWQgdGFzayBkYXRhXCIgfTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCB7IGRlc2NyaXBjaW9uLCBvYnNlcnZhY2lvbiwgaXNfZmluYWxpemFkYSB9ID0gYXdhaXQgcmVxdWVzdC5ib2R5KCkudmFsdWU7XG5cbiAgY29uc29sZS5sb2coYXdhaXQgcmVxdWVzdC5ib2R5KHsgdHlwZTogXCJqc29uXCIgfSkudmFsdWUpO1xuXG4gIGlmICghZGVzY3JpcGNpb24pIHtcbiAgICByZXNwb25zZS5zdGF0dXMgPSA0MjI7XG4gICAgcmVzcG9uc2UuYm9keSA9IHsgbXNnOiBcIkluY29ycmVjdCB0YXNrIGRlc2NyaXBjaW9uLiBkZXNjcmlwY2lvbiBpcyByZXF1aXJlZFwiIH07XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgdGFza0lkID0gYXdhaXQgY3JlYXRlVGFzayh7IGRlc2NyaXBjaW9uLCBvYnNlcnZhY2lvbiwgaXNfZmluYWxpemFkYSB9KTtcblxuICByZXNwb25zZS5ib2R5ID0geyBtc2c6IFwiVGFzayBjcmVhdGVkXCIsIHRhc2tJZCB9O1xufTsiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsU0FBUyxVQUFVLFFBQVEsaUNBQWlDO0FBRTVELGVBQWUsQ0FBQSxPQUFPLEVBQUUsUUFBTyxFQUFFLFNBQVEsRUFBRSxHQUFLO0lBQzlDLElBQUksQ0FBQyxRQUFRLE9BQU8sRUFBRTtRQUNwQixTQUFTLE1BQU0sR0FBRztRQUNsQixTQUFTLElBQUksR0FBRztZQUFFLEtBQUs7UUFBb0I7UUFDM0M7SUFDRixDQUFDO0lBRUQsTUFBTSxFQUFFLFlBQVcsRUFBRSxZQUFXLEVBQUUsY0FBYSxFQUFFLEdBQUcsTUFBTSxRQUFRLElBQUksR0FBRyxLQUFLO0lBRTlFLFFBQVEsR0FBRyxDQUFDLE1BQU0sUUFBUSxJQUFJLENBQUM7UUFBRSxNQUFNO0lBQU8sR0FBRyxLQUFLO0lBRXRELElBQUksQ0FBQyxhQUFhO1FBQ2hCLFNBQVMsTUFBTSxHQUFHO1FBQ2xCLFNBQVMsSUFBSSxHQUFHO1lBQUUsS0FBSztRQUFzRDtRQUM3RTtJQUNGLENBQUM7SUFFRCxNQUFNLFNBQVMsTUFBTSxXQUFXO1FBQUU7UUFBYTtRQUFhO0lBQWM7SUFFMUUsU0FBUyxJQUFJLEdBQUc7UUFBRSxLQUFLO1FBQWdCO0lBQU87QUFDaEQsQ0FBQSxFQUFFIn0=