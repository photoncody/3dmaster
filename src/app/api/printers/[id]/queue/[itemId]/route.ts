import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

const patchSchema = z.object({
  action: z.enum(["start"]),
  durationSeconds: z.number().int().min(1).max(60 * 60 * 48).optional(),
});

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id: printerId, itemId } = await ctx.params;
    const body = patchSchema.parse(await request.json());

    const item = await prisma.printQueueItem.findFirst({
      where: { id: itemId, printerId },
      include: { model: { include: { files: true } } },
    });
    if (!item) return jsonError("Queue item not found", 404);
    if (item.status === "printing") {
      return jsonError("This print is already active");
    }

    const active = await prisma.printQueueItem.findFirst({
      where: { printerId, status: "printing" },
      select: { id: true },
    });
    if (active) {
      return jsonError("Finish or clear the current print before starting another");
    }

    const durationSeconds =
      body.durationSeconds ?? item.estimatedDurationSeconds ?? undefined;
    if (!durationSeconds || durationSeconds <= 0) {
      return jsonError("Duration is required to start a print");
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Move this item to the front and keep relative order of the rest.
      const others = await tx.printQueueItem.findMany({
        where: { printerId, id: { not: itemId } },
        orderBy: { position: "asc" },
        select: { id: true },
      });

      await tx.printQueueItem.update({
        where: { id: itemId },
        data: {
          status: "printing",
          position: 0,
          estimatedDurationSeconds: durationSeconds,
        },
      });

      await Promise.all(
        others.map((other, index) =>
          tx.printQueueItem.update({
            where: { id: other.id },
            data: { position: index + 1 },
          }),
        ),
      );

      await tx.printTimer.upsert({
        where: { printerId },
        create: {
          printerId,
          durationSeconds,
          startedAt: new Date(),
          status: "running",
          pausedRemaining: null,
          linkedQueueItemId: itemId,
        },
        update: {
          durationSeconds,
          startedAt: new Date(),
          status: "running",
          pausedRemaining: null,
          linkedQueueItemId: itemId,
        },
      });

      return tx.printQueueItem.findUniqueOrThrow({
        where: { id: itemId },
        include: { model: { include: { files: true } } },
      });
    });

    return jsonOk(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const { id: printerId, itemId } = await ctx.params;
    const existing = await prisma.printQueueItem.findFirst({
      where: { id: itemId, printerId },
    });
    if (!existing) return jsonError("Queue item not found", 404);

    await prisma.$transaction(async (tx) => {
      const linkedTimers = await tx.printTimer.findMany({
        where: { printerId, linkedQueueItemId: itemId },
      });

      if (linkedTimers.length > 0 || existing.status === "printing") {
        await tx.printTimer.updateMany({
          where: { printerId },
          data: {
            linkedQueueItemId: null,
            status: "idle",
            startedAt: null,
            pausedRemaining: null,
          },
        });
      } else {
        await tx.printTimer.updateMany({
          where: { printerId, linkedQueueItemId: itemId },
          data: { linkedQueueItemId: null },
        });
      }

      await tx.printQueueItem.delete({ where: { id: itemId } });

      const remaining = await tx.printQueueItem.findMany({
        where: { printerId },
        orderBy: { position: "asc" },
      });
      await Promise.all(
        remaining.map((item, index) =>
          tx.printQueueItem.update({
            where: { id: item.id },
            data: { position: index },
          }),
        ),
      );
    });

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
