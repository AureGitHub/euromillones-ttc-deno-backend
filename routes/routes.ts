import { Router } from "../deps.ts";
import _config from "../config.ts"

const router = new Router({prefix: _config.route.prefix});

const ver : string = _config.route.version;
const routerVer=(await import(`.${ver}/index.ts`)).getRouter();
router.use(ver,routerVer.routes());
export default router;
