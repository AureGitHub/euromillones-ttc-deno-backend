import { Router } from "../deps.ts";
const router = new Router();
router.get("/", (context)=>{
    console.log("entra en raiz");
    context.response.body = {
        message: "raiz " + new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString()
    };
});
router.get("/hola", (context)=>{
    console.log("entra en hola");
    context.response.body = {
        message: "hello  " + new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString()
    };
});
router.get("/error", (context)=>{
    console.log("entra en error");
    context.response.body = {
        message: "error  " + new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString()
    };
    throw new Error("error forzado");
});
export default router;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImZpbGU6Ly8vaG9tZS9ydW5uZXIvZXVyb21pbGxvbmVzLXR0Yy1kZW5vLWJhY2tlbmQvcm91dGVzL2FsbFJvdXRlcy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBSb3V0ZXIgfSBmcm9tIFwiLi4vZGVwcy50c1wiO1xuXG5jb25zdCByb3V0ZXIgPSBuZXcgUm91dGVyKCk7XG5cbnJvdXRlci5nZXQoXCIvXCIsIChjb250ZXh0KSA9PiB7XG4gIGNvbnNvbGUubG9nKFwiZW50cmEgZW4gcmFpelwiKTtcbiAgY29udGV4dC5yZXNwb25zZS5ib2R5ID0ge1xuICAgIG1lc3NhZ2U6IFwicmFpeiBcIiArIG5ldyBEYXRlKCkudG9Mb2NhbGVEYXRlU3RyaW5nKCkgKyBcIiBcIiArXG4gICAgICBuZXcgRGF0ZSgpLnRvTG9jYWxlVGltZVN0cmluZygpLFxuICB9O1xufSk7XG5cbnJvdXRlci5nZXQoXCIvaG9sYVwiLCAoY29udGV4dCkgPT4ge1xuICBjb25zb2xlLmxvZyhcImVudHJhIGVuIGhvbGFcIik7XG4gIGNvbnRleHQucmVzcG9uc2UuYm9keSA9IHtcbiAgICBtZXNzYWdlOiBcImhlbGxvICBcIiArIG5ldyBEYXRlKCkudG9Mb2NhbGVEYXRlU3RyaW5nKCkgKyBcIiBcIiArXG4gICAgICBuZXcgRGF0ZSgpLnRvTG9jYWxlVGltZVN0cmluZygpLFxuICB9O1xufSk7XG5cbnJvdXRlci5nZXQoXCIvZXJyb3JcIiwgKGNvbnRleHQpID0+IHtcbiAgY29uc29sZS5sb2coXCJlbnRyYSBlbiBlcnJvclwiKTtcbiAgY29udGV4dC5yZXNwb25zZS5ib2R5ID0ge1xuICAgIG1lc3NhZ2U6IFwiZXJyb3IgIFwiICsgbmV3IERhdGUoKS50b0xvY2FsZURhdGVTdHJpbmcoKSArIFwiIFwiICtcbiAgICAgIG5ldyBEYXRlKCkudG9Mb2NhbGVUaW1lU3RyaW5nKCksXG4gIH07XG4gIHRocm93IG5ldyBFcnJvcihcImVycm9yIGZvcnphZG9cIik7XG59KTtcblxuZXhwb3J0IGRlZmF1bHQgcm91dGVyO1xuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFNBQVMsTUFBTSxRQUFRLGFBQWE7QUFFcEMsTUFBTSxTQUFTLElBQUk7QUFFbkIsT0FBTyxHQUFHLENBQUMsS0FBSyxDQUFDLFVBQVk7SUFDM0IsUUFBUSxHQUFHLENBQUM7SUFDWixRQUFRLFFBQVEsQ0FBQyxJQUFJLEdBQUc7UUFDdEIsU0FBUyxVQUFVLElBQUksT0FBTyxrQkFBa0IsS0FBSyxNQUNuRCxJQUFJLE9BQU8sa0JBQWtCO0lBQ2pDO0FBQ0Y7QUFFQSxPQUFPLEdBQUcsQ0FBQyxTQUFTLENBQUMsVUFBWTtJQUMvQixRQUFRLEdBQUcsQ0FBQztJQUNaLFFBQVEsUUFBUSxDQUFDLElBQUksR0FBRztRQUN0QixTQUFTLFlBQVksSUFBSSxPQUFPLGtCQUFrQixLQUFLLE1BQ3JELElBQUksT0FBTyxrQkFBa0I7SUFDakM7QUFDRjtBQUVBLE9BQU8sR0FBRyxDQUFDLFVBQVUsQ0FBQyxVQUFZO0lBQ2hDLFFBQVEsR0FBRyxDQUFDO0lBQ1osUUFBUSxRQUFRLENBQUMsSUFBSSxHQUFHO1FBQ3RCLFNBQVMsWUFBWSxJQUFJLE9BQU8sa0JBQWtCLEtBQUssTUFDckQsSUFBSSxPQUFPLGtCQUFrQjtJQUNqQztJQUNBLE1BQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUNuQztBQUVBLGVBQWUsT0FBTyJ9