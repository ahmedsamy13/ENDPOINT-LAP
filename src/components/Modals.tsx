import { confirmAction } from "../lib/interactions";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  Command,
  FileDown,
  FileUp,
  Globe2,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  call,
  exportFile,
  importFile,
  native,
  secretReference,
} from "../lib/bridge";
import { useWorkspace } from "../lib/store";
import { importDocument, portable, type Imported } from "../lib/importers";
import {
  defaultAuth,
  id,
  type Environment,
  type Node,
  type Pair,
  type ScopeData,
} from "../lib/types";
import Fields from "./Fields";
import AuthEditor from "./AuthEditor";
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
async function secureRows(rows: Pair[], prefix: string) {
  const out: Pair[] = [];
  for (const row of rows) {
    if (!row.key) continue;
    if (row.secret && row.value && !row.value.startsWith("{{secret:"))
      out.push({
        ...row,
        value: await secretReference(`${prefix}:${row.key}`, row.value),
      });
    else out.push(row);
  }
  return out;
}
export function EnvironmentsModal({ onClose }: { onClose: () => void }) {
  const environments = useWorkspace((s) => s.environments);
  const envId = useWorkspace((s) => s.environmentId);
  const projectId = useWorkspace((s) => s.projectId);
  const toast = useWorkspace((s) => s.toast);
  const [selected, setSelected] = useState(envId || environments[0]?.id || "");
  const [draft, setDraft] = useState<Environment | undefined>(
    environments.find((e) => e.id === selected),
  );
  const [busy, setBusy] = useState(false);
  const select = async (id: string) => {
    if (
      draft &&
      JSON.stringify(draft) !==
        JSON.stringify(environments.find((e) => e.id === selected)) &&
      !(await confirmAction(
        "You have unsaved environment changes.",
        "Switch environment?",
        "Discard changes",
      ))
    )
      return;
    setSelected(id);
    setDraft(environments.find((e) => e.id === id));
  };
  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      if (!draft.name.trim()) throw new Error("Name is required");
      const variables = await secureRows(draft.variables, draft.id);
      await useWorkspace.getState().saveEnvironment({ ...draft, variables });
      setDraft({ ...draft, variables });
      useWorkspace.getState().setEnvironment(draft.id);
      toast("Environment saved locally");
    } catch (e) {
      toast(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Environments" onClose={onClose} wide>
      <div className="environment-layout">
        <div className="environment-list">
          {environments
            .filter((e) => !e.projectId || e.projectId === projectId)
            .map((e) => (
              <button
                key={e.id}
                className={e.id === selected ? "active" : ""}
                onClick={() => select(e.id)}
              >
                <Globe2 size={14} />
                <span>{e.name}</span>
                {!e.projectId && <small>Global</small>}
              </button>
            ))}
          <button
            className="text-button"
            onClick={() => {
              const env = {
                id: id(),
                projectId,
                name: "Development",
                variables: [],
              };
              setSelected(env.id);
              setDraft(env);
            }}
          >
            <Plus size={14} /> New environment
          </button>
        </div>
        <div className="environment-detail">
          {draft ? (
            <>
              <label className="form-field">
                <span>Environment name</span>
                <input
                  aria-label="Environment name"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={!draft.projectId}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      projectId: e.target.checked ? null : projectId,
                    })
                  }
                />{" "}
                Available across projects
              </label>
              <p className="hint">
                A global environment named “Globals” supplies baseline variables
                automatically. Precedence: Globals → project → collection →
                folder → active environment → request.
              </p>
              <Fields
                rows={draft.variables}
                secrets
                keys="Variable"
                onChange={(variables) => setDraft({ ...draft, variables })}
              />
              <p className="hint">
                <ShieldCheck size={13} /> Mark secrets with the lock icon.
                Saving moves secret values into the OS keychain; they are never
                returned to the editor.
              </p>
              <div className="modal-actions">
                <button
                  className="text-button danger-text"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await confirmAction(
                        "Requests using these variables will need another environment.",
                        "Delete environment?",
                        "Delete environment",
                      )
                    )
                      void call("delete_environment", { id: draft.id })
                        .then(() => useWorkspace.getState().refresh())
                        .then(() => {
                          setDraft(undefined);
                          setSelected("");
                        })
                        .catch((e) => toast(String(e)));
                  }}
                >
                  <Trash2 size={13} /> Delete
                </button>
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => void save()}
                >
                  {busy ? "Saving…" : "Save & activate"}
                </button>
              </div>
            </>
          ) : (
            <div className="hint pad">Choose or create an environment.</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
export function ScopeModal({
  node,
  onClose,
}: {
  node: Node;
  onClose: () => void;
}) {
  const [data, setData] = useState<ScopeData>({});
  const [tab, setTab] = useState("Variables");
  const toast = useWorkspace((s) => s.toast);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    void call<Node>("get_node", { id: node.id })
      .then((n) => {
        setData((n.data ?? {}) as ScopeData);
        setLoaded(true);
      })
      .catch((e) => toast(String(e)));
  }, [node.id, toast]);
  return (
    <Modal title={`${node.name} · Configuration`} onClose={onClose} wide>
      <div className="modal-tabs">
        {["Variables", "Authentication"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="modal-body">
        {tab === "Variables" ? (
          <>
            <p className="hint">
              Inherited by all requests below this {node.kind}. More specific
              scopes take precedence.
            </p>
            <Fields
              rows={data.variables ?? []}
              secrets
              onChange={(variables) => setData({ ...data, variables })}
            />
          </>
        ) : (
          <AuthEditor
            auth={data.auth ?? defaultAuth()}
            onChange={(auth) => setData({ ...data, auth })}
            credentialId={node.id}
          />
        )}
      </div>
      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary-button"
          disabled={!loaded}
          onClick={() =>
            void secureRows(data.variables ?? [], node.id)
              .then((variables) =>
                useWorkspace
                  .getState()
                  .mutate({ ...node, data: { ...data, variables } }),
              )
              .then(() => {
                toast("Configuration saved");
                onClose();
              })
              .catch((e) => toast(String(e)))
          }
        >
          Save configuration
        </button>
      </div>
    </Modal>
  );
}
export function TransferModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<Imported>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useWorkspace((s) => s.toast);
  const projectId = useWorkspace((s) => s.projectId);
  async function inspect() {
    setError("");
    try {
      setParsed(await importDocument(text, projectId));
    } catch (e) {
      setError(String(e));
    }
  }
  async function apply() {
    if (!parsed) return;
    setBusy(true);
    try {
      await call("import_workspace", {
        nodes: parsed.nodes,
        environments: parsed.environments,
      });
      await useWorkspace.getState().refresh();
      toast(
        `Imported ${parsed.nodes.length} items and ${parsed.environments.length} environments`,
      );
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function backup() {
    try {
      const nodes: Node[] = [];
      for (const project of useWorkspace.getState().projects) {
        const metadata = await call<Node[]>("list_nodes", {
          project: project.id,
        });
        for (const n of metadata)
          nodes.push(await call<Node>("get_node", { id: n.id }));
      }
      const content = portable(nodes, useWorkspace.getState().environments);
      await exportFile("endpoint-workspace.json", content);
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <Modal title="Import & export" onClose={onClose} wide>
      <div className="modal-body">
        <p className="hint">
          Import Postman collections/environments, OpenAPI 3 JSON/YAML, cURL, or
          an Endpoint backup. Imports are local and transactional. Imported
          scripts are never executed.
        </p>
        <div className="transfer-actions">
          <button
            className="secondary-button"
            onClick={() =>
              void importFile()
                .then((file) => {
                  if (file) {
                    setText(file.content);
                    setParsed(undefined);
                  }
                })
                .catch((e) => setError(String(e)))
            }
          >
            <FileUp size={14} /> Open file
          </button>
          <button className="secondary-button" onClick={() => void backup()}>
            <FileDown size={14} /> Export workspace
          </button>
        </div>
        <textarea
          className="import-text"
          aria-label="Import content"
          placeholder="Paste a collection, OpenAPI document, or cURL command…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setParsed(undefined);
          }}
        />
        <p className="hint">
          Exports omit attachments, keychain values, and recognized credential
          fields. Review request bodies and custom headers before sharing; these
          can contain sensitive data. Imports with inline credentials persist in
          SQLite until you move them to the keychain.
        </p>
        {parsed && (
          <div className="import-summary">
            <Check size={16} />
            <strong>
              {parsed.nodes.length} items · {parsed.environments.length}{" "}
              environments
            </strong>
            {parsed.warnings.map((w, i) => (
              <p className="hint" key={i}>
                {w}
              </p>
            ))}
          </div>
        )}
        {error && <div className="error-banner">{error}</div>}
      </div>
      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose}>
          Cancel
        </button>
        {parsed ? (
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => void apply()}
          >
            {busy ? "Importing…" : "Import into workspace"}
          </button>
        ) : (
          <button
            className="primary-button"
            disabled={!text.trim()}
            onClick={() => void inspect()}
          >
            Review import
          </button>
        )}
      </div>
    </Modal>
  );
}
export function CommandPalette({
  onClose,
  onAction,
}: {
  onClose: () => void;
  onAction: (action: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Node[]>([]);
  const [index, setIndex] = useState(0);
  const nodes = useWorkspace((s) => s.nodes);
  const toast = useWorkspace((s) => s.toast);
  const actions = [
    { name: "New request", key: "new" },
    { name: "Manage environments", key: "environments" },
    { name: "Import or export workspace", key: "transfer" },
    { name: "Request history", key: "history" },
    { name: "Application settings", key: "settings" },
  ].filter((a) => a.name.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => {
    let live = true;
    setIndex(0);
    if (!native) {
      setResults(
        nodes
          .filter(
            (n) =>
              n.kind === "request" &&
              n.name.toLowerCase().includes(query.toLowerCase()),
          )
          .slice(0, 30),
      );
      return;
    }
    const timer = setTimeout(() => {
      void call<Node[]>("search_nodes", { query })
        .then((r) => {
          if (live) setResults(r);
        })
        .catch((e) => toast(String(e)));
    }, 120);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, nodes, toast]);
  const run = (i: number) => {
    if (i < actions.length) {
      onClose();
      onAction(actions[i].key);
    } else {
      const node = results[i - actions.length];
      if (node)
        void useWorkspace
          .getState()
          .selectProject(node.projectId)
          .then(() => useWorkspace.getState().open(node))
          .then(onClose)
          .catch((e) => toast(String(e)));
    }
  };
  return (
    <Modal title="Command palette" onClose={onClose}>
      <div className="command-search">
        <Search size={18} />
        <input
          autoFocus
          aria-label="Search commands and requests"
          placeholder="Search requests or type a command…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex(
                Math.min(actions.length + results.length - 1, index + 1),
              );
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex(Math.max(0, index - 1));
            }
            if (e.key === "Enter") run(index);
          }}
        />
        <kbd>esc</kbd>
      </div>
      <div className="command-results">
        {actions.map((a, i) => (
          <button
            className={index === i ? "active" : ""}
            onClick={() => run(i)}
            key={a.key}
          >
            <Command size={14} />
            {a.name}
            <span>Command</span>
          </button>
        ))}
        {results.map((n, i) => (
          <button
            className={index === i + actions.length ? "active" : ""}
            key={n.id}
            onClick={() => run(i + actions.length)}
          >
            <span className={`method-tag method-${n.method?.toLowerCase()}`}>
              {n.method}
            </span>
            {n.name}
            <span>Request</span>
          </button>
        ))}
      </div>
      <div className="command-footer">
        <kbd>↑</kbd>
        <kbd>↓</kbd> navigate <kbd>↵</kbd> open
      </div>
    </Modal>
  );
}
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [limit, setLimit] = useState(500);
  const toast = useWorkspace((s) => s.toast);
  useEffect(() => {
    if (native)
      void call<number | null>("get_setting", { key: "historyLimit" })
        .then((v) => setLimit(v ?? 500))
        .catch((e) => toast(String(e)));
  }, [toast]);
  return (
    <Modal title="Application settings" onClose={onClose}>
      <div className="modal-body">
        <div className="section-intro">
          <ShieldCheck size={20} />
          <div>
            <h3>Your APIs. A clear signal.</h3>
            <p>No account, telemetry, hosted backend, or background service.</p>
          </div>
        </div>
        <label className="form-field">
          <span>History retention (0–10,000 entries)</span>
          <input
            aria-label="History retention"
            type="number"
            min={0}
            max={10000}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          />
        </label>
        <p className="hint">
          History stores response metadata only. Query strings are redacted;
          response bodies and credentials are not saved in history.
        </p>
        <h4>Keyboard shortcuts</h4>
        <div className="shortcut-list">
          {[
            ["Command palette", "Ctrl / ⌘ K"],
            ["Send request", "Ctrl / ⌘ Enter"],
            ["Save request", "Ctrl / ⌘ S"],
            ["New request", "Ctrl / ⌘ N"],
            ["Close tab", "Ctrl / ⌘ W"],
            ["Search editor", "Ctrl / ⌘ F"],
          ].map(([l, k]) => (
            <div key={l}>
              <span>{l}</span>
              <kbd>{k}</kbd>
            </div>
          ))}
        </div>
        <p className="hint">
          Relay 0.1.0 · Tauri 2 · Rust native networking · SQLite WAL
          <br />
          Keychain credentials require an unlocked OS credential service. On
          Linux, install and unlock a Secret Service provider such as GNOME
          Keyring.
        </p>
      </div>
      <div className="modal-actions">
        <button
          className="primary-button"
          onClick={() =>
            void call("save_setting", {
              key: "historyLimit",
              value: Math.max(0, Math.min(10000, limit)),
            })
              .then(() => {
                toast("Settings saved");
                onClose();
              })
              .catch((e) => toast(String(e)))
          }
        >
          Save settings
        </button>
      </div>
    </Modal>
  );
}
