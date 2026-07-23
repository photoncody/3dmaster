/**
 * Extension point for slicer / printer handoff.
 * Built-in: Bambu Studio deep-link open. Download remains the universal fallback.
 */
import { bambuStudioAdapter } from "@/features/models/adapters/bambu-studio";

export type SlicerHandoffContext = {
  modelId: string;
  fileId: string;
  filename: string;
  downloadUrl: string;
};

export type SlicerHandoffAdapter = {
  id: string;
  label: string;
  /** Return true if this adapter can handle the file. */
  canHandle: (ctx: SlicerHandoffContext) => boolean;
  /** Perform handoff. Throw on failure. */
  send: (ctx: SlicerHandoffContext) => Promise<void>;
};

const adapters: SlicerHandoffAdapter[] = [];
let defaultsReady = false;

export function registerSlicerAdapter(adapter: SlicerHandoffAdapter) {
  adapters.push(adapter);
}

/** Register built-in adapters (idempotent). Call from client UI before listing/sending. */
export function registerDefaultSlicerAdapters() {
  if (defaultsReady) return;
  defaultsReady = true;
  if (!adapters.some((a) => a.id === bambuStudioAdapter.id)) {
    registerSlicerAdapter(bambuStudioAdapter);
  }
}

export function listSlicerAdapters(
  ctx: SlicerHandoffContext,
): SlicerHandoffAdapter[] {
  registerDefaultSlicerAdapters();
  return adapters.filter((a) => a.canHandle(ctx));
}

export function clearSlicerAdapters() {
  adapters.length = 0;
  defaultsReady = false;
}

export async function sendToSlicer(
  adapterId: string,
  ctx: SlicerHandoffContext,
): Promise<void> {
  const adapter = listSlicerAdapters(ctx).find((a) => a.id === adapterId);
  if (!adapter) {
    throw new Error("This slicer cannot open this file type");
  }
  await adapter.send(ctx);
}

export async function downloadForSlicer(ctx: SlicerHandoffContext) {
  const res = await fetch(ctx.downloadUrl, {
    credentials: "same-origin",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Download failed");
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = ctx.filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
