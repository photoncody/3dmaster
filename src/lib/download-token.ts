import { createHmac, timingSafeEqual } from "crypto";
import { config } from "@/lib/config";

export type DownloadTokenPayload = {
  modelId: string;
  fileId: string;
  exp: number;
};

function b64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlDecode(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

function signingSecret(): string {
  const secret = config.authSecret;
  if (!secret) {
    throw new Error("AUTH_SECRET is required to mint download tokens");
  }
  return secret;
}

export function mintDownloadToken(
  modelId: string,
  fileId: string,
  ttlSeconds = config.slicerHandoffTokenTtlSeconds,
): string {
  const payload: DownloadTokenPayload = {
    modelId,
    fileId,
    exp: Date.now() + ttlSeconds * 1000,
  };
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = b64urlEncode(
    createHmac("sha256", signingSecret()).update(body).digest(),
  );
  return `${body}.${sig}`;
}

export function verifyDownloadToken(
  token: string,
  expected: { modelId: string; fileId: string },
): DownloadTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid download token");
  }
  const [body, sig] = parts;
  const expectedSig = createHmac("sha256", signingSecret())
    .update(body)
    .digest();
  let actualSig: Buffer;
  try {
    actualSig = b64urlDecode(sig);
  } catch {
    throw new Error("Invalid download token");
  }
  if (
    actualSig.length !== expectedSig.length ||
    !timingSafeEqual(actualSig, expectedSig)
  ) {
    throw new Error("Invalid download token");
  }

  let payload: DownloadTokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf8")) as DownloadTokenPayload;
  } catch {
    throw new Error("Invalid download token");
  }

  if (
    typeof payload.modelId !== "string" ||
    typeof payload.fileId !== "string" ||
    typeof payload.exp !== "number"
  ) {
    throw new Error("Invalid download token");
  }
  if (payload.modelId !== expected.modelId || payload.fileId !== expected.fileId) {
    throw new Error("Invalid download token");
  }
  if (Date.now() > payload.exp) {
    throw new Error("Download token expired");
  }
  return payload;
}

/** Accept only http(s) origins with no path/query/credentials. */
export function sanitizePublicOrigin(origin: string): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error("Invalid origin");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Invalid origin");
  }
  if (url.username || url.password) {
    throw new Error("Invalid origin");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("Invalid origin");
  }
  if (url.search || url.hash) {
    throw new Error("Invalid origin");
  }
  return url.origin;
}
