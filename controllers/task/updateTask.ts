import { createTask } from "../../services/task.service.ts";

export default async ({ request, response }) => {
  if (!request.hasBody) {
    response.status = 400;
    response.body = { msg: "Invalid task data" };
    return;
  }

  const { descripcion, observacion, is_finalizada } = await request.body().value;

  console.log(await request.body({ type: "json" }).value);

  if (!descripcion) {
    response.status = 422;
    response.body = { msg: "Incorrect task descripcion. descripcion is required" };
    return;
  }

  const taskId = await createTask({ descripcion, observacion, is_finalizada });

  response.body = { msg: "Task created", taskId };
};