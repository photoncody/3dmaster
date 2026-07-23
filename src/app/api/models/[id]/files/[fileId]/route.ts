import fs from "fs";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError } from "@/lib/api";
import { resolveModelStoragePath, sanitizeFilename } from "@/lib/storage";
import { verifyDownloadToken } from "@/lib/download-token";
import { config } from "@/lib/config";

type Ctx = { params: Promise<{ id: string; fileId: string }> };

function contentDisposition(filename: string): string {
  const safe = sanitizeFilename(filename)
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/"/g, "");
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { id, fileId } = await ctx.params;
    const token = new URL(request.url).searchParams.get("token");

    if (token) {
      if (!config.authEnabled) {
        // Tokens are only minted when auth is on; ignore stray tokens.
      } else {
        try {
          verifyDownloadToken(token, { modelId: id, fileId });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Invalid download token";
          return jsonError(message, 401);
        }
      }
    } else {
      await requireAuth();
    }

    const file = await prisma.modelFile.findFirst({
      where: { id: fileId, modelId: id },
    });
    if (!file) return jsonError("File not found", 404);

    const absolute = resolveModelStoragePath(file.storagePath);
    if (!fs.existsSync(absolute)) {
      return jsonError("File missing on disk", 404);
    }
    const stat = fs.statSync(absolute);

    const stream = fs.createReadStream(absolute);
    const webStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => {
          controller.enqueue(
            typeof chunk === "string" ? Buffer.from(chunk) : chunk,
          );
        });
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      },
    });

    return new Response(webStream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": contentDisposition(file.filename),
        "Content-Length": String(stat.size),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
