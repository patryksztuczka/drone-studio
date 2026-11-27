import type { UserId } from "@drone-studio/domain/identity/user";
import type { Todo, TodoId, TodoPatch, TodoTitle } from "@drone-studio/domain/todos/todo";
import { Context } from "effect";
import type { DateTime, Effect, Option } from "effect";

export interface NewTodoRecord {
  readonly ownerId: UserId;
  readonly title: TodoTitle;
  readonly createdAt: DateTime.Utc;
}

export interface TodoStoreApi {
  readonly listByOwner: (ownerId: UserId) => Effect.Effect<ReadonlyArray<Todo>>;
  readonly insert: (record: NewTodoRecord) => Effect.Effect<Todo>;
  readonly update: (
    ownerId: UserId,
    id: TodoId,
    patch: TodoPatch,
  ) => Effect.Effect<Option.Option<Todo>>;
  readonly remove: (ownerId: UserId, id: TodoId) => Effect.Effect<boolean>;
}

export class TodoStore extends Context.Service<TodoStore, TodoStoreApi>()(
  "drone-studio/core/todos/TodoStore",
) {}
