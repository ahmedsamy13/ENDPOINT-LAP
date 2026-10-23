# Relay: a different way through an API request

Relay's interface was redesigned in response to a specific product requirement: an independent visual identity and simpler workflows rather than a Postman-like arrangement with a new accent color.

## Identity

The Relay wordmark and two interlocking route symbols are original SVG/CSS geometry. No competitor logos, illustrations or UI assets are used. Neutral charcoal/slate surfaces, a familiar soft blue primary (`#60a5fa`), and a muted cyan secondary (`#67c6dd`) provide the current palette. Blue marks primary actions and active paths; cyan marks secondary signals and reference markers. Response status and HTTP methods retain distinct semantic colors.

The brand is applied to the window title, packaged product name, desktop icon set, startup view, editor palette, dialogs, notifications and footer. The existing native identifier/database/keychain namespace remains stable so the visual rebrand does not silently strand local data.

## Workflow decisions

1. **Start with the destination.** Create an unsaved session and type a URL, or paste cURL directly into the URL field. Parsing fills method, headers, identity and payload without executing a shell or sending a request. Review before Send.
2. **A recipe, not six tabs.** Query, Identity, Headers, Body, Checks & capture, and Delivery are expandable sections. Each collapsed section keeps a useful summary visible: active row count, authentication type, body format, check/capture counts and timeout. One section opens at a time; switching does not discard edits.
3. **A response-first workbench.** Inbound uses the full content width and available viewport height. Outbound follows below on the same scrolling page. A sticky composer keeps the full method dropdown, URL and Send available while reviewing settings. Quick actions jump to Body, Outbound or Inbound. POST, PUT and PATCH reveal the body editor and initialize JSON only when no body format is selected; existing body content is retained. Custom HTTP methods remain available.
4. **The library is optional while you work.** Horizontal Workspace / Starred / Activity navigation replaces the icon-only rail. The project library can be hidden to focus on a request, then restored. Add-request actions are visible on collection/folder rows; context menus remain available for less frequent operations.
5. **Continue from the response.** JSON tree path inspection includes “Use in next request.” It stores the selected response value in the active environment's keychain after asking for a variable name. The empty test-results view links directly to the checks step.
6. **Intent before loss.** Saving, naming, renaming, deleting and discarding drafts use accessible in-app dialogs rather than browser prompt/confirm boxes. Backdrop clicks and drags never dismiss editor dialogs. Escape or explicit Cancel dismisses when idle; a pending save blocks dismissal and duplicate submission. Save failures remain inline with the name intact for retry. Named requests persist in their collection before the creation dialog resolves. Environment/configuration drafts ask before discarding edits. Native close intercepts dirty requests and open dialogs.
7. **Keyboard commands remain familiar.** Common developer shortcuts are retained. Novelty does not justify making Save, Send, Search or Cancel harder to learn.

These are implemented workflows, not proposed screens. Browser UI tests cover progressive disclosure, preserving edits, direct cURL paste, response-first scrolling layout and sticky controls, library visibility and draft confirmation. Native integration tests real collection/request dialogs, POST/PATCH body editing, Save As, HTTP and SQLite. Save As opens a separate copy and preserves the original draft; async saves leave subsequent edits dirty.

The next usability step is observed testing with developers on real projects. No user-study or relative productivity claims have been measured.
