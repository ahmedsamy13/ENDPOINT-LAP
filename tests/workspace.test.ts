import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultRequest, type Node, type Tab } from "../src/lib/types";

const { call } = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("../src/lib/bridge", () => ({
  native: false,
  call,
  secretReference: vi.fn(),
}));
import { useWorkspace } from "../src/lib/store";
import { askText, useInteraction } from "../src/lib/interactions";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function request(id = "request"): Tab {
  const data = defaultRequest();
  return {
    node: {
      id,
      projectId: "project",
      parentId: "project",
      kind: "request",
      name: "Saved request",
      method: "GET",
      favorite: false,
      data,
    },
    data,
    saved: true,
    dirty: true,
  };
}
beforeEach(() => {
  call.mockReset();
  call.mockImplementation(async (command: string) =>
    command.startsWith("list_") ? [] : undefined,
  );
  useWorkspace.setState({
    tabs: [],
    activeId: "",
    projectId: "project",
    ready: false,
  });
  useInteraction.setState({ current: null, queue: [], busy: false, error: "" });
});

describe("dialog persistence", () => {
  it("retains a failed operation for retry and resolves only after success", async () => {
    const persist = vi
      .fn()
      .mockRejectedValueOnce(new Error("Disk unavailable"))
      .mockResolvedValueOnce(undefined);
    const result = askText(
      "New collection",
      "Collection",
      "",
      "Create",
      persist,
    );
    let resolved = false;
    void result.then(() => {
      resolved = true;
    });
    await useInteraction.getState().submit("Collection");
    expect(resolved).toBe(false);
    expect(useInteraction.getState().error).toBe("Disk unavailable");
    expect(useInteraction.getState().current?.title).toBe("New collection");
    await useInteraction.getState().submit("Collection");
    expect(await result).toBe("Collection");
    expect(useInteraction.getState().current).toBeNull();
  });
  it("ignores duplicate submits and cancellation during a pending write", async () => {
    const pending = deferred<void>();
    const persist = vi.fn(() => pending.promise);
    const result = askText("New request", "Request", "", "Create", persist);
    const first = useInteraction.getState().submit("Request");
    await useInteraction.getState().submit("Request");
    useInteraction.getState().finish(null);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(useInteraction.getState().busy).toBe(true);
    expect(useInteraction.getState().current).not.toBeNull();
    pending.resolve();
    await first;
    expect(await result).toBe("Request");
  });
  it("identifies consecutive identical dialogs separately and never carries an error forward", async () => {
    const a = askText("Name", "");
    const b = askText("Name", "");
    const first = useInteraction.getState().current!.id;
    await useInteraction.getState().submit("");
    expect(useInteraction.getState().error).toBe("A name is required.");
    useInteraction.getState().finish(null);
    expect(await a).toBeNull();
    expect(useInteraction.getState().current!.id).not.toBe(first);
    expect(useInteraction.getState().error).toBe("");
    useInteraction.getState().finish(null);
    expect(await b).toBeNull();
  });
});

describe("workspace async safety", () => {
  it("keeps edits made while an earlier revision is saving dirty", async () => {
    const tab = request();
    useWorkspace.setState({ tabs: [tab], activeId: tab.node.id });
    const pending = deferred<void>();
    call.mockImplementation(async (command: string) =>
      command === "save_node" ? pending.promise : [],
    );
    const save = useWorkspace.getState().save();
    useWorkspace.getState().update({ url: "https://example.test/new-edit" });
    pending.resolve();
    await save;
    const saved = useWorkspace.getState().tabs[0];
    expect(saved.dirty).toBe(true);
    expect(saved.data.url).toBe("https://example.test/new-edit");
    expect(saved.node.data).toBe(tab.data);
  });
  it("Save As creates a separate saved tab and retains the original draft", async () => {
    const original = request();
    useWorkspace.setState({ tabs: [original], activeId: original.node.id });
    const save = useWorkspace.getState().save(true);
    await useInteraction.getState().submit("Copy");
    await save;
    const tabs = useWorkspace.getState().tabs;
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toBe(original);
    expect(tabs[1].node.name).toBe("Copy");
    expect(tabs[1].saved).toBe(true);
    expect(tabs[1].dirty).toBe(false);
    expect(useWorkspace.getState().activeId).toBe(tabs[1].node.id);
  });
  it("targets delayed editor updates to their original tab", () => {
    const a = request("a"),
      b = request("b");
    useWorkspace.setState({ tabs: [a, b], activeId: "b" });
    useWorkspace.getState().update({ upload: "attachment" }, "a");
    expect(useWorkspace.getState().tabs[0].data.upload).toBe("attachment");
    expect(useWorkspace.getState().tabs[1].data.upload).toBeUndefined();
  });
  it("deduplicates tabs when the same saved request is opened rapidly", async () => {
    const node = request().node;
    const pending = deferred<Node>();
    call.mockReturnValue(pending.promise);
    const a = useWorkspace.getState().open(node);
    const b = useWorkspace.getState().open(node);
    pending.resolve(node);
    await Promise.all([a, b]);
    expect(useWorkspace.getState().tabs).toHaveLength(1);
  });
  it("persists a named new request into its collection before opening it", async () => {
    let saved: Node | undefined;
    call.mockImplementation(
      async (command: string, args: { node?: Node } = {}) => {
        if (command === "save_node") {
          saved = args.node;
          return;
        }
        if (command === "get_node") return saved;
        return [];
      },
    );
    await useWorkspace
      .getState()
      .createNode("request", "New endpoint", "collection");
    expect(saved?.parentId).toBe("collection");
    expect(saved?.name).toBe("New endpoint");
    expect(useWorkspace.getState().tabs[0].saved).toBe(true);
    expect(useWorkspace.getState().tabs[0].dirty).toBe(false);
  });
});
