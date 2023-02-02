import { Router } from "../deps.ts";
import { Context, Status } from "../deps.ts";




const router = new Router();

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
  console.log(`entra en hola con PARAM ${ctx?.params?.id}`);
  ctx.response.body = {
    message: "hello  " + new Date().toLocaleDateString() + " " +
      new Date().toLocaleTimeString(),
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

export default router;
