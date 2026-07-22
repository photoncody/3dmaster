import fs from "fs";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError } from "@/lib/api";
import { clientIpFromRequest, rateLimit } from "@/lib/rate-limit";
import { resolveModelStoragePath } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string; fileId: string }> };

const VIEWABLE = new Set(["stl", "obj", "3mf"]);
const VIEW_MAX = 50 * 1024 * 1024;

export async function GET(request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const limited = rateLimit(
      `view:${clientIpFromRequest(request)}`,
      60,
      60_000,
    );
    if (!limited.ok) return jsonError("Too many view requests", 429);

    const { id, fileId } = await ctx.params;
    const file = await prisma.modelFile.findFirst({
      where: { id: fileId, modelId: id },
    });
    if (!file) return jsonError("File not found", 404);
    if (!VIEWABLE.has(file.format.toLowerCase())) {
      return jsonError("File format is not viewable in-browser", 415);
    }
    if (file.sizeBytes > VIEW_MAX) {
      return jsonError("File too large to view in-browser", 413);
    }

    const absolute = resolveModelStoragePath(file.storagePath);
    if (!fs.existsSync(absolute)) {
      return jsonError("File missing on disk", 404);
    }
    const stat = fs.statSync(absolute);
    if (stat.size > VIEW_MAX) {
      return jsonError("File too large to view in-browser", 413);
    }

    const data = fs.readFileSync(absolute);
    return new Response(data, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
