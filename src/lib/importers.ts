import { validateRequest, validateScope } from "./validate";
import {
  defaultAuth,
  defaultRequest,
  id,
  pair,
  type Auth,
  type Environment,
  type Node,
  type Pair,
  type RequestData,
} from "./types";
export interface Imported {
  nodes: Node[];
  environments: Environment[];
  warnings: string[];
}
type Obj = Record<string, any>;
const object = (x: unknown): Obj => {
  if (!x || typeof x !== "object" || Array.isArray(x))
    throw new Error("Expected a JSON object");
  return x as Obj;
};
function rows(values: any[] = []): Pair[] {
  return values.map((v) => ({
    key: String(v.key ?? v.name ?? ""),
    value: String(v.value ?? ""),
    enabled: !v.disabled,
    secret: v.type === "secret" || v.secret === true,
  }));
}
function postmanAuth(a: Obj | undefined): Auth {
  const auth = defaultAuth();
  if (!a) return auth;
  const props = Object.fromEntries(
    (a[a.type] ?? []).map((x: Obj) => [x.key, x.value]),
  );
  if (a.type === "noauth") auth.type = "none";
  else if (a.type === "bearer") {
    auth.type = "bearer";
    auth.token = props.token ?? "";
  } else if (a.type === "basic") {
    auth.type = "basic";
    auth.username = props.username ?? "";
    auth.password = props.password ?? "";
  } else if (a.type === "apikey") {
    auth.type = "apiKey";
    auth.key = props.key ?? "";
    auth.value = props.value ?? "";
    auth.location = props.in === "query" ? "query" : "header";
  } else
    throw new Error(
      `Unsupported Postman authentication: ${a.type}. Convert it before import.`,
    );
  return auth;
}
export async function importDocument(
  text: string,
  projectId: string,
  parentId = projectId,
): Promise<Imported> {
  if (text.length > 16 * 1024 * 1024) throw new Error("Import exceeds 16 MiB");
  if (text.trim().startsWith("curl "))
    return {
      nodes: [
        {
          id: id(),
          projectId,
          parentId,
          kind: "request",
          name: "Imported cURL",
          method: importCurl(text).method,
          favorite: false,
          data: importCurl(text),
        },
      ],
      environments: [],
      warnings: [],
    };
  let source: Obj;
  try {
    source = object(JSON.parse(text));
  } catch {
    const { parse } = await import("yaml");
    source = object(parse(text, { maxAliasCount: 50 }));
  }
  const result: Imported = { nodes: [], environments: [], warnings: [] };
  const push = (
    kind: Node["kind"],
    name: string,
    parent: string | null,
    data: Node["data"],
    method: string | null = null,
  ) => {
    const node: Node = {
      id: id(),
      projectId,
      parentId: parent,
      kind,
      name: String(name).slice(0, 300),
      method,
      favorite: false,
      data,
    };
    result.nodes.push(node);
    return node.id;
  };
  if (source.format === "endpoint" && source.version === 1) {
    if (!Array.isArray(source.nodes) || !Array.isArray(source.environments))
      throw new Error("Invalid Endpoint backup");
    const ids = new Map<string, string>();
    for (const n of source.nodes) {
      if (typeof n.id !== "string" || ids.has(n.id))
        throw new Error("Duplicate or invalid node ID");
      ids.set(n.id, id());
    }
    let pending = [...source.nodes];
    const inserted = new Set<string>();
    while (pending.length) {
      const batch = pending.filter(
        (n) => n.parentId == null || inserted.has(n.parentId),
      );
      if (!batch.length)
        throw new Error("Backup has orphaned nodes or circular parents");
      for (const n of batch) {
        if (
          !["project", "collection", "folder", "request"].includes(n.kind) ||
          typeof n.name !== "string"
        )
          throw new Error("Invalid backup node");
        const mapped = {
          ...n,
          id: ids.get(n.id)!,
          projectId: ids.get(n.projectId) ?? projectId,
          parentId: n.parentId ? ids.get(n.parentId)! : null,
        };
        if (n.kind === "request") mapped.data = validateRequest(n.data);
        else mapped.data = validateScope(n.data);
        result.nodes.push(mapped);
        inserted.add(n.id);
      }
      pending = pending.filter((n) => !inserted.has(n.id));
    }
    result.environments = source.environments.map((e: Obj) => ({
      id: id(),
      projectId: ids.get(e.projectId) ?? null,
      name: String(e.name),
      variables: rows(e.variables).map((p) => ({ ...p, secret: !!p.secret })),
    }));
    result.warnings.push(
      "Secret values are excluded from portable exports. Re-enter them in the OS keychain after restore.",
    );
  } else if (source.values && Array.isArray(source.values)) {
    result.environments.push({
      id: id(),
      projectId,
      name: source.name ?? "Imported",
      variables: rows(source.values),
    });
  } else if (source.item) {
    const root = push(
      "collection",
      source.info?.name ?? "Imported collection",
      parentId,
      { auth: postmanAuth(source.auth), variables: rows(source.variable) },
    );
    const visit = (items: Obj[], parent: string, depth = 0) => {
      if (depth > 60 || result.nodes.length > 10000)
        throw new Error("Collection exceeds import limits");
      for (const item of items) {
        if (item.event?.length)
          result.warnings.push(
            `Scripts in “${item.name}” were not imported; use declarative checks and extraction.`,
          );
        if (item.item)
          visit(
            item.item,
            push("folder", item.name ?? "Folder", parent, {
              auth: postmanAuth(item.auth),
              variables: rows(item.variable),
            }),
            depth + 1,
          );
        else {
          const r =
            typeof item.request === "string"
              ? { url: item.request }
              : object(item.request);
          const d = defaultRequest();
          d.method = String(r.method ?? "GET").toUpperCase();
          d.url = typeof r.url === "string" ? r.url : (r.url?.raw ?? "");
          d.headers = rows(r.header);
          d.auth = postmanAuth(r.auth);
          d.description =
            typeof r.description === "string"
              ? r.description
              : (r.description?.content ?? "");
          if (r.body?.mode === "raw") {
            d.body = r.body.raw ?? "";
            d.bodyType =
              r.body.options?.raw?.language === "json" ? "json" : "text";
          } else if (r.body?.mode === "urlencoded") {
            d.bodyType = "form";
            d.fields = rows(r.body.urlencoded);
          } else if (r.body?.mode === "formdata") {
            if (r.body.formdata.some((p: Obj) => p.type === "file"))
              result.warnings.push(
                `Re-select file attachments for “${item.name}”.`,
              );
            d.bodyType = "multipart";
            d.fields = rows(
              r.body.formdata.filter((p: Obj) => p.type !== "file"),
            );
          } else if (r.body?.mode === "graphql") {
            d.bodyType = "graphql";
            d.body = JSON.stringify(
              {
                query: r.body.graphql.query,
                variables: JSON.parse(r.body.graphql.variables || "{}"),
              },
              null,
              2,
            );
          }
          push("request", item.name ?? "Request", parent, d, d.method);
        }
      }
    };
    visit(source.item, root);
  } else if (source.openapi || source.swagger) {
    if (!String(source.openapi ?? "").startsWith("3."))
      throw new Error(
        "OpenAPI 3.x is supported. Convert Swagger 2 before import.",
      );
    const root = push("collection", source.info?.title ?? "OpenAPI", parentId, {
      variables: [
        pair("baseUrl", source.servers?.[0]?.url ?? "http://localhost:3000"),
      ],
    });
    for (const [path, pathItem] of Object.entries(source.paths ?? {}) as [
      string,
      Obj,
    ][]) {
      for (const [method, op] of Object.entries(pathItem) as [string, Obj][]) {
        if (
          ![
            "get",
            "post",
            "put",
            "patch",
            "delete",
            "head",
            "options",
            "trace",
          ].includes(method)
        )
          continue;
        const d = defaultRequest();
        d.method = method.toUpperCase();
        d.url = `{{baseUrl}}${path.replace(/\{([^}]+)\}/g, "{{$1}}")}`;
        d.description = op.description ?? op.summary ?? "";
        for (const p of [
          ...(pathItem.parameters ?? []),
          ...(op.parameters ?? []),
        ]) {
          if (p.$ref) {
            result.warnings.push(
              `Referenced parameter in ${method} ${path} requires manual configuration.`,
            );
            continue;
          }
          const value = String(p.example ?? p.schema?.default ?? "");
          if (p.in === "query") d.params.push(pair(p.name, value));
          else if (p.in === "header") d.headers.push(pair(p.name, value));
          else if (p.in === "path") d.variables.push(pair(p.name, value));
        }
        const content = op.requestBody?.content?.["application/json"];
        if (content) {
          d.bodyType = "json";
          d.body = JSON.stringify(content.example ?? {}, null, 2);
        }
        if (op.security?.length || source.security?.length)
          result.warnings.push(
            `Configure authentication for ${method.toUpperCase()} ${path}; OpenAPI security schemes are not converted.`,
          );
        push("request", op.summary ?? `${d.method} ${path}`, root, d, d.method);
      }
    }
  } else
    throw new Error(
      "Unrecognized format. Use Endpoint v1, Postman v2.1, OpenAPI 3 JSON/YAML, environment JSON, or cURL.",
    );
  if (result.nodes.length > 10000)
    throw new Error("Import exceeds 10,000 nodes");
  return result;
}
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let token = "",
    quote = "",
    started = false;
  const input = text.replace(/\\\r?\n/g, " ");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === "\\" && quote !== "'") {
      if (++i >= input.length) throw new Error("Unterminated escape");
      token += input[i];
      started = true;
    } else if (quote) {
      if (c === quote) quote = "";
      else token += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      started = true;
    } else if (/\s/.test(c)) {
      if (started) {
        tokens.push(token);
        token = "";
        started = false;
      }
    } else {
      token += c;
      started = true;
    }
  }
  if (quote) throw new Error("Unterminated cURL quote");
  if (started) tokens.push(token);
  return tokens;
}
export function importCurl(text: string): RequestData {
  const args = tokenize(text);
  if (args.shift() !== "curl") throw new Error("Expected a cURL command");
  const d = defaultRequest();
  let explicitMethod = false;
  const next = () => {
    const value = args.shift();
    if (value === undefined) throw new Error("Missing cURL option value");
    return value;
  };
  while (args.length) {
    const a = next();
    if (a === "-X" || a === "--request") {
      d.method = next().toUpperCase();
      explicitMethod = true;
    } else if (a === "-H" || a === "--header") {
      const h = next();
      const i = h.indexOf(":");
      if (i < 1) throw new Error("Invalid cURL header");
      d.headers.push(pair(h.slice(0, i), h.slice(i + 1).trim()));
    } else if (["-d", "--data", "--data-raw", "--data-binary"].includes(a)) {
      const b = next();
      if (b.startsWith("@") && a !== "--data-raw")
        throw new Error("Select file uploads through the desktop file picker");
      d.body = b;
      d.bodyType = "text";
      if (!explicitMethod) d.method = "POST";
    } else if (
      ["--data-urlencode", "-F", "--form", "--form-string"].includes(a)
    ) {
      const field = next();
      const separator = field.indexOf("=");
      if (separator < 1) throw new Error("Form fields must use name=value");
      const value = field.slice(separator + 1);
      if (a !== "--form-string" && ["@", "<"].includes(value[0]))
        throw new Error(
          "Select file attachments through the desktop file picker",
        );
      const bodyType = a === "--data-urlencode" ? "form" : "multipart";
      if (d.body || (d.fields.length && d.bodyType !== bodyType))
        throw new Error("Mixed cURL body encodings are not supported");
      d.bodyType = bodyType;
      d.fields.push(pair(field.slice(0, separator), value));
      if (!explicitMethod) d.method = "POST";
    } else if (a === "-u" || a === "--user") {
      const [user, ...password] = next().split(":");
      d.auth = {
        ...defaultAuth(),
        type: "basic",
        username: user,
        password: password.join(":"),
      };
    } else if (a === "--url") d.url = next();
    else if (a === "-L" || a === "--location") d.followRedirects = true;
    else if (a === "-I" || a === "--head") {
      d.method = "HEAD";
      explicitMethod = true;
    } else if (["-s", "--silent", "--compressed"].includes(a)) {
    } else if (a.startsWith("-"))
      throw new Error(`Unsupported cURL flag: ${a}`);
    else if (/^https?:\/\//.test(a) || a.startsWith("{{")) d.url = a;
    else throw new Error(`Unexpected cURL argument: ${a}`);
  }
  if (!d.url) throw new Error("cURL command has no URL");
  if (d.body && !d.headers.some((h) => h.key.toLowerCase() === "content-type"))
    d.headers.push(pair("Content-Type", "application/x-www-form-urlencoded"));
  if (
    d.headers.some(
      (h) => h.key.toLowerCase() === "content-type" && h.value.includes("json"),
    )
  )
    d.bodyType = "json";
  return d;
}
export function portable(nodes: Node[], environments: Environment[]) {
  const safeSecret = (value: unknown) =>
    typeof value === "string" && /^\{\{(?!secret:)[^}]+\}\}$/.test(value)
      ? value
      : "";
  const clean = (value: unknown, context = ""): unknown => {
    if (Array.isArray(value)) return value.map((v) => clean(v, context));
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(obj)
          .filter(([k]) => k !== "upload")
          .map(([k, v]) => {
            if (
              context === "auth" &&
              [
                "token",
                "password",
                "value",
                "clientSecret",
                "refreshToken",
              ].includes(k)
            )
              return [k, safeSecret(v)];
            if (
              k === "value" &&
              (obj.secret ||
                /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key)$/i.test(
                  String(obj.key),
                ))
            )
              return [k, safeSecret(v)];
            return [k, clean(v, k)];
          }),
      );
    }
    if (typeof value === "string")
      return value.replace(/\{\{secret:[^}]+\}\}/g, "");
    return value;
  };
  return JSON.stringify(
    {
      format: "endpoint",
      version: 1,
      nodes: clean(nodes),
      environments: clean(environments),
    },
    null,
    2,
  );
}
