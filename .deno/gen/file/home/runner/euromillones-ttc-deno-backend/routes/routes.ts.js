import { Router } from "../deps.ts";
const router = new Router();
router.get("/", (ctx)=>{
    console.log("entra en raiz");
    ctx.response.body = {
        message: "raiz " + new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString()
    };
});
router.get("/hola", (ctx)=>{
    console.log("entra en hola");
    ctx.response.body = {
        message: "hello  " + new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString()
    };
});
router.get("/hola/:id", (ctx)=>{
    console.log(`entra en hola con PARAM ${ctx?.params?.id}`);
    ctx.response.body = {
        message: "hello  " + new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString()
    };
});
router.get("/error", (ctx)=>{
    console.log("entra a forzar error");
    ctx.response.body = {
        message: "error  " + new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString()
    };
    throw new Error("error forzado");
});
export default router;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImZpbGU6Ly8vaG9tZS9ydW5uZXIvZXVyb21pbGxvbmVzLXR0Yy1kZW5vLWJhY2tlbmQvcm91dGVzL3JvdXRlcy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBSb3V0ZXIgfSBmcm9tIFwiLi4vZGVwcy50c1wiO1xuaW1wb3J0IHsgQ29udGV4dCwgU3RhdHVzIH0gZnJvbSBcIi4uL2RlcHMudHNcIjtcblxuXG5cblxuY29uc3Qgcm91dGVyID0gbmV3IFJvdXRlcigpO1xuXG5yb3V0ZXIuZ2V0KFwiL1wiLCAoY3R4OiBDb250ZXh0KSA9PiB7XG4gIGNvbnNvbGUubG9nKFwiZW50cmEgZW4gcmFpelwiKTtcbiAgY3R4LnJlc3BvbnNlLmJvZHkgPSB7XG4gICAgbWVzc2FnZTogXCJyYWl6IFwiICsgbmV3IERhdGUoKS50b0xvY2FsZURhdGVTdHJpbmcoKSArIFwiIFwiICtcbiAgICAgIG5ldyBEYXRlKCkudG9Mb2NhbGVUaW1lU3RyaW5nKCksXG4gIH07XG59KTtcblxucm91dGVyLmdldChcIi9ob2xhXCIsIChjdHg6IENvbnRleHQpID0+IHtcbiAgY29uc29sZS5sb2coXCJlbnRyYSBlbiBob2xhXCIpO1xuICBjdHgucmVzcG9uc2UuYm9keSA9IHtcbiAgICBtZXNzYWdlOiBcImhlbGxvICBcIiArIG5ldyBEYXRlKCkudG9Mb2NhbGVEYXRlU3RyaW5nKCkgKyBcIiBcIiArXG4gICAgICBuZXcgRGF0ZSgpLnRvTG9jYWxlVGltZVN0cmluZygpLFxuICB9O1xufSk7XG5cblxuXG5yb3V0ZXIuZ2V0KFwiL2hvbGEvOmlkXCIsIChjdHg6IENvbnRleHQpID0+IHtcbiAgY29uc29sZS5sb2coYGVudHJhIGVuIGhvbGEgY29uIFBBUkFNICR7Y3R4Py5wYXJhbXM/LmlkfWApO1xuICBjdHgucmVzcG9uc2UuYm9keSA9IHtcbiAgICBtZXNzYWdlOiBcImhlbGxvICBcIiArIG5ldyBEYXRlKCkudG9Mb2NhbGVEYXRlU3RyaW5nKCkgKyBcIiBcIiArXG4gICAgICBuZXcgRGF0ZSgpLnRvTG9jYWxlVGltZVN0cmluZygpLFxuICB9O1xufSk7XG5cblxucm91dGVyLmdldChcIi9lcnJvclwiLCAoY3R4OiBDb250ZXh0KSA9PiB7XG4gIGNvbnNvbGUubG9nKFwiZW50cmEgYSBmb3J6YXIgZXJyb3JcIik7XG4gIGN0eC5yZXNwb25zZS5ib2R5ID0ge1xuICAgIG1lc3NhZ2U6IFwiZXJyb3IgIFwiICsgbmV3IERhdGUoKS50b0xvY2FsZURhdGVTdHJpbmcoKSArIFwiIFwiICtcbiAgICAgIG5ldyBEYXRlKCkudG9Mb2NhbGVUaW1lU3RyaW5nKCksXG4gIH07XG4gIHRocm93IG5ldyBFcnJvcihcImVycm9yIGZvcnphZG9cIik7XG59KTtcblxuZXhwb3J0IGRlZmF1bHQgcm91dGVyO1xuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFNBQVMsTUFBTSxRQUFRLGFBQWE7QUFNcEMsTUFBTSxTQUFTLElBQUk7QUFFbkIsT0FBTyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQWlCO0lBQ2hDLFFBQVEsR0FBRyxDQUFDO0lBQ1osSUFBSSxRQUFRLENBQUMsSUFBSSxHQUFHO1FBQ2xCLFNBQVMsVUFBVSxJQUFJLE9BQU8sa0JBQWtCLEtBQUssTUFDbkQsSUFBSSxPQUFPLGtCQUFrQjtJQUNqQztBQUNGO0FBRUEsT0FBTyxHQUFHLENBQUMsU0FBUyxDQUFDLE1BQWlCO0lBQ3BDLFFBQVEsR0FBRyxDQUFDO0lBQ1osSUFBSSxRQUFRLENBQUMsSUFBSSxHQUFHO1FBQ2xCLFNBQVMsWUFBWSxJQUFJLE9BQU8sa0JBQWtCLEtBQUssTUFDckQsSUFBSSxPQUFPLGtCQUFrQjtJQUNqQztBQUNGO0FBSUEsT0FBTyxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQWlCO0lBQ3hDLFFBQVEsR0FBRyxDQUFDLENBQUMsd0JBQXdCLEVBQUUsS0FBSyxRQUFRLEdBQUcsQ0FBQztJQUN4RCxJQUFJLFFBQVEsQ0FBQyxJQUFJLEdBQUc7UUFDbEIsU0FBUyxZQUFZLElBQUksT0FBTyxrQkFBa0IsS0FBSyxNQUNyRCxJQUFJLE9BQU8sa0JBQWtCO0lBQ2pDO0FBQ0Y7QUFHQSxPQUFPLEdBQUcsQ0FBQyxVQUFVLENBQUMsTUFBaUI7SUFDckMsUUFBUSxHQUFHLENBQUM7SUFDWixJQUFJLFFBQVEsQ0FBQyxJQUFJLEdBQUc7UUFDbEIsU0FBUyxZQUFZLElBQUksT0FBTyxrQkFBa0IsS0FBSyxNQUNyRCxJQUFJLE9BQU8sa0JBQWtCO0lBQ2pDO0lBQ0EsTUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQ25DO0FBRUEsZUFBZSxPQUFPIn0=