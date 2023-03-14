import { Router } from "../../deps.ts";
import  routerTask  from "./task/task.route.ts"

import _config from "../../config.ts";

const router = new Router();

router.use(routerTask.routes());
/*
router.get("/", (ctx: Context) => {
  console.log("entra en raiz");
  ctx.response.body = {
    message: "raiz " + new Date().toLocaleDateString() + " " +
      new Date().toLocaleTimeString(),
  };
});

router.get("/hola", (ctx: Context) => {
  console.log("entra en hola");
  ctx.response.body = {
    message: "hello  " + new Date().toLocaleDateString() + " " +
      new Date().toLocaleTimeString(),
  };
});

router.get("/hola/:id", (ctx: Context) => {
  const id = ctx.params.id;

  console.log(`entra en hola con PARAM ${id}`);
  ctx.response.body = {
    message: "hello  " + new Date().toLocaleDateString() + " " +
      new Date().toLocaleTimeString() + " PARAM " + id,
  };
});

router.get("/error", (ctx: Context) => {
  console.log("entra a forzar error");
  ctx.response.body = {
    message: "error  " + new Date().toLocaleDateString() + " " +
      new Date().toLocaleTimeString(),
  };
  throw new Error("error forzado");
});
*/
export function getRouter() {
  return router;
}
