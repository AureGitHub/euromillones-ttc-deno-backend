import { Router } from "../deps.ts";

const router = new Router();

router.get("/", (context) => {
  console.log("entra en raiz");
  context.response.body = {
    message: "raiz " + new Date().toLocaleDateString() + " " +
      new Date().toLocaleTimeString(),
  };
});

router.get("/hola", (context) => {
  console.log("entra en hola");
  context.response.body = {
    message: "hello  " + new Date().toLocaleDateString() + " " +
      new Date().toLocaleTimeString(),
  };
});

router.get("/error", (context) => {
  console.log("entra en error");
  context.response.body = {
    message: "error  " + new Date().toLocaleDateString() + " " +
      new Date().toLocaleTimeString(),
  };
  throw new Error("error forzado");
});

export default router;
