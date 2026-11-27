import { tester } from "../../../rule-tester.ts";
import { serviceIdMatchesPathRule } from "./service-id-matches-path.ts";

const service = (name: string, id: string): string =>
  `import { Context } from "effect"; export class ${name} extends Context.Service<${name}, Api>()(${JSON.stringify(id)}) {}`;

const moduleFile = "packages/core/src/todos/todo.service.ts";

const fileLayout = { prefix: "drone-studio", sourceRoot: "packages/*/src", idSource: "file" };

tester.run("@drone-studio/effect/service-id-matches-path", serviceIdMatchesPathRule, {
  valid: [
    { code: service("TodosService", "drone-studio/core/todos/TodosService"), filename: moduleFile },
    {
      code: service("TodoStore", "drone-studio/core/todos/TodoStore"),
      filename: "packages/core/src/todos/todo.store.ts",
    },
    {
      code: service("TodoRepository", "drone-studio/database/TodoRepository"),
      filename: "packages/database/src/todo.repository.ts",
    },
    {
      code: service("Auth", "drone-studio/auth/Auth"),
      filename: "packages/auth/src/better-auth.ts",
    },
    {
      code: service("CurrentUser", "drone-studio/domain/auth/CurrentUser"),
      filename: "packages/domain/src/auth/current-user.ts",
    },
    {
      code: service("S3Storage", "drone-studio/storage/S3Storage"),
      filename: "packages/storage/src/s3-storage.ts",
    },
    { code: service("Anything", "whatever"), filename: "scripts/tool.ts" },
    {
      code: service("TestPostgres", "drone-studio/testing/TestPostgres"),
      filename: "packages/database/src/testing/pg-test.ts",
      options: [{ extraRoots: { "packages/database/src/testing": "drone-studio/testing" } }],
    },
    {
      code: service("TodoMatcher", "drone-studio/todos/matching/TodoMatcher"),
      filename: "packages/app/src/todos/matching/TodoMatcher.ts",
      options: [fileLayout],
    },
  ],
  invalid: [
    {
      code: service("TodosService", "TodosService"),
      filename: moduleFile,
      errors: [{ messageId: "id" }],
      output: service("TodosService", "drone-studio/core/todos/TodosService"),
    },
    {
      code: service("TodoRepository", "drone-studio/core/database/TodoRepository"),
      filename: "packages/database/src/todo.repository.ts",
      errors: [{ messageId: "id" }],
      output: service("TodoRepository", "drone-studio/database/TodoRepository"),
    },
    {
      code: service("S3Storage", "drone-studio/s3/S3Storage"),
      filename: "packages/storage/src/s3-storage.ts",
      errors: [{ messageId: "id" }],
      output: service("S3Storage", "drone-studio/storage/S3Storage"),
    },
    {
      code: service("CurrentUser", "drone-studio/auth/CurrentUser"),
      filename: "packages/domain/src/auth/current-user.ts",
      errors: [{ messageId: "id" }],
      output: service("CurrentUser", "drone-studio/domain/auth/CurrentUser"),
    },
    {
      code: service("Matcher", "drone-studio/todos/matching/TodoMatcher"),
      filename: "packages/app/src/todos/matching/TodoMatcher.ts",
      options: [fileLayout],
      errors: [{ messageId: "className" }],
    },
    {
      code: service("TodosService", "drone-studio/todos/TodosService"),
      filename: moduleFile,
      options: [{ prefix: "acme" }],
      errors: [{ messageId: "id" }],
      output: service("TodosService", "acme/todos/TodosService"),
    },
  ],
});
