import { confirmAction } from "./lib/interactions";
import InteractionDialog from "./components/InteractionDialog";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  PanelLeft,
  ArrowUpRight,
  Activity,
  ArrowDownToLine,
  Circle,
  Command,
  Globe2,
  History as HistoryIcon,
  Layers,
  Plus,
  Search,
  Settings2,
  Shield,
  Star,
  X,
} from "lucide-react";
import { call, native } from "./lib/bridge";
import { useWorkspace } from "./lib/store";
import type { Node } from "./lib/types";
import Sidebar from "./components/Sidebar";
import {
  CommandPalette,
  EnvironmentsModal,
  Modal,
  ScopeModal,
  SettingsModal,
  TransferModal,
} from "./components/Modals";
const RequestPanel = lazy(() => import("./components/RequestPanel"));
export default function App() {
  const [libraryOpen, setLibraryOpen] = useState(
    () => localStorage.getItem("relay.libraryOpen") !== "false",
  );
  const [modal, setModal] = useState("");
  const [scope, setScope] = useState<Node>();
  const [view, setView] = useState("collections");
  const [width, setWidth] = useState(
    () => Number(localStorage.getItem("endpoint.sidebarWidth")) || 260,
  );
  const ready = useWorkspace((s) => s.ready);
  const tabs = useWorkspace((s) => s.tabs);
  const activeId = useWorkspace((s) => s.activeId);
  const environments = useWorkspace((s) => s.environments);
  const envId = useWorkspace((s) => s.environmentId);
  const projectId = useWorkspace((s) => s.projectId);
  const message = useWorkspace((s) => s.message);
  const toast = useWorkspace((s) => s.toast);
  const history = useWorkspace((s) => s.history);
  const runner = useWorkspace((s) => s.runner);
  const runnerBusy = useWorkspace((s) => s.runnerBusy);
  const tab = tabs.find((t) => t.node.id === activeId);
  const guard = (p: Promise<unknown>) => void p.catch((e) => toast(String(e)));
  useEffect(() => {
    void useWorkspace.getState().initialize();
  }, []);
  useEffect(() => {
    if (!native) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void import("@tauri-apps/api/window")
      .then(async ({ getCurrentWindow }) => {
        const cleanup = await getCurrentWindow().onCloseRequested((event) => {
          if (useWorkspace.getState().tabs.some((t) => t.dirty)) {
            event.preventDefault();
            setModal("close-confirm");
          }
        });
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch((e) => toast(String(e)));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [toast]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => toast(""), 6500);
    return () => clearTimeout(timer);
  }, [message, toast]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (document.querySelector("dialog[open]")) return;
      const state = useWorkspace.getState();
      if (e.key === "k") {
        e.preventDefault();
        setModal((m) => (m === "palette" ? "" : "palette"));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        void state.send();
      }
      if (e.key === "s") {
        e.preventDefault();
        void state.save(e.shiftKey).catch((e) => state.toast(String(e)));
      }
      if (e.key === "n") {
        e.preventDefault();
        state.newTab();
      }
      if (e.key === "w") {
        e.preventDefault();
        state.close(state.activeId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (useWorkspace.getState().tabs.some((t) => t.dirty)) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
  function action(action: string) {
    if (action === "new") useWorkspace.getState().newTab();
    else if (action === "history") {
      setLibraryOpen(true);
      setView("history");
      guard(useWorkspace.getState().loadHistory());
    } else setModal(action);
  }
  function resize(e: React.PointerEvent) {
    const x = e.clientX,
      start = width;
    e.currentTarget.setPointerCapture(e.pointerId);
    const target = e.currentTarget;
    const move = (ev: PointerEvent) =>
      setWidth(Math.min(420, Math.max(210, start + ev.clientX - x)));
    const stop = () => {
      target.removeEventListener("pointermove", move as EventListener);
      setWidth((w) => {
        localStorage.setItem("endpoint.sidebarWidth", String(w));
        return w;
      });
    };
    target.addEventListener("pointermove", move as EventListener);
    target.addEventListener("pointerup", stop, { once: true });
  }
  return (
    <div className="application">
      <header className="titlebar">
        <div className="brand" aria-label="Relay API client">
          <div className="brand-symbol" aria-hidden="true">
            <i />
            <i />
            <b />
          </div>
          <strong>relay</strong>
          <span className="brand-edition">API STUDIO</span>
        </div>
        <nav className="workspace-navigation" aria-label="Workspace navigation">
          <button
            aria-label="Collections"
            className={view === "collections" ? "active" : ""}
            onClick={() => {
              setView("collections");
              setLibraryOpen(true);
            }}
          >
            <Layers size={14} /> Workspace
          </button>
          <button
            aria-label="Favorites"
            className={view === "favorites" ? "active" : ""}
            onClick={() => {
              setView("favorites");
              setLibraryOpen(true);
            }}
          >
            <Star size={14} /> Starred
          </button>
          <button
            aria-label="History"
            className={view === "history" ? "active" : ""}
            onClick={() => {
              setView("history");
              setLibraryOpen(true);
              guard(useWorkspace.getState().loadHistory());
            }}
          >
            <HistoryIcon size={14} /> Activity
          </button>
        </nav>
        <div className="titlebar-tools">
          <button
            className="search-trigger"
            aria-label="Search commands and requests"
            title="Command palette (Ctrl / ⌘ K)"
            onClick={() => setModal("palette")}
          >
            <Search size={15} />
            <span>Find anything</span>
            <kbd>⌘ K</kbd>
          </button>
          <span className="tool-divider" />
          <button
            className="icon-button"
            title="Import and export"
            aria-label="Import and export"
            onClick={() => setModal("transfer")}
          >
            <ArrowDownToLine size={17} />
          </button>
          <button
            className="icon-button"
            title="Settings"
            aria-label="Settings"
            onClick={() => setModal("settings")}
          >
            <Settings2 size={17} />
          </button>
        </div>
      </header>
      <div className="application-body">
        {libraryOpen && (
          <>
            <div className="sidebar-container" style={{ width }}>
              {view === "history" ? (
                <aside className="sidebar history-sidebar">
                  <div className="library-eyebrow">
                    <span>YOUR LIBRARY</span>
                    <span>LOCAL</span>
                  </div>
                  <div className="sidebar-section-heading">
                    <span>Request activity</span>
                    <button
                      className="text-button"
                      onClick={async () => {
                        if (
                          await confirmAction(
                            "Saved requests are kept. Only the activity log will be cleared.",
                            "Clear activity?",
                            "Clear activity",
                          )
                        )
                          guard(
                            call("clear_history").then(() =>
                              useWorkspace.getState().loadHistory(),
                            ),
                          );
                      }}
                    >
                      Clear
                    </button>
                  </div>
                  <p className="hint pad">Recent requests · metadata only</p>
                  <div className="history-list">
                    {history.map((h) => (
                      <button
                        key={h.id}
                        onClick={() =>
                          guard(
                            call<Node>("get_node", { id: h.requestId }).then(
                              (n) => useWorkspace.getState().open(n),
                            ),
                          )
                        }
                      >
                        <div>
                          <span
                            className={`method-tag method-${h.method.toLowerCase()}`}
                          >
                            {h.method}
                          </span>
                          <strong>{h.name}</strong>
                          <span
                            className={
                              h.status < 400 ? "success-text" : "danger-text"
                            }
                          >
                            {h.status}
                          </span>
                        </div>
                        <p>{h.url}</p>
                        <small>
                          {new Date(h.createdAt * 1000).toLocaleString()} ·{" "}
                          {h.duration} ms
                        </small>
                      </button>
                    ))}
                    {!history.length && (
                      <div className="sidebar-empty">
                        <HistoryIcon size={23} />
                        <p>Your requests will appear here.</p>
                      </div>
                    )}
                  </div>
                </aside>
              ) : (
                <Sidebar
                  favorites={view === "favorites"}
                  onScope={setScope}
                  onRunner={() => setModal("runner")}
                />
              )}
            </div>
            <div
              role="separator"
              aria-label="Resize sidebar"
              aria-orientation="vertical"
              tabIndex={0}
              className="vertical-resizer"
              onPointerDown={resize}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") setWidth(Math.max(210, width - 10));
                if (e.key === "ArrowRight") setWidth(Math.min(420, width + 10));
              }}
            />
          </>
        )}
        <main className="main-area">
          <div className="studio-toolbar">
            <div className="studio-title">
              <button
                className="icon-button"
                aria-label={libraryOpen ? "Hide library" : "Show library"}
                aria-expanded={libraryOpen}
                title={libraryOpen ? "Hide library" : "Show library"}
                onClick={() =>
                  setLibraryOpen((open) => {
                    localStorage.setItem("relay.libraryOpen", String(!open));
                    return !open;
                  })
                }
              >
                <PanelLeft size={16} />
              </button>
              <span>Workbench</span>
              <span className="studio-slash">/</span>
              <span className="studio-project">
                {useWorkspace(
                  (s) => s.projects.find((p) => p.id === projectId)?.name,
                ) ?? "Personal workspace"}
              </span>
            </div>
            <div className="environment-control">
              <span className="environment-dot" />
              <select
                aria-label="Active environment"
                value={envId}
                onChange={(e) =>
                  useWorkspace.getState().setEnvironment(e.target.value)
                }
              >
                <option value="">No environment</option>
                {environments
                  .filter((e) => !e.projectId || e.projectId === projectId)
                  .map((e) => (
                    <option value={e.id} key={e.id}>
                      {e.name}
                    </option>
                  ))}
              </select>
              <button
                className="icon-button"
                title="Edit environments"
                aria-label="Edit environments"
                onClick={() => setModal("environments")}
              >
                <Settings2 size={12} />
              </button>
            </div>
          </div>
          <div className="tabbar">
            <span className="session-label">SESSIONS</span>
            <div className="open-tabs">
              {tabs.map((t) => (
                <div
                  key={t.node.id}
                  className={`request-tab ${activeId === t.node.id ? "active" : ""}`}
                >
                  <button
                    title={t.node.name}
                    onClick={() =>
                      useWorkspace.setState({ activeId: t.node.id })
                    }
                  >
                    <span
                      className={`method-tag method-${t.data.method.toLowerCase()}`}
                    >
                      {t.data.method}
                    </span>
                    <span>{t.node.name}</span>
                    {t.dirty && <span className="tab-dirty" />}
                  </button>
                  <button
                    aria-label={`Close ${t.node.name}`}
                    className="tab-close"
                    onClick={() => useWorkspace.getState().close(t.node.id)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button
                className="new-tab"
                title="New request (Ctrl / ⌘ N)"
                aria-label="New request tab"
                onClick={() => useWorkspace.getState().newTab()}
              >
                <Plus size={15} />
              </button>
            </div>
            <button
              className="text-button session-command"
              onClick={() => setModal("palette")}
            >
              <Command size={12} />
              <span>Commands</span>
            </button>
          </div>
          {!ready ? (
            <div className="welcome">
              <span className="spinner" />
              <p>Opening your workspace…</p>
            </div>
          ) : tab ? (
            <Suspense
              fallback={
                <div className="welcome">
                  <span className="spinner" />
                </div>
              }
            >
              <RequestPanel key={tab.node.id} tab={tab} />
            </Suspense>
          ) : (
            <div className="welcome">
              <div className="welcome-topline">
                <span className="eyebrow">
                  <span /> YOUR PERSONAL API STUDIO
                </span>
                <span className="welcome-index">RELAY / 001</span>
              </div>
              <div className="welcome-hero">
                <div className="welcome-copy">
                  <h1>
                    Every endpoint.
                    <br />
                    <em>A clear signal.</em>
                  </h1>
                  <p>
                    A quiet place to build, test, and understand your APIs.
                    <br />
                    Everything on your machine. Everything in your flow.
                  </p>
                  <button
                    className="primary-button welcome-cta"
                    onClick={() => useWorkspace.getState().newTab()}
                  >
                    <Plus size={16} /> Create a request <kbd>⌘ N</kbd>
                    <ArrowUpRight size={16} />
                  </button>
                </div>
                <div className="signal-art" aria-hidden="true">
                  <div className="signal-coordinate coordinate-top">
                    OUTBOUND ↗
                  </div>
                  <div className="signal-track track-one" />
                  <div className="signal-track track-two" />
                  <div className="signal-track track-three" />
                  <div className="signal-node node-start" />
                  <div className="signal-node node-end" />
                  <div className="signal-core">
                    <div className="brand-symbol">
                      <i />
                      <i />
                      <b />
                    </div>
                  </div>
                  <div className="signal-coordinate coordinate-bottom">
                    ↙ INBOUND
                  </div>
                  <span className="signal-caption">A DIRECT CONNECTION.</span>
                </div>
              </div>
              <div className="welcome-section-label">
                <span>MAKE YOURSELF AT HOME</span>
                <div />
              </div>
              <div className="welcome-actions">
                <button onClick={() => setModal("transfer")}>
                  <span className="welcome-action-index">01</span>
                  <ArrowDownToLine size={18} />
                  <strong>Bring your APIs</strong>
                  <span>Import a collection, spec, or cURL.</span>
                  <ArrowUpRight size={15} />
                </button>
                <button onClick={() => setModal("environments")}>
                  <span className="welcome-action-index">02</span>
                  <Globe2 size={18} />
                  <strong>Set your context</strong>
                  <span>Variables that move with your work.</span>
                  <ArrowUpRight size={15} />
                </button>
                <button onClick={() => setModal("settings")}>
                  <span className="welcome-action-index">03</span>
                  <Command size={18} />
                  <strong>Find your rhythm</strong>
                  <span>Shortcuts for the way you build.</span>
                  <ArrowUpRight size={15} />
                </button>
              </div>
              <div className="welcome-note">
                <Shield size={13} />
                <span>Private by design. No account required.</span>
                <span className="note-rule" />
                <span>Built to stay local.</span>
              </div>
            </div>
          )}
        </main>
      </div>
      <footer className="statusbar">
        <div>
          <span className="small-dot" />
          {native
            ? "Native engine connected"
            : "Browser editor · launch desktop for networking & persistence"}
          <span className="status-divider" />
          {tabs.length} open {tabs.length === 1 ? "request" : "requests"}
        </div>
        <div>
          <button onClick={() => setModal("runner")}>
            <Activity size={12} /> Collection runner
          </button>
          <span className="status-divider" />
          <span className="footer-brand">
            RELAY <span>0.1.0</span>
          </span>
        </div>
      </footer>
      {message && (
        <div className="toast" role="status">
          <Circle size={13} />
          <span>{message}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => toast("")}
          >
            <X size={13} />
          </button>
        </div>
      )}
      <InteractionDialog />
      {modal === "close-confirm" && (
        <Modal title="Unsaved requests" onClose={() => setModal("")}>
          <div className="modal-body">
            <p>
              You have unsaved request changes. Save them before closing to keep
              your work.
            </p>
          </div>
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => setModal("")}>
              Keep working
            </button>
            <button
              className="primary-button"
              onClick={() =>
                guard(
                  import("@tauri-apps/api/window").then(
                    ({ getCurrentWindow }) => getCurrentWindow().destroy(),
                  ),
                )
              }
            >
              Discard & close
            </button>
          </div>
        </Modal>
      )}
      {modal === "palette" && (
        <CommandPalette onClose={() => setModal("")} onAction={action} />
      )}
      {modal === "environments" && (
        <EnvironmentsModal onClose={() => setModal("")} />
      )}
      {modal === "transfer" && <TransferModal onClose={() => setModal("")} />}
      {modal === "settings" && <SettingsModal onClose={() => setModal("")} />}
      {scope && <ScopeModal node={scope} onClose={() => setScope(undefined)} />}
      {modal === "runner" && (
        <Modal title="Collection runner" onClose={() => setModal("")} wide>
          <div className="modal-body">
            <p className="hint">
              Runs saved requests sequentially in name order. Extracted
              environment variables are available to subsequent requests. Start
              from the project or collection context menu.
            </p>
            {runnerBusy && (
              <div className="runner-status">
                <span className="spinner" /> Running collection…
                <button
                  className="secondary-button"
                  onClick={() => {
                    useWorkspace.setState({ runnerCancel: true });
                    guard(
                      useWorkspace
                        .getState()
                        .cancel(useWorkspace.getState().runnerActiveId),
                    );
                  }}
                >
                  Stop
                </button>
              </div>
            )}
            {runner.map((r, i) => (
              <div className="runner-row" key={i}>
                <span
                  className={
                    r.status < 400 && r.status > 0
                      ? "success-text"
                      : "danger-text"
                  }
                >
                  {r.status || "ERR"}
                </span>
                <strong>{r.name}</strong>
                <span>
                  {r.results.length
                    ? `${r.results.filter((t) => t.pass).length}/${r.results.length} checks passed`
                    : "No assertions"}
                </span>
                {r.results
                  .filter((t) => !t.pass)
                  .map((t, i) => (
                    <p className="danger-text" key={i}>
                      {t.name}: {t.detail}
                    </p>
                  ))}
              </div>
            ))}
            {!runner.length && !runnerBusy && (
              <p className="hint pad">
                No runs yet. Right-click a collection and choose “Run
                collection”.
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
