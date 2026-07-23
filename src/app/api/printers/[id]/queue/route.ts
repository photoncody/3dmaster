import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

const addSchema = z.object({
  modelId: z.string().min(1),
  durationSeconds: z.number().int().min(0).max(60 * 60 * 48).optional(),
});

async function hasActivePrint(printerId: string) {
  const active = await prisma.printQueueItem.findFirst({
    where: { printerId, status: "printing" },
    select: { id: true },
  });
  return Boolean(active);
}

export async function GET(_request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id: printerId } = await ctx.params;
    const items = await prisma.printQueueItem.findMany({
      where: { printerId },
      orderBy: { position: "asc" },
      include: { model: { include: { files: true } } },
    });
    return jsonOk(items);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id: printerId } = await ctx.params;
    const body = addSchema.parse(await request.json());

    const printer = await prisma.printer.findUnique({ where: { id: printerId } });
    if (!printer) return jsonError("Printer not found", 404);
    const model = await prisma.model.findUnique({ where: { id: body.modelId } });
    if (!model) return jsonError("Model not found", 404);

    const activelyPrinting = await hasActivePrint(printerId);
    const durationSeconds = body.durationSeconds;

    if (!activelyPrinting) {
      if (!durationSeconds || durationSeconds <= 0) {
        return jsonError("Duration is required to start a print");
      }
    }

    const item = await prisma.$transaction(async (tx) => {
      if (!activelyPrinting) {
        // New active print goes to the front; bump existing queued items.
        await tx.printQueueItem.updateMany({
          where: { printerId },
          data: { position: { increment: 1 } },
        });

        const created = await tx.printQueueItem.create({
          data: {
            printerId,
            modelId: body.modelId,
            position: 0,
            status: "printing",
            estimatedDurationSeconds: durationSeconds,
          },
          include: { model: { include: { files: true } } },
        });

        await tx.printTimer.upsert({
          where: { printerId },
          create: {
            printerId,
            durationSeconds: durationSeconds!,
            startedAt: new Date(),
            status: "running",
            pausedRemaining: null,
            linkedQueueItemId: created.id,
          },
          update: {
            durationSeconds: durationSeconds!,
            startedAt: new Date(),
            status: "running",
            pausedRemaining: null,
            linkedQueueItemId: created.id,
          },
        });

        return created;
      }

      const max = await tx.printQueueItem.aggregate({
        where: { printerId },
        _max: { position: true },
      });
      const position = (max._max.position ?? -1) + 1;

      return tx.printQueueItem.create({
        data: {
          printerId,
          modelId: body.modelId,
          position,
          status: "queued",
          estimatedDurationSeconds:
            durationSeconds && durationSeconds > 0 ? durationSeconds : null,
        },
        include: { model: { include: { files: true } } },
      });
    });

    return jsonOk(item, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

const reorderSchema = z.object({
  orderedIds: z.array(z.string()),
});

export async function PUT(request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id: printerId } = await ctx.params;
    const body = reorderSchema.parse(await request.json());

    const existing = await prisma.printQueueItem.findMany({
      where: { printerId },
      select: { id: true, status: true, position: true },
      orderBy: { position: "asc" },
    });
    const existingIds = existing.map((item) => item.id);
    const requestedIds = new Set(body.orderedIds);
    const existingIdSet = new Set(existingIds);
    const sameLength = body.orderedIds.length === existingIds.length;
    const noDuplicates = requestedIds.size === body.orderedIds.length;
    const sameSet = existingIds.every((itemId) => requestedIds.has(itemId));

    if (!sameLength || !noDuplicates || !sameSet || requestedIds.size !== existingIdSet.size) {
      return jsonError("orderedIds must include every queue item exactly once");
    }

    const active = existing.find((item) => item.status === "printing");
    if (active && body.orderedIds[0] !== active.id) {
      return jsonError("The active print must stay at the front of the queue");
    }

    await prisma.$transaction(
      body.orderedIds.map((itemId, index) =>
        prisma.printQueueItem.updateMany({
          where: { id: itemId, printerId },
          data: { position: index },
        }),
      ),
    );

    const items = await prisma.printQueueItem.findMany({
      where: { printerId },
      orderBy: { position: "asc" },
      include: { model: { include: { files: true } } },
    });
    return jsonOk(items);
  } catch (err) {
    return handleApiError(err);
  }
}
