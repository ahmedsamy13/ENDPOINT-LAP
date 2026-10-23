# Validation and release status

Tested October 23, 2026, in the attached Debian 13 x86_64 cloud machine. This is a **developer release**, not a claim of complete Postman parity or a signed production distribution.

## Executed checks

| Check                              | Outcome                                                                                                                                                                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript + Vite production build | Passed. One expected size warning for the lazy CodeMirror chunk; gzip budget check passes.                                                                                                                                                                           |
| Vitest                             | 19 tests passed across request/auth/variables, assertions/schema, import/export and cURL form round-tripping.                                                                                                                                                        |
| Playwright / actual Chromium       | 8 UI tests passed: dark studio, recipe disclosure and retained inputs, auth masking, keyboard palette, assertions/extraction editing, native-only transport boundary, direct cURL paste, split/stack layout, library visibility and accessible discard confirmation. |
| Rust core suite                    | 7 integration tests passed: real local HTTP/headers/cookies, SQLite persistence/cascade/cycle checks, retention, bounded responses, cancellation, invalid URL/header rejection and cross-origin redirects.                                                           |
| Real Tauri / WebKit release UI     | Passed React → IPC → Rust POST → response → three worker checks (including schema) → token extraction → history.                                                                                                                                                     |
| Native persistence                 | Saved request/environment restored after the application closed and restarted.                                                                                                                                                                                       |
| Atomic import                      | Invalid second entity rolled back the entire native import.                                                                                                                                                                                                          |
| Native networking                  | Cancellation, cross-origin redirect stop, Basic auth, URL-encoded forms, multipart text fields and binary uploads passed against a local HTTP server.                                                                                                                |
| Linux OS keychain                  | Isolated unlocked GNOME Keyring: store → opaque reference → native query substitution/encoding → delete passed.                                                                                                                                                      |
| Standalone desktop                 | Native release smoke test passed with the Vite development server stopped. Frontend assets are embedded; no Node/HTTP application backend is required.                                                                                                               |
| Packaging                          | Linux amd64 `.deb` built with Tauri. Package contents inspected separately; clean-machine installation is not established by building it.                                                                                                                            |
| npm audit                          | Zero known advisories in the final dependency tree, including development dependencies. Point-in-time result, not a security guarantee.                                                                                                                              |

Browser UI tests use no production mock responses. The native smoke test launches a temporary local Python HTTP fixture and controls the real Tauri app through tauri-driver/WebKitWebDriver; SQLite and native network commands are real. The fixture is test-only infrastructure. No HTTP test server ships in the desktop runtime.

The container has no root access. Signed Debian packages were downloaded and extracted to `/workspace/endpoint-system/root`; `proot` maps the hard-coded WebKit child-process directory for launch. Xvfb supplies a display. TLS, package signatures, checksums and the WebKit sandbox were not disabled. This special cloud setup is not required on normal machines with Tauri prerequisites installed.

## Measurements and budgets

These are single-machine measurements, not competitor comparisons or statistically robust benchmarks.

- The packaged executable is approximately **7.1 MiB**; the `.deb` approximately **3.5 MiB**. System WebKit/GTK libraries are excluded. Exact sizes depend on the final embedded assets and bundler.
- Initial JS entry: approximately **93 KB gzip**; lazy CodeMirror: approximately **193 KB gzip**. All generated JS/CSS are approximately **1.06 MB uncompressed**.
- Enforced bundle budgets: initial entry below 150 KiB gzip, lazy editor below 220 KiB gzip, aggregate JS/CSS below 1,500 KiB. Run `node scripts/check-bundle.mjs` after `npm run build`.
- A debug SQLite benchmark inserted 10,001 nodes in one transaction in **3,009 ms**, fetched metadata in **18.649 ms**, and read 100 request payloads in **1.395 ms**. This includes a project-limit count check per insertion. It is not a release-mode or worst-case disk benchmark.
- A release WebDriver session reached ready UI in **1,508 ms**, restart **2,018 ms**, in one run. These include driver negotiation and Xvfb/VM behavior; they are **not cold-start measurements**.
- Cold-start distribution, total system-webview memory, idle CPU and battery impact have not been benchmarked. No claim of being faster/lighter than a competitor is established. Targets for follow-up: p95 interactive launch under 2 seconds on defined reference hardware; total idle process-tree memory under 150 MiB; no periodic background polling; metadata query p95 under 50 ms for 10,000 entities.

Reproduce SQLite measurements with `cargo run --manifest-path src-tauri/Cargo.toml --no-default-features --example benchmark`. Reproduce native UI checks with `scripts/test-desktop.py`; set `ENDPOINT_BINARY` to the Tauri-built release executable and `TAURI_DRIVER_URL` to the running driver. Optional `ENDPOINT_TEST_KEYCHAIN=1` requires an isolated unlocked provider. Use temporary XDG application directories to protect personal data.

## Remaining limitations / distribution gates

- Windows/macOS CI build definitions exist; builds, runtime, keychain, dialogs, installers, signing and notarization still need those platforms. CI configuration is not evidence that hosted jobs have passed.
- No WebSocket, SSE streaming, gRPC, mock server, CLI, automatic Git sync, generated API docs or response diffing.
- OAuth supports client credentials and manual refresh grants. Authorization code/PKCE/browser callbacks and automatic scheduled refresh are absent.
- JWT is accepted as a bearer token, without signing/claim-generation UI. There is no mTLS/client-certificate or custom proxy-profile UI.
- No arbitrary JS pre/post scripts. Imported scripts are skipped with warnings. Declarative rules are supported.
- OpenAPI import covers 3.x paths, basic inline parameters and JSON examples; referenced parameters/security mappings require manual configuration and emit warnings. Swagger 2 is rejected. cURL supports an explicit subset and rejects unsafe/unsupported flags; attached files cannot be represented as portable cURL without a local path.
- Multipart currently has text fields and one attachment named `file`; cookie persistence/jar management is not implemented. Cookies can be sent explicitly in headers and inspected in responses.
- JSON tree mode is bounded to 512 KiB, formatting/extraction to 4 MiB, default response to 16 MiB (32 MiB maximum), request/upload to 16 MiB, project hierarchy to 20,000 nodes/64 levels. These are explicit limits, not infinite-stream support.
- Portable backup excludes keychain contents, attachments, history and arbitrary UI settings. Mark sensitive data; arbitrary secret strings in bodies/custom fields need manual review. SQLite is not encrypted. Orphaned keychain entries are not automatically collected.
- Linux native keychain was exercised; file open/save dialog cancellation/overwrite and recovery during forced power loss require further manual/platform QA. Atomic file replacement can fail on platform-specific destination conditions and reports an error.
- User usability studies, accessibility audit with assistive technology, large-project rendering benchmarks, crash-injection tests and Cargo advisory scanning remain release gates.

See [DESIGN.md](DESIGN.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [SECURITY.md](../SECURITY.md). Do not present deferred features or unrun checks as completed.
