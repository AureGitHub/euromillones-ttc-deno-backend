import  {Application} from "./deps.ts";
import router from 
"./src/routes/allRoutes.ts";

const app = new Application();

const PORT = Deno.env.get("PORT") || 8080;

app.use(router.routes());
app.use(router.allowedMethods());

console.log(`Application is f listening on port: ${PORT}`);

await app.listen({port:PORT});