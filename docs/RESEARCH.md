# Product research and decisions

Research performed October 23, 2026. Direct product documentation sites were denied by this environment's network proxy. The public repositories below were read through authenticated Git access. These are primary-source product descriptions, not independent performance measurements. No competitor runtime or memory benchmarks were run, and no claims about relative speed are established.

| Client     | Evidence inspected                                                                                                                          | Useful product signal                                                      | Endpoint decision                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Postman    | [postmanlabs/postman-app-support](https://github.com/postmanlabs/postman-app-support), README at `d5f8248261bc6405fb29b81567182db3221e6c9e` | Broad API lifecycle and collaboration platform; dedicated issue tracker    | Focus this implementation on local personal development. No account, workspace sync, telemetry, or hosted service. The support README is insufficient evidence to quantify complaints.                    |
| Bruno      | [usebruno/bruno](https://github.com/usebruno/bruno), README at `b13fe9276e8e562d9fdb2976a147fb5fbda3c697`                                   | Offline-only collections stored as portable text; Git workflow and CLI     | Local SQLite for transactional edits, with explicit portable JSON export for Git review. Automatic folder synchronization is deferred because bidirectional conflict handling requires a separate design. |
| Insomnia   | [Kong/insomnia](https://github.com/Kong/insomnia), README at `61922aea77b109d4f479224e38922ea6ee260a4a`                                     | REST, GraphQL, WebSocket, SSE, gRPC; local, cloud, and Git storage choices | Keep transport modular. Deliver bounded HTTP and GraphQL-over-HTTP first. No account prerequisite for any implemented feature.                                                                            |
| Hoppscotch | [hoppscotch/hoppscotch](https://github.com/hoppscotch/hoppscotch), README at `63273f8e599e73f0fb38c0739314e8d46b6bc83d`                     | Focused API workflows, environments, collections, multiple protocols       | Put the URL, variables and response in one keyboard-friendly desktop workspace. The renderer does not implement browser networking.                                                                       |

Product hypotheses to validate with developers: account friction, visual density, startup overhead, and migration effort can matter more than adding protocols. These are design hypotheses, not measured survey findings or verified common complaints.

## Dependency decisions

- **Tauri 2** uses system webviews and a native Rust boundary instead of bundling Chromium. Cross-platform packaging is configured; each platform still needs native testing and signing.
- **React + TypeScript / Zustand** provide typed UI state with selective subscriptions. The active project's metadata is loaded; request bodies are fetched on demand. The tree window renders a bounded row slice.
- **CodeMirror 6** provides virtualized editor rendering, folding, search, highlighting, keyboard editing and variable completion. It loads only when an editor is shown. JSON/XML/HTML language packages are justified by actual body modes.
- **reqwest + rustls** implement native HTTP, TLS validation, uploads, compressed responses, connection/overall timeouts and streamed size enforcement. No browser fetch or local web service handles production requests.
- **rusqlite (bundled SQLite)** avoids OS SQLite version drift. WAL, FULL synchronization, foreign keys, indexed metadata and atomic import protect local data.
- **keyring** delegates credential encryption and access policy to the OS. No insecure plaintext fallback when a credential service is absent.
- **@cfworker/json-schema** interprets schemas without eval/new Function. Ajv was evaluated and replaced because runtime compilation conflicts with the production CSP. Schema work runs in a disposable worker with a 3-second budget.
- **YAML** loads only on import, with alias expansion limits. cURL is parsed as text, never executed in a shell.
- **Tailwind 4 / Lucide** supply styling primitives and tree-shaken icons. No heavy component framework, router, network cache, chart suite, or backend server is needed.

## Further protocols and priorities

| Feature                              | Developer value                     | Cost / risk                                                        | Decision                                                                              |
| ------------------------------------ | ----------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| GraphQL over HTTP                    | High; same transport, JSON body     | Low                                                                | Implemented as a JSON GraphQL envelope                                                |
| Collection runner / token extraction | High; auth and regression workflows | Medium; ordering and cancellation                                  | Implemented sequentially, explicit response extraction                                |
| Response comparison                  | Useful during API changes           | Medium; large-body diff limits                                     | Defer                                                                                 |
| SSE / WebSocket                      | Useful for real-time APIs           | Medium; long-lived connections, bounded event buffers, separate UI | Defer; HTTP timeout/size bounds intentionally do not pretend to be a streaming client |
| OAuth authorization code + PKCE      | High for user-consent flows         | High; browser callbacks, state validation, refresh lifecycle       | Defer; client credentials and manual refresh-token grants implemented                 |
| gRPC                                 | Valuable for specific teams         | High; protobuf tooling, reflection, HTTP/2 diagnostics             | Defer                                                                                 |
| Mock server                          | Useful offline                      | Medium; starts a listening service, routing lifecycle              | Defer; no background listening service in this product                                |
| CLI / generated docs / Git sync      | Valuable automation                 | Medium; durable format and conflict semantics                      | Portable format is versioned; these integrations remain unimplemented                 |
| Arbitrary scripts                    | Familiar migration feature          | High; untrusted code, filesystem/network access, CPU limits        | No JS execution. Declarative assertions/extraction only                               |

See [VALIDATION.md](VALIDATION.md) for executed checks and remaining release gates.
