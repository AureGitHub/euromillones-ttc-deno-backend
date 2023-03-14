import TaskRepo from "../db/repositories/task.repo.ts";
export const getTasks = async ()=>{
    const tasks = await TaskRepo.selectAll();
    return tasks;
};
export const getTask = async (taskId)=>{
    const task = await TaskRepo.selectById(taskId);
    if (!task || task?.length === 0) return null;
    return task;
};
export const createTask = async (taskData)=>{
    const newTask = {
        descripcion: String(taskData.descripcion),
        observacion: String(taskData.observacion),
        is_premium: "is_finalizada" in taskData ? Boolean(taskData.is_finalizada) : false,
        registration_date: new Date()
    };
    await TaskRepo.create(newTask);
    return TaskRepo.id;
};
export const updateTask = async (taskId, taskData)=>{
    const task = await getTask(taskId);
    if (Object.keys(task).length === 0 && task.constructor === Object) {
        throw new Error("Task not found");
    }
    const updatedTask = {
        ...task,
        ...taskData
    };
    TaskRepo.update(taskId, updatedTask);
};
export const deleteTask = async (taskId)=>{
    TaskRepo.delete(taskId);
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImZpbGU6Ly8vaG9tZS9ydW5uZXIvZXVyb21pbGxvbmVzLXR0Yy1kZW5vLWJhY2tlbmQvc2VydmljZXMvdGFzay5zZXJ2aWNlLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBUYXNrUmVwbyBmcm9tIFwiLi4vZGIvcmVwb3NpdG9yaWVzL3Rhc2sucmVwby50c1wiO1xuXG5leHBvcnQgY29uc3QgZ2V0VGFza3MgPSBhc3luYyAoKSA9PiB7XG4gICBjb25zdCB0YXNrcyA9IGF3YWl0IFRhc2tSZXBvLnNlbGVjdEFsbCgpO1xuICAgcmV0dXJuIHRhc2tzO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldFRhc2sgPSBhc3luYyB0YXNrSWQgPT4ge1xuICAgY29uc3QgdGFzayA9IGF3YWl0IFRhc2tSZXBvLnNlbGVjdEJ5SWQodGFza0lkKVxuICAgaWYoIXRhc2sgfHwgdGFzaz8ubGVuZ3RoPT09MCkgcmV0dXJuIG51bGxcbiAgIHJldHVybiB0YXNrO1xufTtcblxuZXhwb3J0IGNvbnN0IGNyZWF0ZVRhc2sgPSBhc3luYyB0YXNrRGF0YSA9PiB7XG4gICBjb25zdCBuZXdUYXNrID0ge1xuICAgICAgZGVzY3JpcGNpb246IFN0cmluZyh0YXNrRGF0YS5kZXNjcmlwY2lvbiksXG4gICAgICBvYnNlcnZhY2lvbjogU3RyaW5nKHRhc2tEYXRhLm9ic2VydmFjaW9uKSxcbiAgICAgIGlzX3ByZW1pdW06IFwiaXNfZmluYWxpemFkYVwiIGluIHRhc2tEYXRhID8gQm9vbGVhbih0YXNrRGF0YS5pc19maW5hbGl6YWRhKSA6IGZhbHNlLFxuICAgICAgcmVnaXN0cmF0aW9uX2RhdGU6IG5ldyBEYXRlKClcbiAgIH07XG5cbiAgIGF3YWl0IFRhc2tSZXBvLmNyZWF0ZShuZXdUYXNrKTtcblxuICAgcmV0dXJuIFRhc2tSZXBvLmlkO1xufTtcblxuZXhwb3J0IGNvbnN0IHVwZGF0ZVRhc2sgPSBhc3luYyAodGFza0lkLCB0YXNrRGF0YSkgPT4ge1xuICAgY29uc3QgdGFzayA9IGF3YWl0IGdldFRhc2sodGFza0lkKTtcblxuICAgaWYgKE9iamVjdC5rZXlzKHRhc2spLmxlbmd0aCA9PT0gMCAmJiB0YXNrLmNvbnN0cnVjdG9yID09PSBPYmplY3QpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlRhc2sgbm90IGZvdW5kXCIpO1xuICAgfVxuXG4gICBjb25zdCB1cGRhdGVkVGFzayA9IHsuLi50YXNrLC4uLnRhc2tEYXRhfTtcblxuICAgVGFza1JlcG8udXBkYXRlKHRhc2tJZCwgdXBkYXRlZFRhc2spO1xufTtcblxuZXhwb3J0IGNvbnN0IGRlbGV0ZVRhc2sgPSBhc3luYyB0YXNrSWQgPT4ge1xuICAgVGFza1JlcG8uZGVsZXRlKHRhc2tJZCk7XG59OyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLGNBQWMsa0NBQWtDO0FBRXZELE9BQU8sTUFBTSxXQUFXLFVBQVk7SUFDakMsTUFBTSxRQUFRLE1BQU0sU0FBUyxTQUFTO0lBQ3RDLE9BQU87QUFDVixFQUFFO0FBRUYsT0FBTyxNQUFNLFVBQVUsT0FBTSxTQUFVO0lBQ3BDLE1BQU0sT0FBTyxNQUFNLFNBQVMsVUFBVSxDQUFDO0lBQ3ZDLElBQUcsQ0FBQyxRQUFRLE1BQU0sV0FBUyxHQUFHLE9BQU8sSUFBSTtJQUN6QyxPQUFPO0FBQ1YsRUFBRTtBQUVGLE9BQU8sTUFBTSxhQUFhLE9BQU0sV0FBWTtJQUN6QyxNQUFNLFVBQVU7UUFDYixhQUFhLE9BQU8sU0FBUyxXQUFXO1FBQ3hDLGFBQWEsT0FBTyxTQUFTLFdBQVc7UUFDeEMsWUFBWSxtQkFBbUIsV0FBVyxRQUFRLFNBQVMsYUFBYSxJQUFJLEtBQUs7UUFDakYsbUJBQW1CLElBQUk7SUFDMUI7SUFFQSxNQUFNLFNBQVMsTUFBTSxDQUFDO0lBRXRCLE9BQU8sU0FBUyxFQUFFO0FBQ3JCLEVBQUU7QUFFRixPQUFPLE1BQU0sYUFBYSxPQUFPLFFBQVEsV0FBYTtJQUNuRCxNQUFNLE9BQU8sTUFBTSxRQUFRO0lBRTNCLElBQUksT0FBTyxJQUFJLENBQUMsTUFBTSxNQUFNLEtBQUssS0FBSyxLQUFLLFdBQVcsS0FBSyxRQUFRO1FBQ2hFLE1BQU0sSUFBSSxNQUFNLGtCQUFrQjtJQUNyQyxDQUFDO0lBRUQsTUFBTSxjQUFjO1FBQUMsR0FBRyxJQUFJO1FBQUMsR0FBRyxRQUFRO0lBQUE7SUFFeEMsU0FBUyxNQUFNLENBQUMsUUFBUTtBQUMzQixFQUFFO0FBRUYsT0FBTyxNQUFNLGFBQWEsT0FBTSxTQUFVO0lBQ3ZDLFNBQVMsTUFBTSxDQUFDO0FBQ25CLEVBQUUifQ==