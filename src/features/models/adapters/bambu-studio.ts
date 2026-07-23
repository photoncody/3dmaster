import type {
  SlicerHandoffAdapter,
  SlicerHandoffContext,
} from "@/features/models/slicer-handoff";

/** Formats Bambu Studio can reliably open via URL handoff. */
export const BAMBU_STUDIO_FORMATS = new Set(["3mf", "stl", "obj"]);

export type ClientOsFamily = "macos" | "other";

export function detectClientOsFamily(
  userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "",
): ClientOsFamily {
  // Desktop Mac only — iPhone/iPad report Mac-like strings in some cases.
  if (
    /Macintosh|Mac OS X/i.test(userAgent) &&
    !/iPhone|iPod|iPad/i.test(userAgent)
  ) {
    return "macos";
  }
  return "other";
}

export function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  if (i < 0) return "";
  return filename.slice(i + 1).toLowerCase();
}

export function canOpenInBambuStudio(filename: string): boolean {
  return BAMBU_STUDIO_FORMATS.has(extensionOf(filename));
}

/**
 * Build a Bambu Studio deep link for a publicly fetchable model URL.
 * Windows/Linux: bambustudio://open?file={url}
 * macOS: bambustudioopen://{urlencoded url}
 */
export function buildBambuStudioDeepLink(
  absoluteFileUrl: string,
  os: ClientOsFamily = detectClientOsFamily(),
): string {
  if (os === "macos") {
    return `bambustudioopen://${encodeURIComponent(absoluteFileUrl)}`;
  }
  return `bambustudio://open?file=${encodeURIComponent(absoluteFileUrl)}`;
}

export function openDeepLink(deepLink: string): void {
  const a = document.createElement("a");
  a.href = deepLink;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function resolveAbsoluteDownloadUrl(
  ctx: SlicerHandoffContext,
): Promise<string> {
  const origin = window.location.origin;
  const res = await fetch(
    `/api/models/${ctx.modelId}/files/${ctx.fileId}/slicer-link`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin }),
    },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || "Failed to create slicer link");
  }
  if (typeof body.url !== "string" || !body.url) {
    throw new Error("Failed to create slicer link");
  }
  return body.url as string;
}

export const bambuStudioAdapter: SlicerHandoffAdapter = {
  id: "bambu-studio",
  label: "Open in Bambu Studio",
  canHandle: (ctx) => canOpenInBambuStudio(ctx.filename),
  async send(ctx) {
    const absoluteUrl = await resolveAbsoluteDownloadUrl(ctx);
    const deepLink = buildBambuStudioDeepLink(absoluteUrl);
    openDeepLink(deepLink);
  },
};
