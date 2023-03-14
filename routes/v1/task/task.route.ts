import { Router } from "../../../deps.ts";

import getTasks from "../../../controllers/task/getTasks.ts";
import gettaskDetails from  "../../../controllers/task/getTaskDetails.ts";
import createTask from "../../../controllers/task/createTask.ts";
import updateTask from "../../../controllers/task/updateTask.ts";
import deleteTask from "../../../controllers/task/deleteTask.ts";


const routerTask = new Router();

routerTask
  .get("/task", getTasks)
  .get("/task/:id", gettaskDetails)
  .post("/task", createTask)
  .put("/task/:id", updateTask)
  .delete("/task/:id", deleteTask);

export default routerTask;