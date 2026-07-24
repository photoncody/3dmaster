"use client";

import Link from "next/link";
import { FormEvent, use, useEffect, useRef, useState } from "react";
import { AgeText } from "@/components/AgeText";
import { apiJson, useJson } from "@/lib/client-api";
import {
  downloadForSlicer,
  type SlicerHandoffContext,
} from "@/features/models/slicer-handoff";
import { OpenInBambuStudioButton } from "@/features/models/OpenInBambuStudioButton";
import type { AgeThresholds } from "@/lib/age-color";

type ModelFile = {
  id: string;
  filename: string;
  format: string;
  sizeBytes: number;
};

type Model = {
  id: string;
  name: string;
  description: string;
  files: ModelFile[];
};

type QueueItem = {
  id: string;
  position: number;
  status: string;
  estimatedDurationSeconds: number | null;
  model: Model;
};

type Maintenance = {
  nozzleInstalledAt: string | null;
  lastCleanedAt: string | null;
  notes: string;
};

type Timer = {
  status: string;
  durationSeconds: number;
  remainingSeconds: number;
  linkedQueueItemId: string | null;
  updatedAt: string;
};

type FilamentRoll = {
  id: string;
  name: string;
  manufacturer: string;
  material: string;
  color: string;
  startingGrams: number;
  remainingGrams: number;
  notes: string;
  loadedPrinterId: string | null;
};

type Printer = {
  id: string;
  name: string;
  model: string;
  notes: string;
  queueItems: QueueItem[];
  maintenance: Maintenance | null;
  timer: Timer | null;
  loadedFilaments: FilamentRoll[];
};

type AppConfig = {
  cleanThresholdsDays: AgeThresholds;
};

