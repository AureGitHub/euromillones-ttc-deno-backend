import { updateTask } from "../../services/task.service.ts";

export default async ({ params, request, response }) => {
  const taskId = params.id;

  if (!taskId) {
    response.status = 400;
    response.body = { msg: "Invalid task id" };
    return;
  }

  if (!request.hasBody) {
    response.status = 400;
    response.body = { msg: "Invalid task data" };
    return;
  }

  const { descripcion, observacion, is_finalizada } = await request.body().value;

  await updateTask(taskId, { descripcion, observacion, is_finalizada });

  response.body = { msg: "Task updated" };
};