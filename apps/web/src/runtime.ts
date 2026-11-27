import { ApiOrigin } from "@drone-studio/client-runtime/api-origin";
import { clientLayer } from "@drone-studio/client-runtime/atom-runtime";
import type { ClientLayer } from "@drone-studio/client-runtime/atom-runtime";
import {
  McpClientDirectoryHttpLayer,
  SignInMethodsHttpClientLayer,
} from "@drone-studio/client-runtime/identity";
import { TodosHttpClientLayer, TodosRpcClientLayer } from "@drone-studio/client-runtime/todos";
import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { Atom } from "effect/reactivity";

export type TodosTransport = "http" | "rpc";

export const TODOS_TRANSPORT: TodosTransport =
  import.meta.env.VITE_TODOS_TRANSPORT === "rpc" ? "rpc" : "http";

const WebClientLayer: ClientLayer = Layer.mergeAll(
  TODOS_TRANSPORT === "rpc" ? TodosRpcClientLayer : TodosHttpClientLayer,
  SignInMethodsHttpClientLayer,
  McpClientDirectoryHttpLayer,
).pipe(
  Layer.provide(ApiOrigin.layer(globalThis.location.origin)),
  Layer.provide(FetchHttpClient.layer),
);

export const clientAtoms = [Atom.initialValue(clientLayer, WebClientLayer)];
