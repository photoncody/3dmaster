"use client";

import dynamic from "next/dynamic";
import { FormEvent, useMemo, useState } from "react";
import { apiJson, useJson } from "@/lib/client-api";
import { downloadForSlicer } from "@/features/models/slicer-handoff";

const ModelViewer = dynamic(
  () => import("@/features/models/ModelViewer").then((m) => m.ModelViewer),
  { ssr: false, loading: () => <p className="muted">Loading viewer…</p> },
);

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

const VIEWABLE = new Set(["stl", "obj", "3mf"]);

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ModelsPage() {
  const [refresh, setRefresh] = useState(0);
  const { data, error, loading } = useJson<Model[]>("/api/models", refresh);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [expandedViewer, setExpandedViewer] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const models = data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return models;
    return models.filter((model) => {
      const haystack = [
        model.name,
        model.description,
        ...model.files.map((f) => `${f.filename} ${f.format}`),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [data, search]);

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setFormError(null);
    try {
      const form = new FormData();
      form.set("name", name);
      form.set("description", description);
      form.set("file", file);
      const res = await fetch("/api/models", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Upload failed");
      setName("");
      setDescription("");
      setFile(null);
      setRefresh((n) => n + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this model and its files from the server?")) return;
    setMutationError(null);
    try {
      await apiJson(`/api/models/${id}`, { method: "DELETE" });
      setRefresh((n) => n + 1);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Failed to delete model");
    }
  }

  async function onDownload(model: Model, file: ModelFile) {
    setMutationError(null);
    try {
      await downloadForSlicer({
        modelId: model.id,
        fileId: file.id,
        filename: file.filename,
        downloadUrl: `/api/models/${model.id}/files/${file.id}`,
      });
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Download failed");
    }
  }

  return (
    <div>
      <section className="hero">
        <h1>Model inventory</h1>
        <p>
          Upload STL, 3MF, and other print files. They stay on this server until
          you remove them. Preview is collapsed by default.
        </p>
      </section>

      <div className="panel">
        <h2 className="section-title">Upload model</h2>
        <form className="stack" onSubmit={onUpload}>
          <div className="row">
            <div className="field">
              <label htmlFor="model-name">Name</label>
              <input
                id="model-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="model-file">File</label>
              <input
                id="model-file"
                type="file"
                accept=".stl,.3mf,.obj,.gcode,.gco,.step,.stp,.amf"
                required
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="model-desc">Description</label>
            <textarea
              id="model-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {formError ? <p className="muted">{formError}</p> : null}
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Uploading…" : "Upload"}
          </button>
        </form>
      </div>

      <div className="panel">
        <h2 className="section-title">Library</h2>
        <div className="toolbar">
          <div className="field">
            <label htmlFor="model-search">Search</label>
            <input
              id="model-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, description, filename…"
            />
          </div>
          <p className="muted" style={{ margin: 0, paddingBottom: 8 }}>
            {loading
              ? "Loading…"
              : `${filtered.length} of ${data?.length ?? 0} models`}
          </p>
        </div>
        {error ? <p className="muted">{error}</p> : null}
        {mutationError ? <p className="muted">{mutationError}</p> : null}
        {!loading && (data?.length ?? 0) === 0 ? (
          <p className="muted">No models yet.</p>
        ) : null}
        {!loading && data && data.length > 0 && filtered.length === 0 ? (
          <p className="muted">No models match that search.</p>
        ) : null}
        {filtered.map((model) => {
          const file0 = model.files[0];
          const canView =
            file0 && VIEWABLE.has(file0.format.toLowerCase());
          const viewerKey = `${model.id}:${file0?.id || ""}`;
          const open = expandedViewer === viewerKey;

          return (
            <div
              key={model.id}
              className="list-item compact"
              style={{ flexDirection: "column", alignItems: "stretch" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "0.6rem",
                  width: "100%",
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                  <strong>{model.name}</strong>
                  {model.description ? (
                    <p className="muted">{model.description}</p>
                  ) : null}
                  <p className="muted">
                    {file0
                      ? `${file0.filename} · ${formatBytes(file0.sizeBytes)}`
                      : "No files"}
                  </p>
                </div>
                <div className="row">
                  {file0 ? (
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => onDownload(model, file0)}
                    >
                      Download
                    </button>
                  ) : null}
                  {canView ? (
                    <button
                      type="button"
                      className="btn secondary sm"
                      onClick={() =>
                        setExpandedViewer(open ? null : viewerKey)
                      }
                    >
                      {open ? "Hide 3D" : "3D view"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn danger sm"
                    onClick={() => onDelete(model.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
              {open && file0 ? (
                <ModelViewer
                  url={`/api/models/${model.id}/files/${file0.id}/view`}
                  format={file0.format}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
