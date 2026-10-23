import { create } from "zustand";
export interface Interaction {
  title: string;
  description: string;
  input?: string;
  submitLabel: string;
  destructive?: boolean;
  resolve: (value: string | null) => void;
}
interface InteractionState {
  current: Interaction | null;
  queue: Interaction[];
  enqueue: (item: Interaction) => void;
  finish: (value: string | null) => void;
}
export const useInteraction = create<InteractionState>((set, get) => ({
  current: null,
  queue: [],
  enqueue: (item) =>
    set((s) => (s.current ? { queue: [...s.queue, item] } : { current: item })),
  finish: (value) => {
    const current = get().current;
    set((s) => ({ current: s.queue[0] ?? null, queue: s.queue.slice(1) }));
    current?.resolve(value);
  },
}));
export function askText(
  title: string,
  initial = "",
  description = "",
  submitLabel = "Continue",
): Promise<string | null> {
  return new Promise((resolve) =>
    useInteraction
      .getState()
      .enqueue({ title, input: initial, description, submitLabel, resolve }),
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
      useInteraction
        .getState()
        .enqueue({ title, description, submitLabel, destructive, resolve }),
    )) !== null
  );
}
