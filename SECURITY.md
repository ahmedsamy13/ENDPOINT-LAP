# Security

Relay is a personal native HTTP client. Local/private addresses are deliberately reachable. Review imported destinations, headers and bodies before sending; native requests are not constrained by browser CORS.

- TLS validation is always enabled. HTTP(S) only; no insecure toggle or `curl -k` support.
- Redirects remain on the initial origin. Header names/values are validated and transport framing headers are managed natively.
- Streamed response limits, request limits, timeouts, cancellation and concurrency caps bound network resources.
- SQLite uses WAL, FULL synchronization, foreign keys, schema versions and transactional imports. It is **not encrypted**. Ordinary inline credentials/body values persist as supplied. Use the keychain and OS disk encryption for sensitive data.
- Explicit secret storage uses OS credentials with no plaintext fallback. The renderer receives references, not stored values. Deleting an environment/request does not currently garbage-collect orphaned keychain entries.
- Response bodies may contain secrets and are deliberately inspectable; they remain in open-tab memory and are not persisted in history. History redacts query strings, but URL paths may themselves contain sensitive data. Retention can be disabled.
- Portable exports strip recognized authentication fields, marked variables, keychain references/values and attachments. Arbitrary secrets in custom headers/body fields cannot be identified reliably. Review files before sharing. Portable backup does not include credential/history restoration.
- cURL is parsed as text, never executed. YAML alias expansion, import sizes, entity counts, hierarchy depth and workflows are bounded. Native backups are validated; failed imports roll back completely.
- Imported JavaScript does not execute. Declarative checks use a disposable worker and schema interpreter with a timeout, no eval and no remote schema loading.
- HTML preview is sandboxed and has a restrictive CSP. Images exclude SVG. Remote scripts/plugins and an updater service are absent.
- Files are selected through native dialogs. There is no renderer command for reading arbitrary paths. Exports write a private temporary file before replacing the chosen destination.

The npm audit result in `docs/VALIDATION.md` is a point-in-time check, not a security guarantee. OS-keychain, dialog, signing/notarization and recovery behavior need the platform tests listed there before broad distribution. The application contains no cloud credentials or telemetry.

Report vulnerabilities privately to the repository owner using GitHub private vulnerability reporting if enabled. Do not post credentials, private database contents or sensitive collections in public issues.
