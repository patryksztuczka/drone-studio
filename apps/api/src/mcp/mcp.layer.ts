import { McpAuthenticationLayer } from "@drone-studio/auth";
import { toToolkitHandlers } from "@drone-studio/capability";
import { toCodeMode, toCodeModeHandlers } from "@drone-studio/capability/code-mode";
import { CurrentUser } from "@drone-studio/domain/identity/current-user";
import { TodosToolkit } from "@drone-studio/domain/todos/todos.contracts";
import { Layer } from "effect";
import { McpProtocol, McpServer } from "effect/ai";

import { TodosCapabilities } from "../capabilities/todos.capabilities.ts";

const McpTransportLayer = McpServer.layerHttpRequestScoped({
  name: "drone-studio",
  version: "1.0.0",
  path: "/api/mcp",
  protocols: [McpProtocol.v2026_07_28],
}).pipe(Layer.orDie, Layer.provide(McpAuthenticationLayer));

const TodosCodeMode = toCodeMode(TodosCapabilities);

export const McpLayer = Layer.mergeAll(
  McpServer.toolkit(TodosToolkit).pipe(
    Layer.provide(toToolkitHandlers(TodosToolkit, TodosCapabilities, [CurrentUser])),
  ),
  McpServer.toolkit(TodosCodeMode.toolkit).pipe(
    Layer.provide(toCodeModeHandlers(TodosCodeMode, [CurrentUser])),
  ),
).pipe(Layer.provide(McpTransportLayer));
