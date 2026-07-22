import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { config } from "@/lib/config";
import { clientIpFromRequest, rateLimit } from "@/lib/rate-limit";
import {
  ensureDataDirs,
  getExtension,
  isAllowedModelFile,
  sanitizeFilename,
  writeModelFile,
} from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAuth();
    const models = await prisma.model.findMany({
      orderBy: { name: "asc" },
      include: { files: true, _count: { select: { queueItems: true } } },
    });
    return jsonOk(models);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    await requireAuth();
    const limited = rateLimit(
      `upload:${clientIpFromRequest(request)}`,
      20,
      60_000,
    );
    if (!limited.ok) return jsonError("Too many upload requests", 429);

    await ensureDataDirs();

    const form = await request.formData();
    const name = String(form.get("name") || "").trim();
    const description = String(form.get("description") || "").trim();
    const file = form.get("file");

    if (!name) return jsonError("Name is required");
    if (name.length > 200) {
      return jsonError("Name must be at most 200 characters");
    }
    if (description.length > 5000) {
      return jsonError("Description must be at most 5000 characters");
    }
    if (!(file instanceof File)) return jsonError("File is required");
    const safeName = sanitizeFilename(file.name);
    if (!isAllowedModelFile(safeName)) {
      return jsonError(
        `Unsupported file type. Allowed: ${config.allowedModelExtensions.join(", ")}`,
      );
    }
    if (file.size > config.maxUploadBytes) {
      return jsonError(
        `File too large. Max ${Math.round(config.maxUploadBytes / (1024 * 1024))} MB`,
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const model = await prisma.model.create({
      data: { name, description },
    });

    try {
      const stored = await writeModelFile(model.id, safeName, buffer);
      await prisma.modelFile.create({
        data: {
          modelId: model.id,
          filename: safeName,
          format: getExtension(safeName).replace(".", ""),
          storagePath: stored.storagePath,
          sizeBytes: buffer.length,
        },
      });
    } catch (err) {
      await prisma.model.delete({ where: { id: model.id } });
      throw err;
    }

    const full = await prisma.model.findUnique({
      where: { id: model.id },
      include: { files: true },
    });
    return jsonOk(full, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

const metaSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
});

export async function PATCH(request: Request) {
  // Bulk not used; keep for future. Prefer /api/models/[id]
  try {
    await requireAuth();
    metaSchema.parse(await request.json());
    return jsonError("Use /api/models/[id]", 405);
  } catch (err) {
    return handleApiError(err);
  }
}
