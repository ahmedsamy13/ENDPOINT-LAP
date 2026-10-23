import { describe, it, expect } from "vitest";
import {
  buildRequest,
  curl,
  inheritedAuth,
  interpolate,
  jsonPath,
  redactUrl,
  variables,
} from "../src/lib/request";
import { defaultAuth, defaultRequest, pair } from "../src/lib/types";
describe("variable scopes and authentication", () => {
  it("uses deterministic precedence and ignores disabled entries", () => {
    expect(
      variables(
        [pair("host", "global")],
        [pair("host", "project")],
        [{ ...pair("host", "ignored"), enabled: false }],
        [pair("token", "abc")],
      ),
    ).toEqual({ host: "project", token: "abc" });
  });
  it("resolves nested variables, preserves native secrets, rejects missing and circular values", () => {
    expect(
      interpolate("{{url}}/{{token}}", {
        url: "{{host}}/api",
        host: "https://api.test",
        token: "{{secret:vault-token}}",
      }),
    ).toBe("https://api.test/api/{{secret:vault-token}}");
    expect(() => interpolate("{{bad}}", {})).toThrow("Undefined");
    expect(() => interpolate("{{a}}", { a: "{{b}}", b: "{{a}}" })).toThrow(
      "Circular",
    );
  });
  it("inherits closest authentication and honors explicit no-auth", () => {
    const parent = {
      ...defaultAuth(),
      type: "bearer" as const,
      token: "parent",
    };
    const child = { ...parent, token: "child" };
    expect(
      inheritedAuth(defaultAuth(), [{ auth: parent }, { auth: child }]).token,
    ).toBe("child");
    expect(
      inheritedAuth({ ...defaultAuth(), type: "none" }, [{ auth: parent }])
        .type,
    ).toBe("none");
  });
  it("builds a native request with query, headers, and validated JSON", () => {
    const d = defaultRequest();
    d.url = "{{base}}/users?existing=yes";
    d.method = "POST";
    d.bodyType = "json";
    d.body = '{"ok":true}';
    d.auth = { ...defaultAuth(), type: "bearer", token: "{{token}}" };
    d.params = [pair("query", "a & b")];
    const r = buildRequest("r", d, {
      base: "http://localhost:1234",
      token: "{{secret:token}}",
    });
    expect(r.url).toBe(
      "http://localhost:1234/users?existing=yes&query=a+%26+b",
    );
    expect(r.headers).toContainEqual(
      pair("Authorization", "Bearer {{secret:token}}"),
    );
    expect(r.headers).toContainEqual(pair("Content-Type", "application/json"));
    d.body = "{bad";
    expect(() =>
      buildRequest("r", d, { base: "http://localhost", token: "abc" }),
    ).toThrow("valid JSON");
  });
  it("defers Basic encoding to native engine after credential resolution", () => {
    const d = defaultRequest();
    d.url = "https://api.test";
    d.auth = {
      ...defaultAuth(),
      type: "basic",
      username: "me",
      password: "{{secret:password}}",
    };
    expect(buildRequest("r", d, {}).headers[0].value).toBe(
      "Basic-Endpoint me:{{secret:password}}",
    );
  });
  it("keeps secret query placeholders available to the native engine", () => {
    const d = defaultRequest();
    d.url = "https://api.test";
    d.auth = {
      ...defaultAuth(),
      type: "apiKey",
      key: "api_key",
      value: "{{secret:key}}",
      location: "query",
    };
    expect(buildRequest("r", d, {}).url).toContain("{{secret:key}}");
  });
  it("creates a template cURL without reading keychain values", () => {
    const d = defaultRequest();
    d.url = "{{baseUrl}}/users";
    d.auth = { ...defaultAuth(), type: "bearer", token: "{{accessToken}}" };
    expect(curl(d)).toContain("{{baseUrl}}/users");
    expect(curl(d)).toContain("Bearer {{accessToken}}");
  });
  it("inspects JSON safely and redacts history queries", () => {
    expect(jsonPath({ data: [{ id: 42 }] }, "$.data[0].id")).toBe(42);
    expect(jsonPath({ token: "abc" }, "response.body.token")).toBe("abc");
    expect(jsonPath({}, "$.constructor")).toBeUndefined();
    expect(redactUrl("https://api.test/login?token=secret")).not.toContain(
      "secret",
    );
  });
});
it("does not resolve stale bodies or fields after switching to a bodyless request", () => {
  const d = defaultRequest();
  d.url = "http://localhost:3000";
  d.body = "{{missing}}";
  d.fields = [pair("old", "{{alsoMissing}}")];
  expect(buildRequest("r", d, {}).body).toBe("");
  expect(buildRequest("r", d, {}).fields).toEqual([]);
});
