import { Application } from "./deps.ts";
import router from "./routes/allRoutes.ts";
import { green, yellow } from "https://deno.land/std@0.53.0/fmt/colors.ts";
import _404 from "./controllers/404.js";
import errorHandler from "./controllers/errorHandler.js";

const port: number = Deno.env.get("PORT") || 8080;

const app = new Application();

app.use(errorHandler);

app.use(router.routes());
app.use(router.allowedMethods());
app.use(_404);

app.addEventListener("listen", ({ secure, hostname, port }) => {
  const protocol = secure ? "https://" : "http://";
  const url = `${protocol}${hostname ?? "localhost"}:${port}`;
  console.log(`${yellow("Listening on:")} ${green(url)}`);
});

await app.listen({ port });
