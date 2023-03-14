import { Context, Status } from "../../../deps.ts";

export default (ctx: Context) => {
  ctx.response.status = Status.BadRequest;
  ctx.response.body = { msg: `Not Found ${ctx.request.url.href}  ` };
};
