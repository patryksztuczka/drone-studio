import { RpcAuthenticationLayer } from "@drone-studio/auth";
import { toRpcHandlers } from "@drone-studio/capability";
import { TodosRpcs } from "@drone-studio/domain/todos/todos.contracts";
import { Layer } from "effect";
import { RpcSerialization, RpcServer } from "effect/rpc";

import { TodosCapabilities } from "../capabilities/todos.capabilities.ts";

export const RpcLayer = RpcServer.layerHttp({
  group: TodosRpcs,
  path: "/api/rpc",
  protocol: "http",
}).pipe(
  Layer.provide([
    toRpcHandlers(TodosRpcs, TodosCapabilities),
    RpcAuthenticationLayer,
    RpcSerialization.layerNdjson,
  ]),
);
