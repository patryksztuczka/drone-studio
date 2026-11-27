import { TodoTitle } from "@drone-studio/domain/todos/todo";
import { Schema } from "effect";

export const NewTodoForm = Schema.Struct({
  title: Schema.Trim.pipe(Schema.decodeTo(TodoTitle)),
});

export type NewTodoFormValues = typeof NewTodoForm.Encoded;
