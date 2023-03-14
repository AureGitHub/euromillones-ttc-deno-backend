import client from "../database.js";

class TaskRepo {
  create(task: any) {
    return client
      .queryArray`INSERT INTO tasks (descripcion, observacion,is_finalizada,registration_date) VALUES
          (${task.descripcion}, ${task.observacion}, ${task.is_finalizada},${task.registration_date})`;
  }

  selectAll() {
    return client.queryArray`SELECT * FROM tasks ORDER BY id`;
  }

  selectById(id) {
    return client.queryArray`SELECT * FROM tasks WHERE id = ${id}`;
  }

  update(id: any, task: any) {
    const latestTask = this.selectById(id);

    return client.queryArray`UPDATE tasks SET descripcion = ${
      task.descripcion !== undefined ? task.task : latestTask.name
    }, observacion = ${
      task.observacion !== undefined ? task.observacion : latestTask.observacion
    }, is_finalizada = ${
      task.is_finalizada !== undefined
        ? task.is_finalizada
        : latestTask.is_finalizada
    } WHERE id = ${id}`;
  }

  delete(id: any) {
    return client.queryArray`DELETE FROM tasks WHERE id = ${id}`;
  }
}

export default new TaskRepo();
