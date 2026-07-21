"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export default function LoginClient() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/";
  const error = params.get("error");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
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
        <p>Use your password or your identity provider when configured.</p>
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

        <div className="row" style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className="btn secondary"
            onClick={() => signIn("oidc", { callbackUrl })}
          >
            Sign in with OIDC
          </button>
        </div>
      </div>
    </div>
  );
}
