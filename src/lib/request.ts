import {
  defaultAuth,
  type Auth,
  type Pair,
  type RequestData,
  type ScopeData,
} from "./types";
export function variables(
  ...layers: (Pair[] | undefined)[]
): Record<string, string> {
  const out: Record<string, string> = Object.create(null);
  for (const layer of layers)
    for (const v of layer ?? []) if (v.enabled && v.key) out[v.key] = v.value;
  return out;
}
export function interpolate(
  text: string,
  vars: Record<string, string>,
  stack: string[] = [],
): string {
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, name: string) => {
    if (name.startsWith("secret:")) return match;
    if (!(name in vars)) throw new Error(`Undefined variable: ${name}`);
    if (stack.includes(name) || stack.length > 12)
      throw new Error(`Circular variable: ${name}`);
    return interpolate(vars[name], vars, [...stack, name]);
  });
}
export function inheritedAuth(request: Auth, scopes: ScopeData[]): Auth {
  if (request.type !== "inherit") return request;
  return (
    [...scopes].reverse().find((s) => s.auth && s.auth.type !== "inherit")
      ?.auth ?? { ...defaultAuth(), type: "none" }
  );
}
export function buildRequest(
  id: string,
  data: RequestData,
  vars: Record<string, string>,
  auth = data.auth,
  templates = false,
) {
  const resolve = (s: string) => (templates ? s : interpolate(s, vars));
  const templateOrigin = templates && data.url.startsWith("{{");
  const url = new URL(
    templateOrigin
      ? data.url.replace(/^\{\{[^}]+\}\}/, "https://endpoint-template.invalid")
      : resolve(data.url),
  );
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Only HTTP and HTTPS URLs are supported");
  for (const p of data.params.filter((p) => p.enabled && p.key))
    url.searchParams.append(resolve(p.key), resolve(p.value));
  const headers = data.headers
    .filter((p) => p.enabled && p.key)
    .map((p) => ({ ...p, key: resolve(p.key), value: resolve(p.value) }));
  const set = (key: string, value: string) => {
    const i = headers.findIndex(
      (h) => h.key.toLowerCase() === key.toLowerCase(),
    );
    if (i >= 0) headers.splice(i, 1);
    headers.push({ key, value, enabled: true });
  };
  if (auth.type === "bearer" || auth.type === "jwt" || auth.type === "oauth2") {
    if (!auth.token)
      throw new Error("Set an access token or acquire an OAuth token first");
    set("Authorization", `Bearer ${resolve(auth.token)}`);
  }
  if (auth.type === "basic")
    set(
      "Authorization",
      `Basic-Endpoint ${resolve(auth.username)}:${resolve(auth.password)}`,
    );
  if (auth.type === "apiKey") {
    if (auth.location === "query")
      url.searchParams.set(resolve(auth.key), resolve(auth.value));
    else set(resolve(auth.key), resolve(auth.value));
  }
  if (auth.type === "custom") set(resolve(auth.key), resolve(auth.value));
  const body = ["none", "form", "multipart", "binary"].includes(data.bodyType)
    ? ""
    : resolve(data.body);
  if (!templates && ["json", "graphql"].includes(data.bodyType) && body) {
    try {
      JSON.parse(body);
    } catch {
      throw new Error("Request body is not valid JSON");
    }
  }
  const contentTypes: Record<string, string> = {
    json: "application/json",
    graphql: "application/json",
    xml: "application/xml",
    html: "text/html",
    text: "text/plain",
    binary: "application/octet-stream",
  };
  if (
    contentTypes[data.bodyType] &&
    !headers.some((h) => h.key.toLowerCase() === "content-type")
  )
    set("Content-Type", contentTypes[data.bodyType]);
  // Preserve credential placeholders in query values; URL would percent-encode their braces.
  return {
    id,
    method: data.method.toUpperCase(),
    url: (templateOrigin
      ? url
          .toString()
          .replace(
            "https://endpoint-template.invalid",
            data.url.match(/^\{\{[^}]+\}\}/)![0],
          )
      : url.toString()
    )
      .replace(/%7B%7Bsecret%3A([^%]+)%7D%7D/gi, "{{secret:$1}}")
      .replace(
        /%7B%7B([\w-]+)%7D%7D/gi,
        templates ? "{{$1}}" : "%7B%7B$1%7D%7D",
      ),
    headers,
    body: data.bodyType === "none" ? "" : body,
    bodyType: data.bodyType,
    fields: (data.bodyType === "form" || data.bodyType === "multipart"
      ? data.fields.filter((p) => p.enabled)
      : []
    ).map((p) => ({
      ...p,
      key: resolve(p.key),
      value: resolve(p.value),
    })),
    timeoutMs: data.timeoutMs,
    followRedirects: data.followRedirects,
    maxResponseBytes: data.maxResponseBytes,
    upload: data.upload ?? null,
  };
}
export function jsonPath(value: unknown, path: string): unknown {
  if (path === "$" || path === "" || path === "response.body") return value;
  const clean = path
    .replace(/^response\.body\.?/, "")
    .replace(/^\$\.?/, "")
    .replace(/\[(\d+)\]/g, ".$1");
  return clean
    .split(".")
    .filter(Boolean)
    .reduce<unknown>(
      (v, key) =>
        v !== null && typeof v === "object" && Object.hasOwn(v, key)
          ? (v as Record<string, unknown>)[key]
          : undefined,
      value,
    );
}
export function redactUrl(url: string) {
  try {
    const u = new URL(url);
    u.search = u.search ? "?[redacted]" : "";
    u.username = "";
    u.password = "";
    return u.toString();
  } catch {
    return "[invalid URL]";
  }
}
const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;
export function curl(data: RequestData) {
  if (data.upload && ["binary", "multipart"].includes(data.bodyType))
    throw new Error(
      "File attachments cannot be represented without a local path. Remove the attachment before copying a portable cURL command.",
    );
  // Portable templates only: native keychain contents are never exported.
  const req = buildRequest("export", data, {}, data.auth, true);
  let auth = "";
  if (data.auth.type === "basic")
    auth = ` -u ${quote(`${data.auth.username}:${data.auth.password}`)}`;
  const safeHeaders = req.headers
    .filter((h) => !h.value.startsWith("Basic-Endpoint "))
    .map((h) => ` -H ${quote(`${h.key}: ${h.value}`)}`)
    .join("");
  return `curl -X ${quote(req.method)} ${quote(req.url)}${safeHeaders}${auth}${req.body ? ` --data-raw ${quote(req.body)}` : ""}${
    req.bodyType === "form"
      ? req.fields
          .filter((p) => p.enabled && p.key)
          .map((p) => ` --data-urlencode ${quote(`${p.key}=${p.value}`)}`)
          .join("")
      : ""
  }${
    req.bodyType === "multipart"
      ? req.fields
          .filter((p) => p.enabled && p.key)
          .map((p) => ` --form-string ${quote(`${p.key}=${p.value}`)}`)
          .join("")
      : ""
  }`;
}
