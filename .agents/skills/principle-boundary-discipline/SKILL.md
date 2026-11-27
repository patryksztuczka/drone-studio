---
name: principle-boundary-discipline
description: Apply when wiring validation, decoding, error handling or an adapter. Parse and guard at the system's edges, trust the types inside, and keep business logic in service methods and pure functions.
disable-model-invocation: true
---

# Boundary discipline

Validate where data enters the system. Inside, trust the types. Validation scattered through the call chain is noise, repeats itself and still misses the one place that mattered.

## The edges in this repo

| Edge                          | Where it is parsed                                                       |
| ----------------------------- | ------------------------------------------------------------------------ |
| hardware manifests            | `drone validate`, against the JSON Schemas in `hardware/schemas/`        |
| engine JSON-RPC and MCP input | the message types in the Rust crate that serves them, decoded on arrival |
| CLI arguments                 | the `drone` CLI's argument parser                                        |
| config                        | `Config` in a `layerConfig` in a composition root (`config.pair`)        |
| the engine, in the renderer   | the engine client, which decodes every message into a typed value        |

## Rules

- Decode once, at the edge, with `Schema.decodeUnknownEffect`. Inside, take the decoded type and do not check it again.
- Do not pass the edge's own representation inward or outward: no raw JSON message, serial frame or Electron object in a service or crate signature. Expose the domain type.
- Handlers decode, call one function or service method and map its errors (`services.placement`). Logic in a handler is logic that cannot be tested without the transport.
- Work that needs no services is a pure function next to the service.

Two questions settle most cases. "Is this data crossing an edge right now?" If not, the check is redundant. "Could this be a pure function the shell just calls?" If yes, extract it.
