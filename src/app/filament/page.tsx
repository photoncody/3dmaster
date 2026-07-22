"use client";

import { FormEvent, useEffect, useState } from "react";
import { AgeText } from "@/components/AgeText";
import { apiJson, useJson } from "@/lib/client-api";
import type { AgeThresholds } from "@/lib/age-color";

type Filament = {
  id: string;
  name: string;
  manufacturer: string;
  material: string;
  color: string;
  startingGrams: number;
  remainingGrams: number;
  rollCount: number;
  openedFromBag: boolean;
  lastDriedAt: string | null;
  notes: string;
};

type AppConfig = {
  dryThresholdsDays: AgeThresholds;
};

function rollTitle(roll: Filament) {
  const parts = [roll.material, roll.color].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return roll.name || "Filament";
}

export default function FilamentPage() {
  const [refresh, setRefresh] = useState(0);
  const { data, error, loading } = useJson<Filament[]>("/api/filament", refresh);
  const { data: appConfig, error: configError } = useJson<AppConfig>("/api/config");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [remainingInputs, setRemainingInputs] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    manufacturer: "",
    material: "PLA",
    color: "",
    startingGrams: 1000,
    remainingGrams: 1000,
    rollCount: 1,
    openedFromBag: false,
    notes: "",
  });

  useEffect(() => {
    if (!data) return;
    setRemainingInputs(
      Object.fromEntries(
        data.map((roll) => [roll.id, String(roll.remainingGrams)]),
      ),
    );
  }, [data]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await apiJson("/api/filament", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({
        manufacturer: "",
        material: "PLA",
        color: "",
        startingGrams: 1000,
        remainingGrams: 1000,
        rollCount: 1,
        openedFromBag: false,
        notes: "",
      });
      setRefresh((n) => n + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function markDried(id: string) {
    setMutationError(null);
    try {
      await apiJson(`/api/filament/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ markDried: true }),
      });
      setRefresh((n) => n + 1);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Failed to update filament");
    }
  }

  async function toggleOpened(roll: Filament) {
    setMutationError(null);
    try {
      await apiJson(`/api/filament/${roll.id}`, {
        method: "PATCH",
        body: JSON.stringify({ openedFromBag: !roll.openedFromBag }),
      });
      setRefresh((n) => n + 1);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Failed to update filament");
    }
  }

  async function updateRemaining(id: string, value: string) {
    const remainingGrams = Number(value);
    setMutationError(null);
    if (!Number.isFinite(remainingGrams)) {
      setMutationError("Remaining grams must be a number");
      return;
    }
    try {
      await apiJson(`/api/filament/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ remainingGrams }),
      });
      setRefresh((n) => n + 1);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Failed to update filament");
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Remove this filament entry?")) return;
    setMutationError(null);
    try {
      await apiJson(`/api/filament/${id}`, { method: "DELETE" });
      setRefresh((n) => n + 1);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Failed to delete filament");
    }
  }

  return (
    <div>
      <section className="hero">
        <h1>Filament</h1>
        <p>
          Shared inventory across printers — track weight left, bag status, and
          time since last dry.
        </p>
      </section>

      <div className="panel">
        <h2 className="section-title">Add filament</h2>
        <form className="stack" onSubmit={onCreate}>
          <div className="row">
            <div className="field">
              <label>Manufacturer</label>
              <input
                value={form.manufacturer}
                onChange={(e) =>
                  setForm({ ...form, manufacturer: e.target.value })
                }
              />
            </div>
            <div className="field">
              <label>Material</label>
              <input
                value={form.material}
                onChange={(e) => setForm({ ...form, material: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Color</label>
              <input
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Starting (g)</label>
              <input
                type="number"
                min={1}
                required
                value={form.startingGrams}
                onChange={(e) => {
                  const startingGrams = Number(e.target.value);
                  setForm({
                    ...form,
                    startingGrams,
                    remainingGrams: startingGrams,
                  });
                }}
              />
            </div>
            <div className="field">
              <label>Remaining (g)</label>
              <input
                type="number"
                min={0}
                required
                value={form.remainingGrams}
                onChange={(e) =>
                  setForm({ ...form, remainingGrams: Number(e.target.value) })
                }
              />
            </div>
            <div className="field">
              <label>Roll count</label>
              <input
                type="number"
                min={1}
                required
                value={form.rollCount}
                onChange={(e) =>
                  setForm({ ...form, rollCount: Number(e.target.value) })
                }
              />
            </div>
            <label className="row" style={{ alignSelf: "end", paddingBottom: 8 }}>
              <input
                type="checkbox"
                checked={form.openedFromBag}
                onChange={(e) =>
                  setForm({ ...form, openedFromBag: e.target.checked })
                }
              />
              Opened from bag
            </label>
          </div>
          {formError ? <p className="muted">{formError}</p> : null}
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Add filament"}
          </button>
        </form>
      </div>

      <div className="panel">
        <h2 className="section-title">Inventory</h2>
        {loading ? <p className="muted">Loading…</p> : null}
        {error ? <p className="muted">{error}</p> : null}
        {configError ? <p className="muted">{configError}</p> : null}
        {mutationError ? <p className="muted">{mutationError}</p> : null}
        {data?.length === 0 ? <p className="muted">No filament yet.</p> : null}
        {data?.map((roll) => {
          const pct = Math.round(
            (roll.remainingGrams / Math.max(roll.startingGrams, 1)) * 100,
          );
          return (
            <div key={roll.id} className="list-item">
              <div>
                <strong>{rollTitle(roll)}</strong>
                <p className="muted">
                  {roll.manufacturer || "Unknown maker"} · {roll.material}
                </p>
                <p className="muted">
                  {roll.remainingGrams}g / {roll.startingGrams}g remaining ({pct}
                  %)
                </p>
                <p>
                  Last dried:{" "}
                  {appConfig ? (
                    <AgeText
                      date={roll.lastDriedAt}
                      thresholds={appConfig.dryThresholdsDays}
                    />
                  ) : (
                    <span className="muted">Loading…</span>
                  )}
                </p>
                <p className="muted">
                  Bag: {roll.openedFromBag ? "Opened" : "Sealed"}
                </p>
              </div>
              <div className="stack" style={{ alignItems: "stretch" }}>
                <div className="row">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => markDried(roll.id)}
                  >
                    Dried now
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => toggleOpened(roll)}
                  >
                    Toggle bag
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => onDelete(roll.id)}
                  >
                    Delete
                  </button>
                </div>
                <div className="row">
                  <div className="field">
                    <label>Update remaining (g)</label>
                    <input
                      type="number"
                      min={0}
                      value={
                        remainingInputs[roll.id] ?? String(roll.remainingGrams)
                      }
                      onChange={(e) =>
                        setRemainingInputs((inputs) => ({
                          ...inputs,
                          [roll.id]: e.target.value,
                        }))
                      }
                      onBlur={(e) => updateRemaining(roll.id, e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
