import { Status } from "../../../deps.ts";
export default ((ctx)=>{
    ctx.response.status = Status.BadRequest;
    ctx.response.body = {
        msg: `Not Found ${ctx.request.url.href}  `
    };
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImZpbGU6Ly8vaG9tZS9ydW5uZXIvZXVyb21pbGxvbmVzLXR0Yy1kZW5vLWJhY2tlbmQvY29udHJvbGxlcnMvbWFuYWdlbWVudC80MDQvNDA0LmNvbnRyb2xsZXIudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29udGV4dCwgU3RhdHVzIH0gZnJvbSBcIi4uLy4uLy4uL2RlcHMudHNcIjtcblxuZXhwb3J0IGRlZmF1bHQgKGN0eCA6IENvbnRleHQgKSA9PiB7XG4gIGN0eC5yZXNwb25zZS5zdGF0dXMgPSBTdGF0dXMuQmFkUmVxdWVzdDtcbiAgY3R4LnJlc3BvbnNlLmJvZHkgPSB7IG1zZzogYE5vdCBGb3VuZCAke2N0eC5yZXF1ZXN0LnVybC5ocmVmfSAgYCB9O1xufTtcblxuXG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsU0FBa0IsTUFBTSxRQUFRLG1CQUFtQjtBQUVuRCxlQUFlLENBQUEsQ0FBQyxNQUFtQjtJQUNqQyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEdBQUcsT0FBTyxVQUFVO0lBQ3ZDLElBQUksUUFBUSxDQUFDLElBQUksR0FBRztRQUFFLEtBQUssQ0FBQyxVQUFVLEVBQUUsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7SUFBQztBQUNuRSxDQUFBLEVBQUUifQ==