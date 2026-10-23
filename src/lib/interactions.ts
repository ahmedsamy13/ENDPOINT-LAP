import { create } from "zustand";
export interface Interaction {
  id: string;
  title: string;
  description: string;
  input?: string;
  submitLabel: string;
  destructive?: boolean;
  resolve: (value: string | null) => void;
  onSubmit?: (value: string) => Promise<void>;
}
interface InteractionState {
  current: Interaction | null;
  queue: Interaction[];
  busy: boolean;
  error: string;
  enqueue: (item: Interaction) => void;
  finish: (value: string | null) => void;
  submit: (value: string) => Promise<void>;
}
export const useInteraction = create<InteractionState>((set, get) => ({
  current: null,
  queue: [],
  busy: false,
  error: "",
  enqueue: (item) =>
    set((s) =>
      s.current ? { queue: [...s.queue, item] } : { current: item, error: "" },
    ),
  finish: (value) => {
    if (get().busy) return;
    const current = get().current;
    set((s) => ({
      current: s.queue[0] ?? null,
      queue: s.queue.slice(1),
      error: "",
    }));
    current?.resolve(value);
  },
  submit: async (value) => {
    const current = get().current;
    if (!current || get().busy) return;
    if (current.input !== undefined && !value.trim()) {
      set({ error: "A name is required." });
      return;
    }
    set({ busy: true, error: "" });
    try {
      await current.onSubmit?.(value);
      set({ busy: false });
      get().finish(value);
    } catch (error) {
      set({
        busy: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
}));
export function askText(
  title: string,
  initial = "",
  description = "",
  submitLabel = "Continue",
  onSubmit?: (value: string) => Promise<void>,
): Promise<string | null> {
  return new Promise((resolve) =>
    useInteraction.getState().enqueue({
      id: crypto.randomUUID(),
      title,
      input: initial,
      description,
      submitLabel,
      resolve,
      onSubmit,
    }),
  );
}
export async function confirmAction(
  description: string,
  title = "Are you sure?",
  submitLabel = "Continue",
  destructive = true,
) {
  return (
    (await new Promise<string | null>((resolve) =>
      useInteraction.getState().enqueue({
        id: crypto.randomUUID(),
        title,
        description,
        submitLabel,
        destructive,
        resolve,
      }),
    )) !== null
  );
}
