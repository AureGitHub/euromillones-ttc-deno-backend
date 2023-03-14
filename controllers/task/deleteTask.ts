import { deleteTask, getTask } from "../../services/task.service.ts";

export default async ({
  params,
  response
}) => {
  const taskId = params.id;

  if (!taskId) {
    response.status = 400;
    response.body = { msg: "Invalid task id" };
    return;
  }

  const foundTask = await getTask(taskId);
  if (!foundTask) {
    response.status = 404;
    response.body = { msg: `Task with ID ${taskId} not found` };
    return;
  }

  await deleteTask(taskId);
  response.body = { msg: "Task deleted" };
};