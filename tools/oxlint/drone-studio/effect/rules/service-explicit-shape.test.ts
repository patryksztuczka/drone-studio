import { tester } from "../../../rule-tester.ts";
import { serviceExplicitApiRule } from "./service-explicit-shape.ts";

const error = { messageId: "missingApi" };

tester.run("@drone-studio/effect/service-explicit-shape", serviceExplicitApiRule, {
  valid: [
    'import { Context, Effect } from "effect"; export class TodoCatalog extends Context.Service<TodoCatalog, { readonly find: (id: string) => Effect.Effect<number> }>()("drone-studio/todos/TodoCatalog") {}',
    'import { Context } from "effect"; export const Db = Context.Service<DbApi>("drone-studio/database/Db");',
    'const Context = { Service: () => () => class {} }; class X extends Context.Service<X>()("x") {}',
  ],
  invalid: [
    {
      code: 'import { Context, Effect } from "effect"; export class TodoCatalog extends Context.Service<TodoCatalog>()("drone-studio/todos/TodoCatalog", { make: Effect.succeed({}) }) {}',
      errors: [error],
    },
    {
      code: 'import { Context } from "effect"; class X extends Context.Service()("x") {}',
      errors: [error],
    },
  ],
});
