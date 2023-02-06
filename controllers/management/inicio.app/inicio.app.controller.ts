import { Context, Status } from "../../../deps.ts";
import _global from "../../../global.ts"

// deno-lint-ignore no-explicit-any
export default async (ctx: Context, nextFn: () => any) => {
  try {
    //TODO LO QUE QUIERO QUE HAGA AL ENTRAR EN LA APP

    _global.contador++;
    
    console.log(`inicio APP ${ctx.request.url.pathname}  => ${_global.contador}`)
    await nextFn();
  } catch (err) {
    console.log('Gestión de errores')
    ctx.response.status = Status.InternalServerError;
    // console.dir(err);
    //  console.dir(context);
    ctx.response.body = { msg: err.message };

    //LLAMARÉ A ALGÚN MÉTODO PARA GESTION DE ERRORES
    
    
  }
};