function formatTime(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.max(0, total % 60);
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function formatDuration(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function remainingPct(roll: { remainingGrams: number; startingGrams: number }) {
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

export default function PrinterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [refresh, setRefresh] = useState(0);
  const [hours, setHours] = useState(2);
  const [minutes, setMinutes] = useState(0);
  const [startHours, setStartHours] = useState(2);
  const [startMinutes, setStartMinutes] = useState(0);
  const [startingItemId, setStartingItemId] = useState<string | null>(null);
  const [modelsRefresh, setModelsRefresh] = useState(0);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [consentOpen, setConsentOpen] = useState(false);
  const [nextItem, setNextItem] = useState<QueueItem | null>(null);
  const [localRemaining, setLocalRemaining] = useState(0);
  const [completionFetchPending, setCompletionFetchPending] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [editingPrinter, setEditingPrinter] = useState(false);
  const [editName, setEditName] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [loadFilamentOpen, setLoadFilamentOpen] = useState(false);
  const [selectedFilamentId, setSelectedFilamentId] = useState("");
  const [filamentBusy, setFilamentBusy] = useState(false);
  const [remainingInputs, setRemainingInputs] = useState<Record<string, string>>(
    {},
  );
  const primaryDialogButtonRef = useRef<HTMLButtonElement | null>(null);

  const { data: printer, error, loading } = useJson<Printer>(
    `/api/printers/${id}`,
    refresh,
  );
  const { data: models } = useJson<Model[]>("/api/models", modelsRefresh);
  const { data: filamentInventory } = useJson<FilamentRoll[]>(
    "/api/filament",
    refresh,
  );
  const { data: timer } = useJson<Timer>(
    `/api/printers/${id}/timer`,
    refresh,
  );
  const { data: appConfig, error: configError } = useJson<AppConfig>("/api/config");
  const timerStatus = timer?.status ?? null;

  const activeItem =
    printer?.queueItems.find((item) => item.status === "printing") ?? null;
  const queuedItems =
    printer?.queueItems.filter((item) => item.status !== "printing") ?? [];
  const hasActivePrint = Boolean(activeItem);
  const submitLabel = hasActivePrint ? "Queue" : "Print";
  const durationSeconds = hours * 3600 + minutes * 60;
  const selectedModel =
    models?.find((model) => model.id === selectedModelId) ?? null;
  const selectedFile = selectedModel?.files[0] ?? null;

  function dismissCompletionPrompt() {
    if (timer?.updatedAt) {
      try {
        sessionStorage.setItem(
          `completed-prompt:${id}:${timer.updatedAt}`,
          "1",
        );
      } catch {
        // ignore quota / private-mode failures
      }
    }
    setConsentOpen(false);
  }

  useEffect(() => {
    if (!printer?.loadedFilaments) return;
    setRemainingInputs(
      Object.fromEntries(
        printer.loadedFilaments.map((roll) => [
          roll.id,
          String(roll.remainingGrams),
        ]),
      ),
    );
  }, [printer?.loadedFilaments]);

  useEffect(() => {
    if (!timer) return;
    setLocalRemaining(timer.remainingSeconds);
    if (timer.status !== "running") setCompletionFetchPending(false);
  }, [timer]);

  useEffect(() => {
    if (timerStatus !== "running" || completionFetchPending) return;
    const handle = window.setInterval(() => {
      setLocalRemaining((r) => {
        if (r <= 1) {
          window.clearInterval(handle);
          setCompletionFetchPending((pending) => {
            if (!pending) setRefresh((n) => n + 1);
            return true;
          });
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(handle);
  }, [timerStatus, completionFetchPending]);

  useEffect(() => {
    if (!timer || !printer) return;
    if (timer.status !== "completed") return;
    const nextQueued = printer.queueItems.filter(
      (item) => item.status !== "printing",
    );
    if (!nextQueued.length) return;
    const key = `completed-prompt:${id}:${timer.updatedAt}`;
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(key) === "1";
    } catch {
      dismissed = false;
    }
    if (dismissed) return;
    setNextItem(nextQueued[0]);
    const est = nextQueued[0].estimatedDurationSeconds;
    if (est && est > 0) {
      setStartHours(Math.floor(est / 3600));
      setStartMinutes(Math.floor((est % 3600) / 60));
    }
    setConsentOpen(true);
  }, [timer, printer, id]);

  useEffect(() => {
    if (consentOpen) primaryDialogButtonRef.current?.focus();
  }, [consentOpen]);

  async function addToQueue(e: FormEvent) {
    e.preventDefault();
    if (!selectedModelId) return;
    if (!hasActivePrint && durationSeconds <= 0) {
      setMutationError("Set how long this print will take");
      return;
    }
    setMutationError(null);
    try {
      await apiJson(`/api/printers/${id}/queue`, {
        method: "POST",
        body: JSON.stringify({
          modelId: selectedModelId,
          durationSeconds:
            durationSeconds > 0 ? durationSeconds : undefined,
        }),
      });
      setSelectedModelId("");
      setRefresh((n) => n + 1);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Failed to queue model");
    }
  }

  async function removeQueueItem(itemId: string) {
    setMutationError(null);
    try {
      await apiJson(`/api/printers/${id}/queue/${itemId}`, { method: "DELETE" });
      setRefresh((n) => n + 1);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Failed to update queue");
    }
  }

  async function moveQueueItem(itemId: string, direction: -1 | 1) {
    if (!printer) return;
    const ids = printer.queueItems.map((i) => i.id);
    const index = ids.indexOf(itemId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    // Keep the active print pinned at the front.
    if (hasActivePrint && (index === 0 || target === 0)) return;
    const next = [...ids];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setMutationError(null);
    try {
      await apiJson(`/api/printers/${id}/queue`, {
        method: "PUT",
        body: JSON.stringify({ orderedIds: next }),
      });
      setRefresh((n) => n + 1);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Failed to reorder queue");
    }
  }

  async function startQueueItem(item: QueueItem, overrideSeconds?: number) {
    const seconds =
      overrideSeconds ??
      item.estimatedDurationSeconds ??
      startHours * 3600 + startMinutes * 60;
    if (!seconds || seconds <= 0) {
      setMutationError("Set how long this print will take before starting");
      setStartingItemId(item.id);
      return;
    }
    setMutationError(null);
    try {
      await apiJson(`/api/printers/${id}/queue/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "start",
          durationSeconds: seconds,
        }),
      });
      setStartingItemId(null);
      setConsentOpen(false);
      setRefresh((n) => n + 1);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Failed to start print");
    }
  }

  async function markCleaned() {
    setMutationError(null);
    try {
      await apiJson(`/api/printers/${id}/maintenance`, {
        method: "PATCH",
        body: JSON.stringify({ markCleaned: true }),
      });
      setRefresh((n) => n + 1);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Failed to update maintenance");
    }
  }

  async function markNozzle() {
    setMutationError(null);
    try {
      await apiJson(`/api/printers/${id}/maintenance`, {
        method: "PATCH",
        body: JSON.stringify({ markNozzleInstalled: true }),
      });
      setRefresh((n) => n + 1);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Failed to update maintenance");
    }
  }

  function filamentTitle(roll: FilamentRoll) {
    const parts = [roll.material, roll.color].filter(Boolean);
    if (parts.length) return parts.join(" · ");
    return roll.name || "Filament";
  }

  const availableFilaments =
    filamentInventory?.filter((roll) => !roll.loadedPrinterId) ?? [];

  function openLoadFilament() {
    setSelectedFilamentId("");
    setLoadFilamentOpen(true);
    setMutationError(null);
  }

  async function confirmLoadFilament(e: FormEvent) {
    e.preventDefault();
    if (!selectedFilamentId) return;
    setFilamentBusy(true);
    setMutationError(null);
    try {
      await apiJson(`/api/filament/${selectedFilamentId}`, {
        method: "PATCH",
        body: JSON.stringify({ loadedPrinterId: id }),
      });
      setLoadFilamentOpen(false);
      setSelectedFilamentId("");
      setRefresh((n) => n + 1);
    } catch (err) {
      setMutationError(
        err instanceof Error ? err.message : "Failed to load filament",
      );
    } finally {
      setFilamentBusy(false);
    }
  }

  async function unloadFilament(filamentId: string) {
    setMutationError(null);
    try {
      await apiJson(`/api/filament/${filamentId}`, {
        method: "PATCH",
        body: JSON.stringify({ loadedPrinterId: null }),
      });
      setRefresh((n) => n + 1);
    } catch (err) {
      setMutationError(
        err instanceof Error ? err.message : "Failed to unload filament",
      );
    }
  }

  async function updateRemaining(filamentId: string, value: string) {
    const remainingGrams = Number(value);
    setMutationError(null);
    if (!Number.isFinite(remainingGrams)) {
      setMutationError("Remaining grams must be a number");
      return;
    }
    try {
      await apiJson(`/api/filament/${filamentId}`, {
        method: "PATCH",
        body: JSON.stringify({ remainingGrams }),
      });
      setRefresh((n) => n + 1);
    } catch (err) {
      setMutationError(
        err instanceof Error ? err.message : "Failed to update filament",
      );
    }
  }

  async function timerAction(action: string) {
    setMutationError(null);
    try {
      await apiJson(`/api/printers/${id}/timer`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      setRefresh((n) => n + 1);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Failed to update timer");
    }
  }

  async function completeActivePrint() {
    setMutationError(null);
    try {
      await apiJson(`/api/printers/${id}/timer`, {
        method: "PATCH",
        body: JSON.stringify({ action: "complete" }),
      });
      setRefresh((n) => n + 1);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Failed to complete print");
    }
  }

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("edit") === "1") {
      setEditingPrinter(true);
    }
  }, []);

  useEffect(() => {
    if (!printer || editingPrinter) return;
    setEditName(printer.name);
    setEditModel(printer.model);
    setEditNotes(printer.notes);
  }, [printer, editingPrinter]);

  function beginEditPrinter() {
    if (!printer) return;
    setEditName(printer.name);
    setEditModel(printer.model);
    setEditNotes(printer.notes);
    setEditingPrinter(true);
    setMutationError(null);
  }

  async function savePrinter(e: FormEvent) {
    e.preventDefault();
    setEditBusy(true);
    setMutationError(null);
    try {
      await apiJson(`/api/printers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName,
          model: editModel,
          notes: editNotes,
        }),
      });
      setEditingPrinter(false);
      setRefresh((n) => n + 1);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Failed to update printer");
    } finally {
      setEditBusy(false);
    }
  }

  async function downloadModel(ctx: SlicerHandoffContext) {
    setMutationError(null);
    try {
      await downloadForSlicer(ctx);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Download failed");
    }
  }

  async function downloadNextModel() {
    if (!nextItem?.model.files[0]) {
      setMutationError("Next model has no files to download");
      return;
    }
    const file = nextItem.model.files[0];
    await downloadModel({
      modelId: nextItem.model.id,
      fileId: file.id,
      filename: file.filename,
      downloadUrl: `/api/models/${nextItem.model.id}/files/${file.id}`,
    });
  }

  async function acceptNextModel() {
    if (!nextItem) {
      dismissCompletionPrompt();
      return;
    }
    const seconds = startHours * 3600 + startMinutes * 60;
    if (seconds <= 0) {
      setMutationError("Set how long the next print will take");
      return;
    }
    setMutationError(null);
    try {
      // Clear the finished active print before promoting the next item.
      if (activeItem) {
        await apiJson(`/api/printers/${id}/timer`, {
          method: "PATCH",
          body: JSON.stringify({ action: "complete" }),
        });
      }
      await startQueueItem(nextItem, seconds);
    } catch (err) {
      setMutationError(
        err instanceof Error ? err.message : "Failed to start next print",
      );
      setRefresh((n) => n + 1);
    }
  }

  if (loading) return <p className="muted">Loading printer…</p>;
  if (error || !printer) return <p className="muted">{error || "Not found"}</p>;

  const status = timerStatus || "idle";

  return (
    <div>
      <div aria-hidden={consentOpen || loadFilamentOpen ? true : undefined}>
        <p className="muted" style={{ marginBottom: "0.75rem" }}>
          <Link href="/printers">← Printers</Link>
        </p>
        <section className="hero">
          <h1>{printer.name}</h1>
          <p>
            {printer.model ||
              printer.notes ||
              "Queue and maintenance for this machine."}
          </p>
          {printer.model && printer.notes ? (
            <p className="muted">{printer.notes}</p>
          ) : null}
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <button
              type="button"
              className="btn secondary"
              onClick={() =>
                editingPrinter ? setEditingPrinter(false) : beginEditPrinter()
              }
            >
              {editingPrinter ? "Cancel edit" : "Edit printer"}
            </button>
          </div>
        </section>

        {editingPrinter ? (
          <div className="panel">
            <h2 className="section-title">Edit printer</h2>
            <form className="stack" onSubmit={savePrinter}>
              <div className="row">
                <div className="field">
                  <label htmlFor="edit-printer-name">Name</label>
                  <input
                    id="edit-printer-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-printer-model">Model</label>
                  <input
                    id="edit-printer-model"
                    value={editModel}
                    onChange={(e) => setEditModel(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-printer-notes">Notes</label>
                  <input
                    id="edit-printer-notes"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="row">
                <button className="btn" type="submit" disabled={editBusy}>
                  {editBusy ? "Saving…" : "Save changes"}
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setEditingPrinter(false)}
                  disabled={editBusy}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {mutationError ? <p className="muted">{mutationError}</p> : null}
        {configError ? <p className="muted">{configError}</p> : null}

        <div className="panel">
          <h2 className="section-title">Print queue</h2>

          {activeItem ? (
            <div className="list-item" style={{ marginBottom: "1rem" }}>
              <div>
                <p className="muted" style={{ marginBottom: "0.25rem" }}>
                  Now printing
                </p>
                <strong>{activeItem.model.name}</strong>
                <div
                  className="timer-display"
                  data-status={status}
                  aria-live="polite"
                  style={{ marginTop: "0.5rem" }}
                >
                  {formatTime(localRemaining)}
                </div>
                <p className="muted" style={{ marginTop: "0.35rem" }}>
                  Status: {status}
                </p>
                <p className="muted">
                  {activeItem.model.files.map((f) => f.filename).join(", ") ||
                    "No files"}
                </p>
              </div>
              <div className="row">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => timerAction("pause")}
                  disabled={status !== "running"}
                >
                  Pause
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => timerAction("resume")}
                  disabled={status !== "paused"}
                >
                  Resume
                </button>
                {activeItem.model.files[0] ? (
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() =>
                      downloadModel({
                        modelId: activeItem.model.id,
                        fileId: activeItem.model.files[0].id,
                        filename: activeItem.model.files[0].filename,
                        downloadUrl: `/api/models/${activeItem.model.id}/files/${activeItem.model.files[0].id}`,
                      })
                    }
                  >
                    Download
                  </button>
                ) : null}
                {activeItem.model.files[0] ? (
                  <OpenInBambuStudioButton
                    className="btn secondary"
                    ctx={{
                      modelId: activeItem.model.id,
                      fileId: activeItem.model.files[0].id,
                      filename: activeItem.model.files[0].filename,
                      downloadUrl: `/api/models/${activeItem.model.id}/files/${activeItem.model.files[0].id}`,
                    }}
                    onError={(message) => setMutationError(message)}
                  />
                ) : null}
                <button
                  type="button"
                  className="btn accent"
                  onClick={completeActivePrint}
                >
                  Mark complete
                </button>
              </div>
            </div>
          ) : null}

          <form className="stack" onSubmit={addToQueue}>
            <div className="row">
              <div className="field">
                <label htmlFor="queue-model">
                  {hasActivePrint ? "Add model to queue" : "Model to print"}
                </label>
                <select
                  id="queue-model"
                  value={selectedModelId}
                  onChange={(e) => setSelectedModelId(e.target.value)}
                  required
                >
                  <option value="">Select a model…</option>
                  {models?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ maxWidth: 100 }}>
                <label htmlFor="hours">
                  Hours{hasActivePrint ? " (optional)" : ""}
                </label>
                <input
                  id="hours"
                  type="number"
                  min={0}
                  max={48}
                  value={hours}
                  required={!hasActivePrint}
                  onChange={(e) => setHours(Number(e.target.value))}
                />
              </div>
              <div className="field" style={{ maxWidth: 100 }}>
                <label htmlFor="minutes">
                  Minutes{hasActivePrint ? " (optional)" : ""}
                </label>
                <input
                  id="minutes"
                  type="number"
                  min={0}
                  max={59}
                  value={minutes}
                  required={!hasActivePrint}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                />
              </div>
            </div>
            {selectedModel && selectedFile ? (
              <div className="stack" style={{ gap: "0.35rem" }}>
                <p className="muted" style={{ margin: 0 }}>
                  {hasActivePrint
                    ? "Optional: open the model in your slicer now, or when you start it from the queue."
                    : "Open the model in your slicer first to learn the print time, then enter hours/minutes and Print."}
                </p>
                <div className="row">
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() =>
                      downloadModel({
                        modelId: selectedModel.id,
                        fileId: selectedFile.id,
                        filename: selectedFile.filename,
                        downloadUrl: `/api/models/${selectedModel.id}/files/${selectedFile.id}`,
                      })
                    }
                  >
                    Download
                  </button>
                  <OpenInBambuStudioButton
                    className="btn secondary"
                    ctx={{
                      modelId: selectedModel.id,
                      fileId: selectedFile.id,
                      filename: selectedFile.filename,
                      downloadUrl: `/api/models/${selectedModel.id}/files/${selectedFile.id}`,
                    }}
                    onError={(message) => setMutationError(message)}
                  />
                </div>
              </div>
            ) : null}
            <div className="row">
              <button className="btn" type="submit">
                {submitLabel}
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setModelsRefresh((n) => n + 1)}
              >
                Refresh models
              </button>
            </div>
          </form>

          <div style={{ marginTop: "1rem" }}>
            {!hasActivePrint && queuedItems.length === 0 ? (
              <p className="muted">Queue is empty.</p>
            ) : null}
            {queuedItems.length > 0 ? (
              <>
                <h3 className="section-title" style={{ fontSize: "1rem" }}>
                  Up next
                </h3>
                {queuedItems.map((item, index) => {
                  const absoluteIndex = hasActivePrint ? index + 1 : index;
                  const canMoveUp = hasActivePrint
                    ? absoluteIndex > 1
                    : absoluteIndex > 0;
                  const canMoveDown =
                    absoluteIndex < printer.queueItems.length - 1;
                  const needsTime =
                    !item.estimatedDurationSeconds ||
                    item.estimatedDurationSeconds <= 0;
                  const isEditingStart = startingItemId === item.id;

                  return (
                    <div key={item.id} className="list-item">
                      <div>
                        <strong>
                          #{index + 1} {item.model.name}
                        </strong>
                        <p className="muted">
                          {item.model.files.map((f) => f.filename).join(", ") ||
                            "No files"}
                          {item.estimatedDurationSeconds
                            ? ` · est. ${formatDuration(item.estimatedDurationSeconds)}`
                            : " · no time set"}
                        </p>
                        {isEditingStart ? (
                          <div className="stack" style={{ marginTop: "0.5rem", gap: "0.35rem" }}>
                            <p className="muted" style={{ margin: 0 }}>
                              Slice the model to get the print time, then enter
                              it below and confirm start.
                            </p>
                            <div className="row">
                              <div className="field" style={{ maxWidth: 100 }}>
                                <label htmlFor={`start-h-${item.id}`}>Hours</label>
                                <input
                                  id={`start-h-${item.id}`}
                                  type="number"
                                  min={0}
                                  max={48}
                                  value={startHours}
                                  onChange={(e) =>
                                    setStartHours(Number(e.target.value))
                                  }
                                />
                              </div>
                              <div className="field" style={{ maxWidth: 100 }}>
                                <label htmlFor={`start-m-${item.id}`}>
                                  Minutes
                                </label>
                                <input
                                  id={`start-m-${item.id}`}
                                  type="number"
                                  min={0}
                                  max={59}
                                  value={startMinutes}
                                  onChange={(e) =>
                                    setStartMinutes(Number(e.target.value))
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div className="row">
                        <button
                          type="button"
                          className="btn secondary"
                          disabled={!canMoveUp}
                          onClick={() => moveQueueItem(item.id, -1)}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          className="btn secondary"
                          disabled={!canMoveDown}
                          onClick={() => moveQueueItem(item.id, 1)}
                        >
                          Down
                        </button>
                        {item.model.files[0] ? (
                          <button
                            type="button"
                            className="btn secondary"
                            onClick={() =>
                              downloadModel({
                                modelId: item.model.id,
                                fileId: item.model.files[0].id,
                                filename: item.model.files[0].filename,
                                downloadUrl: `/api/models/${item.model.id}/files/${item.model.files[0].id}`,
                              })
                            }
                          >
                            Download
                          </button>
                        ) : null}
                        {item.model.files[0] ? (
                          <OpenInBambuStudioButton
                            className="btn secondary"
                            ctx={{
                              modelId: item.model.id,
                              fileId: item.model.files[0].id,
                              filename: item.model.files[0].filename,
                              downloadUrl: `/api/models/${item.model.id}/files/${item.model.files[0].id}`,
                            }}
                            onError={(message) => setMutationError(message)}
                          />
                        ) : null}
                        {!hasActivePrint ? (
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              if (needsTime && !isEditingStart) {
                                setStartingItemId(item.id);
                                return;
                              }
                              void startQueueItem(item);
                            }}
                          >
                            {isEditingStart ? "Confirm start" : "Start"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn"
                          onClick={() => removeQueueItem(item.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : null}
          </div>
        </div>

        <div className="panel">
          <h2 className="section-title">Loaded filament</h2>
          {(printer.loadedFilaments?.length ?? 0) === 0 ? (
            <p className="muted">No filament loaded on this printer.</p>
          ) : (
            <div className="stack">
              {printer.loadedFilaments.map((roll) => {
                const pct = remainingPct(roll);
                return (
                  <div key={roll.id} className="list-item">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong>{filamentTitle(roll)}</strong>
                      {roll.manufacturer ? (
                        <div className="muted">{roll.manufacturer}</div>
                      ) : null}
                      <div className="meter" style={{ marginTop: "0.5rem" }}>
                        <div className="meter-track" aria-hidden="true">
                          <div
                            className="meter-fill"
                            data-level={meterLevel(pct)}
                            style={{
                              width: `${Math.min(100, Math.max(0, pct))}%`,
                            }}
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
                            aria-label={`Remaining grams for ${filamentTitle(roll)}`}
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
                    </div>
                    <div className="row">
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => unloadFilament(roll.id)}
                      >
                        Unload
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <button
              type="button"
              className="btn"
              onClick={openLoadFilament}
              disabled={availableFilaments.length === 0}
              title={
                availableFilaments.length
                  ? "Load a filament roll"
                  : "No available filament rolls"
              }
            >
              Load filament
            </button>
          </div>
        </div>

        <div className="panel">
          <h2 className="section-title">Maintenance</h2>
          <div className="stack">
            <p>
              Last cleaned:{" "}
              {appConfig ? (
                <AgeText
                  date={printer.maintenance?.lastCleanedAt}
                  thresholds={appConfig.cleanThresholdsDays}
                />
              ) : (
                <span className="muted">Loading…</span>
              )}
            </p>
            <p>
              Nozzle installed:{" "}
              {appConfig ? (
                <AgeText
                  date={printer.maintenance?.nozzleInstalledAt}
                  thresholds={appConfig.cleanThresholdsDays}
                />
              ) : (
                <span className="muted">Loading…</span>
              )}
            </p>
            <div className="row">
              <button type="button" className="btn" onClick={markCleaned}>
                Cleaned now
              </button>
              <button type="button" className="btn secondary" onClick={markNozzle}>
                New nozzle installed
              </button>
            </div>
          </div>
        </div>
      </div>

      {consentOpen && nextItem ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onKeyDown={(e) => {
            if (e.key === "Escape") dismissCompletionPrompt();
          }}
        >
          <div className="modal">
            <h2 className="section-title">Print finished</h2>
            <p>
              Next up: <strong>{nextItem.model.name}</strong>. Open it in your
              slicer first so you know how long it will take, then start the
              timer.
            </p>
            <div className="row" style={{ marginTop: "0.75rem" }}>
              <button
                ref={primaryDialogButtonRef}
                type="button"
                className="btn"
                onClick={downloadNextModel}
                disabled={!nextItem.model.files[0]}
              >
                Download for slicer
              </button>
              {nextItem.model.files[0] ? (
                <OpenInBambuStudioButton
                  className="btn secondary"
                  ctx={{
                    modelId: nextItem.model.id,
                    fileId: nextItem.model.files[0].id,
                    filename: nextItem.model.files[0].filename,
                    downloadUrl: `/api/models/${nextItem.model.id}/files/${nextItem.model.files[0].id}`,
                  }}
                  onError={(message) => setMutationError(message)}
                />
              ) : null}
            </div>
            <div className="row" style={{ marginTop: "0.75rem" }}>
              <div className="field" style={{ maxWidth: 100 }}>
                <label htmlFor="next-hours">Hours</label>
                <input
                  id="next-hours"
                  type="number"
                  min={0}
                  max={48}
                  value={startHours}
                  onChange={(e) => setStartHours(Number(e.target.value))}
                />
              </div>
              <div className="field" style={{ maxWidth: 100 }}>
                <label htmlFor="next-minutes">Minutes</label>
                <input
                  id="next-minutes"
                  type="number"
                  min={0}
                  max={59}
                  value={startMinutes}
                  onChange={(e) => setStartMinutes(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="row" style={{ marginTop: "1rem" }}>
              <button
                type="button"
                className="btn accent"
                onClick={acceptNextModel}
              >
                Start next print
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={dismissCompletionPrompt}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {loadFilamentOpen ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLoadFilamentOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setLoadFilamentOpen(false);
          }}
        >
          <div className="modal">
            <h2 className="section-title">Load filament</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Choose an available roll to load onto {printer.name}.
            </p>
            <form className="stack" onSubmit={confirmLoadFilament}>
              <div className="field">
                <label htmlFor="load-filament">Filament</label>
                <select
                  id="load-filament"
                  value={selectedFilamentId}
                  onChange={(e) => setSelectedFilamentId(e.target.value)}
                  required
                >
                  <option value="">Select a roll…</option>
                  {availableFilaments.map((roll) => (
                    <option key={roll.id} value={roll.id}>
                      {filamentTitle(roll)}
                      {roll.manufacturer ? ` · ${roll.manufacturer}` : ""}
                      {` · ${Math.round(roll.remainingGrams)}g`}
                    </option>
                  ))}
                </select>
              </div>
              {availableFilaments.length === 0 ? (
                <p className="muted">No available filament rolls to load.</p>
              ) : null}
              <div className="row">
                <button
                  className="btn"
                  type="submit"
                  disabled={filamentBusy || !selectedFilamentId}
                >
                  {filamentBusy ? "Loading…" : "Load onto printer"}
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setLoadFilamentOpen(false)}
                  disabled={filamentBusy}
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
