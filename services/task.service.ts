import TaskRepo from "../db/repositories/task.repo.ts";

export const getTasks = async () => {
   const tasks = await TaskRepo.selectAll();
   return tasks;
};

export const getTask = async taskId => {
   const task = await TaskRepo.selectById(taskId)
   if(!task || task?.length===0) return null
   return task;
};

export const createTask = async taskData => {
   const newTask = {
      descripcion: String(taskData.descripcion),
      observacion: String(taskData.observacion),
      is_premium: "is_finalizada" in taskData ? Boolean(taskData.is_finalizada) : false,
      registration_date: new Date()
   };

   await TaskRepo.create(newTask);

   return TaskRepo.id;
};

export const updateTask = async (taskId, taskData) => {
   const task = await getTask(taskId);

   if (Object.keys(task).length === 0 && task.constructor === Object) {
      throw new Error("Task not found");
   }

   const updatedTask = {...task,...taskData};

   TaskRepo.update(taskId, updatedTask);
};

export const deleteTask = async taskId => {
   TaskRepo.delete(taskId);
};