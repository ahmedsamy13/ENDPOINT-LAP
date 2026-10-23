import { curl } from "../src/lib/request";
import { describe, it, expect } from "vitest";
import {
  importCurl,
  importDocument,
  portable,
  tokenize,
} from "../src/lib/importers";
import { defaultAuth, defaultRequest, type Node } from "../src/lib/types";
describe("portable imports and exports", () => {
  it("parses quoted cURL without shell execution", () => {
    const r = importCurl(
      `curl -X POST 'https://api.test/users' -H 'Content-Type: application/json' --data-raw '{"name":"A B"}'`,
    );
    expect(r.method).toBe("POST");
    expect(r.bodyType).toBe("json");
    expect(JSON.parse(r.body).name).toBe("A B");
    expect(tokenize(`curl '$(touch /tmp/not-executed)'`)[1]).toBe(
      "$(touch /tmp/not-executed)",
    );
  });
  it("rejects unknown flags, file reads, malformed quotes and TLS bypass", () => {
    for (const command of [
      "curl -k https://x.test",
      "curl --data @/etc/passwd https://x.test",
      `curl 'unterminated`,
      "curl --unknown https://x.test",
    ])
      expect(() => importCurl(command)).toThrow();
  });
  it("imports nested Postman collections with auth and script warnings", async () => {
    const r = await importDocument(
      JSON.stringify({
        info: { name: "Users" },
        auth: {
          type: "bearer",
          bearer: [{ key: "token", value: "{{accessToken}}" }],
        },
        item: [
          {
            name: "Auth",
            item: [
              {
                name: "Login",
                event: [{ listen: "test" }],
                request: {
                  method: "POST",
                  url: { raw: "{{baseUrl}}/login" },
                  body: {
                    mode: "raw",
                    raw: "{}",
                    options: { raw: { language: "json" } },
                  },
                },
              },
            ],
          },
        ],
      }),
      "p",
    );
    expect(r.nodes.map((n) => n.kind)).toEqual([
      "collection",
      "folder",
      "request",
    ]);
    expect(r.nodes[2].parentId).toBe(r.nodes[1].id);
    expect(r.warnings).toHaveLength(1);
  });
  it("imports Postman environments and secret metadata", async () => {
    const r = await importDocument(
      JSON.stringify({
        name: "Local",
        values: [{ key: "token", value: "sensitive", type: "secret" }],
      }),
      "p",
    );
    expect(r.environments[0].variables[0].secret).toBe(true);
  });
  it("imports OpenAPI YAML paths, parameters and server variables", async () => {
    const r = await importDocument(
      "openapi: 3.0.3\ninfo:\n  title: Test\nservers:\n  - url: http://localhost:3000\npaths:\n  /users/{id}:\n    get:\n      summary: Get user\n      parameters:\n        - name: id\n          in: path\n          example: 42\n",
      "p",
    );
    expect(r.nodes).toHaveLength(2);
    expect((r.nodes[1].data as any).url).toBe("{{baseUrl}}/users/{{id}}");
  });
  it("exports without known credentials or attachments and restores with remapped IDs", async () => {
    const d = defaultRequest();
    d.auth = { ...defaultAuth(), type: "bearer", token: "sensitive" };
    d.upload = "sensitive-upload";
    d.headers = [
      { key: "Authorization", value: "Bearer sensitive", enabled: true },
    ];
    const nodes: Node[] = [
      {
        id: "p",
        projectId: "p",
        parentId: null,
        kind: "project",
        name: "Project",
        method: null,
        favorite: false,
        data: {},
      },
      {
        id: "r",
        projectId: "p",
        parentId: "p",
        kind: "request",
        name: "Users",
        method: "GET",
        favorite: false,
        data: d,
      },
    ];
    const text = portable(nodes, [
      {
        id: "e",
        projectId: "p",
        name: "Local",
        variables: [
          {
            key: "token",
            value: "{{secret:abc}}",
            secret: true,
            enabled: true,
          },
        ],
      },
    ]);
    expect(text).not.toContain("sensitive");
    expect(text).not.toContain("secret:abc");
    const result = await importDocument(text, "other");
    expect(result.nodes[0].id).not.toBe("p");
    expect(result.nodes[1].parentId).toBe(result.nodes[0].id);
    expect(result.environments[0].variables[0].secret).toBe(true);
  });
  it("rejects corrupt, cyclic and unsupported backups", async () => {
    await expect(
      importDocument(
        '{"format":"endpoint","version":1,"nodes":[{"id":"a","parentId":"a"}],"environments":[]}',
        "p",
      ),
    ).rejects.toThrow("circular");
    await expect(importDocument('{"hello":true}', "p")).rejects.toThrow(
      "Unrecognized",
    );
  });
});
it("round-trips text-only form bodies through cURL without file-read semantics", () => {
  for (const type of ["form", "multipart"]) {
    const d = defaultRequest();
    d.url = "http://localhost:3000";
    d.bodyType = type;
    d.body = "stale raw body";
    d.fields = [{ key: "name", value: "Ada & Grace", enabled: true }];
    const restored = importCurl(curl(d));
    expect(restored.bodyType).toBe(type);
    expect(restored.fields[0].value).toBe("Ada & Grace");
    expect(restored.body).toBe("");
  }
});
