import { Application } from "./deps.ts";
import router from "./routes/routes.ts";
import { green, yellow } from "https://deno.land/std@0.53.0/fmt/colors.ts";
import _404 from "./controllers/management/404/404.controller.ts";
import _inicioApp from "./controllers/management/inicio.app/inicio.app.controller.ts";

const Denoenv = Deno.env.get("PORT");

const port: number = Denoenv ? parseInt(Denoenv) : 8080;

const app = new Application();

app.use(_inicioApp);

app.use(router.routes());
app.use(router.allowedMethods());
app.use(_404);

// app.use((ctx : Context)=>{
//   ctx.response.status = Status.OK
// });

app.addEventListener("listen", ({ secure, hostname, port }) => {
  const protocol = secure ? "https://" : "http://";
  const url = `${protocol}${hostname ?? "localhost"}:${port}`;
  console.log(`${yellow("Listening on:")} ${green(url)}`);
});

await app.listen({ port });
