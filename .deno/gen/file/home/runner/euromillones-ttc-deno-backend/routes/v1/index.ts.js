import { Router } from "../../deps.ts";
import routerTask from "./task/task.route.ts";
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
*/ export function getRouter() {
    return router;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImZpbGU6Ly8vaG9tZS9ydW5uZXIvZXVyb21pbGxvbmVzLXR0Yy1kZW5vLWJhY2tlbmQvcm91dGVzL3YxL2luZGV4LnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFJvdXRlciB9IGZyb20gXCIuLi8uLi9kZXBzLnRzXCI7XG5pbXBvcnQgIHJvdXRlclRhc2sgIGZyb20gXCIuL3Rhc2svdGFzay5yb3V0ZS50c1wiXG5cbmltcG9ydCBfY29uZmlnIGZyb20gXCIuLi8uLi9jb25maWcudHNcIjtcblxuY29uc3Qgcm91dGVyID0gbmV3IFJvdXRlcigpO1xuXG5yb3V0ZXIudXNlKHJvdXRlclRhc2sucm91dGVzKCkpO1xuLypcbnJvdXRlci5nZXQoXCIvXCIsIChjdHg6IENvbnRleHQpID0+IHtcbiAgY29uc29sZS5sb2coXCJlbnRyYSBlbiByYWl6XCIpO1xuICBjdHgucmVzcG9uc2UuYm9keSA9IHtcbiAgICBtZXNzYWdlOiBcInJhaXogXCIgKyBuZXcgRGF0ZSgpLnRvTG9jYWxlRGF0ZVN0cmluZygpICsgXCIgXCIgK1xuICAgICAgbmV3IERhdGUoKS50b0xvY2FsZVRpbWVTdHJpbmcoKSxcbiAgfTtcbn0pO1xuXG5yb3V0ZXIuZ2V0KFwiL2hvbGFcIiwgKGN0eDogQ29udGV4dCkgPT4ge1xuICBjb25zb2xlLmxvZyhcImVudHJhIGVuIGhvbGFcIik7XG4gIGN0eC5yZXNwb25zZS5ib2R5ID0ge1xuICAgIG1lc3NhZ2U6IFwiaGVsbG8gIFwiICsgbmV3IERhdGUoKS50b0xvY2FsZURhdGVTdHJpbmcoKSArIFwiIFwiICtcbiAgICAgIG5ldyBEYXRlKCkudG9Mb2NhbGVUaW1lU3RyaW5nKCksXG4gIH07XG59KTtcblxucm91dGVyLmdldChcIi9ob2xhLzppZFwiLCAoY3R4OiBDb250ZXh0KSA9PiB7XG4gIGNvbnN0IGlkID0gY3R4LnBhcmFtcy5pZDtcblxuICBjb25zb2xlLmxvZyhgZW50cmEgZW4gaG9sYSBjb24gUEFSQU0gJHtpZH1gKTtcbiAgY3R4LnJlc3BvbnNlLmJvZHkgPSB7XG4gICAgbWVzc2FnZTogXCJoZWxsbyAgXCIgKyBuZXcgRGF0ZSgpLnRvTG9jYWxlRGF0ZVN0cmluZygpICsgXCIgXCIgK1xuICAgICAgbmV3IERhdGUoKS50b0xvY2FsZVRpbWVTdHJpbmcoKSArIFwiIFBBUkFNIFwiICsgaWQsXG4gIH07XG59KTtcblxucm91dGVyLmdldChcIi9lcnJvclwiLCAoY3R4OiBDb250ZXh0KSA9PiB7XG4gIGNvbnNvbGUubG9nKFwiZW50cmEgYSBmb3J6YXIgZXJyb3JcIik7XG4gIGN0eC5yZXNwb25zZS5ib2R5ID0ge1xuICAgIG1lc3NhZ2U6IFwiZXJyb3IgIFwiICsgbmV3IERhdGUoKS50b0xvY2FsZURhdGVTdHJpbmcoKSArIFwiIFwiICtcbiAgICAgIG5ldyBEYXRlKCkudG9Mb2NhbGVUaW1lU3RyaW5nKCksXG4gIH07XG4gIHRocm93IG5ldyBFcnJvcihcImVycm9yIGZvcnphZG9cIik7XG59KTtcbiovXG5leHBvcnQgZnVuY3Rpb24gZ2V0Um91dGVyKCkge1xuICByZXR1cm4gcm91dGVyO1xufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFNBQVMsTUFBTSxRQUFRLGdCQUFnQjtBQUN2QyxPQUFRLGdCQUFpQix1QkFBc0I7QUFJL0MsTUFBTSxTQUFTLElBQUk7QUFFbkIsT0FBTyxHQUFHLENBQUMsV0FBVyxNQUFNO0FBQzVCOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQW1DQSxHQUNBLE9BQU8sU0FBUyxZQUFZO0lBQzFCLE9BQU87QUFDVCxDQUFDIn0=