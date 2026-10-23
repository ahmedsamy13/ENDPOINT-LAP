import { askText } from "../lib/interactions";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  Plus,
  Search,
  MoreHorizontal,
  Star,
  Play,
  Package,
  SlidersHorizontal,
} from "lucide-react";
import { call } from "../lib/bridge";
import { useWorkspace } from "../lib/store";
import type { Node } from "../lib/types";
export default function Sidebar({
  onScope,
  onRunner,
  favorites = false,
}: {
  onScope: (node: Node) => void;
  onRunner: () => void;
  favorites?: boolean;
}) {
  const nodes = useWorkspace((s) => s.nodes);
  const projectId = useWorkspace((s) => s.projectId);
  const projects = useWorkspace((s) => s.projects);
  const activeId = useWorkspace((s) => s.activeId);
  const open = useWorkspace((s) => s.open);
  const toast = useWorkspace((s) => s.toast);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ node: Node; x: number; y: number } | null>(
    null,
  );
  const [scroll, setScroll] = useState(0);
  const tree = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tree.current?.scrollTo(0, 0);
    setScroll(0);
    setMenu(null);
  }, [search, projectId, favorites]);
  const guard = (p: Promise<unknown>) => void p.catch((e) => toast(String(e)));
  const rows = useMemo(() => {
    const children = new Map<string, Node[]>();
    for (const n of nodes) {
      if (n.kind === "project") continue;
      const key = n.parentId ?? projectId;
      const list = children.get(key) ?? [];
      list.push(n);
      children.set(key, list);
    }
    const allowed = new Set<string>();
    if (search || favorites) {
      for (const n of nodes)
        if (
          (!favorites || n.favorite) &&
          (!search || n.name.toLowerCase().includes(search.toLowerCase()))
        ) {
          allowed.add(n.id);
          let p = n.parentId;
          let guard = 0;
          while (p && guard++ < 64) {
            allowed.add(p);
            p = nodes.find((n) => n.id === p)?.parentId ?? null;
          }
        }
    }
    const out: { node: Node; depth: number }[] = [];
    const visit = (parent: string, depth: number) => {
      for (const n of children.get(parent) ?? []) {
        if ((search || favorites) && !allowed.has(n.id)) continue;
        out.push({ node: n, depth });
        if (!collapsed.has(n.id) || search || favorites) visit(n.id, depth + 1);
      }
    };
    visit(projectId, 0);
    return out;
  }, [nodes, projectId, search, favorites, collapsed]);
  const start = Math.max(
    0,
    Math.min(rows.length - 1, Math.floor(scroll / 34) - 8),
  );
  const visible = rows.slice(
    start,
    start + Math.ceil(window.innerHeight / 34) + 16,
  );
  const create = async (kind: Node["kind"], parent?: string) => {
    setMenu(null);
    await askText(
      `New ${kind}`,
      kind === "request"
        ? "New request"
        : kind === "project"
          ? "New project"
          : kind === "collection"
            ? "New collection"
            : "New folder",
      kind === "request"
        ? "Give this request a name. You can start sending it immediately."
        : "Keep related work together. You can rename this anytime.",
      `Create ${kind}`,
      (name) => useWorkspace.getState().createNode(kind, name, parent),
    );
    setMenu(null);
  };
  function context(node: Node, e: React.MouseEvent) {
    e.preventDefault();
    setMenu({
      node,
      x: Math.min(e.clientX, window.innerWidth - 220),
      y: Math.min(e.clientY, window.innerHeight - 380),
    });
  }
  async function rename(node: Node) {
    await askText(
      `Rename ${node.kind}`,
      node.name,
      "",
      "Rename",
      async (name) => {
        const full = await call<Node>("get_node", { id: node.id });
        await useWorkspace.getState().mutate({ ...full, name });
      },
    );
  }
  async function drop(e: React.DragEvent, target: Node) {
    e.preventDefault();
    try {
      const dragged = e.dataTransfer.getData("application/endpoint-node");
      if (!dragged) return;
      const full = await call<Node>("get_node", { id: dragged });
      if (full.projectId !== target.projectId)
        throw new Error("Move requests within the same project");
      await useWorkspace.getState().mutate({
        ...full,
        parentId: target.kind === "request" ? target.parentId : target.id,
      });
    } catch (e) {
      toast(String(e));
    }
  }
  const root = projects.find((p) => p.id === projectId);
  return (
    <aside className="sidebar">
      <div className="library-eyebrow">
        <span>YOUR LIBRARY</span>
        <span>LOCAL</span>
      </div>
      <div className="workspace-switch">
        <div className="workspace-avatar">
          <Package size={14} />
        </div>
        <select
          aria-label="Active project"
          value={projectId}
          onChange={(e) =>
            guard(useWorkspace.getState().selectProject(e.target.value))
          }
        >
          <option value="" disabled>
            Select a project
          </option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          className="icon-button"
          aria-label="New project"
          title="New project"
          onClick={() => create("project")}
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="sidebar-search">
        <Search size={13} />
        <input
          aria-label="Search saved requests"
          placeholder="Filter requests…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setScroll(0);
          }}
        />
        <kbd>/</kbd>
      </div>
      <div className="sidebar-section-heading">
        <span>
          {favorites ? "Favorites" : "Collections"}{" "}
          <small>{rows.filter((r) => r.node.kind === "request").length}</small>
        </span>
        <div>
          <button
            className="icon-button"
            aria-label="Project settings"
            title="Project variables and authentication"
            disabled={!root}
            onClick={() => root && onScope(root)}
          >
            <SlidersHorizontal size={13} />
          </button>
          <button
            className="icon-button"
            aria-label="New collection"
            title="New collection"
            onClick={() => create("collection")}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
      <div
        className="collection-tree"
        ref={tree}
        onScroll={(e) => setScroll(e.currentTarget.scrollTop)}
      >
        <div style={{ height: rows.length * 34, position: "relative" }}>
          {visible.map(({ node, depth }, i) => (
            <div
              key={node.id}
              className={`collection-row ${activeId === node.id ? "selected" : ""}`}
              style={{
                position: "absolute",
                top: (start + i) * 34,
                left: 0,
                right: 0,
                paddingLeft: 12 + depth * 14,
              }}
              draggable
              onDragStart={(e) =>
                e.dataTransfer.setData("application/endpoint-node", node.id)
              }
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => void drop(e, node)}
              onContextMenu={(e) => context(node, e)}
            >
              <button
                className="collection-name"
                title={node.name}
                onClick={() => {
                  if (node.kind === "request") guard(open(node));
                  else
                    setCollapsed((c) => {
                      const next = new Set(c);
                      if (next.has(node.id)) next.delete(node.id);
                      else next.add(node.id);
                      return next;
                    });
                }}
              >
                {node.kind === "request" ? (
                  <span
                    className={`method-tag method-${node.method?.toLowerCase()}`}
                  >
                    {node.method ?? "GET"}
                  </span>
                ) : (
                  <>
                    <ChevronRight
                      size={12}
                      className={!collapsed.has(node.id) ? "rotated" : ""}
                    />
                    {collapsed.has(node.id) ? (
                      <Folder size={14} />
                    ) : (
                      <FolderOpen size={14} />
                    )}
                  </>
                )}
                <span>{node.name}</span>
                {node.favorite && (
                  <Star
                    size={10}
                    className="favorite-star"
                    fill="currentColor"
                  />
                )}
              </button>
              {node.kind !== "request" && (
                <button
                  className="inline-add icon-button"
                  aria-label={`Add request to ${node.name}`}
                  title="Add request here"
                  onClick={() => void create("request", node.id)}
                >
                  <Plus size={12} />
                </button>
              )}
              <button
                className="row-menu icon-button"
                aria-label={`Actions for ${node.name}`}
                onClick={(e) => context(node, e)}
              >
                <MoreHorizontal size={14} />
              </button>
            </div>
          ))}
        </div>
        {!rows.length && (
          <div className="sidebar-empty">
            <Folder size={23} />
            <p>
              {search
                ? "No matching requests"
                : favorites
                  ? "Star requests to find them here"
                  : "Your collection starts here"}
            </p>
            {!search && !favorites && (
              <button
                className="text-button"
                onClick={() => create("collection")}
              >
                Create a collection <Plus size={12} />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="sidebar-footer">
        <button className="text-button" onClick={() => create("request")}>
          <Plus size={14} /> New request
        </button>
        <button
          className="icon-button"
          title="Run project"
          aria-label="Run project"
          disabled={!root}
          onClick={() => {
            if (root) {
              onRunner();
              guard(useWorkspace.getState().runCollection(root));
            }
          }}
        >
          <Play size={13} />
        </button>
      </div>
      <div className="workspace-status">
        <span className="small-dot" /> Stored on this device{" "}
        <Package size={12} />
      </div>
      {menu && (
        <>
          <div
            className="menu-backdrop"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu(null);
            }}
          />
          <div className="context-menu" style={{ left: menu.x, top: menu.y }}>
            {menu.node.kind !== "request" && (
              <>
                <button onClick={() => create("request", menu.node.id)}>
                  <Plus size={13} /> New request
                </button>
                <button onClick={() => create("folder", menu.node.id)}>
                  <Folder size={13} /> New folder
                </button>
                <button
                  onClick={() => {
                    onScope(menu.node);
                    setMenu(null);
                  }}
                >
                  <SlidersHorizontal size={13} /> Variables & authentication
                </button>
                <button
                  onClick={() => {
                    onRunner();
                    guard(useWorkspace.getState().runCollection(menu.node));
                    setMenu(null);
                  }}
                >
                  <Play size={13} /> Run collection
                </button>
              </>
            )}
            <button
              onClick={() => {
                guard(rename(menu.node));
                setMenu(null);
              }}
            >
              Rename
            </button>
            {menu.node.kind === "request" && (
              <>
                <button
                  onClick={() => {
                    guard(useWorkspace.getState().duplicate(menu.node));
                    setMenu(null);
                  }}
                >
                  Duplicate request
                </button>
                <button
                  onClick={() => {
                    const node = menu.node;
                    guard(
                      call<Node>("get_node", { id: node.id }).then((full) =>
                        useWorkspace
                          .getState()
                          .mutate({ ...full, favorite: !full.favorite }),
                      ),
                    );
                    setMenu(null);
                  }}
                >
                  <Star size={13} />{" "}
                  {menu.node.favorite ? "Remove favorite" : "Add to favorites"}
                </button>
              </>
            )}
            <button
              className="danger-text"
              onClick={() => {
                guard(useWorkspace.getState().remove(menu.node));
                setMenu(null);
              }}
            >
              Delete {menu.node.kind}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
