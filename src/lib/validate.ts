import {
  defaultAuth,
  defaultRequest,
  type Auth,
  type Pair,
  type RequestData,
  type ScopeData,
} from "./types";
const authTypes = [
  "inherit",
  "none",
  "bearer",
  "jwt",
  "basic",
  "apiKey",
  "custom",
  "oauth2",
];
export function validatePairs(value: unknown): Pair[] {
  if (!Array.isArray(value) || value.length > 2000)
    throw new Error("Expected at most 2,000 key/value pairs");
  return value.map((v) => {
    if (
      !v ||
      typeof v !== "object" ||
      typeof v.key !== "string" ||
      typeof v.value !== "string"
    )
      throw new Error("Invalid key/value pair");
    return {
      key: v.key,
      value: v.value,
      enabled: v.enabled !== false,
      secret: !!v.secret,
    };
  });
}
export function validateAuth(value: unknown): Auth {
  if (!value || typeof value !== "object")
    throw new Error("Invalid authentication configuration");
  const a = { ...defaultAuth(), ...value };
  if (!authTypes.includes(a.type))
    throw new Error("Unsupported authentication type");
  for (const v of Object.values(a))
    if (typeof v !== "string") throw new Error("Invalid authentication value");
  if (
    !["header", "query"].includes(a.location) ||
    !["client_credentials", "refresh_token"].includes(a.grant)
  )
    throw new Error("Invalid authentication configuration");
  return a;
}
export function validateScope(value: unknown): ScopeData {
  if (!value || typeof value !== "object") return {};
  const s = value as ScopeData;
  return {
    variables: s.variables ? validatePairs(s.variables) : [],
    auth: s.auth ? validateAuth(s.auth) : defaultAuth(),
  };
}
export function validateRequest(value: unknown): RequestData {
  if (!value || typeof value !== "object")
    throw new Error("Invalid request data");
  const d = { ...defaultRequest(), ...value };
  for (const key of [
    "url",
    "method",
    "description",
    "body",
    "bodyType",
  ] as const)
    if (typeof d[key] !== "string") throw new Error(`Invalid request ${key}`);
  if (!/^[!#$%&'*+.^_`|~\w-]{1,32}$/.test(d.method))
    throw new Error("Invalid HTTP method");
  if (
    ![
      "none",
      "json",
      "text",
      "xml",
      "html",
      "form",
      "multipart",
      "binary",
      "graphql",
    ].includes(d.bodyType)
  )
    throw new Error("Unsupported request body type");
  d.auth = validateAuth(d.auth);
  d.params = validatePairs(d.params);
  d.headers = validatePairs(d.headers);
  d.fields = validatePairs(d.fields);
  d.variables = validatePairs(d.variables);
  if (
    !Array.isArray(d.assertions) ||
    d.assertions.length > 100 ||
    !Array.isArray(d.extractions) ||
    d.extractions.length > 100
  )
    throw new Error("Workflow rule limit exceeded");
  for (const a of d.assertions)
    if (
      !a ||
      !["status", "time", "header", "json", "contains", "schema"].includes(
        a.type,
      ) ||
      typeof a.expected !== "string" ||
      typeof a.path !== "string"
    )
      throw new Error("Invalid assertion");
  for (const e of d.extractions)
    if (
      !e ||
      typeof e.path !== "string" ||
      typeof e.variable !== "string" ||
      typeof e.secret !== "boolean"
    )
      throw new Error("Invalid extraction");
  if (
    !Number.isFinite(d.timeoutMs) ||
    !Number.isFinite(d.maxResponseBytes) ||
    typeof d.followRedirects !== "boolean"
  )
    throw new Error("Invalid request settings");
  if (d.upload !== undefined && typeof d.upload !== "string")
    throw new Error("Invalid file attachment");
  return d;
}
