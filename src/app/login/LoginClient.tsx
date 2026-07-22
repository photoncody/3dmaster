"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

type LoginClientProps = {
  oidcConfigured: boolean;
  credentialsEnabled: boolean;
};

function safeCallbackUrl(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) {
    return "/";
  }
  return raw;
}

export default function LoginClient({
  oidcConfigured,
  credentialsEnabled,
}: LoginClientProps) {
  const params = useSearchParams();
  const callbackUrl = safeCallbackUrl(params.get("callbackUrl"));
  const error = params.get("error");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!credentialsEnabled) return;
    setBusy(true);
    setLocalError(null);
    const res = await signIn("credentials", {
      username,
      password,
      redirect: false,
      callbackUrl,
    });
    setBusy(false);
    if (res?.error) {
      setLocalError("Invalid username or password");
      return;
    }
    window.location.href = callbackUrl;
  }

  return (
    <div>
      <section className="hero">
        <h1>Sign in</h1>
        <p>
          {credentialsEnabled && oidcConfigured
            ? "Use your password or your identity provider when configured."
            : credentialsEnabled
              ? "Sign in with your local username and password."
              : oidcConfigured
                ? "Sign in with your identity provider."
                : "No sign-in methods are configured."}
        </p>
      </section>

      <div className="panel" style={{ maxWidth: 420 }}>
        {(error || localError) && (
          <p className="muted" style={{ color: "var(--danger)" }}>
            {localError ||
              (error === "AccessDenied"
                ? "Access denied — you may not be in an allowed group."
                : "Sign-in failed.")}
          </p>
        )}

        {credentialsEnabled ? (
          <form className="stack" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        ) : null}

        {oidcConfigured ? (
          <div
            className="row"
            style={{ marginTop: credentialsEnabled ? "1rem" : 0 }}
          >
            <button
              type="button"
              className="btn secondary"
              onClick={() => signIn("oidc", { callbackUrl })}
            >
              Sign in with OIDC
            </button>
          </div>
        ) : null}

        {!credentialsEnabled && !oidcConfigured ? (
          <p className="muted">
            Enable credentials auth or configure OIDC to sign in.
          </p>
        ) : null}
      </div>
    </div>
  );
}
