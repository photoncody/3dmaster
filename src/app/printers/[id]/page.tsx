"use client";

import Link from "next/link";
import { FormEvent, use, useEffect, useMemo, useState } from "react";
import { AgeText } from "@/components/AgeText";
import { apiJson, useJson } from "@/lib/client-api";
import { downloadForSlicer } from "@/features/models/slicer-handoff";

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
};

type Printer = {
  id: string;
  name: string;
  notes: string;
  queueItems: QueueItem[];
  maintenance: Maintenance | null;
  timer: Timer | null;
};

function formatTime(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.max(0, total % 60);
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
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
  const [modelsRefresh, setModelsRefresh] = useState(0);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [consentOpen, setConsentOpen] = useState(false);
  const [nextItem, setNextItem] = useState<QueueItem | null>(null);
  const [localRemaining, setLocalRemaining] = useState(0);
  const [completedPrompted, setCompletedPrompted] = useState(false);

  const { data: printer, error, loading } = useJson<Printer>(
    `/api/printers/${id}`,
    refresh,
  );
  const { data: models } = useJson<Model[]>("/api/models", modelsRefresh);
  const { data: timer } = useJson<Timer>(
    `/api/printers/${id}/timer`,
    refresh,
  );

  useEffect(() => {
    if (!timer) return;
    setLocalRemaining(timer.remainingSeconds);
    if (timer.status !== "completed") setCompletedPrompted(false);
  }, [timer]);

  useEffect(() => {
    if (!timer || timer.status !== "running") return;
    const handle = window.setInterval(() => {
      setLocalRemaining((r) => {
        if (r <= 1) {
          window.clearInterval(handle);
          setRefresh((n) => n + 1);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(handle);
  }, [timer?.status, timer, refresh]);

  useEffect(() => {
    if (
      timer?.status === "completed" &&
      printer?.queueItems?.length &&
      !completedPrompted
    ) {
      setNextItem(printer.queueItems[0]);
      setConsentOpen(true);
      setCompletedPrompted(true);
    }
  }, [timer?.status, printer?.queueItems, completedPrompted]);

  const thresholds = useMemo(
    () => ({ green: 7, yellow: 14, orange: 30 }),
    [],
  );

  async function addToQueue(e: FormEvent) {
    e.preventDefault();
    if (!selectedModelId) return;
    await apiJson(`/api/printers/${id}/queue`, {
      method: "POST",
      body: JSON.stringify({ modelId: selectedModelId }),
    });
    setSelectedModelId("");
    setRefresh((n) => n + 1);
  }

  async function removeQueueItem(itemId: string) {
    await apiJson(`/api/printers/${id}/queue/${itemId}`, { method: "DELETE" });
    setRefresh((n) => n + 1);
  }

  async function moveQueueItem(itemId: string, direction: -1 | 1) {
    if (!printer) return;
    const ids = printer.queueItems.map((i) => i.id);
    const index = ids.indexOf(itemId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    const next = [...ids];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    await apiJson(`/api/printers/${id}/queue`, {
      method: "PUT",
      body: JSON.stringify({ orderedIds: next }),
    });
    setRefresh((n) => n + 1);
  }

  async function markCleaned() {
    await apiJson(`/api/printers/${id}/maintenance`, {
      method: "PATCH",
      body: JSON.stringify({ markCleaned: true }),
    });
    setRefresh((n) => n + 1);
  }

  async function markNozzle() {
    await apiJson(`/api/printers/${id}/maintenance`, {
      method: "PATCH",
      body: JSON.stringify({ markNozzleInstalled: true }),
    });
    setRefresh((n) => n + 1);
  }

  async function timerAction(action: string) {
    const durationSeconds = hours * 3600 + minutes * 60;
    await apiJson(`/api/printers/${id}/timer`, {
      method: "PATCH",
      body: JSON.stringify({
        action,
        durationSeconds:
          action === "set" || action === "start" ? durationSeconds : undefined,
      }),
    });
    setRefresh((n) => n + 1);
  }

  function acceptNextModel() {
    if (!nextItem?.model.files[0]) {
      setConsentOpen(false);
      return;
    }
    const file = nextItem.model.files[0];
    downloadForSlicer({
      modelId: nextItem.model.id,
      fileId: file.id,
      filename: file.filename,
      downloadUrl: `/api/models/${nextItem.model.id}/files/${file.id}`,
    });
    setConsentOpen(false);
  }

  if (loading) return <p className="muted">Loading printer…</p>;
  if (error || !printer) return <p className="muted">{error || "Not found"}</p>;

  const status = timer?.status || "idle";

  return (
    <div>
      <p className="muted" style={{ marginBottom: "0.75rem" }}>
        <Link href="/printers">← Printers</Link>
      </p>
      <section className="hero">
        <h1>{printer.name}</h1>
        <p>{printer.notes || "Queue, maintenance, and timer for this machine."}</p>
      </section>

      <div className="panel">
        <h2 className="section-title">Print timer</h2>
        <div className="timer-display" data-status={status} aria-live="polite">
          {formatTime(localRemaining)}
        </div>
        <p className="muted" style={{ marginTop: "0.35rem" }}>
          Status: {status}
        </p>
        <div className="row" style={{ marginTop: "0.75rem" }}>
          <div className="field" style={{ maxWidth: 100 }}>
            <label htmlFor="hours">Hours</label>
            <input
              id="hours"
              type="number"
              min={0}
              max={48}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
            />
          </div>
          <div className="field" style={{ maxWidth: 100 }}>
            <label htmlFor="minutes">Minutes</label>
            <input
              id="minutes"
              type="number"
              min={0}
              max={59}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="row" style={{ marginTop: "0.75rem" }}>
          <button type="button" className="btn secondary" onClick={() => timerAction("set")}>
            Set duration
          </button>
          <button type="button" className="btn" onClick={() => timerAction("start")}>
            Start
          </button>
          <button type="button" className="btn secondary" onClick={() => timerAction("pause")}>
            Pause
          </button>
          <button type="button" className="btn secondary" onClick={() => timerAction("resume")}>
            Resume
          </button>
          <button type="button" className="btn secondary" onClick={() => timerAction("reset")}>
            Reset
          </button>
          <button type="button" className="btn accent" onClick={() => timerAction("complete")}>
            Mark complete
          </button>
        </div>
      </div>

      <div className="panel">
        <h2 className="section-title">Print queue</h2>
        <form className="row" onSubmit={addToQueue}>
          <div className="field">
            <label htmlFor="queue-model">Add model</label>
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
          <button className="btn" type="submit" style={{ alignSelf: "end" }}>
            Queue
          </button>
          <button
            type="button"
            className="btn secondary"
            style={{ alignSelf: "end" }}
            onClick={() => setModelsRefresh((n) => n + 1)}
          >
            Refresh models
          </button>
        </form>
        <div style={{ marginTop: "0.5rem" }}>
          {printer.queueItems.length === 0 ? (
            <p className="muted">Queue is empty.</p>
          ) : (
            printer.queueItems.map((item, index) => (
              <div key={item.id} className="list-item">
                <div>
                  <strong>
                    #{index + 1} {item.model.name}
                  </strong>
                  <p className="muted">
                    {item.model.files.map((f) => f.filename).join(", ") ||
                      "No files"}
                  </p>
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={index === 0}
                    onClick={() => moveQueueItem(item.id, -1)}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={index === printer.queueItems.length - 1}
                    onClick={() => moveQueueItem(item.id, 1)}
                  >
                    Down
                  </button>
                  {item.model.files[0] ? (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() =>
                        downloadForSlicer({
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
                  <button
                    type="button"
                    className="btn"
                    onClick={() => removeQueueItem(item.id)}
                  >
                    Done / remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="panel">
        <h2 className="section-title">Maintenance</h2>
        <div className="stack">
          <p>
            Last cleaned:{" "}
            <AgeText
              date={printer.maintenance?.lastCleanedAt}
              thresholds={thresholds}
            />
          </p>
          <p>
            Nozzle installed:{" "}
            <AgeText
              date={printer.maintenance?.nozzleInstalledAt}
              thresholds={thresholds}
            />
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

      {consentOpen && nextItem ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h2 className="section-title">Print finished</h2>
            <p>
              Load the next queued model{" "}
              <strong>{nextItem.model.name}</strong> for your slicer?
            </p>
            <div className="row" style={{ marginTop: "1rem" }}>
              <button type="button" className="btn" onClick={acceptNextModel}>
                Yes, download next
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setConsentOpen(false)}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
