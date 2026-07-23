import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { config } from "@/lib/config";
import {
  mintDownloadToken,
  sanitizePublicOrigin,
} from "@/lib/download-token";

type Ctx = { params: Promise<{ id: string; fileId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id, fileId } = await ctx.params;
    const file = await prisma.modelFile.findFirst({
      where: { id: fileId, modelId: id },
    });
    if (!file) return jsonError("File not found", 404);

    const body = (await request.json().catch(() => ({}))) as {
      origin?: unknown;
    };
    if (typeof body.origin !== "string") {
      return jsonError("origin is required", 400);
    }

    let origin: string;
    try {
      origin = sanitizePublicOrigin(body.origin);
    } catch {
      return jsonError("Invalid origin", 400);
    }

    const path = `/api/models/${id}/files/${fileId}`;
    if (config.authEnabled) {
      const token = mintDownloadToken(id, fileId);
      return jsonOk({
        url: `${origin}${path}?token=${encodeURIComponent(token)}`,
      });
    }
    return jsonOk({ url: `${origin}${path}` });
  } catch (err) {
    return handleApiError(err);
  }
}
