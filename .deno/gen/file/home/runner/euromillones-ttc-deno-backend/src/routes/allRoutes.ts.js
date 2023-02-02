import { Router } from "../../deps.ts";
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
export default router;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImZpbGU6Ly8vaG9tZS9ydW5uZXIvZXVyb21pbGxvbmVzLXR0Yy1kZW5vLWJhY2tlbmQvc3JjL3JvdXRlcy9hbGxSb3V0ZXMudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUm91dGVyIH0gZnJvbSBcIi4uLy4uL2RlcHMudHNcIjtcblxuY29uc3Qgcm91dGVyID0gbmV3IFJvdXRlcigpO1xuXG5yb3V0ZXIuZ2V0KFwiL1wiLCAoY29udGV4dCkgPT4ge1xuICBjb25zb2xlLmxvZyhcImVudHJhIGVuIHJhaXpcIik7XG4gIGNvbnRleHQucmVzcG9uc2UuYm9keSA9IHtcbiAgICBtZXNzYWdlOiBcInJhaXogXCIgKyBuZXcgRGF0ZSgpLnRvTG9jYWxlRGF0ZVN0cmluZygpICsgXCIgXCIgK1xuICAgICAgbmV3IERhdGUoKS50b0xvY2FsZVRpbWVTdHJpbmcoKSxcbiAgfTtcbn0pO1xuXG5yb3V0ZXIuZ2V0KFwiL2hvbGFcIiwgKGNvbnRleHQpID0+IHtcbiAgY29uc29sZS5sb2coXCJlbnRyYSBlbiBob2xhXCIpO1xuICBjb250ZXh0LnJlc3BvbnNlLmJvZHkgPSB7XG4gICAgbWVzc2FnZTogXCJoZWxsbyAgXCIgKyBuZXcgRGF0ZSgpLnRvTG9jYWxlRGF0ZVN0cmluZygpICsgXCIgXCIgK1xuICAgICAgbmV3IERhdGUoKS50b0xvY2FsZVRpbWVTdHJpbmcoKSxcbiAgfTtcbn0pO1xuXG5leHBvcnQgZGVmYXVsdCByb3V0ZXI7XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsU0FBUyxNQUFNLFFBQVEsZ0JBQWdCO0FBRXZDLE1BQU0sU0FBUyxJQUFJO0FBRW5CLE9BQU8sR0FBRyxDQUFDLEtBQUssQ0FBQyxVQUFZO0lBQzNCLFFBQVEsR0FBRyxDQUFDO0lBQ1osUUFBUSxRQUFRLENBQUMsSUFBSSxHQUFHO1FBQ3RCLFNBQVMsVUFBVSxJQUFJLE9BQU8sa0JBQWtCLEtBQUssTUFDbkQsSUFBSSxPQUFPLGtCQUFrQjtJQUNqQztBQUNGO0FBRUEsT0FBTyxHQUFHLENBQUMsU0FBUyxDQUFDLFVBQVk7SUFDL0IsUUFBUSxHQUFHLENBQUM7SUFDWixRQUFRLFFBQVEsQ0FBQyxJQUFJLEdBQUc7UUFDdEIsU0FBUyxZQUFZLElBQUksT0FBTyxrQkFBa0IsS0FBSyxNQUNyRCxJQUFJLE9BQU8sa0JBQWtCO0lBQ2pDO0FBQ0Y7QUFFQSxlQUFlLE9BQU8ifQ==