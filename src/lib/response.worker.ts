/// <reference lib="webworker" />
import { evaluate } from "./checks";
import type { Assertion, ResponseData } from "./types";
self.onmessage = async (
  event: MessageEvent<{ response: ResponseData; assertions: Assertion[] }>,
) => {
  const { response, assertions } = event.data;
  try {
    const results = await evaluate(assertions, response);
    let pretty = response.body;
    if (response.body.length <= 4 * 1024 * 1024) {
      try {
        pretty = JSON.stringify(JSON.parse(response.body), null, 2);
      } catch {
        /* Non-JSON remains raw */
      }
    }
    self.postMessage({ results, pretty });
  } catch (e) {
    self.postMessage({ error: String(e) });
  }
};
