import { jsonPath } from "./request";
import type { Assertion, ResponseData, Result } from "./types";
export async function evaluate(
  assertions: Assertion[],
  response: ResponseData,
): Promise<Result[]> {
  let body: unknown;
  try {
    body = JSON.parse(response.body);
  } catch {
    body = undefined;
  }
  const results: Result[] = [];
  for (const a of assertions) {
    try {
      let pass = false,
        detail = "";
      switch (a.type) {
        case "status":
          pass = response.status === Number(a.expected);
          detail = `Received ${response.status}`;
          break;
        case "time":
          pass = response.durationMs <= Number(a.expected);
          detail = `${response.durationMs} ms`;
          break;
        case "header": {
          const h = response.headers.find(
            (h) => h.key.toLowerCase() === a.path.toLowerCase(),
          );
          pass = h?.value === a.expected;
          detail = h?.value ?? "Header missing";
          break;
        }
        case "contains":
          pass = response.body.includes(a.expected);
          detail = pass ? "Body contains expected text" : "Text not found";
          break;
        case "json": {
          const actual = jsonPath(body, a.path);
          let expected: unknown;
          try {
            expected = JSON.parse(a.expected);
          } catch {
            expected = a.expected;
          }
          pass = JSON.stringify(actual) === JSON.stringify(expected);
          detail = JSON.stringify(actual) ?? "Path not found";
          break;
        }
        case "schema": {
          const { Validator } = await import("@cfworker/json-schema");
          const validator = new Validator(JSON.parse(a.expected), "7");
          const result = validator.validate(body);
          pass = result.valid;
          detail = pass
            ? "Schema valid"
            : result.errors.map((e) => e.error).join(";");
          break;
        }
      }
      results.push({
        name: `${a.type}${a.path ? ` · ${a.path}` : ""}`,
        pass,
        detail,
      });
    } catch (e) {
      results.push({ name: a.type, pass: false, detail: String(e) });
    }
  }
  return results;
}
