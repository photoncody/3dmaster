import fs from "fs";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError } from "@/lib/api";
import { resolveModelStoragePath } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string; fileId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id, fileId } = await ctx.params;
    const file = await prisma.modelFile.findFirst({
      where: { id: fileId, modelId: id },
    });
    if (!file) return jsonError("File not found", 404);

    const absolute = resolveModelStoragePath(file.storagePath);
    if (!fs.existsSync(absolute)) {
      return jsonError("File missing on disk", 404);
    }

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
        "Content-Disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
        "Content-Length": String(file.sizeBytes),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
