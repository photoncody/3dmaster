"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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

type SortKey =
  | "material"
  | "color"
  | "manufacturer"
  | "remaining"
  | "percent"
  | "dried"
  | "bag";

type SortDir = "asc" | "desc";

function rollTitle(roll: Filament) {
  const parts = [roll.material, roll.color].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return roll.name || "Filament";
}

function remainingPct(roll: Filament) {
  return Math.round(
    (roll.remainingGrams / Math.max(roll.startingGrams, 1)) * 100,
  );
}

function meterLevel(pct: number) {
  if (pct >= 50) return "green";
  if (pct >= 25) return "yellow";
  if (pct >= 10) return "orange";
  return "red";
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

export default function FilamentPage() {
  const [refresh, setRefresh] = useState(0);
  const { data, error, loading } = useJson<Filament[]>("/api/filament", refresh);
  const { data: appConfig, error: configError } = useJson<AppConfig>("/api/config");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [remainingInputs, setRemainingInputs] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("material");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [editing, setEditing] = useState<Filament | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editForm, setEditForm] = useState({
    manufacturer: "",
    material: "",
    color: "",
    startingGrams: 1000,
    remainingGrams: 1000,
    openedFromBag: false,
    notes: "",
  });
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

  const filtered = useMemo(() => {
    const rolls = data ?? [];
    const q = search.trim().toLowerCase();
    const matched = q
      ? rolls.filter((roll) => {
          const haystack = [
            roll.name,
            roll.manufacturer,
            roll.material,
            roll.color,
            roll.notes,
            roll.openedFromBag ? "opened" : "sealed",
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        })
      : rolls;

    const sorted = [...matched].sort((a, b) => {
      let result = 0;
      switch (sortKey) {
        case "material":
          result = compareText(a.material, b.material);
          if (result === 0) result = compareText(a.color, b.color);
          break;
        case "color":
          result = compareText(a.color, b.color);
          break;
        case "manufacturer":
          result = compareText(a.manufacturer, b.manufacturer);
          break;
        case "remaining":
          result = a.remainingGrams - b.remainingGrams;
          break;
        case "percent":
          result = remainingPct(a) - remainingPct(b);
          break;
        case "dried": {
          const aTime = a.lastDriedAt ? Date.parse(a.lastDriedAt) : 0;
          const bTime = b.lastDriedAt ? Date.parse(b.lastDriedAt) : 0;
          result = aTime - bTime;
          break;
        }
        case "bag":
          result = Number(a.openedFromBag) - Number(b.openedFromBag);
          break;
      }
      return sortDir === "asc" ? result : -result;
    });

    return sorted;
  }, [data, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "remaining" || key === "percent" || key === "dried" ? "desc" : "asc");
  }

  function sortProps(key: SortKey) {
    return {
      className: "sortable",
      onClick: () => toggleSort(key),
      "aria-sort":
        sortKey === key
          ? sortDir === "asc"
            ? ("ascending" as const)
            : ("descending" as const)
          : ("none" as const),
    };
  }

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

  function openEdit(roll: Filament) {
    setEditing(roll);
    setEditForm({
      manufacturer: roll.manufacturer,
      material: roll.material,
      color: roll.color,
      startingGrams: roll.startingGrams,
      remainingGrams: roll.remainingGrams,
      openedFromBag: roll.openedFromBag,
      notes: roll.notes,
    });
    setMutationError(null);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditBusy(true);
    setMutationError(null);
    try {
      await apiJson(`/api/filament/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify(editForm),
      });
      setEditing(null);
      setRefresh((n) => n + 1);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Failed to update filament");
    } finally {
      setEditBusy(false);
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
      if (editing?.id === id) setEditing(null);
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
          Shared inventory across printers — search, sort, and track remaining
          weight, bag status, and drying.
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

      <div className="panel" aria-hidden={editing ? true : undefined}>
        <h2 className="section-title">Inventory</h2>
        <div className="toolbar">
          <div className="field">
            <label htmlFor="filament-search">Search</label>
            <input
              id="filament-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Material, color, maker…"
            />
          </div>
          <p className="muted" style={{ margin: 0, paddingBottom: 8 }}>
            {loading
              ? "Loading…"
              : `${filtered.length} of ${data?.length ?? 0} rolls`}
          </p>
        </div>
        {error ? <p className="muted">{error}</p> : null}
        {configError ? <p className="muted">{configError}</p> : null}
        {mutationError ? <p className="muted">{mutationError}</p> : null}
        {!loading && (data?.length ?? 0) === 0 ? (
          <p className="muted">No filament yet.</p>
        ) : null}
        {!loading && data && data.length > 0 && filtered.length === 0 ? (
          <p className="muted">No rolls match that search.</p>
        ) : null}

        {filtered.length > 0 ? (
          <div className="table-wrap">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th {...sortProps("material")}>Filament</th>
                  <th {...sortProps("manufacturer")}>Maker</th>
                  <th {...sortProps("percent")}>Remaining</th>
                  <th {...sortProps("dried")}>Last dried</th>
                  <th {...sortProps("bag")}>Bag</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((roll) => {
                  const pct = remainingPct(roll);
                  return (
                    <tr key={roll.id}>
                      <td>
                        <strong>{rollTitle(roll)}</strong>
                        {roll.notes ? (
                          <div className="muted">{roll.notes}</div>
                        ) : null}
                      </td>
                      <td>{roll.manufacturer || "—"}</td>
                      <td className="remaining-cell">
                        <div className="meter">
                          <div className="meter-track" aria-hidden="true">
                            <div
                              className="meter-fill"
                              data-level={meterLevel(pct)}
                              style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                            />
                          </div>
                          <div className="row" style={{ gap: "0.4rem" }}>
                            <span className="meter-label">
                              {pct}% · {roll.startingGrams}g
                            </span>
                            <input
                              className="inline-remaining"
                              type="number"
                              min={0}
                              aria-label={`Remaining grams for ${rollTitle(roll)}`}
                              title="Update remaining grams"
                              value={
                                remainingInputs[roll.id] ??
                                String(roll.remainingGrams)
                              }
                              onChange={(e) =>
                                setRemainingInputs((inputs) => ({
                                  ...inputs,
                                  [roll.id]: e.target.value,
                                }))
                              }
                              onBlur={(e) =>
                                updateRemaining(roll.id, e.target.value)
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                            />
                            <span className="meter-label">g left</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        {appConfig ? (
                          <AgeText
                            date={roll.lastDriedAt}
                            thresholds={appConfig.dryThresholdsDays}
                          />
                        ) : (
                          <span className="muted">…</span>
                        )}
                      </td>
                      <td>{roll.openedFromBag ? "Opened" : "Sealed"}</td>
                      <td className="actions">
                        <div className="row">
                          <button
                            type="button"
                            className="btn sm"
                            onClick={() => openEdit(roll)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn secondary sm"
                            onClick={() => markDried(roll.id)}
                          >
                            Dried
                          </button>
                          <button
                            type="button"
                            className="btn secondary sm"
                            onClick={() => toggleOpened(roll)}
                          >
                            Bag
                          </button>
                          <button
                            type="button"
                            className="btn danger sm"
                            onClick={() => onDelete(roll.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {editing ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditing(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(null);
          }}
        >
          <div className="modal wide">
            <h2 className="section-title">Edit filament</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              {rollTitle(editing)}
            </p>
            <form className="stack" onSubmit={saveEdit}>
              <div className="row">
                <div className="field">
                  <label htmlFor="edit-maker">Manufacturer</label>
                  <input
                    id="edit-maker"
                    value={editForm.manufacturer}
                    onChange={(e) =>
                      setEditForm({ ...editForm, manufacturer: e.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-material">Material</label>
                  <input
                    id="edit-material"
                    value={editForm.material}
                    onChange={(e) =>
                      setEditForm({ ...editForm, material: e.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-color">Color</label>
                  <input
                    id="edit-color"
                    value={editForm.color}
                    onChange={(e) =>
                      setEditForm({ ...editForm, color: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="row">
                <div className="field">
                  <label htmlFor="edit-starting">Starting (g)</label>
                  <input
                    id="edit-starting"
                    type="number"
                    min={1}
                    required
                    value={editForm.startingGrams}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        startingGrams: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-remaining">Remaining (g)</label>
                  <input
                    id="edit-remaining"
                    type="number"
                    min={0}
                    required
                    value={editForm.remainingGrams}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        remainingGrams: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <label
                  className="row"
                  style={{ alignSelf: "end", paddingBottom: 8 }}
                >
                  <input
                    type="checkbox"
                    checked={editForm.openedFromBag}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        openedFromBag: e.target.checked,
                      })
                    }
                  />
                  Opened from bag
                </label>
              </div>
              <div className="field">
                <label htmlFor="edit-notes">Notes</label>
                <input
                  id="edit-notes"
                  value={editForm.notes}
                  onChange={(e) =>
                    setEditForm({ ...editForm, notes: e.target.value })
                  }
                />
              </div>
              <div className="row">
                <button className="btn" type="submit" disabled={editBusy}>
                  {editBusy ? "Saving…" : "Save changes"}
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setEditing(null)}
                  disabled={editBusy}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
