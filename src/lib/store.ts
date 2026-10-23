import { askText, confirmAction } from "./interactions";
import { create } from "zustand";
import { call, native, secretReference } from "./bridge";
import {
  buildRequest,
  inheritedAuth,
  jsonPath,
  redactUrl,
  variables,
} from "./request";
import { processResponse } from "./worker";
import {
  defaultRequest,
  id,
  pair,
  type Environment,
  type History,
  type Node,
  type RequestData,
  type ResponseData,
  type ScopeData,
  type Tab,
  type Result,
} from "./types";
interface Workspace {
  projects: Node[];
  nodes: Node[];
  projectId: string;
  environments: Environment[];
  environmentId: string;
  tabs: Tab[];
  activeId: string;
  ready: boolean;
  message: string;
  history: History[];
  runner: { name: string; results: Result[]; status: number }[];
  runnerBusy: boolean;
  runnerActiveId: string;
  runnerCancel: boolean;
  toast: (message: string) => void;
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  selectProject: (id: string) => Promise<void>;
  createNode: (
    kind: Node["kind"],
    name: string,
    parent?: string,
  ) => Promise<void>;
  open: (node: Node) => Promise<void>;
  newTab: () => void;
  update: (data: Partial<RequestData>) => void;
  save: (asNew?: boolean) => Promise<void>;
  close: (id: string) => Promise<void>;
  mutate: (node: Node) => Promise<void>;
  remove: (node: Node) => Promise<void>;
  duplicate: (node: Node) => Promise<void>;
  send: (tabId?: string) => Promise<void>;
  cancel: (tabId?: string) => Promise<void>;
  setEnvironment: (id: string) => void;
  saveEnvironment: (e: Environment) => Promise<void>;
  loadHistory: () => Promise<void>;
  runCollection: (node: Node) => Promise<void>;
}
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
async function scopesFor(node: Node): Promise<ScopeData[]> {
  const scopes: ScopeData[] = [];
  let parentId = node.parentId;
  let depth = 0;
  while (parentId && depth++ < 64) {
    const parent = await call<Node>("get_node", { id: parentId });
    scopes.unshift((parent.data ?? {}) as ScopeData);
    parentId = parent.parentId;
  }
  return scopes;
}
export const useWorkspace = create<Workspace>((set, get) => ({
  projects: [],
  nodes: [],
  projectId: "",
  environments: [],
  environmentId: "",
  tabs: [],
  activeId: "",
  ready: false,
  message: "",
  history: [],
  runner: [],
  runnerBusy: false,
  runnerActiveId: "",
  runnerCancel: false,
  toast: (message) => set({ message }),
  initialize: async () => {
    if (!native) {
      set({ ready: true });
      return;
    }
    try {
      let projects = await call<Node[]>("list_nodes", { project: null });
      if (!projects.length) {
        const projectId = id();
        await call("save_node", {
          node: {
            id: projectId,
            projectId,
            parentId: null,
            kind: "project",
            name: "My workspace",
            method: null,
            favorite: false,
            data: {},
          },
        });
        projects = await call<Node[]>("list_nodes", { project: null });
        await call("save_environment", {
          environment: {
            id: id(),
            projectId,
            name: "Local",
            variables: [pair("baseUrl", "http://localhost:3000")],
          },
        });
      }
      const prefs = await call<{
        projectId?: string;
        environmentId?: string;
        tabs?: string[];
        activeId?: string;
      } | null>("get_setting", { key: "workspace" });
      const projectId =
        projects.find((p) => p.id === prefs?.projectId)?.id ?? projects[0].id;
      set({ projects, projectId });
      await get().refresh();
      if (
        prefs?.environmentId &&
        get().environments.some((e) => e.id === prefs.environmentId)
      )
        set({ environmentId: prefs.environmentId });
      for (const tabId of prefs?.tabs?.slice(0, 20) ?? []) {
        try {
          const n = await call<Node>("get_node", { id: tabId });
          if (n.projectId === projectId && n.kind === "request")
            await get().open(n);
        } catch {
          /* Deleted request */
        }
      }
      if (get().tabs.some((t) => t.node.id === prefs?.activeId))
        set({ activeId: prefs!.activeId! });
      set({ ready: true });
    } catch (e) {
      set({ ready: true, message: errorText(e) });
    }
  },
  refresh: async () => {
    const [projects, nodes, environments] = await Promise.all([
      call<Node[]>("list_nodes", { project: null }),
      call<Node[]>("list_nodes", { project: get().projectId || null }),
      call<Environment[]>("list_environments"),
    ]);
    const available = environments.filter(
      (e) => e.projectId === get().projectId || !e.projectId,
    );
    set({
      projects,
      nodes,
      environments,
      environmentId: available.some((e) => e.id === get().environmentId)
        ? get().environmentId
        : (available[0]?.id ?? ""),
    });
  },
  selectProject: async (projectId) => {
    set({ projectId });
    await get().refresh();
  },
  createNode: async (kind, name, parent) => {
    if (kind === "request") {
      const data = defaultRequest();
      const node: Node = {
        id: id(),
        projectId: get().projectId,
        parentId: parent ?? get().projectId,
        kind,
        name,
        method: "GET",
        favorite: false,
        data,
      };
      set((s) => ({
        tabs: [...s.tabs, { node, data, saved: false, dirty: true }],
        activeId: node.id,
      }));
      return;
    }
    const nodeId = id();
    await call("save_node", {
      node: {
        id: nodeId,
        projectId: kind === "project" ? nodeId : get().projectId,
        parentId: kind === "project" ? null : (parent ?? get().projectId),
        kind,
        name,
        method: null,
        favorite: false,
        data: {},
      },
    });
    if (kind === "project") set({ projectId: nodeId });
    await get().refresh();
  },
  open: async (node) => {
    if (get().tabs.some((t) => t.node.id === node.id)) {
      set({ activeId: node.id });
      return;
    }
    const full = await call<Node>("get_node", { id: node.id });
    const data = { ...defaultRequest(), ...full.data } as RequestData;
    set((s) => ({
      tabs: [...s.tabs, { node: full, data, saved: true, dirty: false }],
      activeId: full.id,
    }));
  },
  newTab: () => {
    const data = defaultRequest();
    const node: Node = {
      id: id(),
      projectId: get().projectId,
      parentId: get().projectId || null,
      kind: "request",
      name: "Untitled request",
      method: "GET",
      favorite: false,
    };
    set((s) => ({
      tabs: [...s.tabs, { node, data, saved: false, dirty: true }],
      activeId: node.id,
    }));
  },
  update: (data) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.node.id === s.activeId
          ? { ...t, data: { ...t.data, ...data }, dirty: true }
          : t,
      ),
    })),
  save: async (asNew = false) => {
    const tab = get().tabs.find((t) => t.node.id === get().activeId);
    if (!tab) return;
    if (!get().projectId) throw new Error("Create a project first");
    if (asNew && tab.running)
      throw new Error("Wait for the running request before Save As");
    const name =
      tab.node.name === "Untitled request" || asNew
        ? await askText(
            "Save this request",
            asNew ? `${tab.node.name} copy` : tab.node.name,
            "Choose a name you’ll recognize in your library.",
            "Save request",
          )
        : tab.node.name;
    if (!name) return;
    const node = {
      ...tab.node,
      id: asNew ? id() : tab.node.id,
      name,
      projectId: tab.node.projectId || get().projectId,
      parentId: tab.node.parentId || get().projectId,
      method: tab.data.method,
      data: tab.data,
    };
    await call("save_node", { node });
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.node.id === tab.node.id
          ? { ...t, node, saved: true, dirty: false }
          : t,
      ),
      activeId: node.id,
    }));
    await get().refresh();
    get().toast("Request saved locally");
  },
  close: async (tabId) => {
    const t = get().tabs.find((t) => t.node.id === tabId);
    if (t?.running) {
      get().toast("Cancel the request before closing its tab");
      return;
    }
    if (
      t &&
      t.dirty &&
      !(await confirmAction(
        "This request has unsaved changes. Keep working or discard this draft.",
        "Close this request?",
        "Discard draft",
      ))
    )
      return;
    set((s) => {
      const tabs = s.tabs.filter((t) => t.node.id !== tabId);
      return {
        tabs,
        activeId:
          s.activeId === tabId ? (tabs.at(-1)?.node.id ?? "") : s.activeId,
      };
    });
  },
  mutate: async (node) => {
    await call("save_node", { node });
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.node.id === node.id ? { ...t, node: { ...t.node, ...node } } : t,
      ),
    }));
    await get().refresh();
  },
  remove: async (node) => {
    if (
      !(await confirmAction(
        `“${node.name}” and everything inside it will be permanently deleted.`,
        `Delete ${node.kind}?`,
        "Delete",
      ))
    )
      return;
    const removeIds = new Set([node.id]);
    let previous = 0;
    while (previous !== removeIds.size) {
      previous = removeIds.size;
      get().nodes.forEach((n) => {
        if (n.parentId && removeIds.has(n.parentId)) removeIds.add(n.id);
      });
    }
    if (get().tabs.some((t) => removeIds.has(t.node.id) && t.running))
      throw new Error("Cancel running requests before deleting");
    await call("delete_node", { id: node.id });
    set((s) => ({
      tabs: s.tabs.filter((t) => !removeIds.has(t.node.id)),
      activeId: removeIds.has(s.activeId) ? "" : s.activeId,
    }));
    if (node.kind === "project") {
      const projects = await call<Node[]>("list_nodes", { project: null });
      set({ projectId: projects[0]?.id ?? "" });
    }
    await get().refresh();
  },
  duplicate: async (node) => {
    const full = await call<Node>("get_node", { id: node.id });
    if (full.kind !== "request")
      throw new Error("Duplicate is available for requests");
    await call("save_node", {
      node: { ...full, id: id(), name: `${full.name} copy` },
    });
    await get().refresh();
  },
  send: async (tabId) => {
    const tab = get().tabs.find((t) => t.node.id === (tabId ?? get().activeId));
    if (!tab || tab.running) return;
    const target = tab.node.id;
    const patch = (patch: Partial<Tab>) =>
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.node.id === target ? { ...t, ...patch } : t,
        ),
      }));
    patch({
      running: true,
      error: undefined,
      response: undefined,
      results: undefined,
    });
    try {
      const scopes = await scopesFor(tab.node);
      const global = get().environments.find(
        (e) => !e.projectId && e.name === "Globals",
      );
      const active = get().environments.find(
        (e) => e.id === get().environmentId,
      );
      if (active?.projectId && active.projectId !== tab.node.projectId)
        throw new Error("Selected environment belongs to another project");
      const vars = variables(
        global?.variables,
        ...scopes.map((s) => s.variables),
        active?.variables,
        tab.data.variables,
      );
      const auth = inheritedAuth(tab.data.auth, scopes);
      const request = buildRequest(target, tab.data, vars, auth);
      const response = await call<ResponseData>("execute_request", { request });
      patch({ response });
      const processed = await processResponse(response, tab.data.assertions);
      patch({ results: processed.results });
      // Persist only metadata; URL queries and response bodies can contain secrets.
      await call("record_history", {
        value: {
          requestId: tab.sourceId ?? target,
          name: tab.node.name,
          method: tab.data.method,
          url: redactUrl(request.url),
          status: response.status,
          duration: response.durationMs,
          size: response.size,
        },
      });
      if (tab.data.extractions.length) {
        if (response.body.length > 4 * 1024 * 1024)
          throw new Error(
            "Automatic extraction is limited to 4 MiB JSON responses",
          );
        if (!active)
          throw new Error("Choose an environment to store extracted variables");
        const body: unknown = JSON.parse(response.body);
        const next = { ...active, variables: [...active.variables] };
        for (const extraction of tab.data.extractions) {
          if (!extraction.variable) continue;
          const raw = jsonPath(body, extraction.path);
          if (raw === undefined)
            throw new Error(`Extraction path not found: ${extraction.path}`);
          const value = typeof raw === "string" ? raw : JSON.stringify(raw);
          const stored = extraction.secret
            ? await secretReference(
                `${active.id}:${extraction.variable}`,
                value,
              )
            : value;
          const item = {
            ...pair(extraction.variable, stored),
            secret: extraction.secret,
          };
          const index = next.variables.findIndex(
            (v) => v.key === extraction.variable,
          );
          if (index < 0) next.variables.push(item);
          else next.variables[index] = item;
        }
        await get().saveEnvironment(next);
      }
    } catch (e) {
      patch({ error: errorText(e) });
    } finally {
      patch({ running: false });
    }
  },
  cancel: async (tabId) => {
    await call("cancel_request", { id: tabId ?? get().activeId });
  },
  setEnvironment: (environmentId) => set({ environmentId }),
  saveEnvironment: async (environment) => {
    await call("save_environment", { environment });
    await get().refresh();
  },
  loadHistory: async () =>
    set({ history: await call<History[]>("list_history") }),
  runCollection: async (node) => {
    if (get().runnerBusy) return;
    set({ runner: [], runnerBusy: true, runnerCancel: false });
    try {
      const children = new Set([node.id]);
      let old = 0;
      while (old !== children.size) {
        old = children.size;
        get().nodes.forEach((n) => {
          if (n.parentId && children.has(n.parentId)) children.add(n.id);
        });
      }
      const requests = get().nodes.filter(
        (n) => n.kind === "request" && children.has(n.id),
      );
      const previousActive = get().activeId;
      for (const n of requests) {
        if (get().runnerCancel) break;
        const full = await call<Node>("get_node", { id: n.id });
        const runId = `runner:${id()}`;
        const runNode = { ...full, id: runId };
        const data = { ...defaultRequest(), ...full.data } as RequestData;
        set((s) => ({
          tabs: [
            ...s.tabs,
            { sourceId: n.id, node: runNode, data, saved: true, dirty: false },
          ],
        }));
        set({ runnerActiveId: runId });
        await get().send(runId);
        const tab = get().tabs.find((t) => t.node.id === runId)!;
        set((s) => ({
          runner: [
            ...s.runner,
            {
              name: n.name,
              status: tab.response?.status ?? 0,
              results: tab.error
                ? [{ name: "Request", pass: false, detail: tab.error }]
                : (tab.results ?? []),
            },
          ],
          tabs: s.tabs.filter((t) => t.node.id !== runId),
        }));
      }
      set({ activeId: previousActive });
    } finally {
      set({ runnerBusy: false, runnerActiveId: "" });
    }
  },
}));
let prefsTimer: ReturnType<typeof setTimeout>;
useWorkspace.subscribe((state, previous) => {
  if (!native || !state.ready) return;
  if (
    state.projectId !== previous.projectId ||
    state.environmentId !== previous.environmentId ||
    state.tabs.length !== previous.tabs.length ||
    state.activeId !== previous.activeId
  ) {
    clearTimeout(prefsTimer);
    prefsTimer = setTimeout(() => {
      void call("save_setting", {
        key: "workspace",
        value: {
          projectId: state.projectId,
          environmentId: state.environmentId,
          tabs: state.tabs.filter((t) => t.saved).map((t) => t.node.id),
          activeId: state.activeId,
        },
      }).catch((e) => state.toast(String(e)));
    }, 250);
  }
});
