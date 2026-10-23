import { askText } from "../lib/interactions";
import { secretReference } from "../lib/bridge";
import { pair } from "../lib/types";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  Braces,
  Check,
  CheckCheck,
  ChevronRight,
  Copy,
  Search,
  AlertCircle,
  CornerDownRight,
} from "lucide-react";
import { exportFile } from "../lib/bridge";
import { jsonPath } from "../lib/request";
import { processResponse } from "../lib/worker";
import { useWorkspace } from "../lib/store";
import type { Tab } from "../lib/types";
const Editor = lazy(() => import("./Editor"));
function Tree({
  value,
  name = "$",
  path = "$",
  depth = 0,
}: {
  value: unknown;
  name?: string;
  path?: string;
  depth?: number;
}) {
  const [open, setOpen] = useState(depth === 0);
  const [limit, setLimit] = useState(100);
  const toast = useWorkspace((s) => s.toast);
  const obj = value !== null && typeof value === "object";
  const entries = obj ? Object.entries(value as object) : [];
  return (
    <div className="tree-node">
      <div className="tree-line">
        <button
          className="tree-toggle"
          disabled={!obj}
          aria-label={`Expand ${path}`}
          onClick={() => setOpen(!open)}
        >
          {obj ? (
            <ChevronRight size={12} className={open ? "rotated" : ""} />
          ) : (
            <span />
          )}
        </button>
        <button
          className="json-key"
          title={`Copy JSON path: ${path}`}
          onClick={() => {
            void navigator.clipboard
              .writeText(path)
              .then(() => toast(`Copied ${path}`));
          }}
        >
          {name}
        </button>
        <span className="muted">:</span>
        {obj ? (
          <span className="muted">
            {Array.isArray(value)
              ? `[${entries.length}]`
              : `{${entries.length}}`}
          </span>
        ) : (
          <span
            className={
              typeof value === "string" ? "json-string" : "json-primitive"
            }
          >
            {JSON.stringify(value)}
          </span>
        )}
      </div>
      {obj && open && (
        <div className="tree-children">
          {entries.slice(0, limit).map(([k, v]) => (
            <Tree
              key={k}
              name={k}
              path={Array.isArray(value) ? `${path}[${k}]` : `${path}.${k}`}
              value={v}
              depth={depth + 1}
            />
          ))}
          {entries.length > limit && (
            <button
              className="text-button"
              onClick={() => setLimit(limit + 100)}
            >
              Show next 100
            </button>
          )}
        </div>
      )}
    </div>
  );
}
export default function Response({ tab }: { tab: Tab }) {
  const [mode, setMode] = useState("Pretty");
  const [pretty, setPretty] = useState("");
  const [path, setPath] = useState("");
  const toast = useWorkspace((s) => s.toast);
  const response = tab.response;
  useEffect(() => {
    if (!response) {
      setPretty("");
      return;
    }
    let live = true;
    void processResponse(response, [])
      .then((v) => {
        if (live) setPretty(v.pretty);
      })
      .catch(() => {
        if (live) setPretty(response.body);
      });
    return () => {
      live = false;
    };
  }, [response]);
  const parsed = useMemo(() => {
    if (!response || response.body.length > 512 * 1024) return undefined;
    try {
      return JSON.parse(response.body) as unknown;
    } catch {
      return undefined;
    }
  }, [response]);
  const [blob, setBlob] = useState("");
  useEffect(() => {
    if (!response || mode !== "Preview") return;
    const html = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; form-action 'none'; base-uri 'none'">${response.body}`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    setBlob(url);
    return () => URL.revokeObjectURL(url);
  }, [response, mode]);
  const content = () => {
    if (!response) return null;
    if (mode === "Headers")
      return (
        <div className="response-table">
          {response.headers.map((h, i) => (
            <div key={i}>
              <span>{h.key}</span>
              <span>{h.value}</span>
            </div>
          ))}
        </div>
      );
    if (mode === "Cookies")
      return (
        <div className="response-table">
          {response.cookies.length ? (
            response.cookies.map((c, i) => (
              <div key={i}>
                <span>Set-Cookie</span>
                <span>{c}</span>
              </div>
            ))
          ) : (
            <p className="hint pad">No cookies returned by the server.</p>
          )}
        </div>
      );
    if (mode === "Tests")
      return (
        <div className="test-results">
          {tab.results?.length ? (
            tab.results.map((r, i) => (
              <div className={r.pass ? "test-pass" : "test-fail"} key={i}>
                {r.pass ? <Check size={15} /> : <AlertCircle size={15} />}
                <strong>{r.name}</strong>
                <span>{r.detail}</span>
              </div>
            ))
          ) : (
            <div className="response-next-step">
              <p className="hint">Decide what a good response looks like.</p>
              <button
                className="secondary-button"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("relay:configure", {
                      detail: { id: tab.node.id, section: "Scripts" },
                    }),
                  )
                }
              >
                Add checks to this request <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>
      );
    if (mode === "JSON Tree")
      return parsed === undefined ? (
        <p className="hint pad">
          Tree mode supports valid JSON up to 512 KiB. Use the virtualized code
          editor for larger responses.
        </p>
      ) : (
        <div className="json-tree">
          <div className="path-inspector">
            <Search size={13} />
            <input
              aria-label="JSON path"
              placeholder="Inspect a path, e.g. $.data[0].id"
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
            {path && (
              <>
                <code>
                  {JSON.stringify(jsonPath(parsed, path)) ?? "Not found"}
                </code>
                <button
                  className="text-button"
                  disabled={jsonPath(parsed, path) === undefined}
                  onClick={() => void capture()}
                >
                  Use in next request <ChevronRight size={12} />
                </button>
              </>
            )}
          </div>
          <Tree value={parsed} />
        </div>
      );
    if (mode === "Preview") {
      if (
        response.contentType.startsWith("image/") &&
        !response.contentType.includes("svg")
      )
        return (
          <div className="image-preview">
            <img
              alt="API response"
              src={`data:${response.contentType.split(";")[0]};base64,${response.base64}`}
            />
          </div>
        );
      if (response.contentType.includes("html"))
        return (
          <iframe
            title="Sandboxed API response"
            sandbox=""
            referrerPolicy="no-referrer"
            src={blob}
          />
        );
      return (
        <p className="hint pad">
          Preview supports sandboxed HTML and images. Use Pretty or Raw for this
          response.
        </p>
      );
    }
    if (response.binary)
      return (
        <div className="binary-info">
          <ArrowDownToLine size={25} />
          <h3>Binary response</h3>
          <p>
            {response.contentType} · {formatSize(response.size)}
          </p>
          <button className="secondary-button" onClick={() => void download()}>
            Save response
          </button>
        </div>
      );
    return (
      <Suspense fallback={<div className="hint pad">Loading editor…</div>}>
        <Editor
          value={mode === "Raw" ? response.body : pretty || response.body}
          readOnly
          language={
            response.contentType.includes("xml")
              ? "xml"
              : response.contentType.includes("html")
                ? "html"
                : response.contentType.includes("json")
                  ? "json"
                  : "text"
          }
        />
      </Suspense>
    );
  };
  async function capture() {
    try {
      const state = useWorkspace.getState();
      const environment = state.environments.find(
        (e) => e.id === state.environmentId,
      );
      if (!environment) throw new Error("Choose an active environment first.");
      const value = jsonPath(parsed, path);
      if (value === undefined) throw new Error("This JSON path was not found.");
      const name = await askText(
        "Capture a response value",
        "accessToken",
        `Store ${path} in the active environment’s OS keychain. Reuse it as {{variableName}} in your next request.`,
        "Capture securely",
      );
      if (!name) return;
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
        throw new Error(
          "Use letters, numbers and underscores for the variable name.",
        );
      const reference = await secretReference(
        `${environment.id}:${name}`,
        typeof value === "string" ? value : JSON.stringify(value),
      );
      const next = environment.variables.filter((v) => v.key !== name);
      next.push({ ...pair(name, reference), secret: true });
      await state.saveEnvironment({ ...environment, variables: next });
      toast(`Captured {{${name}}} securely. Ready for your next request.`);
    } catch (error) {
      toast(String(error));
    }
  }
  async function download() {
    if (!response) return;
    try {
      await exportFile(
        "response." +
          (response.contentType.includes("json")
            ? "json"
            : response.contentType.includes("html")
              ? "html"
              : "bin"),
        response.base64,
        true,
      );
    } catch (e) {
      toast(String(e));
    }
  }
  return (
    <section className="response-panel" aria-label="API response">
      <div className="response-heading">
        <div>
          <span className="dock-number">02</span>
          <span className="panel-label">INBOUND</span>
          {response && (
            <>
              <span
                className={`status-chip ${response.status < 400 ? "success" : "failure"}`}
              >
                {response.status} {response.statusText}
              </span>
              <span className="response-stat">
                {response.durationMs} <small>ms</small>
              </span>
              <span className="response-stat">{formatSize(response.size)}</span>
            </>
          )}
        </div>
        <div>
          {response && (
            <>
              <button
                className="icon-button"
                title="Copy response"
                aria-label="Copy response"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(response.body || response.base64)
                    .then(() => toast("Response copied"))
                }
              >
                <Copy size={14} />
              </button>
              <button
                className="icon-button"
                title="Save response"
                aria-label="Save response"
                onClick={() => void download()}
              >
                <ArrowDownToLine size={14} />
              </button>
            </>
          )}
        </div>
      </div>
      {tab.error && (
        <div className="error-banner">
          <AlertCircle size={15} />
          <span>{tab.error}</span>
        </div>
      )}
      {tab.running ? (
        <div className="response-empty">
          <span className="spinner" />
          <h3>Sending request</h3>
          <p>The native engine is waiting for a response.</p>
        </div>
      ) : response ? (
        <>
          <div className="response-tabs">
            {[
              "Pretty",
              "Raw",
              "Preview",
              "JSON Tree",
              "Headers",
              "Cookies",
              "Tests",
            ].map((m) => (
              <button
                className={mode === m ? "active" : ""}
                key={m}
                onClick={() => setMode(m)}
              >
                {m}
                {m === "Tests" && !!tab.results?.length && (
                  <span className="count">
                    {tab.results.filter((r) => r.pass).length}/
                    {tab.results.length}
                  </span>
                )}
              </button>
            ))}
            <span className="response-type">
              {response.contentType.split(";")[0]}
            </span>
          </div>
          <div className="response-content">{content()}</div>
          <div className="network-details">
            <CornerDownRight size={12} />
            <span title={response.finalUrl}>{response.finalUrl}</span>
            <span>
              Headers {response.headersMs} ms · {response.redirects} redirects
            </span>
          </div>
        </>
      ) : (
        !tab.error && (
          <div className="response-empty">
            <div className="empty-glyph">
              <Braces size={27} />
              <CheckCheck className="glyph-check" size={12} />
            </div>
            <span className="response-empty-eyebrow">THE RETURN PATH</span>
            <h3>Nothing on the wire. Yet.</h3>
            <p>Your next response lands here.</p>
            <span className="shortcut">
              <kbd>⌘ / Ctrl</kbd>
              <kbd>↵</kbd> to send request
            </span>
          </div>
        )
      )}
    </section>
  );
}
export function formatSize(n: number) {
  return n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1024 / 1024).toFixed(1)} MB`;
}
