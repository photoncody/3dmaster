import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  nozzleInstalledAt: z.string().datetime().nullable().optional(),
  lastCleanedAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000).optional(),
  markCleaned: z.boolean().optional(),
  markNozzleInstalled: z.boolean().optional(),
});

export async function GET(_request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id: printerId } = await ctx.params;
    const maintenance = await prisma.printerMaintenance.upsert({
      where: { printerId },
      create: { printerId },
      update: {},
    });
    return jsonOk(maintenance);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id: printerId } = await ctx.params;
    const body = patchSchema.parse(await request.json());

    const data: {
      nozzleInstalledAt?: Date | null;
      lastCleanedAt?: Date | null;
      notes?: string;
    } = {};

    if (body.markCleaned) data.lastCleanedAt = new Date();
    else if (body.lastCleanedAt !== undefined) {
      data.lastCleanedAt = body.lastCleanedAt
        ? new Date(body.lastCleanedAt)
        : null;
    }

    if (body.markNozzleInstalled) data.nozzleInstalledAt = new Date();
    else if (body.nozzleInstalledAt !== undefined) {
      data.nozzleInstalledAt = body.nozzleInstalledAt
        ? new Date(body.nozzleInstalledAt)
        : null;
    }

    if (body.notes !== undefined) data.notes = body.notes;

    const maintenance = await prisma.printerMaintenance.upsert({
      where: { printerId },
      create: { printerId, ...data },
      update: data,
    });
    return jsonOk(maintenance);
  } catch (err) {
    return handleApiError(err);
  }
}
