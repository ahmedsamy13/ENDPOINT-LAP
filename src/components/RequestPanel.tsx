import { importCurl } from "../lib/importers";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  MoveUpRight,
  Code2,
  FileUp,
  Plus,
  Save,
  Square,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { useWorkspace } from "../lib/store";
import { importFile } from "../lib/bridge";
import { curl } from "../lib/request";
import { id, type Tab } from "../lib/types";
import Fields from "./Fields";
import AuthEditor from "./AuthEditor";
import Response from "./Response";
const Editor = lazy(() => import("./Editor"));
const methods = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "TRACE",
  "CONNECT",
];
const bodyTypes = [
  ["none", "None"],
  ["json", "JSON"],
  ["text", "Text"],
  ["xml", "XML"],
  ["html", "HTML"],
  ["form", "URL encoded"],
  ["multipart", "Form data"],
  ["binary", "Binary"],
  ["graphql", "GraphQL"],
];
export default function RequestPanel({ tab }: { tab: Tab }) {
  const [section, setSection] = useState(
    tab.data.bodyType !== "none" ||
      ["POST", "PUT", "PATCH"].includes(tab.data.method)
      ? "Body"
      : "Params",
  );
  const outbound = useRef<HTMLElement>(null);
  const inbound = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tab.running) inbound.current?.scrollIntoView({ block: "start" });
  }, [tab.running]);
  const [customMethod, setCustomMethod] = useState(
    !methods.includes(tab.data.method),
  );
  function showOutbound(section?: string) {
    if (section) setSection(section);
    requestAnimationFrame(() => {
      const target = section
        ? document.getElementById(`recipe-${section}`)?.closest(".recipe-block")
        : outbound.current;
      (target ?? outbound.current)?.scrollIntoView({ block: "start" });
    });
  }
  useEffect(() => {
    const handler = (event: Event) => {
      const { id, section } = (
        event as CustomEvent<{ id: string; section: string }>
      ).detail;
      if (id === tab.node.id) showOutbound(section);
    };
    window.addEventListener("relay:configure", handler);
    return () => window.removeEventListener("relay:configure", handler);
  }, [tab.node.id]);
  const updateTab = useWorkspace((s) => s.update);
  const update = (data: Parameters<typeof updateTab>[0]) =>
    updateTab(data, tab.node.id);
  const send = useWorkspace((s) => s.send);
  const cancel = useWorkspace((s) => s.cancel);
  const save = useWorkspace((s) => s.save);
  const toast = useWorkspace((s) => s.toast);
  const envs = useWorkspace((s) => s.environments);
  const envId = useWorkspace((s) => s.environmentId);
  const d = tab.data;
  const guard = (p: Promise<unknown>) => void p.catch((e) => toast(String(e)));
  async function upload() {
    try {
      const file = await importFile(true);
      if (file) update({ upload: file.content, uploadName: file.name });
    } catch (e) {
      toast(String(e));
    }
  }
  const variables = [
    ...new Set([
      ...(envs.find((e) => e.id === envId)?.variables.map((v) => v.key) ?? []),
      ...d.variables.map((v) => v.key),
    ]),
  ];
  function changeMethod(method: string) {
    if (["POST", "PUT", "PATCH"].includes(method)) {
      update({
        method,
        ...(d.bodyType === "none"
          ? { bodyType: "json", body: d.body || "{\n  \n}" }
          : {}),
      });
      showOutbound("Body");
    } else update({ method });
  }

  function format() {
    try {
      if (d.bodyType === "json" || d.bodyType === "graphql")
        update({ body: JSON.stringify(JSON.parse(d.body), null, 2) });
      else if (["xml", "html"].includes(d.bodyType)) {
        const parsed = new DOMParser().parseFromString(
          d.body,
          "application/xml",
        );
        if (parsed.querySelector("parsererror")) throw new Error("Invalid XML");
        let indent = 0;
        update({
          body: d.body
            .replace(/>\s*</g, ">\n<")
            .split("\n")
            .map((line) => {
              if (/^<\//.test(line)) indent--;
              const out = "  ".repeat(Math.max(0, indent)) + line;
              if (
                /^<[^/!?][^>]*>$/.test(line) &&
                !line.includes("</") &&
                !line.endsWith("/>")
              )
                indent++;
              return out;
            })
            .join("\n"),
        });
      }
    } catch (e) {
      toast(String(e));
    }
  }
  const tabCount = (name: string) =>
    name === "Params"
      ? d.params.filter((v) => v.enabled && v.key).length
      : name === "Headers"
        ? d.headers.filter((v) => v.enabled && v.key).length
        : name === "Scripts"
          ? d.assertions.length
          : 0;
  const contents = () => {
    if (section === "Params")
      return (
        <>
          <p className="recipe-helper">
            Add filters, pagination, and other URL values. Disabled rows stay
            out of the request.
          </p>
          <Fields rows={d.params} onChange={(params) => update({ params })} />
        </>
      );
    if (section === "Headers")
      return (
        <>
          <p className="recipe-helper">
            Set additional headers. Relay handles Content-Type for your selected
            payload.
          </p>
          <Fields
            rows={d.headers}
            onChange={(headers) => update({ headers })}
          />
        </>
      );
    if (section === "Authorization")
      return (
        <AuthEditor
          auth={d.auth}
          onChange={(auth) => update({ auth })}
          credentialId={tab.node.id}
        />
      );
    if (section === "Body")
      return (
        <div className="body-pane">
          <div className="body-toolbar">
            <select
              aria-label="Body type"
              value={d.bodyType}
              onChange={(e) => update({ bodyType: e.target.value })}
            >
              {bodyTypes.map(([v, l]) => (
                <option value={v} key={v}>
                  {l}
                </option>
              ))}
            </select>
            {["json", "graphql", "xml", "html"].includes(d.bodyType) && (
              <button className="text-button" onClick={format}>
                <WandSparkles size={13} /> Format
              </button>
            )}
            {["binary", "multipart"].includes(d.bodyType) && (
              <button className="text-button" onClick={() => void upload()}>
                <FileUp size={14} />
                {d.uploadName ?? "Choose file · max 16 MiB"}
              </button>
            )}
          </div>
          {d.bodyType === "none" ? (
            <div className="body-empty">
              <Code2 size={21} />
              <p>This request has no body.</p>
              <button
                className="text-button"
                onClick={() => update({ bodyType: "json", body: "{\n  \n}" })}
              >
                Add a JSON body <ArrowUpRight size={12} />
              </button>
            </div>
          ) : ["form", "multipart"].includes(d.bodyType) ? (
            <Fields rows={d.fields} onChange={(fields) => update({ fields })} />
          ) : d.bodyType === "binary" ? (
            <p className="hint pad">
              The selected file is sent as the request body. Its contents are
              retained when you save this request; portable exports exclude
              attachments.
            </p>
          ) : (
            <Suspense fallback={<p className="hint pad">Loading editor…</p>}>
              <Editor
                value={d.body}
                onChange={(body) => update({ body })}
                language={d.bodyType}
                variables={variables}
              />
            </Suspense>
          )}
        </div>
      );
    if (section === "Scripts")
      return (
        <div className="scripts-pane">
          <div className="section-intro">
            <Code2 size={17} />
            <div>
              <h3>Checks & workflows</h3>
              <p>
                Declarative rules run in a worker. Imported JavaScript is never
                executed.
              </p>
            </div>
          </div>
          <h4>Response assertions</h4>
          {d.assertions.map((a, i) => (
            <div className="assertion-row" key={a.id}>
              <select
                aria-label={`Assertion type ${i + 1}`}
                value={a.type}
                onChange={(e) =>
                  update({
                    assertions: d.assertions.map((v, j) =>
                      j === i
                        ? { ...v, type: e.target.value as typeof a.type }
                        : v,
                    ),
                  })
                }
              >
                {[
                  ["status", "Status equals"],
                  ["time", "Time ≤ (ms)"],
                  ["header", "Header equals"],
                  ["json", "JSON value equals"],
                  ["contains", "Body contains"],
                  ["schema", "JSON schema"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              {["header", "json"].includes(a.type) && (
                <input
                  aria-label={`Assertion path ${i + 1}`}
                  placeholder={a.type === "json" ? "$.data.id" : "Content-Type"}
                  value={a.path}
                  onChange={(e) =>
                    update({
                      assertions: d.assertions.map((v, j) =>
                        j === i ? { ...v, path: e.target.value } : v,
                      ),
                    })
                  }
                />
              )}
              <input
                aria-label={`Expected value ${i + 1}`}
                placeholder={
                  a.type === "schema"
                    ? "JSON Schema (draft 7)"
                    : "Expected value"
                }
                value={a.expected}
                onChange={(e) =>
                  update({
                    assertions: d.assertions.map((v, j) =>
                      j === i ? { ...v, expected: e.target.value } : v,
                    ),
                  })
                }
              />
              <button
                className="icon-button"
                aria-label={`Remove assertion ${i + 1}`}
                onClick={() =>
                  update({ assertions: d.assertions.filter((_, j) => j !== i) })
                }
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <button
            className="text-button"
            onClick={() =>
              update({
                assertions: [
                  ...d.assertions,
                  { id: id(), type: "status", path: "", expected: "200" },
                ],
              })
            }
          >
            <Plus size={13} /> Add assertion
          </button>
          <h4>Extract response variables</h4>
          <p className="hint">
            Store JSON values in the active environment for chained requests.
          </p>
          {d.extractions.map((a, i) => (
            <div className="assertion-row" key={i}>
              <input
                placeholder="response.body.token"
                aria-label={`Extraction path ${i + 1}`}
                value={a.path}
                onChange={(e) =>
                  update({
                    extractions: d.extractions.map((v, j) =>
                      j === i ? { ...v, path: e.target.value } : v,
                    ),
                  })
                }
              />
              <input
                placeholder="accessToken"
                aria-label={`Extraction variable ${i + 1}`}
                value={a.variable}
                onChange={(e) =>
                  update({
                    extractions: d.extractions.map((v, j) =>
                      j === i ? { ...v, variable: e.target.value } : v,
                    ),
                  })
                }
              />
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={a.secret}
                  onChange={(e) =>
                    update({
                      extractions: d.extractions.map((v, j) =>
                        j === i ? { ...v, secret: e.target.checked } : v,
                      ),
                    })
                  }
                />{" "}
                Keychain
              </label>
              <button
                className="icon-button"
                aria-label="Remove extraction"
                onClick={() =>
                  update({
                    extractions: d.extractions.filter((_, j) => j !== i),
                  })
                }
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <button
            className="text-button"
            onClick={() =>
              update({
                extractions: [
                  ...d.extractions,
                  {
                    path: "response.body.token",
                    variable: "accessToken",
                    secret: true,
                  },
                ],
              })
            }
          >
            <Plus size={13} /> Add extraction
          </button>
          <h4>Pre-request variables</h4>
          <Fields
            rows={d.variables}
            onChange={(variables) => update({ variables })}
          />
        </div>
      );
    return (
      <div className="settings-pane">
        <label className="form-field">
          <span>Request description</span>
          <textarea
            value={d.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="What does this endpoint do?"
          />
        </label>
        <label className="form-field">
          <span>Timeout (ms)</span>
          <input
            type="number"
            min={100}
            max={300000}
            value={d.timeoutMs}
            onChange={(e) => update({ timeoutMs: Number(e.target.value) })}
          />
        </label>
        <label className="form-field">
          <span>Maximum response (MiB)</span>
          <input
            type="number"
            min={1}
            max={32}
            value={d.maxResponseBytes / 1024 / 1024}
            onChange={(e) =>
              update({ maxResponseBytes: Number(e.target.value) * 1024 * 1024 })
            }
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={d.followRedirects}
            onChange={(e) => update({ followRedirects: e.target.checked })}
          />{" "}
          Follow same-origin redirects (maximum 10)
        </label>
        <p className="hint">
          TLS certificate validation is always enabled. Cross-origin redirects
          are returned for inspection. Cookies can be sent using a Cookie
          header.
        </p>
      </div>
    );
  };
  return (
    <div className="request-workspace">
      <div className="request-title">
        <div>
          <span className="breadcrumb">
            <span className="request-eyebrow">REQUEST</span> /{" "}
            {useWorkspace(
              (s) => s.projects.find((p) => p.id === tab.node.projectId)?.name,
            ) ?? "Workspace"}{" "}
            <ChevronDown size={10} />
          </span>
          <h2>
            {tab.node.name}
            {tab.dirty && (
              <span className="unsaved-dot" title="Unsaved changes" />
            )}
          </h2>
        </div>
        <div>
          <button
            className="text-button"
            title="Copy cURL command"
            onClick={() => {
              try {
                guard(
                  navigator.clipboard
                    .writeText(curl(d))
                    .then(() =>
                      toast(
                        "cURL copied. Review inline credentials before sharing.",
                      ),
                    ),
                );
              } catch (e) {
                toast(String(e));
              }
            }}
          >
            <Code2 size={14} /> cURL
          </button>
          <button className="secondary-button" onClick={() => guard(save())}>
            <Save size={13} /> Save
          </button>
          <button
            className="icon-button"
            title="Save as new request"
            onClick={() => guard(save(true))}
          >
            <ChevronDown size={13} />
          </button>
        </div>
      </div>
      <div className="request-composer">
        <form
          className="url-bar"
          onSubmit={(e) => {
            e.preventDefault();
            guard(send());
          }}
        >
          <div className="method-select">
            <select
              aria-label="HTTP method"
              value={customMethod ? "custom" : d.method}
              className={`method-${d.method.toLowerCase()}`}
              onChange={(e) => {
                const custom = e.target.value === "custom";
                setCustomMethod(custom);
                if (!custom) changeMethod(e.target.value);
              }}
            >
              {methods.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
            {customMethod && (
              <input
                aria-label="Custom HTTP method"
                value={d.method}
                maxLength={32}
                pattern="[!#$%&'*+.^_`|~0-9A-Za-z-]+"
                onChange={(e) => changeMethod(e.target.value.toUpperCase())}
                spellCheck={false}
              />
            )}
          </div>
          <input
            className="url-input"
            aria-label="Request URL"
            placeholder="Paste a URL, {{variable}}, or cURL command"
            onPaste={(event) => {
              const text = event.clipboardData.getData("text").trim();
              if (!text.startsWith("curl ")) return;
              event.preventDefault();
              try {
                const imported = importCurl(text);
                update(imported);
                setCustomMethod(!methods.includes(imported.method));
                showOutbound(imported.bodyType === "none" ? "Params" : "Body");
                toast(
                  "cURL unpacked into this request. Review and send when ready.",
                );
              } catch (error) {
                toast(String(error));
              }
            }}
            value={d.url}
            onChange={(e) => update({ url: e.target.value })}
            spellCheck={false}
          />
          <button
            className={`send-button ${tab.running ? "cancel" : ""}`}
            type={tab.running ? "button" : "submit"}
            onClick={tab.running ? () => guard(cancel()) : undefined}
          >
            {tab.running ? (
              <>
                <Square size={12} /> Cancel
              </>
            ) : (
              <>
                Send <MoveUpRight size={15} />
              </>
            )}
          </button>
        </form>
        <div className="request-quick-actions">
          <button
            type="button"
            className="text-button"
            onClick={() => {
              if (d.bodyType === "none")
                update({ bodyType: "json", body: d.body || "{\n  \n}" });
              showOutbound("Body");
            }}
          >
            <Code2 size={14} />
            {d.bodyType === "none"
              ? "Add body"
              : `Edit body · ${bodyTypes.find(([value]) => value === d.bodyType)?.[1] ?? d.bodyType}`}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => showOutbound()}
          >
            Configure outbound <ChevronDown size={13} />
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => inbound.current?.scrollIntoView({ block: "start" })}
          >
            View response <ArrowUpRight size={13} />
          </button>
        </div>
      </div>
      <div className="exchange-grid response-first-layout">
        <div className="inbound-workspace" ref={inbound}>
          <Response tab={tab} />
        </div>
        <section
          ref={outbound}
          className="request-dock"
          aria-label="Request configuration"
        >
          <div className="dock-heading">
            <span className="dock-number">01</span>
            <span>OUTBOUND</span>
            <span className="dock-detail">Request configuration</span>
          </div>
          <div className="request-recipe">
            {[
              {
                id: "Params",
                title: "Query",
                hint: "Filters & URL values",
                summary: d.params.filter((p) => p.enabled && p.key).length
                  ? `${d.params.filter((p) => p.enabled && p.key).length} active`
                  : "None",
              },
              {
                id: "Authorization",
                title: "Identity",
                hint: "How this API knows you",
                summary:
                  d.auth.type === "inherit"
                    ? "From parent"
                    : d.auth.type === "none"
                      ? "Public"
                      : d.auth.type === "oauth2"
                        ? "OAuth 2.0"
                        : d.auth.type === "apiKey"
                          ? "API key"
                          : d.auth.type,
              },
              {
                id: "Headers",
                title: "Headers",
                hint: "Extra request context",
                summary: d.headers.filter((p) => p.enabled && p.key).length
                  ? `${d.headers.filter((p) => p.enabled && p.key).length} active`
                  : "Automatic",
              },
              {
                id: "Body",
                title: "Body",
                hint: "JSON, forms, files & more",
                summary:
                  bodyTypes.find(([value]) => value === d.bodyType)?.[1] ??
                  "None",
              },
              {
                id: "Scripts",
                title: "Checks & capture",
                hint: "Verify. Extract. Reuse.",
                summary:
                  tabCount("Scripts") || d.extractions.length
                    ? `${d.assertions.length} checks · ${d.extractions.length} captures`
                    : "Not configured",
              },
              {
                id: "Settings",
                title: "Delivery",
                hint: "Timeouts & request behavior",
                summary: `${d.timeoutMs / 1000}s timeout`,
              },
            ].map((step, i) => (
              <section
                className={`recipe-block ${section === step.id ? "expanded" : ""}`}
                key={step.id}
              >
                <button
                  className="recipe-trigger"
                  aria-label={step.title}
                  aria-describedby={`recipe-summary-${step.id}`}
                  aria-expanded={section === step.id}
                  aria-controls={`recipe-${step.id}`}
                  onClick={() => setSection(section === step.id ? "" : step.id)}
                >
                  <span className="recipe-step">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="recipe-label">
                    <strong>{step.title}</strong>
                    <small>{step.hint}</small>
                  </span>
                  <span
                    className="recipe-summary"
                    id={`recipe-summary-${step.id}`}
                  >
                    {step.summary}
                  </span>
                  <ChevronDown
                    size={13}
                    className={section === step.id ? "recipe-open" : ""}
                  />
                </button>
                {section === step.id && (
                  <div
                    className="request-content recipe-content"
                    id={`recipe-${step.id}`}
                  >
                    {contents()}
                  </div>
                )}
              </section>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
