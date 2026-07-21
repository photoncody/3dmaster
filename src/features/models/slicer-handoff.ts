/**
 * Extension point for future slicer / printer handoff (Bambu LAN, etc.).
 * v1 ships download-only; register adapters here later.
 */
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

export function registerSlicerAdapter(adapter: SlicerHandoffAdapter) {
  adapters.push(adapter);
}

export function listSlicerAdapters(
  ctx: SlicerHandoffContext,
): SlicerHandoffAdapter[] {
  return adapters.filter((a) => a.canHandle(ctx));
}

export function clearSlicerAdapters() {
  adapters.length = 0;
}

export function downloadForSlicer(ctx: SlicerHandoffContext) {
  const a = document.createElement("a");
  a.href = ctx.downloadUrl;
  a.download = ctx.filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
