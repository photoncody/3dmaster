"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { apiJson, useJson } from "@/lib/client-api";

type Printer = {
  id: string;
  name: string;
  model: string;
  notes: string;
  _count: { queueItems: number };
  timer: { status: string } | null;
};

export default function PrintersPage() {
  const [refresh, setRefresh] = useState(0);
  const { data, error, loading } = useJson<Printer[]>("/api/printers", refresh);
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await apiJson("/api/printers", {
        method: "POST",
        body: JSON.stringify({ name, model, notes }),
      });
      setName("");
      setModel("");
      setNotes("");
      setRefresh((n) => n + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this printer and its queue/timer/maintenance?")) return;
    setMutationError(null);
    try {
      await apiJson(`/api/printers/${id}`, { method: "DELETE" });
      setRefresh((n) => n + 1);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Failed to delete printer");
    }
  }

  return (
    <div>
      <section className="hero">
        <h1>Printers</h1>
        <p>Each printer has its own queue, maintenance log, and print timer.</p>
      </section>

      <div className="panel">
        <h2 className="section-title">Add printer</h2>
        <form className="stack" onSubmit={onCreate}>
          <div className="row">
            <div className="field">
              <label htmlFor="printer-name">Name</label>
              <input
                id="printer-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Workshop A"
              />
            </div>
            <div className="field">
              <label htmlFor="printer-model">Model</label>
              <input
                id="printer-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Bambu X1C"
              />
            </div>
            <div className="field">
              <label htmlFor="printer-notes">Notes</label>
              <input
                id="printer-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Workshop bench"
              />
            </div>
          </div>
          {formError ? <p className="muted">{formError}</p> : null}
          <div className="row">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Adding…" : "Add printer"}
            </button>
          </div>
        </form>
      </div>

      <div className="panel" style={{ marginTop: "1rem" }}>
        <h2 className="section-title">Your printers</h2>
        {loading ? <p className="muted">Loading…</p> : null}
        {error ? <p className="muted">{error}</p> : null}
        {mutationError ? <p className="muted">{mutationError}</p> : null}
        {!loading && data?.length === 0 ? (
          <p className="muted">No printers yet. Add one above.</p>
        ) : null}
        <div className="grid-cards">
          {data?.map((p) => (
            <div key={p.id} className="stack">
              <Link href={`/printers/${p.id}`} className="printer-link">
                <h3>{p.name}</h3>
                {p.model ? <p className="muted">{p.model}</p> : null}
                <p className="muted">
                  {p._count.queueItems} queued
                  {p.timer ? ` · timer ${p.timer.status}` : ""}
                </p>
                {p.notes ? <p className="muted">{p.notes}</p> : null}
              </Link>
              <button
                type="button"
                className="btn secondary"
                onClick={() => onDelete(p.id)}
              >
                Delete
              </button>
              <Link href={`/printers/${p.id}?edit=1`} className="btn secondary">
                Edit
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
