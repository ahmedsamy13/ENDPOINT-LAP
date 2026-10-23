import { useState } from "react";
import { ShieldCheck, Eye, EyeOff, KeyRound } from "lucide-react";
import { call, secretReference } from "../lib/bridge";
import { buildRequest, variables } from "../lib/request";
import {
  defaultRequest,
  id,
  pair,
  type Auth,
  type ResponseData,
} from "../lib/types";
import { useWorkspace } from "../lib/store";
export default function AuthEditor({
  auth,
  onChange,
  credentialId,
}: {
  auth: Auth;
  onChange: (a: Auth) => void;
  credentialId: string;
}) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useWorkspace((s) => s.toast);
  const patch = (p: Partial<Auth>) => onChange({ ...auth, ...p });
  const field = (
    key: keyof Auth,
    label: string,
    secret = false,
    placeholder = "",
  ) => (
    <label className="form-field" key={key}>
      <span>{label}</span>
      <div className="credential-input">
        <input
          aria-label={label}
          type={secret && !visible ? "password" : "text"}
          value={String(auth[key])}
          placeholder={placeholder}
          onChange={(e) => patch({ [key]: e.target.value })}
        />
        {secret && (
          <button
            className="icon-button"
            title="Store in OS keychain"
            onClick={() => {
              void secretReference(`${credentialId}:${key}`, String(auth[key]))
                .then((value) => patch({ [key]: value }))
                .catch((e) => toast(String(e)));
            }}
          >
            <KeyRound size={14} />
          </button>
        )}
      </div>
    </label>
  );
  async function acquire() {
    setBusy(true);
    try {
      const state = useWorkspace.getState();
      const env = state.environments.find((e) => e.id === state.environmentId);
      const vars = variables(env?.variables);
      const d = defaultRequest();
      d.method = "POST";
      d.url = auth.tokenUrl;
      d.bodyType = "form";
      d.auth = { ...auth, type: "none" };
      d.fields = [
        pair("grant_type", auth.grant),
        pair("client_id", auth.clientId),
        pair("client_secret", auth.clientSecret),
      ];
      if (auth.scope) d.fields.push(pair("scope", auth.scope));
      if (auth.grant === "refresh_token")
        d.fields.push(pair("refresh_token", auth.refreshToken));
      const response = await call<ResponseData>("execute_request", {
        request: buildRequest(`oauth:${id()}`, d, vars),
      });
      if (response.status < 200 || response.status >= 300)
        throw new Error(`OAuth endpoint returned ${response.status}`);
      const result = JSON.parse(response.body);
      if (typeof result.access_token !== "string")
        throw new Error("OAuth response has no access_token");
      const token = await secretReference(
        `${credentialId}:oauth-token`,
        result.access_token,
      );
      const refreshToken =
        typeof result.refresh_token === "string"
          ? await secretReference(
              `${credentialId}:oauth-refresh`,
              result.refresh_token,
            )
          : auth.refreshToken;
      patch({ token, refreshToken });
      toast("OAuth access token stored in the OS keychain");
    } catch (e) {
      toast(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-editor">
      <div className="section-intro">
        <ShieldCheck size={18} />
        <div>
          <h3>API authentication</h3>
          <p>
            Credentials for your API. Endpoint itself never needs an account.
          </p>
        </div>
      </div>
      <label className="form-field">
        <span>Auth type</span>
        <select
          aria-label="Authentication type"
          value={auth.type}
          onChange={(e) => patch({ type: e.target.value as Auth["type"] })}
        >
          {[
            ["inherit", "Inherit from parent"],
            ["none", "No authentication"],
            ["bearer", "Bearer token"],
            ["jwt", "JWT bearer"],
            ["basic", "Basic authentication"],
            ["apiKey", "API key"],
            ["oauth2", "OAuth 2.0"],
            ["custom", "Custom header"],
          ].map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {auth.type === "inherit" && (
        <p className="hint">
          Uses the closest folder, collection, or project authentication
          configuration.
        </p>
      )}
      {["bearer", "jwt", "oauth2"].includes(auth.type) &&
        field("token", "Access token", true, "Token or {{accessToken}}")}
      {auth.type === "basic" && (
        <>
          {field("username", "Username")}
          {field("password", "Password", true)}
        </>
      )}
      {["apiKey", "custom"].includes(auth.type) && (
        <>
          {field("key", auth.type === "apiKey" ? "Key name" : "Header name")}
          {field("value", "Credential value", true)}
          {auth.type === "apiKey" && (
            <label className="form-field">
              <span>Add to</span>
              <select
                value={auth.location}
                onChange={(e) =>
                  patch({ location: e.target.value as Auth["location"] })
                }
              >
                <option value="header">Header</option>
                <option value="query">Query string</option>
              </select>
            </label>
          )}
        </>
      )}
      {auth.type === "oauth2" && (
        <>
          <div className="rule" />
          <label className="form-field">
            <span>Grant type</span>
            <select
              value={auth.grant}
              onChange={(e) =>
                patch({ grant: e.target.value as Auth["grant"] })
              }
            >
              <option value="client_credentials">Client credentials</option>
              <option value="refresh_token">Refresh token</option>
            </select>
          </label>
          {field(
            "tokenUrl",
            "Token endpoint",
            false,
            "https://api.example.com/oauth/token",
          )}
          {field("clientId", "Client ID")}
          {field("clientSecret", "Client secret", true)}
          {field("scope", "Scope")}
          {auth.grant === "refresh_token" &&
            field("refreshToken", "Refresh token", true)}
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => void acquire()}
          >
            {busy
              ? "Acquiring…"
              : auth.grant === "refresh_token"
                ? "Refresh access token"
                : "Acquire access token"}
          </button>
          <p className="hint">
            Client credentials and refresh grants are supported. Authorization
            code with PKCE and automatic refresh are not implemented.
          </p>
        </>
      )}
      {!["none", "inherit"].includes(auth.type) && (
        <div className="auth-footer">
          <button className="text-button" onClick={() => setVisible(!visible)}>
            {visible ? <EyeOff size={14} /> : <Eye size={14} />}{" "}
            {visible ? "Mask" : "Show"} credentials
          </button>
          <p className="hint">
            Use the key icon to save credentials to your OS keychain. Inline
            values persist as plain text when you save the request.
          </p>
        </div>
      )}
    </div>
  );
}
