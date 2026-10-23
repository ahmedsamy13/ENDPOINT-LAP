import { invoke, isTauri } from "@tauri-apps/api/core";
export const native = isTauri();
export async function call<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!native)
    throw new Error(
      "This operation requires the Relay desktop app. Run npm run desktop. The browser editor does not send API requests or store workspace data.",
    );
  return invoke<T>(command, args);
}
export async function importFile(binary = false) {
  return call<{ name: string; content: string } | null>("import_file", {
    binary,
  });
}
export async function exportFile(
  name: string,
  content: string,
  binary = false,
) {
  return call<boolean>("export_file", { name, content, binary });
}
export async function secretReference(name: string, value: string) {
  return call<string>("store_secret", { name, value });
}
