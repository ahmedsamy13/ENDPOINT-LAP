export type Kind = "project" | "collection" | "folder" | "request";
export interface Pair {
  key: string;
  value: string;
  enabled: boolean;
  secret?: boolean;
}
export type AuthType =
  | "inherit"
  | "none"
  | "bearer"
  | "jwt"
  | "basic"
  | "apiKey"
  | "custom"
  | "oauth2";
export interface Auth {
  type: AuthType;
  token: string;
  username: string;
  password: string;
  key: string;
  value: string;
  location: "header" | "query";
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  grant: "client_credentials" | "refresh_token";
  refreshToken: string;
}
export interface Assertion {
  id: string;
  type: "status" | "time" | "header" | "json" | "contains" | "schema";
  path: string;
  expected: string;
}
export interface Extraction {
  path: string;
  variable: string;
  secret: boolean;
}
export interface RequestData {
  url: string;
  method: string;
  description: string;
  params: Pair[];
  headers: Pair[];
  bodyType: string;
  body: string;
  fields: Pair[];
  auth: Auth;
  variables: Pair[];
  assertions: Assertion[];
  extractions: Extraction[];
  timeoutMs: number;
  followRedirects: boolean;
  maxResponseBytes: number;
  upload?: string;
  uploadName?: string;
}
export interface Node {
  id: string;
  projectId: string;
  parentId: string | null;
  kind: Kind;
  name: string;
  method: string | null;
  favorite: boolean;
  data?: RequestData | ScopeData | null;
}
export interface ScopeData {
  variables?: Pair[];
  auth?: Auth;
}
export interface Environment {
  id: string;
  projectId: string | null;
  name: string;
  variables: Pair[];
}
export interface ResponseData {
  status: number;
  statusText: string;
  durationMs: number;
  size: number;
  headers: Pair[];
  cookies: string[];
  body: string;
  base64: string;
  contentType: string;
  finalUrl: string;
  redirects: number;
  binary: boolean;
  headersMs: number;
}
export interface Result {
  name: string;
  pass: boolean;
  detail: string;
}
export interface Tab {
  sourceId?: string;
  node: Node;
  data: RequestData;
  saved: boolean;
  dirty: boolean;
  response?: ResponseData;
  results?: Result[];
  error?: string;
  running?: boolean;
}
export interface History {
  id: number;
  requestId: string;
  name: string;
  method: string;
  url: string;
  status: number;
  duration: number;
  size: number;
  createdAt: number;
}
export const pair = (key = "", value = ""): Pair => ({
  key,
  value,
  enabled: true,
});
export const defaultAuth = (): Auth => ({
  type: "inherit",
  token: "",
  username: "",
  password: "",
  key: "X-API-Key",
  value: "",
  location: "header",
  tokenUrl: "",
  clientId: "",
  clientSecret: "",
  scope: "",
  grant: "client_credentials",
  refreshToken: "",
});
export const defaultRequest = (): RequestData => ({
  url: "",
  method: "GET",
  description: "",
  params: [],
  headers: [],
  bodyType: "none",
  body: "",
  fields: [],
  auth: defaultAuth(),
  variables: [],
  assertions: [],
  extractions: [],
  timeoutMs: 30000,
  followRedirects: true,
  maxResponseBytes: 16 * 1024 * 1024,
});
export const id = () => crypto.randomUUID();
