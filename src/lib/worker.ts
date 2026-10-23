import type { Assertion, ResponseData, Result } from "./types";
export function processResponse(
  response: ResponseData,
  assertions: Assertion[],
) {
  return new Promise<{ results: Result[]; pretty: string }>(
    (resolve, reject) => {
      const worker = new Worker(
        new URL("./response.worker.ts", import.meta.url),
        { type: "module" },
      );
      const timeout = setTimeout(() => {
        worker.terminate();
        reject(
          new Error(
            "Response processing exceeded the 3 second budget. Reduce schema complexity.",
          ),
        );
      }, 3000);
      const done = () => {
        clearTimeout(timeout);
        worker.terminate();
      };
      worker.onmessage = (e) => {
        done();
        if (e.data.error) reject(new Error(e.data.error));
        else resolve(e.data);
      };
      worker.onerror = () => {
        done();
        reject(new Error("Response processing failed"));
      };
      worker.postMessage({ response, assertions });
    },
  );
}
