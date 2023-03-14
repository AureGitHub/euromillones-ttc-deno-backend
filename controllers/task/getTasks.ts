import { getTasks } from "../../services/task.service.ts";

export default async ({ response }) => {
  console.log('entra en getTasks');
  response.body = await getTasks();
};