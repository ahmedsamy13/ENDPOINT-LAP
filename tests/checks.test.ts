import { it, expect } from "vitest";
import { evaluate } from "../src/lib/checks";
import { pair, type Assertion, type ResponseData } from "../src/lib/types";
const response: ResponseData = {
  status: 200,
  statusText: "OK",
  durationMs: 45,
  size: 20,
  headers: [pair("content-type", "application/json")],
  cookies: [],
  body: '{"id":42,"ok":true}',
  base64: "",
  contentType: "application/json",
  finalUrl: "http://localhost",
  redirects: 0,
  binary: false,
  headersMs: 10,
};
it("runs status, time, header, body, path and schema checks", async () => {
  const checks: Assertion[] = [
    { id: "1", type: "status", path: "", expected: "200" },
    { id: "2", type: "time", path: "", expected: "100" },
    {
      id: "3",
      type: "header",
      path: "Content-Type",
      expected: "application/json",
    },
    { id: "4", type: "json", path: "$.id", expected: "42" },
    { id: "5", type: "contains", path: "", expected: '"ok":true' },
    {
      id: "6",
      type: "schema",
      path: "",
      expected:
        '{"type":"object","required":["id"],"properties":{"id":{"type":"number"}}}',
    },
  ];
  const results = await evaluate(checks, response);
  expect(results).toHaveLength(6);
  expect(results.every((r) => r.pass)).toBe(true);
});
it("reports failed and malformed assertions without executing code", async () => {
  const results = await evaluate(
    [
      { id: "1", type: "status", path: "", expected: "500" },
      { id: "2", type: "schema", path: "", expected: "not a schema" },
      { id: "3", type: "json", path: "$.missing", expected: "42" },
    ],
    response,
  );
  expect(results.every((r) => !r.pass)).toBe(true);
});
