"use client";

import { FormEvent, useState } from "react";
import { signOut } from "next-auth/react";
import { apiJson, useJson } from "@/lib/client-api";

type UsersResponse = {
  authEnabled: boolean;
  canCreateUsers?: boolean;
  users: { id: string; username: string; createdAt: string }[];
};

export default function SettingsPage() {
  const [refresh, setRefresh] = useState(0);
  const { data, error, loading } = useJson<UsersResponse>("/api/users", refresh);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await apiJson("/api/users", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setUsername("");
      setPassword("");
      setRefresh((n) => n + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <section className="hero">
        <h1>Settings</h1>
        <p>Authentication and local user accounts for this shared workshop.</p>
      </section>

      <div className="panel">
        <h2 className="section-title">Auth status</h2>
        {loading ? <p className="muted">Loading…</p> : null}
        {error ? <p className="muted">{error}</p> : null}
        {data ? (
          <p>
            Authentication is{" "}
            <strong>{data.authEnabled ? "enabled" : "disabled"}</strong>.
            {!data.authEnabled
              ? " Set AUTH_ENABLED=true and configure credentials or OIDC to require login."
              : " All authorized users share the same inventory and printers."}
          </p>
        ) : null}
        {data?.authEnabled ? (
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <button
              type="button"
              className="btn secondary"
              onClick={() => signOut({ callbackUrl: "/" })}
            >
              Sign out
            </button>
          </div>
        ) : null}
      </div>

      {data?.authEnabled ? (
        <div className="panel">
          <h2 className="section-title">Local users</h2>
          {data.canCreateUsers ? (
            <form className="stack" onSubmit={onCreate}>
              <div className="row">
                <div className="field">
                  <label>Username</label>
                  <input
                    required
                    minLength={2}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>
              {formError ? <p className="muted">{formError}</p> : null}
              <button className="btn" type="submit" disabled={busy}>
                Add user
              </button>
            </form>
          ) : (
            <p className="muted">
              Only the bootstrap admin can create local users.
            </p>
          )}
          <div style={{ marginTop: "1rem" }}>
            {data.users.map((u) => (
              <div key={u.id} className="list-item">
                <strong>{u.username}</strong>
                <span className="muted">
                  created {new Date(u.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
